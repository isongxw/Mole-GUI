# Mole GUI — build specification

This folder holds **Mole GUI**, a local macOS desktop app that gives the Mole CLI a
native window with a web UI. The app is a thin host: every operation is an argv
invocation of the bundled Mole CLI (`gui/build/Mole GUI.app/Contents/Resources/mole-runtime/mole`).
No business logic is duplicated in the app. The CLI remains the single source of
truth for safety, whitelists, protection rules, logging and dry-run behavior.

Owner: the Mole maintainer (this checkout). The app is an additive surface under
`gui/`; it does **not** change CLI behavior, the router, or the product rules in
`AGENTS.md`. Do not edit any CLI shell code, Go code, tests, or README copies for
this work.

## Goals

- One installable `.app` (ad-hoc signed, local build) for macOS 13+ on Apple Silicon.
- Complete a real task end-to-end without a terminal: preview, confirm, execute, read the log.
- Cover: dashboard, clean, uninstall, optimize, project purge / installer hand-off,
  disk analyze, history, settings.
- Safety first: destructive commands always show a preview and an explicit confirmation.
  The GUI never deletes files itself; it only runs documented CLI commands.
- Look like a finished macOS app: dark, quiet, dense, fast, no network calls.

## Non-goals

- No menu bar agent, background monitor, notifications, scheduler, or auto-clean.
- No CLI feature parity work; no new CLI flags; no changes outside `gui/`.
- No network access from the app or the web view. No remote assets, no telemetry.
- No app notarization or distribution to other Macs in this iteration.
- No editing of whitelist files from the GUI in v1 (use `mo clean --whitelist` in Terminal;
  the Settings screen documents it).

## Architecture

```
Mole GUI.app/Contents/
├── MacOS/MoleGUI                 Swift host (AppKit + WKWebView + posix_spawn)
├── Resources/
│   ├── web/                      index.html, css/, js/ (bundled, loaded via file://)
│   └── mole-runtime/             mole, mo, lib/, bin/ (CLI copied at build time)
└── Info.plist
```

- The web UI talks to Swift through one message handler: `window.webkit.messageHandlers.mole`.
- Swift pushes events back with `window.__moleNative(jsonString)`.
- Commands are spawned with `posix_spawn` using an **argv array** (never a shell string),
  in their own process group, with `/dev/null` stdin for normal jobs.
- Cancel = `SIGINT` to the process group, then `SIGTERM`, then `SIGKILL`.
- Privileged jobs run through a small pre-auth wrapper (see "Sudo model").
- All UI resources are local files. The web view is not allowed to navigate away;
  external links open in the default browser through `openExternal`.

## File ownership (do not write outside your scope)

| Path | Owner |
| --- | --- |
| `gui/app/MoleGUI/*.swift`, `gui/build.sh`, `gui/app/Info.plist`, `gui/tools/snapshot-web.sh`, `Makefile`, `.gitignore` | Lead |
| `gui/app/web/index.html`, `css/styles.css`, `js/app.js`, `js/bridge.js`, `js/ui.js`, `js/icons.js`, `js/parsers.js`, `js/mock.js`, `js/screens/dashboard.js` | ui-core |
| `gui/app/web/js/screens/clean.js`, `js/screens/optimize.js` | ui-clean |
| `gui/app/web/js/screens/uninstall.js`, `analyze.js`, `history.js`, `settings.js`, `reclaim.js` | ui-data |
| `gui/CONTRACT.md`, `gui/fixtures/**`, `gui/tests/**` | cli-contract |
| `gui/tools/icon.swift`, `gui/install.sh`, `gui/README.md` | packaging |
| `gui/tools/snapshot-web.sh`, integration fixes | Lead |

`index.html` is owned by ui-core and **must pre-load every screen script** listed above,
even if a file is still empty during development. Empty/missing modules must not break
the app: the router shows a friendly "screen unavailable" placeholder.

Every screen file injects its own scoped `<style>` once (selector prefix
`[data-screen="<name>"]`) instead of editing `styles.css`.

## Screen module contract

`js/app.js` (ui-core) implements a registry and router:

```js
window.MoleScreens.register('clean', {
  title: '清理',
  subtitle: '先预览，再清理缓存与临时文件',
  icon: 'sparkles',                 // icon name from js/icons.js
  render(root, ctx) { /* mount DOM into root */ },
  refresh() { /* optional: invoked by Cmd+R and the header refresh button */ },
  unmount() { /* optional: cancel running jobs, clear timers */ },
});
```

- `ctx = { scenario, mock, navigate(screen), showToast(msg, tone) }`.
- The router mounts exactly one screen at a time, calls `unmount()` on the previous one.
- Screens must cancel their jobs in `unmount()`.
- Screens must not use `innerHTML` with CLI output; use `textContent` or `MoleUI.escapeHtml`.

## Bridge API

### JS → Swift (`MoleBridge.post(action, payload)`)

| action | payload | notes |
| --- | --- | --- |
| `init` | `{}` | Swift replies with `init` event |
| `run` | `{jobId, args:[...], privileged:bool, label}` | starts a CLI job |
| `cancel` | `{jobId}` | SIGINT → TERM → KILL |
| `getConfig` / `setConfig` | `{patch:{...}}` | allowed keys: `cliPath`, `lastScreen` |
| `chooseCLI` | `{}` | NSOpenPanel, then emits `cli_changed` |
| `reveal` | `{path}` | reveal in Finder |
| `openExternal` | `{url}` | https/http only |
| `openTerminal` | `{args:[...]}` | opens Terminal running the bundled CLI with these args; used for interactive commands |
| `clipboard` | `{text}` | copy text |
| `exportJSON` | `{suggestedName, content}` | save panel |
| `uninstallSelf` | `{}` | move the app bundle to Trash, then quit |
| `quit` | `{}` | quit app |

### Swift → JS events (`window.__moleNative(jsonString)`)

| type | fields |
| --- | --- |
| `ready` | `{app:{version,build}, cli:{path,version,source,ok,error}, config, home, paths:{logs,config,appSupport,downloads,applications}}` |
| `cli_changed` | `cli` (same shape) + optional `error` |
| `config_changed` | `{config}` |
| `job_started` | `{jobId, args, label, privileged}` |
| `auth_waiting` | `{jobId}` — native password dialog is visible |
| `job_output` | `{jobId, stream:"stdout"\|"stderr", text}` |
| `job_exit` | `{jobId, code, cancelled, durationMs, error}` — `error` is `""`, `auth_cancelled`, `auth_failed`, `auth_session_failed`, `cli_missing`, or `spawn_failed` |
| `toast` | `{message, tone}` |
| `native_error` | `{message}` |

`code` is the CLI exit status; on cancel it is typically 130/143. `error` is a
transport/auth failure string, not a CLI failure. A CLI failure is `code != 0`.

### Job helper (ui-core, used by every screen)

```js
const job = MoleBridge.runJob({
  args: ['clean', '--dry-run'],
  privileged: false,          // true -> pre-auth wrapper
  label: '预览清理',           // shown in logs / job chips
  onStart({args, privileged}) {},
  onOutput(text, stream) {},  // already ANSI-stripped? NO — raw; use MoleUI.stripAnsi
  onExit({code, cancelled, durationMs, error}) {},
});
job.cancel();
```

Only one destructive job may run at a time. Each screen enforces its own guard
(disable action buttons while a job is active). Multiple screens never run jobs
simultaneously because the router unmounts the previous screen and cancels it.

## Sudo model

- Normal jobs never prompt: stdin is `/dev/null`.
- `privileged: true` makes Swift show a native secure password dialog
  (`NSAlert` + `NSSecureTextField`) unless a sudo session was already established
  by this app within the last few minutes. On confirm, Swift spawns:
  `/bin/bash -c '<read password>; printf ... | sudo -S -p "" -v; exec "$0" "$@"' <cli> <args...>`
  so the CLI finds a valid cached sudo session and does not open its own dialog.
- If the dialog is cancelled: no process is spawned; `job_exit` fires with
  `cancelled:true, code:130, error:"auth_cancelled"`. The UI aborts cleanly and
  re-enables buttons.
- Wrong password: `error:"auth_failed"`, `code:99`. The UI shows "密码不正确，请重试".
  If sudo authenticates but the cached session is not visible to the CLI, the wrapper
  exits 98 and the UI receives `error:"auth_session_failed"` ("授权未生效，请重试").
- The app never stores the password, never logs it, and never puts it in argv/env.
- Screens that start a privileged job should first show a short explainer/confirm
  ("需要管理员权限；Mole 会请求一次系统密码").

The web UI must never ask for the password itself.

## Data contracts (authoritative details in gui/CONTRACT.md)

Commands used by the GUI (arg arrays; always run the bundled CLI):

| screen | command |
| --- | --- |
| init/version | `['--version']` |
| dashboard | `['status', '--json']` |
| clean preview | `['clean', '--dry-run']` (add `--debug` when the debug toggle is on) |
| clean run | `['clean']` (privileged) |
| uninstall list | `['uninstall', '--list']` |
| uninstall preview | `['uninstall', '--dry-run', ...names]` |
| uninstall run | `['uninstall', ...names]` (privileged; append `--permanent` only when the user opted in) |
| optimize preview | `['optimize', '--dry-run']` |
| optimize run | `['optimize']` (privileged) |
| purge preview | `['purge', '--dry-run']` |
| purge run | `['purge', '--yes']` (confirm in UI first) |
| installer | interactive only → `openTerminal` with `['installer']` |
| analyze | `['analyze', '--json', path]` |
| history | `['history', '--json', '--limit', '100']` |

Real sample outputs live in `gui/fixtures/`. Parsers must be defensive: any
unexpected shape degrades to the raw log panel instead of throwing.

Key preview summary (clean):

```
======================================================================
Dry run complete - no changes made
Potential space: 46.83GB+ | Items: 1681 | Categories: 7
Detailed file list: /Users/.../.config/mole/clean-list.txt
Use mo clean --whitelist to add protection rules
======================================================================
```

`mo uninstall --list` prints a JSON array; `status --json`, `analyze --json` and
`history --json` are plain JSON objects. `uninstall --dry-run` prints a human
preview + ANSI-free file list.

## Design system

Dark, quiet, dense. No emoji in the UI chrome; icons are inline SVG.

Tokens (CSS custom properties on `:root`):

```css
--bg: #0b0a12;          --bg-elevated: #14111f;  --bg-card: #171326;
--bg-hover: #1e1930;    --border: rgba(255,255,255,.07);
--border-strong: rgba(255,255,255,.12);
--text: #f4f2fb;        --text-secondary: #b3accb;  --text-muted: #7c7596;
--accent: #a78bfa;      --accent-strong: #8b5cf6;   --accent-soft: rgba(167,139,250,.14);
--cyan: #22d3ee;        --success: #34d399;          --warning: #fbbf24;  --danger: #f87171;
--radius-sm: 8px; --radius: 12px; --radius-lg: 18px;
--font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
--mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
```

- Window: 1280×840 default, min 1060×700. Content background may use one soft
  radial glow (purple/blue, very low alpha) — no images.
- Titlebar: native traffic lights over web content. The top **40px of the web page
  is a native window-drag strip**: keep it free of interactive elements, visually
  part of the shell (sidebar/header background continues into it).
- Sidebar: 232px, nav rows 40px with icon + Chinese label; active row uses
  `--accent-soft` background + 2px accent bar; footer shows CLI version + status dot.
- Header: screen title (20px/600), subtitle (12.5px muted), right-side action slot.
- Cards: `--bg-card`, 1px `--border`, radius 14–18px, 18–24px padding.
- Buttons: primary = accent gradient (violet→indigo), secondary = `--bg-hover`,
  ghost = transparent, danger = red tint. Height 34px, radius 10px.
- Log panel: `--mono` 12px, line-height 1.6, dark inset background
  (`#0a0910`), max-height 360px, auto-scroll, monochrome text with subtle tinting
  for `✓`/`→`/`⚠`/`✗` prefixes (implemented in `MoleUI.logPanel`). Caps total
  buffered text at ~400 KB.
- Tables: header 11px uppercase muted, rows 40px, separators `--border`, hover row.
- Modals: 480px, centered, blurred scrim; danger confirm requires the primary
  button to be red and the dialog text must state what will happen.
- Toasts: bottom-right stack, 3.2s, tone colors.
- Motion: 160ms ease-out for hover/enter; a subtle shimmer for running jobs.
- Empty states: centered icon + title + hint + optional action.
- Fonts: never load webfonts; use system fonts.

### Base CSS classes provided by ui-core

Screens may rely on these (and add their own scoped styles):

```
.app-shell .sidebar .nav-item .nav-item.active .nav-icon .nav-label
.sidebar-footer .cli-chip .main-col .titlebar-drag .screen-header
.screen-body .card .card-header .card-title .card-subtitle .card-body
.btn .btn.primary .btn.secondary .btn.ghost .btn.danger .btn.small .btn[disabled]
.badge .badge.success .badge.warning .badge.danger .badge.accent .badge.info
.grid .grid.cols-2 .grid.cols-3 .grid.cols-4 .stack .row .spacer
.stat-value .stat-label .stat-sub .muted .mono .divider
.log-panel .log-head .log-body .log-line .log-line.ok .log-line.warn .log-line.err
.table .table-head .table-row .table-cell
.empty-state .spinner .progress .progress-bar
.modal-backdrop .modal .modal-title .modal-body .modal-actions
.toast-stack .toast .toast.success .toast.warning .toast.danger
.field .input .select .checkbox .switch .tabs .tab .tab.active
```

## `MoleUI` helper API (implemented by ui-core exactly)

```js
MoleUI.icon(name, size = 18)                  // -> SVG string (names: dashboard, broom, trash, wand,
                                              //   archive, chart, history, settings, refresh, play, stop,
                                              //   search, chevron-right, chevron-down, folder, file, check,
                                              //   x, alert, info, shield, cpu, memory, disk, battery, wifi,
                                              //   clock, terminal, external, sparkles, arrow-left, copy,
                                              //   download, loader, gauge, package, database)
MoleUI.el(html)                               // -> Element (single root)
MoleUI.button({label, variant, icon, onClick, disabled, title, size})   // -> HTMLButtonElement
MoleUI.card({title, subtitle, body, actions, className})                // -> HTMLElement
MoleUI.badge(text, tone = 'neutral')          // -> string
MoleUI.stat(label, value, sub, tone)          // -> string (card body HTML)
MoleUI.ring({value, label, sublabel, tone, size = 132})   // -> string (SVG)
MoleUI.progressBar(value, tone)               // -> string
MoleUI.emptyState({icon, title, hint, actionLabel, onAction}) // -> HTMLElement
MoleUI.logPanel({title = '运行日志', hint, maxHeight = 360})
   // -> {element, write(text, stream), reset(), setState(state, text), setProgress(pct), setCollapsed(bool)}
MoleUI.modal({title, body, confirmLabel, cancelLabel = '取消', danger, hideCancel,
              onConfirm, onCancel})           // -> {close()}  (body: string or Node)
MoleUI.confirm({title, body, confirmLabel = '确认', danger, checkboxLabel}) // -> Promise<boolean>
MoleUI.toast(message, tone = 'info')          // tone: info|success|warning|danger
MoleUI.formatBytes(bytes)                     // 1234567 -> "1.18 MB"
MoleUI.formatSize(str)                        // "46.83GB+"/"522.2MB"/"0B" -> bytes|null
MoleUI.parseSize(str)                         // alias of formatSize
MoleUI.stripAnsi(text)
MoleUI.escapeHtml(text)
MoleUI.timeAgo('2026-10-17 21:44:57')
MoleUI.jobState // {busy, jobId, label} global
```

All helpers must work in Chrome headless with mock mode.

## Application shell behavior

- Sidebar nav (in order): 概览 dashboard, 清理 clean, 卸载 uninstall, 优化 optimize,
  空间回收 reclaim, 磁盘分析 analyze, 历史 history, 设置 settings.
- Global header shows screen title/subtitle + a right-side action slot filled by the screen.
- Global banner when CLI is missing: explains the app could not find a runnable Mole CLI,
  buttons: 重新检测 (`init`), 选择 CLI… (`chooseCLI`), and the install command to copy
  (`curl -fsSL https://raw.githubusercontent.com/tw93/Mole/main/install.sh | bash`).
- Keyboard: Cmd+1…8 switch screens, Cmd+R refresh current screen (`refresh()` or re-mount),
  Cmd+, opens settings, Esc closes modals. Text inputs keep native Cmd+C/V (native Edit menu).
- Expose `window.__moleOpenScreen = (name) => navigate(name)` so the native menu
  ("设置…", Cmd+,) can route into the web UI.
- Remember `lastScreen` via `setConfig`; restore on next launch.
- Native events `toast` are shown directly; `native_error` shows a danger toast.
- On first launch show a one-time short safety note card on 概览 (dismiss stored in
  config `welcomeSeen` via `setConfig`).

## Mock mode (for Chrome headless screenshots and dev)

`index.html?mock=1` loads `js/mock.js` **after** `bridge.js`. The native
`--webview-check` mode cannot append a query string to a `file://` URL, so mock.js
must also accept host-injected globals (`window.__MOLE_MOCK__ === true`,
`window.__MOLE_MOCK_SCREEN__`, `window.__MOLE_MOCK_SCENARIO__`) and prefer them over
URL parameters. It:

- fakes `window.webkit.messageHandlers.mole` and answers `post()` actions asynchronously
  through `window.__moleNative(...)`;
- serves the inline fixtures in `js/mock.js` (sample status, apps, history, analyze,
  clean/optimize/purge previews, version);
- simulates streaming output in chunks (~8 lines every 40ms), then `job_exit`;
- honors `scenario`:
  - `dashboard`: `default`, `loading`, `error`, `cli-missing`
  - `clean`: `default`, `preview`, `running`, `result`
  - `uninstall`: `default`, `selected`, `preview`, `running`
  - `optimize`: `default`, `preview`, `running`
  - `reclaim`: `default`, `purge-preview`, `installer`
  - `analyze`: `default`, `result`, `empty`
  - `history`: `default`, `empty`
  - `settings`: `default`
- sets `window.__moleSnapshotReady = true` when the scenario has settled, and
  `document.documentElement.dataset.snapshot = 'ready'`; app.js sets
  `window.__moleSnapshotReady = false` while a job is running in mock mode.
- Screen modules read `ctx.scenario` and auto-trigger the matching action in `render()`.

The native app sets `mock=false` and provides the real bridge; **screen code must not
contain mock-only branches** beyond reading `ctx.scenario`.

## Build and verify

```bash
# build the CLI Go helpers first (needed by the bundled runtime)
make build

# build the app  -> gui/build/Mole GUI.app
bash gui/build.sh

# install to /Applications and launch
bash gui/install.sh

# headless smoke tests (no GUI session needed)
"gui/build/Mole GUI.app/Contents/MacOS/MoleGUI" --self-test
"gui/build/Mole GUI.app/Contents/MacOS/MoleGUI" --exec --version   # runs bundled CLI
"gui/build/Mole GUI.app/Contents/MacOS/MoleGUI" --webview-check --snapshot /tmp/wk.png
"gui/build/Mole GUI.app/Contents/MacOS/MoleGUI" --job-test status --json

# web UI snapshots via Chrome headless
bash gui/tools/snapshot-web.sh          # -> gui/build/snapshots/*.png
```

Required checks before reporting done:

1. `bash gui/build.sh` succeeds; app bundle contains `web/` and `mole-runtime/`.
2. `--self-test` prints `"ok": true` with a resolved CLI version.
3. `--exec --version` prints the CLI version.
4. `bash gui/tools/snapshot-web.sh` produces a non-blank PNG for every screen/scenario.
5. `node gui/tests/run.js` passes (parsers + mock bridge).
6. No shellcheck/shfmt regressions: `./scripts/check.sh --no-format` may skip GUI shell
   files but `gui/build.sh`/`gui/install.sh` must pass `bash -n` and `shfmt -d`.
7. Manual code review for argv injection, password handling, and cancel/cleanup paths.

## Safety rules for this work

- Never run `mo clean`, `mo uninstall`, `mo optimize`, `mo purge --yes` or `mo installer`
  for real during development; only `--dry-run` / `--list` / `--json` / `--version`.
  Use `MOLE_TEST_NO_AUTH=1` with any CLI command you invoke.
- Never paste user data, tokens or paths from this Mac into code or docs beyond the
  fixture samples already committed (they are this machine's own outputs; keep them
  limited to what the UI needs and scrub usernames to `/Users/example` where practical).
- Never build shell strings from UI input. `args` is always an argv array. The only
  shell string is the fixed sudo pre-auth wrapper; the password goes through stdin,
  never argv.
- The app never deletes user files. Destructive UI actions must map to a documented
  CLI command with a visible preview, an explicit confirmation, and a cancel path.
- Do not add network requests, analytics, auto-updaters, or login items.
- Do not modify files outside the ownership table; if a change is needed elsewhere,
  message the Lead instead.
