/* Mole GUI — 卸载 screen.
 *
 * Loads `uninstall --list` (JSON when stdout is piped), renders a dense
 * selectable application table, previews with `uninstall --dry-run <names...>`
 * and executes the privileged `uninstall <names...>` after a danger confirm
 * that explains the macOS Trash semantics. The GUI never removes files itself.
 */
(function () {
  'use strict';

  const STYLE_ID = 'mole-screen-uninstall-style';
  const RENDER_LIMIT = 200;
  const SCENARIO_NAMES = ['Qoder', 'Obsidian', 'Docker'];

  const state = {
    root: null,
    ctx: null,
    apps: [],
    loading: true,
    error: '',
    query: '',
    source: 'all',
    sort: 'default',
    selected: new Set(),
    busy: false,
    job: null,
    listJob: null,
    listBuf: '',
    outBuf: '',
    logVisible: false,
    scenarioApplied: false,
    fallbackDataScreen: false,
    refs: {},
  };

  /* ---------- tiny DOM / UI helpers ---------- */

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function iconEl(name, size) {
    const span = h('span', 'ud-icon');
    try {
      span.innerHTML = MoleUI.icon(name, size || 16);
    } catch (e) {
      span.textContent = '';
    }
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function btn(opts) {
    if (window.MoleUI && typeof MoleUI.button === 'function') {
      try {
        const b = MoleUI.button(opts);
        if (b && b.nodeType === 1) return b;
      } catch (e) { /* fall through to the local version */ }
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
      } catch (e) { /* local fallback below */ }
    }
    const element = h('div', 'log-panel');
    const head = h('div', 'log-head', title || '运行日志');
    const body = h('pre', 'log-body');
    body.style.maxHeight = '360px';
    body.style.overflow = 'auto';
    element.appendChild(head);
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

  function formatBytes(bytes) {
    if (window.MoleUI && typeof MoleUI.formatBytes === 'function') {
      try { return MoleUI.formatBytes(bytes); } catch (e) { /* fall through */ }
    }
    const n = Number(bytes) || 0;
    if (n <= 0) return '0B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return (i === 0 ? String(Math.round(v)) : v.toFixed(2).replace(/\.00$/, '')) + units[i];
  }

  function sizeBytes(value) {
    if (value == null || value === '' || value === '--') return null;
    if (window.MoleUI && typeof MoleUI.formatSize === 'function') {
      try {
        const parsed = MoleUI.formatSize(String(value));
        if (parsed != null) return parsed;
      } catch (e) { /* fall through */ }
    }
    const match = String(value).trim().match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!match) return null;
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return Math.round(parseFloat(match[1]) * (mult[match[2].toUpperCase()] || 1));
  }

  function displayName(app) {
    return (app && (app.name || app.uninstall_name || app.path)) || '未知应用';
  }

  /* ---------- styles ---------- */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* This screen re-renders its own panes frequently; skip the shell's
   one-shot entry fade so state changes never flash or double-animate. */
[data-screen="uninstall"] > * { animation: none !important; }
[data-screen="uninstall"] .ud {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
[data-screen="uninstall"] .ud-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
[data-screen="uninstall"] .ud-toolbar {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
[data-screen="uninstall"] .ud-rowline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
[data-screen="uninstall"] .ud-search {
  position: relative;
  flex: 1 1 240px;
  min-width: 180px;
  display: flex;
  align-items: center;
}
[data-screen="uninstall"] .ud-search .ud-icon {
  position: absolute;
  left: 10px;
  display: flex;
  color: var(--text-muted);
  pointer-events: none;
}
[data-screen="uninstall"] .ud-search .input {
  width: 100%;
  height: 34px;
  padding: 0 10px 0 32px;
  font-size: 13px;
}
[data-screen="uninstall"] .ud-seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  flex: none;
}
[data-screen="uninstall"] .ud-seg button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12.5px;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 160ms ease-out, color 160ms ease-out;
}
[data-screen="uninstall"] .ud-seg button:hover { color: var(--text); }
[data-screen="uninstall"] .ud-seg button.active {
  background: var(--accent-soft);
  color: var(--text);
}
[data-screen="uninstall"] .ud-spacer { flex: 1 1 auto; }
[data-screen="uninstall"] .ud-count {
  font-size: 12.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-screen="uninstall"] .ud-count strong {
  color: var(--text);
  font-weight: 600;
}
[data-screen="uninstall"] .ud-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
[data-screen="uninstall"] .ud-scroll {
  max-height: 454px; /* 34px header + 10 exactly full 42px rows */
  overflow: auto;
  scrollbar-width: thin;
}
[data-screen="uninstall"] .ud-grid {
  display: grid;
  grid-template-columns: 30px minmax(180px, 1.15fr) 92px 96px minmax(150px, 1.5fr);
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}
[data-screen="uninstall"] .ud-thead {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 34px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--text-muted);
  text-transform: uppercase;
}
[data-screen="uninstall"] .ud-thead .ud-sortable {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}
[data-screen="uninstall"] .ud-thead .ud-sortable:hover { color: var(--text-secondary); }
[data-screen="uninstall"] .ud-thead .ud-sortable.on { color: var(--accent); }
[data-screen="uninstall"] .ud-thead .ud-size { text-align: right; justify-self: end; }
[data-screen="uninstall"] .ud-tr {
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 160ms ease-out;
}
[data-screen="uninstall"] .ud-tr:last-child { border-bottom: 0; }
[data-screen="uninstall"] .ud-tr:hover { background: var(--bg-hover); }
[data-screen="uninstall"] .ud-tr.selected { background: var(--accent-soft); }
[data-screen="uninstall"] .ud-check {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
[data-screen="uninstall"] .ud-app {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
[data-screen="uninstall"] .ud-mono {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}
[data-screen="uninstall"] .ud-appname {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}
[data-screen="uninstall"] .ud-badgecell { display: flex; align-items: center; }
[data-screen="uninstall"] .ud-size-cell {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-screen="uninstall"] .ud-path {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
[data-screen="uninstall"] .ud-path > span { direction: ltr; unicode-bidi: plaintext; }
[data-screen="uninstall"] .ud-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-muted);
}
[data-screen="uninstall"] .ud-foot .ud-hint { display: inline-flex; align-items: center; gap: 6px; }
[data-screen="uninstall"] .ud-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 56px 20px;
  color: var(--text-muted);
  font-size: 12.5px;
  text-align: center;
}
[data-screen="uninstall"] .ud-spinner-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12.5px;
}
[data-screen="uninstall"] .ud-result { padding: 16px 18px; }
[data-screen="uninstall"] .ud-result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
[data-screen="uninstall"] .ud-result-title { font-size: 15px; font-weight: 600; }
[data-screen="uninstall"] .ud-result-sub { font-size: 12px; color: var(--text-muted); }
[data-screen="uninstall"] .ud-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
[data-screen="uninstall"] .ud-stat {
  min-width: 132px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
}
[data-screen="uninstall"] .ud-stat-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
[data-screen="uninstall"] .ud-stat-value {
  font-size: 20px;
  font-weight: 600;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  color: var(--text);
  line-height: 1.2;
}
[data-screen="uninstall"] .ud-stat-value.warn { color: var(--warning); }
[data-screen="uninstall"] .ud-stat-value.danger { color: var(--danger); }
[data-screen="uninstall"] .ud-stat-value.success { color: var(--success); }
[data-screen="uninstall"] .ud-stat-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
[data-screen="uninstall"] .ud-chips { display: flex; flex-wrap: wrap; gap: 6px; }
[data-screen="uninstall"] .ud-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
}
[data-screen="uninstall"] .ud-chip .ud-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
[data-screen="uninstall"] .ud-chip .ud-chip-size { color: var(--text-muted); font-family: var(--mono); font-size: 11px; }
[data-screen="uninstall"] .ud-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
[data-screen="uninstall"] .ud-note.warning { border-color: rgba(251,191,36,.28); background: rgba(251,191,36,.08); color: #f3d28a; }
[data-screen="uninstall"] .ud-note.danger { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.09); color: #f6b0b0; }
[data-screen="uninstall"] .ud-note .ud-icon { flex: none; margin-top: 1px; display: inline-flex; }
[data-screen="uninstall"] .ud-log { margin-top: 2px; }
/* Modal content is portaled to #modal-root, outside #screen-body[data-screen],
   so it needs its own namespaced scope (still only injected by this screen). */
.ud-modal .ud-icon { display: inline-flex; flex: none; }
.ud-modal .ud-modal-copy { font-size: 13px; color: var(--text-secondary); line-height: 1.65; }
.ud-modal .ud-modal-copy strong { color: var(--text); font-weight: 600; }
.ud-modal .ud-modal-list {
  margin: 10px 0 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  overflow: auto;
}
.ud-modal .ud-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
}
.ud-modal .ud-chip .ud-chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.ud-modal .ud-chip .ud-chip-size { color: var(--text-muted); font-family: var(--mono); font-size: 11px; }
.ud-modal .ud-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.ud-modal .ud-note.danger { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.09); color: #f6b0b0; }
.ud-modal .ud-note .ud-icon { margin-top: 1px; }
.ud-modal .ud-modal-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1.5;
}
.ud-modal .ud-modal-check input { margin-top: 2px; accent-color: var(--danger); }
.ud-modal .ud-modal-check.danger { border-color: rgba(248,113,113,.3); background: rgba(248,113,113,.08); color: #f6b0b0; }
.ud-modal .ud-modal-note { font-size: 11.5px; color: var(--text-muted); margin-top: 10px; line-height: 1.5; }
[data-screen="uninstall"] .ud-hidden { display: none !important; }
`;
    document.head.appendChild(style);
  }

  /* ---------- parsing ---------- */

  function parseAppsJson(text) {
    const clean = stripAnsi(text);
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* fall through */ }
    return null;
  }

  function normalizeApps(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map((item) => {
      const app = item && typeof item === 'object' ? item : {};
      return {
        name: String(app.name || app.uninstall_name || app.path || '未知应用'),
        bundle_id: String(app.bundle_id || ''),
        source: String(app.source || 'App'),
        uninstall_name: String(app.uninstall_name || app.name || ''),
        path: String(app.path || ''),
        size: String(app.size || '--'),
      };
    }).filter((app) => app.uninstall_name);
  }

  function parseUninstallText(text) {
    const result = {
      apps: [],
      title: '',
      removed: null,
      freed: null,
      failedNote: '',
      keptCount: null,
      errorLines: [],
      incomplete: false,
    };
    const lines = stripAnsi(text).split(/\r?\n/);
    let inFiles = false;
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/Files to be removed:/.test(line)) { inFiles = true; continue; }
      if (/^\s*(?:Uninstall .*|Dry run (?:complete|incomplete).*|Remove \d+ apps?.*|Personal data kept:)/i.test(line)) {
        inFiles = false;
        if (/^\s*(?:Uninstall |Dry run ).*(?:complete|incomplete)/i.test(line)) result.title = line.trim();
        if (/incomplete/i.test(line)) result.incomplete = true;
      }
      if (inFiles) {
        // "◎ App Name [Brew] , 728.0MB" — CLI's preview app rows (✓ in some builds).
        // Per-file rows are indented and also carry a comma, so anchor to column 0.
        const appMatch = line.match(/^(?:◎|✓)\s+(.+?)\s*(?:\[Brew\]\s*)?[,，]\s*(\S.*)$/);
        if (appMatch) {
          result.apps.push({ name: appMatch[1].trim().replace(/\s+\[Brew\]$/, ''), size: appMatch[2].trim() });
        }
      }
      const removed = line.match(/(?:Would remove|Removed)\s+(\d+)\s+apps?(?:\s*[,·]\s*(?:(?:would free|freed)\s*)?(\d+(?:\.\d+)?\s*[KMGT]?B))?/i);
      if (removed) {
        result.removed = parseInt(removed[1], 10);
        if (removed[2]) result.freed = removed[2].trim();
      }
      const failed = line.match(/Failed:\s*(.+)$/);
      if (failed) result.failedNote = failed[1].replace(/\s{2,}.*$/, '').trim();
      const kept = line.match(/Kept\s+(\d+)\s+system-level/i);
      if (kept) result.keptCount = parseInt(kept[1], 10);
      if (/^✗|^\s*✗/.test(line)) result.errorLines.push(line.replace(/^\s*✗\s*/, '').trim());
    }
    return result;
  }

  /* ---------- rendering ---------- */

  function buildToolbar() {
    const card = h('div', 'ud-card ud-toolbar');

    const row1 = h('div', 'ud-rowline');
    const search = h('div', 'ud-search');
    search.appendChild(iconEl('search', 15));
    const input = h('input', 'input');
    input.type = 'search';
    input.placeholder = '搜索应用名称或路径…';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      state.query = input.value.trim().toLowerCase();
      renderTable();
    });
    search.appendChild(input);
    row1.appendChild(search);

    const seg = h('div', 'ud-seg');
    const filters = [
      { key: 'all', label: '全部' },
      { key: 'App', label: 'App' },
      { key: 'Homebrew', label: 'Homebrew' },
    ];
    filters.forEach((filter) => {
      const b = h('button', filter.key === state.source ? 'active' : '', filter.label);
      b.type = 'button';
      b.dataset.source = filter.key;
      b.addEventListener('click', () => {
        state.source = filter.key;
        seg.querySelectorAll('button').forEach((other) => other.classList.toggle('active', other.dataset.source === filter.key));
        renderTable();
      });
      seg.appendChild(b);
    });
    row1.appendChild(seg);

    const sortBtn = btn({
      label: '按大小排序',
      variant: 'ghost',
      size: 'small',
      icon: 'chevron-down',
      title: '在默认顺序与体积降序之间切换',
      onClick: () => {
        state.sort = state.sort === 'size' ? 'default' : 'size';
        sortBtn.classList.toggle('primary', state.sort === 'size');
        sortBtn.classList.toggle('ghost', state.sort !== 'size');
        renderTable();
      },
    });
    row1.appendChild(sortBtn);

    const refreshBtn = btn({
      label: '刷新',
      variant: 'ghost',
      size: 'small',
      icon: 'refresh',
      title: '重新读取应用列表',
      onClick: () => loadApps(false),
    });
    row1.appendChild(refreshBtn);

    const row2 = h('div', 'ud-rowline');
    const count = h('div', 'ud-count');
    row2.appendChild(count);
    row2.appendChild(h('div', 'ud-spacer'));

    const clearBtn = btn({
      label: '清除选择',
      variant: 'ghost',
      size: 'small',
      onClick: () => { state.selected.clear(); renderTable(); },
    });
    const previewBtn = btn({
      label: '预览卸载',
      variant: 'secondary',
      size: 'small',
      icon: 'play',
      onClick: () => startPreview(),
    });
    const runBtn = btn({
      label: '卸载',
      variant: 'danger',
      size: 'small',
      icon: 'trash',
      onClick: () => openUninstallConfirm(),
    });
    const cancelBtn = btn({
      label: '停止',
      variant: 'ghost',
      size: 'small',
      icon: 'stop',
      onClick: () => { if (state.job) state.job.cancel(); },
      title: '停止当前任务',
    });
    cancelBtn.classList.add('ud-hidden');

    const actions = h('div', 'ud-actions');
    actions.appendChild(clearBtn);
    actions.appendChild(previewBtn);
    actions.appendChild(runBtn);
    actions.appendChild(cancelBtn);
    row2.appendChild(actions);

    card.appendChild(row1);
    card.appendChild(row2);

    state.refs.searchInput = input;
    state.refs.sortBtn = sortBtn;
    state.refs.refreshBtn = refreshBtn;
    state.refs.count = count;
    state.refs.clearBtn = clearBtn;
    state.refs.previewBtn = previewBtn;
    state.refs.runBtn = runBtn;
    state.refs.cancelBtn = cancelBtn;
    return card;
  }

  function renderLoading() {
    const area = state.refs.tableArea;
    if (!area) return;
    area.textContent = '';
    const card = h('div', 'ud-card');
    const box = h('div', 'ud-state');
    const spinner = h('span', 'spinner');
    const row = h('div', 'ud-spinner-row');
    row.appendChild(spinner);
    row.appendChild(h('span', null, '正在读取应用列表…'));
    box.appendChild(row);
    box.appendChild(h('div', 'muted', 'mo uninstall --list'));
    card.appendChild(box);
    area.appendChild(card);
  }

  function renderError(message) {
    const area = state.refs.tableArea;
    if (!area) return;
    area.textContent = '';
    const card = h('div', 'ud-card');
    const box = h('div', 'ud-state');
    box.appendChild(iconEl('alert', 26));
    box.appendChild(h('div', null, '无法读取应用列表'));
    box.appendChild(h('div', 'muted', message));
    box.appendChild(btn({
      label: '重新加载',
      variant: 'secondary',
      size: 'small',
      icon: 'refresh',
      onClick: () => loadApps(false),
    }));
    card.appendChild(box);
    area.appendChild(card);
  }

  function filteredApps() {
    let list = state.apps.slice();
    if (state.source !== 'all') {
      list = list.filter((app) => (state.source === 'Homebrew')
        ? app.source === 'Homebrew'
        : app.source !== 'Homebrew');
    }
    if (state.query) {
      const needle = state.query;
      list = list.filter((app) => [app.name, app.uninstall_name, app.path, app.bundle_id]
        .some((value) => String(value || '').toLowerCase().indexOf(needle) >= 0));
    }
    if (state.sort === 'size') {
      list.sort((a, b) => {
        const av = sizeBytes(a.size);
        const bv = sizeBytes(b.size);
        if (av == null && bv == null) return displayName(a).localeCompare(displayName(b), 'zh-Hans-CN');
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
    } else {
      list.sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-Hans-CN'));
    }
    return list;
  }

  function appByName(name) {
    for (const app of state.apps) {
      if (app.uninstall_name === name) return app;
    }
    return null;
  }

  function selectedBytes() {
    let total = 0;
    let measured = false;
    state.selected.forEach((name) => {
      const app = appByName(name);
      const bytes = app ? sizeBytes(app.size) : null;
      if (bytes != null) { total += bytes; measured = true; }
    });
    return measured ? total : null;
  }

  function updateSelectionUi() {
    const refs = state.refs;
    const count = state.selected.size;
    if (refs.count) {
      refs.count.textContent = '';
      if (count === 0) {
        refs.count.textContent = '未选择应用';
      } else {
        const bytes = selectedBytes();
        refs.count.appendChild(document.createTextNode('已选择 '));
        refs.count.appendChild(h('strong', null, String(count)));
        refs.count.appendChild(document.createTextNode(' 个 · 合计 ' + (bytes == null ? '—' : formatBytes(bytes))));
      }
    }
    const disabled = state.busy || count === 0;
    [refs.previewBtn, refs.runBtn].forEach((b) => { if (b) b.disabled = disabled; });
    if (refs.clearBtn) refs.clearBtn.disabled = state.busy || count === 0;
    if (refs.refreshBtn) refs.refreshBtn.disabled = state.busy;
    if (refs.sortBtn) refs.sortBtn.disabled = state.busy;
    if (refs.searchInput) refs.searchInput.disabled = state.busy;
    if (refs.cancelBtn) refs.cancelBtn.classList.toggle('ud-hidden', !state.busy);
    if (refs.cancelBtn) refs.cancelBtn.disabled = !state.busy;
    document.querySelectorAll('[data-screen="uninstall"] .ud-seg button').forEach((b) => { b.disabled = state.busy; });
    const selectAll = document.querySelector('[data-screen="uninstall"] .ud-selectall');
    if (selectAll) {
      const visible = filteredApps().slice(0, RENDER_LIMIT);
      const selectedVisible = visible.filter((app) => state.selected.has(app.uninstall_name)).length;
      selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
      selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
      selectAll.disabled = state.busy;
    }
  }

  function monogram(app) {
    const name = displayName(app);
    const letter = (name.trim().charAt(0) || '?').toUpperCase();
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    const tile = h('span', 'ud-mono', letter);
    tile.style.background = 'hsl(' + hue + ' 55% 34% / .5)';
    tile.style.color = 'hsl(' + hue + ' 85% 78%)';
    tile.style.boxShadow = 'inset 0 0 0 1px hsl(' + hue + ' 60% 62% / .22)';
    return tile;
  }

  function buildHeaderRow() {
    const head = h('div', 'ud-grid ud-thead');
    const check = h('input', 'ud-check ud-selectall');
    check.type = 'checkbox';
    check.title = '全选当前筛选结果';
    check.addEventListener('change', () => {
      const visible = filteredApps().slice(0, RENDER_LIMIT);
      if (check.checked) {
        visible.forEach((app) => state.selected.add(app.uninstall_name));
      } else {
        visible.forEach((app) => state.selected.delete(app.uninstall_name));
      }
      renderTable();
    });
    head.appendChild(check);
    head.appendChild(h('span', null, '应用'));
    head.appendChild(h('span', null, '来源'));
    const sizeHead = h('span', 'ud-size ud-sortable' + (state.sort === 'size' ? ' on' : ''), '大小');
    sizeHead.title = '点击切换体积排序';
    sizeHead.addEventListener('click', () => {
      state.sort = state.sort === 'size' ? 'default' : 'size';
      renderTable();
    });
    head.appendChild(sizeHead);
    head.appendChild(h('span', null, '路径'));
    return head;
  }

  function buildRow(app) {
    const row = h('div', 'ud-grid ud-tr');
    const name = app.uninstall_name;
    const selected = state.selected.has(name);
    if (selected) row.classList.add('selected');

    const check = h('input', 'ud-check');
    check.type = 'checkbox';
    check.checked = selected;
    check.addEventListener('click', (event) => event.stopPropagation());
    check.addEventListener('change', () => toggleApp(name, check.checked));
    row.appendChild(check);

    const appCell = h('div', 'ud-app');
    appCell.appendChild(monogram(app));
    appCell.appendChild(h('span', 'ud-appname', displayName(app)));
    row.appendChild(appCell);

    const badgeCell = h('div', 'ud-badgecell');
    badgeCell.appendChild(badgeEl(app.source === 'Homebrew' ? 'Homebrew' : 'App', app.source === 'Homebrew' ? 'info' : 'neutral'));
    row.appendChild(badgeCell);

    row.appendChild(h('div', 'ud-size-cell', app.size || '--'));

    const pathCell = h('div', 'ud-path');
    const pathText = h('span', null, app.path || '—');
    pathText.title = app.path || '';
    pathCell.appendChild(pathText);
    row.appendChild(pathCell);

    row.addEventListener('click', (event) => {
      if (event.target.closest('input')) return;
      toggleApp(name, !state.selected.has(name));
    });
    return row;
  }

  function toggleApp(name, checked) {
    if (state.busy) return;
    if (checked === undefined) checked = !state.selected.has(name);
    if (checked) state.selected.add(name);
    else state.selected.delete(name);
    const row = document.querySelector('[data-screen="uninstall"] .ud-tr[data-name="' + cssEscape(name) + '"]');
    if (row) {
      row.classList.toggle('selected', checked);
      const box = row.querySelector('input[type="checkbox"]');
      if (box) box.checked = checked;
    }
    updateSelectionUi();
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function renderTable() {
    const area = state.refs.tableArea;
    if (!area) return;
    area.textContent = '';

    if (state.loading) { renderLoading(); updateSelectionUi(); return; }
    if (state.error) { renderError(state.error); updateSelectionUi(); return; }

    const card = h('div', 'ud-card');
    const list = filteredApps();
    if (!state.apps.length) {
      const box = h('div', 'ud-state');
      box.appendChild(iconEl('package', 28));
      box.appendChild(h('div', null, '未发现可卸载的应用'));
      box.appendChild(h('div', 'muted', 'Mole 没有在 /Applications 或 Homebrew 中找到应用。'));
      box.appendChild(btn({ label: '刷新', variant: 'secondary', size: 'small', icon: 'refresh', onClick: () => loadApps(false) }));
      card.appendChild(box);
      area.appendChild(card);
      updateSelectionUi();
      return;
    }
    if (!list.length) {
      const box = h('div', 'ud-state');
      box.appendChild(iconEl('search', 26));
      box.appendChild(h('div', null, '没有匹配的应用'));
      box.appendChild(h('div', 'muted', '试试其他关键词，或把来源筛选切回「全部」。'));
      box.appendChild(btn({
        label: '清除筛选',
        variant: 'secondary',
        size: 'small',
        onClick: () => {
          state.query = '';
          state.source = 'all';
          if (state.refs.searchInput) state.refs.searchInput.value = '';
          document.querySelectorAll('[data-screen="uninstall"] .ud-seg button').forEach((b) => {
            b.classList.toggle('active', b.dataset.source === 'all');
          });
          renderTable();
        },
      }));
      card.appendChild(box);
      area.appendChild(card);
      updateSelectionUi();
      return;
    }

    const scroll = h('div', 'ud-scroll');
    scroll.appendChild(buildHeaderRow());
    const visible = list.slice(0, RENDER_LIMIT);
    visible.forEach((app) => {
      const row = buildRow(app);
      row.dataset.name = app.uninstall_name;
      scroll.appendChild(row);
    });
    card.appendChild(scroll);

    const foot = h('div', 'ud-foot');
    const totalInfo = h('span', null, '共 ' + state.apps.length + ' 个应用 · 当前显示 ' + list.length + ' 个');
    foot.appendChild(totalInfo);
    if (list.length > RENDER_LIMIT) {
      const hint = h('span', 'ud-hint');
      hint.appendChild(iconEl('info', 13));
      hint.appendChild(h('span', null, '为保持流畅，仅渲染前 ' + RENDER_LIMIT + ' 项，请用搜索缩小范围。'));
      foot.appendChild(hint);
    } else {
      foot.appendChild(h('span', null, '应用名与路径均来自 mo uninstall --list'));
    }
    card.appendChild(foot);
    area.appendChild(card);
    updateSelectionUi();
  }

  function resetResult() {
    const card = state.refs.result;
    if (!card) return;
    card.textContent = '';
    card.classList.add('ud-hidden');
  }

  function showResult(options) {
    const card = state.refs.result;
    if (!card) return;
    card.textContent = '';
    card.classList.remove('ud-hidden');
    card.classList.add('ud-result');

    const head = h('div', 'ud-result-head');
    head.appendChild(h('div', 'ud-result-title', options.title || ''));
    if (options.badge) head.appendChild(badgeEl(options.badge.text, options.badge.tone));
    card.appendChild(head);
    if (options.subtitle) card.appendChild(h('div', 'ud-result-sub', options.subtitle));

    if (options.stats && options.stats.length) {
      const stats = h('div', 'ud-stats');
      options.stats.forEach((item) => {
        const tile = h('div', 'ud-stat');
        tile.appendChild(h('div', 'ud-stat-label', item.label));
        const value = h('div', 'ud-stat-value' + (item.tone ? ' ' + item.tone : ''), item.value);
        tile.appendChild(value);
        if (item.sub) tile.appendChild(h('div', 'ud-stat-sub', item.sub));
        stats.appendChild(tile);
      });
      card.appendChild(stats);
    }

    if (options.chips && options.chips.length) {
      const chips = h('div', 'ud-chips');
      options.chips.forEach((chip) => {
        const item = h('span', 'ud-chip');
        item.appendChild(h('span', 'ud-chip-name', chip.name || ''));
        if (chip.size) item.appendChild(h('span', 'ud-chip-size', chip.size));
        chips.appendChild(item);
      });
      card.appendChild(chips);
    }

    if (options.notes && options.notes.length) {
      const stack = h('div', 'stack');
      stack.style.marginTop = '12px';
      options.notes.forEach((note) => {
        const row = h('div', 'ud-note' + (note.tone ? ' ' + note.tone : ''));
        row.appendChild(iconEl(note.tone === 'danger' ? 'alert' : note.tone === 'warning' ? 'alert' : 'info', 14));
        row.appendChild(h('span', null, note.text));
        stack.appendChild(row);
      });
      card.appendChild(stack);
    }
  }

  function selectedChips() {
    const chips = [];
    state.selected.forEach((name) => {
      const app = appByName(name);
      chips.push({ name: name, size: app ? app.size : '' });
    });
    return chips;
  }

  /* ---------- jobs ---------- */

  function setLogVisible(visible) {
    state.logVisible = visible;
    if (state.refs.logEl) state.refs.logEl.classList.toggle('ud-hidden', !visible);
  }

  function setBusy(busy) {
    state.busy = busy;
    updateSelectionUi();
  }

  function transportError(code) {
    switch (code) {
      case 'auth_cancelled': return '已取消管理员授权。';
      case 'auth_failed': return '密码不正确，请重试。';
      case 'spawn_failed': return '无法启动 Mole CLI，请检查设置中的 CLI 路径。';
      default: return code ? '任务失败：' + code : '任务失败。';
    }
  }

  function loadApps(keepResult) {
    if (state.listJob) return;
    state.loading = true;
    state.error = '';
    state.listBuf = '';
    if (!keepResult) resetResult();
    renderTable();
    const job = MoleBridge.runJob({
      args: ['uninstall', '--list'],
      privileged: false,
      label: '读取应用列表',
      onStart() {},
      onOutput(text) { state.listBuf += text; },
      onExit(info) {
        if (state.listJob === job) state.listJob = null;
        state.loading = false;
        if (info && info.cancelled) {
          state.error = '已取消读取应用列表。';
          renderTable();
          applyScenario();
          return;
        }
        if (info && info.error) {
          state.error = transportError(info.error);
          renderTable();
          applyScenario();
          return;
        }
        if (!info || info.code !== 0) {
          state.error = '读取应用列表失败（退出码 ' + (info ? info.code : '?') + '）。';
          renderTable();
          applyScenario();
          return;
        }
        const parsed = parseAppsJson(state.listBuf);
        if (!parsed) {
          state.error = '无法解析应用列表输出，未做任何改动。';
          renderTable();
          applyScenario();
          return;
        }
        state.apps = normalizeApps(parsed);
        const names = new Set(state.apps.map((app) => app.uninstall_name));
        state.selected.forEach((name) => { if (!names.has(name)) state.selected.delete(name); });
        renderTable();
        applyScenario();
      },
    });
    state.listJob = job;
  }

  function resetOutput() {
    state.outBuf = '';
    if (state.logPanel) state.logPanel.reset();
  }

  function startPreview() {
    if (state.busy) return;
    const names = Array.from(state.selected);
    if (!names.length) { toast('请先选择要卸载的应用。', 'warning'); return; }
    if (!window.MoleBridge || typeof MoleBridge.runJob !== 'function') return;

    resetOutput();
    resetResult();
    setLogVisible(true);
    setBusy(true);
    if (state.logPanel) state.logPanel.setState('running', '正在生成卸载预览…');

    const job = MoleBridge.runJob({
      args: ['uninstall', '--dry-run'].concat(names),
      privileged: false,
      label: '预览卸载',
      onOutput(text) {
        state.outBuf += text;
        if (state.logPanel) state.logPanel.write(stripAnsi(text));
      },
      onExit(info) {
        if (state.job === job) state.job = null;
        setBusy(false);
        if (info && info.cancelled) {
          if (state.logPanel) state.logPanel.setState('idle', '预览已取消。');
          showResult({ title: '预览已取消', badge: { text: '已取消', tone: 'warning' }, subtitle: '没有做任何改动。' });
          return;
        }
        if (info && info.error) {
          if (state.logPanel) state.logPanel.setState('error', transportError(info.error));
          showResult({ title: '预览失败', badge: { text: '错误', tone: 'danger' }, subtitle: transportError(info.error) });
          toast(transportError(info.error), 'danger');
          return;
        }
        const parsed = parseUninstallText(state.outBuf);
        const chips = selectedChips();
        const bytes = selectedBytes();
        if (!info || info.code !== 0) {
          if (state.logPanel) state.logPanel.setState('error', '预览失败（退出码 ' + (info ? info.code : '?') + '）。');
          showResult({
            title: '预览失败',
            badge: { text: '退出码 ' + (info ? info.code : '?'), tone: 'danger' },
            subtitle: 'Mole CLI 返回了非零状态，没有做任何改动。请查看下方日志。',
            chips: chips,
          });
          toast('预览失败，请查看日志。', 'danger');
          return;
        }
        if (state.logPanel) state.logPanel.setState('success', parsed.title || '预览完成，尚未做任何改动。');
        const appCount = parsed.apps.length || names.length;
        const summary = parsed.apps.length ? parsed.apps : chips;
        showResult({
          title: '预览完成',
          badge: { text: '未做改动', tone: 'success' },
          subtitle: '确认无误后点击「卸载」。应用会先移到废纸篓，可随时恢复。',
          stats: [
            { label: '目标应用', value: String(appCount), sub: '个' },
            { label: '预计释放', value: parsed.freed || (bytes == null ? '—' : formatBytes(bytes)), tone: 'success' },
            { label: '删除方式', value: '废纸篓', sub: '可在废纸篓中恢复' },
          ],
          chips: summary,
          notes: parsed.keptCount ? [{ text: '有 ' + parsed.keptCount + ' 个系统级路径会被保留，Mole 从不删除这些路径。', tone: 'warning' }] : [],
        });
        toast('预览完成，尚未做任何改动。', 'info');
      },
    });
    state.job = job;
  }

  function openUninstallConfirm() {
    if (state.busy) return;
    const names = Array.from(state.selected);
    if (!names.length) { toast('请先选择要卸载的应用。', 'warning'); return; }

    const chips = selectedChips();
    const bytes = selectedBytes();

    const body = document.createElement('div');
    body.className = 'ud-modal';
    const copy = h('div', 'ud-modal-copy');
    copy.appendChild(document.createTextNode('即将卸载 '));
    const strong = h('strong', null, names.length + ' 个应用');
    copy.appendChild(strong);
    copy.appendChild(document.createTextNode('，预计释放 ' + (bytes == null ? '若干空间' : formatBytes(bytes)) + '。'));

    const list = h('div', 'ud-modal-list');
    chips.slice(0, 12).forEach((chip) => {
      const item = h('span', 'ud-chip');
      item.appendChild(h('span', 'ud-chip-name', chip.name));
      if (chip.size) item.appendChild(h('span', 'ud-chip-size', chip.size));
      list.appendChild(item);
    });
    if (chips.length > 12) {
      const more = h('span', 'ud-chip');
      more.appendChild(h('span', 'ud-chip-name', '还有 ' + (chips.length - 12) + ' 个…'));
      list.appendChild(more);
    }

    // Trash is the default and recoverable; --permanent is opt-in and must be
    // spelled out as irreversible before the user can confirm.
    const TRASH_COPY = '应用及其相关文件会被移到 macOS 废纸篓，可以在废纸篓中恢复；不会直接永久删除。';
    const PERMANENT_COPY = '已选择永久删除：应用及其相关文件不会进入废纸篓，删除后不可恢复。';
    let dialog = null;

    const trashNote = h('div', 'ud-note');
    const trashIcon = iconEl('info', 14);
    const trashText = h('span', null, TRASH_COPY);
    trashNote.appendChild(trashIcon);
    trashNote.appendChild(trashText);

    const checkLabel = h('label', 'ud-modal-check');
    const permanent = document.createElement('input');
    permanent.type = 'checkbox';
    permanent.className = 'ud-permanent-check';
    permanent.checked = false;
    const checkText = h('span', null, '永久删除（跳过废纸篓，不可恢复）');
    checkLabel.appendChild(permanent);
    checkLabel.appendChild(checkText);

    const adminNote = h('div', 'ud-modal-note', '执行卸载需要管理员权限；Mole 会请求一次系统密码，密码不会保存在 GUI 中。');

    function syncPermanentCopy() {
      const on = permanent.checked;
      checkLabel.classList.toggle('danger', on);
      trashNote.classList.toggle('danger', on);
      trashText.textContent = on ? PERMANENT_COPY : TRASH_COPY;
      if (trashIcon && trashIcon.firstChild) {
        // Swap the info icon for an alert icon when the mode becomes destructive.
        trashIcon.innerHTML = '';
        try { trashIcon.innerHTML = MoleUI.icon(on ? 'alert' : 'info', 14); } catch (e) { /* no icon */ }
      }
      if (!dialog) return;
      const titleEl = dialog.element.querySelector('.modal-title');
      if (titleEl) {
        titleEl.textContent = on
          ? '确认永久卸载 ' + names.length + ' 个应用？'
          : '确认卸载 ' + names.length + ' 个应用？';
      }
      if (dialog.confirmButton) {
        const label = dialog.confirmButton.querySelector('.btn-label');
        if (label) label.textContent = on ? '永久删除' : '卸载';
      }
    }

    permanent.addEventListener('change', syncPermanentCopy);

    body.appendChild(copy);
    body.appendChild(list);
    body.appendChild(trashNote);
    body.appendChild(checkLabel);
    body.appendChild(adminNote);

    if (!window.MoleUI || typeof MoleUI.modal !== 'function') {
      toast('无法显示确认对话框，未执行卸载。', 'warning');
      return;
    }
    try {
      dialog = MoleUI.modal({
        title: '确认卸载 ' + names.length + ' 个应用？',
        body: body,
        confirmLabel: '卸载',
        cancelLabel: '取消',
        danger: true,
        onConfirm() {
          startUninstall(permanent.checked);
        },
      });
      syncPermanentCopy();
    } catch (e) {
      // Never fall back to a native prompt for a destructive action.
      toast('无法显示确认对话框，未执行卸载。', 'warning');
    }
  }

  function startUninstall(permanent) {
    if (state.busy) return;
    const names = Array.from(state.selected);
    if (!names.length) { toast('请先选择要卸载的应用。', 'warning'); return; }
    if (!window.MoleBridge || typeof MoleBridge.runJob !== 'function') return;

    const args = ['uninstall'].concat(names);
    if (permanent) args.push('--permanent');

    resetOutput();
    resetResult();
    setLogVisible(true);
    setBusy(true);
    if (state.logPanel) state.logPanel.setState('running', '正在卸载…（Mole 可能会请求一次系统密码）');

    const job = MoleBridge.runJob({
      args: args,
      privileged: true,
      label: permanent ? '永久卸载应用' : '卸载应用',
      onOutput(text) {
        state.outBuf += text;
        if (state.logPanel) state.logPanel.write(stripAnsi(text));
      },
      onExit(info) {
        if (state.job === job) state.job = null;
        setBusy(false);
        if (info && info.cancelled) {
          if (state.logPanel) state.logPanel.setState('idle', '已取消，未做任何改动。');
          showResult({ title: '卸载已取消', badge: { text: '已取消', tone: 'warning' }, subtitle: 'Mole 没有删除任何文件。' });
          toast('已取消卸载。', 'info');
          loadApps(true);
          return;
        }
        if (info && info.error) {
          const message = transportError(info.error);
          if (state.logPanel) state.logPanel.setState('error', message);
          showResult({ title: '卸载失败', badge: { text: '错误', tone: 'danger' }, subtitle: message });
          toast(message, 'danger');
          loadApps(true);
          return;
        }
        const parsed = parseUninstallText(state.outBuf);
        const failed = parsed.failedNote || (parsed.incomplete && /incomplete/i.test(parsed.title || ''));
        const success = !!(info && info.code === 0) && !failed;
        if (success) {
          state.selected.clear();
          if (state.logPanel) state.logPanel.setState('success', parsed.title || '卸载完成。');
          showResult({
            title: '卸载完成',
            badge: { text: '完成', tone: 'success' },
            subtitle: permanent ? '应用已永久删除，无法从废纸篓恢复。' : '应用与相关文件已移到废纸篓，可在废纸篓中恢复。',
            stats: [
              { label: '已处理应用', value: String(parsed.removed == null ? names.length : parsed.removed), tone: 'success', sub: '个' },
              { label: '释放/预计释放', value: parsed.freed || '—', tone: 'success' },
              { label: '删除方式', value: permanent ? '永久' : '废纸篓', sub: permanent ? '不可恢复' : '可恢复' },
            ],
            chips: chipsFromText(state.outBuf),
          });
          toast('卸载完成。', 'success');
        } else {
          if (state.logPanel) state.logPanel.setState('error', parsed.title || '卸载未完成。');
          showResult({
            title: parsed.title || '卸载未完成',
            badge: { text: (info && info.code === 0) ? '部分完成' : '退出码 ' + (info ? info.code : '?'), tone: 'danger' },
            subtitle: parsed.failedNote || 'Mole CLI 返回了非零状态，请查看下方日志。',
            stats: [
              { label: '已处理应用', value: String(parsed.removed == null ? '—' : parsed.removed), sub: '个' },
              { label: '释放/预计释放', value: parsed.freed || '—' },
              { label: '删除方式', value: permanent ? '永久' : '废纸篓' },
            ],
            chips: chipsFromText(state.outBuf),
          });
          toast('卸载未完成，请查看日志。', 'danger');
        }
        loadApps(true);
      },
    });
    state.job = job;
  }

  function chipsFromText(text) {
    const parsed = parseUninstallText(text);
    if (parsed.apps.length) return parsed.apps;
    return selectedChips();
  }

  function applyScenario() {
    if (state.scenarioApplied || !state.ctx) return;
    const scenario = state.ctx.scenario;
    if (!scenario || scenario === 'default') { state.scenarioApplied = true; return; }
    if (state.loading || state.error || !state.apps.length) return;
    state.scenarioApplied = true;

    if (scenario === 'preview' || scenario === 'running' || scenario === 'selected') {
      // Prefer the default list order so a screenshot shows checked rows, and
      // keep a deterministic fallback for a filtered/short list.
      const visible = filteredApps().slice(0, 3).map((app) => app.uninstall_name);
      const wanted = visible.length ? visible : SCENARIO_NAMES.filter((name) => state.apps.some((app) => app.uninstall_name === name));
      const pool = wanted.length ? wanted : state.apps.slice(0, 3).map((app) => app.uninstall_name);
      pool.forEach((name) => state.selected.add(name));
      renderTable();
      setTimeout(() => {
        if (scenario === 'preview') startPreview();
        else if (scenario === 'running') {
          // Mock mode only: exercise the privileged job UI without a native bridge.
          if (state.selected.size) startUninstall(false);
        }
      }, 30);
    }
  }

  /* ---------- screen module ---------- */

  function render(root, ctx) {
    state.root = root;
    state.ctx = ctx || {};
    injectStyle();

    const existing = root.querySelector(':scope > .ud');
    if (existing) existing.remove();

    const container = h('div', 'ud');
    root.appendChild(container);
    if (!root.closest('[data-screen="uninstall"]')) {
      root.setAttribute('data-screen', 'uninstall');
      state.fallbackDataScreen = true;
    }

    container.appendChild(buildToolbar());

    // Result summary sits directly under the toolbar so a preview or run
    // summary is visible without scrolling past the whole app table.
    const result = h('div', 'ud-card ud-result ud-hidden');
    state.refs.result = result;
    container.appendChild(result);

    state.refs.tableArea = h('div');
    container.appendChild(state.refs.tableArea);
    renderTable();

    state.logPanel = makeLogPanel('卸载日志', '预览与卸载命令的原始输出');
    state.refs.logEl = state.logPanel.element;
    state.refs.logEl.classList.add('ud-log', 'ud-hidden');
    container.appendChild(state.refs.logEl);

    setLogVisible(false);
    loadApps(false);
  }

  function refresh() {
    if (state.busy || state.loading) return;
    loadApps(false);
  }

  function unmount() {
    if (state.job && typeof state.job.cancel === 'function') {
      try { state.job.cancel(); } catch (e) { /* no-op */ }
    }
    if (state.listJob && typeof state.listJob.cancel === 'function') {
      try { state.listJob.cancel(); } catch (e) { /* no-op */ }
    }
    state.job = null;
    state.listJob = null;
    state.busy = false;
    state.selected.clear();
    if (state.fallbackDataScreen && state.root) {
      state.root.removeAttribute('data-screen');
      state.fallbackDataScreen = false;
    }
    state.root = null;
    state.ctx = null;
    state.refs = {};
  }

  if (window.MoleScreens && typeof MoleScreens.register === 'function') {
    MoleScreens.register('uninstall', {
      title: '卸载',
      subtitle: '预览后卸载应用，默认移入废纸篓可恢复',
      icon: 'trash',
      render: render,
      refresh: refresh,
      unmount: unmount,
    });
  }
})();
