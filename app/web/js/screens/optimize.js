/* Mole GUI — Optimize screen.
 *
 * Preview-first: `mo optimize --dry-run` first, then an explicitly confirmed
 * privileged `mo optimize`. Only those two documented argv forms are spawned.
 */
(function () {
  'use strict';

  var SCREEN = 'optimize';
  var instance = null;
  var styleInjected = false;

  /* ------------------------------------------------------------------ *
   * Small utilities (self-contained; no cross-screen dependencies)
   * ------------------------------------------------------------------ */

  function ui() {
    return window.MoleUI || {};
  }

  function bridge() {
    return window.MoleBridge || {};
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function icon(name, size) {
    try {
      if (typeof ui().icon === 'function') return ui().icon(name, size || 16) || '';
    } catch (err) { /* ignore */ }
    return '';
  }

  function stripAnsi(text) {
    var raw = String(text == null ? '' : text);
    try {
      if (typeof ui().stripAnsi === 'function') return ui().stripAnsi(raw);
    } catch (err) { /* ignore */ }
    return raw
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\u001b[@-Z\\-_]/g, '');
  }

  function notify(ctx, message, tone) {
    var t = tone || 'info';
    try {
      if (ctx && typeof ctx.showToast === 'function') { ctx.showToast(message, t); return; }
    } catch (err) { /* ignore */ }
    try {
      if (typeof ui().toast === 'function') { ui().toast(message, t); return; }
    } catch (err) { /* ignore */ }
  }

  function formatCount(value) {
    var n = Number(value);
    if (!isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  function formatDuration(ms) {
    var total = Math.max(0, Number(ms) || 0);
    if (total < 1000) return Math.round(total) + 'ms';
    var seconds = total / 1000;
    if (seconds < 60) return seconds.toFixed(1) + 's';
    var minutes = Math.floor(seconds / 60);
    var rest = Math.round(seconds % 60);
    return minutes + 'm ' + String(rest).padStart(2, '0') + 's';
  }

  /* Progress-bar ratios only; sizes are already human strings. */

  /* ------------------------------------------------------------------ *
   * Fallback helpers (MoleUI is preferred whenever present)
   * ------------------------------------------------------------------ */

  function button(opts) {
    var options = opts || {};
    try {
      if (typeof ui().button === 'function') {
        var made = ui().button(options);
        if (made) return made;
      }
    } catch (err) { /* fall through */ }
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'btn' + (options.variant ? ' ' + options.variant : '') + (options.size === 'small' ? ' small' : '');
    if (options.icon) node.insertAdjacentHTML('afterbegin', icon(options.icon, options.size === 'small' ? 14 : 15));
    var label = document.createElement('span');
    label.textContent = options.label || '';
    node.appendChild(label);
    node.disabled = !!options.disabled;
    if (options.title) node.title = options.title;
    node.addEventListener('click', function () { if (!node.disabled && typeof options.onClick === 'function') options.onClick(); });
    return node;
  }

  function card(opts) {
    var options = opts || {};
    try {
      if (typeof ui().card === 'function') {
        var made = ui().card(options);
        if (made) return made;
      }
    } catch (err) { /* fall through */ }
    var node = el('div', 'card' + (options.className ? ' ' + options.className : ''));
    if (options.title || options.subtitle || (options.actions && options.actions.length)) {
      var head = el('div', 'card-header');
      var copy = el('div', 'opt-card-copy');
      if (options.title) copy.appendChild(el('div', 'card-title', options.title));
      if (options.subtitle) copy.appendChild(el('div', 'card-subtitle', options.subtitle));
      head.appendChild(copy);
      if (options.actions && options.actions.length) {
        var actions = el('div', 'row opt-card-actions');
        options.actions.forEach(function (action) { if (action) actions.appendChild(action); });
        head.appendChild(actions);
      }
      node.appendChild(head);
    }
    var body = el('div', 'card-body');
    if (options.body instanceof Node) body.appendChild(options.body);
    else if (options.body) body.textContent = String(options.body);
    node.appendChild(body);
    return node;
  }

  function logPanel(opts) {
    var options = opts || {};
    try {
      if (typeof ui().logPanel === 'function') {
        var made = ui().logPanel(options);
        if (made && made.element) return made;
      }
    } catch (err) { /* fall through */ }
    var root = el('div', 'log-panel');
    var head = el('div', 'log-head', options.title || '运行日志');
    var body = el('div', 'log-body');
    root.appendChild(head);
    root.appendChild(body);
    return {
      element: root,
      write: function (text) {
        var raw = String(text == null ? '' : text);
        if (!raw) return;
        var lines = raw.split(/\r?\n/);
        var nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 48;
        for (var i = 0; i < lines.length; i += 1) {
          body.appendChild(el('div', 'log-line', lines[i]));
        }
        while (body.childNodes.length > 4000) body.removeChild(body.firstChild);
        if (nearBottom) root.scrollTop = root.scrollHeight;
      },
      reset: function () { clear(body); },
      setState: function (state, text) { head.textContent = text || state || options.title || '运行日志'; },
      setProgress: function () { },
      setCollapsed: function (value) {
        body.hidden = !!value;
        root.classList.toggle('collapsed', !!value);
      },
    };
  }

  function modal(opts) {
    var options = opts || {};
    var backdrop = null;
    function close() {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        if (typeof options.onCancel === 'function') options.onCancel();
        close();
      }
    }
    backdrop = el('div', 'modal-backdrop');
    var dialog = el('div', 'modal opt-modal');
    var title = el('div', 'modal-title', options.title || '');
    var body = el('div', 'modal-body');
    if (options.body instanceof Node) body.appendChild(options.body);
    else if (options.body) body.textContent = String(options.body);
    var actions = el('div', 'modal-actions');
    var cancelLabel = options.cancelLabel === undefined ? '取消' : options.cancelLabel;
    if (cancelLabel) {
      actions.appendChild(button({
        label: cancelLabel,
        variant: 'secondary',
        onClick: function () {
          if (typeof options.onCancel === 'function') options.onCancel();
          close();
        },
      }));
    }
    actions.appendChild(button({
      label: options.confirmLabel || '确认',
      variant: options.danger ? 'danger' : 'primary',
      onClick: function () {
        if (typeof options.onConfirm === 'function') options.onConfirm();
        close();
      },
    }));
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) {
        if (typeof options.onCancel === 'function') options.onCancel();
        close();
      }
    });
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    return { close: close, backdrop: backdrop };
  }

  function openModal(opts) {
    var options = opts || {};
    try {
      if (typeof ui().modal === 'function') {
        var made = ui().modal(options);
        if (made) return made;
      }
    } catch (err) { /* fall through */ }
    return modal(options);
  }

  function emptyState(opts) {
    var options = opts || {};
    try {
      if (typeof ui().emptyState === 'function') {
        var made = ui().emptyState(options);
        if (made) return made;
      }
    } catch (err) { /* fall through */ }
    var node = el('div', 'empty-state');
    var glyph = el('div', 'empty-state-icon');
    glyph.innerHTML = icon(options.icon || 'wand', 28);
    node.appendChild(glyph);
    node.appendChild(el('div', 'empty-state-title', options.title || '暂无内容'));
    if (options.hint) node.appendChild(el('div', 'empty-state-hint', options.hint));
    if (options.actionLabel) node.appendChild(button({ label: options.actionLabel, variant: 'primary', onClick: options.onAction }));
    return node;
  }

  function badge(text, tone) {
    return el('span', 'badge' + (tone ? ' ' + tone : ''), text);
  }

  function setBadge(node, text, tone) {
    if (!node) return;
    node.textContent = text;
    node.className = 'badge' + (tone ? ' ' + tone : '');
  }

  /* ------------------------------------------------------------------ *
   * Optimize output parsing
   * ------------------------------------------------------------------ */

  var ITEM_RE = /^([→⊙◎✓\-⚠])\s*(.+)$/;

  function classifyOptimizeResult(marker, text) {
    var t = String(text == null ? '' : text).toLowerCase();
    if (/unavailable|not available/.test(t)) return 'unavailable';
    if (marker === '⚠' || marker === '-') return 'attention';
    if (/not readable|skipped|close these apps|manual review|check directory|full disk access|test mode/.test(t)) return 'skipped';
    if (/already|no .*(found|bottleneck)|nothing|healthy|optimal|\bvalid\b|\bclean\b/.test(t)) return 'unchanged';
    if (/refreshed|rebuilt|optimized|verified|repaired|flushed|enabled|updated|cleaned|removed|applied/.test(t)) return 'applied';
    return 'unknown';
  }

  function parseOptimizeLocal(rawText) {
    var text = String(rawText == null ? '' : rawText);
    var lines = text.split(/\r?\n/);
    var result = {
      title: '',
      dryRun: false,
      applied: null,
      keyStat: '',
      counts: { unchanged: 0, skipped: 0, unavailable: 0, attention: 0, failed: 0 },
      system: null,
      diagnosis: [],
      sections: [],
      raw: text,
    };

    var current = null;
    var inSummary = false;
    for (var index = 0; index < lines.length; index += 1) {
      var trimmed = lines[index].replace(/\r$/, '').trim();
      if (!trimmed) continue;

      var sys = trimmed.match(/System\s+(\d+)\/(\d+)\s*GB RAM(?:\s*\|\s*(\d+)\/(\d+)\s*GB Disk)?(?:\s*\|\s*Uptime\s+(\S+))?/i);
      if (sys) {
        result.system = {
          ramUsed: Number(sys[1]),
          ramTotal: Number(sys[2]),
          diskUsed: sys[3] ? Number(sys[3]) : null,
          diskTotal: sys[4] ? Number(sys[4]) : null,
          uptime: sys[5] || '',
        };
      }

      if (/DRY RUN MODE/i.test(trimmed)) result.dryRun = true;

      if (/^-{5,}$/.test(trimmed) || /^={5,}$/.test(trimmed)) {
        inSummary = !inSummary;
        continue;
      }

      if (inSummary) {
        if (/Dry Run Complete/i.test(trimmed)) result.title = 'Dry Run Complete';
        else if (/Optimization Complete/i.test(trimmed)) result.title = 'Optimization Complete';
        var appliedLine = trimmed.match(/(?:Would apply|Applied)\s+(\d+)\s+optimizations?(?:,\s*(.+))?$/i);
        if (appliedLine) {
          result.applied = Number(appliedLine[1]);
          result.keyStat = (appliedLine[2] || '').replace(/[.。]$/, '').trim();
        }
        var countRe = /(\d+)\s+(unchanged|skipped|unavailable|need attention|failed)\b/gi;
        var match;
        while ((match = countRe.exec(trimmed))) {
          var key = match[2].toLowerCase().replace('need attention', 'attention');
          result.counts[key] = Number(match[1]);
        }
        continue;
      }

      var sectionMatch = trimmed.match(/^➤\s*(.+)$/);
      if (sectionMatch) {
        current = { name: sectionMatch[1].trim(), items: [] };
        result.sections.push(current);
        continue;
      }

      if (current) {
        var itemMatch = trimmed.match(ITEM_RE);
        if (itemMatch) {
          var itemText = itemMatch[2].trim();
          current.items.push({
            marker: itemMatch[1],
            text: itemText,
            outcome: classifyOptimizeResult(itemMatch[1], itemText),
          });
        }
        continue;
      }

      if (/^[✓⚠]\s+/.test(trimmed)) {
        result.diagnosis.push(trimmed.replace(/^[✓⚠]\s+/, ''));
      }
    }

    result.sections.forEach(function (section) {
      section.outcome = taskOutcome(section);
    });
    return result;
  }

  function taskOutcome(section) {
    var outcomes = (section.items || []).map(function (item) { return item.outcome; });
    if (!outcomes.length) return 'unknown';
    if (outcomes.indexOf('attention') !== -1) return 'attention';
    if (outcomes.indexOf('applied') !== -1) return 'applied';
    if (outcomes.indexOf('skipped') !== -1) return 'skipped';
    if (outcomes.indexOf('unavailable') !== -1) return 'unavailable';
    if (outcomes.indexOf('unchanged') !== -1) return 'unchanged';
    return 'unknown';
  }

  function parseOptimizeOutput(text) {
    var parsers = window.MoleParsers || {};
    var candidate = null;
    try {
      if (typeof parsers.parseOptimizePreview === 'function') candidate = parsers.parseOptimizePreview(text);
      else if (parsers.optimize && typeof parsers.optimize.preview === 'function') candidate = parsers.optimize.preview(text);
      else if (typeof parsers.optimizePreview === 'function') candidate = parsers.optimizePreview(text);
    } catch (err) { candidate = null; }
    if (candidate && Array.isArray(candidate.sections) && candidate.sections.length) {
      return normalizeParsedOptimize(candidate, text);
    }
    return parseOptimizeLocal(text);
  }

  // Convert ui-core's MoleParsers.parseOptimizePreview shape into this screen's
  // render shape; summary counts and system info come from the local parser.
  function normalizeParsedOptimize(parsed, raw) {
    var local = parseOptimizeLocal(raw);
    var out = local;

    var sections = [];
    (parsed.sections || []).forEach(function (section) {
      if (/diagnosis|诊断/i.test(section.name || '')) {
        (section.items || []).forEach(function (item) {
          var text = String((item && (item.label || item.text)) || '').trim();
          if (text && out.diagnosis.indexOf(text) === -1) out.diagnosis.push(text);
        });
        return;
      }
      var items = [];
      (section.items || section.entries || []).forEach(function (item) {
        if (!item) return;
        var marker = item.mark != null ? item.mark : item.kind === 'warn' ? '◎'
          : item.kind === 'review' ? '⊙'
            : item.kind === 'ok' ? '✓'
              : item.kind === 'error' ? '✗' : '→';
        if (!marker) return;
        var text;
        if (item.label != null || item.detail != null) {
          var label = String(item.label || '').trim();
          var detail = String(item.detail || '').trim();
          text = label + (detail ? ' · ' + detail : '');
        } else {
          var itemText = String(item.text || '');
          var match = itemText.match(/^([→⊙◎✓\-✗⚠])\s*(.+)$/);
          if (match) { marker = match[1]; text = match[2].trim(); } else { text = itemText.trim(); }
        }
        if (!text) return;
        items.push({ marker: marker, text: text, outcome: classifyOptimizeResult(marker, text) });
      });
      if (!items.length) {
        var localMatch = null;
        local.sections.forEach(function (candidate) {
          if (!localMatch && candidate.name === section.name) localMatch = candidate;
        });
        if (localMatch && localMatch.items.length) items = localMatch.items;
      }
      var next = { name: section.name || '未命名任务', items: items };
      next.outcome = taskOutcome(next);
      sections.push(next);
    });
    if (sections.length) out.sections = sections;

    if (parsed.applied != null) out.applied = parsed.applied;
    else if (parsed.applyCount != null) out.applied = parsed.applyCount;
    if (parsed.unchanged != null) out.counts.unchanged = parsed.unchanged;
    if (parsed.skipped != null) out.counts.skipped = parsed.skipped;
    if (parsed.unavailable != null) out.counts.unavailable = parsed.unavailable;
    out.dryRun = !!parsed.dryRun || out.dryRun;
    return out;
  }

  function parseOptimizeExecution(text) {
    var parsed = parseOptimizeOutput(text);
    var raw = String(text == null ? '' : text);
    var applied = raw.match(/Applied\s+(\d+)\s+optimizations?(?:,\s*(.+))?$/im);
    if (applied) {
      parsed.applied = Number(applied[1]);
      parsed.keyStat = (applied[2] || '').replace(/[.。]$/, '').trim();
    }
    var failed = raw.match(/(\d+)\s+failed\b/i);
    if (failed) parsed.counts.failed = Number(failed[1]);
    return parsed;
  }

  /* ------------------------------------------------------------------ *
   * Scoped styles
   * ------------------------------------------------------------------ */

  var CSS = ''
    + '[data-screen="optimize"] .opt-screen{display:flex;flex-direction:column;gap:16px;max-width:1120px}[data-screen="optimize"] .opt-screen{animation:none}[data-screen="optimize"] [hidden]{display:none!important}'
    + '[data-screen="optimize"] .opt-hero{overflow:hidden;position:relative}'
    + '[data-screen="optimize"] .opt-hero::before{content:"";position:absolute;inset:-40% 35% auto -12%;height:220px;background:radial-gradient(closest-side,rgba(34,211,238,.12),transparent 70%);pointer-events:none}'
    + '[data-screen="optimize"] .opt-hero-top{display:flex;align-items:flex-start;gap:16px;position:relative}[data-screen="optimize"] .opt-hero.is-compact .opt-hero-desc{display:none}[data-screen="optimize"] .opt-hero.is-compact .opt-steps{display:none}[data-screen="optimize"] .opt-hero.is-compact .opt-hero-top{align-items:center}[data-screen="optimize"] .opt-run{gap:10px}[data-screen="optimize"] .opt-result-host:empty{display:none}'
    + '[data-screen="optimize"] .opt-hero-glyph{flex:0 0 auto;width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:rgba(34,211,238,.12);color:var(--cyan);border:1px solid rgba(34,211,238,.22)}'
    + '[data-screen="optimize"] .opt-hero-copy{flex:1 1 auto;min-width:0}'
    + '[data-screen="optimize"] .opt-hero-title{font-size:17px;font-weight:600;letter-spacing:.2px;color:var(--text)}'
    + '[data-screen="optimize"] .opt-hero-desc{margin-top:5px;font-size:12.5px;line-height:1.65;color:var(--text-secondary);max-width:640px}'
    + '[data-screen="optimize"] .opt-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}'
    + '[data-screen="optimize"] .opt-steps{display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-top:16px;padding-top:13px;border-top:1px solid var(--border)}'
    + '[data-screen="optimize"] .opt-step{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-step-num{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(34,211,238,.12);color:var(--cyan);font-size:10.5px;font-weight:600}'
    + '[data-screen="optimize"] .opt-step b{color:var(--text-secondary);font-weight:500}'
    + '[data-screen="optimize"] .opt-admin-note{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:13px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);line-height:1.5}'
    + '[data-screen="optimize"] .opt-admin-note svg{flex:0 0 auto;color:var(--warning)}'
    + '[data-screen="optimize"] .opt-run[hidden]{display:none}'
    + '[data-screen="optimize"] .opt-run-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
    + '[data-screen="optimize"] .opt-run-title{font-size:13.5px;font-weight:600;color:var(--text)}'
    + '[data-screen="optimize"] .opt-elapsed{font-family:var(--mono);font-size:11.5px;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-lastline-label{color:var(--text-muted);margin-right:8px;font-family:var(--font);font-size:10.5px;letter-spacing:.3px}[data-screen="optimize"] .opt-lastline-value{color:var(--text-secondary)}[data-screen="optimize"] .opt-lastline{margin-top:8px;font-family:var(--mono);font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:16px}'
    + '[data-screen="optimize"] .opt-run .log-panel{margin-top:10px}'
    + '[data-screen="optimize"] .opt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}'
    + '[data-screen="optimize"] .opt-stat{padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}'
    + '[data-screen="optimize"] .opt-stat .stat-value{font-size:24px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="optimize"] .opt-stat .stat-value.is-accent{color:var(--accent)}'
    + '[data-screen="optimize"] .opt-stat .stat-value.is-success{color:var(--success)}'
    + '[data-screen="optimize"] .opt-stat .stat-value.is-warning{color:var(--warning)}'
    + '[data-screen="optimize"] .opt-stat .stat-value.is-muted{color:var(--text-secondary)}'
    + '[data-screen="optimize"] .opt-stat .stat-label{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-stat .stat-sub{font-size:11.5px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="optimize"] .opt-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
    + '[data-screen="optimize"] .opt-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);font-size:11.5px;color:var(--text-secondary);font-family:var(--mono)}'
    + '[data-screen="optimize"] .opt-chip svg{color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-diagnosis{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)}'
    + '[data-screen="optimize"] .opt-diagnosis svg{flex:0 0 auto;color:var(--success)}'
    + '[data-screen="optimize"] .opt-stale{font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px}'
    + '[data-screen="optimize"] .opt-task{border-top:1px solid var(--border)}'
    + '[data-screen="optimize"] .opt-task:first-child{border-top:0}'
    + '[data-screen="optimize"] .opt-task-inner{display:flex;align-items:flex-start;gap:11px;padding:11px 6px}'
    + '[data-screen="optimize"] .opt-task-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--text-muted);margin-top:6px}'
    + '[data-screen="optimize"] .opt-task--applied .opt-task-dot{background:var(--accent)}'
    + '[data-screen="optimize"] .opt-task--unchanged .opt-task-dot{background:var(--success);opacity:.55}'
    + '[data-screen="optimize"] .opt-task--skipped .opt-task-dot{background:var(--warning)}'
    + '[data-screen="optimize"] .opt-task--attention .opt-task-dot{background:var(--danger)}'
    + '[data-screen="optimize"] .opt-task-main{flex:1 1 auto;min-width:0}'
    + '[data-screen="optimize"] .opt-task-name{display:flex;align-items:center;gap:8px;font-size:12.8px;font-weight:500;color:var(--text)}'
    + '[data-screen="optimize"] .opt-task-line{display:flex;align-items:baseline;gap:8px;margin-top:4px;font-size:12px;color:var(--text-secondary);line-height:1.5}'
    + '[data-screen="optimize"] .opt-task-line .opt-line-glyph{flex:0 0 auto;color:var(--text-muted);font-family:var(--mono);font-size:11px;position:relative;top:-1px}'
    + '[data-screen="optimize"] .opt-task-line .opt-line-text{min-width:0;overflow-wrap:anywhere}'
    + '[data-screen="optimize"] .opt-task--skipped .opt-line-text,[data-screen="optimize"] .opt-task--unavailable .opt-line-text{color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-card-empty{display:flex;align-items:center;justify-content:center;min-height:210px}'
    + '[data-screen="optimize"] .opt-card-empty .empty-state{padding:26px 20px}[data-screen="optimize"] .opt-idle-info{margin-top:0}[data-screen="optimize"] .opt-idle-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 10px}[data-screen="optimize"] .opt-idle-chip{display:inline-flex;align-items:center;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);font-size:11.5px;color:var(--text-secondary)}[data-screen="optimize"] .opt-idle-note{font-size:11.5px;line-height:1.6;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-result{padding:0}'
    + '[data-screen="optimize"] .opt-result-head{display:flex;align-items:center;gap:12px;padding:16px 20px 0}'
    + '[data-screen="optimize"] .opt-result-glyph{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
    + '[data-screen="optimize"] .opt-result.success .opt-result-glyph{background:rgba(52,211,153,.12);color:var(--success)}'
    + '[data-screen="optimize"] .opt-result.warning .opt-result-glyph{background:rgba(251,191,36,.12);color:var(--warning)}'
    + '[data-screen="optimize"] .opt-result.danger .opt-result-glyph{background:rgba(248,113,113,.12);color:var(--danger)}'
    + '[data-screen="optimize"] .opt-result.info .opt-result-glyph{background:var(--accent-soft);color:var(--accent)}'
    + '[data-screen="optimize"] .opt-result-title{font-size:15px;font-weight:600;color:var(--text)}'
    + '[data-screen="optimize"] .opt-result-sub{font-size:12px;color:var(--text-muted);margin-top:2px}'
    + '[data-screen="optimize"] .opt-result-body{padding:14px 20px 18px}'
    + '[data-screen="optimize"] .opt-result-stats{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;margin-bottom:12px}'
    + '[data-screen="optimize"] .opt-result-stat{border:1px solid var(--border);background:var(--bg);border-radius:10px;padding:8px 12px;min-width:110px}'
    + '[data-screen="optimize"] .opt-result-stat .k{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-result-stat .v{margin-top:2px;font-family:var(--mono);font-size:13px;color:var(--text)}'
    + '[data-screen="optimize"] .opt-result-lines{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary);margin-bottom:12px}'
    + '[data-screen="optimize"] .opt-result-lines .mono{font-family:var(--mono);font-size:11.5px;color:var(--text-muted);word-break:break-all}'
    + '[data-screen="optimize"] .opt-result-hint{font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:14px}'
    + '[data-screen="optimize"] .opt-result-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
    + '[data-screen="optimize"] .opt-confirm-lead{font-size:12.5px;line-height:1.7;color:var(--text-secondary);margin:0 0 12px}'
    + '[data-screen="optimize"] .opt-confirm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}'
    + '[data-screen="optimize"] .opt-confirm-grid .k{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="optimize"] .opt-confirm-grid .v{margin-top:2px;font-size:17px;font-weight:600;color:var(--accent)}'
    + '[data-screen="optimize"] .opt-confirm-list{margin:0;padding-left:18px;font-size:12px;line-height:1.75;color:var(--text-secondary)}'
    + '[data-screen="optimize"] .opt-confirm-list li::marker{color:var(--warning)}'
    + '@media (max-width:1180px){[data-screen="optimize"] .opt-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}';

  function injectStyle() {
    if (styleInjected) return;
    if (document.querySelector('style[data-screen-style="' + SCREEN + '"]')) {
      styleInjected = true;
      return;
    }
    var style = document.createElement('style');
    style.setAttribute('data-screen-style', SCREEN);
    style.textContent = CSS;
    document.head.appendChild(style);
    styleInjected = true;
  }

  /* ------------------------------------------------------------------ *
   * Instance
   * ------------------------------------------------------------------ */

  function createInstance(root, ctx) {
    var state = {
      busy: false,
      job: null,
      kind: '',
      jobText: '',
      preview: null,
      previewText: '',
      previewValid: false,
      previewWasValid: false,
      result: null,
      startedAt: 0,
      timer: null,
      lastDuration: 0,
      lastLine: '',
      logCollapsed: false,
      destroyed: false,
      modal: null,
    };

    injectStyle();
    if (root && root.dataset) root.dataset.screen = SCREEN;

    var wrap = el('div', 'opt-screen');
    root.appendChild(wrap);

    /* ---- hero ------------------------------------------------------ */
    var hero = el('div', 'card opt-hero');
    var heroTop = el('div', 'opt-hero-top');
    var glyph = el('div', 'opt-hero-glyph');
    glyph.innerHTML = icon('wand', 22);
    var heroCopy = el('div', 'opt-hero-copy');
    heroCopy.appendChild(el('div', 'opt-hero-title', '优化 macOS 维护任务'));
    heroCopy.appendChild(el('div', 'opt-hero-desc',
      'Mole 按固定清单执行有限的系统维护：刷新 Finder 缓存、修复偏好设置、优化数据库与 Spotlight 索引、刷新 DNS 等。每项任务都会报告执行结果；预览不会修改任何内容。'));
    var actions = el('div', 'opt-actions');
    var btnPreview = button({ label: '预览优化', variant: 'primary', icon: 'play', onClick: runPreview });
    var btnExecute = button({ label: '执行优化', variant: 'danger', icon: 'wand', disabled: true, onClick: openConfirm });
    var btnCancel = button({ label: '取消', variant: 'ghost', icon: 'stop', onClick: cancelJob });
    btnCancel.style.display = 'none';
    actions.appendChild(btnPreview);
    actions.appendChild(btnExecute);
    actions.appendChild(btnCancel);
    heroTop.appendChild(glyph);
    heroTop.appendChild(heroCopy);
    heroTop.appendChild(actions);
    hero.appendChild(heroTop);

    var steps = el('div', 'opt-steps');
    [
      ['1', '预览', '逐项检查将执行或跳过的任务'],
      ['2', '确认', '核对可优化项数量'],
      ['3', '执行', '管理员授权后应用更改'],
    ].forEach(function (step) {
      var row = el('div', 'opt-step');
      row.appendChild(el('span', 'opt-step-num', step[0]));
      var text = el('span', '');
      text.appendChild(el('b', '', step[1] + ' '));
      text.appendChild(document.createTextNode(step[2]));
      row.appendChild(text);
      steps.appendChild(row);
    });
    hero.appendChild(steps);

    var adminNote = el('div', 'opt-admin-note');
    var adminIcon = el('span', '');
    adminIcon.innerHTML = icon('shield', 15);
    adminNote.appendChild(adminIcon);
    adminNote.appendChild(el('span', '', '执行优化需要管理员权限：macOS 会请求一次系统密码，密码只交给系统 sudo，Mole 不保存密码。'));
    hero.appendChild(adminNote);
    wrap.appendChild(hero);

    /* ---- run / log card -------------------------------------------- */
    var runCard = el('div', 'card opt-run');
    runCard.hidden = true;
    var runHead = el('div', 'opt-run-head');
    var runTitle = el('div', 'opt-run-title', '预览优化');
    var runBadge = badge('准备中', 'info');
    var runSpacer = el('div', 'spacer');
    var elapsedEl = el('span', 'opt-elapsed', '');
    var btnCancelSlot = el('span', '');
    btnCancelSlot.appendChild(btnCancel);
    runHead.appendChild(runTitle);
    runHead.appendChild(runBadge);
    runHead.appendChild(runSpacer);
    runHead.appendChild(elapsedEl);
    runHead.appendChild(btnCancelSlot);
    var lastLineEl = el('div', 'opt-lastline');
    var lastLineLabel = el('span', 'opt-lastline-label', '最近输出');
    var lastLineValue = el('span', 'opt-lastline-value', '');
    lastLineEl.appendChild(lastLineLabel);
    lastLineEl.appendChild(lastLineValue);
    var lp = logPanel({ title: '运行日志', hint: 'Mole CLI 原始输出', maxHeight: 300 });
    runCard.appendChild(runHead);
    runCard.appendChild(lastLineEl);
    if (lp.element) runCard.appendChild(lp.element);

    var resultHost = el('div', 'opt-result-host');
    wrap.appendChild(resultHost);
    wrap.appendChild(runCard);
    var summaryHost = el('div', 'opt-summary-host');
    wrap.appendChild(summaryHost);

    /* ---- helpers --------------------------------------------------- */
    function updateButtons() {
      btnPreview.disabled = state.busy;
      btnExecute.disabled = state.busy || !state.previewValid;
      btnCancel.style.display = state.busy ? '' : 'none';
      btnCancel.disabled = false;
    }

    function setBusy(value) {
      state.busy = !!value;
      updateButtons();
      if (!state.busy) stopTimer();
    }

    function startTimer() {
      stopTimer();
      state.startedAt = Date.now();
      elapsedEl.textContent = '0.0s';
      state.timer = window.setInterval(function () {
        if (!state.busy) return;
        elapsedEl.textContent = formatDuration(Date.now() - state.startedAt);
      }, 200);
    }

    function stopTimer() {
      if (state.timer) {
        window.clearInterval(state.timer);
        state.timer = null;
      }
    }

    function setLogCollapsed(value) {
      state.logCollapsed = !!value;
      try {
        if (lp && typeof lp.setCollapsed === 'function') lp.setCollapsed(state.logCollapsed);
        else if (lp && lp.element) {
          var body = lp.element.querySelector('.log-body');
          if (body) body.hidden = state.logCollapsed;
        }
      } catch (err) { /* ignore */ }
    }

    function renderIdle() {
      hero.classList.remove('is-compact');
      clear(summaryHost);
      var emptyCard = el('div', 'card opt-card-empty');
      emptyCard.appendChild(emptyState({
        icon: 'wand',
        title: '还没有优化预览',
        hint: '点击「预览优化」检查维护任务；预览只读取状态，不会修改任何设置。',
        actionLabel: '预览优化',
        onAction: runPreview,
      }));
      summaryHost.appendChild(emptyCard);

      var info = el('div', 'card opt-idle-info');
      info.appendChild(el('div', 'card-title', '维护任务范围'));
      info.appendChild(el('div', 'card-subtitle', 'Mole 的优化清单是固定且有限的，每个任务都会报告执行结果。'));
      var chips = el('div', 'opt-idle-chips');
      ['Finder 缓存', '偏好设置修复', '数据库优化', 'Spotlight 索引', '网络与 DNS 缓存', '维护脚本'].forEach(function (name) {
        chips.appendChild(el('span', 'opt-idle-chip', name));
      });
      info.appendChild(chips);
      info.appendChild(el('div', 'opt-idle-note', '不适用的任务会被跳过；执行前会再确认一次，并请求一次管理员授权。'));
      summaryHost.appendChild(info);
    }

    function renderPreviewError(title, hint) {
      clear(summaryHost);
      var emptyCard = el('div', 'card opt-card-empty');
      emptyCard.appendChild(emptyState({
        icon: 'alert',
        title: title,
        hint: hint,
        actionLabel: '重新预览',
        onAction: runPreview,
      }));
      summaryHost.appendChild(emptyCard);
    }

    function outcomeMeta(outcome) {
      switch (outcome) {
        case 'applied': return { tone: 'accent', label: '可优化' };
        case 'unchanged': return { tone: 'neutral', label: '未变化' };
        case 'skipped': return { tone: 'warning', label: '跳过' };
        case 'unavailable': return { tone: 'neutral', label: '不可用' };
        case 'attention': return { tone: 'danger', label: '需处理' };
        default: return { tone: 'neutral', label: '' };
      }
    }

    function statCard(label, value, sub, tone) {
      var node = el('div', 'card opt-stat');
      node.appendChild(el('div', 'stat-label', label));
      node.appendChild(el('div', 'stat-value' + (tone ? ' is-' + tone : ''), value));
      node.appendChild(el('div', 'stat-sub', sub || ''));
      return node;
    }

    function renderPreview(preview) {
      hero.classList.add('is-compact');
      clear(summaryHost);
      var host = el('div', '');
      host.style.display = 'flex';
      host.style.flexDirection = 'column';
      host.style.gap = '16px';
      summaryHost.appendChild(host);

      if (state.result) {
        var stale = el('div', 'opt-stale');
        var staleIcon = el('span', '');
        staleIcon.innerHTML = icon('info', 13);
        stale.appendChild(staleIcon);
        stale.appendChild(el('span', '', '以下结果来自执行前的预览，可能已经过期。'));
        host.appendChild(stale);
      }

      var appliedLabel = preview.title === 'Optimization Complete' ? '已应用' : '可优化';
      var stats = el('div', 'opt-stats');
      stats.appendChild(statCard(appliedLabel, preview.applied == null ? '—' : formatCount(preview.applied), 'Mole 任务结果', 'accent'));
      stats.appendChild(statCard('未变化', formatCount(preview.counts.unchanged), '已经处于最佳状态', 'success'));
      stats.appendChild(statCard('已跳过', formatCount(preview.counts.skipped), '策略或环境跳过', 'warning'));
      stats.appendChild(statCard('不可用', formatCount(preview.counts.unavailable), '当前系统不支持', 'muted'));
      if (preview.counts.attention > 0) {
        stats.appendChild(statCard('需处理', formatCount(preview.counts.attention), '需要你手动确认', 'warning'));
      }
      if (preview.counts.failed > 0) {
        stats.appendChild(statCard('失败', formatCount(preview.counts.failed), '任务执行失败', 'warning'));
      }
      host.appendChild(stats);

      var metaCard = el('div', 'card');
      var metaBody = el('div', '');
      metaBody.style.display = 'flex';
      metaBody.style.alignItems = 'center';
      metaBody.style.gap = '14px';
      metaBody.style.flexWrap = 'wrap';

      var chips = el('div', 'opt-meta');
      if (preview.system) {
        chips.appendChild(optChip('cpu', '内存 ' + preview.system.ramUsed + '/' + preview.system.ramTotal + ' GB'));
        if (preview.system.diskTotal) {
          chips.appendChild(optChip('disk', '磁盘 ' + preview.system.diskUsed + '/' + preview.system.diskTotal + ' GB'));
        }
        if (preview.system.uptime) chips.appendChild(optChip('clock', '已运行 ' + preview.system.uptime));
      }
      if (preview.dryRun) chips.appendChild(optChip('shield', '预览模式'));
      metaBody.appendChild(chips);
      metaBody.appendChild(el('div', 'spacer'));
      if (preview.diagnosis.length) {
        var diag = el('div', 'opt-diagnosis');
        var diagIcon = el('span', '');
        diagIcon.innerHTML = icon('check', 14);
        diag.appendChild(diagIcon);
        diag.appendChild(el('span', '', '性能诊断：' + preview.diagnosis[0]));
        metaBody.appendChild(diag);
      }
      metaCard.appendChild(metaBody);
      host.appendChild(metaCard);

      host.appendChild(buildTasksCard(preview));
    }

    function optChip(iconName, text) {
      var chip = el('span', 'opt-chip');
      var glyph = el('span', '');
      glyph.innerHTML = icon(iconName, 13);
      chip.appendChild(glyph);
      chip.appendChild(document.createTextNode(text));
      return chip;
    }

    function buildTasksCard(preview) {
      var body = el('div', 'opt-tasks');
      if (!preview.sections.length) {
        body.appendChild(el('div', 'opt-stale', '没有解析到任务明细，请展开运行日志查看原始输出。'));
      }
      preview.sections.forEach(function (section) {
        var task = el('div', 'opt-task opt-task--' + section.outcome);
        var inner = el('div', 'opt-task-inner');
        inner.appendChild(el('span', 'opt-task-dot'));
        var main = el('div', 'opt-task-main');
        var nameRow = el('div', 'opt-task-name');
        nameRow.appendChild(el('span', '', section.name));
        var meta = outcomeMeta(section.outcome);
        if (section.outcome === 'skipped' || section.outcome === 'unavailable' || section.outcome === 'attention') {
          nameRow.appendChild(badge(meta.label, meta.tone === 'danger' ? 'danger' : meta.tone));
        }
        main.appendChild(nameRow);
        section.items.forEach(function (item) {
          var line = el('div', 'opt-task-line');
          line.appendChild(el('span', 'opt-line-glyph', '›'));
          line.appendChild(el('span', 'opt-line-text', item.text));
          main.appendChild(line);
        });
        inner.appendChild(main);
        task.appendChild(inner);
        body.appendChild(task);
      });

      return card({
        title: '任务明细',
        subtitle: preview.sections.length
          ? preview.sections.length + ' 个维护任务 · 按 Mole 输出顺序列出'
          : '暂无任务数据',
        body: body,
        className: 'opt-tasks-card',
      });
    }

    function renderResult(result) {
      clear(resultHost);
      var tone = 'success';
      var glyphName = 'check';
      var title = '优化完成';
      var subtitle = 'Mole 已完成本轮系统维护任务。';
      if (result.cancelled) {
        tone = 'info';
        glyphName = 'x';
        title = '已取消优化';
        subtitle = '任务在完成前被取消，已应用的更改不会回滚。';
      } else if (result.error) {
        tone = 'danger';
        glyphName = 'alert';
        title = '优化未能开始';
        subtitle = result.error === 'auth_failed' ? '密码不正确，请重试。' : '管理员授权或进程启动失败。';
      } else if (result.code !== 0) {
        tone = 'danger';
        glyphName = 'alert';
        title = '优化未完成';
        subtitle = 'Mole 返回了非零退出码，请查看原始日志了解详情。';
      }

      var cardNode = el('div', 'card opt-result ' + tone);
      var head = el('div', 'opt-result-head');
      var glyphWrap = el('div', 'opt-result-glyph');
      glyphWrap.innerHTML = icon(glyphName, 18);
      head.appendChild(glyphWrap);
      var headCopy = el('div', '');
      headCopy.appendChild(el('div', 'opt-result-title', title));
      headCopy.appendChild(el('div', 'opt-result-sub', subtitle));
      head.appendChild(headCopy);
      head.appendChild(el('div', 'spacer'));
      head.appendChild(badge(
        result.cancelled ? '已取消' : (result.code === 0 && !result.error ? '成功' : '异常'),
        result.cancelled ? 'info' : (result.code === 0 && !result.error ? 'success' : 'danger')
      ));
      cardNode.appendChild(head);

      var body = el('div', 'opt-result-body');
      var statRow = el('div', 'opt-result-stats');
      function resultStat(key, value) {
        var node = el('div', 'opt-result-stat');
        node.appendChild(el('div', 'k', key));
        node.appendChild(el('div', 'v', value));
        return node;
      }
      statRow.appendChild(resultStat('退出码', result.error ? '—' : String(result.code)));
      statRow.appendChild(resultStat('用时', formatDuration(result.durationMs)));
      if (result.parsed && result.parsed.applied != null) {
        statRow.appendChild(resultStat('已应用优化', formatCount(result.parsed.applied) + ' 项'));
      }
      body.appendChild(statRow);

      var lines = el('div', 'opt-result-lines');
      if (result.parsed) {
        var parts = [];
        ['unchanged', 'skipped', 'unavailable', 'attention', 'failed'].forEach(function (key) {
          if (result.parsed.counts && result.parsed.counts[key] > 0) {
            var labels = { unchanged: '未变化', skipped: '已跳过', unavailable: '不可用', attention: '需处理', failed: '失败' };
            parts.push(result.parsed.counts[key] + ' ' + labels[key]);
          }
        });
        if (result.parsed.keyStat) lines.appendChild(el('div', 'mono', result.parsed.keyStat));
        if (parts.length) lines.appendChild(el('div', 'mono', parts.join(' · ')));
      }
      if (result.error) {
        var hint = result.error === 'auth_failed'
          ? '密码不正确，请重试；Mole 不会保存密码。'
          : result.error === 'auth_cancelled'
            ? '管理员授权被取消，本次没有执行优化。'
            : '无法启动 Mole CLI 进程，请检查设置中的 CLI 路径。';
        lines.appendChild(el('div', 'mono', hint));
      }
      if (lines.childNodes.length) body.appendChild(lines);

      body.appendChild(el('div', 'opt-result-hint',
        result.cancelled
          ? '可以重新预览后再执行；建议在系统空闲时进行优化。'
          : '建议前往概览刷新状态，历史页面记录了本次优化操作。'));

      var actionsRow = el('div', 'opt-result-actions');
      actionsRow.appendChild(button({ label: '再次预览', variant: 'primary', icon: 'refresh', onClick: runPreview }));
      actionsRow.appendChild(button({ label: '查看历史', variant: 'secondary', icon: 'history', onClick: function () { navigate('history'); } }));
      actionsRow.appendChild(button({ label: '刷新概览', variant: 'secondary', icon: 'dashboard', onClick: function () { navigate('dashboard'); } }));
      actionsRow.appendChild(button({
        label: '查看日志',
        variant: 'ghost',
        size: 'small',
        icon: 'terminal',
        onClick: function () {
          setLogCollapsed(false);
          runCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },
      }));
      body.appendChild(actionsRow);
      cardNode.appendChild(body);
      resultHost.appendChild(cardNode);
    }

    function navigate(screen) {
      try {
        if (ctx && typeof ctx.navigate === 'function') { ctx.navigate(screen); return; }
      } catch (err) { /* ignore */ }
      notify(ctx, '无法打开该页面', 'warning');
    }

    /* ---- job orchestration ----------------------------------------- */

    function startJob(kind, options) {
      if (state.busy) { notify(ctx, '已有任务在运行', 'warning'); return; }
      if (!bridge() || typeof bridge().runJob !== 'function') {
        notify(ctx, 'MoleBridge.runJob 不可用', 'danger');
        return;
      }
      var opts = options || {};
      state.previewWasValid = state.previewValid;
      state.kind = kind;
      state.jobText = '';
      state.lastLine = '';
      runCard.hidden = false;
      lastLineValue.textContent = '';
      runTitle.textContent = opts.label || (kind === 'preview' ? '预览优化' : '执行优化');
      setBadge(runBadge, '运行中', 'warning');
      setLogCollapsed(false);
      try { if (lp && typeof lp.reset === 'function') lp.reset(); } catch (err) { /* ignore */ }
      try { if (lp && typeof lp.setState === 'function') lp.setState(opts.privileged ? 'starting' : 'running', opts.privileged ? '等待授权' : '运行中'); } catch (err) { /* ignore */ }
      if (summaryHost && runCard.parentNode === wrap) wrap.insertBefore(runCard, summaryHost);
      if (kind === 'preview') {
        state.previewValid = false;
        clear(resultHost);
      } else {
        clear(resultHost);
      }
      setBusy(true);
      startTimer();
      updateButtons();

      try {
        state.job = bridge().runJob({
          args: opts.args || [],
          privileged: !!opts.privileged,
          label: opts.label || '',
          onStart: function () { },
          onOutput: function (text, stream) {
            if (state.destroyed) return;
            handleOutput(text, stream);
          },
          onExit: function (info) {
            if (state.destroyed) return;
            handleExit(info || {}, kind);
          },
        });
      } catch (err) {
        handleExit({ code: -1, cancelled: false, durationMs: 0, error: 'spawn_failed' }, kind);
        return;
      }
      if (!state.job) {
        handleExit({ code: -1, cancelled: false, durationMs: 0, error: 'spawn_failed' }, kind);
      }
    }

    function handleOutput(text, stream) {
      var clean = stripAnsi(text);
      if (!clean) return;
      state.jobText += clean;
      try { if (lp && typeof lp.write === 'function') lp.write(clean, stream || 'stdout'); } catch (err) { /* ignore */ }
      var lines = clean.split(/\r?\n/);
      for (var index = lines.length - 1; index >= 0; index -= 1) {
        var line = lines[index].trim();
        if (!line) continue;
        if (/^[=\-─]{3,}$/.test(line)) continue;
        if (/^EXIT=\d+$/.test(line)) continue;
        state.lastLine = line;
        break;
      }
      lastLineValue.textContent = state.lastLine;
      if (lp && lp.element) lp.element.scrollTop = lp.element.scrollHeight;
    }

    function handleExit(info, kind) {
      if (state.destroyed) return;
      state.job = null;
      stopTimer();
      var durationMs = typeof info.durationMs === 'number' && info.durationMs > 0
        ? info.durationMs
        : Math.max(0, Date.now() - state.startedAt);
      state.lastDuration = durationMs;
      elapsedEl.textContent = formatDuration(durationMs);
      setBusy(false);
      var code = typeof info.code === 'number' ? info.code : -1;
      var cancelled = !!info.cancelled;
      var error = info.error || '';
      var cancelledByAuth = error === 'auth_cancelled';
      var text = state.jobText;

      if (cancelled || cancelledByAuth) {
        setBadge(runBadge, '已取消', 'neutral');
        lastLineValue.textContent = state.lastLine || '任务已取消';
        try { if (lp && typeof lp.setState === 'function') lp.setState('cancelled', '已取消'); } catch (err) { /* ignore */ }
        if (kind === 'preview') {
          state.previewValid = state.previewWasValid && !!state.preview;
          if (state.previewValid) renderPreview(state.preview);
          else renderIdle();
        } else {
          renderResult({ code: code, cancelled: true, durationMs: durationMs, error: '', parsed: null, text: text });
        }
        updateButtons();
        notify(ctx, '已取消', 'info');
        return;
      }

      if (error === 'auth_failed') {
        setBadge(runBadge, '授权失败', 'danger');
        lastLineValue.textContent = '密码不正确，请重试';
        if (kind === 'preview') {
          state.previewValid = state.previewWasValid && !!state.preview;
          if (state.previewValid) renderPreview(state.preview);
          else renderPreviewError('预览未能开始', '密码不正确，请重试；Mole 不会保存密码。');
        } else {
          renderResult({ code: code, cancelled: false, durationMs: durationMs, error: error, parsed: null, text: text });
        }
        updateButtons();
        notify(ctx, '密码不正确，请重试', 'danger');
        return;
      }

      if (error) {
        setBadge(runBadge, '启动失败', 'danger');
        lastLineValue.textContent = '无法启动 Mole CLI';
        if (kind === 'execute') renderResult({ code: code, cancelled: false, durationMs: durationMs, error: error, parsed: null, text: text });
        else renderPreviewError('无法启动 Mole CLI', '请检查设置中的 CLI 路径，或重新检测 CLI。');
        updateButtons();
        notify(ctx, '无法启动 Mole CLI，请检查设置中的 CLI 路径', 'danger');
        return;
      }

      if (code !== 0) {
        setBadge(runBadge, '退出码 ' + code, 'danger');
        if (kind === 'preview') {
          state.previewValid = false;
          renderPreviewError('预览失败（退出码 ' + code + '）', '请展开运行日志查看 Mole 的输出；可以修正后重新预览。');
        } else {
          renderResult({ code: code, cancelled: false, durationMs: durationMs, error: '', parsed: parseOptimizeExecution(text), text: text });
        }
        updateButtons();
        notify(ctx, kind === 'preview' ? '预览失败（退出码 ' + code + '）' : '优化失败（退出码 ' + code + '）', 'danger');
        return;
      }

      setBadge(runBadge, '已完成', 'success');
      try { if (lp && typeof lp.setState === 'function') lp.setState('done', '已完成'); } catch (err) { /* ignore */ }

      if (kind === 'preview') {
        var preview = parseOptimizeOutput(text);
        state.preview = preview;
        state.previewText = text;
        state.previewValid = true;
        renderPreview(preview);
        setLogCollapsed(true);
        updateButtons();
        notify(ctx, '预览完成', 'success');
      } else {
        var parsed = parseOptimizeExecution(text);
        state.result = { code: code, durationMs: durationMs, parsed: parsed, text: text };
        state.previewValid = false;
        renderResult(state.result);
        setLogCollapsed(true);
        if (runCard.parentNode === wrap) wrap.appendChild(runCard);
        updateButtons();
        notify(ctx, '优化完成', 'success');
      }
    }

    function cancelJob() {
      if (!state.busy) return;
      setBadge(runBadge, '正在取消', 'warning');
      btnCancel.disabled = true;
      try {
        if (state.job && typeof state.job.cancel === 'function') state.job.cancel();
        else if (typeof bridge().post === 'function' && state.job && state.job.jobId) {
          bridge().post('cancel', { jobId: state.job.jobId });
        }
      } catch (err) { /* ignore */ }
    }

    function runPreview() {
      if (state.busy) return;
      clear(summaryHost);
      startJob('preview', { args: ['optimize', '--dry-run'], privileged: false, label: '预览优化' });
    }

    function runExecute() {
      if (state.busy || !state.previewValid) return;
      startJob('execute', { args: ['optimize'], privileged: true, label: '执行优化' });
    }

    function openConfirm() {
      if (state.busy || !state.previewValid) return;
      var preview = state.preview;
      var body = el('div', 'opt-confirm');
      body.appendChild(el('p', 'opt-confirm-lead',
        '将执行 mo optimize，应用预览中列出的系统维护任务。部分任务会刷新缓存、重建索引或修改系统偏好设置。'));
      var grid = el('div', 'opt-confirm-grid');
      function gridCell(label, value) {
        var cell = el('div', '');
        cell.appendChild(el('div', 'k', label));
        cell.appendChild(el('div', 'v', value));
        return cell;
      }
      grid.appendChild(gridCell('将应用优化', preview && preview.applied != null ? formatCount(preview.applied) + ' 项' : '未知'));
      grid.appendChild(gridCell('已跳过', preview ? formatCount(preview.counts.skipped) + ' 项' : '未知'));
      body.appendChild(grid);
      var list = document.createElement('ul');
      list.className = 'opt-confirm-list';
      [
        'macOS 会请求一次管理员密码；Mole 从不保存密码。',
        '每个维护任务都会报告结果，不适用的任务会跳过。',
        '执行结果会写入 Mole 历史记录。',
      ].forEach(function (text) { list.appendChild(el('li', '', text)); });
      body.appendChild(list);
      state.modal = openModal({
        title: '确认执行优化？',
        body: body,
        confirmLabel: '执行优化',
        cancelLabel: '取消',
        danger: true,
        onConfirm: function () {
          state.modal = null;
          runExecute();
        },
        onCancel: function () { state.modal = null; },
      });
    }

    /* ---- scenario / lifecycle -------------------------------------- */

    function applyScenario() {
      var scenario = ctx && ctx.scenario;
      if (!scenario || scenario === 'default') return;
      if (scenario === 'preview' || scenario === 'running') {
        window.setTimeout(function () {
          if (!state.destroyed) runPreview();
        }, 40);
      }
    }

    function refresh() {
      if (state.busy) {
        notify(ctx, '任务进行中，请稍候', 'warning');
        return;
      }
      runPreview();
    }

    function destroy() {
      state.destroyed = true;
      stopTimer();
      if (state.modal) {
        try { state.modal.close(); } catch (err) { /* ignore */ }
        state.modal = null;
      }
      if (state.job) {
        try {
          if (typeof state.job.cancel === 'function') state.job.cancel();
          else if (typeof bridge().post === 'function' && state.job.jobId) bridge().post('cancel', { jobId: state.job.jobId });
        } catch (err) { /* ignore */ }
        state.job = null;
      }
      clear(resultHost);
      clear(summaryHost);
    }

    renderIdle();
    updateButtons();
    applyScenario();

    return { refresh: refresh, destroy: destroy, state: state };
  }

  /* ------------------------------------------------------------------ *
   * Registry module
   * ------------------------------------------------------------------ */

  var screen = {
    title: '优化',
    subtitle: '预览系统维护任务，再决定是否应用',
    icon: 'wand',
    render: function (root, ctx) {
      if (instance) {
        try { instance.destroy(); } catch (err) { /* ignore */ }
        instance = null;
      }
      if (!root) return;
      instance = createInstance(root, ctx || {});
    },
    refresh: function () {
      if (instance && typeof instance.refresh === 'function') instance.refresh();
    },
    unmount: function () {
      if (instance) {
        try { instance.destroy(); } catch (err) { /* ignore */ }
        instance = null;
      }
    },
  };

  var registered = false;
  function register() {
    if (registered) return;
    if (!window.MoleScreens || typeof window.MoleScreens.register !== 'function') {
      window.setTimeout(register, 30);
      return;
    }
    registered = true;
    window.MoleScreens.register(SCREEN, screen);
  }
  register();
})();
