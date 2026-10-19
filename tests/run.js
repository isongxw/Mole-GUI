#!/usr/bin/env node
/*
 * Mole GUI — CLI contract tests.
 *
 * Plain Node, no dependencies:   node gui/tests/run.js
 *
 * Loads gui/app/web/js/parsers.js in a minimal browser shim and asserts the
 * parser contract documented in gui/CONTRACT.md against gui/fixtures/*.
 * Also checks the mock bridge contract in gui/app/web/js/mock.js when present.
 *
 * Exit code 0 = all contract checks passed. Nonzero = at least one failure,
 * printed with an expected/actual diff. Do not weaken this file to hide a
 * parser gap: the parsers are owned by ui-core — report gaps to the Lead.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const GUI = path.resolve(__dirname, '..');
const FIXTURES = path.join(GUI, 'fixtures');
const PARSERS_PATH = path.join(GUI, 'app', 'web', 'js', 'parsers.js');
const MOCK_PATH = path.join(GUI, 'app', 'web', 'js', 'mock.js');

const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  process.stdout.write('\n' + name + '\n');
}

function record(name, fn) {
  let error = null;
  try {
    fn();
  } catch (err) {
    error = err;
  }
  results.push({ group: currentGroup, name, error });
  if (error) {
    process.stdout.write('  FAIL  ' + name + '\n');
  } else {
    process.stdout.write('  ok    ' + name + '\n');
  }
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail((message || 'values differ') + '\n    expected: ' + e + '\n    actual:   ' + a);
}

function assertMatch(value, regex, message) {
  assert(typeof value === 'string', (message || 'value') + ': expected string, got ' + typeof value);
  assert(regex.test(value), (message || 'value') + ': ' + JSON.stringify(value) + ' does not match ' + String(regex));
}

function assertNear(actual, expected, toleranceRatio, message) {
  assert(typeof actual === 'number' && isFinite(actual), (message || 'value') + ': expected number, got ' + JSON.stringify(actual));
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * toleranceRatio;
  assert(diff <= limit,
    (message || 'value') + ': expected ' + expected + ' ± ' + (toleranceRatio * 100) + '%, got ' + actual +
    ' (diff ' + diff + ' > ' + limit + ')');
}

// Mirrors MoleUI.formatBytes (binary units, 1-3 significant-ish digits).
function formatBytes(bytes) {
  if (bytes == null || !isFinite(bytes)) return '—';
  let n = Math.abs(Number(bytes));
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  let digits;
  if (unit === 0) digits = 0;
  else if (n >= 100) digits = 1;
  else digits = 2;
  let text = n.toFixed(digits);
  if (digits > 0) text = text.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
  return text + ' ' + units[unit];
}

// ---------------------------------------------------------------- load parsers

function loadParsers() {
  assert(fs.existsSync(PARSERS_PATH),
    'missing gui/app/web/js/parsers.js — the UI must ship a MoleParsers module (contract §13)');
  const source = fs.readFileSync(PARSERS_PATH, 'utf8');
  global.window = global;
  vm.runInThisContext(source, { filename: PARSERS_PATH });
  assert(global.window && global.window.MoleParsers, 'parsers.js did not assign window.MoleParsers');
  return global.window.MoleParsers;
}

let P;

// ---------------------------------------------------------------- ANSI / size

function testStripAnsi() {
  group('stripAnsi (CONTRACT §2.5)');
  record('removes CSI, OSC and single-char ESC sequences', () => {
    const raw = fixture('ansi-sample.txt');
    const clean = P.stripAnsi(raw);
    assert(!/\u001b/.test(clean), 'ESC byte survived stripAnsi: ' + JSON.stringify(clean));
    assert(!/\u009b/.test(clean), 'C1 CSI survived stripAnsi: ' + JSON.stringify(clean));
    assertMatch(clean, /➤ Developer tools/, 'section glyph text');
    assertMatch(clean, /npm cache · 1\.36GB dry/, 'dry-run item text');
    assertMatch(clean, /OSC title terminated by BEL/, 'BEL-terminated OSC title');
    assertMatch(clean, /OSC 8 link/, 'ST-terminated OSC hyperlink');
    assertMatch(clean, /charset reset/, 'ESC ( B charset reset');
    assertMatch(clean, /C1: red/, 'C1 CSI stripped');
    assertMatch(clean, /中文宽度 · 46\.83GB\+/, 'CJK and + size kept');
  });

  record('normalizes CR and CRLF artifacts', () => {
    const clean = P.stripAnsi('a\r\nb\rc\n');
    assert(!/\r/.test(clean), 'bare CR survived stripAnsi: ' + JSON.stringify(clean));
    assertEqual(clean.replace(/\n$/, ''), 'a\nb\nc', 'CR normalization');
  });

  record('null/undefined degrade to empty string', () => {
    assertEqual(P.stripAnsi(null), '');
    assertEqual(P.stripAnsi(undefined), '');
  });
}

function testSizes() {
  group('formatSize / parseSize (CONTRACT §2.6)');
  record('parses decimal human sizes with binary multiplier', () => {
    assertEqual(P.formatSize('46.83GB+'), 50283329618, 'GB with +');
    assertEqual(P.formatSize('522.2MB'), 547566387, 'MB');
    assertEqual(P.formatSize('0B'), 0, 'zero bytes');
    assertEqual(P.formatSize('172KB'), 176128, 'KB');
    assertEqual(P.formatSize('1,536B'), 1536, 'comma separator');
    assertEqual(P.formatSize('at least 986.7MB'), 1034629939, 'at least qualifier');
    assertEqual(P.parseSize('30.34GB'), 32577326940, 'alias parseSize');
  });

  record('unknown / absent sizes return null', () => {
    assertEqual(P.formatSize(null), null);
    assertEqual(P.formatSize(''), null);
    assertEqual(P.formatSize('--'), null);
    assertEqual(P.formatSize('N/A'), null);
    assertEqual(P.formatSize('unknown'), null);
  });

  record('formatSize(formatBytes(n)) round-trips within 1%', () => {
    for (const n of [0, 1, 999, 1024, 1536, 1234567, 2202010, 547566387, 50283329618, 1099511627776]) {
      const text = formatBytes(n);
      const parsed = P.parseSize(text);
      assert(parsed != null, 'parseSize(' + JSON.stringify(text) + ') returned null');
      if (n === 0) assertEqual(parsed, 0, 'zero round-trip');
      else assertNear(parsed, n, 0.01, 'round-trip ' + n + ' via ' + JSON.stringify(text));
    }
  });
}

// --------------------------------------------------------------- clean preview

function testCleanPreview() {
  group('parseCleanPreview (CONTRACT §8.1)');
  const text = fixture('clean-preview.txt');

  record('extracts potential space, items, categories, detail file', () => {
    const p = P.parseCleanPreview(text);
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.title, 'Clean Your Mac', 'title');
    // parseSize uses binary units (CONTRACT §2.6): 46.83 * 1024^3.
    assertNear(p.potentialBytes, 46.83 * Math.pow(1024, 3), 0.001, 'potential space 46.83GB');
    assertEqual(p.potentialPlus, true, 'partial-total + flag');
    assertEqual(p.items, 1681, 'items');
    assertEqual(p.categories, 7, 'categories');
    assertMatch(p.detailFile, /clean-list\.txt$/, 'detailed file list path');
    assert(p.summaryLines.some((l) => /Dry run complete - no changes made/.test(l)),
      'summary heading missing from summaryLines: ' + JSON.stringify(p.summaryLines));
    assert(p.summaryLines.some((l) => /Use mo clean --whitelist/.test(l)), 'whitelist hint missing');
  });

  record('builds sections with item counts and marks', () => {
    const p = P.parseCleanPreview(text);
    assert(Array.isArray(p.sections) && p.sections.length >= 12,
      'expected >=12 sections, got ' + p.sections.length);
    p.sections.forEach((section) => {
      assert(typeof section.name === 'string' && section.name, 'section without name');
      assert(Array.isArray(section.items), 'section without items: ' + section.name);
    });
    const user = p.sections.find((s) => s.name === 'User essentials');
    assert(user, 'missing section "User essentials"');
    const appCache = user.items.find((i) => i.label === 'User app cache');
    assert(appCache, 'missing "User app cache" item');
    assertEqual(appCache.count, 58, 'item count from "58 items"');
    assertEqual(appCache.dry, true, 'dry flag on → row');
    assertEqual(appCache.mark, '→', 'dry row mark');
    assert(appCache.sizeBytes > 0, 'dry row size');
    assertEqual(appCache.wouldClean, false, '→ sized row is not "would clean"');
    const trash = user.items.find((i) => i.label === 'Trash');
    assert(trash, 'missing Trash skip row');
    assertEqual(trash.wouldClean, false, 'skipped row is not wouldClean');
    assertMatch(trash.detail, /skipped/, 'Trash detail');
  });

  record('would clean / dry rows and empty sections are classified', () => {
    const p = P.parseCleanPreview(text);
    const dev = p.sections.find((s) => s.name === 'Developer tools');
    assert(dev, 'missing section "Developer tools"');
    const npm = dev.items.find((i) => i.label === 'npm cache');
    assert(npm, 'missing "npm cache"');
    assertEqual(npm.wouldClean, true, '"npm cache · would clean"');
    const npmDir = dev.items.find((i) => i.label === 'npm cache directory');
    assert(npmDir, 'missing "npm cache directory"');
    assertEqual(npmDir.count, 4, 'npm cache directory count');
    assertEqual(npmDir.dry, true, 'npm cache directory dry');
    assertEqual(npmDir.wouldClean, false, 'sized dry row is not wouldClean');
    const brew = dev.items.find((i) => i.label === 'Homebrew cleanup');
    assert(brew, 'missing "Homebrew cleanup"');
    assertEqual(brew.wouldClean, true, 'would free row is wouldClean');
    const review = dev.items.find((i) => /Docker unused data/.test(i.label));
    assert(review, 'missing Docker review row');
    assertEqual(review.mark, '⊙', 'review row mark');
    assertEqual(review.wouldClean, false, 'review row is not wouldClean');

    const virtual = p.sections.find((s) => s.name === 'Virtualization');
    assert(virtual, 'missing section "Virtualization"');
    assertEqual(virtual.items.length, 0, '✓ Nothing to clean means an empty section');
    assert(!p.sections.some((s) => s.items.some((i) => i.label === 'Nothing to clean')),
      'empty-section fallback must not become an item');

    const detailPaths = p.sections.reduce((acc, s) => acc.concat(s.items), [])
      .filter((i) => /^(~\/|\/opt\/|\/Users\/)/.test(i.label));
    assertEqual(detailPaths.length, 0,
      '4-space detail paths under "Homebrew cleanup" must not become items (got ' +
      JSON.stringify(detailPaths.slice(0, 3).map((i) => i.label)) + ')');
  });

  record('empty / malformed input degrades to ok:false', () => {
    assertEqual(P.parseCleanPreview('').ok, false, 'empty string');
    assertEqual(P.parseCleanPreview(null).ok, false, 'null');
    const partial = P.parseCleanPreview('Clean Your Mac\n\nDry Run Mode, Preview only, no deletions\n');
    assertEqual(partial.ok, false, 'header-only output');
    assert(Array.isArray(partial.sections) && partial.sections.length === 0, 'header-only sections');
  });
}

// ------------------------------------------------------------ optimize preview

function testOptimizePreview() {
  group('parseOptimizePreview (CONTRACT §9.1)');
  const text = fixture('optimize-preview.txt');

  record('extracts sections, marks and summary counts', () => {
    const p = P.parseOptimizePreview(text);
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.title, 'Optimize', 'title');
    assert(Array.isArray(p.sections) && p.sections.length >= 15,
      'expected >=15 sections, got ' + (p.sections ? p.sections.length : 'none'));
    const finder = p.sections.find((s) => s.name === 'Finder Cache Refresh');
    assert(finder, 'missing "Finder Cache Refresh"');
    assertEqual(finder.items.length, 2, 'Finder Cache Refresh item count');
    assertEqual(finder.items[0].mark, '→', 'dry-run item mark');
    const db = p.sections.find((s) => s.name === 'Database Optimization');
    assert(db, 'missing "Database Optimization"');
    assertEqual(db.items[0].mark, '◎', 'warning item mark');
    const unavailable = p.sections.find((s) => s.name === 'Shared File Lists');
    assert(unavailable, 'missing "Shared File Lists"');
    assertEqual(unavailable.items[0].mark, '-', 'unavailable item mark');
    assertEqual(p.applied, 2, 'Would apply N optimizations');
    assertEqual(p.unchanged, 12, 'unchanged count');
    assertEqual(p.skipped, 3, 'skipped count');
    assertEqual(p.unavailable, 2, 'unavailable count');
    assert(p.summaryLines.some((l) => /Dry Run Complete, No Changes Made/.test(l)),
      'summary heading missing: ' + JSON.stringify(p.summaryLines));
    assert(p.summaryLines.some((l) => /Run without --dry-run/.test(l)), 'apply hint missing');
  });

  record('keeps the Performance diagnosis block', () => {
    const p = P.parseOptimizePreview(text);
    const diagnosis = p.sections.find((s) => /Performance diagnosis/i.test(s.name));
    assert(diagnosis, 'missing "Performance diagnosis" section (it precedes the first ➤ header)');
    assert(diagnosis.items.length >= 1, 'diagnosis section has no items');
    assertEqual(diagnosis.items[0].mark, '✓', 'diagnosis ok mark');
  });

  record('empty / malformed input degrades to ok:false', () => {
    assertEqual(P.parseOptimizePreview('').ok, false, 'empty string');
    assertEqual(P.parseOptimizePreview('Optimize\n').ok, false, 'header only');
  });
}

// --------------------------------------------------------------- purge preview

function testPurgePreview() {
  group('parsePurgePreview (CONTRACT §10.1/§10.2)');

  record('no-candidate preview → mode none', () => {
    const p = P.parsePurgePreview(fixture('purge-preview.txt'));
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.mode, 'none', 'mode');
    assertEqual(p.artifacts, [], 'artifacts');
    assertEqual(p.noCandidates, true, 'noCandidates flag');
    assertEqual(p.title, 'Purge Project Artifacts', 'title');
    assert(p.summaryLines.some((l) => /Great! No old project artifacts to clean/.test(l)),
      'no-candidate line missing: ' + JSON.stringify(p.summaryLines));
  });

  record('dry-run with artifacts → paths, sizes, totals', () => {
    const p = P.parsePurgePreview(fixture('purge-preview-artifacts.txt'));
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.mode, 'preview', 'mode');
    assertEqual(p.artifacts.length, 2, 'artifact count');
    assertEqual(p.artifacts[0].path, '/Users/example/projects/demo/node_modules', 'artifact path');
    assertNear(p.artifacts[0].sizeBytes, 2202010, 0.01, 'artifact size');
    assertEqual(p.itemCount, 2, 'itemCount');
    assertNear(p.totalBytes, 2738586, 0.05, 'totalBytes ~2.6MB');
    assert(p.summaryLines.some((l) => /Dry run complete - no changes made/.test(l)), 'summary heading');
    assert(p.summaryLines.some((l) => /Would free approximately:/.test(l)), 'would-free line');
  });

  record('completed real purge → mode complete with totals', () => {
    const p = P.parsePurgePreview(fixture('purge-run-complete.txt'));
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.mode, 'complete', 'mode');
    assertEqual(p.itemCount, 2, 'itemCount');
    assertNear(p.totalBytes, 2726298, 0.05, 'totalBytes ~2.6MB');
    assertNear(p.freeBytes, 351261000000, 0.05, 'freeBytes ~327.13GB');
    assert(p.summaryLines.some((l) => /Purge complete/.test(l)), 'Purge complete heading');
    assert(p.summaryLines.some((l) => /Estimated space freed:/.test(l)), 'freed line');
  });

  record('empty input degrades to ok:false', () => {
    assertEqual(P.parsePurgePreview('').ok, false, 'empty string');
    const garbage = P.parsePurgePreview('something unexpected happened');
    assertEqual(garbage.ok, false, 'garbage output');
  });
}

// ----------------------------------------------------------- uninstall preview

function testUninstallPreview() {
  group('parseUninstallDryRun (CONTRACT §7.2/§7.4)');
  const text = fixture('uninstall-dry-run.txt');

  record('extracts apps, paths, kept data and confirmation line', () => {
    const p = P.parseUninstallDryRun(text);
    assert(p && p.ok === true, 'ok must be true');
    assertEqual(p.apps.length, 1, 'exactly one app (no pseudo-apps): ' + JSON.stringify(p.apps.map((a) => a.name)));
    const app = p.apps[0];
    assertEqual(app.name, 'Rectangle', 'app name');
    assertNear(app.sizeBytes, 7759462, 0.01, 'app size 7.4MB');
    const bundle = app.paths.find((x) => /Rectangle\.app$/.test(x.path));
    assert(bundle, 'missing app bundle path, got ' + JSON.stringify(app.paths.map((x) => x.path)));
    assertEqual(bundle.kind, 'app', 'bundle path kind');
    const cache = app.paths.find((x) => /Library\/Caches\/com\.knollsoft\.Rectangle/.test(x.path));
    assert(cache, 'missing cache path');
    assertEqual(cache.kind, 'related', 'cache path kind');
    assertNear(cache.sizeBytes, 4096, 0.01, 'cache size 4KB');

    assertEqual(p.keptPersonal.length, 4, 'personal data rows: ' + JSON.stringify(p.keptPersonal));
    p.keptPersonal.forEach((row) => {
      assert(!/D choose personal data|Remove \d+ app|Uninstall dry run|DRY RUN\] Would refresh/.test(row),
        'keptPersonal leaked a post-block line: ' + JSON.stringify(row));
    });
    assertMatch(p.confirmLine, /Remove 1 app, 7\.4MB/, 'confirm line');
    assertEqual(p.wouldRemoveCount, 1, 'wouldRemoveCount');
    assertNear(p.totalBytes, 7759462, 0.01, 'totalBytes');
    assertMatch(p.title, /Uninstall dry run complete/, 'title');
    assert(p.summaryLines.some((l) => /Would remove 1 app, would free 7\.4MB: Rectangle/.test(l)),
      'summary line missing: ' + JSON.stringify(p.summaryLines));
  });

  record('handles empty, truncated and garbage output without throwing', () => {
    const empty = P.parseUninstallDryRun('');
    assertEqual(empty.ok, false, 'empty ok');
    assertEqual(empty.apps, [], 'empty apps');
    assertEqual(empty.raw, '', 'empty raw');
    const truncated = P.parseUninstallDryRun(text.split('\n').slice(0, 2).join('\n'));
    assertEqual(truncated.ok, false, 'truncated ok');
    const garbage = P.parseUninstallDryRun('\u0000\u001b[31mrandom garbage');
    assertEqual(garbage.ok, false, 'garbage ok');
    assert(typeof garbage.raw === 'string', 'raw preserved');
  });
}

// -------------------------------------------------------------- JSON helpers

function testJsonParsers() {
  group('JSON parsers (CONTRACT §5, §6, §7.1, §12)');

  record('uninstall --list JSON: list, single-line and malformed variants', () => {
    const list = P.parseAppsJson(fixture('apps.json'));
    assert(Array.isArray(list), 'list fixture must parse to an array');
    assert(list.length >= 12, 'expected >=12 seeded app rows, got ' + list.length);
    const single = P.parseAppsJson(fixture('apps-single-line.json'));
    assert(Array.isArray(single), 'single-line variant must parse');
    assertEqual(single.length, list.length, 'single-line row count');
    assert(list.some((a) => a.source === 'Homebrew'), 'fixture must include a Homebrew cask');
    assert(list.some((a) => /[\u4e00-\u9fff]/.test(a.name)), 'fixture must include a CJK app name');
    const row = list[0];
    ['name', 'bundle_id', 'source', 'uninstall_name', 'path', 'size'].forEach((key) => {
      assert(typeof row[key] === 'string', 'app row missing string field ' + key);
    });
    assert(list.some((a) => a.size === '--'), 'fixture must include an unknown "--" size row');
    assertEqual(P.parseAppsJson('[{bad json'), null, 'malformed JSON');
    assertEqual(P.parseAppsJson('not json at all'), null, 'plain text');
    assertEqual(P.parseAppsJson(''), null, 'empty string');
    assertEqual(P.parseAppsJson('[]'), [], 'empty array is valid');
    const truncated = fixture('apps.json').slice(0, Math.floor(fixture('apps.json').length / 3));
    assertEqual(P.parseAppsJson(truncated), null, 'truncated JSON');
  });

  record('status --json: valid fixture + truncated fallback', () => {
    const status = P.parseStatusJson(fixture('status.json'));
    assert(status && typeof status === 'object' && !Array.isArray(status), 'status fixture must parse');
    ['collected_at', 'host', 'hardware', 'cpu', 'memory', 'disks', 'battery'].forEach((key) => {
      if (key === 'battery') return;
      assert(key in status, 'status missing field ' + key);
    });
    assert(Array.isArray(status.cpu.per_core), 'cpu.per_core array');
    assert(Array.isArray(status.disks) && status.disks.length > 0, 'disks array');
    assertEqual(typeof status.health_score, 'number', 'health_score type');
    const truncated = fixture('status.json').slice(0, 500);
    assertEqual(P.parseStatusJson(truncated), null, 'truncated status JSON must return null');
    assertEqual(P.parseStatusJson('{oops'), null, 'malformed status JSON');
  });

  record('history --json: 100-session fixture, empty state, truncation', () => {
    const history = P.parseHistoryJson(fixture('history-100.json'));
    assert(history && typeof history === 'object', 'history fixture must parse');
    assertEqual(history.limit, 100, 'limit');
    assertEqual(history.sessions.length, 100, 'session count');
    assertEqual(history.deletions.length, 20, 'deletion count');
    const attributions = new Set(history.sessions.map((s) => s.attribution));
    ['run', 'command', 'ambiguous'].forEach((a) => assert(attributions.has(a), 'missing attribution ' + a));
    const failedTask = history.sessions.find((s) => s.failed_tasks > 0);
    assert(failedTask, 'fixture must exercise failed_tasks');
    const statuses = new Set(history.deletions.map((d) => d.status));
    ['ok', 'dry-run', 'rejected', 'privacy-denied'].forEach((s) => assert(statuses.has(s), 'missing deletion status ' + s));
    assert(history.deletions.some((d) => d.size_kb === null), 'fixture must exercise unknown size_kb');
    assert(history.sessions.every((s) => typeof s.actions === 'object' && s.actions !== null), 'actions object');
    assert(history.sessions.every((s) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s.started_at)),
      'started_at format');

    const empty = P.parseHistoryJson(fixture('history-empty.json'));
    assert(empty && Array.isArray(empty.sessions) && empty.sessions.length === 0, 'empty history sessions');
    assert(Array.isArray(empty.deletions) && empty.deletions.length === 0, 'empty history deletions');

    const truncated = fixture('history-100.json').slice(0, 1000);
    assertEqual(P.parseHistoryJson(truncated), null, 'truncated history JSON must return null');
  });

  record('analyze --json: entries, large files, empty dir, truncation', () => {
    const analyzer = P.parseAnalyzeJson(fixture('analyze.json'));
    assert(analyzer && typeof analyzer === 'object', 'analyze fixture must parse');
    assertEqual(analyzer.overview, false, 'overview flag');
    assert(Array.isArray(analyzer.entries), 'entries array');
    assert(Array.isArray(analyzer.large_files), 'large_files array');
    assertEqual(typeof analyzer.total_size, 'number', 'total_size');
    const empty = P.parseAnalyzeJson(fixture('analyze-empty.json'));
    assert(empty && Array.isArray(empty.entries) && empty.entries.length === 0, 'empty entries');
    assertEqual(empty.total_size, 0, 'empty total_size');
    const noLarge = P.parseAnalyzeJson(fixture('analyze-no-large-files.json'));
    assert(noLarge && Array.isArray(noLarge.entries), 'no-large-files entries');
    assertEqual(noLarge.large_files, undefined, 'large_files omitted when empty');
    const truncated = fixture('analyze-no-large-files.json').slice(0, 120);
    assertEqual(P.parseAnalyzeJson(truncated), null, 'truncated analyze JSON must return null');
  });
}

// -------------------------------------------------------------------- version

function testVersion() {
  group('parseVersion (CONTRACT §4)');
  record('extracts version and platform fields', () => {
    const v = P.parseVersion(fixture('version.txt'));
    assert(v && typeof v === 'object', 'version fixture must parse');
    assertEqual(v.version, '1.61.0', 'version');
    assertEqual(v.os, '26.6.2', 'macOS');
    assertEqual(v.arch, 'arm64', 'architecture');
    assertEqual(v.kernel, '25.6.0', 'kernel');
    assertEqual(v.sip, 'Enabled', 'SIP');
    assertEqual(v.diskFree, '326.22GB', 'disk free');
    assertEqual(v.install, 'Manual', 'install method');
    assertEqual(v.shell, '/bin/zsh', 'shell');
    assertEqual(v.nightly, false, 'nightly flag');
  });

  record('garbage input degrades without throwing', () => {
    const v = P.parseVersion('not a version banner');
    assert(v && v.version === '', 'garbage version must be empty');
    assertEqual(P.parseVersion(null).version, '', 'null version');
    assertEqual(P.parseVersion('Mole version 1.61.0\nChannel: Nightly (abc123)\n').nightly, true,
      'nightly channel detection');
  });
}

// ------------------------------------------------------------ mock bridge

function makeDomShim() {
  function element() {
    const el = {
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
      setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
      addEventListener() {}, removeEventListener() {},
      insertAdjacentHTML() {}, querySelector() { return null; },
      querySelectorAll() { return []; },
      focus() {}, click() {}, remove() {},
      innerHTML: '', textContent: '', value: '',
      scrollTop: 0, scrollHeight: 0, offsetHeight: 0
    };
    return el;
  }
  return {
    createElement: element,
    createElementNS: element,
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    documentElement: element(),
    body: element(),
    head: element(),
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getElementById() { return null; },
    readyState: 'complete'
  };
}

async function testMockBridge() {
  group('mock bridge (CONTRACT §16)');
  if (!fs.existsSync(MOCK_PATH)) {
    process.stdout.write('  SKIP  gui/app/web/js/mock.js not present yet (mock bridge contract not checked)\n');
    return;
  }
  const outcomes = [];
  try {
    const source = fs.readFileSync(MOCK_PATH, 'utf8');
    global.window = global;
    global.document = global.document || makeDomShim();
    global.location = {
      search: '?mock=1&screen=dashboard&scenario=default',
      hash: '', href: 'file:///gui/index.html?mock=1', pathname: '/gui/index.html'
    };
    global.__MOLE_MOCK__ = true;
    global.__MOLE_MOCK_SCREEN__ = 'dashboard';
    global.__MOLE_MOCK_SCENARIO__ = 'default';
    try {
      Object.defineProperty(global, 'localStorage', {
        configurable: true,
        value: {
          _data: {},
          getItem(k) { return this._data[k] == null ? null : this._data[k]; },
          setItem(k, v) { this._data[k] = String(v); },
          removeItem(k) { delete this._data[k]; }
        }
      });
    } catch (error) { /* keep native localStorage if it is writable */ }
    global.setTimeout = setTimeout;
    global.clearTimeout = clearTimeout;
    global.setInterval = setInterval;
    global.clearInterval = clearInterval;
    global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    global.performance = global.performance || { now: () => Date.now() };
    vm.runInThisContext(source, { filename: MOCK_PATH });

    const events = [];
    global.__moleNative = (json) => {
      try { events.push(JSON.parse(json)); } catch (error) { events.push({ type: '__invalid__', raw: json }); }
    };
    const handler = global.window.webkit && global.window.webkit.messageHandlers &&
      global.window.webkit.messageHandlers.mole;
    assert(handler && typeof handler.postMessage === 'function',
      'mock.js did not install window.webkit.messageHandlers.mole.postMessage');
    const post = (message) => handler.postMessage(message);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (predicate, timeoutMs) => {
      const start = Date.now();
      while (Date.now() - start < (timeoutMs || 1500)) {
        if (predicate()) return true;
        await wait(10);
      }
      return false;
    };

    // init -> ready
    if (global.window.MoleBridge && typeof global.window.MoleBridge.init === 'function') {
      try { await global.window.MoleBridge.init(); } catch (error) { /* bridge optional */ }
    } else {
      post({ action: 'init' });
    }
    outcomes.push(['init emits ready', await until(() => events.some((e) => e.type === 'ready'), 1000)]);

    // run -> job_started + output + exit
    events.length = 0;
    post({ action: 'run', jobId: 'job-test', args: ['--version'], privileged: false, label: 'test run' });
    const sawExit = await until(() => events.some((e) => e.type === 'job_exit' && e.jobId === 'job-test'), 4000);
    outcomes.push(['run emits job_started', events.some((e) => e.type === 'job_started')]);
    outcomes.push(['run emits job_output', events.some((e) => e.type === 'job_output')]);
    outcomes.push(['run emits job_exit', sawExit]);
    const exit = events.find((e) => e.type === 'job_exit' && e.jobId === 'job-test');
    outcomes.push(['run job_exit code is 0', exit && exit.code === 0]);

    // cancel -> cancelled exit
    events.length = 0;
    post({ action: 'run', jobId: 'job-cancel', args: ['--version'], privileged: true, label: 'cancel me' });
    await wait(20);
    post({ action: 'cancel', jobId: 'job-cancel' });
    const sawCancel = await until(
      () => events.some((e) => e.type === 'job_exit' && e.jobId === 'job-cancel' && e.cancelled === true),
      2000
    );
    outcomes.push(['cancel emits cancelled job_exit', sawCancel]);

    // config round-trip
    events.length = 0;
    post({ action: 'getConfig' });
    outcomes.push(['getConfig emits config_changed', await until(() => events.some((e) => e.type === 'config_changed'), 500)]);
    events.length = 0;
    post({ action: 'setConfig', patch: { lastScreen: 'clean' } });
    outcomes.push(['setConfig emits config_changed', await until(() => events.some((e) => e.type === 'config_changed'), 500)]);

    // benign actions must not throw
    let threw = '';
    for (const message of [
      { action: 'reveal', path: '/tmp' },
      { action: 'openExternal', url: 'https://example.com' },
      { action: 'clipboard', text: 'x' },
      { action: 'exportJSON', suggestedName: 'x.json', content: '{}' },
      { action: 'chooseCLI' },
      { action: 'openTerminal', args: ['installer'] },
      { action: 'unknown-action' }
    ]) {
      try { post(message); } catch (error) { threw = message.action + ': ' + error.message; break; }
    }
    await wait(30);
    outcomes.push(['unknown/benign actions do not throw', threw === '']);

    for (const [name, passed] of outcomes) {
      record('mock: ' + name, () => { assert(passed, name); });
    }
  } catch (error) {
    record('mock bridge load + contract', () => { throw error; });
  }
}

// ---------------------------------------------------------------------- main

async function main() {
  process.stdout.write('Mole GUI CLI-contract tests\n');
  process.stdout.write('root: ' + ROOT + '\n');

  P = loadParsers();

  testStripAnsi();
  testSizes();
  testCleanPreview();
  testOptimizePreview();
  testPurgePreview();
  testUninstallPreview();
  testJsonParsers();
  testVersion();
  await testMockBridge();

  const failed = results.filter((r) => r.error);
  const passed = results.length - failed.length;
  process.stdout.write('\n' + '='.repeat(70) + '\n');
  if (!failed.length) {
    process.stdout.write('PASS ' + passed + '/' + results.length + ' contract checks\n');
    return 0;
  }
  process.stdout.write('FAIL ' + failed.length + '/' + results.length + ' contract checks\n');
  failed.forEach((r) => {
    process.stdout.write('\n[' + r.group + '] ' + r.name + '\n');
    process.stdout.write('  ' + String(r.error && r.error.stack ? r.error.stack : r.error).split('\n').join('\n  ') + '\n');
  });
  process.stdout.write('\n' + '='.repeat(70) + '\n');
  return 1;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  process.stderr.write('contract test harness crashed:\n' + (error && error.stack ? error.stack : error) + '\n');
  process.exitCode = 2;
});
