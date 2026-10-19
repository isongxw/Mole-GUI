/*
 * Mole GUI — defensive parsers for Mole CLI output.
 *
 * Contract: gui/CONTRACT.md §13 (enforced by gui/tests/run.js). Every function
 * is total: it never throws, keeps `raw`, and degrades to ok:false / null.
 *
 * Note on sizes: CLI human labels are decimal (46.83GB = 46.83e9), but
 * formatSize/parseSize use 1024 multipliers so they round-trip MoleUI.formatBytes
 * (CONTRACT §2.6). Where the raw display count matters (the clean potential
 * total) a decimal helper is used explicitly.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers

  function stripAnsi(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\u001b\][^\u0007]*?(?:\u0007|\u001b\\)/g, '')
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u001b[()][A-Za-z0-9]/g, '')
      .replace(/\u001b[\x20-\x2f\x30-\x7e]/g, '')
      .replace(/\u001b/g, '')
      .replace(/\u009b/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  function rawText(input) {
    if (input == null) return '';
    if (typeof input === 'string') return input;
    if (input.raw != null) return String(input.raw);
    return String(input);
  }

  function cleanText(input) {
    return stripAnsi(rawText(input));
  }

  var SIZE_MULT = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };
  var DECIMAL_MULT = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
  var SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB|B)(?![A-Za-z])/gi;

  function formatSize(value) {
    if (value == null) return null;
    if (typeof value === 'number') return isFinite(value) ? Math.round(value) : null;
    var text = String(value).trim();
    if (!text) return null;
    if (/^(--|—|-|n\/a|na|unknown|unavailable|unmeasured|不可用|\?)$/i.test(text)) return null;
    text = text.replace(/,/g, '').replace(/^[~≈]+\s*/, '');
    var match = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)(?![A-Za-z])/i);
    if (!match) {
      var plain = text.match(/^(\d+(?:\.\d+)?)$/);
      return plain ? Math.round(Number(plain[1])) : null;
    }
    var n = Number(match[1]);
    if (!isFinite(n)) return null;
    return Math.round(n * (SIZE_MULT[match[2].toUpperCase()] || 1));
  }

  var parseSize = formatSize;

  // Decimal conversion for CLI display totals (see file header).
  function decimalSize(value) {
    if (value == null) return null;
    var text = String(value).replace(/,/g, '');
    var match = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)(?![A-Za-z])/i);
    if (!match) return null;
    var n = Number(match[1]);
    if (!isFinite(n)) return null;
    return Math.round(n * (DECIMAL_MULT[match[2].toUpperCase()] || 1));
  }

  function plusFlag(text) {
    return /(?:TB|GB|MB|KB|B)\s*\+/i.test(String(text || '')) || /\bat least\b/i.test(String(text || ''));
  }

  // Largest size token on a line (binary), with the display token and + flag.
  function extractSize(text) {
    var source = String(text == null ? '' : text);
    SIZE_RE.lastIndex = 0;
    var match;
    var best = null;
    var bestBytes = -1;
    while ((match = SIZE_RE.exec(source))) {
      var bytes = formatSize(match[1] + match[2]);
      if (bytes != null && bytes > bestBytes) {
        bestBytes = bytes;
        var tail = source.slice(match.index + match[0].length);
        best = {
          sizeText: match[1] + match[2] + (/^\s*\+/.test(tail) ? '+' : ''),
          sizeBytes: bytes,
          sizePlus: plusFlag(source)
        };
      }
    }
    SIZE_RE.lastIndex = 0;
    if (!best) return { sizeText: '', sizeBytes: null, sizePlus: plusFlag(source) };
    return best;
  }

  function extractCount(text) {
    var match = String(text == null ? '' : text).match(/(\d[\d,]*)\s*(items?|dirs?|files?|stubs?|个)/i);
    if (!match) return null;
    var n = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function extractExitCode(lines) {
    for (var i = 0; i < lines.length; i += 1) {
      var match = lines[i].trim().match(/^EXIT=(-?\d+)$/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function isSeparator(line) {
    return /^#*\s*[=]{6,}\s*$/.test(line.trim());
  }

  function collectSummary(lines) {
    var summary = [];
    var inSummary = false;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      if (isSeparator(trimmed)) {
        inSummary = !inSummary;
        return;
      }
      if (inSummary && !/^#/.test(trimmed)) summary.push(trimmed);
    });
    if (summary.length) return summary;
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (
        /^(Potential space|Items:|Categories:|Detailed file list|Use mo clean|Dry run complete|Dry Run Complete|Would apply|Would free|Would remove|Estimated space freed|Run without|Removed |Free space|Tracked cleanup|Items cleaned|Uninstall dry run complete|Uninstall Complete|Purge complete|Purge Complete|No artifacts were removed)/i.test(
          trimmed
        )
      ) {
        summary.push(trimmed);
      }
    });
    return summary;
  }

  function firstTitle(lines) {
    for (var i = 0; i < lines.length; i += 1) {
      var trimmed = lines[i].trim();
      if (!trimmed) continue;
      if (/^(EXIT=|[=#]{3,}|[✓✔✗✘⚠◎⊙→➤↳⚙•·\-○●])/.test(trimmed)) continue;
      if (/^(Dry run|Would |Estimated )/i.test(trimmed)) continue;
      return trimmed;
    }
    return '';
  }

  var MARKS = '✓✔✗✘⚠◎⊙→➤↳⚙•·*○●-';
  function splitItemLine(line) {
    var trimmed = String(line || '').trim();
    var match = trimmed.match(new RegExp('^([' + MARKS + '])\\s*(.*)$'));
    return match ? { mark: match[1], rest: match[2] } : { mark: '', rest: trimmed };
  }

  function splitLabelDetail(rest) {
    var text = String(rest || '').trim();
    var dot = text.indexOf(' · ');
    if (dot > 0) return { label: text.slice(0, dot).trim(), detail: text.slice(dot + 3).trim() };
    var comma = text.indexOf(', ');
    if (comma > 0) return { label: text.slice(0, comma).trim(), detail: text.slice(comma + 2).trim() };
    return { label: text, detail: '' };
  }

  function indentOf(line) {
    var match = String(line).match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  function stripMark(text) {
    return String(text || '')
      .trim()
      .replace(new RegExp('^[' + MARKS + ']\\s*'), '')
      .trim();
  }

  function kindForMark(mark) {
    switch (mark) {
      case '→':
        return 'dry';
      case '✓':
      case '✔':
        return 'success';
      case '◎':
      case '⚠':
        return 'warn';
      case '⊙':
        return 'review';
      case '-':
        return 'unavailable';
      default:
        return 'plain';
    }
  }

  function guard(fn, makeFallback) {
    return function (input) {
      try {
        return fn(input);
      } catch (error) {
        var fallback = makeFallback();
        fallback.raw = rawText(input);
        fallback.ok = false;
        fallback.error = error && error.message ? error.message : String(error);
        return fallback;
      }
    };
  }

  function safeJson(input) {
    if (input && typeof input === 'object') {
      if (input.raw != null && Object.keys(input).length <= 3) return safeJson(String(input.raw));
      return input;
    }
    var raw = String(input == null ? '' : input).trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      /* peel CLI chatter around the document */
    }
    var brace = raw.indexOf('{');
    var bracket = raw.indexOf('[');
    var start;
    if (brace >= 0 && bracket >= 0) start = Math.min(brace, bracket);
    else start = Math.max(brace, bracket);
    var end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      return null;
    }
  }

  // ------------------------------------------------------------ JSON parsers

  function parseAppsJson(text) {
    try {
      var data = safeJson(text);
      if (data && !Array.isArray(data) && Array.isArray(data.apps)) data = data.apps;
      if (!Array.isArray(data)) return null;
      data.forEach(function (row) {
        if (!row || typeof row !== 'object') throw new Error('invalid app row');
      });
      return data;
    } catch (error) {
      return null;
    }
  }

  function objectOrNull(text) {
    try {
      var data = safeJson(text);
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch (error) {
      return null;
    }
  }

  function parseStatusJson(text) {
    return objectOrNull(text);
  }
  function parseHistoryJson(text) {
    return objectOrNull(text);
  }
  function parseAnalyzeJson(text) {
    return objectOrNull(text);
  }

  // --------------------------------------------------------- clean preview

  function parseCleanPreviewImpl(input) {
    var raw = rawText(input);
    var text = cleanText(input);
    var lines = text.split('\n');
    var result = {
      ok: false,
      raw: raw,
      title: '',
      potentialBytes: null,
      potentialPlus: false,
      items: null,
      categories: null,
      detailFile: null,
      freeBytes: null,
      whitelistCount: null,
      sudoSkipped: false,
      sudoAvailable: false,
      sections: [],
      summaryLines: [],
      exitCode: extractExitCode(lines)
    };
    if (!text.trim()) {
      result.error = 'empty output';
      return result;
    }
    result.title = firstTitle(lines);

    var section = null;
    var inWhitelist = false;

    lines.forEach(function (rawLine) {
      var line = rawLine.replace(/\s+$/, '');
      var trimmed = line.trim();
      if (!trimmed) return;
      if (/^EXIT=/.test(trimmed) || isSeparator(trimmed)) return;

      if (/System caches need sudo/i.test(trimmed)) result.sudoSkipped = true;
      if (/Admin access available/i.test(trimmed)) result.sudoAvailable = true;

      var freeMatch = trimmed.match(/Free space:\s*([^|]+)/i);
      if (freeMatch && result.freeBytes == null) result.freeBytes = formatSize(freeMatch[1]);

      var whitelistMatch = trimmed.match(/Whitelist:\s*(\d+)\s+core patterns/i);
      if (whitelistMatch) {
        result.whitelistCount = Number(whitelistMatch[1]);
        inWhitelist = true;
        return;
      }
      if (inWhitelist) {
        if (/^↳/.test(trimmed)) return;
        inWhitelist = false;
      }

      var potentialMatch = trimmed.match(/Potential space:\s*([^|]+)/i);
      if (potentialMatch) {
        var potentialText = potentialMatch[1].trim();
        result.potentialBytes = formatSize(potentialText);
        result.potentialPlus = plusFlag(potentialText);
        var itemMatch = trimmed.match(/Items:\s*([\d,]+)/i);
        if (itemMatch) result.items = Number(itemMatch[1].replace(/,/g, ''));
        var categoryMatch = trimmed.match(/Categories:\s*([\d,]+)/i);
        if (categoryMatch) result.categories = Number(categoryMatch[1].replace(/,/g, ''));
        return;
      }
      var detailMatch = trimmed.match(/^Detailed file list:\s*(.+)$/i);
      if (detailMatch) {
        result.detailFile = detailMatch[1].trim();
        return;
      }
      if (/^(Dry run complete|Clean Your Mac|Dry Run Mode)/i.test(trimmed)) return;

      var sectionMatch = trimmed.match(/^➤\s*(.+)$/);
      if (sectionMatch) {
        section = { name: sectionMatch[1].trim(), items: [], empty: false };
        result.sections.push(section);
        return;
      }

      if (!section) return;

      var indent = indentOf(line);
      if (indent >= 4) return; // nested detail paths belong to the row above

      var itemMatch2 = trimmed.match(/^([✓✔✗✘⚠◎⊙→➤↳⚙•·*○●-])\s+(.*)$/);
      if (!itemMatch2) return;
      var mark = itemMatch2[1];
      var rest = itemMatch2[2];

      if (/^(Nothing to clean|Nothing to remove|No items|Nothing to purge|Nothing found)/i.test(rest)) {
        section.empty = true;
        return;
      }
      if (trimmed.indexOf('Nothing to clean') >= 0) {
        section.empty = true;
        return;
      }

      var parts = splitLabelDetail(rest);
      var size = extractSize(rest);
      section.items.push({
        mark: mark,
        label: parts.label,
        detail: parts.detail,
        sizeBytes: size.sizeBytes,
        sizePlus: size.sizePlus,
        count: extractCount(rest),
        dry: /\bdry\b/i.test(rest),
        wouldClean: /\bwould clean\b/i.test(rest) || /\bwould free\b/i.test(rest),
        kind: kindForMark(mark)
      });
    });

    result.sections.forEach(function (section) {
      if (section.items.length === 0) section.empty = true;
    });
    result.summaryLines = collectSummary(lines);
    result.ok = result.sections.length > 0;
    if (!result.ok) result.error = 'unrecognized clean preview output';
    return result;
  }

  var parseCleanPreview = guard(parseCleanPreviewImpl, function () {
    return {
      ok: false,
      raw: '',
      title: '',
      potentialBytes: null,
      potentialPlus: false,
      items: null,
      categories: null,
      detailFile: null,
      freeBytes: null,
      whitelistCount: null,
      sudoSkipped: false,
      sudoAvailable: false,
      sections: [],
      summaryLines: [],
      exitCode: null
    };
  });

  // ------------------------------------------------------ optimize preview

  function parseOptimizePreviewImpl(input) {
    var raw = rawText(input);
    var text = cleanText(input);
    var lines = text.split('\n');
    var result = {
      ok: false,
      raw: raw,
      title: '',
      applied: null,
      unchanged: null,
      skipped: null,
      unavailable: null,
      attention: 0,
      failed: 0,
      sections: [],
      summaryLines: [],
      exitCode: extractExitCode(lines)
    };
    if (!text.trim()) {
      result.error = 'empty output';
      return result;
    }
    result.title = firstTitle(lines);

    var section = null;
    var pendingBlock = '';
    lines.forEach(function (rawLine) {
      var trimmed = rawLine.trim();
      if (!trimmed) return;
      if (/^EXIT=/.test(trimmed) || isSeparator(trimmed)) return;
      if (trimmed === result.title) return;

      var sectionMatch = trimmed.match(/^➤\s*(.+)$/);
      if (sectionMatch) {
        section = { name: sectionMatch[1].trim(), items: [] };
        result.sections.push(section);
        pendingBlock = '';
        return;
      }

      var item = splitItemLine(trimmed);
      if (item.mark && /^[✓✔✗✘⚠◎⊙→➤↳•·*-]$/.test(item.mark)) {
        var parts = splitLabelDetail(item.rest);
        if (!section) {
          if (!pendingBlock) return;
          section = { name: pendingBlock, items: [] };
          result.sections.push(section);
          pendingBlock = '';
        }
        section.items.push({ mark: item.mark, label: parts.label, detail: parts.detail, kind: kindForMark(item.mark) });
        if (item.mark === '◎' || item.mark === '⚠') result.attention += 1;
        if (item.mark === '✗' || item.mark === '✘') result.failed += 1;
        return;
      }

      var applyMatch = trimmed.match(/^(?:Would apply|Applied)\s+(\d+)/i);
      if (applyMatch) {
        result.applied = Number(applyMatch[1]);
        return;
      }
      var unchanged = trimmed.match(/(\d+)\s+unchanged/i);
      if (unchanged) result.unchanged = Number(unchanged[1]);
      var skipped = trimmed.match(/(\d+)\s+skipped/i);
      if (skipped) result.skipped = Number(skipped[1]);
      var unavailable = trimmed.match(/(\d+)\s+unavailable/i);
      if (unavailable) result.unavailable = Number(unavailable[1]);
      if (unchanged || skipped || unavailable) return;

      if (/^[A-Z][\w .-]{3,}$/.test(trimmed) && !/^(Dry Run|Run without)/i.test(trimmed)) {
        pendingBlock = trimmed;
      }
    });

    result.attention = result.attention || 0;
    result.failed = result.failed || 0;
    result.summaryLines = collectSummary(lines);
    result.ok = result.sections.length > 0;
    if (!result.ok) result.error = 'unrecognized optimize preview output';
    return result;
  }

  var parseOptimizePreview = guard(parseOptimizePreviewImpl, function () {
    return {
      ok: false,
      raw: '',
      title: '',
      applied: null,
      unchanged: null,
      skipped: null,
      unavailable: null,
      attention: 0,
      failed: 0,
      sections: [],
      summaryLines: [],
      exitCode: null
    };
  });

  // ---------------------------------------------------------- purge preview

  function parsePurgePreviewImpl(input) {
    var raw = rawText(input);
    var text = cleanText(input);
    var lines = text.split('\n');
    var result = {
      ok: false,
      raw: raw,
      mode: 'error',
      title: '',
      artifacts: [],
      itemCount: null,
      totalBytes: null,
      totalPlus: false,
      freeBytes: null,
      nonInteractiveSkip: 0,
      noCandidates: false,
      summaryLines: [],
      exitCode: extractExitCode(lines)
    };
    if (!text.trim()) {
      result.error = 'empty output';
      return result;
    }
    var dryRun = /dry run/i.test(text);
    var cancelled = /(purge cancelled|cancelled by user|aborted by user)/i.test(text);
    var completeEvidence = false;
    var extraSummary = [];

    lines.forEach(function (rawLine) {
      var trimmed = rawLine.trim();
      if (!trimmed) return;
      if (/^EXIT=/.test(trimmed) || isSeparator(trimmed)) return;

      var titleMatch = trimmed.match(/^(Purge Project Artifacts|Verify Installers|Installer Cleanup)\s*$/i);
      if (titleMatch) {
        result.title = titleMatch[1];
        return;
      }
      if (/^(Purge complete|Purge Complete)\s*$/i.test(trimmed)) {
        completeEvidence = true;
        return;
      }
      var noneMatch = trimmed.match(/^[✓✔]\s*(Great!\s*No old project artifacts to clean|No old project artifacts to clean)$/i);
      if (noneMatch) {
        result.noCandidates = true;
        extraSummary.push(trimmed);
        return;
      }
      if (/^[◎]\s*No artifacts could be prepared for review/i.test(trimmed)) {
        result.noCandidates = true;
        extraSummary.push(trimmed);
        return;
      }
      var skipMatch = trimmed.match(/Skipped\s+(\d+)\s+cloud-synced artifact/i);
      if (skipMatch) {
        result.nonInteractiveSkip += Number(skipMatch[1]);
        extraSummary.push(trimmed);
        return;
      }

      var summaryMatch = trimmed.match(
        /^(?:Would free approximately|Estimated space freed):\s*([^|]+?)(?:\s*\|\s*Items:\s*(\d+))?(?:\s*\|\s*Free:\s*(.+))?$/i
      );
      if (summaryMatch) {
        var sizeText = summaryMatch[1].trim();
        result.totalBytes = formatSize(sizeText);
        result.totalPlus = plusFlag(sizeText);
        if (summaryMatch[2]) result.itemCount = Number(summaryMatch[2]);
        if (summaryMatch[3]) result.freeBytes = formatSize(summaryMatch[3]);
        return;
      }
      var freeMatch = trimmed.match(/^Free space:\s*(.+)$/i);
      if (freeMatch) {
        result.freeBytes = formatSize(freeMatch[1]);
        return;
      }
      if (/^No artifacts were removed\.?$/i.test(trimmed)) {
        completeEvidence = true;
        return;
      }

      var candidate = trimmed.match(/^([✓✔→])\s+(?:\[DRY RUN\]\s+)?(.+)$/);
      if (candidate) {
        var content = candidate[2];
        var pathMatch = content.match(/((?:~\/|\/|\.\/)[^\s·,()]+)/);
        if (pathMatch) {
          var size = extractSize(content);
          result.artifacts.push({
            path: pathMatch[1].trim(),
            sizeText: size.sizeText,
            sizeBytes: size.sizeBytes,
            count: extractCount(content)
          });
          return;
        }
      }
    });

    var block = collectSummary(lines);
    result.summaryLines = block.concat(
      extraSummary.filter(function (line) {
        return block.indexOf(line) < 0;
      })
    );

    if (result.artifacts.length) {
      var sum = 0;
      result.artifacts.forEach(function (artifact) {
        if (artifact.sizeBytes != null) sum += artifact.sizeBytes;
        if (artifact.sizeText && plusFlag(artifact.sizeText)) result.totalPlus = true;
      });
      if (result.totalBytes == null) result.totalBytes = sum || null;
      if (result.itemCount == null) result.itemCount = result.artifacts.length;
    }

    if (result.exitCode != null && result.exitCode !== 0) result.mode = 'error';
    else if (cancelled) result.mode = 'cancelled';
    else if (result.noCandidates) result.mode = 'none';
    else if (completeEvidence || (result.totalBytes != null && !dryRun && !result.artifacts.length)) result.mode = 'complete';
    else if (result.artifacts.length) result.mode = dryRun ? 'preview' : 'complete';
    else result.mode = 'error';

    result.ok = result.mode !== 'error';
    if (!result.ok) result.error = 'unrecognized purge output';
    return result;
  }

  var parsePurgePreview = guard(parsePurgePreviewImpl, function () {
    return {
      ok: false,
      raw: '',
      mode: 'error',
      title: '',
      artifacts: [],
      itemCount: null,
      totalBytes: null,
      totalPlus: false,
      freeBytes: null,
      nonInteractiveSkip: 0,
      noCandidates: false,
      summaryLines: [],
      exitCode: null
    };
  });

  // ------------------------------------------------- uninstall dry-run text

  function parseUninstallDryRunImpl(input) {
    var raw = rawText(input);
    var text = cleanText(input);
    var lines = text.split('\n');
    var result = {
      ok: false,
      raw: raw,
      dryRun: /dry run/i.test(text),
      matchedCount: null,
      apps: [],
      keptPersonal: [],
      confirmLine: null,
      wouldRemoveCount: 0,
      totalBytes: 0,
      title: '',
      summaryLines: [],
      postNotes: [],
      exitCode: extractExitCode(lines)
    };
    if (!text.trim()) {
      result.error = 'empty output';
      return result;
    }
    var mode = '';
    var current = null;
    var inSummary = false;
    var afterBlock = false;

    lines.forEach(function (rawLine) {
      var trimmed = rawLine.trim();
      if (!trimmed) {
        if (mode === 'personal') mode = '';
        return;
      }
      if (/^EXIT=/.test(trimmed)) return;
      if (isSeparator(trimmed)) {
        if (inSummary) {
          inSummary = false;
          afterBlock = true;
        } else {
          inSummary = true;
        }
        return;
      }
      if (inSummary) return;
      if (afterBlock) {
        result.postNotes.push(trimmed);
        return;
      }

      var matched = trimmed.match(/Matched\s+(\d+)\s+app/i);
      if (matched) {
        result.matchedCount = Number(matched[1]);
        return;
      }
      if (/^Files to be removed:/i.test(trimmed)) {
        mode = 'files';
        if (!result.title) result.title = 'Files to be removed';
        return;
      }
      if (/^Personal data kept:/i.test(trimmed)) {
        mode = 'personal';
        return;
      }
      if (mode === 'personal') {
        if (/^(D choose|➤|\[DRY RUN\])/.test(trimmed)) {
          mode = '';
          return;
        }
        result.keptPersonal.push(stripMark(trimmed));
        return;
      }
      if (/^➤\s*Remove\s+(\d+)\s+app/i.test(trimmed)) {
        result.confirmLine = trimmed;
        result.wouldRemoveCount = Number(trimmed.match(/Remove\s+(\d+)\s+app/i)[1]);
        return;
      }
      if (/^D choose personal data/i.test(trimmed)) return;

      if (mode !== 'files') return;

      var item = splitItemLine(trimmed);
      var rest = item.rest;
      if (!rest) return;
      var systemMatch = rest.match(/^System:\s*(.+)$/i);
      var reviewMatch = rest.match(/^Review only:\s*(.+)$/i);
      var pathish = /^(~\/|\/|\.\/|[A-Za-z]:\\)/.test(rest);

      if (systemMatch || reviewMatch || pathish) {
        var kind = 'related';
        var pathText = rest;
        if (systemMatch) {
          kind = 'system';
          pathText = systemMatch[1];
        } else if (reviewMatch) {
          kind = 'review';
          pathText = reviewMatch[1];
        }
        var pathMatch = pathText.match(/^((?:~\/|\/|\.\/)[^\s·,]*?)(?:\s*[·,]\s*(.+))?$/);
        var pathValue = pathMatch ? pathMatch[1].trim() : pathText.trim();
        var pathTail = pathMatch && pathMatch[2] ? pathMatch[2] : '';
        var pathSize = extractSize(pathText);
        if (/\.app(?:\/|$)/i.test(pathValue)) kind = 'app';
        if (!current) {
          current = { name: '', sizeText: '', sizeBytes: null, brew: false, paths: [] };
          result.apps.push(current);
        }
        current.paths.push({
          path: pathValue,
          kind: kind,
          sizeText: pathSize.sizeText,
          sizeBytes: pathSize.sizeBytes
        });
        void pathTail;
        return;
      }

      if (item.mark && /^[✓✔✗✘⚠◎⊙→•·*]$/.test(item.mark)) {
        var parts = splitLabelDetail(rest);
        var appSize = extractSize(rest);
        current = {
          name: parts.label.replace(/\s*\[Brew\]\s*$/i, '').trim(),
          sizeText: appSize.sizeText,
          sizeBytes: appSize.sizeBytes,
          brew: /\[Brew\]/i.test(rest),
          paths: []
        };
        result.apps.push(current);
      }
    });

    result.summaryLines = collectSummary(lines);
    if (result.summaryLines.length && /^Uninstall (dry run complete|Complete)/i.test(result.summaryLines[0])) {
      result.title = result.summaryLines[0];
    }
    if (!result.title) result.title = firstTitle(lines);

    if (!result.apps.length) {
      result.ok = false;
      result.error = 'unrecognized uninstall preview output';
      return result;
    }
    result.ok = true;
    var total = 0;
    result.apps.forEach(function (app) {
      if (app.sizeBytes != null) total += app.sizeBytes;
    });
    if (!total) {
      result.apps.forEach(function (app) {
        app.paths.forEach(function (path) {
          if (path.kind === 'app' && path.sizeBytes != null) total += path.sizeBytes;
        });
      });
    }
    result.totalBytes = total;
    if (!result.wouldRemoveCount) result.wouldRemoveCount = result.matchedCount || result.apps.length;
    result.matchedCount = result.matchedCount == null ? result.apps.length : result.matchedCount;
    return result;
  }

  var parseUninstallDryRun = guard(parseUninstallDryRunImpl, function () {
    return {
      ok: false,
      raw: '',
      dryRun: false,
      matchedCount: null,
      apps: [],
      keptPersonal: [],
      confirmLine: null,
      wouldRemoveCount: 0,
      totalBytes: 0,
      title: '',
      summaryLines: [],
      postNotes: [],
      exitCode: null
    };
  });

  // ---------------------------------------------------------------- version

  function parseVersion(input) {
    var raw = rawText(input);
    var text = cleanText(input);
    var result = {
      version: '',
      os: '',
      arch: '',
      kernel: '',
      sip: '',
      diskFree: '',
      install: '',
      shell: '',
      nightly: false
    };
    try {
      text.split('\n').forEach(function (line) {
        var trimmed = line.trim();
        var match = trimmed.match(/^Mole version\s+(.+)$/i);
        if (match) result.version = match[1].trim();
        match = trimmed.match(/^macOS:\s*(.+)$/i);
        if (match) result.os = match[1].trim();
        match = trimmed.match(/^Architecture:\s*(.+)$/i);
        if (match) result.arch = match[1].trim();
        match = trimmed.match(/^Kernel:\s*(.+)$/i);
        if (match) result.kernel = match[1].trim();
        match = trimmed.match(/^SIP:\s*(.+)$/i);
        if (match) result.sip = match[1].trim();
        match = trimmed.match(/^Disk Free:\s*(.+)$/i);
        if (match) result.diskFree = match[1].trim();
        match = trimmed.match(/^Install:\s+(.+)$/i);
        if (match) result.install = match[1].trim();
        match = trimmed.match(/^Shell:\s*(.+)$/i);
        if (match) result.shell = match[1].trim();
      });
      result.nightly = /nightly/i.test(raw) || /nightly/i.test(result.install);
    } catch (error) {
      /* parseVersion never throws */
    }
    return result;
  }

  // ----------------------------------------------------------------- export

  window.MoleParsers = {
    stripAnsi: stripAnsi,
    formatSize: formatSize,
    parseSize: parseSize,
    parseCleanPreview: parseCleanPreview,
    parseOptimizePreview: parseOptimizePreview,
    parsePurgePreview: parsePurgePreview,
    parseUninstallDryRun: parseUninstallDryRun,
    parseAppsJson: parseAppsJson,
    parseStatusJson: parseStatusJson,
    parseHistoryJson: parseHistoryJson,
    parseAnalyzeJson: parseAnalyzeJson,
    parseVersion: parseVersion,
    // Not part of the CLI contract; handy for screens and mock.
    extractSize: extractSize,
    extractCount: extractCount,
    safeJson: safeJson,
    decimalSize: decimalSize,
    sizeToBytes: formatSize,
    parseUninstallPreview: parseUninstallDryRun
  };
})();
