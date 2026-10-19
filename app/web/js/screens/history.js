/* Mole GUI — 历史 screen.
 *
 * Loads `history --json --limit 100` and renders the operation sessions as a
 * dense table with command/date/search filters, expandable action details,
 * JSON export and a reveal-in-Finder shortcut for the log directory.
 */
(function () {
  'use strict';

  const STYLE_ID = 'mole-screen-history-style';

  const state = {
    root: null,
    ctx: null,
    data: null,
    sessions: [],
    logs: {},
    loading: true,
    error: '',
    query: '',
    command: 'all',
    range: 'all',
    expanded: new Set(),
    fallbackDataScreen: false,
    loadJob: null,
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
    const span = h('span', 'hs-icon');
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

  function stripAnsi(text) {
    if (window.MoleUI && typeof MoleUI.stripAnsi === 'function') {
      try { return MoleUI.stripAnsi(text); } catch (e) { /* fall through */ }
    }
    return String(text == null ? '' : text)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b[@-Z\\-_]/g, '');
  }

  function readyInfo() {
    // bridge.js caches the last `ready` event on MoleBridge.state.
    const bridge = window.MoleBridge;
    if (bridge && bridge.state && typeof bridge.state === 'object') return bridge.state;
    return null;
  }

  function logsDirectory() {
    const ready = readyInfo();
    if (ready && ready.paths && ready.paths.logs) return String(ready.paths.logs);
    const operations = state.logs && state.logs.operations;
    if (operations) {
      const index = String(operations).lastIndexOf('/');
      if (index > 0) return String(operations).slice(0, index);
    }
    return '';
  }

  /* ---------- styles ---------- */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* This screen re-renders its own panes frequently; skip the shell's
   one-shot entry fade so state changes never flash or double-animate. */
[data-screen="history"] > * { animation: none !important; }
[data-screen="history"] .hs {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
[data-screen="history"] .hs-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
[data-screen="history"] .hs-toolbar {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
[data-screen="history"] .hs-rowline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
[data-screen="history"] .hs-search {
  position: relative;
  flex: 1 1 220px;
  min-width: 170px;
  display: flex;
  align-items: center;
}
[data-screen="history"] .hs-search .hs-icon {
  position: absolute;
  left: 10px;
  display: flex;
  color: var(--text-muted);
  pointer-events: none;
}
[data-screen="history"] .hs-search .input {
  width: 100%;
  height: 34px;
  padding: 0 10px 0 32px;
  font-size: 13px;
}
[data-screen="history"] .hs-select {
  height: 34px;
  min-width: 132px;
  font-size: 12.5px;
  padding: 0 10px;
}
[data-screen="history"] .hs-seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  flex: none;
}
[data-screen="history"] .hs-seg button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12.5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 160ms ease-out, color 160ms ease-out;
}
[data-screen="history"] .hs-seg button:hover { color: var(--text); }
[data-screen="history"] .hs-seg button.active { background: var(--accent-soft); color: var(--text); }
[data-screen="history"] .hs-spacer { flex: 1 1 auto; }
[data-screen="history"] .hs-count { font-size: 12.5px; color: var(--text-secondary); }
[data-screen="history"] .hs-count strong { color: var(--text); }
[data-screen="history"] .hs-scroll {
  max-height: 560px;
  overflow: auto;
  scrollbar-width: thin;
}
[data-screen="history"] .hs-grid {
  display: grid;
  grid-template-columns: 148px 112px 68px 86px 76px 108px 26px;
  gap: 12px;
  align-items: center;
  padding: 0 14px;
}
[data-screen="history"] .hs-thead {
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
[data-screen="history"] .hs-num { text-align: right; }
[data-screen="history"] .hs-tr {
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 160ms ease-out;
}
[data-screen="history"] .hs-tr:hover { background: var(--bg-hover); }
[data-screen="history"] .hs-tr.open { background: var(--bg-hover); }
[data-screen="history"] .hs-time {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-screen="history"] .hs-cmd { display: flex; align-items: center; min-width: 0; }
[data-screen="history"] .hs-num-cell {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-screen="history"] .hs-status { display: flex; align-items: center; gap: 6px; min-width: 0; }
[data-screen="history"] .hs-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: transform 160ms ease-out;
}
[data-screen="history"] .hs-tr.open .hs-chevron { transform: rotate(90deg); color: var(--accent); }
[data-screen="history"] .hs-detail {
  padding: 4px 14px 16px 44px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(167,139,250,.045), transparent 70%);
}
[data-screen="history"] .hs-detail-inner {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-elevated);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
[data-screen="history"] .hs-acts { display: flex; flex-wrap: wrap; gap: 6px; }
[data-screen="history"] .hs-act {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 11.5px;
  color: var(--text-secondary);
}
[data-screen="history"] .hs-act b { font-family: var(--mono); font-weight: 600; color: var(--text); font-size: 12px; }
[data-screen="history"] .hs-act.removed b { color: var(--success); }
[data-screen="history"] .hs-act.trashed b { color: var(--cyan); }
[data-screen="history"] .hs-act.skipped b { color: var(--text-muted); }
[data-screen="history"] .hs-act.failed b { color: var(--danger); }
[data-screen="history"] .hs-act.rebuilt b { color: var(--accent); }
[data-screen="history"] .hs-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 18px;
  font-size: 12px;
  color: var(--text-secondary);
}
[data-screen="history"] .hs-kv-item { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
[data-screen="history"] .hs-kv-label { font-size: 10.5px; color: var(--text-muted); }
[data-screen="history"] .hs-kv-value {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-screen="history"] .hs-muted { color: var(--text-muted); font-style: normal; }
[data-screen="history"] .hs-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 20px;
  color: var(--text-muted);
  font-size: 12.5px;
  text-align: center;
}
[data-screen="history"] .hs-spinner-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12.5px;
}
[data-screen="history"] .hs-foot {
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
[data-screen="history"] .hs-logpath {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
  min-width: 0;
}
`;
    document.head.appendChild(style);
  }

  /* ---------- data helpers ---------- */

  function parseHistoryJson(text) {
    const clean = stripAnsi(text);
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) { /* fall through */ }
    return null;
  }

  function normalizeSession(raw) {
    const session = raw && typeof raw === 'object' ? raw : {};
    const actions = session.actions && typeof session.actions === 'object' ? session.actions : {};
    const num = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      command: String(session.command || 'unknown'),
      run_id: String(session.run_id || ''),
      attribution: String(session.attribution || ''),
      started_at: String(session.started_at || ''),
      ended_at: String(session.ended_at || ''),
      items: num(session.items),
      size: String(session.size || '0B'),
      operation_count: num(session.operation_count),
      failed_tasks: num(session.failed_tasks),
      actions: {
        removed: num(actions.removed),
        trashed: num(actions.trashed),
        skipped: num(actions.skipped),
        failed: num(actions.failed),
        rebuilt: num(actions.rebuilt),
        other: num(actions.other),
      },
    };
  }

  function parseSessionTime(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function commandTone(command) {
    switch (String(command).toLowerCase()) {
      case 'clean': return 'success';
      case 'uninstall': return 'warning';
      case 'optimize': return 'info';
      case 'purge': return 'accent';
      case 'analyze':
      case 'analyse': return 'info';
      default: return 'neutral';
    }
  }

  function commandOptions() {
    const seen = new Set();
    const options = [];
    state.sessions.forEach((session) => {
      if (!seen.has(session.command)) {
        seen.add(session.command);
        options.push(session.command);
      }
    });
    return options.sort((a, b) => a.localeCompare(b));
  }

  function rangeStart(range) {
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.getTime();
    }
    if (range === '7d') return now.getTime() - 7 * 24 * 3600 * 1000;
    if (range === '30d') return now.getTime() - 30 * 24 * 3600 * 1000;
    return null;
  }

  function filteredSessions() {
    let list = state.sessions.slice();
    if (state.command !== 'all') {
      list = list.filter((session) => session.command === state.command);
    }
    const start = rangeStart(state.range);
    if (start != null) {
      list = list.filter((session) => {
        const time = parseSessionTime(session.started_at);
        return time != null && time.getTime() >= start;
      });
    }
    if (state.query) {
      const needle = state.query;
      list = list.filter((session) => [session.command, session.run_id, session.attribution, session.started_at, session.ended_at]
        .some((value) => String(value || '').toLowerCase().indexOf(needle) >= 0));
    }
    return list;
  }

  function sessionKey(session, index) {
    return session.started_at + '|' + session.command + '|' + index;
  }

  function rowDisplayTime(value) {
    const text = String(value || '');
    if (!text) return '—';
    return text.length > 16 ? text.slice(0, 16) : text;
  }

  /* ---------- rendering ---------- */

  function buildToolbar() {
    const card = h('div', 'hs-card hs-toolbar');

    const row1 = h('div', 'hs-rowline');
    const search = h('div', 'hs-search');
    search.appendChild(iconEl('search', 15));
    const input = h('input', 'input');
    input.type = 'search';
    input.placeholder = '搜索命令、run_id 或时间…';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      state.query = input.value.trim().toLowerCase();
      renderTable();
    });
    search.appendChild(input);
    row1.appendChild(search);

    const select = h('select', 'select hs-select');
    select.addEventListener('change', () => {
      state.command = select.value;
      renderTable();
    });
    row1.appendChild(select);

    const seg = h('div', 'hs-seg');
    [
      { key: 'all', label: '全部' },
      { key: 'today', label: '今天' },
      { key: '7d', label: '7 天' },
      { key: '30d', label: '30 天' },
    ].forEach((item) => {
      const b = h('button', item.key === state.range ? 'active' : '', item.label);
      b.type = 'button';
      b.dataset.range = item.key;
      b.addEventListener('click', () => {
        state.range = item.key;
        seg.querySelectorAll('button').forEach((other) => other.classList.toggle('active', other.dataset.range === item.key));
        renderTable();
      });
      seg.appendChild(b);
    });
    row1.appendChild(seg);
    row1.appendChild(h('div', 'hs-spacer'));

    const exportBtn = btn({
      label: '导出 JSON',
      variant: 'ghost',
      size: 'small',
      icon: 'download',
      onClick: () => exportJson(),
    });
    const revealBtn = btn({
      label: '打开日志目录',
      variant: 'ghost',
      size: 'small',
      icon: 'folder',
      onClick: () => revealLogs(),
    });
    const refreshBtn = btn({
      label: '刷新',
      variant: 'ghost',
      size: 'small',
      icon: 'refresh',
      onClick: () => loadHistory(false),
    });
    row1.appendChild(exportBtn);
    row1.appendChild(revealBtn);
    row1.appendChild(refreshBtn);

    const row2 = h('div', 'hs-rowline');
    const count = h('div', 'hs-count');
    row2.appendChild(count);
    row2.appendChild(h('div', 'hs-spacer'));
    const limitBadge = h('span', 'hs-muted');
    row2.appendChild(limitBadge);

    card.appendChild(row1);
    card.appendChild(row2);

    state.refs.searchInput = input;
    state.refs.commandSelect = select;
    state.refs.rangeSeg = seg;
    state.refs.count = count;
    state.refs.limit = limitBadge;
    state.refs.exportBtn = exportBtn;
    state.refs.revealBtn = revealBtn;
    state.refs.refreshBtn = refreshBtn;
    return card;
  }

  function refreshCommandOptions() {
    const select = state.refs.commandSelect;
    if (!select) return;
    select.textContent = '';
    const all = h('option', null, '全部命令');
    all.value = 'all';
    select.appendChild(all);
    commandOptions().forEach((command) => {
      const option = h('option', null, command);
      option.value = command;
      select.appendChild(option);
    });
    const stillThere = Array.from(select.options).some((option) => option.value === state.command);
    select.value = stillThere ? state.command : 'all';
    state.command = select.value;
  }

  function renderLoading() {
    const area = state.refs.tableArea;
    if (!area) return;
    area.textContent = '';
    const card = h('div', 'hs-card');
    const box = h('div', 'hs-state');
    const row = h('div', 'hs-spinner-row');
    row.appendChild(h('span', 'spinner'));
    row.appendChild(h('span', null, '正在读取操作历史…'));
    box.appendChild(row);
    box.appendChild(h('div', 'muted', 'mo history --json --limit 100'));
    card.appendChild(box);
    area.appendChild(card);
  }

  function renderError(message) {
    const area = state.refs.tableArea;
    if (!area) return;
    area.textContent = '';
    const card = h('div', 'hs-card');
    const box = h('div', 'hs-state');
    box.appendChild(iconEl('alert', 26));
    box.appendChild(h('div', null, '无法读取操作历史'));
    box.appendChild(h('div', 'muted', message));
    box.appendChild(btn({ label: '重新加载', variant: 'secondary', size: 'small', icon: 'refresh', onClick: () => loadHistory(false) }));
    card.appendChild(box);
    area.appendChild(card);
  }

  function actChip(label, value) {
    const chip = h('span', 'hs-act ' + label.key);
    chip.appendChild(h('span', null, label.label));
    chip.appendChild(h('b', null, String(value)));
    return chip;
  }

  function buildDetailRow(session) {
    const detail = h('div', 'hs-detail');
    const inner = h('div', 'hs-detail-inner');

    const actions = h('div', 'hs-acts');
    const defs = [
      { key: 'removed', label: '已删除' },
      { key: 'trashed', label: '移入废纸篓' },
      { key: 'skipped', label: '已跳过' },
      { key: 'failed', label: '失败' },
      { key: 'rebuilt', label: '已重建' },
      { key: 'other', label: '其他' },
    ];
    defs.forEach((def) => actions.appendChild(actChip(def, session.actions[def.key])));
    inner.appendChild(actions);

    const kv = h('div', 'hs-kv');
    const pairs = [
      { label: '运行 ID', value: session.run_id || '—' },
      { label: '归属', value: session.attribution || '—' },
      { label: '开始时间', value: session.started_at || '—' },
      { label: '结束时间', value: session.ended_at || '（仍在运行）' },
      { label: '操作记录', value: String(session.operation_count) + ' 条' },
      { label: '失败任务', value: String(session.failed_tasks) + ' 个' },
    ];
    pairs.forEach((pair) => {
      const item = h('div', 'hs-kv-item');
      item.appendChild(h('div', 'hs-kv-label', pair.label));
      const value = h('div', 'hs-kv-value', pair.value);
      value.title = pair.value;
      item.appendChild(value);
      kv.appendChild(item);
    });
    inner.appendChild(kv);
    detail.appendChild(inner);
    return detail;
  }

  function renderTable() {
    const area = state.refs.tableArea;
    if (!area) return;
    if (state.loading) { renderLoading(); updateSummary(); return; }
    if (state.error) { renderError(state.error); updateSummary(); return; }
    area.textContent = '';

    const card = h('div', 'hs-card');
    const list = filteredSessions();
    if (!state.sessions.length) {
      const box = h('div', 'hs-state');
      box.appendChild(iconEl('history', 28));
      box.appendChild(h('div', null, '还没有操作记录'));
      box.appendChild(h('div', 'muted', 'Mole 每次清理、卸载或优化都会写入操作日志，执行一次后即可在这里查看。'));
      box.appendChild(btn({ label: '刷新', variant: 'secondary', size: 'small', icon: 'refresh', onClick: () => loadHistory(false) }));
      card.appendChild(box);
      area.appendChild(card);
      updateSummary();
      return;
    }
    if (!list.length) {
      const box = h('div', 'hs-state');
      box.appendChild(iconEl('search', 26));
      box.appendChild(h('div', null, '没有符合筛选条件的历史记录'));
      box.appendChild(h('div', 'muted', '换个关键词或时间范围试试。'));
      box.appendChild(btn({
        label: '清除筛选',
        variant: 'secondary',
        size: 'small',
        onClick: () => {
          state.query = '';
          state.command = 'all';
          state.range = 'all';
          if (state.refs.searchInput) state.refs.searchInput.value = '';
          if (state.refs.commandSelect) state.refs.commandSelect.value = 'all';
          if (state.refs.rangeSeg) state.refs.rangeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.range === 'all'));
          renderTable();
        },
      }));
      card.appendChild(box);
      area.appendChild(card);
      updateSummary();
      return;
    }

    const scroll = h('div', 'hs-scroll');
    const head = h('div', 'hs-grid hs-thead');
    head.appendChild(h('span', null, '时间'));
    head.appendChild(h('span', null, '命令'));
    head.appendChild(h('span', 'hs-num', '条目'));
    head.appendChild(h('span', 'hs-num', '大小'));
    head.appendChild(h('span', 'hs-num', '操作'));
    head.appendChild(h('span', null, '状态'));
    head.appendChild(h('span', null, ''));
    scroll.appendChild(head);

    list.forEach((session, index) => {
      const key = sessionKey(session, index);
      const isOpen = state.expanded.has(key);
      const row = h('div', 'hs-grid hs-tr' + (isOpen ? ' open' : ''));
      row.dataset.key = key;
      const time = h('div', 'hs-time', rowDisplayTime(session.started_at));
      time.title = session.started_at || '';
      row.appendChild(time);

      const cmd = h('div', 'hs-cmd');
      cmd.appendChild(badgeEl(session.command, commandTone(session.command)));
      row.appendChild(cmd);

      row.appendChild(h('div', 'hs-num-cell', String(session.items)));
      row.appendChild(h('div', 'hs-num-cell', session.size || '0B'));
      row.appendChild(h('div', 'hs-num-cell', String(session.operation_count)));

      const status = h('div', 'hs-status');
      if (session.ended_at) {
        status.appendChild(badgeEl('已完成', 'success'));
      } else {
        status.appendChild(badgeEl('进行中', 'accent'));
      }
      if (session.failed_tasks > 0) status.appendChild(badgeEl(String(session.failed_tasks) + ' 失败', 'danger'));
      row.appendChild(status);

      const chevron = h('span', 'hs-chevron');
      chevron.appendChild(iconEl('chevron-right', 15));
      row.appendChild(chevron);

      row.addEventListener('click', () => {
        if (state.expanded.has(key)) state.expanded.delete(key);
        else state.expanded.add(key);
        renderTable();
      });
      scroll.appendChild(row);
      if (isOpen) scroll.appendChild(buildDetailRow(session));
    });
    card.appendChild(scroll);

    const foot = h('div', 'hs-foot');
    foot.appendChild(h('span', null, '共 ' + state.sessions.length + ' 次会话 · 当前显示 ' + list.length + ' 次'));
    const logPath = logsDirectory();
    const logLabel = h('span', 'hs-logpath');
    logLabel.appendChild(iconEl('terminal', 12));
    const pathText = h('span', null, logPath || '日志目录未知');
    pathText.title = logPath || '';
    logLabel.appendChild(pathText);
    foot.appendChild(logLabel);
    card.appendChild(foot);

    area.appendChild(card);
    updateSummary();
  }

  function updateSummary() {
    const count = state.refs.count;
    if (!count) return;
    count.textContent = '';
    if (state.loading) {
      count.textContent = '正在读取历史…';
    } else if (state.error) {
      count.textContent = '读取失败';
    } else {
      const shown = filteredSessions().length;
      count.appendChild(document.createTextNode('共 '));
      count.appendChild(h('strong', null, String(state.sessions.length)));
      count.appendChild(document.createTextNode(' 次会话 · 显示 '));
      count.appendChild(h('strong', null, String(shown)));
      count.appendChild(document.createTextNode(' 次'));
    }
    if (state.refs.limit) {
      const limit = state.data && state.data.limit ? state.data.limit : 100;
      state.refs.limit.textContent = '最近 ' + limit + ' 条 · 只读操作日志';
    }
    if (state.refs.exportBtn) state.refs.exportBtn.disabled = state.loading || !state.data;
    if (state.refs.revealBtn) state.refs.revealBtn.disabled = !logsDirectory();
    if (state.refs.refreshBtn) state.refs.refreshBtn.disabled = state.loading;
  }

  /* ---------- actions ---------- */

  function exportJson() {
    if (!state.data) { toast('还没有可导出的历史数据。', 'warning'); return; }
    try {
      MoleBridge.post('exportJSON', {
        suggestedName: 'mole-history.json',
        content: JSON.stringify(state.data, null, 2),
      });
      toast('已打开保存对话框。', 'info');
    } catch (e) {
      toast('无法导出历史 JSON。', 'danger');
    }
  }

  function revealLogs() {
    const path = logsDirectory();
    if (!path) { toast('未找到日志目录。', 'warning'); return; }
    try {
      MoleBridge.post('reveal', { path: path });
    } catch (e) {
      toast('无法在 Finder 中显示日志目录。', 'danger');
    }
  }

  function loadHistory(keepExpanded) {
    if (state.loadJob) return;
    state.loading = true;
    state.error = '';
    if (!keepExpanded) state.expanded.clear();
    renderTable();
    let buffer = '';
    const job = MoleBridge.runJob({
      args: ['history', '--json', '--limit', '100'],
      privileged: false,
      label: '读取操作历史',
      onOutput(text) { buffer += text; },
      onExit(info) {
        if (state.loadJob === job) state.loadJob = null;
        state.loading = false;
        if (info && info.cancelled) {
          state.error = '已取消读取操作历史。';
          renderTable();
          return;
        }
        if (info && info.error) {
          state.error = info.error === 'spawn_failed'
            ? '无法启动 Mole CLI，请检查设置中的 CLI 路径。'
            : '读取历史失败：' + info.error;
          renderTable();
          return;
        }
        if (!info || info.code !== 0) {
          state.error = '读取历史失败（退出码 ' + (info ? info.code : '?') + '）。';
          renderTable();
          return;
        }
        const parsed = parseHistoryJson(buffer);
        if (!parsed) {
          state.error = '无法解析历史 JSON 输出。';
          renderTable();
          return;
        }
        state.data = parsed;
        state.logs = parsed.logs && typeof parsed.logs === 'object' ? parsed.logs : {};
        state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions.map(normalizeSession) : [];
        refreshCommandOptions();
        renderTable();
        // Keep the filter UI in sync with the freshly loaded data.
        if (state.refs.commandSelect) state.refs.commandSelect.value = state.command;
      },
    });
    state.loadJob = job;
  }

  /* ---------- screen module ---------- */

  function render(root, ctx) {
    state.root = root;
    state.ctx = ctx || {};
    state.loading = true;
    state.error = '';
    state.query = '';
    state.command = 'all';
    state.range = 'all';
    state.expanded.clear();
    state.data = null;
    state.sessions = [];
    state.logs = {};
    state.refs = {};
    injectStyle();

    const existing = root.querySelector(':scope > .hs');
    if (existing) existing.remove();

    const wrap = h('div', 'hs');
    root.appendChild(wrap);
    if (!root.closest('[data-screen="history"]')) {
      root.setAttribute('data-screen', 'history');
      state.fallbackDataScreen = true;
    }

    wrap.appendChild(buildToolbar());
    state.refs.tableArea = h('div');
    wrap.appendChild(state.refs.tableArea);
    refreshCommandOptions();
    renderTable();
    loadHistory(false);
  }

  function refresh() {
    if (state.loading) return;
    loadHistory(true);
  }

  function unmount() {
    if (state.loadJob && typeof state.loadJob.cancel === 'function') {
      try { state.loadJob.cancel(); } catch (e) { /* no-op */ }
    }
    state.loadJob = null;
    state.expanded.clear();
    if (state.fallbackDataScreen && state.root) {
      state.root.removeAttribute('data-screen');
      state.fallbackDataScreen = false;
    }
    state.root = null;
    state.ctx = null;
    state.refs = {};
  }

  if (window.MoleScreens && typeof MoleScreens.register === 'function') {
    MoleScreens.register('history', {
      title: '历史',
      subtitle: '查看 Mole 每次清理与卸载的操作记录',
      icon: 'history',
      render: render,
      refresh: refresh,
      unmount: unmount,
    });
  }
})();
