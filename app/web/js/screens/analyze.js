/* Mole GUI — 磁盘分析 screen.
 *
 * Drives the read-only `analyze --json <path>` surface: path input and quick
 * location chips, breadcrumb drill-down with a back stack, proportional entry
 * bars, large-file list, Finder reveal per row and a hand-off to the terminal
 * TUI. Nothing here deletes anything.
 */
(function () {
  'use strict';

  const STYLE_ID = 'mole-screen-analyze-style';

  const state = {
    root: null,
    ctx: null,
    currentPath: '',
    data: null,
    backStack: [],
    scanning: false,
    job: null,
    errBuf: '',
    view: 'idle',
    errorMessage: '',
    scenarioStarted: false,
    readyOff: null,
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
    const span = h('span', 'an-icon');
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

  function formatBytes(bytes) {
    if (bytes == null) return '—';
    if (window.MoleUI && typeof MoleUI.formatBytes === 'function') {
      try { return MoleUI.formatBytes(bytes); } catch (e) { /* fall through */ }
    }
    return String(bytes) + ' B';
  }

  function formatNumber(value) {
    if (value == null || !isFinite(value)) return '—';
    if (window.MoleUI && typeof MoleUI.formatNumber === 'function') {
      try { return MoleUI.formatNumber(value); } catch (e) { /* fall through */ }
    }
    return String(value);
  }

  function bridgeState() {
    return (window.MoleBridge && window.MoleBridge.state) || {};
  }

  function readyPaths() {
    const bridge = bridgeState();
    return (bridge && bridge.paths) || {};
  }

  function readyHome() {
    const bridge = bridgeState();
    if (bridge && bridge.home) return String(bridge.home);
    const paths = readyPaths();
    if (paths && paths.home) return String(paths.home);
    return '';
  }

  function onReady(fn) {
    if (window.MoleBridge && typeof window.MoleBridge.on === 'function') {
      try { return window.MoleBridge.on('ready', fn); } catch (e) { /* fall through */ }
    }
    return function () {};
  }

  function whenHome(callback) {
    const home = readyHome();
    if (home) { callback(home); return; }
    let fired = false;
    const fire = (value) => {
      if (fired) return;
      fired = true;
      callback(value || '/');
    };
    const off = onReady(() => fire(readyHome()));
    state.readyOff = (function (previous) {
      return function () {
        try { previous(); } catch (e) { /* no-op */ }
        try { off(); } catch (e) { /* no-op */ }
      };
    })(state.readyOff || function () {});
    window.setTimeout(() => fire(readyHome()), 1200);
  }

  function normalizePath(value) {
    let path = String(value == null ? '' : value).trim();
    path = path.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path;
  }

  function validatePath(value) {
    const path = normalizePath(value);
    if (!path) return { ok: false, message: '请输入要分析的目录路径。' };
    if (path.charAt(0) !== '/') return { ok: false, message: '请输入以 / 开头的绝对路径。' };
    return { ok: true, path: path };
  }

  function parentPath(path) {
    const normalized = normalizePath(path);
    if (normalized === '/' || !normalized) return '/';
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? '/' : normalized.slice(0, index);
  }

  function entryName(entry) {
    if (entry && entry.name) return String(entry.name);
    if (entry && entry.path) {
      const parts = String(entry.path).split('/');
      return parts[parts.length - 1] || entry.path;
    }
    return '未知条目';
  }

  function entrySize(entry) {
    const value = entry ? entry.size : 0;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /* ---------- styles ---------- */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* This screen re-renders its own panes frequently; skip the shell's
   one-shot entry fade so state changes never flash or double-animate. */
[data-screen="analyze"] > * { animation: none !important; }
[data-screen="analyze"] .an {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
[data-screen="analyze"] .an-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
}
[data-screen="analyze"] .an-search {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
[data-screen="analyze"] .an-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
[data-screen="analyze"] .an-back { flex: none; }
[data-screen="analyze"] .an-inputwrap {
  position: relative;
  flex: 1 1 320px;
  min-width: 200px;
  display: flex;
  align-items: center;
}
[data-screen="analyze"] .an-inputwrap .an-icon {
  position: absolute;
  left: 11px;
  display: flex;
  color: var(--text-muted);
  pointer-events: none;
}
[data-screen="analyze"] .an-inputwrap .input {
  width: 100%;
  height: 36px;
  padding: 0 10px 0 34px;
  font-family: var(--mono);
  font-size: 12.5px;
}
[data-screen="analyze"] .an-inputwrap .input.invalid {
  border-color: rgba(248,113,113,.6);
  box-shadow: 0 0 0 2px rgba(248,113,113,.14);
}
[data-screen="analyze"] .an-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
[data-screen="analyze"] .an-chiplabel {
  font-size: 11px;
  color: var(--text-muted);
  margin-right: 2px;
  letter-spacing: .04em;
}
[data-screen="analyze"] .an-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out;
}
[data-screen="analyze"] .an-chip:hover { background: var(--bg-hover); color: var(--text); }
[data-screen="analyze"] .an-chip.active { background: var(--accent-soft); border-color: rgba(167,139,250,.3); color: var(--text); }
[data-screen="analyze"] .an-chip .an-icon { color: var(--text-muted); display: inline-flex; }
[data-screen="analyze"] .an-chip.active .an-icon { color: var(--accent); }
[data-screen="analyze"] .an-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
  min-height: 20px;
}
[data-screen="analyze"] .an-status .spinner { width: 13px; height: 13px; }
[data-screen="analyze"] .an-scan-cancel { flex: none; }
[data-screen="analyze"] .an-stats {
  display: flex;
  align-items: stretch;
  padding: 4px 8px;
}
[data-screen="analyze"] .an-stat {
  flex: 1 1 0;
  min-width: 110px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
[data-screen="analyze"] .an-stat + .an-stat { border-left: 1px solid var(--border); }
[data-screen="analyze"] .an-stat-label { font-size: 11px; color: var(--text-muted); }
[data-screen="analyze"] .an-stat-value {
  font-family: var(--mono);
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
[data-screen="analyze"] .an-stat-value.mono-small { font-size: 14px; }
[data-screen="analyze"] .an-stat-sub { font-size: 11px; color: var(--text-muted); }
[data-screen="analyze"] .an-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0 14px 12px;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid rgba(251,191,36,.28);
  background: rgba(251,191,36,.08);
  color: #f3d28a;
  font-size: 11.5px;
  line-height: 1.5;
}
[data-screen="analyze"] .an-note .an-icon { flex: none; margin-top: 1px; }
[data-screen="analyze"] .an-crumb {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  padding: 8px 12px;
  min-height: 40px;
}
[data-screen="analyze"] .an-crumb button {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-family: var(--mono);
  padding: 4px 7px;
  border-radius: 7px;
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 160ms ease-out, color 160ms ease-out;
}
[data-screen="analyze"] .an-crumb button:hover { background: var(--bg-hover); color: var(--text); }
[data-screen="analyze"] .an-crumb button.current { color: var(--text); cursor: default; background: var(--accent-soft); }
[data-screen="analyze"] .an-crumb .an-sep { display: inline-flex; color: var(--text-muted); opacity: .55; }
[data-screen="analyze"] .an-crl { display: flex; }
[data-screen="analyze"] .an-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr);
  gap: 14px;
  align-items: start;
}
[data-screen="analyze"] .an-panel { overflow: hidden; }
[data-screen="analyze"] .an-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
}
[data-screen="analyze"] .an-panel-title { font-size: 12.5px; font-weight: 600; color: var(--text); }
[data-screen="analyze"] .an-panel-count { font-size: 11.5px; color: var(--text-muted); font-family: var(--mono); }
[data-screen="analyze"] .an-panel-head .an-spacer { flex: 1 1 auto; }
[data-screen="analyze"] .an-list {
  max-height: 430px;
  overflow: auto;
  scrollbar-width: thin;
}
[data-screen="analyze"] .an-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 92px 28px;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 6px 12px 6px 14px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  transition: background 160ms ease-out;
}
[data-screen="analyze"] .an-item:last-child { border-bottom: 0; }
[data-screen="analyze"] .an-item.dir { cursor: pointer; }
[data-screen="analyze"] .an-item:hover { background: var(--bg-hover); }
[data-screen="analyze"] .an-item-icon { display: flex; color: var(--text-muted); }
[data-screen="analyze"] .an-item.dir .an-item-icon { color: var(--accent); }
[data-screen="analyze"] .an-item-main { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
[data-screen="analyze"] .an-item-name {
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-screen="analyze"] .an-item-sub {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-screen="analyze"] .an-bar {
  height: 3px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
}
[data-screen="analyze"] .an-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-strong), var(--accent));
  opacity: .85;
}
[data-screen="analyze"] .an-item.file .an-bar-fill {
  background: linear-gradient(90deg, rgba(34,211,238,.55), var(--cyan));
}
[data-screen="analyze"] .an-size {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-screen="analyze"] .an-reveal { opacity: .55; transition: opacity 160ms ease-out; }
[data-screen="analyze"] .an-item:hover .an-reveal { opacity: 1; }
[data-screen="analyze"] .an-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 58px 20px;
  color: var(--text-muted);
  font-size: 12.5px;
  text-align: center;
}
[data-screen="analyze"] .an-spinner-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12.5px;
}
[data-screen="analyze"] .an-error-note {
  max-width: 620px;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: pre-wrap;
  text-align: left;
  max-height: 120px;
  overflow: auto;
}
[data-screen="analyze"] .an-hidden { display: none !important; }
[data-screen="analyze"] .an-col-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 16px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 1100px) {
  [data-screen="analyze"] .an-cols { grid-template-columns: minmax(0, 1fr); }
}
`;
    document.head.appendChild(style);
  }

  /* ---------- data parsing ---------- */

  function parseAnalyzeJson(text) {
    if (window.MoleParsers && typeof window.MoleParsers.parseAnalyze === 'function') {
      try {
        const parsed = window.MoleParsers.parseAnalyze(text);
        if (parsed && parsed.ok) return parsed.data;
      } catch (e) { /* fall through */ }
    }
    const clean = stripAnsi(text);
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const data = JSON.parse(clean.slice(start, end + 1));
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    } catch (e) { /* fall through */ }
    return null;
  }

  function normalizeAnalyze(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const largeFiles = Array.isArray(data.large_files) ? data.large_files : [];
    return {
      path: String(data.path || state.currentPath || ''),
      overview: !!data.overview,
      scanStatus: String(data.scan_status || 'complete'),
      totalSize: Number(data.total_size) || 0,
      totalFiles: data.total_files == null ? null : Number(data.total_files),
      entries: entries.map((entry) => ({
        name: entryName(entry),
        path: String(entry && entry.path || ''),
        size: entrySize(entry),
        isDir: !!(entry && entry.is_dir),
        scanStatus: String(entry && entry.scan_status || ''),
      })),
      largeFiles: largeFiles.map((file) => ({
        name: entryName(file),
        path: String(file && file.path || ''),
        size: entrySize(file),
      })),
    };
  }

  /* ---------- view rendering ---------- */

  function setStatus(text, running) {
    const el = state.refs.status;
    if (!el) return;
    el.textContent = '';
    if (running) el.appendChild(h('span', 'spinner'));
    else el.appendChild(iconEl('info', 13));
    el.appendChild(h('span', null, text));
  }

  function updateChips() {
    const current = normalizePath(state.refs.pathInput ? state.refs.pathInput.value : state.currentPath);
    if (state.refs.chips) {
      state.refs.chips.querySelectorAll('.an-chip').forEach((chip) => {
        const target = chip.dataset.path || '';
        chip.classList.toggle('active', !!target && normalizePath(target) === current);
      });
    }
  }

  function setInput(path) {
    if (!state.refs.pathInput) return;
    state.refs.pathInput.value = path || '';
    state.refs.pathInput.classList.remove('invalid');
    updateChips();
  }

  function breadcrumbParts(path) {
    const normalized = normalizePath(path);
    if (!normalized) return [];
    const parts = [{ label: '/', path: '/' }];
    if (normalized === '/') return parts;
    const segments = normalized.split('/').filter(Boolean);
    let accumulated = '';
    segments.forEach((segment) => {
      accumulated += '/' + segment;
      parts.push({ label: segment, path: accumulated });
    });
    return parts;
  }

  function buildChips() {
    const chips = h('div', 'an-chips');
    chips.appendChild(h('span', 'an-chiplabel', '快速定位'));
    const defs = [
      { key: 'home', label: '主目录', icon: 'folder', resolve: () => readyHome() },
      { key: 'downloads', label: '下载', icon: 'download', resolve: () => readyPaths().downloads || (readyHome() ? readyHome() + '/Downloads' : '') },
      { key: 'desktop', label: '桌面', icon: 'folder', resolve: () => readyHome() ? readyHome() + '/Desktop' : '' },
      { key: 'applications', label: '应用程序', icon: 'package', resolve: () => readyPaths().applications || '/Applications' },
      { key: 'custom', label: '自定义', icon: 'search', resolve: () => '' },
    ];
    defs.forEach((def) => {
      const chip = h('button', 'an-chip');
      chip.type = 'button';
      chip.dataset.chip = def.key;
      chip.appendChild(iconEl(def.icon, 13));
      chip.appendChild(h('span', null, def.label));
      chip.addEventListener('click', () => {
        (function () {
          const path = def.resolve();
          if (def.key === 'custom' || !path) {
            if (!path && def.key !== 'custom') toast('尚未获取系统路径，请手动输入。', 'warning');
            if (state.refs.pathInput) state.refs.pathInput.focus();
            return;
          }
          scan(path);
        })();
      });
      chips.appendChild(chip);
      if (def.key !== 'custom') {
        // Resolve lazily so a late `ready` event still fills the data attribute.
        chip.dataset.path = def.resolve() || '';
      }
    });
    state.refs.chips = chips;
    return chips;
  }

  function refreshChipPaths() {
    if (!state.refs.chips) return;
    const defs = {
      home: () => readyHome(),
      downloads: () => readyPaths().downloads || (readyHome() ? readyHome() + '/Downloads' : ''),
      desktop: () => readyHome() ? readyHome() + '/Desktop' : '',
      applications: () => readyPaths().applications || '/Applications',
    };
    state.refs.chips.querySelectorAll('.an-chip').forEach((chip) => {
      const key = chip.dataset.chip;
      if (defs[key]) chip.dataset.path = defs[key]() || '';
    });
    updateChips();
  }

  function buildSearchCard() {
    const card = h('div', 'an-card an-search');

    const row = h('div', 'an-row');
    const backBtn = btn({
      label: '',
      variant: 'ghost',
      icon: 'arrow-left',
      title: '返回上一级',
      onClick: () => goBack(),
    });
    backBtn.classList.add('an-back');
    row.appendChild(backBtn);

    const inputWrap = h('div', 'an-inputwrap');
    inputWrap.appendChild(iconEl('folder', 15));
    const input = h('input', 'input');
    input.type = 'text';
    input.spellcheck = false;
    input.placeholder = '输入要分析的绝对路径，例如 /Users/you/Downloads';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        scan(input.value);
      }
    });
    input.addEventListener('input', () => {
      input.classList.remove('invalid');
      updateChips();
    });
    inputWrap.appendChild(input);
    row.appendChild(inputWrap);

    const scanBtn = btn({
      label: '开始分析',
      variant: 'primary',
      icon: 'play',
      onClick: () => scan(input.value),
    });
    const cancelBtn = btn({
      label: '停止',
      variant: 'ghost',
      icon: 'stop',
      onClick: () => { if (state.job) state.job.cancel(); },
    });
    cancelBtn.classList.add('an-scan-cancel', 'an-hidden');
    const tuiBtn = btn({
      label: '打开终端 TUI',
      variant: 'ghost',
      icon: 'terminal',
      title: '用内置 CLI 打开交互式磁盘分析界面',
      onClick: () => openTui(),
    });
    row.appendChild(scanBtn);
    row.appendChild(cancelBtn);
    row.appendChild(tuiBtn);
    card.appendChild(row);

    const chipsRow = h('div', 'an-row');
    chipsRow.appendChild(buildChips());
    const status = h('span', 'an-status');
    chipsRow.appendChild(status);
    card.appendChild(chipsRow);

    state.refs.input = input;
    state.refs.pathInput = input;
    state.refs.scanBtn = scanBtn;
    state.refs.cancelBtn = cancelBtn;
    state.refs.tuiBtn = tuiBtn;
    state.refs.backBtn = backBtn;
    state.refs.status = status;
    return card;
  }

  function statsCard(data) {
    const card = h('div', 'an-card an-stats');
    const stats = [
      { label: '总大小', value: formatBytes(data.totalSize), sub: data.overview ? '概览扫描' : '已扫描' },
      { label: '文件数', value: data.totalFiles == null ? '—' : formatNumber(data.totalFiles), sub: data.totalFiles == null ? '概览模式未统计' : '个文件' },
      { label: '目录项', value: String(data.entries.length), sub: '个直接子项' },
      { label: '扫描状态', value: data.scanStatus === 'complete' ? '完整' : data.scanStatus, sub: data.scanStatus === 'complete' ? '结果可信' : '结果可能不完整', tone: data.scanStatus === 'complete' ? '' : 'warning' },
    ];
    stats.forEach((item) => {
      const block = h('div', 'an-stat');
      block.appendChild(h('div', 'an-stat-label', item.label));
      const value = h('div', 'an-stat-value' + (String(item.value).length > 12 ? ' mono-small' : ''), item.value);
      if (item.tone === 'warning') value.style.color = 'var(--warning)';
      block.appendChild(value);
      if (item.sub) block.appendChild(h('div', 'an-stat-sub', item.sub));
      card.appendChild(block);
    });
    if (data.scanStatus !== 'complete') {
      const note = h('div', 'an-note');
      note.appendChild(iconEl('alert', 14));
      note.appendChild(h('span', null, '扫描状态为 ' + data.scanStatus + '：部分目录可能因权限或超时被跳过，结果可能偏小。'));
      card.appendChild(note);
    }
    return card;
  }

  function breadcrumbCard(path) {
    const card = h('div', 'an-card an-crumb');
    const parts = breadcrumbParts(path);
    parts.forEach((part, index) => {
      const isCurrent = index === parts.length - 1;
      const button = h('button', isCurrent ? 'current' : '', part.label);
      button.type = 'button';
      button.title = part.path;
      if (!isCurrent) button.addEventListener('click', () => scan(part.path));
      card.appendChild(button);
      if (!isCurrent) {
        const sep = h('span', 'an-sep');
        sep.appendChild(iconEl('chevron-right', 12));
        card.appendChild(sep);
      }
    });
    return card;
  }

  function entryRow(entry, maxSize) {
    const row = h('div', 'an-item ' + (entry.isDir ? 'dir' : 'file'));
    row.appendChild(iconEl(entry.isDir ? 'folder' : 'file', 15));

    const main = h('div', 'an-item-main');
    const name = h('div', 'an-item-name', entry.name);
    name.title = entry.path || entry.name;
    main.appendChild(name);
    if (entry.isDir) {
      main.appendChild(h('div', 'an-item-sub', entry.path || '目录'));
    }
    // Proportional bar for every entry (directories included).
    const bar = h('div', 'an-bar');
    const fill = h('div', 'an-bar-fill');
    fill.style.width = (maxSize > 0 ? Math.max(2, (entry.size / maxSize) * 100) : 0).toFixed(1) + '%';
    bar.appendChild(fill);
    main.appendChild(bar);
    row.appendChild(main);
    row.appendChild(h('div', 'an-size', formatBytes(entry.size)));

    const reveal = btn({
      label: '',
      variant: 'ghost',
      icon: 'external',
      size: 'small',
      title: '在 Finder 中显示',
      onClick: (event) => {
        if (event) event.stopPropagation();
        revealPath(entry.path);
      },
    });
    reveal.classList.add('an-reveal');
    row.appendChild(reveal);

    if (entry.isDir && entry.path) {
      row.addEventListener('click', () => scan(entry.path));
    }
    return row;
  }

  function largeFileRow(file, maxSize) {
    const row = h('div', 'an-item file');
    row.appendChild(iconEl('file', 15));
    const main = h('div', 'an-item-main');
    const name = h('div', 'an-item-name', file.name);
    name.title = file.path || file.name;
    main.appendChild(name);
    const path = h('div', 'an-item-sub', file.path || '');
    path.title = file.path || '';
    main.appendChild(path);
    const bar = h('div', 'an-bar');
    const fill = h('div', 'an-bar-fill');
    fill.style.width = (maxSize > 0 ? Math.max(2, (file.size / maxSize) * 100) : 0).toFixed(1) + '%';
    bar.appendChild(fill);
    main.appendChild(bar);
    row.appendChild(main);
    row.appendChild(h('div', 'an-size', formatBytes(file.size)));
    const reveal = btn({
      label: '',
      variant: 'ghost',
      icon: 'external',
      size: 'small',
      title: '在 Finder 中显示',
      onClick: (event) => {
        if (event) event.stopPropagation();
        revealPath(file.path);
      },
    });
    reveal.classList.add('an-reveal');
    row.appendChild(reveal);
    return row;
  }

  function panel(title, countText) {
    const card = h('div', 'an-card an-panel');
    const head = h('div', 'an-panel-head');
    head.appendChild(h('span', 'an-panel-title', title));
    if (countText) head.appendChild(h('span', 'an-panel-count', countText));
    head.appendChild(h('div', 'an-spacer'));
    card.appendChild(head);
    const list = h('div', 'an-list');
    card.appendChild(list);
    return { card: card, list: list };
  }

  function renderResult(data) {
    const view = state.refs.view;
    if (!view) return;
    view.textContent = '';

    view.appendChild(statsCard(data));
    view.appendChild(breadcrumbCard(data.path || state.currentPath));

    const hasContent = data.entries.length > 0 || data.largeFiles.length > 0;
    if (!hasContent) {
      const card = h('div', 'an-card');
      const box = h('div', 'an-state');
      box.appendChild(iconEl('disk', 28));
      box.appendChild(h('div', null, data.scanStatus === 'complete' ? '该目录没有可分析的内容' : '没有扫描到内容'));
      box.appendChild(h('div', 'muted', data.overview ? '概览结果为空。' : '目录为空，或所有内容都在权限范围之外。'));
      box.appendChild(btn({ label: '重新扫描', variant: 'secondary', size: 'small', icon: 'refresh', onClick: () => scan(state.currentPath) }));
      card.appendChild(box);
      view.appendChild(card);
      state.view = 'result';
      return;
    }

    const cols = h('div', 'an-cols');

    const entriesPanel = panel('目录内容', data.entries.length ? data.entries.length + ' 项' : '空');
    if (data.entries.length) {
      const maxEntry = data.entries.reduce((max, entry) => Math.max(max, entry.size), 0);
      data.entries.forEach((entry) => entriesPanel.list.appendChild(entryRow(entry, maxEntry)));
    } else {
      const placeholder = h('div', 'an-col-placeholder');
      placeholder.appendChild(iconEl('folder', 22));
      placeholder.appendChild(h('span', null, '该目录没有直接子项'));
      entriesPanel.list.appendChild(placeholder);
    }
    cols.appendChild(entriesPanel.card);

    const largePanel = panel('大文件', data.largeFiles.length ? data.largeFiles.length + ' 个' : '无');
    if (data.largeFiles.length) {
      const maxFile = data.largeFiles.reduce((max, file) => Math.max(max, file.size), 0);
      data.largeFiles.forEach((file) => largePanel.list.appendChild(largeFileRow(file, maxFile)));
    } else {
      const placeholder = h('div', 'an-col-placeholder');
      placeholder.appendChild(iconEl('file', 22));
      placeholder.appendChild(h('span', null, '没有发现大文件'));
      largePanel.list.appendChild(placeholder);
    }
    cols.appendChild(largePanel.card);
    view.appendChild(cols);

    state.view = 'result';
  }

  function renderIdle(message, hint) {
    const view = state.refs.view;
    if (!view) return;
    view.textContent = '';
    const card = h('div', 'an-card');
    const box = h('div', 'an-state');
    box.appendChild(iconEl('disk', 30));
    box.appendChild(h('div', null, message || '选择目录开始分析'));
    box.appendChild(h('div', 'muted', hint || '输入路径或点击上方快捷位置，分析结果只读，不会改动文件。'));
    card.appendChild(box);
    view.appendChild(card);
    state.view = 'idle';
  }

  function renderLoading(path) {
    const view = state.refs.view;
    if (!view) return;
    view.textContent = '';
    const card = h('div', 'an-card');
    const box = h('div', 'an-state');
    const row = h('div', 'an-spinner-row');
    row.appendChild(h('span', 'spinner'));
    row.appendChild(h('span', null, '正在扫描 ' + path + ' …'));
    box.appendChild(row);
    box.appendChild(h('div', 'muted', 'mo analyze --json · 只读扫描，不会改动任何文件'));
    card.appendChild(box);
    view.appendChild(card);
    state.view = 'loading';
  }

  function renderError(message, stderr) {
    const view = state.refs.view;
    if (!view) return;
    view.textContent = '';
    const card = h('div', 'an-card');
    const box = h('div', 'an-state');
    box.appendChild(iconEl('alert', 28));
    box.appendChild(h('div', null, '分析失败'));
    box.appendChild(h('div', 'muted', message || '无法读取该目录。'));
    if (stderr) box.appendChild(h('div', 'an-error-note', stderr));
    const actions = h('div', 'an-row');
    actions.appendChild(btn({ label: '重试', variant: 'secondary', size: 'small', icon: 'refresh', onClick: () => scan(state.currentPath || (state.refs.pathInput && state.refs.pathInput.value)) }));
    actions.appendChild(btn({ label: '返回上一级', variant: 'ghost', size: 'small', icon: 'arrow-left', onClick: () => goBack() }));
    box.appendChild(actions);
    card.appendChild(box);
    view.appendChild(card);
    state.view = 'error';
  }

  /* ---------- actions ---------- */

  function setBusy(busy) {
    state.scanning = busy;
    const refs = state.refs;
    if (refs.scanBtn) refs.scanBtn.disabled = busy;
    if (refs.cancelBtn) refs.cancelBtn.classList.toggle('an-hidden', !busy);
    if (refs.cancelBtn) refs.cancelBtn.disabled = !busy;
    if (refs.tuiBtn) refs.tuiBtn.disabled = busy;
    if (refs.backBtn) refs.backBtn.disabled = busy;
    if (refs.pathInput) refs.pathInput.disabled = busy;
    if (refs._chipNodes) refs._chipNodes.forEach((chip) => { chip.disabled = busy; });
    if (refs.chips) refs.chips.querySelectorAll('.an-chip').forEach((chip) => { chip.disabled = busy; });
  }

  function revealPath(path) {
    if (!path) { toast('没有可显示的路径。', 'warning'); return; }
    try {
      if (window.MoleBridge && typeof MoleBridge.reveal === 'function') MoleBridge.reveal(path);
      else MoleBridge.post('reveal', { path: path });
      toast('已在 Finder 中显示。', 'info');
    } catch (e) {
      toast('无法在 Finder 中显示该路径。', 'danger');
    }
  }

  function openTui() {
    const path = normalizePath(state.currentPath || (state.refs.pathInput && state.refs.pathInput.value) || readyHome());
    if (!path || path.charAt(0) !== '/') { toast('请先选择一个目录。', 'warning'); return; }
    try {
      if (window.MoleBridge && typeof MoleBridge.openTerminal === 'function') MoleBridge.openTerminal(['analyze', path]);
      else MoleBridge.post('openTerminal', { args: ['analyze', path] });
      toast('已在 Terminal 中打开磁盘分析 TUI。', 'info');
    } catch (e) {
      toast('无法打开 Terminal。', 'danger');
    }
  }

  function goBack() {
    if (state.scanning) return;
    if (state.backStack.length) {
      const previous = state.backStack.pop();
      scan(previous, false, true);
      return;
    }
    const current = normalizePath(state.currentPath || (state.refs.pathInput && state.refs.pathInput.value));
    if (!current || current === '/') return;
    scan(parentPath(current), false, true);
  }

  function scan(rawPath, pushStack, isBack) {
    if (state.scanning) return;
    const validation = validatePath(rawPath);
    if (!validation.ok) {
      toast(validation.message, 'warning');
      if (state.refs.pathInput) {
        state.refs.pathInput.classList.add('invalid');
        state.refs.pathInput.focus();
      }
      return;
    }
    if (!window.MoleBridge || typeof MoleBridge.runJob !== 'function') return;
    const path = validation.path;
    const previous = normalizePath(state.currentPath || (state.refs.pathInput && state.refs.pathInput.value));
    const previousData = state.data;
    const previousView = state.view;

    if (pushStack !== false && previous && previous !== path) state.backStack.push(previous);
    if (!isBack) state.backStack = state.backStack.slice(-20);

    setInput(path);
    state.currentPath = path;
    state.jobError = '';
    state.errBuf = '';
    setBusy(true);
    setStatus('正在扫描 ' + path + ' …', true);
    renderLoading(path);

    let buffer = '';
    const job = MoleBridge.runJob({
      args: ['analyze', '--json', path],
      privileged: false,
      label: '分析目录',
      onOutput(text, stream) {
        if (stream === 'stderr') state.errBuf += text;
        else buffer += text;
      },
      onExit(info) {
        if (state.job === job) state.job = null;
        setBusy(false);
        if (info && info.cancelled) {
          setStatus('已取消扫描', false);
          if (previousData) {
            renderResult(previousData);
          } else if (previousView === 'error') {
            renderError(state.errorMessage || '无法读取该目录。', '');
          } else {
            renderIdle('已取消扫描');
          }
          return;
        }
        if (info && info.error) {
          const message = info.error === 'spawn_failed'
            ? '无法启动 Mole CLI，请检查设置中的 CLI 路径。'
            : (info.error === 'auth_cancelled' ? '已取消管理员授权。' : '分析失败：' + info.error);
          state.errorMessage = message;
          setStatus('分析失败', false);
          renderError(message, stripAnsi(state.errBuf).trim());
          toast(message, 'danger');
          return;
        }
        if (!info || info.code !== 0) {
          const message = '分析失败（退出码 ' + (info ? info.code : '?') + '）。请确认路径存在并且可读。';
          state.errorMessage = message;
          setStatus('分析失败', false);
          renderError(message, stripAnsi(state.errBuf).trim());
          toast('分析失败，请确认路径。', 'danger');
          return;
        }
        const parsed = parseAnalyzeJson(buffer);
        if (!parsed) {
          const message = '无法解析 analyze --json 输出。';
          state.errorMessage = message;
          setStatus('解析失败', false);
          renderError(message, stripAnsi(buffer).slice(0, 400));
          return;
        }
        const data = normalizeAnalyze(parsed);
        if (data.path) {
          state.currentPath = data.path;
          setInput(data.path);
        }
        state.data = data;
        const totalLabel = formatBytes(data.totalSize);
        setStatus('扫描完成 · ' + totalLabel, false);
        renderResult(data);
        if (state.refs.scanBtn) state.refs.scanBtn.disabled = false;
      },
    });
    state.job = job;
  }

  /* ---------- scenario + screen module ---------- */

  function applyScenario() {
    if (state.scenarioStarted || !state.ctx) return;
    const scenario = state.ctx.scenario;
    if (!scenario || scenario === 'default') { state.scenarioStarted = true; return; }
    if (scenario !== 'result' && scenario !== 'empty') { state.scenarioStarted = true; return; }
    state.scenarioStarted = true;
    whenHome((home) => {
      if (!state.refs.pathInput) return;
      setInput(home);
      scan(home, false);
    });
  }

  function render(root, ctx) {
    state.root = root;
    state.ctx = ctx || {};
    state.currentPath = '';
    state.data = null;
    state.backStack = [];
    state.scanning = false;
    state.job = null;
    state.view = 'idle';
    state.errorMessage = '';
    state.scenarioStarted = false;
    state.readyOff = null;
    state.refs = {};
    injectStyle();

    const existing = root.querySelector(':scope > .an');
    if (existing) existing.remove();

    const wrap = h('div', 'an');
    root.appendChild(wrap);
    if (!root.closest('[data-screen="analyze"]')) {
      root.setAttribute('data-screen', 'analyze');
      state.fallbackDataScreen = true;
    }

    wrap.appendChild(buildSearchCard());
    state.refs.view = h('div', 'an-view');
    wrap.appendChild(state.refs.view);

    const home = readyHome();
    if (home) setInput(home);
    else {
      state.readyOff = onReady(() => {
        if (!state.root) return;
        refreshChipPaths();
        if (!state.refs.pathInput || !state.refs.pathInput.value || state.refs.pathInput.value === '/') {
          const value = readyHome();
          if (value) setInput(value);
        }
      });
    }
    refreshChipPaths();
    renderIdle();
    applyScenario();
  }

  function refresh() {
    if (state.scanning) return;
    const path = state.currentPath || (state.refs.pathInput && state.refs.pathInput.value) || readyHome();
    if (path) scan(path, false);
  }

  function unmount() {
    if (state.job && typeof state.job.cancel === 'function') {
      try { state.job.cancel(); } catch (e) { /* no-op */ }
    }
    if (state.readyOff) {
      try { state.readyOff(); } catch (e) { /* no-op */ }
      state.readyOff = null;
    }
    state.job = null;
    state.scanning = false;
    state.data = null;
    state.backStack = [];
    if (state.fallbackDataScreen && state.root) {
      state.root.removeAttribute('data-screen');
      state.fallbackDataScreen = false;
    }
    state.root = null;
    state.ctx = null;
    state.refs = {};
  }

  if (window.MoleScreens && typeof MoleScreens.register === 'function') {
    MoleScreens.register('analyze', {
      title: '磁盘分析',
      subtitle: '只读扫描目录占用，定位大文件后交给 Finder 或终端',
      icon: 'chart',
      render: render,
      refresh: refresh,
      unmount: unmount,
    });
  }
})();
