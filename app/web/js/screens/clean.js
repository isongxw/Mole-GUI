/* Mole GUI — Clean screen.
 *
 * Preview-first workflow: `mo clean --dry-run`, parse the summary + sections,
 * then an explicitly confirmed privileged `mo clean`.
 * Only the two documented argv forms are ever spawned; nothing is deleted here.
 */
(function () {
  'use strict';

  var SCREEN = 'clean';
  var instance = null;
  var styleInjected = false;

  /* ------------------------------------------------------------------ *
   * Small, dependency-free utilities
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

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  var SIZE_UNITS = { B: 1, KB: 1024, MB: Math.pow(1024, 2), GB: Math.pow(1024, 3), TB: Math.pow(1024, 4) };
  var SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB|TB)\b/i;

  function parseSizeText(text) {
    var m = String(text == null ? '' : text).match(SIZE_RE);
    if (!m) return null;
    var value = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(value)) return null;
    return Math.round(value * (SIZE_UNITS[m[2].toUpperCase()] || 1));
  }

  function formatBytes(bytes) {
    if (bytes == null || !isFinite(bytes)) return '—';
    var n = Math.max(0, Math.round(bytes));
    if (n < 1024) return n + 'B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var value = n / 1024;
    var index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    var digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits) + units[index];
  }

  /* ------------------------------------------------------------------ *
   * Fallback helpers used only if ui-core has not provided a helper yet.
   * The documented MoleUI API is preferred in every case.
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
      var copy = el('div', 'clean-card-copy');
      if (options.title) copy.appendChild(el('div', 'card-title', options.title));
      if (options.subtitle) copy.appendChild(el('div', 'card-subtitle', options.subtitle));
      head.appendChild(copy);
      if (options.actions && options.actions.length) {
        var actions = el('div', 'row clean-card-actions');
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
    var collapsed = false;
    return {
      element: root,
      write: function (text) {
        var raw = String(text == null ? '' : text);
        if (!raw) return;
        var lines = raw.split(/\r?\n/);
        var nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 48;
        for (var i = 0; i < lines.length; i += 1) {
          var line = el('div', 'log-line');
          line.textContent = lines[i];
          body.appendChild(line);
        }
        while (body.childNodes.length > 4000) body.removeChild(body.firstChild);
        if (nearBottom) root.scrollTop = root.scrollHeight;
      },
      reset: function () { clear(body); },
      setState: function (state, text) { head.textContent = text || state || options.title || '运行日志'; },
      setProgress: function () { },
      setCollapsed: function (value) {
        collapsed = !!value;
        body.hidden = collapsed;
        root.classList.toggle('collapsed', collapsed);
      },
    };
  }

  function modal(opts) {
    var options = opts || {};
    function close() {
      if (state.modal && state.modal.backdrop && state.modal.backdrop.parentNode) {
        state.modal.backdrop.parentNode.removeChild(state.modal.backdrop);
      }
      document.removeEventListener('keydown', onKey);
      state.modal = null;
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        if (typeof options.onCancel === 'function') options.onCancel();
        close();
      }
    }
    var backdrop = el('div', 'modal-backdrop');
    var dialog = el('div', 'modal clean-modal');
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
    var modalState = { close: close, backdrop: backdrop };
    return modalState;
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
    glyph.innerHTML = icon(options.icon || 'broom', 28);
    node.appendChild(glyph);
    node.appendChild(el('div', 'empty-state-title', options.title || '暂无内容'));
    if (options.hint) node.appendChild(el('div', 'empty-state-hint', options.hint));
    if (options.actionLabel) {
      node.appendChild(button({ label: options.actionLabel, variant: 'primary', onClick: options.onAction }));
    }
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
   * Clean preview parser (used when MoleParsers does not expose one)
   * ------------------------------------------------------------------ */

  function cleanItemName(name) {
    return String(name || '')
      .replace(/\s*[·,]\s*(?:would\s+(?:clean|free))\s*$/i, '')
      .replace(/\s*[·,]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseCleanItem(marker, text) {
    var raw = String(text == null ? '' : text).trim();
    var item = {
      marker: marker || '→',
      text: raw,
      name: raw,
      count: 0,
      sizeBytes: 0,
      sizeText: '',
      unknownSize: false,
      atLeast: false,
      note: '',
    };

    if (/at least/i.test(raw)) item.atLeast = true;

    var counted = raw.match(
      /^(.*?)\s*[·,]?\s*(\d[\d,]*)\s+(items?|dirs?|files?)\s*,\s*(?:about\s+|at least\s+)?([\d.,]+\s*[KMGT]?B)\b\s*(.*)$/i
    );
    if (counted) {
      item.name = cleanItemName(counted[1]) || '合计';
      item.count = Number(String(counted[2]).replace(/[^\d]/g, '')) || 0;
      item.sizeText = counted[4].replace(/\s+/g, '');
      item.sizeBytes = parseSizeText(counted[4]) || 0;
      item.note = counted[5].trim();
    } else {
      var would = raw.match(/^(.*?)\s*(?:[·,]\s*)?would\s+(?:clean|free)\s+([\d.,]+\s*[KMGT]?B)\b\s*(.*)$/i);
      if (would) {
        item.name = cleanItemName(would[1]) || '合计';
        item.sizeText = would[2].replace(/\s+/g, '');
        item.sizeBytes = parseSizeText(would[2]) || 0;
        item.note = would[3].trim();
      } else {
        var sized = raw.match(/^(.*?)\s*·?\s*(?:at least\s+)?([\d.,]+\s*[KMGT]?B)\b\s*(.*)$/i);
        if (sized && cleanItemName(sized[1])) {
          item.name = cleanItemName(sized[1]);
          item.sizeText = sized[2].replace(/\s+/g, '');
          item.sizeBytes = parseSizeText(sized[2]) || 0;
          item.note = sized[3].trim();
        } else if (/would\s+(?:clean|free)/i.test(raw)) {
          item.name = cleanItemName(raw.replace(/\s*·?\s*would\s+(?:clean|free)\s*$/i, ''));
          item.unknownSize = true;
        } else {
          var noteSplit = raw.match(/^(.*?)\s*·\s*(skipped.*|review.*|manual.*|not readable.*|check .*|grant .*)$/i);
          if (noteSplit) {
            item.name = cleanItemName(noteSplit[1]);
            item.note = noteSplit[2].trim();
          }
        }
      }
    }

    if (!item.name) item.name = '合计';
    if (item.sizeText && /\+/.test(raw)) item.unknownSize = true;
    if (item.atLeast) item.unknownSize = true;
    return item;
  }

  var SILENT_MARKERS = { '✓': true, '◎': true, '-': true, '⊙': true };

  function parseCleanPreviewLocal(rawText) {
    var text = String(rawText == null ? '' : rawText);
    var lines = text.split(/\r?\n/);
    var result = {
      summary: null,
      freeSpace: null,
      freeSpaceText: '',
      detailListPath: '',
      systemCachesExcluded: false,
      warnings: [],
      sections: [],
      raw: text,
    };

    var current = null;
    for (var index = 0; index < lines.length; index += 1) {
      var trimmed = lines[index].replace(/\r$/, '').trim();
      if (!trimmed) continue;

      if (/System caches need sudo/i.test(trimmed)) result.systemCachesExcluded = true;
      if (/Full Disk Access/i.test(trimmed) && /skipped/i.test(trimmed)) result.warnings.push(trimmed);

      if (!result.freeSpaceText) {
        var free = trimmed.match(/Free space:\s*([\d.,]+\s*[KMGT]?B)/i);
        if (free) {
          result.freeSpaceText = free[1].replace(/\s+/g, '');
          result.freeSpace = parseSizeText(free[1]);
        }
      }

      if (!result.summary) {
        var summary = trimmed.match(
          /Potential space:\s*([^|]+?)\s*\|\s*Items:\s*([\d,]+)\s*\|\s*Categories:\s*([\d,]+)/i
        );
        if (summary) {
          result.summary = {
            spaceText: summary[1].trim(),
            spaceBytes: parseSizeText(summary[1]),
            items: Number(String(summary[2]).replace(/[^\d]/g, '')) || 0,
            categories: Number(String(summary[3]).replace(/[^\d]/g, '')) || 0,
          };
        }
      }

      if (!result.detailListPath) {
        var detail = trimmed.match(/Detailed file list:\s*(\S+)/i);
        if (detail) result.detailListPath = detail[1];
      }

      var sectionMatch = trimmed.match(/^➤\s*(.+)$/);
      if (sectionMatch) {
        current = {
          name: sectionMatch[1].trim(),
          items: [],
          sizeBytes: 0,
          count: 0,
          looseItems: 0,
          unknownSize: false,
          empty: true,
        };
        result.sections.push(current);
        continue;
      }

      if (!current) continue;

      var itemMatch = trimmed.match(/^([→⊙◎✓\-])\s*(.+)$/);
      if (!itemMatch) continue; // indented detail lines (Homebrew paths) stay out of the list

      var item = parseCleanItem(itemMatch[1], itemMatch[2]);
      current.items.push(item);
      current.empty = false;
      if (item.count > 0) current.count += item.count;
      else if (!SILENT_MARKERS[item.marker]) current.looseItems += 1;
      if (item.marker !== '⊙' && item.marker !== '✓') current.sizeBytes += item.sizeBytes;
      if (item.unknownSize) current.unknownSize = true;
    }

    result.sections.forEach(function (section) {
      var actionable = section.items.filter(function (item) { return item.marker !== '✓'; }).length;
      if (section.count > 0) {
        section.itemCountLabel = formatCount(section.count) + (section.looseItems > 0 ? '+' : '') + ' 项';
      } else {
        section.itemCountLabel = actionable > 0 ? actionable + ' 项' : '无内容';
      }
      section.actionable = section.items.some(function (item) {
        return item.marker === '→' || item.marker === '⊙' || item.marker === '◎';
      });
    });

    return result;
  }

  // Returns a stable render shape regardless of which parser version is loaded.
  function parseCleanOutput(text) {
    var parsers = window.MoleParsers || {};
    var candidate = null;
    try {
      if (typeof parsers.parseCleanPreview === 'function') candidate = parsers.parseCleanPreview(text);
      else if (parsers.clean && typeof parsers.clean.preview === 'function') candidate = parsers.clean.preview(text);
      else if (typeof parsers.cleanPreview === 'function') candidate = parsers.cleanPreview(text);
    } catch (err) { candidate = null; }
    if (candidate && Array.isArray(candidate.sections)) {
      var hasData = candidate.sections.length > 0 ||
        candidate.potentialBytes != null ||
        candidate.totalSizeText ||
        (candidate.summary && candidate.summary.totalText);
      if (hasData) return normalizeParsedClean(candidate, text);
    }
    return parseCleanPreviewLocal(text);
  }

  function markerFromKind(kind) {
    if (kind === 'ok') return '✓';
    if (kind === 'review') return '⊙';
    if (kind === 'warn') return '◎';
    if (kind === 'error') return '✗';
    if (kind === 'detail') return '';
    return '→';
  }

  function cleanDetailNote(detail) {
    var text = String(detail == null ? '' : detail).trim();
    if (!text) return '';
    if (/^dry$/i.test(text)) return '';
    text = text.replace(
      /^(?:\d[\d,]*\s+(?:items?|dirs?|files?)\s*,\s*)?(?:about\s+|at least\s+)?[\d.,]+\s*[KMGT]?B(?:\+)?\s*(?:dry)?$/i,
      ''
    );
    text = text.replace(/would\s+(?:clean|free)\s+[\d.,]+\s*[KMGT]?B\s*,?\s*/gi, '');
    text = text.replace(/\s*,?\s*\bdry\b\s*$/i, '');
    text = text.replace(/^[\s,·]+/, '').trim();
    if (/^0\s+protected$/i.test(text)) return '无受保护项';
    if (/^(?:dry|would clean|would free)$/i.test(text)) return '';
    return text;
  }

  // Convert ui-core's MoleParsers.parseCleanPreview shape into this screen's
  // render shape; raw-text-only facts (free space, sudo exclusion) come from
  // the local parser.
  function normalizeParsedClean(parsed, raw) {
    var local = parseCleanPreviewLocal(raw);
    var out = local;

    var sections = [];
    (parsed.sections || []).forEach(function (section) {
      var next = {
        name: section.name || '未命名分类',
        items: [],
        sizeBytes: 0,
        count: 0,
        looseItems: 0,
        unknownSize: false,
        empty: true,
      };
      (section.items || section.entries || []).forEach(function (entry) {
        if (!entry) return;
        var marker = entry.mark != null ? entry.mark : markerFromKind(entry.kind);
        if (entry.kind === 'detail' || !marker) return;

        var item;
        if (entry.label != null || entry.detail != null) {
          var label = String(entry.label || '').trim();
          var detail = String(entry.detail || '').trim();
          item = {
            marker: marker,
            text: label + (detail ? ' · ' + detail : ''),
            name: label || '合计',
            count: entry.count != null ? Number(entry.count) || 0 : 0,
            sizeBytes: entry.sizeBytes != null ? Number(entry.sizeBytes) || 0 : 0,
            sizeText: entry.sizeBytes != null ? formatBytes(entry.sizeBytes) : '',
            unknownSize: !!entry.sizePlus || (entry.wouldClean && entry.sizeBytes == null),
            atLeast: !!entry.sizePlus,
            note: cleanDetailNote(detail),
          };
          var would = label.match(/^Would clean\s+(\d[\d,]*)\s+items?/i);
          if (would) {
            item.name = '合计';
            item.count = Number(would[1].replace(/[^\d]/g, '')) || 0;
          }
        } else {
          var entryText = String(entry.text || entry.label || '');
          var match = entryText.match(/^([→⊙◎✓\-✗⚠])\s*(.+)$/);
          item = parseCleanItem(match ? match[1] : marker, match ? match[2] : entryText);
          if (!item.sizeBytes && entry.bytes != null) {
            item.sizeBytes = entry.bytes;
            if (!item.sizeText && entry.sizeText) item.sizeText = entry.sizeText;
          }
          if (!item.count && entry.items != null) item.count = entry.items;
        }
        if (!item.sizeText && item.sizeBytes > 0) item.sizeText = formatBytes(item.sizeBytes) + (item.unknownSize ? '+' : '');
        if (item.sizeText && /\+$/.test(item.sizeText)) item.unknownSize = true;
        next.items.push(item);
        next.empty = false;
        if (item.count > 0) next.count += item.count;
        else if (!SILENT_MARKERS[item.marker]) next.looseItems += 1;
        if (item.marker !== '⊙' && item.marker !== '✓') next.sizeBytes += item.sizeBytes;
        if (item.unknownSize) next.unknownSize = true;
      });
      if (!next.items.length && local.sections[sections.length] && local.sections[sections.length].items.length) {
        next.items = local.sections[sections.length].items;
        next.empty = false;
        next.items.forEach(function (item) {
          if (item.count > 0) next.count += item.count;
          else if (!SILENT_MARKERS[item.marker]) next.looseItems += 1;
          if (item.marker !== '⊙' && item.marker !== '✓') next.sizeBytes += item.sizeBytes;
          if (item.unknownSize) next.unknownSize = true;
        });
      }
      var actionable = next.items.filter(function (item) { return item.marker !== '✓'; }).length;
      next.itemCountLabel = next.count > 0
        ? formatCount(next.count) + (next.looseItems > 0 ? '+' : '') + ' 项'
        : actionable > 0 ? actionable + ' 项' : '无内容';
      next.actionable = next.items.some(function (item) {
        return item.marker === '→' || item.marker === '⊙' || item.marker === '◎';
      });
      sections.push(next);
    });
    if (sections.length) out.sections = sections;

    var potentialBytes = parsed.potentialBytes != null ? parsed.potentialBytes
      : parsed.totalBytes != null ? parsed.totalBytes : null;
    var oldSummaryTotal = parsed.summary && parsed.summary.totalText
      ? parsed.summary.totalText : parsed.totalSizeText || '';
    var spaceText = '';
    if (local.summary && potentialBytes != null && local.summary.spaceBytes === potentialBytes) {
      spaceText = local.summary.spaceText;
    } else if (oldSummaryTotal) {
      spaceText = oldSummaryTotal;
    } else if (potentialBytes != null) {
      spaceText = formatBytes(potentialBytes) + (parsed.potentialPlus ? '+' : '');
    }
    if (spaceText) {
      out.summary = {
        spaceText: spaceText,
        spaceBytes: potentialBytes != null ? potentialBytes : parseSizeText(spaceText),
        items: parsed.items != null ? parsed.items
          : parsed.summary && parsed.summary.items != null ? parsed.summary.items
            : local.summary ? local.summary.items : 0,
        categories: parsed.categories != null ? parsed.categories
          : parsed.summary && parsed.summary.categories != null ? parsed.summary.categories
            : local.summary ? local.summary.categories : 0,
      };
    }
    var detailPath = parsed.detailFile || parsed.detailListPath || '';
    if (detailPath) out.detailListPath = detailPath;

    if (parsed.freeBytes != null) {
      out.freeSpace = parsed.freeBytes;
      if (!out.freeSpaceText) out.freeSpaceText = formatBytes(parsed.freeBytes);
    }
    out.systemCachesExcluded = !!parsed.sudoSkipped || local.systemCachesExcluded;
    out.raw = raw;
    return out;
  }

  function parseCleanExecution(text) {
    var out = {
      trackedText: '',
      trackedBytes: null,
      items: 0,
      freeText: '',
      deltaText: '',
      note: '',
      complete: false,
      cancelled: false,
    };
    var raw = String(text == null ? '' : text);
    var tracked = raw.match(/Tracked cleanup:\s*([\d.,]+\s*[KMGT]?B\+?)/i);
    if (tracked) {
      out.trackedText = tracked[1].replace(/\s+/g, '');
      out.trackedBytes = parseSizeText(tracked[1]);
    }
    var items = raw.match(/Items cleaned:\s*([\d,]+)/i);
    if (items) out.items = Number(String(items[1]).replace(/[^\d]/g, '')) || 0;
    var free = raw.match(/Free space:\s*([\d.,]+\s*[KMGT]?B)(?:\s*\(([^)]*)\))?/i);
    if (free) {
      out.freeText = free[1].replace(/\s+/g, '');
      out.deltaText = free[2] ? free[2].trim() : '';
    }
    if (/Cleanup complete/i.test(raw) || /Cleanup completed/i.test(raw)) out.complete = true;
    if (/Cleanup cancelled|Cleanup interrupted/i.test(raw)) out.cancelled = true;
    var note = raw.match(/(?:Cleanup|Clean) (?:complete|completed) with warnings[^\n]*/i);
    if (note) out.note = note[0].trim();
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Scoped styles
   * ------------------------------------------------------------------ */

  var CSS = ''
    + '[data-screen="clean"] .clean-screen{display:flex;flex-direction:column;gap:16px;max-width:1120px}[data-screen="clean"] .clean-screen{animation:none}[data-screen="clean"] [hidden]{display:none!important}'
    + '[data-screen="clean"] .clean-hero{overflow:hidden;position:relative}'
    + '[data-screen="clean"] .clean-hero::before{content:"";position:absolute;inset:-40% 40% auto -10%;height:220px;background:radial-gradient(closest-side,rgba(167,139,250,.16),transparent 70%);pointer-events:none}'
    + '[data-screen="clean"] .clean-hero-top{display:flex;align-items:flex-start;gap:16px;position:relative}[data-screen="clean"] .clean-hero.is-compact .clean-hero-desc{display:none}[data-screen="clean"] .clean-hero.is-compact .clean-steps{display:none}[data-screen="clean"] .clean-hero.is-compact .clean-hero-top{align-items:center}[data-screen="clean"] .clean-run{gap:10px}[data-screen="clean"] .clean-result-host:empty,[data-screen="clean"] .clean-banner-host:empty{display:none}'
    + '[data-screen="clean"] .clean-hero-glyph{flex:0 0 auto;width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);border:1px solid rgba(167,139,250,.22)}'
    + '[data-screen="clean"] .clean-hero-copy{flex:1 1 auto;min-width:0}'
    + '[data-screen="clean"] .clean-hero-title{font-size:17px;font-weight:600;letter-spacing:.2px;color:var(--text)}'
    + '[data-screen="clean"] .clean-hero-desc{margin-top:5px;font-size:12.5px;line-height:1.65;color:var(--text-secondary);max-width:620px}'
    + '[data-screen="clean"] .clean-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}'
    + '[data-screen="clean"] .clean-steps{display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-top:16px;padding-top:13px;border-top:1px solid var(--border)}'
    + '[data-screen="clean"] .clean-step{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-step-num{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-size:10.5px;font-weight:600}'
    + '[data-screen="clean"] .clean-step b{color:var(--text-secondary);font-weight:500}'
    + '[data-screen="clean"] .clean-options{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:14px;padding-top:13px;border-top:1px solid var(--border)}'
    + '[data-screen="clean"] .clean-check{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-secondary);cursor:pointer;user-select:none}'
    + '[data-screen="clean"] .clean-check input{width:14px;height:14px;accent-color:var(--accent);cursor:pointer;margin:0}'
    + '[data-screen="clean"] .clean-check span{line-height:1.4}'
    + '[data-screen="clean"] .clean-check .clean-check-tag{font-size:10.5px;color:var(--warning);border:1px solid rgba(251,191,36,.3);background:rgba(251,191,36,.08);border-radius:5px;padding:1px 5px;margin-left:2px}'
    + '[data-screen="clean"] .clean-external{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-secondary);min-width:0}'
    + '[data-screen="clean"] .clean-external .input{height:30px;width:250px;max-width:46vw;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:0 10px;color:var(--text);font-family:var(--mono);font-size:11.5px;outline:none;transition:border-color .16s ease}'
    + '[data-screen="clean"] .clean-external .input:focus{border-color:var(--accent)}'
    + '[data-screen="clean"] .clean-external .input::placeholder{color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-external.invalid .input{border-color:var(--danger)}'
    + '[data-screen="clean"] .clean-hint{font-size:11px;color:var(--text-muted);line-height:1.4}'
    + '[data-screen="clean"] .clean-hint.error{color:var(--danger)}'
    + '[data-screen="clean"] .clean-banner-host:empty{display:none}'
    + '[data-screen="clean"] .clean-banner{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;border:1px solid rgba(251,191,36,.28);background:rgba(251,191,36,.07)}'
    + '[data-screen="clean"] .clean-banner-icon{flex:0 0 auto;display:flex;color:var(--warning)}'
    + '[data-screen="clean"] .clean-banner-copy{flex:1 1 auto;min-width:0}'
    + '[data-screen="clean"] .clean-banner-title{font-size:13px;font-weight:600;color:var(--text)}'
    + '[data-screen="clean"] .clean-banner-desc{margin-top:2px;font-size:12px;line-height:1.5;color:var(--text-secondary)}'
    + '[data-screen="clean"] .clean-run[hidden]{display:none}'
    + '[data-screen="clean"] .clean-run-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
    + '[data-screen="clean"] .clean-run-title{font-size:13.5px;font-weight:600;color:var(--text)}'
    + '[data-screen="clean"] .clean-elapsed{font-family:var(--mono);font-size:11.5px;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-lastline-label{color:var(--text-muted);margin-right:8px;font-family:var(--font);font-size:10.5px;letter-spacing:.3px}[data-screen="clean"] .clean-lastline-value{color:var(--text-secondary)}[data-screen="clean"] .clean-lastline{margin-top:8px;font-family:var(--mono);font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:16px}'
    + '[data-screen="clean"] .clean-run .log-panel{margin-top:10px}'
    + '[data-screen="clean"] .clean-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}'
    + '[data-screen="clean"] .clean-stat{padding:14px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}'
    + '[data-screen="clean"] .clean-stat .stat-value{font-size:24px;font-weight:600;letter-spacing:.2px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="clean"] .clean-stat .stat-value.is-accent{color:var(--accent)}'
    + '[data-screen="clean"] .clean-stat .stat-value.is-success{color:var(--success)}'
    + '[data-screen="clean"] .clean-stat .stat-value.is-cyan{color:var(--cyan)}'
    + '[data-screen="clean"] .clean-stat .stat-label{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-stat .stat-sub{font-size:11.5px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="clean"] .clean-stale{margin-bottom:12px;font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px}'
    + '[data-screen="clean"] .clean-detail-path{margin-bottom:10px;font-family:var(--mono);font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="clean"] .clean-detail-path b{color:var(--text-secondary);font-weight:500}'
    + '[data-screen="clean"] .clean-section{border-top:1px solid var(--border)}'
    + '[data-screen="clean"] .clean-section:first-child{border-top:0}'
    + '[data-screen="clean"] .clean-section-head{display:grid;grid-template-columns:18px minmax(0,1fr) auto 82px;align-items:center;gap:10px;width:100%;padding:9px 6px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px;transition:background .16s ease}'
    + '[data-screen="clean"] .clean-section-head:hover{background:var(--bg-hover)}'
    + '[data-screen="clean"] .clean-chevron{display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);transition:transform .16s ease;transform:rotate(0deg)}'
    + '[data-screen="clean"] .clean-section.open .clean-chevron{transform:rotate(90deg)}'
    + '[data-screen="clean"] .clean-section-name{font-size:12.8px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '[data-screen="clean"] .clean-section.is-empty .clean-section-name{color:var(--text-muted);font-weight:400}'
    + '[data-screen="clean"] .clean-section-count{font-family:var(--mono);font-size:11px;color:var(--text-muted);white-space:nowrap}'
    + '[data-screen="clean"] .clean-section-size{font-family:var(--mono);font-size:11.5px;color:var(--text-secondary);text-align:right;white-space:nowrap}'
    + '[data-screen="clean"] .clean-section-bar{height:3px;margin:0 6px 8px 34px;border-radius:2px;background:rgba(255,255,255,.05);overflow:hidden}'
    + '[data-screen="clean"] .clean-section-bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--accent-strong),var(--accent));opacity:.75}'
    + '[data-screen="clean"] .clean-section.is-empty .clean-section-bar{display:none}'
    + '[data-screen="clean"] .clean-items{padding:2px 6px 10px 34px;display:flex;flex-direction:column}'
    + '[data-screen="clean"] .clean-item{display:flex;align-items:baseline;gap:9px;padding:5px 0;font-size:12px;min-width:0}'
    + '[data-screen="clean"] .clean-item + .clean-item{border-top:1px dashed rgba(255,255,255,.045)}'
    + '[data-screen="clean"] .clean-item-dot{flex:0 0 auto;width:5px;height:5px;border-radius:50%;background:var(--accent);margin-top:1px;position:relative;top:-2px}'
    + '[data-screen="clean"] .clean-item--review .clean-item-dot{background:var(--warning)}'
    + '[data-screen="clean"] .clean-item--skip .clean-item-dot{background:var(--text-muted)}'
    + '[data-screen="clean"] .clean-item--warn .clean-item-dot{background:var(--warning)}'
    + '[data-screen="clean"] .clean-item--noop .clean-item-dot{background:var(--success);opacity:.6}'
    + '[data-screen="clean"] .clean-item-name{color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}'
    + '[data-screen="clean"] .clean-item--skip .clean-item-name,[data-screen="clean"] .clean-item--noop .clean-item-name{color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-item-note{font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'
    + '[data-screen="clean"] .clean-item-meta{margin-left:auto;flex:0 0 auto;font-family:var(--mono);font-size:11px;color:var(--text-muted);white-space:nowrap}'
    + '[data-screen="clean"] .clean-empty-card{display:flex;align-items:center;justify-content:center;min-height:210px}'
    + '[data-screen="clean"] .clean-empty-card .empty-state{padding:26px 20px}[data-screen="clean"] .clean-idle-info{margin-top:0}[data-screen="clean"] .clean-idle-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 10px}[data-screen="clean"] .clean-idle-chip{display:inline-flex;align-items:center;padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);font-size:11.5px;color:var(--text-secondary)}[data-screen="clean"] .clean-idle-note{font-size:11.5px;line-height:1.6;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-result{padding:0}'
    + '[data-screen="clean"] .clean-result-head{display:flex;align-items:center;gap:12px;padding:16px 20px 0}'
    + '[data-screen="clean"] .clean-result-glyph{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}'
    + '[data-screen="clean"] .clean-result.success .clean-result-glyph{background:rgba(52,211,153,.12);color:var(--success)}'
    + '[data-screen="clean"] .clean-result.warning .clean-result-glyph{background:rgba(251,191,36,.12);color:var(--warning)}'
    + '[data-screen="clean"] .clean-result.danger .clean-result-glyph{background:rgba(248,113,113,.12);color:var(--danger)}'
    + '[data-screen="clean"] .clean-result.info .clean-result-glyph{background:var(--accent-soft);color:var(--accent)}'
    + '[data-screen="clean"] .clean-result-title{font-size:15px;font-weight:600;color:var(--text)}'
    + '[data-screen="clean"] .clean-result-sub{font-size:12px;color:var(--text-muted);margin-top:2px}'
    + '[data-screen="clean"] .clean-result-body{padding:14px 20px 18px}'
    + '[data-screen="clean"] .clean-result-stats{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap;margin-bottom:12px}'
    + '[data-screen="clean"] .clean-result-stat{border:1px solid var(--border);background:var(--bg);border-radius:10px;padding:8px 12px;min-width:110px}'
    + '[data-screen="clean"] .clean-result-stat .k{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-result-stat .v{margin-top:2px;font-family:var(--mono);font-size:13px;color:var(--text)}'
    + '[data-screen="clean"] .clean-result-lines{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary);margin-bottom:12px}'
    + '[data-screen="clean"] .clean-result-lines .mono{font-family:var(--mono);font-size:11.5px;color:var(--text-muted);word-break:break-all}'
    + '[data-screen="clean"] .clean-result-hint{font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:14px}'
    + '[data-screen="clean"] .clean-result-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
    + '[data-screen="clean"] .clean-confirm-lead{font-size:12.5px;line-height:1.7;color:var(--text-secondary);margin:0 0 12px}'
    + '[data-screen="clean"] .clean-confirm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}'
    + '[data-screen="clean"] .clean-confirm-grid .k{font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted)}'
    + '[data-screen="clean"] .clean-confirm-grid .v{margin-top:2px;font-size:17px;font-weight:600;color:var(--accent)}'
    + '[data-screen="clean"] .clean-confirm-list{margin:0;padding-left:18px;font-size:12px;line-height:1.75;color:var(--text-secondary)}'
    + '[data-screen="clean"] .clean-confirm-list li::marker{color:var(--warning)}'
    + '[data-screen="clean"] .clean-modal .modal-body{font-size:12.5px}'
    + '@media (max-width:1180px){[data-screen="clean"] .clean-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}';

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
      jobPrivileged: false,
      preview: null,
      previewText: '',
      previewValid: false,
      previewWasValid: false,
      previewPrivileged: false,
      result: null,
      startedAt: 0,
      timer: null,
      lastDuration: 0,
      lastLine: '',
      logCollapsed: false,
      destroyed: false,
      modal: null,
      optSystem: false,
      optDebug: false,
    };

    injectStyle();
    if (root && root.dataset) root.dataset.screen = SCREEN;

    var wrap = el('div', 'clean-screen');
    root.appendChild(wrap);

    /* ---- hero ------------------------------------------------------ */
    var hero = el('div', 'card clean-hero');
    var heroTop = el('div', 'clean-hero-top');
    var glyph = el('div', 'clean-hero-glyph');
    glyph.innerHTML = icon('broom', 22);
    var heroCopy = el('div', 'clean-hero-copy');
    heroCopy.appendChild(el('div', 'clean-hero-title', '清理缓存与临时文件'));
    heroCopy.appendChild(el('div', 'clean-hero-desc',
      'Mole 先扫描并列出可清理的应用缓存、日志与临时文件，确认后再执行清理。删除由 Mole CLI 的安全规则、白名单与保护路径统一处理，界面本身不会删除任何文件。'));
    var actions = el('div', 'clean-actions');
    var btnPreview = button({ label: '预览清理', variant: 'primary', icon: 'play', onClick: function () { runPreview(state.optSystem); } });
    var btnExecute = button({ label: '执行清理', variant: 'danger', icon: 'broom', disabled: true, onClick: openConfirm });
    var btnCancel = button({ label: '取消', variant: 'ghost', icon: 'stop', onClick: cancelJob });
    btnCancel.style.display = 'none';
    actions.appendChild(btnPreview);
    actions.appendChild(btnExecute);
    actions.appendChild(btnCancel);
    heroTop.appendChild(glyph);
    heroTop.appendChild(heroCopy);
    heroTop.appendChild(actions);
    hero.appendChild(heroTop);

    var steps = el('div', 'clean-steps');
    [
      ['1', '预览', '扫描并列出可清理项'],
      ['2', '确认', '核对估算与分类明细'],
      ['3', '清理', '管理员授权后执行'],
    ].forEach(function (step) {
      var row = el('div', 'clean-step');
      row.appendChild(el('span', 'clean-step-num', step[0]));
      var text = el('span', '');
      var strong = el('b', '', step[1] + ' ');
      text.appendChild(strong);
      text.appendChild(document.createTextNode(step[2]));
      row.appendChild(text);
      steps.appendChild(row);
    });
    hero.appendChild(steps);

    var options = el('div', 'clean-options');
    var sysCheck = el('label', 'clean-check');
    var sysInput = document.createElement('input');
    sysInput.type = 'checkbox';
    sysCheck.appendChild(sysInput);
    var sysText = el('span', '', '包含系统缓存预览');
    sysCheck.appendChild(sysText);
    sysCheck.appendChild(el('span', 'clean-check-tag', '需要管理员授权'));
    sysInput.addEventListener('change', function () { state.optSystem = !!sysInput.checked; });

    var debugCheck = el('label', 'clean-check');
    var debugInput = document.createElement('input');
    debugInput.type = 'checkbox';
    debugCheck.appendChild(debugInput);
    debugCheck.appendChild(el('span', '', '调试日志（--debug）'));
    debugInput.addEventListener('change', function () { state.optDebug = !!debugInput.checked; });

    var external = el('label', 'clean-external');
    external.appendChild(el('span', '', '外接磁盘'));
    var extInput = document.createElement('input');
    extInput.type = 'text';
    extInput.className = 'input';
    extInput.placeholder = '/Volumes/备份盘（可选）';
    extInput.spellcheck = false;
    extInput.autocomplete = 'off';
    external.appendChild(extInput);
    var extHint = el('span', 'clean-hint', '可选，仅扫描该磁盘');
    external.appendChild(extHint);
    extInput.addEventListener('input', function () {
      var check = validateExternal(extInput.value);
      external.classList.toggle('invalid', !check.ok && extInput.value.trim() !== '');
      extHint.textContent = check.ok ? '可选，仅扫描该磁盘' : check.reason;
      extHint.classList.toggle('error', !check.ok);
    });

    options.appendChild(sysCheck);
    options.appendChild(debugCheck);
    options.appendChild(external);
    hero.appendChild(options);
    wrap.appendChild(hero);

    /* ---- system-cache banner --------------------------------------- */
    var bannerHost = el('div', 'clean-banner-host');
    wrap.appendChild(bannerHost);

    /* ---- run / log card -------------------------------------------- */
    var runCard = el('div', 'card clean-run');
    runCard.hidden = true;
    var runHead = el('div', 'clean-run-head');
    var runTitle = el('div', 'clean-run-title', '预览清理');
    var runBadge = badge('准备中', 'info');
    var runSpacer = el('div', 'spacer');
    var elapsedEl = el('span', 'clean-elapsed', '');
    var btnCancelSlot = el('span', 'clean-run-cancel');
    btnCancelSlot.appendChild(btnCancel);
    runHead.appendChild(runTitle);
    runHead.appendChild(runBadge);
    runHead.appendChild(runSpacer);
    runHead.appendChild(elapsedEl);
    runHead.appendChild(btnCancelSlot);
    var lastLineEl = el('div', 'clean-lastline');
    var lastLineLabel = el('span', 'clean-lastline-label', '最近输出');
    var lastLineValue = el('span', 'clean-lastline-value', '');
    lastLineEl.appendChild(lastLineLabel);
    lastLineEl.appendChild(lastLineValue);
    var lp = logPanel({ title: '运行日志', hint: 'Mole CLI 原始输出', maxHeight: 300 });
    runCard.appendChild(runHead);
    runCard.appendChild(lastLineEl);
    if (lp.element) runCard.appendChild(lp.element);

    /* ---- result + preview hosts ------------------------------------ */
    var resultHost = el('div', 'clean-result-host');
    wrap.appendChild(resultHost);
    wrap.appendChild(runCard);
    var summaryHost = el('div', 'clean-summary-host');
    wrap.appendChild(summaryHost);

    /* ---- state helpers --------------------------------------------- */
    function updateButtons() {
      btnPreview.disabled = state.busy;
      btnExecute.disabled = state.busy || !state.previewValid;
      btnCancel.style.display = state.busy ? '' : 'none';
      btnCancel.disabled = false;
      sysInput.disabled = state.busy;
      debugInput.disabled = state.busy;
      extInput.disabled = state.busy;
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

    function scrollToBottom() {
      if (lp && lp.element) lp.element.scrollTop = lp.element.scrollHeight;
    }

    function validateExternal(raw) {
      var path = String(raw == null ? '' : raw).trim();
      if (!path) return { ok: true, path: '' };
      if (path.charAt(0) !== '/') return { ok: false, path: path, reason: '请输入以 / 开头的绝对路径' };
      if (path.length > 1024) return { ok: false, path: path, reason: '路径过长' };
      if (/[\u0000-\u001f\u007f]/.test(path)) return { ok: false, path: path, reason: '路径包含不可见字符' };
      if (path === '/') return { ok: false, path: path, reason: '请选择具体磁盘，而不是根目录' };
      if (/(^|\/)\.\.(\/|$)/.test(path)) return { ok: false, path: path, reason: '路径不能包含 ..' };
      return { ok: true, path: path };
    }

    function renderBanner() {
      clear(bannerHost);
      if (!state.preview || state.busy) return;
      if (!state.preview.systemCachesExcluded) return;
      var banner = el('div', 'clean-banner');
      var iconWrap = el('div', 'clean-banner-icon');
      iconWrap.innerHTML = icon('shield', 18);
      banner.appendChild(iconWrap);
      var copy = el('div', 'clean-banner-copy');
      copy.appendChild(el('div', 'clean-banner-title', '系统缓存需要管理员权限'));
      copy.appendChild(el('div', 'clean-banner-desc', '用户级缓存已在下方展示。系统缓存需要一次管理员授权才能纳入预览与清理。'));
      banner.appendChild(copy);
      banner.appendChild(button({
        label: '管理员预览',
        variant: 'secondary',
        icon: 'shield',
        onClick: function () {
          sysInput.checked = true;
          state.optSystem = true;
          runPreview(true);
        },
      }));
      bannerHost.appendChild(banner);
    }

    function renderIdle() {
      hero.classList.remove('is-compact');
      clear(summaryHost);
      var emptyCard = el('div', 'card clean-empty-card');
      emptyCard.appendChild(emptyState({
        icon: 'broom',
        title: '还没有预览结果',
        hint: '点击「预览清理」扫描缓存与临时文件；预览只读取信息，不会删除任何内容。',
        actionLabel: '预览清理',
        onAction: function () { runPreview(state.optSystem); },
      }));
      summaryHost.appendChild(emptyCard);

      var info = el('div', 'card clean-idle-info');
      info.appendChild(el('div', 'card-title', '清理范围与安全边界'));
      info.appendChild(el('div', 'card-subtitle', 'Mole 只清理已知的缓存与临时文件，删除动作由 CLI 的保护规则统一执行。'));
      var chips = el('div', 'clean-idle-chips');
      ['应用缓存', '日志与临时文件', '浏览器缓存', '开发者工具缓存', '应用残留', '虚拟化与大文件'].forEach(function (name) {
        chips.appendChild(el('span', 'clean-idle-chip', name));
      });
      info.appendChild(chips);
      var note = el('div', 'clean-idle-note');
      note.appendChild(el('span', '', '受保护路径、白名单与正在使用的应用缓存会被跳过；系统缓存需要一次管理员授权才会纳入清理。'));
      info.appendChild(note);
      summaryHost.appendChild(info);
    }

    function renderPreviewError(title, hint) {
      clear(summaryHost);
      var emptyCard = el('div', 'card clean-empty-card');
      emptyCard.appendChild(emptyState({
        icon: 'alert',
        title: title,
        hint: hint,
        actionLabel: '重新预览',
        onAction: function () { runPreview(state.optSystem); },
      }));
      summaryHost.appendChild(emptyCard);
    }

    function statCard(label, value, sub, tone) {
      var node = el('div', 'card clean-stat');
      node.appendChild(el('div', 'stat-label', label));
      node.appendChild(el('div', 'stat-value' + (tone ? ' is-' + tone : ''), value));
      node.appendChild(el('div', 'stat-sub', sub || ''));
      return node;
    }

    function renderPreview(preview) {
      hero.classList.add('is-compact');
      clear(summaryHost);
      var host = el('div', 'clean-summary');
      host.style.display = 'flex';
      host.style.flexDirection = 'column';
      host.style.gap = '16px';
      summaryHost.appendChild(host);

      if (state.result) {
        var stale = el('div', 'clean-stale');
        var staleIcon = el('span', '');
        staleIcon.innerHTML = icon('info', 13);
        stale.appendChild(staleIcon);
        stale.appendChild(el('span', '', '以下数据来自清理前的预览估算，执行后请重新预览以获取最新结果。'));
        host.appendChild(stale);
      }

      if (preview.summary) {
        var stats = el('div', 'clean-stats');
        stats.appendChild(statCard('可释放空间', preview.summary.spaceText, 'Mole 估算值', 'accent'));
        stats.appendChild(statCard('清理项', formatCount(preview.summary.items), '待清理文件 / 目录', 'success'));
        stats.appendChild(statCard('分类', formatCount(preview.summary.categories), '扫描分类数', 'cyan'));
        stats.appendChild(statCard('可用空间', preview.freeSpaceText || '未知', '系统盘当前可用', ''));
        host.appendChild(stats);
      } else {
        var degraded = el('div', 'card clean-stat');
        degraded.appendChild(el('div', 'stat-label', '预览摘要'));
        degraded.appendChild(el('div', 'stat-value', '未能解析'));
        degraded.appendChild(el('div', 'stat-sub', '原始日志仍可展开查看，执行按钮已按本次成功预览开放。'));
        host.appendChild(degraded);
      }

      var sectionsCard = buildSectionsCard(preview);
      host.appendChild(sectionsCard);
      renderBanner();
    }

    function buildSectionsCard(preview) {
      var list = el('div', 'clean-section-list');
      var visibleSections = preview.sections.filter(function (section) {
        return section.items.some(function (item) { return item.marker !== '✓'; });
      });
      var hiddenSections = preview.sections.length - visibleSections.length;
      var maxSize = 0;
      visibleSections.forEach(function (section) { if (section.sizeBytes > maxSize) maxSize = section.sizeBytes; });

      var toggleAll = button({
        label: '全部展开',
        variant: 'ghost',
        size: 'small',
        onClick: function () {
          var open = toggleAll.dataset.open !== '1';
          toggleAll.dataset.open = open ? '1' : '0';
          var labelNode = toggleAll.lastChild;
          if (labelNode && labelNode.nodeType === 3) labelNode.textContent = open ? '全部收起' : '全部展开';
          else toggleAll.textContent = open ? '全部收起' : '全部展开';
          list.querySelectorAll('.clean-section').forEach(function (sectionEl) {
            sectionEl.classList.toggle('open', open);
            var items = sectionEl.querySelector('.clean-items');
            if (items) items.hidden = !open;
          });
        },
      });

      var body = el('div', 'clean-section-body');
      if (preview.detailListPath) {
        var detail = el('div', 'clean-detail-path');
        detail.appendChild(document.createTextNode('详细文件列表：'));
        var pathStrong = el('b', '', preview.detailListPath);
        detail.appendChild(pathStrong);
        body.appendChild(detail);
      }
      if (!preview.sections.length) {
        body.appendChild(el('div', 'clean-hint', '没有解析到分类明细，请展开运行日志查看原始输出。'));
      }
      visibleSections.forEach(function (section) {
        var sectionEl = el('div', 'clean-section' + (section.empty ? ' is-empty' : ''));
        var head = document.createElement('button');
        head.type = 'button';
        head.className = 'clean-section-head';
        var chevron = el('span', 'clean-chevron');
        chevron.innerHTML = icon('chevron-right', 14);
        var sizeLabel = section.sizeBytes > 0
          ? formatBytes(section.sizeBytes) + (section.unknownSize ? '+' : '')
          : (section.empty ? '—' : '0B');
        head.appendChild(chevron);
        head.appendChild(el('span', 'clean-section-name', section.name));
        head.appendChild(el('span', 'clean-section-count', section.itemCountLabel));
        head.appendChild(el('span', 'clean-section-size', sizeLabel));

        var bar = el('div', 'clean-section-bar');
        var fill = el('div', 'clean-section-bar-fill');
        var ratio = maxSize > 0 ? Math.max(2, Math.round((section.sizeBytes / maxSize) * 100)) : 0;
        fill.style.width = ratio + '%';
        bar.appendChild(fill);

        var itemsWrap = el('div', 'clean-items');
        itemsWrap.hidden = true;
        section.items.forEach(function (item) {
          itemsWrap.appendChild(renderCleanItem(item));
        });

        head.addEventListener('click', function () {
          var open = !sectionEl.classList.contains('open');
          sectionEl.classList.toggle('open', open);
          itemsWrap.hidden = !open;
        });

        sectionEl.appendChild(head);
        sectionEl.appendChild(bar);
        sectionEl.appendChild(itemsWrap);
        list.appendChild(sectionEl);
      });
      if (hiddenSections > 0) {
        body.appendChild(el('div', 'clean-hint',
          '另有 ' + hiddenSections + ' 个分区本次无需清理（例如“Nothing to clean”），已折叠隐藏。'));
      }
      body.appendChild(list);

      var cardNode = card({
        title: '清理明细',
        subtitle: visibleSections.length
          ? visibleSections.length + ' 个分区 · 展开查看具体条目'
          : '暂无分类数据',
        body: body,
        actions: visibleSections.length ? [toggleAll] : [],
        className: 'clean-sections-card',
      });
      return cardNode;
    }

    function renderCleanItem(item) {
      var tone = 'clean-item--normal';
      if (item.marker === '⊙') tone = 'clean-item--review';
      else if (item.marker === '◎') tone = 'clean-item--skip';
      else if (item.marker === '✓') tone = 'clean-item--noop';
      else if (item.marker === '-') tone = 'clean-item--warn';
      var row = el('div', 'clean-item ' + tone);
      row.appendChild(el('span', 'clean-item-dot'));
      row.appendChild(el('span', 'clean-item-name', item.name));
      if (item.note) row.appendChild(el('span', 'clean-item-note', item.note));
      var metaParts = [];
      if (item.count > 0) metaParts.push(formatCount(item.count) + ' 项');
      if (item.sizeText) metaParts.push((item.atLeast ? '≥ ' : '') + item.sizeText);
      if (metaParts.length) row.appendChild(el('span', 'clean-item-meta', metaParts.join(' · ')));
      return row;
    }

    function renderResult(result) {
      clear(resultHost);
      var tone = 'success';
      var glyphName = 'check';
      var title = '清理完成';
      var subtitle = 'Mole 已按预览执行清理。';
      if (result.cancelled) {
        tone = 'info';
        glyphName = 'x';
        title = '已取消清理';
        subtitle = '任务在完成前被取消，已删除的缓存不会恢复。';
      } else if (result.error) {
        tone = 'danger';
        glyphName = 'alert';
        title = '清理未能开始';
        subtitle = result.error === 'auth_failed' ? '密码不正确，请重试。' : '管理员授权或进程启动失败。';
      } else if (result.code !== 0) {
        tone = 'danger';
        glyphName = 'alert';
        title = '清理未完成';
        subtitle = 'Mole 返回了非零退出码，请查看原始日志了解详情。';
      }

      var cardNode = el('div', 'card clean-result ' + tone);
      var head = el('div', 'clean-result-head');
      var glyphWrap = el('div', 'clean-result-glyph');
      glyphWrap.innerHTML = icon(glyphName, 18);
      head.appendChild(glyphWrap);
      var headCopy = el('div', '');
      headCopy.appendChild(el('div', 'clean-result-title', title));
      headCopy.appendChild(el('div', 'clean-result-sub', subtitle));
      head.appendChild(headCopy);
      head.appendChild(el('div', 'spacer'));
      head.appendChild(badge(result.cancelled ? '已取消' : (result.code === 0 && !result.error ? '成功' : '异常'),
        result.cancelled ? 'info' : (result.code === 0 && !result.error ? 'success' : 'danger')));
      cardNode.appendChild(head);

      var body = el('div', 'clean-result-body');
      var statRow = el('div', 'clean-result-stats');
      function resultStat(key, value) {
        var node = el('div', 'clean-result-stat');
        node.appendChild(el('div', 'k', key));
        node.appendChild(el('div', 'v', value));
        return node;
      }
      statRow.appendChild(resultStat('退出码', result.error ? '—' : String(result.code)));
      statRow.appendChild(resultStat('用时', formatDuration(result.durationMs)));
      if (result.parsed && result.parsed.trackedText) {
        statRow.appendChild(resultStat('已清理空间', result.parsed.trackedText));
      }
      if (result.parsed && result.parsed.items > 0) {
        statRow.appendChild(resultStat('清理项', formatCount(result.parsed.items) + ' 项'));
      }
      body.appendChild(statRow);

      var lines = el('div', 'clean-result-lines');
      if (result.parsed && result.parsed.freeText) {
        lines.appendChild(el('div', 'mono', '可用空间：' + result.parsed.freeText + (result.parsed.deltaText ? '（' + result.parsed.deltaText + '）' : '')));
      }
      if (result.parsed && result.parsed.note) {
        lines.appendChild(el('div', 'mono', result.parsed.note));
      }
      if (result.error) {
        var hint = result.error === 'auth_failed'
          ? '密码不正确，请重试；Mole 不会保存密码。'
          : result.error === 'auth_cancelled'
            ? '管理员授权被取消，本次没有执行清理。'
            : '无法启动 Mole CLI 进程，请检查设置中的 CLI 路径。';
        lines.appendChild(el('div', 'mono', hint));
      }
      if (lines.childNodes.length) body.appendChild(lines);

      body.appendChild(el('div', 'clean-result-hint',
        result.cancelled
          ? '可以重新预览后再执行；建议在系统空闲时进行清理。'
          : '建议前往概览刷新一次，确认新的可用空间；历史页面记录了本次清理操作。'));

      var actionsRow = el('div', 'clean-result-actions');
      actionsRow.appendChild(button({ label: '再次预览', variant: 'primary', icon: 'refresh', onClick: function () { runPreview(state.optSystem); } }));
      actionsRow.appendChild(button({ label: '查看历史', variant: 'secondary', icon: 'history', onClick: function () { navigate('history'); } }));
      actionsRow.appendChild(button({ label: '前往概览', variant: 'secondary', icon: 'dashboard', onClick: function () { navigate('dashboard'); } }));
      actionsRow.appendChild(button({ label: '查看日志', variant: 'ghost', size: 'small', icon: 'terminal', onClick: function () { setLogCollapsed(false); runCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }));
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
      state.jobPrivileged = !!opts.privileged;
      state.result = kind === 'execute' ? null : state.result;
      runCard.hidden = false;
      lastLineValue.textContent = '';
      lastLineEl.style.display = '';
      runTitle.textContent = opts.label || (kind === 'preview' ? '预览清理' : '执行清理');
      setBadge(runBadge, '运行中', 'warning');
      setLogCollapsed(false);
      try { if (lp && typeof lp.reset === 'function') lp.reset(); } catch (err) { /* ignore */ }
      try { if (lp && typeof lp.setState === 'function') lp.setState(opts.privileged ? 'starting' : 'running', opts.privileged ? '等待授权' : '运行中'); } catch (err) { /* ignore */ }
      if (summaryHost && runCard.parentNode === wrap) wrap.insertBefore(runCard, summaryHost);
      if (kind === 'preview') {
        state.previewValid = false;
        clear(bannerHost);
        clear(resultHost);
      } else {
        clear(resultHost);
      }
      setBusy(true);
      startTimer();
      updateButtons();

      var started = false;
      try {
        state.job = bridge().runJob({
          args: opts.args || [],
          privileged: !!opts.privileged,
          label: opts.label || '',
          onStart: function () {
            started = true;
          },
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
        return;
      }
      if (!started && typeof state.job.then === 'function') {
        // Promise-based bridge variants are not part of the contract; ignore.
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
      scrollToBottom();
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
      lastLineEl.style.display = 'none';
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
          renderResult({ code: code, cancelled: true, durationMs: durationMs, error: '', parsed: parseCleanExecution(text), text: text });
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
        else {
          state.previewValid = state.previewWasValid && !!state.preview;
          renderPreviewError('无法启动 Mole CLI', '请检查设置中的 CLI 路径，或重新检测 CLI。');
        }
        updateButtons();
        notify(ctx, '无法启动 Mole CLI，请检查设置中的 CLI 路径', 'danger');
        return;
      }

      if (code !== 0) {
        setBadge(runBadge, '退出码 ' + code, 'danger');
        if (kind === 'preview') {
          state.previewValid = false;
          clear(bannerHost);
          renderPreviewError('预览失败（退出码 ' + code + '）', '请展开运行日志查看 Mole 的输出；可以修正后重新预览。');
        } else {
          renderResult({ code: code, cancelled: false, durationMs: durationMs, error: '', parsed: parseCleanExecution(text), text: text });
        }
        updateButtons();
        notify(ctx, kind === 'preview' ? '预览失败（退出码 ' + code + '）' : '清理失败（退出码 ' + code + '）', 'danger');
        return;
      }

      setBadge(runBadge, '已完成', 'success');
      try { if (lp && typeof lp.setState === 'function') lp.setState('done', '已完成'); } catch (err) { /* ignore */ }

      if (kind === 'preview') {
        var preview = parseCleanOutput(text);
        state.preview = preview;
        state.previewText = text;
        state.previewPrivileged = state.jobPrivileged;
        state.previewValid = true;
        renderBanner(preview);
        renderPreview(preview);
        setLogCollapsed(true);
        updateButtons();
        notify(ctx, '预览完成', 'success');
        if (ctx && ctx.scenario === 'result' && !state.result) {
          window.setTimeout(function () {
            if (!state.destroyed && state.previewValid && !state.busy) {
              startJob('execute', { args: ['clean'], privileged: true, label: '执行清理' });
            }
          }, 120);
        }
      } else {
        var parsed = parseCleanExecution(text);
        state.result = { code: code, durationMs: durationMs, parsed: parsed, text: text };
        state.previewValid = false;
        renderResult(state.result);
        if (state.preview) renderPreview(state.preview);
        setLogCollapsed(true);
        if (runCard.parentNode === wrap) wrap.appendChild(runCard);
        updateButtons();
        notify(ctx, '清理完成', 'success');
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

    function runPreview(privileged) {
      if (state.busy) return;
      var check = validateExternal(extInput.value);
      if (!check.ok) {
        external.classList.add('invalid');
        extHint.textContent = check.reason;
        extHint.classList.add('error');
        notify(ctx, '外接磁盘路径无效：' + check.reason, 'warning');
        return;
      }
      var args = ['clean', '--dry-run'];
      if (state.optDebug) args.push('--debug');
      if (check.path) args.push('--external', check.path);
      var wantPrivileged = !!privileged;
      state.optSystem = wantPrivileged;
      sysInput.checked = wantPrivileged;
      clear(summaryHost);
      startJob('preview', {
        args: args,
        privileged: wantPrivileged,
        label: wantPrivileged ? '管理员预览' : '预览清理',
      });
    }

    function runExecute() {
      if (state.busy || !state.previewValid) return;
      var check = validateExternal(extInput.value);
      if (!check.ok) {
        notify(ctx, '外接磁盘路径无效', 'warning');
        return;
      }
      var args = ['clean'];
      if (state.optDebug) args.push('--debug');
      if (check.path) args.push('--external', check.path);
      startJob('execute', { args: args, privileged: true, label: '执行清理' });
    }

    function openConfirm() {
      if (state.busy || !state.previewValid) return;
      if (state.modal) { try { state.modal.close(); } catch (err) { /* ignore */ } state.modal = null; }
      var preview = state.preview;
      var body = el('div', 'clean-confirm');
      body.appendChild(el('p', 'clean-confirm-lead',
        '将执行 mo clean，删除预览中列出的缓存与临时文件。此操作不可撤销，执行期间可以取消。'));
      var grid = el('div', 'clean-confirm-grid');
      function gridCell(label, value) {
        var cell = el('div', '');
        cell.appendChild(el('div', 'k', label));
        cell.appendChild(el('div', 'v', value));
        return cell;
      }
      grid.appendChild(gridCell('预计释放', preview && preview.summary ? preview.summary.spaceText : '未知'));
      grid.appendChild(gridCell('清理项', preview && preview.summary ? formatCount(preview.summary.items) : '未知'));
      body.appendChild(grid);
      var list = document.createElement('ul');
      list.className = 'clean-confirm-list';
      [
        'macOS 会请求一次管理员密码；Mole 从不保存密码。',
        '受保护路径、白名单与正在使用的应用缓存会被跳过。',
        '清理结果会写入 Mole 历史记录。',
      ].forEach(function (text) {
        list.appendChild(el('li', '', text));
      });
      body.appendChild(list);
      state.modal = openModal({
        title: '确认执行清理？',
        body: body,
        confirmLabel: '执行清理',
        cancelLabel: '取消',
        danger: true,
        onConfirm: function () {
          state.modal = null;
          runExecute();
        },
        onCancel: function () { state.modal = null; },
      });
    }

    /* ---- scenario handling ----------------------------------------- */

    function applyScenario() {
      var scenario = ctx && ctx.scenario;
      if (!scenario || scenario === 'default') return;
      if (scenario === 'preview' || scenario === 'running') {
        window.setTimeout(function () {
          if (!state.destroyed) runPreview(false);
        }, 40);
        return;
      }
      if (scenario === 'result') {
        // Mock-only scenario: preview first, then drive the mocked execution so
        // the completed result card is rendered against real parser output.
        window.setTimeout(function () {
          if (!state.destroyed) runPreview(false);
        }, 40);
      }
    }

    function refresh() {
      if (state.busy) {
        notify(ctx, '任务进行中，请稍候', 'warning');
        return;
      }
      runPreview(state.optSystem);
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
      clear(bannerHost);
    }

    renderIdle();
    updateButtons();
    applyScenario();

    return {
      refresh: refresh,
      destroy: destroy,
      state: state,
    };
  }

  /* ------------------------------------------------------------------ *
   * Registry module
   * ------------------------------------------------------------------ */

  var screen = {
    title: '清理',
    subtitle: '先预览，再清理缓存与临时文件',
    icon: 'broom',
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
