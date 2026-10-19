/* Mole GUI — 空间回收 screen (项目缓存 / 安装包).
 *
 * Purge tab: preview `purge --dry-run`, confirm, then run `purge --yes`
 * (unprivileged; the CLI performs the deletion and logging itself).
 * Installer tab: `mo installer` is an interactive terminal picker, so the GUI
 * only offers a hand-off to Terminal. Nothing is deleted from the GUI.
 */
(function () {
  'use strict';

  const STYLE_ID = 'mole-screen-reclaim-style';

  const state = {
    root: null,
    ctx: null,
    tab: 'purge',
    busy: false,
    job: null,
    outBuf: '',
    logVisible: false,
    previewOk: false,
    previewNone: false,
    previewData: null,
    scenarioApplied: false,
    refs: {},
    fallbackDataScreen: false,
  };

  /* ---------- helpers (kept local: screen files do not share a module) ---------- */

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function iconEl(name, size) {
    const span = h('span', 'rc-icon');
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

  function makeLogPanel(title, hint) {
    if (window.MoleUI && typeof MoleUI.logPanel === 'function') {
      try {
        const panel = MoleUI.logPanel({ title: title, hint: hint });
        if (panel && panel.element) return panel;
      } catch (e) { /* fallback */ }
    }
    const element = h('div', 'log-panel');
    element.appendChild(h('div', 'log-head', title || '运行日志'));
    const body = h('pre', 'log-body');
    body.style.maxHeight = '360px';
    body.style.overflow = 'auto';
    element.appendChild(body);
    return {
      element: element,
      write(text) { body.appendChild(document.createTextNode(String(text || '') + '\n')); body.scrollTop = body.scrollHeight; },
      reset() { body.textContent = ''; },
      setState() {},
      setProgress() {},
      setCollapsed() {},
    };
  }

  function toast(message, tone) {
    if (state.ctx && typeof state.ctx.showToast === 'function') {
      state.ctx.showToast(message, tone || 'info');
      return;
    }
    try { MoleUI.toast(message, tone || 'info'); } catch (e) { /* no-op */ }
  }

  function stripAnsi(text) {
    if (window.MoleUI && typeof MoleUI.stripAnsi === 'function') {
      try { return MoleUI.stripAnsi(text); } catch (e) { /* fall through */ }
    }
    return String(text == null ? '' : text)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b[@-Z\\-_]/g, '');
  }

  function parseSizeString(text) {
    if (!text) return null;
    if (window.MoleUI && typeof MoleUI.formatSize === 'function') {
      try {
        const parsed = MoleUI.formatSize(String(text));
        if (parsed != null) return parsed;
      } catch (e) { /* fall through */ }
    }
    const match = String(text).trim().match(/([\d.]+)\s*([KMGT]?B)/i);
    if (!match) return null;
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return Math.round(parseFloat(match[1]) * (mult[match[2].toUpperCase()] || 1));
  }

  function formatBytes(bytes) {
    if (bytes == null) return '—';
    if (window.MoleUI && typeof MoleUI.formatBytes === 'function') {
      try { return MoleUI.formatBytes(bytes); } catch (e) { /* fall through */ }
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(bytes) || 0;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return (index === 0 ? String(Math.round(value)) : value.toFixed(2).replace(/\.00$/, '')) + units[index];
  }

  function transportError(code) {
    switch (code) {
      case 'auth_cancelled': return '已取消管理员授权。';
      case 'auth_failed': return '密码不正确，请重试。';
      case 'spawn_failed': return '无法启动 Mole CLI，请检查设置中的 CLI 路径。';
      default: return code ? '任务失败：' + code : '任务失败。';
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
[data-screen="reclaim"] > * { animation: none !important; }
[data-screen="reclaim"] .rc {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
[data-screen="reclaim"] .rc-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  width: fit-content;
}
[data-screen="reclaim"] .rc-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  text-align: left;
  padding: 8px 16px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 160ms ease-out, color 160ms ease-out;
}
[data-screen="reclaim"] .rc-tab:hover { color: var(--text-secondary); }
[data-screen="reclaim"] .rc-tab.active {
  background: var(--accent-soft);
  color: var(--text);
}
[data-screen="reclaim"] .rc-tab-title { font-size: 13px; font-weight: 600; line-height: 1.25; }
[data-screen="reclaim"] .rc-tab-desc { font-size: 10.5px; color: var(--text-muted); line-height: 1.25; }
[data-screen="reclaim"] .rc-tab.active .rc-tab-desc { color: var(--text-secondary); }
[data-screen="reclaim"] .rc-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px 20px;
}
[data-screen="reclaim"] .rc-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
[data-screen="reclaim"] .rc-head-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(167,139,250,.2);
  flex: none;
}
[data-screen="reclaim"] .rc-title { font-size: 15px; font-weight: 600; color: var(--text); }
[data-screen="reclaim"] .rc-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
[data-screen="reclaim"] .rc-spacer { flex: 1 1 auto; }
[data-screen="reclaim"] .rc-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.55;
}
[data-screen="reclaim"] .rc-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
[data-screen="reclaim"] .rc-list li .rc-icon { color: var(--text-muted); margin-top: 2px; flex: none; }
[data-screen="reclaim"] .rc-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
[data-screen="reclaim"] .rc-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
[data-screen="reclaim"] .rc-cmd {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 14px;
  padding: 10px 12px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: #0a0910;
}
[data-screen="reclaim"] .rc-cmd code {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--cyan);
  letter-spacing: .02em;
}
[data-screen="reclaim"] .rc-result {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 18px;
}
[data-screen="reclaim"] .rc-result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
[data-screen="reclaim"] .rc-result-title { font-size: 15px; font-weight: 600; }
[data-screen="reclaim"] .rc-result-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
[data-screen="reclaim"] .rc-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
[data-screen="reclaim"] .rc-stat {
  min-width: 138px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}
[data-screen="reclaim"] .rc-stat-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
[data-screen="reclaim"] .rc-stat-value {
  font-family: var(--mono);
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
[data-screen="reclaim"] .rc-stat-value.success { color: var(--success); }
[data-screen="reclaim"] .rc-stat-value.warn { color: var(--warning); }
[data-screen="reclaim"] .rc-stat-value.danger { color: var(--danger); }
[data-screen="reclaim"] .rc-stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
[data-screen="reclaim"] .rc-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
}
[data-screen="reclaim"] .rc-note .rc-icon { flex: none; margin-top: 1px; }
[data-screen="reclaim"] .rc-note.warning { border-color: rgba(251,191,36,.28); background: rgba(251,191,36,.08); color: #f3d28a; }
[data-screen="reclaim"] .rc-note.danger { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.09); color: #f6b0b0; }
[data-screen="reclaim"] .rc-note .rc-note-title { color: var(--text); font-weight: 600; }
[data-screen="reclaim"] .rc-log { margin-top: 2px; }
[data-screen="reclaim"] .rc-hidden { display: none !important; }
[data-screen="reclaim"] .rc-modal-copy { font-size: 13px; color: var(--text-secondary); line-height: 1.65; }
[data-screen="reclaim"] .rc-modal-copy strong { color: var(--text); }
`;
    document.head.appendChild(style);
  }

  /* ---------- output parsing ---------- */

  function parsePurgeOutput(text) {
    const out = {
      title: '',
      size: null,
      sizeText: '',
      items: null,
      none: false,
      incomplete: false,
      skipped: false,
    };
    const lines = stripAnsi(text).split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (!line) continue;
      if (/^Dry run (?:complete|incomplete)/i.test(line.trim())) out.title = line.trim();
      if (/^Purge (?:complete|incomplete)/i.test(line.trim())) out.title = line.trim();
      if (/incomplete/i.test(line) && /purge|dry run/i.test(line)) out.incomplete = true;
      if (/No artifacts were removed|No old project artifacts|No project artifacts to clean/i.test(line)) out.none = true;
      let match = line.match(/Would free approximately:\s*([\d.]+\s*[KMGT]?B)/i);
      if (!match) match = line.match(/Estimated space freed:\s*([\d.]+\s*[KMGT]?B)/i);
      if (!match) match = line.match(/Freed\s+([\d.]+\s*[KMGT]?B)/i);
      if (match) { out.sizeText = match[1]; out.size = parseSizeString(match[1]); }
      const items = line.match(/\bItems:\s*(\d+)/i);
      if (items) out.items = parseInt(items[1], 10);
      if (/skipped or could not be processed/i.test(line)) out.skipped = true;
    }
    return out;
  }

  /* ---------- DOM builders ---------- */

  function noteEl(text, tone) {
    const note = h('div', 'rc-note' + (tone ? ' ' + tone : ''));
    note.appendChild(iconEl(tone === 'danger' ? 'alert' : tone === 'warning' ? 'alert' : 'info', 14));
    note.appendChild(h('span', null, text));
    return note;
  }

  function buildTabs() {
    const tabs = h('div', 'rc-tabs');
    const items = [
      { key: 'purge', title: '项目缓存', desc: '旧项目构建产物' },
      { key: 'installer', title: '安装包', desc: '交互式安装包清理' },
    ];
    items.forEach((item) => {
      const tab = h('button', 'rc-tab' + (state.tab === item.key ? ' active' : ''));
      tab.type = 'button';
      tab.dataset.tab = item.key;
      tab.appendChild(h('span', 'rc-tab-title', item.title));
      tab.appendChild(h('span', 'rc-tab-desc', item.desc));
      tab.addEventListener('click', () => switchTab(item.key));
      tabs.appendChild(tab);
    });
    state.refs.tabs = tabs;
    return tabs;
  }

  function switchTab(key) {
    state.tab = key;
    if (state.refs.tabs) {
      state.refs.tabs.querySelectorAll('.rc-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === key));
    }
    if (state.refs.purgeSection) state.refs.purgeSection.classList.toggle('rc-hidden', key !== 'purge');
    if (state.refs.installerSection) state.refs.installerSection.classList.toggle('rc-hidden', key !== 'installer');
  }

  function buildPurgeSection() {
    const section = h('div', 'rc');
    const card = h('div', 'rc-card');

    const head = h('div', 'rc-head');
    const headIcon = h('div', 'rc-head-icon');
    headIcon.appendChild(iconEl('archive', 20));
    head.appendChild(headIcon);
    const headText = h('div');
    headText.appendChild(h('div', 'rc-title', '项目缓存清理'));
    headText.appendChild(h('div', 'rc-subtitle', 'mo purge · 删除可重建的旧项目构建产物'));
    head.appendChild(headText);
    head.appendChild(h('div', 'rc-spacer'));
    head.appendChild(badgeEl('不需要管理员', 'success'));
    card.appendChild(head);

    const list = h('ul', 'rc-list');
    [
      '扫描常见项目目录中 7 天以上未修改的构建产物：node_modules、target、dist、build、.next 等。',
      '只清理可重新安装或重新构建的产物，不会删除源代码和 git 仓库。',
      '先预览确认，再执行；清理为永久删除，无法从废纸篓恢复。',
      '删除操作由 Mole CLI 执行并写入操作日志，GUI 只负责展示。',
    ].forEach((text) => {
      const li = h('li');
      li.appendChild(iconEl('check', 13));
      li.appendChild(h('span', null, text));
      list.appendChild(li);
    });
    card.appendChild(list);

    const actions = h('div', 'rc-actions');
    const previewBtn = btn({
      label: '预览项目缓存',
      variant: 'secondary',
      icon: 'play',
      size: 'small',
      onClick: () => startPreview(),
    });
    const runBtn = btn({
      label: '执行清理',
      variant: 'danger',
      icon: 'trash',
      size: 'small',
      disabled: true,
      title: '请先完成一次预览',
      onClick: () => openPurgeConfirm(),
    });
    const cancelBtn = btn({
      label: '停止',
      variant: 'ghost',
      icon: 'stop',
      size: 'small',
      onClick: () => { if (state.job) state.job.cancel(); },
    });
    cancelBtn.classList.add('rc-hidden');
    const hint = h('span', 'rc-hint');
    hint.appendChild(iconEl('info', 13));
    hint.appendChild(h('span', null, '先预览，确认后再执行清理'));

    actions.appendChild(previewBtn);
    actions.appendChild(runBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(hint);
    card.appendChild(actions);
    section.appendChild(card);

    const result = h('div', 'rc-result rc-hidden');
    section.appendChild(result);
    state.refs.result = result;

    state.logPanel = makeLogPanel('清理日志', 'mo purge 的原始输出');
    state.refs.logEl = state.logPanel.element;
    state.refs.logEl.classList.add('rc-log', 'rc-hidden');
    section.appendChild(state.refs.logEl);

    state.refs.previewBtn = previewBtn;
    state.refs.runBtn = runBtn;
    state.refs.cancelBtn = cancelBtn;
    state.refs.purgeHint = hint;
    return section;
  }

  function buildInstallerSection() {
    const section = h('div', 'rc');

    const card = h('div', 'rc-card');
    const head = h('div', 'rc-head');
    const headIcon = h('div', 'rc-head-icon');
    headIcon.appendChild(iconEl('package', 20));
    head.appendChild(headIcon);
    const headText = h('div');
    headText.appendChild(h('div', 'rc-title', '安装包清理'));
    headText.appendChild(h('div', 'rc-subtitle', 'mo installer · 在终端中交互选择'));
    head.appendChild(headText);
    head.appendChild(h('div', 'rc-spacer'));
    head.appendChild(badgeEl('交互式', 'info'));
    card.appendChild(head);

    const list = h('ul', 'rc-list');
    [
      '安装包清理需要逐项查看并选择，只能在终端里完成，GUI 无法安全地代替你确认。',
      '点击「在终端中打开」会用内置 CLI 启动 Terminal 并运行 mo installer。',
      '扫描、选择、确认、删除全部发生在终端中；GUI 不会自行删除任何文件。',
      '删除后同样会写入 Mole 的操作日志，可在历史页面查看。',
    ].forEach((text) => {
      const li = h('li');
      li.appendChild(iconEl('check', 13));
      li.appendChild(h('span', null, text));
      list.appendChild(li);
    });
    card.appendChild(list);

    const cmd = h('div', 'rc-cmd');
    cmd.appendChild(h('code', null, 'mo installer'));
    const copyBtn = btn({
      label: '复制命令',
      variant: 'ghost',
      size: 'small',
      icon: 'copy',
      onClick: () => {
        try {
          MoleBridge.post('clipboard', { text: 'mo installer' });
          toast('命令已复制，可在 Terminal 中粘贴运行。', 'success');
        } catch (e) {
          toast('无法复制命令，请手动输入 mo installer。', 'warning');
        }
      },
    });
    cmd.appendChild(h('div', 'rc-spacer'));
    cmd.appendChild(copyBtn);
    card.appendChild(cmd);

    const actions = h('div', 'rc-actions');
    const openBtn = btn({
      label: '在终端中打开',
      variant: 'primary',
      icon: 'terminal',
      onClick: () => {
        try {
          MoleBridge.post('openTerminal', { args: ['installer'] });
          toast('已在 Terminal 中打开 mo installer。', 'info');
        } catch (e) {
          toast('无法打开 Terminal，请检查 Mole GUI 的权限。', 'danger');
        }
      },
    });
    const hint = h('span', 'rc-hint');
    hint.appendChild(iconEl('info', 13));
    hint.appendChild(h('span', null, '打开的 Terminal 运行的是 Mole GUI 内置的 CLI'));
    actions.appendChild(openBtn);
    actions.appendChild(hint);
    card.appendChild(actions);
    section.appendChild(card);

    section.appendChild(noteEl('GUI 只负责移交命令；mo installer 的所有选择与确认都在 Terminal 中完成，关闭终端不会影响 Mole GUI。', ''));
    return section;
  }

  /* ---------- result rendering ---------- */

  function resetResult() {
    if (!state.refs.result) return;
    state.refs.result.textContent = '';
    state.refs.result.classList.add('rc-hidden');
  }

  function showResult(options) {
    const card = state.refs.result;
    if (!card) return;
    card.textContent = '';
    card.classList.remove('rc-hidden');

    const head = h('div', 'rc-result-head');
    head.appendChild(h('div', 'rc-result-title', options.title || ''));
    if (options.badge) head.appendChild(badgeEl(options.badge.text, options.badge.tone));
    card.appendChild(head);
    if (options.subtitle) card.appendChild(h('div', 'rc-result-sub', options.subtitle));

    if (options.stats && options.stats.length) {
      const stats = h('div', 'rc-stats');
      options.stats.forEach((item) => {
        const tile = h('div', 'rc-stat');
        tile.appendChild(h('div', 'rc-stat-label', item.label));
        tile.appendChild(h('div', 'rc-stat-value' + (item.tone ? ' ' + item.tone : ''), item.value));
        if (item.sub) tile.appendChild(h('div', 'rc-stat-sub', item.sub));
        stats.appendChild(tile);
      });
      card.appendChild(stats);
    }
    (options.notes || []).forEach((note) => card.appendChild(noteEl(note.text, note.tone)));
  }

  /* ---------- jobs ---------- */

  function setBusy(busy) {
    state.busy = busy;
    const refs = state.refs;
    if (refs.previewBtn) refs.previewBtn.disabled = busy;
    if (refs.runBtn) refs.runBtn.disabled = busy || !state.previewOk || state.previewNone;
    if (refs.cancelBtn) refs.cancelBtn.classList.toggle('rc-hidden', !busy);
    if (refs.cancelBtn) refs.cancelBtn.disabled = !busy;
    if (refs.purgeHint) {
      refs.purgeHint.textContent = '';
      refs.purgeHint.appendChild(iconEl('info', 13));
      refs.purgeHint.appendChild(h('span', null, busy
        ? '正在执行…'
        : state.previewNone
          ? '没有需要清理的项目缓存'
          : state.previewOk
            ? '预览已完成，可以执行清理'
            : '先预览，确认后再执行清理'));
    }
    document.querySelectorAll('[data-screen="reclaim"] .rc-tab').forEach((tab) => { tab.disabled = busy; });
  }

  function setLogVisible(visible) {
    state.logVisible = visible;
    if (state.refs.logEl) state.refs.logEl.classList.toggle('rc-hidden', !visible);
  }

  function resetOutput() {
    state.outBuf = '';
    if (state.logPanel) state.logPanel.reset();
  }

  function startPreview() {
    if (state.busy) return;
    if (!window.MoleBridge || typeof MoleBridge.runJob !== 'function') return;

    resetOutput();
    resetResult();
    setLogVisible(true);
    setBusy(true);
    if (state.logPanel) state.logPanel.setState('running', '正在扫描项目缓存…');

    const job = MoleBridge.runJob({
      args: ['purge', '--dry-run'],
      privileged: false,
      label: '预览项目缓存',
      onOutput(text) {
        state.outBuf += text;
        if (state.logPanel) state.logPanel.write(stripAnsi(text));
      },
      onExit(info) {
        if (state.job === job) state.job = null;
        const parsed = parsePurgeOutput(state.outBuf);
        state.previewData = parsed;
        state.previewOk = !!(info && info.code === 0 && !info.error && !info.cancelled);
        state.previewNone = state.previewOk && (parsed.none || (parsed.items != null && parsed.items === 0 && !parsed.size));
        setBusy(false);

        if (info && info.cancelled) {
          state.previewOk = false;
          if (state.logPanel) state.logPanel.setState('idle', '预览已取消。');
          showResult({ title: '预览已取消', badge: { text: '已取消', tone: 'warning' }, subtitle: '没有做任何改动。' });
          return;
        }
        if (info && info.error) {
          state.previewOk = false;
          if (state.logPanel) state.logPanel.setState('error', transportError(info.error));
          showResult({ title: '预览失败', badge: { text: '错误', tone: 'danger' }, subtitle: transportError(info.error) });
          toast(transportError(info.error), 'danger');
          return;
        }
        if (!info || info.code !== 0) {
          state.previewOk = false;
          if (state.logPanel) state.logPanel.setState('error', '预览失败（退出码 ' + (info ? info.code : '?') + '）。');
          showResult({
            title: '预览失败',
            badge: { text: '退出码 ' + (info ? info.code : '?'), tone: 'danger' },
            subtitle: 'Mole CLI 返回了非零状态，没有做任何改动。请查看下方日志。',
          });
          toast('预览失败，请查看日志。', 'danger');
          return;
        }

        if (state.logPanel) state.logPanel.setState('success', parsed.title || '预览完成，尚未做任何改动。');
        if (state.previewNone) {
          showResult({
            title: '没有需要清理的项目缓存',
            badge: { text: '未做改动', tone: 'success' },
            subtitle: '未发现满足条件的旧项目构建产物，无需执行清理。',
            stats: [
              { label: '可清理体积', value: '0 B', tone: 'success' },
              { label: '候选条目', value: parsed.items == null ? '0' : String(parsed.items) },
            ],
            notes: parsed.incomplete ? [{ text: '扫描未完成，部分目录可能被跳过。检查完毕后可以重新预览。', tone: 'warning' }] : [],
          });
        } else {
          showResult({
            title: '预览完成',
            badge: { text: '未做改动', tone: 'success' },
            subtitle: '确认为可重建的构建产物后，点击「执行清理」。',
            stats: [
              { label: '可清理体积', value: parsed.sizeText || '—', tone: 'success' },
              { label: '候选条目', value: parsed.items == null ? '—' : String(parsed.items), sub: '个项目产物' },
              { label: '清理方式', value: '永久删除', sub: '不可恢复' },
            ],
            notes: parsed.incomplete ? [{ text: '扫描未完成，部分目录可能被跳过。建议重新预览后再清理。', tone: 'warning' }] : [],
          });
        }
        toast('预览完成，尚未做任何改动。', 'info');
      },
    });
    state.job = job;
  }

  function openPurgeConfirm() {
    if (state.busy) return;
    if (!state.previewOk) { toast('请先预览项目缓存。', 'warning'); return; }
    const parsed = state.previewData || {};
    const bodyText = 'Mole 将清理预览中列出的旧项目构建产物'
      + (parsed.sizeText ? '（约 ' + parsed.sizeText + '）' : '')
      + '。\n\n'
      + '这些文件可由源码重新安装或构建恢复，但清理为永久删除，不会进入废纸篓，无法撤销。\n\n'
      + '操作不需要管理员权限，执行过程会显示在日志中。';

    const proceed = (ok) => {
      if (ok === true) startPurgeRun();
    };
    if (window.MoleUI && typeof MoleUI.confirm === 'function') {
      try {
        MoleUI.confirm({
          title: '确认清理项目缓存？',
          body: bodyText,
          confirmLabel: '清理',
          danger: true,
        }).then((ok) => proceed(ok));
        return;
      } catch (e) { /* fall through */ }
    }
    // Without a renderable confirm dialog we must not delete anything.
    toast('无法显示确认对话框，已取消清理。', 'warning');
  }

  function startPurgeRun() {
    if (state.busy) return;
    if (!window.MoleBridge || typeof MoleBridge.runJob !== 'function') return;

    resetOutput();
    resetResult();
    setLogVisible(true);
    setBusy(true);
    if (state.logPanel) state.logPanel.setState('running', '正在清理项目缓存…');

    const job = MoleBridge.runJob({
      args: ['purge', '--yes'],
      privileged: false,
      label: '清理项目缓存',
      onOutput(text) {
        state.outBuf += text;
        if (state.logPanel) state.logPanel.write(stripAnsi(text));
      },
      onExit(info) {
        if (state.job === job) state.job = null;
        const parsed = parsePurgeOutput(state.outBuf);
        state.previewOk = false;
        state.previewNone = false;
        setBusy(false);

        if (info && info.cancelled) {
          if (state.logPanel) state.logPanel.setState('idle', '清理已取消。');
          showResult({ title: '清理已取消', badge: { text: '已取消', tone: 'warning' }, subtitle: '已完成的删除不会回滚，请查看日志确认。' });
          toast('清理已取消。', 'info');
          return;
        }
        if (info && info.error) {
          if (state.logPanel) state.logPanel.setState('error', transportError(info.error));
          showResult({ title: '清理失败', badge: { text: '错误', tone: 'danger' }, subtitle: transportError(info.error) });
          toast(transportError(info.error), 'danger');
          return;
        }
        if (!info || info.code !== 0) {
          if (state.logPanel) state.logPanel.setState('error', '清理失败（退出码 ' + (info ? info.code : '?') + '）。');
          showResult({
            title: '清理未完成',
            badge: { text: '退出码 ' + (info ? info.code : '?'), tone: 'danger' },
            subtitle: 'Mole CLI 返回了非零状态，请查看日志了解已处理的项目。',
            stats: [
              { label: '已释放', value: parsed.sizeText || '—' },
              { label: '处理条目', value: parsed.items == null ? '—' : String(parsed.items) },
            ],
            notes: parsed.incomplete ? [{ text: '清理未完成，部分产物可能被跳过。', tone: 'warning' }] : [],
          });
          toast('清理未完成，请查看日志。', 'danger');
          return;
        }
        if (state.logPanel) state.logPanel.setState('success', parsed.title || '清理完成。');
        showResult({
          title: parsed.title || '清理完成',
          badge: { text: '完成', tone: 'success' },
          subtitle: '已清理的产物需要重新安装依赖或构建才能恢复。',
          stats: [
            { label: '已释放', value: parsed.sizeText || '—', tone: 'success' },
            { label: '处理条目', value: parsed.items == null ? '—' : String(parsed.items), sub: '个项目产物' },
            { label: '清理方式', value: '永久删除', sub: '不可恢复' },
          ],
          notes: parsed.skipped ? [{ text: '部分产物被跳过或无法处理，详见日志。', tone: 'warning' }] : [],
        });
        toast('项目缓存清理完成。', 'success');
      },
    });
    state.job = job;
  }

  /* ---------- scenario + module ---------- */

  function applyScenario() {
    if (state.scenarioApplied || !state.ctx) return;
    state.scenarioApplied = true;
    const scenario = state.ctx.scenario;
    if (scenario === 'installer') {
      switchTab('installer');
      return;
    }
    if (scenario === 'purge-preview') {
      setTimeout(() => startPreview(), 30);
    }
  }

  function render(root, ctx) {
    state.root = root;
    state.ctx = ctx || {};
    state.tab = 'purge';
    state.busy = false;
    state.previewOk = false;
    state.previewNone = false;
    state.previewData = null;
    state.scenarioApplied = false;
    injectStyle();

    const existing = root.querySelector(':scope > .rc');
    if (existing) existing.remove();

    const wrap = h('div', 'rc');
    root.appendChild(wrap);
    if (!root.closest('[data-screen="reclaim"]')) {
      root.setAttribute('data-screen', 'reclaim');
      state.fallbackDataScreen = true;
    }

    wrap.appendChild(buildTabs());

    const purgeSection = buildPurgeSection();
    const installerSection = buildInstallerSection();
    installerSection.classList.add('rc-hidden');
    wrap.appendChild(purgeSection);
    wrap.appendChild(installerSection);
    state.refs.purgeSection = purgeSection;
    state.refs.installerSection = installerSection;

    setLogVisible(false);
    setBusy(false);
    applyScenario();
  }

  function refresh() {
    if (state.busy) return;
    if (state.tab === 'purge' && state.previewOk) startPreview();
  }

  function unmount() {
    if (state.job && typeof state.job.cancel === 'function') {
      try { state.job.cancel(); } catch (e) { /* no-op */ }
    }
    state.job = null;
    state.busy = false;
    state.previewOk = false;
    state.previewNone = false;
    state.previewData = null;
    if (state.fallbackDataScreen && state.root) {
      state.root.removeAttribute('data-screen');
      state.fallbackDataScreen = false;
    }
    state.root = null;
    state.ctx = null;
    state.refs = {};
  }

  if (window.MoleScreens && typeof MoleScreens.register === 'function') {
    MoleScreens.register('reclaim', {
      title: '空间回收',
      subtitle: '清理项目缓存；安装包交给终端交互处理',
      icon: 'archive',
      render: render,
      refresh: refresh,
      unmount: unmount,
    });
  }
})();
