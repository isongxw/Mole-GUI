/*
 * Mole GUI — application shell, screen registry and router.
 *
 * Screen modules call MoleScreens.register(name, {title, subtitle, icon,
 * render(root, ctx), refresh?, unmount?}) from their own file. index.html
 * preloads every planned screen file; a missing file leaves its placeholder in
 * place instead of breaking boot.
 */
(function () {
  'use strict';

  // -------------------------------------------------------------- constants

  var PLAN = [
    { id: 'dashboard', title: '概览', subtitle: '系统健康与关键指标一览', icon: 'dashboard' },
    { id: 'clean', title: '清理', subtitle: '先预览，再清理缓存与临时文件', icon: 'broom' },
    { id: 'uninstall', title: '卸载', subtitle: '彻底移除应用及其残留文件', icon: 'trash' },
    { id: 'optimize', title: '优化', subtitle: '有边界的系统维护与性能修复', icon: 'wand' },
    { id: 'reclaim', title: '空间回收', subtitle: '清理项目构建产物与安装包', icon: 'archive' },
    { id: 'analyze', title: '磁盘分析', subtitle: '找出占用空间的目录与大文件', icon: 'chart' },
    { id: 'history', title: '历史', subtitle: '查看每一次清理与修改的记录', icon: 'history' },
    { id: 'settings', title: '设置', subtitle: 'CLI 路径、偏好与安全说明', icon: 'settings' }
  ];

  var PLAN_MAP = Object.create(null);
  PLAN.forEach(function (item) {
    PLAN_MAP[item.id] = item;
  });

  var ALIASES = {
    overview: 'dashboard',
    home: 'dashboard',
    cleanup: 'clean',
    apps: 'uninstall',
    optimize: 'optimize',
    purge: 'reclaim',
    installer: 'reclaim',
    analyse: 'analyze',
    logs: 'history',
    preferences: 'settings',
    preference: 'settings'
  };

  var params = new URLSearchParams(window.location.search);
  var NATIVE = window.__MOLE_NATIVE__ === true;
  // Mock may be selected by URL (?mock=1...) for Chrome snapshots or injected
  // by the Swift host as globals because --webview-check cannot append a query
  // string to a file:// URL.
  var MOCK = (params.get('mock') === '1' || window.__MOLE_MOCK__ === true || window.__MOLE_MOCK_SCREEN__ != null) && !NATIVE;
  var SCENARIO = params.get('scenario') || window.__MOLE_MOCK_SCENARIO__ || 'default';
  var QUERY_SCREEN = params.get('screen') || window.__MOLE_MOCK_SCREEN__ || '';

  // --------------------------------------------------------------- runtime

  var registry = Object.create(null);
  var currentId = '';
  var currentDef = null;
  var currentCtx = null;
  var booted = false;
  var ready = false;
  var bootTimer = null;
  var pendingScreen = '';
  var config = {};
  var cli = null;
  var hostState = { app: null, home: '', paths: {} };
  var lastPersisted = '';
  var persistTimer = null;
  var dock = null;
  var dockJobId = '';
  var dockActions = {};
  var snapshotTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function ui() {
    return window.MoleUI;
  }

  function showToast(message, tone) {
    if (ui()) ui().toast(message, tone || 'info');
  }

  function normalizeScreenName(name) {
    if (!name) return '';
    var key = String(name).trim();
    if (registry[key]) return key;
    if (PLAN_MAP[key]) return key;
    if (ALIASES[key]) return ALIASES[key];
    return key;
  }

  // ---------------------------------------------------------------- registry

  var MoleScreens = (window.MoleScreens = {
    register: function (id, def) {
      if (!id || !def || typeof def.render !== 'function') {
        // eslint-disable-next-line no-console
        console.warn('[MoleScreens] ignoring invalid screen registration', id);
        return null;
      }
      var plan = PLAN_MAP[id] || {};
      var screen = Object.assign(
        {
          id: id,
          title: plan.title || id,
          subtitle: plan.subtitle || '',
          icon: plan.icon || 'file'
        },
        def
      );
      screen.__placeholder = false;
      registry[id] = screen;
      if (currentId === id && currentDef && currentDef.__placeholder) {
        mount(id);
      }
      return screen;
    },
    get: function (id) {
      return registry[id] || null;
    },
    has: function (id) {
      return !!registry[id];
    },
    list: function () {
      return PLAN.map(function (plan) {
        var def = registry[plan.id];
        return {
          id: plan.id,
          title: plan.title,
          subtitle: plan.subtitle,
          icon: plan.icon,
          registered: !!def && !def.__placeholder,
          placeholder: !def || !!def.__placeholder
        };
      });
    },
    navigate: function (id, options) {
      navigate(id, options);
    },
    go: function (id, options) {
      navigate(id, options);
    },
    refresh: function () {
      refreshCurrent();
    },
    current: function () {
      return currentId;
    },
    setActions: function (content) {
      setHeaderActions(content);
    },
    setSubtitle: function (text) {
      setHeaderSubtitle(text);
    }
  });

  // ------------------------------------------------------------ shell pieces

  function createNav() {
    var nav = byId('nav');
    if (!nav) return;
    nav.textContent = '';
    PLAN.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.dataset.screen = item.id;
      btn.setAttribute('role', 'link');
      btn.innerHTML =
        '<span class="nav-icon">' + ui().icon(item.icon, 17) + '</span>' +
        '<span class="nav-label">' + ui().escapeHtml(item.title) + '</span>';
      btn.addEventListener('click', function () {
        navigate(item.id);
      });
      nav.appendChild(btn);
    });
  }

  function updateNavActive(id) {
    var nav = byId('nav');
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (item) {
      var active = item.dataset.screen === id;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function cliStatusTone(info) {
    if (!info || !info.ok) return 'danger';
    return 'success';
  }

  function updateSidebarFooter() {
    var footer = byId('sidebar-footer');
    if (!footer) return;
    footer.textContent = '';
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cli-chip';
    var tone = cliStatusTone(cli);
    var version = cli && cli.version ? cli.version : cli && cli.ok ? '未知版本' : '未找到';
    var source = cli && cli.source ? cli.source : '';
    chip.title = (cli && cli.path ? cli.path : '未找到可运行的 Mole CLI') + (source ? ' · ' + source : '');
    chip.innerHTML =
      '<span class="status-dot ' + tone + '"></span>' +
      '<span class="cli-chip-label">Mole CLI</span>' +
      '<span class="cli-chip-version">' + ui().escapeHtml(version) + '</span>';
    chip.addEventListener('click', function () {
      navigate('settings');
    });
    footer.appendChild(chip);
    var meta = document.createElement('div');
    meta.className = 'sidebar-meta';
    meta.textContent = hostState.app && hostState.app.version ? 'Mole GUI ' + hostState.app.version : 'Mole GUI';
    footer.appendChild(meta);
  }

  function buildCliBanner() {
    var banner = byId('cli-banner');
    if (!banner || banner.dataset.built === '1') return;
    banner.dataset.built = '1';
    banner.innerHTML =
      '<div class="cli-banner-inner">' +
      '<div class="cli-banner-icon">' + ui().icon('alert', 20) + '</div>' +
      '<div class="cli-banner-text">' +
      '<strong class="cli-banner-title">未找到可运行的 Mole CLI</strong>' +
      '<p class="cli-banner-desc" id="cli-banner-desc">应用需要 Mole CLI 才能执行任何操作。请重新检测、手动选择，或在终端运行安装命令。</p>' +
      '<code class="cli-banner-command" id="cli-banner-command">curl -fsSL https://raw.githubusercontent.com/tw93/Mole/main/install.sh | bash</code>' +
      '</div>' +
      '<div class="cli-banner-actions">' +
      '<button type="button" class="btn ghost small" data-banner="copy">' + ui().icon('copy', 15) + '<span class="btn-label">复制安装命令</span></button>' +
      '<button type="button" class="btn secondary small" data-banner="choose">选择 CLI…</button>' +
      '<button type="button" class="btn primary small" data-banner="detect">重新检测</button>' +
      '</div>' +
      '</div>';
    var command = banner.querySelector('#cli-banner-command');
    banner.addEventListener('click', function (event) {
      var target = event.target.closest('[data-banner]');
      if (!target) return;
      var action = target.dataset.banner;
      if (action === 'copy') {
        MoleBridge.clipboard(command ? command.textContent : '')
          .then(function () {
            showToast('安装命令已复制到剪贴板', 'success');
          })
          .catch(function () {
            showToast('无法访问剪贴板', 'danger');
          });
      } else if (action === 'choose') {
        MoleBridge.chooseCLI().catch(function () {
          showToast('无法打开文件选择器', 'danger');
        });
      } else if (action === 'detect') {
        target.disabled = true;
        MoleBridge.init()
          .then(function () {
            showToast('正在重新检测 Mole CLI…', 'info');
          })
          .catch(function () {
            showToast('无法连接原生宿主', 'danger');
          })
          .then(function () {
            window.setTimeout(function () {
              target.disabled = false;
            }, 1200);
          });
      }
    });
  }

  function updateCliBanner() {
    var banner = byId('cli-banner');
    if (!banner) return;
    buildCliBanner();
    if (cli && cli.ok) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    var desc = banner.querySelector('#cli-banner-desc');
    if (desc) {
      if (!ready && !MOCK) desc.textContent = '正在连接原生宿主并检测 Mole CLI…';
      else if (cli && cli.error) desc.textContent = '检测失败：' + cli.error + '。你可以重新检测、手动选择，或在终端运行安装命令。';
      else desc.textContent = '应用需要 Mole CLI 才能执行任何操作。请重新检测、手动选择，或在终端运行安装命令。';
    }
  }

  function updateHeaderRefresh() {
    var refresh = byId('global-refresh');
    if (!refresh) return;
    refresh.disabled = !ready;
  }

  function setHeaderSubtitle(text) {
    var el = byId('screen-subtitle');
    if (el) el.textContent = text || '';
  }

  function setHeaderActions(content) {
    var slot = byId('screen-actions');
    if (!slot) return;
    slot.textContent = '';
    if (content == null) return;
    if (typeof content === 'string') {
      slot.insertAdjacentHTML('beforeend', content);
    } else if (Array.isArray(content)) {
      content.forEach(function (item) {
        if (item && item.nodeType) slot.appendChild(item);
      });
    } else if (content.nodeType) {
      slot.appendChild(content);
    }
  }

  // --------------------------------------------------------------- job dock

  function buildJobDock() {
    var host = byId('job-dock');
    if (!host || !ui()) return;
    dock = ui().logPanel({
      title: '运行日志',
      hint: '',
      maxHeight: 280
    });
    dock.setCollapsed(true);
    var stop = ui().button({
      label: '停止',
      icon: 'stop',
      variant: 'danger',
      size: 'small',
      title: '停止当前任务 (SIGINT)',
      onClick: function () {
        if (dockJobId) MoleBridge.post('cancel', { jobId: dockJobId }).catch(function () {});
      }
    });
    stop.hidden = true;
    dock.appendAction(stop);
    dockActions.stop = stop;
    host.textContent = '';
    host.appendChild(dock.element);
  }

  function dockStart(event) {
    if (!dock) return;
    dockJobId = event.jobId;
    var label = event.label || (event.args || []).join(' ');
    dock.reset();
    dock.setTitle(label || '运行日志');
    dock.setHint((event.privileged ? '需要管理员权限 · ' : '') + (event.args || []).join(' '));
    dock.setState('running', event.privileged ? '准备运行' : '运行中');
    dock.write('→ ' + [].concat(event.args || []).join(' ') + '\n');
    dock.setCollapsed(false);
    if (dockActions.stop) dockActions.stop.hidden = false;
    markSnapshotRunning();
  }

  function dockOutput(event) {
    if (!dock) return;
    dock.write(event.text, event.stream);
  }

  function dockWaiting(event) {
    if (!dock) return;
    dockJobId = event.jobId;
    dock.setState('waiting', '等待管理员授权');
    if (dockActions.stop) dockActions.stop.hidden = false;
  }

  function dockExit(event) {
    if (!dock) return;
    if (dockActions.stop) dockActions.stop.hidden = true;
    if (event.error === 'auth_cancelled') {
      dock.write('\n⚠ 已取消管理员授权\n');
      dock.setState('cancelled', '已取消授权');
    } else if (event.error === 'auth_failed') {
      dock.write('\n✗ 密码不正确\n');
      dock.setState('error', '授权失败');
    } else if (event.error === 'spawn_failed') {
      dock.write('\n✗ 无法启动 Mole CLI\n');
      dock.setState('error', '启动失败');
    } else if (event.cancelled) {
      dock.write('\n⚠ 已取消\n');
      dock.setState('cancelled', '已取消');
    } else if (event.code === 0) {
      dock.write('✓ 完成 · ' + (ui().formatDuration(event.durationMs) || '') + '\n');
      dock.setState('done', '已完成');
    } else {
      dock.write('\n✗ 退出码 ' + event.code + '\n');
      dock.setState('error', '退出码 ' + event.code);
    }
    dockJobId = '';
    // Keep the completion line visible briefly, then collapse so an expanded
    // dock never squeezes the current screen's results (the screen owns its own
    // contextual log panel).
    window.setTimeout(function () {
      if (dock && MoleBridge.activeJobs().length === 0) dock.setCollapsed(true);
    }, 1200);
    markSnapshotSettledSoon();
  }

  function markSnapshotRunning() {
    if (!MOCK) return;
    window.__moleSnapshotReady = false;
    document.documentElement.dataset.snapshot = 'running';
  }

  function markSnapshotSettledSoon() {
    if (!MOCK) return;
    window.clearTimeout(snapshotTimer);
    snapshotTimer = window.setTimeout(function () {
      if (MoleBridge.activeJobs().length === 0) {
        window.__moleSnapshotReady = true;
        document.documentElement.dataset.snapshot = 'ready';
      }
    }, 600);
  }

  // ---------------------------------------------------------- first-launch

  function buildSafetyNote() {
    var note = document.createElement('section');
    note.className = 'safety-note';
    note.innerHTML =
      '<div class="safety-note-icon">' + ui().icon('shield', 20) + '</div>' +
      '<div class="safety-note-text">' +
      '<strong>开始之前</strong>' +
      '<p>Mole GUI 只是 Mole CLI 的图形外壳，不自行删除文件；清理与卸载都会先展示预览，再由 CLI 在你确认后执行。执行前请看清预览，重要数据请先备份。</p>' +
      '</div>' +
      '<button type="button" class="btn ghost small safety-note-dismiss">我知道了</button>';
    var dismiss = note.querySelector('.safety-note-dismiss');
    dismiss.addEventListener('click', function () {
      config.welcomeSeen = true;
      note.classList.add('leaving');
      window.setTimeout(function () {
        if (note.parentNode) note.parentNode.removeChild(note);
      }, 160);
      MoleBridge.setConfig({ welcomeSeen: true }).catch(function () {});
    });
    return note;
  }

  function maybeInsertSafetyNote() {
    if (currentId !== 'dashboard' || config.welcomeSeen === true) return;
    var body = byId('screen-body');
    if (!body || body.querySelector('.safety-note')) return;
    body.insertBefore(buildSafetyNote(), body.firstChild);
  }
  // Screens that replace their own DOM after an async job can ask the shell to
  // re-attach the one-time safety note (dashboard calls this after first paint).
  window.__moleSafetyNote = maybeInsertSafetyNote;

  // ---------------------------------------------------------------- routing

  function makePlaceholder(id) {
    var plan = PLAN_MAP[id] || { title: id, subtitle: '', icon: 'file' };
    return {
      id: id,
      title: plan.title,
      subtitle: plan.subtitle,
      icon: plan.icon,
      __placeholder: true,
      render: function (root) {
        root.appendChild(
          ui().emptyState({
            icon: 'info',
            title: plan.title + ' 页面尚未安装',
            hint: '该页面模块（js/screens/' + id + '.js）还没有提供，应用其余部分仍可正常使用。',
            actionLabel: '返回概览',
            onAction: function () {
              navigate('dashboard');
            }
          })
        );
      }
    };
  }

  function ensurePlaceholders() {
    PLAN.forEach(function (plan) {
      if (!registry[plan.id]) registry[plan.id] = makePlaceholder(plan.id);
    });
  }

  function mount(id) {
    var body = byId('screen-body');
    if (!body) return;
    var def = registry[id];
    if (!def) {
      def = makePlaceholder(id);
      registry[id] = def;
    }
    currentId = id;
    currentDef = def;
    body.dataset.screen = id;
    body.scrollTop = 0;
    body.textContent = '';
    setHeaderSubtitle(def.subtitle || '');
    setHeaderActions(null);
    var titleEl = byId('screen-title');
    if (titleEl) titleEl.textContent = def.title || id;
    updateNavActive(id);
    document.title = (def.title || 'Mole') + ' — Mole GUI';

    currentCtx = {
      mock: MOCK,
      scenario: SCENARIO,
      screen: id,
      config: config,
      cli: cli,
      bridge: MoleBridge,
      actions: byId('screen-actions'),
      navigate: function (name) {
        navigate(name);
      },
      showToast: showToast,
      setActions: setHeaderActions,
      setSubtitle: setHeaderSubtitle,
      getConfig: function () {
        return config;
      },
      getCli: function () {
        return cli;
      },
      getScenario: function () {
        return SCENARIO;
      },
      refresh: function () {
        refreshCurrent();
      }
    };

    try {
      def.render(body, currentCtx);
    } catch (error) {
      renderScreenError(id, error);
    }
    maybeInsertSafetyNote();
    persistLastScreen(id);
  }

  function renderScreenError(id, error) {
    var body = byId('screen-body');
    if (!body) return;
    body.textContent = '';
    var card = ui().card({
      title: '页面加载失败',
      subtitle: '“' + (PLAN_MAP[id] ? PLAN_MAP[id].title : id) + '” 渲染时出错，其余页面不受影响。',
      body: ui().emptyState({
        icon: 'alert',
        title: '无法显示此页面',
        hint: error && error.message ? error.message : String(error),
        actionLabel: '返回概览',
        onAction: function () {
          navigate('dashboard');
        }
      })
    });
    body.appendChild(card);
    // eslint-disable-next-line no-console
    console.error('[MoleScreens] render failed for "' + id + '"', error);
  }

  function navigate(name, options) {
    options = options || {};
    var id = normalizeScreenName(name);
    if (!id) return;
    if (!registry[id]) {
      if (PLAN_MAP[id]) {
        registry[id] = makePlaceholder(id);
      } else {
        showToast('未知页面：' + name, 'warning');
        return;
      }
    }
    if (!ready) {
      pendingScreen = id;
      return;
    }
    if (currentDef && typeof currentDef.unmount === 'function' && currentId) {
      try {
        currentDef.unmount();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[MoleScreens] unmount failed for "' + currentId + '"', error);
      }
    }
    mount(id);
  }

  function refreshCurrent() {
    if (!ready) return;
    if (MOCK) markSnapshotRunning();
    if (currentDef && typeof currentDef.refresh === 'function') {
      try {
        currentDef.refresh();
        return;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[MoleScreens] refresh failed, remounting', error);
      }
    }
    navigate(currentId, { silent: true });
    markSnapshotSettledSoon();
  }

  function persistLastScreen(id) {
    if (MOCK) {
      config.lastScreen = id;
      return;
    }
    if (!id || lastPersisted === id) return;
    if (config.lastScreen !== id) config.lastScreen = id;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(function () {
      lastPersisted = id;
      MoleBridge.setConfig({ lastScreen: id }).catch(function () {});
    }, 250);
  }

  // -------------------------------------------------------------- host state

  function applyConfig(next) {
    if (!next || typeof next !== 'object') return;
    Object.keys(next).forEach(function (key) {
      config[key] = next[key];
    });
  }

  function applyReady(event) {
    ready = true;
    window.clearTimeout(bootTimer);
    hostState.app = event.app || hostState.app;
    hostState.home = event.home || hostState.home;
    hostState.paths = event.paths || hostState.paths;
    applyConfig(event.config || {});
    if (event.cli) cli = event.cli;
    updateSidebarFooter();
    updateCliBanner();
    updateHeaderRefresh();
    var desired = '';
    if (pendingScreen) desired = pendingScreen;
    else if (QUERY_SCREEN) desired = QUERY_SCREEN;
    else if (config.lastScreen) desired = config.lastScreen;
    if (!desired) desired = 'dashboard';
    var id = normalizeScreenName(desired);
    if (!registry[id]) id = 'dashboard';
    pendingScreen = '';
    mount(id);
    if (MOCK) {
      window.__moleSnapshotReady = false;
      document.documentElement.dataset.snapshot = 'boot';
      markSnapshotSettledSoon();
    }
  }

  function fallbackReady(message) {
    if (ready) return;
    ready = true;
    window.clearTimeout(bootTimer);
    cli = { ok: false, path: '', version: '', source: '', error: message || '无法连接原生宿主' };
    updateSidebarFooter();
    updateCliBanner();
    updateHeaderRefresh();
    var desired = '' + (QUERY_SCREEN || config.lastScreen || 'dashboard');
    var id = normalizeScreenName(desired);
    if (!registry[id]) id = 'dashboard';
    mount(id);
  }

  // ---------------------------------------------------------------- events

  function wireBridgeEvents() {
    MoleBridge.on('ready', function (event) {
      applyReady(event);
    });
    MoleBridge.on('cli_changed', function (event) {
      if (event.cli) cli = event.cli;
      updateSidebarFooter();
      updateCliBanner();
      if (event.error) showToast('CLI 检测失败：' + event.error, 'danger');
      else if (cli && cli.ok) showToast('已使用 Mole CLI ' + (cli.version || ''), 'success');
    });
    MoleBridge.on('config_changed', function (event) {
      applyConfig(event.config || {});
    });
    MoleBridge.on('toast', function (event) {
      if (event && event.message) showToast(event.message, event.tone || 'info');
    });
    MoleBridge.on('native_error', function (event) {
      showToast((event && event.message) || '原生宿主发生错误', 'danger');
    });
    MoleBridge.on('job_started', dockStart);
    MoleBridge.on('auth_waiting', dockWaiting);
    MoleBridge.on('job_output', dockOutput);
    MoleBridge.on('job_exit', dockExit);
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      var key = event.key;
      if (!key) return;
      if (key >= '1' && key <= '8') {
        event.preventDefault();
        var plan = PLAN[Number(key) - 1];
        if (plan) navigate(plan.id);
        return;
      }
      if (key.toLowerCase() === 'r') {
        if (event.shiftKey) return;
        event.preventDefault();
        refreshCurrent();
        return;
      }
      if (key === ',') {
        event.preventDefault();
        navigate('settings');
      }
    });
  }

  function installOpenScreen() {
    window.__moleOpenScreen = function (name) {
      var id = normalizeScreenName(name);
      if (!id) return false;
      if (!registry[id] && !PLAN_MAP[id]) return false;
      if (!ready) pendingScreen = id;
      else navigate(id);
      return true;
    };
  }

  installOpenScreen();

  // ------------------------------------------------------------------- boot

  function start() {
    if (booted) return;
    booted = true;
    if (!ui()) {
      // A broken ui.js must not leave a blank window.
      document.body.innerHTML = '<pre style="color:#f87171;padding:40px">Mole GUI 无法加载界面组件（js/ui.js）。</pre>';
      return;
    }
    var dockHost = byId('job-dock');
    if (dockHost) dockHost.hidden = true;
    var refreshButton = byId('global-refresh');
    if (refreshButton && !refreshButton.innerHTML) refreshButton.innerHTML = ui().icon('refresh', 16);
    createNav();
    ensurePlaceholders();
    installOpenScreen();
    wireBridgeEvents();
    bindKeyboard();
    updateSidebarFooter();
    buildCliBanner();
    updateCliBanner();
    updateHeaderRefresh();
    if (MOCK) {
      window.__moleSnapshotReady = false;
      document.documentElement.dataset.snapshot = 'boot';
    }
    bootTimer = window.setTimeout(function () {
      if (!ready) {
        fallbackReady(
          NATIVE ? '原生宿主没有在 3 秒内完成初始化' : '无法连接原生宿主（请通过 Mole GUI 应用打开，或加上 ?mock=1）'
        );
      }
    }, 3000);
    MoleBridge.init().catch(function (error) {
      if (!ready) fallbackReady(error && error.message ? error.message : '无法连接原生宿主');
    });
  }

  function maybeLoadMock() {
    if (!MOCK) {
      start();
      return;
    }
    if (window.MoleMock) {
      start();
      return;
    }
    var script = document.createElement('script');
    script.src = 'js/mock.js';
    script.async = false;
    script.onload = function () {
      start();
    };
    script.onerror = function () {
      // Degrade to the CLI-missing banner rather than a blank window.
      start();
    };
    document.head.appendChild(script);
  }

  function boot() {
    maybeLoadMock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
