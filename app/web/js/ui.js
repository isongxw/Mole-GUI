/*
 * Mole GUI — shared UI helpers (design system).
 * Implements the MoleUI contract from SPEC.md exactly.
 * Only this file builds markup from UI-authored strings; CLI output must go
 * through textContent (log panels, tables) so it can never inject DOM.
 */
(function () {
  'use strict';

  var ESC = '&amp;';
  var MAX_LOG_BYTES = 400 * 1024;
  var MAX_LOG_LINES = 6000;
  var TOAST_TTL = 3200;

  // ---------------------------------------------------------------- utilities

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripAnsi(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u001b[()][A-Za-z0-9]/g, '')
      .replace(/\u001b[@-_]/g, '')
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, '');
  }

  function el(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(html || '').trim();
    return tpl.content.firstElementChild;
  }

  function appendAll(parent, value) {
    if (value == null || value === '') return parent;
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        appendAll(parent, item);
      });
      return parent;
    }
    if (typeof value === 'string') {
      parent.insertAdjacentHTML('beforeend', value);
      return parent;
    }
    if (value.nodeType) {
      parent.appendChild(value);
      return parent;
    }
    return parent;
  }

  function formatBytes(bytes) {
    if (bytes == null || !isFinite(bytes)) return '—';
    var n = Number(bytes);
    var neg = n < 0;
    n = Math.abs(n);
    var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var unit = 0;
    while (n >= 1024 && unit < units.length - 1) {
      n /= 1024;
      unit += 1;
    }
    var digits;
    if (unit === 0) digits = 0;
    else if (n >= 100) digits = 1;
    else digits = 2;
    var text = n.toFixed(digits);
    if (digits > 0) text = text.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
    return (neg ? '-' : '') + text + ' ' + units[unit];
  }

  function formatNumber(n) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function formatSize(value) {
    if (value == null) return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var text = String(value).trim();
    if (!text) return null;
    if (/^(--|—|-|n\/a|na|unknown|不可用)$/i.test(text)) return null;
    text = text.replace(/,/g, '').replace(/^[~≈]+\s*/, '');
    var m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)(?![A-Za-z])/i);
    if (!m) {
      var plain = text.match(/^(\d+(?:\.\d+)?)$/);
      if (plain) return Math.round(Number(plain[1]));
      return null;
    }
    var n = Number(m[1]);
    if (!isFinite(n)) return null;
    var unit = m[2].toUpperCase();
    var mult = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 }[unit];
    return Math.round(n * mult);
  }

  function timeAgo(input) {
    if (!input) return '—';
    var text = String(input).trim();
    if (!text) return '—';
    var date = new Date(text.indexOf('T') >= 0 ? text : text.replace(' ', 'T'));
    if (isNaN(date.getTime())) date = new Date(text);
    if (isNaN(date.getTime())) return text;
    var diff = Math.max(0, (Date.now() - date.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
    var y = date.getFullYear();
    var mo = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + d;
  }

  function formatDuration(ms) {
    if (ms == null || !isFinite(ms)) return '';
    var s = Math.max(0, ms) / 1000;
    if (s < 10) return s.toFixed(1) + 's';
    if (s < 60) return Math.round(s) + 's';
    var m = Math.floor(s / 60);
    var rest = Math.round(s % 60);
    if (m < 60) return m + 'm ' + rest + 's';
    var h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }

  // ------------------------------------------------------------------- icons

  function icon(name, size) {
    if (window.MoleIcons && typeof window.MoleIcons.icon === 'function') {
      return window.MoleIcons.icon(name, size);
    }
    return '';
  }

  // ------------------------------------------------------------------ buttons

  function button(opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    var variant = opts.variant || 'secondary';
    var classes = ['btn', variant];
    if (opts.size === 'small' || opts.small) classes.push('small');
    if (opts.icon && !opts.label) classes.push('icon-only');
    btn.className = classes.join(' ');
    if (opts.disabled) btn.disabled = true;
    if (opts.title) btn.title = opts.title;
    if (opts.id) btn.id = opts.id;
    var html = '';
    if (opts.icon) html += icon(opts.icon, opts.size === 'small' ? 15 : 16);
    if (opts.label) html += '<span class="btn-label">' + escapeHtml(opts.label) + '</span>';
    btn.innerHTML = html;
    if (opts.icon && !opts.label) {
      btn.setAttribute('aria-label', opts.title || String(opts.icon));
    }
    if (typeof opts.onClick === 'function') {
      btn.addEventListener('click', function (event) {
        if (btn.disabled) return;
        opts.onClick(event);
      });
    }
    return btn;
  }

  // -------------------------------------------------------------------- card

  function card(opts) {
    opts = opts || {};
    var root = document.createElement('section');
    root.className = 'card' + (opts.className ? ' ' + opts.className : '');
    if (opts.title || opts.subtitle || opts.actions) {
      var head = document.createElement('div');
      head.className = 'card-header';
      var text = document.createElement('div');
      text.className = 'card-heading';
      if (opts.title) {
        var title = document.createElement('h3');
        title.className = 'card-title';
        title.textContent = opts.title;
        text.appendChild(title);
      }
      if (opts.subtitle) {
        var sub = document.createElement('p');
        sub.className = 'card-subtitle';
        sub.textContent = opts.subtitle;
        text.appendChild(sub);
      }
      head.appendChild(text);
      if (opts.actions) {
        var actions = document.createElement('div');
        actions.className = 'card-actions';
        appendAll(actions, opts.actions);
        head.appendChild(actions);
      }
      root.appendChild(head);
    }
    // Always provide .card-body so screens can append to it after the fact.
    var body = document.createElement('div');
    body.className = 'card-body';
    appendAll(body, opts.body);
    root.appendChild(body);
    return root;
  }

  // ------------------------------------------------------------ small pieces

  function badge(text, tone) {
    var t = tone || 'neutral';
    var cls = t === 'neutral' ? 'badge' : 'badge ' + t;
    return '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function stat(label, value, sub, tone) {
    var toneCls = tone ? ' tone-' + tone : '';
    return (
      '<div class="stat">' +
      '<div class="stat-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-value' + toneCls + '">' + (value == null ? '—' : escapeHtml(value)) + '</div>' +
      (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') +
      '</div>'
    );
  }

  function chord(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function ring(opts) {
    opts = opts || {};
    var size = opts.size || 132;
    var stroke = 10;
    var r = size / 2 - stroke;
    var c = 2 * Math.PI * r;
    var pct = chord(opts.value);
    var dash = (pct / 100) * c;
    var tone = opts.tone || 'accent';
    var cx = size / 2;
    var color = 'var(--' + ({ accent: 'accent', success: 'success', warning: 'warning', danger: 'danger', cyan: 'cyan', info: 'cyan' }[tone] || 'accent') + ')';
    var number = Math.round(Number(opts.value) || 0);
    return (
      '<div class="ring" style="--ring-size:' + size + 'px">' +
      '<svg class="ring-svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle class="ring-track" cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="ring-arc" cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" ' +
      'stroke-linecap="round" stroke-dasharray="' + dash.toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"/>' +
      '</svg>' +
      '<div class="ring-center">' +
      '<span class="ring-number">' + number + '</span>' +
      (opts.label ? '<span class="ring-label">' + escapeHtml(opts.label) + '</span>' : '') +
      (opts.sublabel ? '<span class="ring-sublabel">' + escapeHtml(opts.sublabel) + '</span>' : '') +
      '</div>' +
      '</div>'
    );
  }

  function progressBar(value, tone) {
    var pct = Number(value);
    if (!isFinite(pct)) pct = 0;
    if (pct > 0 && pct < 1) pct = pct * 100;
    pct = Math.max(0, Math.min(100, pct));
    return (
      '<div class="progress' + (tone ? ' tone-' + tone : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '">' +
      '<div class="progress-bar" style="width:' + pct.toFixed(2) + '%"></div>' +
      '</div>'
    );
  }

  function emptyState(opts) {
    opts = opts || {};
    var root = document.createElement('div');
    root.className = 'empty-state';
    root.innerHTML =
      '<div class="empty-icon">' + icon(opts.icon || 'info', 26) + '</div>' +
      '<h3 class="empty-title">' + escapeHtml(opts.title || '暂无内容') + '</h3>' +
      (opts.hint ? '<p class="empty-hint">' + escapeHtml(opts.hint) + '</p>' : '');
    if (opts.actionLabel) {
      var action = document.createElement('div');
      action.className = 'empty-action';
      action.appendChild(
        button({
          label: opts.actionLabel,
          variant: opts.actionVariant || 'secondary',
          size: 'small',
          onClick: opts.onAction || function () {}
        })
      );
      root.appendChild(action);
    }
    return root;
  }

  // ---------------------------------------------------------------- log panel

  function classifyLine(line) {
    var text = String(line || '');
    var lead = text.replace(/^[\s\u2500-\u257f|]+/, '');
    if (/^[✓✔]/.test(lead)) return 'ok';
    if (/^[✗✘×]/.test(lead)) return 'err';
    if (/^[⚠!]/.test(lead)) return 'warn';
    if (/^[→➤➜›▶]/.test(lead)) return 'info';
    if (/^[◎⊙⚙↳•·]/.test(lead)) return 'dim';
    if (/\b(error|failed|fatal):/i.test(text)) return 'err';
    if (/\bwarn(ing)?:/i.test(text)) return 'warn';
    return '';
  }

  function logPanel(opts) {
    opts = opts || {};
    var maxHeight = opts.maxHeight || 360;
    var root = document.createElement('section');
    root.className = 'log-panel';
    var head = document.createElement('div');
    head.className = 'log-head';
    head.innerHTML =
      '<span class="log-dot"></span>' +
      '<span class="log-title">' + escapeHtml(opts.title || '运行日志') + '</span>' +
      '<span class="log-state">空闲</span>' +
      '<span class="log-hint">' + escapeHtml(opts.hint || '') + '</span>' +
      '<span class="spacer"></span>' +
      '<div class="log-progress progress" hidden><div class="progress-bar"></div></div>' +
      '<div class="log-actions"></div>' +
      '<button type="button" class="log-toggle" title="收起/展开日志" aria-label="收起或展开日志">' + icon('chevron-down', 15) + '</button>';
    var body = document.createElement('div');
    body.className = 'log-body';
    body.style.maxHeight = maxHeight + 'px';
    var empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = '暂无输出';
    body.appendChild(empty);
    root.appendChild(head);
    root.appendChild(body);

    var logState = head.querySelector('.log-state');
    var logTitle = head.querySelector('.log-title');
    var logHint = head.querySelector('.log-hint');
    var logDot = head.querySelector('.log-dot');
    var logActions = head.querySelector('.log-actions');
    var progress = head.querySelector('.log-progress');
    var progressBar = progress.querySelector('.progress-bar');
    var toggle = head.querySelector('.log-toggle');

    var pending = '';
    var totalChars = 0;
    var lineCount = 0;
    var stick = true;
    var state = 'idle';

    toggle.addEventListener('click', function () {
      setCollapsed(!root.classList.contains('collapsed'));
    });

    body.addEventListener('scroll', function () {
      stick = body.scrollHeight - body.scrollTop - body.clientHeight < 48;
    });

    function scrollDown() {
      if (stick) body.scrollTop = body.scrollHeight;
    }

    function ensureEmpty() {
      var hasLine = body.querySelector('.log-line');
      if (!hasLine) {
        if (!empty.parentNode) body.appendChild(empty);
      } else if (empty.parentNode) {
        empty.parentNode.removeChild(empty);
      }
    }

    function trim() {
      if (totalChars <= MAX_LOG_BYTES && lineCount <= MAX_LOG_LINES) return;
      var targetBytes = Math.floor(MAX_LOG_BYTES * 0.8);
      while (body.firstChild && (totalChars > targetBytes || lineCount > MAX_LOG_LINES * 0.8)) {
        var node = body.firstChild;
        if (!node.classList || !node.classList.contains('log-line')) break;
        totalChars -= (node.textContent || '').length;
        lineCount -= 1;
        body.removeChild(node);
      }
    }

    function appendLine(raw) {
      var line = String(raw == null ? '' : raw);
      var lineEl = document.createElement('div');
      var cls = classifyLine(line);
      lineEl.className = 'log-line' + (cls ? ' ' + cls : '');
      lineEl.textContent = line.length ? line : '\u00a0';
      body.appendChild(lineEl);
      totalChars += line.length;
      lineCount += 1;
      ensureEmpty();
      trim();
      scrollDown();
    }

    function flushPending() {
      if (pending) {
        appendLine(pending);
        pending = '';
      }
    }

    function write(text, stream) {
      if (text == null) return;
      var clean = stripAnsi(String(text)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!clean) return;
      pending += clean;
      var idx;
      while ((idx = pending.indexOf('\n')) >= 0) {
        appendLine(pending.slice(0, idx));
        pending = pending.slice(idx + 1);
      }
      if (pending.length > 8192) flushPending();
      if (stream === 'stderr') {
        var last = body.lastElementChild;
        if (last && last.classList && last.classList.contains('log-line') && !last.className.match(/ok|warn|err|info|dim/)) {
          last.classList.add('stderr');
        }
      }
    }

    var STATES = {
      idle: ['空闲', ''],
      starting: ['准备中', 'running'],
      running: ['运行中', 'running'],
      waiting: ['等待授权', 'waiting'],
      done: ['已完成', 'success'],
      success: ['已完成', 'success'],
      error: ['失败', 'error'],
      cancelled: ['已取消', 'cancelled']
    };

    function setState(next, text) {
      state = next || 'idle';
      var meta = STATES[state] || STATES.idle;
      logState.textContent = text || meta[0];
      logDot.className = 'log-dot ' + meta[1];
      if (state === 'done' || state === 'success' || state === 'error' || state === 'cancelled') {
        flushPending();
        if (state !== 'running') progress.hidden = true;
      }
      root.dataset.state = state;
    }

    function setProgress(pct) {
      if (pct == null || !isFinite(Number(pct))) {
        progress.hidden = true;
        return;
      }
      progress.hidden = false;
      progressBar.style.width = Math.max(0, Math.min(100, Number(pct))).toFixed(1) + '%';
    }

    function setCollapsed(collapsed) {
      root.classList.toggle('collapsed', !!collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (!collapsed) scrollDown();
    }

    function setTitle(text) {
      logTitle.textContent = text || '运行日志';
    }

    function setHint(text) {
      logHint.textContent = text || '';
    }

    function appendAction(node) {
      if (node && node.nodeType) logActions.appendChild(node);
    }

    function reset() {
      body.textContent = '';
      body.appendChild(empty);
      pending = '';
      totalChars = 0;
      lineCount = 0;
      progress.hidden = true;
      stick = true;
      setState('idle');
      root.classList.remove('collapsed');
    }

    return {
      element: root,
      body: body,
      write: write,
      reset: reset,
      setState: setState,
      setProgress: setProgress,
      setCollapsed: setCollapsed,
      setTitle: setTitle,
      setHint: setHint,
      appendAction: appendAction,
      getState: function () {
        return state;
      }
    };
  }

  // ------------------------------------------------------------------- modal

  var modalStack = [];
  var modalKeyBound = false;

  function bindModalKeys() {
    if (modalKeyBound) return;
    modalKeyBound = true;
    document.addEventListener(
      'keydown',
      function (event) {
        if (event.key === 'Escape' && modalStack.length) {
          event.preventDefault();
          event.stopPropagation();
          modalStack[modalStack.length - 1].cancelFromEsc();
        }
      },
      true
    );
  }

  function modal(opts) {
    opts = opts || {};
    bindModalKeys();
    var root = document.getElementById('modal-root') || document.body;
    var previousFocus = document.activeElement;

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var panel = document.createElement('div');
    panel.className = 'modal' + (opts.danger ? ' danger' : '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    if (opts.title) {
      var title = document.createElement('h2');
      title.className = 'modal-title';
      title.textContent = opts.title;
      panel.appendChild(title);
    }

    var body = document.createElement('div');
    body.className = 'modal-body';
    if (opts.body != null) {
      if (typeof opts.body === 'string') body.insertAdjacentHTML('beforeend', opts.body);
      else appendAll(body, opts.body);
    }
    panel.appendChild(body);

    var actions = document.createElement('div');
    actions.className = 'modal-actions';
    var cancelBtn = null;
    if (!opts.hideCancel) {
      cancelBtn = button({
        label: opts.cancelLabel || '取消',
        variant: 'ghost',
        size: 'small',
        onClick: function () {
          closeInternal(false, true);
        }
      });
      actions.appendChild(cancelBtn);
    }
    var confirmBtn = button({
      label: opts.confirmLabel || '确认',
      variant: opts.danger ? 'danger' : 'primary',
      size: 'small',
      onClick: function () {
        var result;
        try {
          result = typeof opts.onConfirm === 'function' ? opts.onConfirm() : undefined;
        } catch (error) {
          // Keep the dialog open on a throwing handler, surface in console.
          // eslint-disable-next-line no-console
          console.error('[MoleUI.modal] onConfirm failed', error);
          return;
        }
        if (result === false) return;
        closeInternal(true, false);
        if (result && typeof result.then === 'function') {
          result.catch(function (error) {
            // eslint-disable-next-line no-console
            console.error('[MoleUI.modal] onConfirm rejected', error);
          });
        }
      }
    });
    actions.appendChild(confirmBtn);
    panel.appendChild(actions);
    backdrop.appendChild(panel);

    var closed = false;
    function restoreFocus() {
      if (previousFocus && previousFocus.focus && document.contains(previousFocus)) {
        try {
          previousFocus.focus();
        } catch (error) {
          /* ignore */
        }
      }
    }
    function closeInternal(confirmed, invokeCancel) {
      if (closed) return;
      closed = true;
      var idx = modalStack.indexOf(handle);
      if (idx >= 0) modalStack.splice(idx, 1);
      backdrop.classList.add('closing');
      window.setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        restoreFocus();
      }, 150);
      if (invokeCancel && typeof opts.onCancel === 'function') {
        try {
          opts.onCancel();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MoleUI.modal] onCancel failed', error);
        }
      }
      void confirmed;
    }
    var handle = {
      element: panel,
      backdrop: backdrop,
      confirmButton: confirmBtn,
      cancelButton: cancelBtn,
      close: function () {
        closeInternal(false, false);
      },
      cancelFromEsc: function () {
        closeInternal(false, true);
      },
      cancelBackdrop: function () {
        closeInternal(false, true);
      }
    };
    modalStack.push(handle);
    root.appendChild(backdrop);

    backdrop.addEventListener('mousedown', function (event) {
      if (event.target === backdrop) closeInternal(false, true);
    });

    window.setTimeout(function () {
      var focusTarget = opts.danger ? cancelBtn : confirmBtn;
      if (focusTarget) focusTarget.focus();
    }, 30);

    return handle;
  }

  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      var checkbox = null;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(!!value);
      }
      var handle = modal({
        title: opts.title || '确认',
        body: opts.body,
        danger: opts.danger,
        confirmLabel: opts.confirmLabel || '确认',
        cancelLabel: opts.cancelLabel || '取消',
        hideCancel: opts.hideCancel,
        onConfirm: function () {
          finish(true);
        },
        onCancel: function () {
          finish(false);
        }
      });
      if (opts.checkboxLabel) {
        var row = document.createElement('label');
        row.className = 'checkbox modal-checkbox';
        row.innerHTML =
          '<input type="checkbox" /> <span>' + escapeHtml(opts.checkboxLabel) + '</span>';
        checkbox = row.querySelector('input');
        var bodyEl = handle.element.querySelector('.modal-body');
        if (bodyEl) bodyEl.appendChild(row);
        if (handle.confirmButton) handle.confirmButton.disabled = true;
        checkbox.addEventListener('change', function () {
          if (handle.confirmButton) handle.confirmButton.disabled = !checkbox.checked;
        });
      }
    });
  }

  // ------------------------------------------------------------------- toast

  function toast(message, tone) {
    var stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    tone = tone || 'info';
    while (stack.children.length >= 4) stack.removeChild(stack.firstChild);
    var item = document.createElement('div');
    item.className = 'toast ' + tone;
    var toneIcon = tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : tone === 'warning' ? 'alert' : 'info';
    item.innerHTML = '<span class="toast-icon">' + icon(toneIcon, 16) + '</span><span class="toast-text"></span>';
    item.querySelector('.toast-text').textContent = message == null ? '' : String(message);
    item.setAttribute('role', 'status');
    stack.appendChild(item);
    var timer = window.setTimeout(remove, TOAST_TTL);
    function remove() {
      window.clearTimeout(timer);
      if (!item.parentNode) return;
      item.classList.add('leaving');
      window.setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 160);
    }
    item.addEventListener('click', remove);
    return { dismiss: remove };
  }

  // ------------------------------------------------------------------ export

  window.MoleUI = {
    icon: icon,
    el: el,
    button: button,
    card: card,
    badge: badge,
    stat: stat,
    ring: ring,
    progressBar: progressBar,
    emptyState: emptyState,
    logPanel: logPanel,
    modal: modal,
    confirm: confirm,
    toast: toast,
    formatBytes: formatBytes,
    formatNumber: formatNumber,
    formatDuration: formatDuration,
    formatSize: formatSize,
    parseSize: formatSize,
    stripAnsi: stripAnsi,
    escapeHtml: escapeHtml,
    timeAgo: timeAgo,
    jobState: { busy: false, jobId: '', label: '', count: 0 },
    closeModals: function () {
      if (!modalStack.length) return;
      modalStack[modalStack.length - 1].cancelFromEsc();
    }
  };
})();
