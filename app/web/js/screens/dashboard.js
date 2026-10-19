/*
 * Mole GUI — 概览 / dashboard screen.
 * Read-only: runs `status --json` (and `history --json --limit 100` for the last
 * cleanup hint), then renders real cards. No destructive command is ever sent.
 */
(function () {
  'use strict';

  var STYLE_ID = 'mole-screen-dashboard-style';

  function esc(value) {
    return window.MoleUI.escapeHtml(value);
  }

  function isNum(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function num(value) {
    return isNum(value) ? value : null;
  }

  function pctText(value) {
    var n = num(value);
    return n == null ? '—' : n.toFixed(1) + '%';
  }

  function healthTone(score) {
    if (score == null) return 'accent';
    if (score >= 85) return 'success';
    if (score >= 70) return 'accent';
    if (score >= 50) return 'warning';
    return 'danger';
  }

  function healthLabel(message) {
    var text = String(message || '').toLowerCase();
    if (/excellent|great/.test(text)) return '优秀';
    if (/good|healthy/.test(text)) return '良好';
    if (/fair|moderate/.test(text)) return '一般';
    if (/poor|bad|critical/.test(text)) return '较差';
    if (/warning|attention/.test(text)) return '注意';
    return '评分';
  }

  function usageTone(value, warn, danger) {
    if (value == null) return '';
    if (value >= (danger || 90)) return 'tone-danger';
    if (value >= (warn || 75)) return 'tone-warning';
    return '';
  }

  function kv(label, value) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function kvList(rows) {
    return '<div class="kv-list">' + rows.join('') + '</div>';
  }

  function button(label, icon, variant, onClick) {
    return window.MoleUI.button({ label: label, icon: icon, variant: variant, size: 'small', onClick: onClick });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '[data-screen="dashboard"] .dash{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;align-items:start}',
      '[data-screen="dashboard"] .dash-health{grid-column:span 4}',
      '[data-screen="dashboard"] .dash-disk{grid-column:span 4}',
      '[data-screen="dashboard"] .dash-mem{grid-column:span 4}',
      '[data-screen="dashboard"] .dash-cpu{grid-column:span 6}',
      '[data-screen="dashboard"] .dash-battery{grid-column:span 3}',
      '[data-screen="dashboard"] .dash-thermals{grid-column:span 3}',
      '[data-screen="dashboard"] .dash-top{grid-column:span 8}',
      '[data-screen="dashboard"] .dash-side{grid-column:span 4;display:flex;flex-direction:column;gap:16px;min-width:0}',
      '[data-screen="dashboard"] .dash-foot{grid-column:span 12;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:0 2px 2px;font-size:10.5px;color:var(--text-muted);letter-spacing:.01em}',
      '[data-screen="dashboard"] .dash-foot .dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.2)}',
      '[data-screen="dashboard"] .health{display:flex;align-items:center;gap:16px;min-width:0}',
      '[data-screen="dashboard"] .health-side{display:flex;flex-direction:column;gap:8px;min-width:0;flex:1}',
      '[data-screen="dashboard"] .health-badges{display:flex;flex-wrap:wrap;gap:6px}',
      '[data-screen="dashboard"] .health-msg{font-size:11px;line-height:1.45;color:var(--text-muted);overflow-wrap:anywhere}',
      '[data-screen="dashboard"] .kv-list{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '[data-screen="dashboard"] .kv{display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-width:0;font-size:11.5px}',
      '[data-screen="dashboard"] .kv span{color:var(--text-muted);white-space:nowrap}',
      '[data-screen="dashboard"] .kv b{font-weight:550;color:var(--text-secondary);text-align:right;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-screen="dashboard"] .dash-statline{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;min-width:0}',
      '[data-screen="dashboard"] .dash-unit{font-size:13px;font-weight:500;color:var(--text-muted);margin-left:2px}',
      '[data-screen="dashboard"] .cpu-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;min-width:0}',
      '[data-screen="dashboard"] .cpu-load{display:flex;gap:14px;flex:0 0 auto}',
      '[data-screen="dashboard"] .load-item{display:flex;flex-direction:column;align-items:flex-end;gap:2px}',
      '[data-screen="dashboard"] .load-label{font-size:9.5px;color:var(--text-muted);letter-spacing:.02em}',
      '[data-screen="dashboard"] .load-value{font-family:var(--mono);font-size:11.5px;color:var(--text-secondary)}',
      '[data-screen="dashboard"] .core-bars{display:flex;align-items:flex-end;gap:6px;height:49px;min-width:0}',
      '[data-screen="dashboard"] .core{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px}',
      '[data-screen="dashboard"] .core-track{position:relative;width:100%;height:32px;border-radius:4px;background:rgba(255,255,255,.05);overflow:hidden}',
      '[data-screen="dashboard"] .core-fill{position:absolute;left:0;right:0;bottom:0;border-radius:4px;background:linear-gradient(180deg,var(--accent),var(--accent-strong));transition:height 320ms cubic-bezier(.22,1,.36,1)}',
      '[data-screen="dashboard"] .core-fill.warn{background:linear-gradient(180deg,#fcd34d,#d97706)}',
      '[data-screen="dashboard"] .core-fill.hot{background:linear-gradient(180deg,#fca5a5,#dc2626)}',
      '[data-screen="dashboard"] .core-label{font-size:9px;color:var(--text-muted);font-variant-numeric:tabular-nums}',
      '[data-screen="dashboard"] .dash-note{font-size:10.5px;color:var(--text-muted);line-height:1.45}',
      '[data-screen="dashboard"] .tile-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}',
      '[data-screen="dashboard"] .tile{display:flex;flex-direction:column;gap:2px;min-width:0;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.032)}',
      '[data-screen="dashboard"] .tile-label{font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '[data-screen="dashboard"] .tile-value{font-size:12.5px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '[data-screen="dashboard"] .dash-table .table-head,[data-screen="dashboard"] .dash-table .table-row{display:grid;grid-template-columns:minmax(0,1fr) 74px 82px 70px;gap:8px;align-items:center}',
      '[data-screen="dashboard"] .dash-table .table-cell{flex:none;padding:6px 0}',
      '[data-screen="dashboard"] .dash-table .table-row{min-height:37px}',
      '[data-screen="dashboard"] .dash-table .table-head{min-height:28px}',
      '[data-screen="dashboard"] .proc-name{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '[data-screen="dashboard"] .proc-name b{font-size:12px;font-weight:550;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-screen="dashboard"] .proc-name span{font-family:var(--mono);font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-screen="dashboard"] .cpu-hot{color:#fca5a5}',
      '[data-screen="dashboard"] .cpu-warm{color:#fcd34d}',
      '[data-screen="dashboard"] .actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}',
      '[data-screen="dashboard"] .actions-grid .btn{justify-content:flex-start;width:100%}',
      '[data-screen="dashboard"] .last-clean{display:flex;align-items:center;gap:10px;min-width:0}',
      '[data-screen="dashboard"] .last-clean-icon{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--accent);background:var(--accent-soft)}',
      '[data-screen="dashboard"] .last-clean-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}',
      '[data-screen="dashboard"] .last-clean-label{font-size:10px;color:var(--text-muted);letter-spacing:.02em}',
      '[data-screen="dashboard"] .last-clean-value{font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '[data-screen="dashboard"] .dash-error{grid-column:span 12;max-width:760px}',
      '[data-screen="dashboard"] .dash-error-msg{font-size:12.5px;line-height:1.65;color:var(--text-secondary)}',
      '[data-screen="dashboard"] .dash-error-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}',
      '[data-screen="dashboard"] .dash-loading-tip{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text-muted);padding:2px 0 4px}',
      '[data-screen="dashboard"] .span-3{grid-column:span 3}',
      '[data-screen="dashboard"] .span-4{grid-column:span 4}',
      '[data-screen="dashboard"] .span-6{grid-column:span 6}',
      '[data-screen="dashboard"] .span-8{grid-column:span 8}',
      '[data-screen="dashboard"] .span-12{grid-column:span 12}',
      '[data-screen="dashboard"] .skeleton-card{gap:10px}',
      '@media (max-width: 1120px){',
      '[data-screen="dashboard"] .dash-health,[data-screen="dashboard"] .dash-disk,[data-screen="dashboard"] .dash-mem,[data-screen="dashboard"] .dash-cpu,[data-screen="dashboard"] .dash-battery,[data-screen="dashboard"] .dash-thermals{grid-column:span 6}',
      '[data-screen="dashboard"] .dash-top{grid-column:span 12}',
      '[data-screen="dashboard"] .dash-side{grid-column:span 12;display:grid;grid-template-columns:1fr 1fr;align-items:start}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  var state = {
    mounted: false,
    gen: 0,
    root: null,
    wrap: null,
    ctx: null,
    statusJob: null,
    historyJob: null,
    status: null,
    history: null,
    lastCleanEl: null,
    lastCleanValue: null,
    lastCleanHint: null
  };

  // ------------------------------------------------------------- lifecycle

  function render(root, ctx) {
    ensureStyle();
    state.mounted = true;
    state.root = root;
    state.ctx = ctx;
    state.wrap = null;
    load();
  }

  function unmount() {
    state.mounted = false;
    state.gen += 1;
    cancelJobs();
    state.root = null;
    state.wrap = null;
  }

  function refresh() {
    if (!state.mounted) return;
    load();
  }

  function cancelJobs() {
    if (state.statusJob) {
      var statusJob = state.statusJob;
      state.statusJob = null;
      statusJob.cancel();
    }
    if (state.historyJob) {
      var historyJob = state.historyJob;
      state.historyJob = null;
      historyJob.cancel();
    }
  }

  function newWrap() {
    if (!state.root) return null;
    state.root.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'dash';
    state.root.appendChild(wrap);
    state.wrap = wrap;
    return wrap;
  }

  function load() {
    var wrap = newWrap();
    if (!wrap) return;
    state.gen += 1;
    var gen = state.gen;
    cancelJobs();
    state.lastCleanEl = null;
    state.lastCleanValue = null;
    state.lastCleanHint = null;

    var cli = state.ctx && state.ctx.getCli ? state.ctx.getCli() : null;
    renderLoading(wrap);
    if (cli && cli.ok === false) {
      renderCliError(wrap);
      return;
    }
    startHistory(gen);
    startStatus(gen);
  }

  // -------------------------------------------------------------- skeleton

  function skeletonLines(count) {
    var out = '<div class="skeleton skeleton-line tiny"></div>';
    for (var i = 0; i < count; i += 1) {
      out += '<div class="skeleton skeleton-line' + (i === 0 ? ' short' : '') + '"></div>';
    }
    return out;
  }

  function renderLoading(wrap) {
    var spans = [4, 4, 4, 6, 3, 3, 8, 4];
    var heights = [188, 188, 188, 196, 196, 196, 300, 300];
    var html = '';
    spans.forEach(function (span, index) {
      html +=
        '<div class="skeleton-card span-' +
        span +
        '" style="min-height:' +
        heights[index] +
        'px">' +
        '<div class="skeleton skeleton-line short"></div>' +
        skeletonLines(3) +
        '</div>';
    });
    html +=
      '<div class="span-12 dash-loading-tip"><span class="spinner"></span>正在读取系统状态（mole status --json）…</div>';
    wrap.innerHTML = html;
  }

  // ---------------------------------------------------------------- jobs

  function startStatus(gen) {
    var out = '';
    var err = '';
    state.statusJob = window.MoleBridge.runJob({
      args: ['status', '--json'],
      label: '读取系统状态',
      onOutput: function (text, stream) {
        if (stream === 'stderr') err += text;
        else out += text;
      },
      onExit: function (result) {
        if (gen !== state.gen || !state.mounted) return;
        state.statusJob = null;
        if (result.cancelled) {
          renderCancelled();
          return;
        }
        if (result.error === 'spawn_failed' || result.error === 'auth_cancelled' || result.error === 'auth_failed') {
          renderCliError(state.wrap);
          return;
        }
        var raw = out + (err ? '\n--- stderr ---\n' + err : '');
        var data = window.MoleParsers.parseStatusJson(out);
        if (result.code !== 0) {
          renderStatusError(result, raw, err);
          return;
        }
        if (!data) {
          if (!out.trim()) renderEmptyStatus();
          else renderStatusError({ code: 0, error: 'parse_failed' }, raw, err);
          return;
        }
        state.status = data;
        renderDashboard(data);
      }
    });
  }

  function startHistory(gen) {
    var out = '';
    state.historyJob = window.MoleBridge.runJob({
      args: ['history', '--json', '--limit', '100'],
      label: '读取清理历史',
      onOutput: function (text, stream) {
        if (stream !== 'stderr') out += text;
      },
      onExit: function (result) {
        if (gen !== state.gen || !state.mounted) return;
        state.historyJob = null;
        if (result.cancelled || result.error) {
          applyLastClean(null, '无法读取历史记录');
          return;
        }
        var data = window.MoleParsers.parseHistoryJson(out);
        if (!data || !Array.isArray(data.sessions)) {
          applyLastClean(null, '无法读取历史记录');
          return;
        }
        state.history = data;
        applyLastClean(findLastClean(data.sessions));
      }
    });
  }

  function findLastClean(sessions) {
    var best = null;
    sessions.forEach(function (session) {
      if (!session || session.command !== 'clean') return;
      if (!best || String(session.started_at || '') > String(best.started_at || '')) best = session;
    });
    return best;
  }

  function applyLastClean(session, fallback) {
    if (!state.lastCleanValue) return;
    if (!session) {
      state.lastCleanValue.textContent = fallback || '暂无清理记录';
      if (state.lastCleanHint) state.lastCleanHint.textContent = '运行一次清理后，这里会显示最近一次结果';
      return;
    }
    var parts = [window.MoleUI.timeAgo(session.started_at)];
    var bytes = window.MoleUI.formatSize(session.size || '');
    if (bytes != null && bytes > 0) parts.push('释放 ' + window.MoleUI.formatBytes(bytes));
    else if (Number(session.operation_count) > 0) parts.push(Number(session.operation_count) + ' 项操作');
    else if (Number(session.items) > 0) parts.push(Number(session.items) + ' 个项目');
    else parts.push('已完成');
    state.lastCleanValue.textContent = parts.join(' · ');
    if (state.lastCleanHint) state.lastCleanHint.textContent = '最近一次 mo clean 的执行记录';
  }

  // -------------------------------------------------------------- states

  function renderCliError(wrap) {
    wrap = wrap || state.wrap;
    if (!wrap) return;
    wrap.textContent = '';
    var body = document.createElement('div');
    body.className = 'dash-error';
    body.appendChild(
      window.MoleUI.card({
        title: 'Mole CLI 不可用',
        subtitle: '概览需要读取 mole status --json',
        body:
          '<p class="dash-error-msg">找不到可运行的 Mole CLI，因此无法读取系统健康数据。请使用顶部的“重新检测”或“选择 CLI…”，也可以在设置中检查 CLI 路径。</p>' +
          '<div class="dash-error-actions"></div>'
      })
    );
    var actions = body.querySelector('.dash-error-actions');
    actions.appendChild(
      window.MoleUI.button({
        label: '打开设置',
        icon: 'settings',
        variant: 'secondary',
        size: 'small',
        onClick: function () {
          navigate('settings');
        }
      })
    );
    actions.appendChild(
      window.MoleUI.button({
        label: '重新读取',
        icon: 'refresh',
        variant: 'primary',
        size: 'small',
        onClick: function () {
          load();
        }
      })
    );
    wrap.appendChild(body);
  }

  function renderCancelled() {
    var wrap = newWrap();
    if (!wrap) return;
    var card = window.MoleUI.card({
      title: '读取已取消',
      subtitle: 'status --json 被中断',
      body: window.MoleUI.emptyState({
        icon: 'stop',
        title: '没有完成系统状态读取',
        hint: '按 ⌘R 或点击下方按钮重新读取。',
        actionLabel: '重新读取',
        onAction: function () {
          load();
        }
      })
    });
    card.classList.add('dash-error');
    wrap.appendChild(card);
  }

  function renderEmptyStatus() {
    var wrap = newWrap();
    if (!wrap) return;
    var card = window.MoleUI.card({
      title: '没有可显示的状态数据',
      subtitle: 'status --json 返回了空输出',
      body: window.MoleUI.emptyState({
        icon: 'info',
        title: '系统状态为空',
        hint: '命令退出码为 0 但没有返回内容。可以稍后重试。',
        actionLabel: '重新读取',
        onAction: function () {
          load();
        }
      })
    });
    card.classList.add('dash-error');
    wrap.appendChild(card);
  }

  function renderStatusError(result, raw, stderr) {
    var wrap = newWrap();
    if (!wrap) return;
    var firstErr = String(stderr || '')
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)[0];
    var subtitle;
    if (result.error === 'parse_failed') subtitle = '无法解析 status --json 的 JSON 输出';
    else if (result.code === 124) subtitle = '命令超时（退出码 124）';
    else if (result.code === 130 || result.code === 143) subtitle = '命令被中断（退出码 ' + result.code + '）';
    else subtitle = '命令退出码 ' + result.code + (firstErr ? ' · ' + firstErr : '');

    var card = window.MoleUI.card({
      title: '无法读取系统状态',
      subtitle: subtitle,
      className: 'dash-error'
    });
    var body = card.querySelector('.card-body');
    var message = document.createElement('p');
    message.className = 'dash-error-msg';
    message.textContent =
      'mole status --json 没有返回可用的数据。可以重试；如果问题持续，请在终端运行该命令查看完整输出。';
    body.appendChild(message);

    var actions = document.createElement('div');
    actions.className = 'dash-error-actions';
    actions.appendChild(
      window.MoleUI.button({
        label: '重试',
        icon: 'refresh',
        variant: 'primary',
        size: 'small',
        onClick: function () {
          load();
        }
      })
    );
    actions.appendChild(
      window.MoleUI.button({
        label: '打开设置',
        icon: 'settings',
        variant: 'ghost',
        size: 'small',
        onClick: function () {
          navigate('settings');
        }
      })
    );
    body.appendChild(actions);

    var log = window.MoleUI.logPanel({ title: 'status --json 输出', hint: '原始输出', maxHeight: 180 });
    log.write(raw || '（无输出）');
    log.setState('error', '失败');
    body.appendChild(log.element);
    wrap.appendChild(card);
  }

  // ------------------------------------------------------------ dashboard

  function renderDashboard(data) {
    var wrap = newWrap();
    if (!wrap) return;
    state.status = data;

    wrap.appendChild(healthCard(data));
    wrap.appendChild(diskCard(data));
    wrap.appendChild(memoryCard(data));
    wrap.appendChild(cpuCard(data));
    wrap.appendChild(batteryCard(data));
    wrap.appendChild(thermalsCard(data));
    wrap.appendChild(topProcessesCard(data));
    wrap.appendChild(sideColumn(data));
    wrap.appendChild(footerLine(data));
    if (window.__moleSafetyNote) window.__moleSafetyNote();
  }

  function healthCard(data) {
    var hardware = data.hardware || {};
    var score = num(data.health_score);
    var message = data.health_score_msg || '';
    var tone = healthTone(score);
    var label = healthLabel(message);
    var restart = /restart/i.test(message);
    var subtitleParts = [];
    if (hardware.model) subtitleParts.push(hardware.model);
    if (hardware.cpu_model) subtitleParts.push(hardware.cpu_model);
    if (hardware.os_version) subtitleParts.push(hardware.os_version);

    var actions = window.MoleUI.badge(label, tone === 'accent' ? 'accent' : tone);
    if (restart) actions += window.MoleUI.badge('建议重启', 'warning');

    var body =
      '<div class="health">' +
      '<div class="health-ring">' +
      window.MoleUI.ring({
        value: score == null ? 0 : score,
        label: '健康评分',
        sublabel: score == null ? '未知' : score + ' / 100',
        tone: tone,
        size: 112
      }) +
      '</div>' +
      '<div class="health-side">' +
      '<div class="health-badges">' +
      actions +
      '</div>' +
      (message ? '<div class="health-msg">' + esc(message) + '</div>' : '') +
      kvList([
        kv('运行时间', data.uptime || '—'),
        kv('进程数', isNum(data.procs) ? window.MoleUI.formatNumber(data.procs) : '—'),
        kv('平台', data.platform || hardware.os_version || '—')
      ]) +
      '</div>' +
      '</div>';

    return window.MoleUI.card({
      title: '系统健康',
      subtitle: subtitleParts.join(' · '),
      className: 'dash-health',
      actions: window.MoleUI.badge(score == null ? '评分不可用' : score + ' 分', tone === 'accent' ? 'accent' : tone),
      body: body
    });
  }

  function diskCard(data) {
    var disks = Array.isArray(data.disks) ? data.disks : [];
    var disk = disks[0];
    if (!disk) {
      return window.MoleUI.card({
        title: '磁盘存储',
        className: 'dash-disk',
        body: '<div class="dash-note">没有读取到磁盘信息。</div>'
      });
    }
    var used = num(disk.used);
    var total = num(disk.total);
    var pct = num(disk.used_percent);
    if (pct == null && used != null && total) pct = (used / total) * 100;
    var tone = usageTone(pct, 75, 90);
    var smart = String(disk.smart_status || '').toLowerCase();
    var actions =
      smart === 'verified'
        ? window.MoleUI.badge('SMART 已验证', 'success')
        : smart
          ? window.MoleUI.badge('SMART ' + disk.smart_status, 'warning')
          : '';
    var body =
      '<div class="dash-statline">' +
      '<div class="stat-value ' + tone + '">' + (pct == null ? '—' : pct.toFixed(1) + '<span class="dash-unit">%</span>') + '</div>' +
      window.MoleUI.badge(used != null ? window.MoleUI.formatBytes(used) + ' 已用' : '占用未知', 'neutral') +
      '</div>' +
      window.MoleUI.progressBar(pct == null ? 0 : pct, tone.replace('tone-', '')) +
      kvList([
        kv('已用', used != null ? window.MoleUI.formatBytes(used) : '—'),
        kv('可用', used != null && total != null ? window.MoleUI.formatBytes(total - used) : '—'),
        kv('挂载点', (disk.mount || '/') + (disk.fstype ? ' · ' + disk.fstype : ''))
      ]);
    return window.MoleUI.card({
      title: '磁盘存储',
      subtitle: '主启动卷 · ' + (total != null ? window.MoleUI.formatBytes(total) : '—'),
      className: 'dash-disk',
      actions: actions,
      body: body
    });
  }

  function memoryCard(data) {
    var memory = data.memory || {};
    var pct = num(memory.used_percent);
    var used = num(memory.used);
    var total = num(memory.total);
    var available = num(memory.available);
    var cached = num(memory.cached);
    var swapUsed = num(memory.swap_used);
    var swapTotal = num(memory.swap_total);
    if (pct == null && used != null && total) pct = (used / total) * 100;
    var tone = usageTone(pct, 80, 92);
    var pressure = String(memory.pressure || '').trim();
    var actions = pressure
      ? window.MoleUI.badge('压力 ' + pressure, /warn|critical/i.test(pressure) ? 'warning' : 'success')
      : '';
    var body =
      '<div class="dash-statline">' +
      '<div class="stat-value ' + tone + '">' + (pct == null ? '—' : pct.toFixed(1) + '<span class="dash-unit">%</span>') + '</div>' +
      window.MoleUI.badge(window.MoleUI.formatBytes(used || 0) + ' / ' + window.MoleUI.formatBytes(total || 0), 'neutral') +
      '</div>' +
      window.MoleUI.progressBar(pct == null ? 0 : pct, tone.replace('tone-', '')) +
      kvList([
        kv('可用', available != null ? window.MoleUI.formatBytes(available) : '—'),
        kv('已缓存', cached != null ? window.MoleUI.formatBytes(cached) : '—'),
        kv('交换空间', swapUsed != null ? window.MoleUI.formatBytes(swapUsed) + (swapTotal ? ' / ' + window.MoleUI.formatBytes(swapTotal) : '') : '—')
      ]);
    return window.MoleUI.card({
      title: '内存',
      subtitle: '物理内存与交换空间',
      className: 'dash-mem',
      actions: actions,
      body: body
    });
  }

  function cpuCard(data) {
    var cpu = data.cpu || {};
    var usage = num(cpu.usage);
    var cores = Array.isArray(cpu.per_core) ? cpu.per_core : [];
    var hardware = data.hardware || {};
    var coreDesc = isNum(cpu.core_count) ? cpu.core_count + ' 核' : '';
    if (isNum(cpu.p_core_count) && isNum(cpu.e_core_count)) {
      coreDesc += ' · ' + cpu.p_core_count + ' 性能核 + ' + cpu.e_core_count + ' 能效核';
    }
    if (cpu.per_core_estimated) coreDesc += ' · 估算值';

    var loads = [num(cpu.load1), num(cpu.load5), num(cpu.load15)];
    var loadHtml =
      '<div class="cpu-load">' +
      ['1m', '5m', '15m']
        .map(function (label, index) {
          return (
            '<div class="load-item"><span class="load-value">' +
            (loads[index] == null ? '—' : loads[index].toFixed(2)) +
            '</span><span class="load-label">负载 ' +
            label +
            '</span></div>'
          );
        })
        .join('') +
      '</div>';

    var coreHtml = cores
      .map(function (value, index) {
        var v = Math.max(0, Math.min(100, num(value) || 0));
        var cls = v >= 80 ? 'hot' : v >= 50 ? 'warn' : '';
        return (
          '<div class="core"><div class="core-track"><div class="core-fill ' +
          cls +
          '" style="height:' +
          v.toFixed(1) +
          '%"></div></div><span class="core-label">' +
          (index + 1) +
          '</span></div>'
        );
      })
      .join('');

    var body =
      '<div class="cpu-head">' +
      '<div class="stat">' +
      '<div class="stat-label">总占用</div>' +
      '<div class="stat-value">' + (usage == null ? '—' : usage.toFixed(1) + '<span class="dash-unit">%</span>') + '</div>' +
      '</div>' +
      loadHtml +
      '</div>' +
      (cores.length ? '<div class="core-bars">' + coreHtml + '</div>' : '<div class="dash-note">没有逐核占用数据。</div>');

    return window.MoleUI.card({
      title: '处理器',
      subtitle: [hardware.cpu_model || hardware.model || 'CPU', coreDesc].filter(Boolean).join(' · '),
      className: 'dash-cpu',
      actions: isNum(cpu.logical_cpu) ? window.MoleUI.badge(cpu.logical_cpu + ' 逻辑核心', 'accent') : '',
      body: body
    });
  }

  function batteryCard(data) {
    var batteries = Array.isArray(data.batteries) ? data.batteries : [];
    var battery = batteries[0];
    if (!battery) {
      return window.MoleUI.card({
        title: '电池',
        className: 'dash-battery',
        body: '<div class="dash-note">没有检测到电池（台式 Mac 或电池信息不可用）。</div>'
      });
    }
    var percent = num(battery.percent);
    var status = String(battery.status || '');
    var onAC = /AC|charging|full/i.test(status) && !/discharg/i.test(status);
    var tone = percent != null && percent <= 20 ? 'warning' : 'accent';
    var health = String(battery.health || '');
    var healthy = /good|normal|excellent/i.test(health);
    var body =
      '<div class="dash-statline">' +
      '<div class="stat-value ' + (onAC ? 'tone-success' : '') + '">' + (percent == null ? '—' : percent + '<span class="dash-unit">%</span>') + '</div>' +
      window.MoleUI.badge(onAC ? '电源适配器' : status || '电池供电', onAC ? 'success' : tone) +
      '</div>' +
      window.MoleUI.progressBar(percent == null ? 0 : percent, onAC ? 'success' : 'accent') +
      kvList([
        kv('健康度', health || '—'),
        kv('循环次数', isNum(battery.cycle_count) ? battery.cycle_count + ' 次' : '—'),
        kv('最大容量', isNum(battery.capacity) ? battery.capacity + '%' : '—'),
        kv('剩余时间', battery.time_left || (onAC ? '已接电源' : '—'))
      ]);
    return window.MoleUI.card({
      title: '电池',
      subtitle: healthy ? '电池状态良好' : '电池信息',
      className: 'dash-battery',
      actions: healthy ? window.MoleUI.badge('健康', 'success') : '',
      body: body
    });
  }

  function thermalsCard(data) {
    var thermal = data.thermal || {};
    var cpuTemp = num(thermal.cpu_temp);
    var batteryTemp = num(thermal.battery_temp);
    var fanSpeed = num(thermal.fan_speed);
    var fanCount = num(thermal.fan_count);
    var systemPower = num(thermal.system_power);
    var adapterPower = num(thermal.adapter_power);
    var tiles = [
      ['电池温度', batteryTemp ? batteryTemp.toFixed(1) + '°C' : '—'],
      ['风扇', fanCount ? (fanSpeed != null ? Math.round(fanSpeed) + ' RPM' : '—') : '无风扇'],
      ['系统功耗', systemPower ? systemPower.toFixed(1) + ' W' : '—'],
      ['适配器', adapterPower ? Math.round(adapterPower) + ' W' : '—']
    ];
    var body =
      '<div class="tile-grid">' +
      tiles
        .map(function (tile) {
          return '<div class="tile"><span class="tile-label">' + esc(tile[0]) + '</span><span class="tile-value">' + esc(tile[1]) + '</span></div>';
        })
        .join('') +
      '</div>' +
      (cpuTemp && cpuTemp > 0 ? '<div class="dash-note">CPU 温度 ' + cpuTemp.toFixed(1) + '°C</div>' : '<div class="dash-note">CPU 温度传感器在此 Mac 上不可用</div>');
    return window.MoleUI.card({
      title: '温度与功耗',
      subtitle: '来自系统传感器',
      className: 'dash-thermals',
      body: body
    });
  }

  function topProcessesCard(data) {
    var processes = Array.isArray(data.top_processes) ? data.top_processes.slice(0, 5) : [];
    var card = window.MoleUI.card({
      title: '占用最高的进程',
      subtitle: '按 CPU 占用排序',
      className: 'dash-top',
      actions: isNum(data.zombie_count) && data.zombie_count > 0 ? window.MoleUI.badge(data.zombie_count + ' 个僵尸进程', 'warning') : ''
    });
    var body = card.querySelector('.card-body');
    if (!processes.length) {
      var note = document.createElement('div');
      note.className = 'dash-note';
      note.textContent = '没有读取到进程信息。';
      body.appendChild(note);
      return card;
    }
    var table = document.createElement('div');
    table.className = 'table dash-table';
    var head = document.createElement('div');
    head.className = 'table-head';
    head.innerHTML =
      '<div class="table-cell">进程</div>' +
      '<div class="table-cell right">CPU</div>' +
      '<div class="table-cell right">内存</div>' +
      '<div class="table-cell right">PID</div>';
    table.appendChild(head);

    processes.forEach(function (proc) {
      var row = document.createElement('div');
      row.className = 'table-row';
      var cpu = num(proc.cpu);
      var memory = num(proc.memory);
      var nameCell = document.createElement('div');
      nameCell.className = 'table-cell';
      nameCell.innerHTML = '<div class="proc-name"><b></b><span></span></div>';
      nameCell.querySelector('b').textContent = proc.name || proc.command || '未知进程';
      nameCell.querySelector('span').textContent = proc.command && proc.command !== proc.name ? proc.command : '';
      var cpuCell = document.createElement('div');
      cpuCell.className = 'table-cell right mono';
      cpuCell.textContent = cpu == null ? '—' : cpu.toFixed(1) + '%';
      if (cpu != null && cpu >= 80) cpuCell.classList.add('cpu-hot');
      else if (cpu != null && cpu >= 40) cpuCell.classList.add('cpu-warm');
      var memCell = document.createElement('div');
      memCell.className = 'table-cell right mono';
      if (isNum(proc.memory_bytes) && proc.memory_bytes > 0) memCell.textContent = window.MoleUI.formatBytes(proc.memory_bytes);
      else memCell.textContent = memory == null ? '—' : memory.toFixed(1) + '%';
      var pidCell = document.createElement('div');
      pidCell.className = 'table-cell right mono muted';
      pidCell.textContent = proc.pid == null ? '—' : String(proc.pid);
      row.appendChild(nameCell);
      row.appendChild(cpuCell);
      row.appendChild(memCell);
      row.appendChild(pidCell);
      table.appendChild(row);
    });
    body.appendChild(table);

    var meta = document.createElement('div');
    meta.className = 'dash-note';
    var bits = [];
    if (isNum(data.procs)) bits.push('共 ' + window.MoleUI.formatNumber(data.procs) + ' 个进程');
    if (data.process_watch && data.process_watch.enabled) {
      bits.push('监控窗口 ' + (data.process_watch.window || '—'));
    }
    meta.textContent = bits.join(' · ');
    body.appendChild(meta);
    return card;
  }

  function sideColumn(data) {
    var side = document.createElement('div');
    side.className = 'dash-side';
    side.appendChild(networkCard(data));
    side.appendChild(quickActionsCard(data));
    return side;
  }

  function networkCard(data) {
    var networks = Array.isArray(data.network) ? data.network : [];
    var net = null;
    networks.forEach(function (item) {
      if (!net && (item.ip || Number(item.rx_rate_mbs) > 0 || Number(item.tx_rate_mbs) > 0)) net = item;
    });
    if (!net) net = networks[0];
    var proxy = data.proxy || {};
    var card = window.MoleUI.card({
      title: '网络',
      subtitle: net ? net.name + (net.ip ? ' · ' + net.ip : '') : '没有活动接口',
      className: 'dash-net',
      actions: proxy.enabled ? window.MoleUI.badge((proxy.type || '代理') + ' 代理', 'info') : window.MoleUI.badge('直连', 'neutral')
    });
    var body = card.querySelector('.card-body');
    if (!net) {
      var note = document.createElement('div');
      note.className = 'dash-note';
      note.textContent = '没有读取到网络接口。';
      body.appendChild(note);
      return card;
    }
    function rate(value) {
      var n = num(value);
      return n == null ? '—' : n.toFixed(2) + ' MB/s';
    }
    body.innerHTML = kvList([
      kv('下载', rate(net.rx_rate_mbs)),
      kv('上传', rate(net.tx_rate_mbs)),
      kv('IP 地址', net.ip || '—'),
      kv(proxy.enabled ? '代理' : '连接方式', proxy.enabled ? (proxy.type || '代理') + ' ' + (proxy.host || '') : '直接连接')
    ]);
    return card;
  }

  function quickActionsCard(data) {
    var card = window.MoleUI.card({
      title: '快捷操作',
      subtitle: '常用维护入口',
      className: 'dash-quick'
    });
    var body = card.querySelector('.card-body');
    var grid = document.createElement('div');
    grid.className = 'actions-grid';
    grid.appendChild(
      window.MoleUI.button({
        label: '预览清理',
        icon: 'broom',
        variant: 'primary',
        size: 'small',
        onClick: function () {
          navigate('clean');
        }
      })
    );
    grid.appendChild(
      window.MoleUI.button({
        label: '卸载应用',
        icon: 'trash',
        variant: 'secondary',
        size: 'small',
        onClick: function () {
          navigate('uninstall');
        }
      })
    );
    grid.appendChild(
      window.MoleUI.button({
        label: '运行优化',
        icon: 'wand',
        variant: 'secondary',
        size: 'small',
        onClick: function () {
          navigate('optimize');
        }
      })
    );
    grid.appendChild(
      window.MoleUI.button({
        label: '磁盘分析',
        icon: 'chart',
        variant: 'secondary',
        size: 'small',
        onClick: function () {
          navigate('analyze');
        }
      })
    );
    body.appendChild(grid);

    var divider = document.createElement('div');
    divider.className = 'divider';
    body.appendChild(divider);

    var last = document.createElement('div');
    last.className = 'last-clean';
    last.innerHTML =
      '<div class="last-clean-icon">' + window.MoleUI.icon('history', 16) + '</div>' +
      '<div class="last-clean-text"><span class="last-clean-label">上次清理</span><span class="last-clean-value">正在读取历史…</span></div>';
    body.appendChild(last);
    state.lastCleanEl = last;
    state.lastCleanValue = last.querySelector('.last-clean-value');
    state.lastCleanHint = last.querySelector('.last-clean-label');
    last.appendChild(
      window.MoleUI.button({
        label: '历史',
        variant: 'ghost',
        size: 'small',
        icon: 'chevron-right',
        title: '查看清理历史',
        onClick: function () {
          navigate('history');
        }
      })
    );
    if (state.history) applyLastClean(findLastClean(state.history.sessions || []));
    return card;
  }

  function footerLine(data) {
    var foot = document.createElement('div');
    foot.className = 'dash-foot';
    var bits = [];
    if (data.collected_at) bits.push('采集于 ' + window.MoleUI.timeAgo(data.collected_at));
    if (data.host) bits.push(data.host);
    bits.push('按 ⌘R 刷新');
    var html = '';
    bits.forEach(function (bit, index) {
      if (index) html += '<span class="dot"></span>';
      html += '<span>' + esc(bit) + '</span>';
    });
    foot.innerHTML = html;
    return foot;
  }

  // ---------------------------------------------------------------- mount

  function navigate(screen) {
    if (state.ctx && typeof state.ctx.navigate === 'function') state.ctx.navigate(screen);
    else if (window.MoleScreens) window.MoleScreens.navigate(screen);
  }

  window.MoleScreens.register('dashboard', {
    title: '概览',
    subtitle: '系统健康与关键指标一览',
    icon: 'dashboard',
    render: render,
    refresh: refresh,
    unmount: unmount
  });
})();
