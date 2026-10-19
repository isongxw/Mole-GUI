/* Mole GUI — 设置 screen.
 *
 * Read-mostly settings: bundled CLI status and detection, app/log/config paths
 * with Finder reveal, the safety model, keyboard shortcuts and an about card
 * with links plus "uninstall Mole GUI". Edits go through MoleBridge.post only.
 */
(function () {
  'use strict';

  const STYLE_ID = 'mole-screen-settings-style';

  const state = {
    root: null,
    ctx: null,
    detecting: false,
    detectTimer: null,
    subs: [],
    fallbackDataScreen: false,
    refs: {},
  };

  /* ---------- helpers ---------- */

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function iconEl(name, size) {
    const span = h('span', 'st-icon');
    try { span.innerHTML = MoleUI.icon(name, size || 16); } catch (e) { /* no icon */ }
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function btn(opts) {
    if (window.MoleUI && typeof MoleUI.button === 'function') {
      try {
        const b = MoleUI.button(opts);
        if (b && b.nodeType === 1) return b;
      } catch (e) { /* fall through */ }
    }
    const b = h('button', 'btn ' + (opts.variant || 'secondary'));
    if (opts.size === 'small') b.classList.add('small');
    b.textContent = opts.label || '';
    if (opts.title) b.title = opts.title;
    b.disabled = !!opts.disabled;
    if (typeof opts.onClick === 'function') b.addEventListener('click', opts.onClick);
    return b;
  }

  function badgeEl(text, tone) {
    const span = h('span', 'badge' + (tone ? ' ' + tone : ''));
    span.textContent = text;
    return span;
  }

  function toast(message, tone) {
    if (state.ctx && typeof state.ctx.showToast === 'function') {
      state.ctx.showToast(message, tone || 'info');
      return;
    }
    try { MoleUI.toast(message, tone || 'info'); } catch (e) { /* no-op */ }
  }

  function bridgeState() {
    return (window.MoleBridge && window.MoleBridge.state) || {};
  }

  function cliInfo() {
    const bridge = bridgeState();
    const cli = (bridge && bridge.cli) || {};
    return {
      path: String(cli.path || ''),
      version: String(cli.version || ''),
      source: String(cli.source || ''),
      ok: !!cli.ok,
      error: String(cli.error || ''),
    };
  }

  function appInfo() {
    const bridge = bridgeState();
    return (bridge && bridge.app) || {};
  }

  function configInfo() {
    const bridge = bridgeState();
    return (bridge && bridge.config) || {};
  }

  function pathsInfo() {
    const bridge = bridgeState();
    return (bridge && bridge.paths) || {};
  }

  function sourceLabel(source) {
    switch (String(source).toLowerCase()) {
      case 'bundled': return '内置';
      case 'system': return '系统安装';
      case 'custom': return '自定义';
      case 'manual': return '手动安装';
      case 'homebrew': return 'Homebrew';
      default: return source || '未知';
    }
  }

  function sourceTone(source) {
    switch (String(source).toLowerCase()) {
      case 'bundled': return 'accent';
      case 'system': return 'success';
      default: return 'neutral';
    }
  }

  /* ---------- styles ---------- */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* This screen re-renders its own panes frequently; skip the shell's
   one-shot entry fade so state changes never flash or double-animate. */
[data-screen="settings"] > * { animation: none !important; }
[data-screen="settings"] .st {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding-bottom: 8px;
}
[data-screen="settings"] .st-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
[data-screen="settings"] .st-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
[data-screen="settings"] .st-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
[data-screen="settings"] .st-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
}
[data-screen="settings"] .st-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  flex: none;
}
[data-screen="settings"] .st-title { font-size: 13px; font-weight: 600; color: var(--text); }
[data-screen="settings"] .st-subtitle { font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }
[data-screen="settings"] .st-head-spacer { flex: 1 1 auto; }
[data-screen="settings"] .st-body { padding: 6px 16px 14px; }
[data-screen="settings"] .st-kv {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
[data-screen="settings"] .st-kv:last-child { border-bottom: 0; }
[data-screen="settings"] .st-kv-label { font-size: 12px; color: var(--text-muted); }
[data-screen="settings"] .st-kv-value {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
[data-screen="settings"] .st-kv-value.wrap { white-space: normal; word-break: break-all; }
[data-screen="settings"] .st-kv-value.strong { color: var(--text); font-size: 12px; }
[data-screen="settings"] .st-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 12px;
}
[data-screen="settings"] .st-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(52,211,153,.14);
  flex: none;
}
[data-screen="settings"] .st-status-dot.bad {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(248,113,113,.14);
}
[data-screen="settings"] .st-error {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid rgba(248,113,113,.3);
  background: rgba(248,113,113,.08);
  color: #f6b0b0;
  font-size: 11.5px;
  line-height: 1.5;
}
[data-screen="settings"] .st-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
[data-screen="settings"] .st-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
[data-screen="settings"] .st-list li .st-icon { color: var(--success); margin-top: 2px; flex: none; }
[data-screen="settings"] .st-list li.warn .st-icon { color: var(--warning); }
[data-screen="settings"] .st-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
  gap: 0 20px;
}
[data-screen="settings"] .st-shortcut {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
  padding: 2px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}
[data-screen="settings"] .st-shortcut:last-child { border-bottom: 0; }
[data-screen="settings"] .st-shortcut .st-shortcut-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-screen="settings"] .st-kbd {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--bg-elevated);
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex: none;
}
[data-screen="settings"] .st-about-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
[data-screen="settings"] .st-about-mark {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(167,139,250,.35), rgba(99,102,241,.22));
  border: 1px solid rgba(167,139,250,.28);
  color: var(--text);
  flex: none;
}
[data-screen="settings"] .st-about-name { font-size: 15px; font-weight: 600; color: var(--text); }
[data-screen="settings"] .st-about-meta { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; font-family: var(--mono); }
[data-screen="settings"] .st-about-desc { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin-top: 12px; }
[data-screen="settings"] .st-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
[data-screen="settings"] .st-danger-zone {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(248,113,113,.25);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
[data-screen="settings"] .st-danger-note { font-size: 11px; color: var(--text-muted); flex: 1 1 220px; line-height: 1.5; }
[data-screen="settings"] .st-hidden { display: none !important; }
@media (max-width: 1080px) {
  [data-screen="settings"] .st-grid { grid-template-columns: minmax(0, 1fr); }
}
`;
    document.head.appendChild(style);
  }

  /* ---------- card builders ---------- */

  function cardHead(icon, title, subtitle, right) {
    const head = h('div', 'st-card-head');
    const iconWrap = h('div', 'st-card-icon');
    iconWrap.appendChild(iconEl(icon, 16));
    head.appendChild(iconWrap);
    const text = h('div');
    text.appendChild(h('div', 'st-title', title));
    if (subtitle) text.appendChild(h('div', 'st-subtitle', subtitle));
    head.appendChild(text);
    head.appendChild(h('div', 'st-head-spacer'));
    if (right) head.appendChild(right);
    return head;
  }

  function kvRow(label, value, options) {
    const opts = options || {};
    const row = h('div', 'st-kv');
    row.appendChild(h('div', 'st-kv-label', label));
    const valueEl = h('div', 'st-kv-value' + (opts.wrap ? ' wrap' : '') + (opts.strong ? ' strong' : ''), value || '—');
    valueEl.title = value || '';
    row.appendChild(valueEl);
    if (opts.action) row.appendChild(opts.action);
    else row.appendChild(h('span'));
    return row;
  }

  function revealButton(path, label) {
    return btn({
      label: '',
      variant: 'ghost',
      icon: 'external',
      size: 'small',
      title: '在 Finder 中显示' + (label ? ' ' + label : ''),
      onClick: () => revealPath(path),
    });
  }

  function buildCliCard() {
    const cli = cliInfo();
    const config = configInfo();
    const card = h('div', 'st-card');

    const statusDot = h('span', 'st-status-dot' + (cli.ok ? '' : ' bad'));
    const statusWrap = h('span', 'st-row');
    statusWrap.style.display = 'inline-flex';
    statusWrap.style.alignItems = 'center';
    statusWrap.style.gap = '7px';
    statusWrap.appendChild(statusDot);
    statusWrap.appendChild(h('span', null, state.detecting ? '检测中…' : cli.ok ? '可用' : '不可用'));
    card.appendChild(cardHead('terminal', 'Mole CLI', 'GUI 只通过 argv 调用这个可执行文件', statusWrap));

    const body = h('div', 'st-body');
    body.appendChild(kvRow('路径', cli.path || '未找到可用的 Mole CLI', { wrap: true }));
    body.appendChild(kvRow('版本', cli.version || '—', { strong: true }));
    const customCli = !!config.cliPath && config.cliPath !== cli.path;
    const sourceBadge = badgeEl(sourceLabel(customCli ? 'custom' : cli.source), sourceTone(customCli ? 'custom' : cli.source));
    body.appendChild(kvRow('来源', customCli ? '自定义路径' : '随应用打包', { action: sourceBadge }));

    if (!cli.ok && cli.error) {
      body.appendChild(h('div', 'st-error', 'CLI 检测失败：' + cli.error));
    } else if (!cli.ok) {
      body.appendChild(h('div', 'st-error', '未找到可运行的 Mole CLI。可以重新检测、手动选择，或恢复使用内置 CLI。'));
    }

    const actions = h('div', 'st-actions');
    actions.appendChild(btn({
      label: state.detecting ? '检测中…' : '重新检测',
      variant: 'secondary',
      size: 'small',
      icon: 'refresh',
      disabled: state.detecting,
      onClick: () => redetectCli(),
    }));
    actions.appendChild(btn({
      label: '选择 CLI…',
      variant: 'ghost',
      size: 'small',
      icon: 'folder',
      disabled: state.detecting,
      onClick: () => chooseCli(),
    }));
    actions.appendChild(btn({
      label: '恢复内置',
      variant: 'ghost',
      size: 'small',
      icon: 'shield',
      disabled: state.detecting || !customCli,
      title: customCli ? '清除自定义 CLI 路径，恢复使用 app 内置 CLI' : '当前已经在使用内置 CLI',
      onClick: () => restoreBundledCli(),
    }));
    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function buildPathsCard() {
    const paths = pathsInfo();
    const card = h('div', 'st-card');
    card.appendChild(cardHead('folder', '目录位置', '日志、配置与常用系统目录', null));
    const body = h('div', 'st-body');
    const rows = [
      { label: '日志', value: paths.logs, hint: '操作与删除日志' },
      { label: '配置', value: paths.config, hint: 'CLI 配置目录' },
      { label: '应用支持', value: paths.appSupport, hint: 'GUI 本地数据' },
      { label: '下载', value: paths.downloads, hint: '下载目录' },
      { label: '应用程序', value: paths.applications, hint: '应用安装目录' },
    ];
    rows.forEach((row) => {
      const reveal = row.value ? revealButton(row.value, row.hint) : btn({
        label: '', variant: 'ghost', icon: 'external', size: 'small', title: '路径未知', disabled: true,
      });
      body.appendChild(kvRow(row.label, row.value || '未知', { wrap: true, action: reveal }));
    });
    card.appendChild(body);
    return card;
  }

  function buildSafetyCard() {
    const card = h('div', 'st-card');
    card.appendChild(cardHead('shield', '安全模型', '所有破坏性操作都先预览、再确认', null));
    const body = h('div', 'st-body');
    const list = h('ul', 'st-list');
    [
      { icon: 'eye', text: '清理、优化与卸载都支持先预览（dry run），确认之后才会改动文件。' },
      { icon: 'trash', text: '卸载默认把应用与相关文件移入 macOS 废纸篓，可以从废纸篓恢复；永久删除必须额外勾选。' },
      { icon: 'shield', text: 'GUI 不提供后台监控、定时任务、通知或自动清理，只在打开时运行。' },
      { icon: 'lock', text: '只有需要管理员权限的操作才会请求一次系统密码，密码不保存、不写入日志。' },
      { icon: 'package', text: '内置 CLI 版本在构建时固定，GUI 只调用它，不访问网络、不上传数据。' },
    ].forEach((item) => {
      const li = h('li');
      li.appendChild(iconEl(item.icon, 13));
      li.appendChild(h('span', null, item.text));
      list.appendChild(li);
    });
    body.appendChild(list);
    card.appendChild(body);
    return card;
  }

  function buildShortcutsCard() {
    const card = h('div', 'st-card');
    card.appendChild(cardHead('settings', '快捷键', '与 macOS 原生菜单一致的键盘操作', null));
    const body = h('div', 'st-body');
    const wrap = h('div', 'st-shortcuts');
    const rows = [
      { keys: ['⌘', '1'], label: '概览' },
      { keys: ['⌘', '2'], label: '清理' },
      { keys: ['⌘', '3'], label: '卸载' },
      { keys: ['⌘', '4'], label: '优化' },
      { keys: ['⌘', '5'], label: '空间回收' },
      { keys: ['⌘', '6'], label: '磁盘分析' },
      { keys: ['⌘', '7'], label: '历史' },
      { keys: ['⌘', '8'], label: '设置' },
      { keys: ['⌘', 'R'], label: '刷新当前页面' },
      { keys: ['⌘', ','], label: '打开设置' },
    ];
    rows.forEach((row) => {
      const item = h('div', 'st-shortcut');
      item.appendChild(h('span', 'st-shortcut-label', row.label));
      const keys = h('span');
      keys.style.display = 'inline-flex';
      keys.style.gap = '4px';
      row.keys.forEach((key) => keys.appendChild(h('span', 'st-kbd', key)));
      item.appendChild(keys);
      wrap.appendChild(item);
    });
    body.appendChild(wrap);
    card.appendChild(body);
    return card;
  }

  function buildAboutCard() {
    const app = appInfo();
    const cli = cliInfo();
    const card = h('div', 'st-card');
    card.appendChild(cardHead('info', '关于', '本地运行的 Mole 图形界面', null));

    const body = h('div', 'st-body');
    const about = h('div', 'st-about-row');
    const mark = h('div', 'st-about-mark');
    mark.appendChild(iconEl('sparkles', 20));
    about.appendChild(mark);
    const aboutText = h('div');
    aboutText.appendChild(h('div', 'st-about-name', 'Mole GUI'));
    const metaParts = [];
    metaParts.push('版本 ' + (app.version || '—'));
    if (app.build) metaParts.push('构建 ' + app.build);
    aboutText.appendChild(h('div', 'st-about-meta', metaParts.join(' · ')));
    about.appendChild(aboutText);
    card.appendChild(body);
    body.appendChild(about);

    body.appendChild(h('div', 'st-about-desc',
      'Mole GUI 是 Mole CLI 的本地界面：没有网络请求，不后台驻留，所有操作都通过带参数的 CLI 调用完成。'
      + (cli.version ? ' 当前使用 CLI ' + cli.version + '。' : '')));

    const links = h('div', 'st-links');
    links.appendChild(btn({
      label: '官网 mole.fit',
      variant: 'ghost',
      size: 'small',
      icon: 'globe',
      onClick: () => openExternal('https://mole.fit'),
    }));
    links.appendChild(btn({
      label: 'GitHub 仓库',
      variant: 'ghost',
      size: 'small',
      icon: 'external',
      onClick: () => openExternal('https://github.com/tw93/Mole'),
    }));
    body.appendChild(links);

    const danger = h('div', 'st-danger-zone');
    danger.appendChild(btn({
      label: '卸载 Mole GUI',
      variant: 'danger',
      size: 'small',
      icon: 'trash',
      onClick: () => confirmUninstallSelf(),
    }));
    danger.appendChild(h('span', 'st-danger-note', '只会把 Mole GUI 移到废纸篓并退出，Mole CLI 与操作日志会保留。'));
    body.appendChild(danger);

    card.appendChild(body);
    return card;
  }

  function renderSections() {
    const body = state.refs.body;
    if (!body) return;
    body.textContent = '';
    if (!bridgeState().ready) {
      const loading = h('div', 'st-card');
      const box = h('div', 'st-body');
      box.style.padding = '28px 18px';
      const row = h('div');
      row.style.display = 'inline-flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.appendChild(h('span', 'spinner'));
      row.appendChild(h('span', 'muted', '正在读取应用与 CLI 状态…'));
      box.appendChild(row);
      loading.appendChild(box);
      body.appendChild(loading);
    }

    const grid1 = h('div', 'st-grid');
    const left = h('div', 'st-col');
    const right = h('div', 'st-col');
    left.appendChild(buildCliCard());
    left.appendChild(buildPathsCard());
    right.appendChild(buildSafetyCard());
    right.appendChild(buildShortcutsCard());
    grid1.appendChild(left);
    grid1.appendChild(right);
    body.appendChild(grid1);
    body.appendChild(buildAboutCard());
  }

  /* ---------- actions ---------- */

  function revealPath(path) {
    if (!path) { toast('路径未知。', 'warning'); return; }
    try {
      if (window.MoleBridge && typeof MoleBridge.reveal === 'function') MoleBridge.reveal(path);
      else MoleBridge.post('reveal', { path: path });
      toast('已在 Finder 中显示。', 'info');
    } catch (e) {
      toast('无法在 Finder 中显示该路径。', 'danger');
    }
  }

  function openExternal(url) {
    try {
      if (window.MoleBridge && typeof MoleBridge.openExternal === 'function') MoleBridge.openExternal(url);
      else MoleBridge.post('openExternal', { url: url });
    } catch (e) {
      toast('无法在浏览器中打开链接。', 'danger');
    }
  }

  function finishDetecting(message, tone) {
    state.detecting = false;
    if (state.detectTimer) {
      window.clearTimeout(state.detectTimer);
      state.detectTimer = null;
    }
    renderSections();
    if (message) toast(message, tone || 'info');
  }

  function redetectCli() {
    if (state.detecting) return;
    state.detecting = true;
    renderSections();
    try {
      if (window.MoleBridge && typeof MoleBridge.init === 'function') MoleBridge.init();
      else MoleBridge.post('init', {});
    } catch (e) {
      finishDetecting('无法重新检测 CLI。', 'danger');
      return;
    }
    if (state.detectTimer) window.clearTimeout(state.detectTimer);
    state.detectTimer = window.setTimeout(() => {
      if (state.detecting) finishDetecting('CLI 检测超时，请稍后重试。', 'warning');
    }, 4000);
  }

  function chooseCli() {
    try {
      if (window.MoleBridge && typeof MoleBridge.chooseCLI === 'function') MoleBridge.chooseCLI();
      else MoleBridge.post('chooseCLI', {});
    } catch (e) {
      toast('无法打开选择 CLI 对话框。', 'danger');
    }
  }

  function restoreBundledCli() {
    try {
      if (window.MoleBridge && typeof MoleBridge.setConfig === 'function') MoleBridge.setConfig({ cliPath: '' });
      else MoleBridge.post('setConfig', { patch: { cliPath: '' } });
      toast('已恢复使用内置 CLI。', 'success');
      window.setTimeout(() => { if (state.root) renderSections(); }, 260);
    } catch (e) {
      toast('无法恢复内置 CLI。', 'danger');
    }
  }

  function confirmUninstallSelf() {
    const run = () => {
      try {
        if (window.MoleBridge && typeof MoleBridge.uninstallSelf === 'function') MoleBridge.uninstallSelf();
        else MoleBridge.post('uninstallSelf', {});
      } catch (e) {
        toast('无法卸载 Mole GUI。', 'danger');
      }
    };
    const bodyText = 'Mole GUI 会被移到废纸篓，然后应用退出。\n\n'
      + 'Mole CLI、配置目录与操作日志都会保留；如需彻底清理，可在 Terminal 中运行 mo remove。';
    if (window.MoleUI && typeof MoleUI.confirm === 'function') {
      try {
        MoleUI.confirm({
          title: '卸载 Mole GUI？',
          body: bodyText,
          confirmLabel: '卸载',
          danger: true,
        }).then((ok) => { if (ok === true) run(); });
        return;
      } catch (e) { /* fall through */ }
    }
    // Without a renderable confirm dialog we must not quit and trash the app.
    toast('无法显示确认对话框，已取消卸载。', 'warning');
  }

  /* ---------- subscriptions ---------- */

  function subscribe() {
    if (!window.MoleBridge || typeof MoleBridge.on !== 'function') return;
    const refreshOn = (event) => {
      if (!state.root) return;
      const wasDetecting = state.detecting;
      if (event && event.type === 'ready') {
        if (wasDetecting) finishDetecting('CLI 状态已更新。', 'info');
        else renderSections();
        return;
      }
      if (state.detecting) finishDetecting('CLI 已更新。', 'success');
      else renderSections();
    };
    state.subs.push(window.MoleBridge.on('ready', refreshOn));
    state.subs.push(window.MoleBridge.on('cli_changed', refreshOn));
    state.subs.push(window.MoleBridge.on('config_changed', refreshOn));
  }

  /* ---------- screen module ---------- */

  function render(root, ctx) {
    state.root = root;
    state.ctx = ctx || {};
    state.detecting = false;
    state.refs = {};
    if (state.detectTimer) { window.clearTimeout(state.detectTimer); state.detectTimer = null; }
    injectStyle();

    const existing = root.querySelector(':scope > .st');
    if (existing) existing.remove();

    const body = h('div', 'st');
    root.appendChild(body);
    state.refs.body = body;
    if (!root.closest('[data-screen="settings"]')) {
      root.setAttribute('data-screen', 'settings');
      state.fallbackDataScreen = true;
    }

    renderSections();
    subscribe();
  }

  function refresh() {
    if (state.detecting) return;
    renderSections();
  }

  function unmount() {
    state.subs.forEach((off) => {
      try { if (typeof off === 'function') off(); } catch (e) { /* no-op */ }
    });
    state.subs = [];
    if (state.detectTimer) {
      window.clearTimeout(state.detectTimer);
      state.detectTimer = null;
    }
    state.detecting = false;
    if (state.fallbackDataScreen && state.root) {
      state.root.removeAttribute('data-screen');
      state.fallbackDataScreen = false;
    }
    state.root = null;
    state.ctx = null;
    state.refs = {};
  }

  if (window.MoleScreens && typeof MoleScreens.register === 'function') {
    MoleScreens.register('settings', {
      title: '设置',
      subtitle: 'CLI 状态、目录、安全模型与关于',
      icon: 'settings',
      render: render,
      refresh: refresh,
      unmount: unmount,
    });
  }
})();
