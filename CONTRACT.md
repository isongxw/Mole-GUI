# Mole CLI output contract for the GUI

Authority: `gui/SPEC.md` for GUI behavior; this file for every byte the GUI reads from
the bundled CLI. Source of truth is the CLI in this checkout (`./mole`, version
`1.61.0`), verified on macOS arm64 by the commands recorded in §14. If the GUI and
this document disagree, the GUI is wrong.

The GUI never deletes files itself. Every operation is an argv invocation of the
bundled CLI; the CLI owns safety, whitelists, protection rules, logging and
dry-run semantics. This document fixes the argv arrays, the exit codes, the
streams, the ANSI/CR behavior, the human-preview formats and the JSON schemas the
web UI is allowed to depend on.

---

## 1. Invocation model

Spawn with `posix_spawn` and a **literal argv array** (never a shell string), in
its own process group, with stdin `/dev/null` for every non-interactive job.
`installer` is the only command the GUI must not run in-process: it is handed to
Terminal (`openTerminal(['installer'])`).

| screen | argv |
| --- | --- |
| init / version | `['--version']` |
| dashboard | `['status', '--json']` |
| clean preview | `['clean', '--dry-run']` (+ `'--debug'` when the debug toggle is on) |
| clean run | `['clean']` (privileged) |
| uninstall list | `['uninstall', '--list']` |
| uninstall preview | `['uninstall', '--dry-run', ...names]` |
| uninstall run | `['uninstall', ...names]` (privileged; append `'--permanent'` only on explicit opt-in) |
| optimize preview | `['optimize', '--dry-run']` |
| optimize run | `['optimize']` (privileged) |
| purge preview | `['purge', '--dry-run']` |
| purge run | `['purge', '--yes']` (privileged only in the sense that the wrapper is not needed; `purge` never asks for sudo) |
| installer | interactive only → `openTerminal(['installer'])` |
| analyze | `['analyze', '--json', path]` |
| history | `['history', '--json', '--limit', '100']` |

Rules:

- `path` for analyze is passed as an absolute path. The CLI resolves relative
  paths against its cwd, which the GUI must not depend on.
- Do **not** set `MOLE_TEST_NO_AUTH=1` or `MOLE_TEST_MODE=1` in production. They
  disable sudo adoption and (if `NO_COLOR` is unset) force ANSI colors on even
  when stdout is a pipe. They exist for tests only.
- Do not set `MOLE_DRY_RUN` directly; pass `--dry-run`.
- The GUI may set `NO_COLOR=1` (and optionally `TERM=dumb`) for non-interactive
  jobs. This is the only supported way to suppress CLI color; parsing must still
  strip ANSI defensively because at least one command emits a raw CSI sequence
  unconditionally (§3).
- stdin is `/dev/null`. Two destructive commands still run unattended at EOF:
  `purge --yes` (by design) and `uninstall` (accidental auto-confirm, §7.4).
  The GUI must confirm in its own UI **before** spawning either.
- Cancellation: `SIGINT` to the process group, then `SIGTERM`, then `SIGKILL`.
  The CLI maps these to exit `130` / `143`.
- stdout and stderr are separate streams and both matter. ANSI-free output is the
  normal production case; treat any byte as untrusted display text.

---

## 2. Common conventions

### 2.1 Streams and exit codes

- Human output (headings, sections, summaries, dry-run previews) goes to
  **stdout**.
- Diagnostics, debug logs, warnings and refusal reasons go to **stderr**.
- Exit code `0` means the command completed its documented job (including
  dry-runs and interactive cancellation paths documented below).
- Exit code `1` means the command failed or refused to start (bad flag, missing
  dependency, scan failure, non-interactive destructive command without
  consent). The reason is on stderr unless noted.
- Exit code `124` means a command-level timeout; `130` = SIGINT, `143` = SIGTERM.
- Only `--version`, `--help`, unknown-command and bad-flag paths are
  synchronous and cheap; everything else scans the disk.

### 2.2 Summary block

Most commands end with the shared summary block from `lib/core/log.sh`
(`print_summary_block`):

```
<blank line>
======================================================================      <- 70 '=' chars max (terminal width capped at 70)
<heading>
<detail line 1>
<detail line 2>
...
======================================================================
[Debug session log saved to: <path>]                                       <- only with --debug
```

- The divider is `min(terminal columns, 70)` `=` characters. With stdout piped
  (GUI) `tput cols` fails and the divider is exactly 70 `=` characters.
- The heading vocabulary is listed per command below.
- Under `--debug` the final line `Debug session log saved to: <absolute path>` is
  appended **after** the closing divider (stdout).
- A summary block never repeats per-item skip noise; per-item detail is in the
  body and in the operation log.

### 2.3 Icon vocabulary (strip-ANSI text)

The CLI prefixes lines with fixed Unicode glyphs. The GUI may map them to tones;
the parsers must key on the glyph, not on color.

| glyph | source constant | meaning on stdout |
| --- | --- | --- |
| `➤` | `ICON_ARROW` | section header / prompt line |
| `→` | `ICON_DRY_RUN` | dry-run item, or "would do X" row |
| `✓` | `ICON_SUCCESS` | success row, "Nothing to clean", "would remove" |
| `◎` | `ICON_CONFIRM` / `ICON_WARNING` | confirm/match line, skipped/warning row |
| `⊙` | `ICON_REVIEW` | manual-review / kept row |
| `-` | literal gray dash | unavailable / disabled row |
| `•` | `ICON_LIST` | audit sub-item (uninstall, history) |
| `↳` | `ICON_SUBLIST` | nested detail row (whitelist entries) |
| `⚙` | `ICON_ADMIN` | machine summary line (Apple Silicon, free space, RAM/disk) |
| `○` | `ICON_EMPTY` | empty/not-found row |
| `●` | `ICON_SOLID` | selected checkbox (installer TUI only) |

`☻` (`ICON_ERROR`) appears only in colored TTY diagnostics; do not parse it.

### 2.4 Colors

- Colors are ANSI SGR sequences controlled once in `lib/core/base.sh`.
  Precedence: non-empty `NO_COLOR` disables → `MOLE_TEST_MODE`/`MOLE_TEST_NO_AUTH`
  force on → `TERM=dumb` disables → only a TTY enables.
- Production GUI pipes are not a TTY, so the bash commands emit **no SGR color**
  and usually no CR (spinners are TTY-gated).
- Exception: the uninstall direct/dry-run path calls `clear_screen()`
  unconditionally, which writes the two-sequence clear `ESC[2J ESC[H` to stdout
  even when piped. It must be stripped.
- Never parse color-coded text. Always `MoleParsers.stripAnsi()` first.

### 2.5 ANSI/CR stripping contract

`stripAnsi(text)` must remove at least:

| sequence | example | source |
| --- | --- | --- |
| CSI (SGR, erase, cursor) | `ESC[0m`, `ESC[2J`, `ESC[H`, `ESC[1A`, `ESC[2K`, `ESC[?25l` | colors, `clear_screen`, spinners, cursor hide |
| OSC (title/hyperlink) terminated by BEL or ST | `ESC]0;title BEL`, `ESC]8;;url ESC\` | terminal title |
| single-char ESC + final byte | `ESC(B`, `ESC7` | margin/line-drawing resets |
| C1 CSI | `U+009B ...` | rare 8-bit CSI |
| bare CR | `\r` | spinner line rewrites, prompt erase |
| CRLF | `\r\n` → `\n` | any redirected TTY capture |

Do not remove `\n`, Unicode box/arrow glyphs, or CJK text. After stripping,
normalize `\r\n` → `\n` and lone `\r` → `\n` for line-oriented parsing.

### 2.6 Human size format (important)

`bytes_to_human` (and `bytes_to_human_kb`) in `lib/core/base.sh` are
**decimal (1000-based)**:

- `>= 1,000,000,000` → `%d.%02dGB`, `>= 1,000,000` → `%d.%01dMB`,
  `>= 1000` → `%dKB`, otherwise `%dB`.
- So `46.83GB` means 46.83e9 bytes, not 46.83 GiB. `1.18 MB` is 1.18e6.
- Unknown sizes are printed as `0B`, `--`, `N/A`, or omitted by context.
- Extra qualifiers seen in output: trailing `+` (partial total), `at least `
  prefix, `about ` prefix, `~` prefix on paths, `unknown`/`unmeasured` words.

`MoleUI.formatBytes` is binary (1024-based, `1234567 -> "1.18 MB"`), so
`MoleUI.parseSize`/`formatSize` must use **1024 multipliers** to round-trip with
`formatBytes` (`formatBytes(parseSize("46.83GB")) -> "46.8 GB"`). Parsed bytes
are therefore normalized display counts, not forensic byte counts (CLI labels are
decimal; error up to ~7.4% for GB). Never use parsed human sizes for an exact
"space freed" claim when a JSON numeric field exists. The machine-readable
sources are `status.memory.used`, `analyze.total_size`, `history` numeric fields;
clean/optimize/purge have no JSON surface.

`parseSize(null|'') -> null`, `parseSize('--' | '—' | '-' | 'n/a' | 'unknown') -> null`,
`parseSize('46.83GB+') -> bytes` (the `+` is metadata; parsers should also return
a `sizePlus`/`potentialPlus` boolean where documented).

### 2.7 Process environment

- `HOME` decides where logs and per-user config live. The GUI inherits the real
  user home; the fake-HOME sandbox in §14 is a test-only construct.
- `PATH` must include `/opt/homebrew/bin` when the GUI wants Homebrew-aware
  output (`uninstall --list` source labels, clean Homebrew sections).
- The CLI refuses to run as root (exit `1`, stderr
  `Run Mole without sudo; it requests administrator access when needed.`); the
  GUI runs it as the logged-in user and never elevates the whole CLI.
- The Go helpers (`bin/status-go`, `bin/analyze-go`) are built by `make build`
  and are missing from a source tree without it: `status`/`analyze` then exit `1`
  with stderr `Bundled status binary not found. ...` / `Bundled analyzer binary
  not found. ...`. Treat as CLI-unavailable, not as a parse failure.

---

## 3. TTY vs non-TTY behavior matrix (GUI = stdin `/dev/null`, stdout pipe)

| command | stdin not TTY | stdout not TTY |
| --- | --- | --- |
| `--version` | no effect | no effect; same 10-ish lines |
| `status` | no effect | **auto JSON** when `--json` omitted (`shouldUseJSONOutput`); `--json` always JSON |
| `analyze` | no effect | `--json` → JSON; without `--json` it starts the full-screen Bubble Tea TUI (needs a TTY; do not use from the GUI) |
| `history --json` | no effect | same JSON |
| `uninstall --list` | no effect | **auto JSON** array when piped, TTY prints a table |
| `uninstall --dry-run names` | preview + confirm reads stdin; EOF auto-confirms (§7.4) | output is the human preview; `clear_screen` CSI still emitted |
| `uninstall names` | same auto-confirm; this is destructive at EOF | human preview + summary |
| `clean --dry-run` | non-interactive; sudo session is adopted if cached, never prompted for | all sections printed; no color; no clear-screen (TTY-gated) |
| `clean` | prints `Running in non-interactive mode`; system-level cleanup skipped unless a sudo session is already cached (the GUI pre-auths) | no color; no clear-screen |
| `optimize --dry-run` | no sudo request; full task list expanded | no color; no clear-screen |
| `optimize` | requests sudo through `ensure_sudo_session`; with no TTY/cached session it prints `Skipping sudo-required optimizations: admin access not granted` and continues | no color |
| `purge --dry-run` | fully unattended | no color |
| `purge --yes` | fully unattended, deletes eligible artifacts, no prompt | no color |
| `purge` (no `--yes`) | **exit 1**, stderr refusal, no work done | title line only |
| `installer` | key-driven TUI; EOF confirms the default empty selection immediately — do not run headless | TUI escapes |

---

## 4. `--version`

argv: `['--version']` (also `version`, `-V`; all identical). Exit `0`; nothing on
stderr. Output (stdout, exactly):

```

Mole version 1.61.0
macOS: 26.6.2
Architecture: arm64
Kernel: 25.6.0
SIP: Enabled
Disk Free: 326.22GB
Install: Manual
Shell: /bin/zsh

```

- Leading blank line, trailing blank line (`printf '...\n\n'` for Shell).
- `Channel: Nightly (<sha>)` appears only for nightly builds, immediately after
  the version line.
- `Install:` is one of `Manual`, `Homebrew`, `Homebrew (HEAD <sha>)`, `Nix`.
- `Disk Free:` uses the decimal human format, or `Unknown`.
- Parser: first match `^Mole version (\d+\.\d+\.\d+)$`. Version is the only
  stable field; do not require line order beyond the version line.
- `mole` with an unknown command: stderr two lines
  (`Unknown command: <cmd>` / `Use 'mole --help' for usage information.`), exit 1.

Fixture: `gui/fixtures/version.txt`.

---

## 5. `status --json`

argv: `['status', '--json']`. Exit `0` on success. Exit `1` when no core metrics
could be collected (`status: collect failed: ...` on stderr). A collector error
with usable core metrics still prints JSON and exits `0`, so always parse stdout
first and surface stderr separately.

Schema (Go `cmd/status`, `MetricsSnapshot`; pretty-printed, 2-space indent,
trailing newline). Types are JSON types; `?` marks `omitempty` (field absent when
zero):

```jsonc
{
  "collected_at": "2026-10-17T21:50:42.270045+08:00",  // RFC3339 with offset
  "host": "example-host.local",           // string
  "platform": "darwin 26.6.2",                          // string
  "uptime": "19d 0h",                                   // string
  "uptime_seconds": 1641754,                            // uint64
  "procs": 955,                                         // uint64
  "hardware": {
    "model": "MacBook Pro", "cpu_model": "Apple M5",
    "total_ram": "32.0 GB", "disk_size": "926.3 GB",
    "os_version": "macOS 26.6.2", "refresh_rate": ""    // "" when unknown
  },
  "health_score": 97,                                   // int 0-100
  "health_score_msg": "Excellent: Restart Recommended", // string
  "cpu": {
    "usage": 28.18,                                     // float percent
    "per_core": [39.55, ...],                           // []float64
    "per_core_estimated": false,                        // bool
    "load1": 3.22, "load5": 3.38, "load15": 3.06,       // float
    "core_count": 10, "logical_cpu": 10,                // int
    "p_core_count": 4, "e_core_count": 6                // int
  },
  "gpu": [ { "name": "Apple M5", "usage": -1, "memory_used": 0,
             "memory_total": 0, "core_count": 10, "note": "sppci_vendor_Apple" } ],
  "memory": {
    "used": 21448310784, "total": 34359738368, "available": 12911427584,  // bytes
    "used_percent": 62.42,                              // float
    "swap_used": 0, "swap_total": 0,                    // bytes
    "cached": 10521149440,                              // bytes
    "pressure": ""                                      // normal|warn|critical|""
  },
  "disks": [ { "mount": "/", "device": "/dev/disk3s1s1",
               "used": 671207907328, "total": 994610155520, "used_percent": 67.48,
               "fstype": "apfs", "external": false, "smart_status": "verified",
               "purgeable": 0 } ],                      // purgeable? omitempty
  "trash_size": 0, "trash_approx": false,                // bytes, bool
  "disk_io": { "read_rate": 0, "write_rate": 0 },        // MB/s float
  "network": [ { "name": "en0", "rx_rate_mbs": 0.117, "tx_rate_mbs": 0.169,
                 "ip": "192.0.2.10" } ],
  "network_history": { "rx_history": [0.117], "tx_history": [0.169] },  // []float64
  "proxy": { "enabled": true, "type": "SOCKS", "host": "127.0.0.1:7897" },
  "batteries": [ { "percent": 63, "status": "AC", "time_left": "",
                   "health": "Good", "cycle_count": 26, "capacity": 100 } ],
  "thermal": { "cpu_temp": 0, "gpu_temp": 0, "battery_temp": 31.03,
               "fan_speed": 0, "fan_count": 0, "system_power": 45.23,
               "adapter_power": 68, "battery_power": -9.39 },
  "sensors": null,                                       // []SensorReading|null
  "bluetooth": [ { "name": "Example Keyboard", "connected": false, "battery": "" } ],
  "top_processes": [ { "pid": 41795, "ppid": 13547,
                       "name": "Google Chrome Helper (Renderer)",
                       "command": "Google Chrome Helper (Renderer)",
                       "cpu": 95.2, "memory": 1.1, "memory_bytes": 382205952 } ],
  "process_collected_at": "2026-10-17T21:46:07.538862+08:00",  // ?RFC3339
  "process_stale": false,                                // ?bool
  "zombie_count": 1,                                     // ?int
  "zombie_parents": [ { "pid": 39987, "name": "verge-mihomo", "count": 1 } ],
  "zombie_parents_complete": true,                       // ?bool
  "process_watch": { "enabled": true, "cpu_threshold": 100, "window": "5m0s" },
  "process_alerts": []
}
```

Notes for the dashboard:

- `gpu[].usage` can be `-1` (unknown); `thermal` zeros can be unavailable sensors;
  `sensors` may be `null`; `batteries` may be `[]` on a desktop; `proxy.enabled`
  can be true for a bare `utun` tunnel (the distinguishing `is_tunnel` flag is
  not serialized — do not claim "proxy configured").
- Units: memory/disk/trash/bytes in bytes; network rates MB/s; temperatures °C;
  `*_percent` 0–100; `memory.memory` in `top_processes` is a percent kept for
  compatibility (prefer `memory_bytes`).
- `--watch` streams NDJSON snapshots (one object per line); not used by the GUI.
- Non-TTY stdout without `--json` already emits this same JSON.

Fixture: `gui/fixtures/status.json`.

---

## 6. `history --json --limit N`

argv: `['history', '--json', '--limit', '100']`. Exit `0` always for valid args,
including empty logs. Reads `~/Library/Logs/mole/operations.log` and
`~/Library/Logs/mole/deletions.log` (overrideable with `MOLE_OPERATIONS_LOG` /
`MOLE_DELETE_LOG`).

- `--limit` accepts 1–200 (default 20); `0`, non-numeric, `>200` or non-numeric
  args → stderr `Invalid value for --limit: <v>` / `Missing value for --limit`,
  exit 1.
- Sessions are newest-first, capped to `limit`; deletions likewise (independent
  cap). `limit` is echoed normalized.
- Empty-state JSON is valid and prints arrays as `[\n\n  ]`.

Schema:

```jsonc
{
  "logs": {
    "operations": "/Users/example/Library/Logs/mole/operations.log",  // string
    "deletions":  "/Users/example/Library/Logs/mole/deletions.log"    // string
  },
  "limit": 100,                                                       // int 1..200
  "sessions": [                                                       // newest first
    {
      "command": "clean",                       // string (clean|optimize|purge|uninstall|
                                                 //   installer|update|remove|touchid|...;
                                                 //   dry-run sessions are suffixed "-dry-run")
      "run_id": "20261017214622-45699-12407-30459", // string; "" for legacy command rows
      "attribution": "run",                     // "run" | "command" | "ambiguous"
      "started_at": "2026-10-17 21:46:22",      // "YYYY-MM-DD HH:MM:SS" local time; "" possible
      "ended_at": "",                           // same format; "" = not ended / legacy
      "items": 1681,                            // int >= 0
      "size": "46.83GB",                        // decimal human size string, "0B" when none
      "operation_count": 104,                   // int >= 0
      "failed_tasks": 0,                        // int >= 0 (optimize task failures)
      "actions": { "removed": 0, "trashed": 0, "skipped": 104,
                   "failed": 0, "rebuilt": 0, "other": 0 }  // all int >= 0
    }
  ],
  "deletions": [
    {
      "timestamp": "2026-10-17T21:52:08+0800",  // ISO-ish local with offset
      "mode": "trash",                          // "trash" | "permanent"
      "status": "ok",                           // "ok" | "dry-run" | "rejected" |
                                                //   "privacy-denied" | "trash-failed" |
                                                //   "identity-changed" | "mutable-parent" |
                                                //   "interrupted" | "timed-out" |
                                                //   "invalid-mode" | "sudo-blocked-test-mode" |
                                                //   other fixed lowercase reasons
      "size_kb": 4,                             // int | null (null when unmeasured; the
                                                //   log stores "unknown", rendered as null)
      "path": "/Users/example/Library/Caches/com.example.app"   // string (escaped on read)
    }
  ]
}
```

Parser notes:

- `size` is a display string, not bytes (same decimal human format as §2.6).
- `attribution:"ambiguous"` marks legacy rows whose run grouping is uncertain;
  render a mild hint, do not reject.
- Deletions are an audit trail: statuses other than `ok`/`dry-run` must be shown
  as refused/failed, not hidden.
- Text mode (no `--json`) is `Mole History` with `Recent sessions` /
  `Deletion audit` / `Logs` blocks; the GUI does not use it.

Fixtures: `gui/fixtures/history.json` (seeded), `gui/fixtures/history-100.json`
(100 scrubbed sessions + deletions), `gui/fixtures/history-empty.json`.

---

## 7. `uninstall` surfaces

### 7.1 `uninstall --list` (JSON when piped)

argv: `['uninstall', '--list']`. Read-only; scans `/Applications`, system app
locations, Homebrew cask inventory, then exits `0`. When stdout is a pipe the
format is **automatically JSON** (an explicit `--json` flag does not exist):

```
[
  {"name": "Qoder", "bundle_id": "com.qoder.ide", "source": "App", "uninstall_name": "Qoder", "path": "/Applications/Qoder.app", "size": "728.0MB"},
  ...
  {"name": "Google Chrome", "bundle_id": "com.google.Chrome", "source": "App", "uninstall_name": "Google Chrome", "path": "/Applications/Google Chrome.app", "size": "2.22GB"}
]
```

- One object per line, 2-space indented; `[` first line, `]` last line + newline.
- Fields: `name` (display name, string), `bundle_id` (string, can be empty or not
  reverse-DNS), `source` (`"App"` or `"Homebrew"`), `uninstall_name` (the exact
  name `mo uninstall` accepts — for casks this is the cask token, string),
  `path` (absolute path, string), `size` (decimal human size or `"--"`, string).
- JSON escaping is minimal: `\` and `"` are escaped, tab/CR/LF become a space.
  A name containing other control bytes could make the array invalid JSON; guard
  with a fallback.
- A TTY prints an aligned table (`NAME`, `BUNDLE ID`, `UNINSTALL NAME`, `SIZE`,
  `N application(s)  |  Remove with: mo uninstall <UNINSTALL NAME>`); the GUI does
  not use it.
- Failures: scan failure prints `Error: ...` on stderr and exits `1`.

Fixture: `gui/fixtures/apps.json` (seeded, 12+ rows incl. Homebrew and CJK names),
`gui/fixtures/apps-single-line.json` (compact variant).

### 7.2 `uninstall --dry-run names...` (preview)

argv: `['uninstall', '--dry-run', ...names]` where each name is the
`uninstall_name` from §7.1 (interactive selector names are not accepted).

Exit `0` on completed preview (including the EOF auto-confirm path), `1` when no
app matches (`No matching applications found.`) or the scan fails, `124`/`130`/
`143` on timeout/signal. Read-only: `MOLE_DRY_RUN=1` makes `mole_delete`,
process termination (`force_kill_app`), LaunchServices teardown, login-item
removal and sudo removal all no-ops; the preview still measures paths and
queries the application list (takes ~10–15 s on a large Mac).

Typical stdout (ANSI stripped; `ESC[2J ESC[H` may precede `◎ Matched`):

```

→ DRY RUN MODE, No app files or settings will be modified

◎ Matched 1 app(s):
1. Rectangle  7.4MB  |  Last: 1m ago


Files to be removed:
◎ Rectangle , 7.4MB
  ✓ /Applications/Rectangle.app , 7.4MB
  ✓ ~/Library/Caches/com.knollsoft.Rectangle , 4KB

Personal data kept:
  ⊙ ~/Library/WebKit/com.knollsoft.Rectangle
  ⊙ /var/folders/xx/.../C/com.knollsoft.Rectangle
  ⊙ ~/Library/Preferences/com.knollsoft.Rectangle.plist

D choose personal data
➤ Remove 1 app, 7.4MB [Running]  Enter confirm, ESC cancel: 

======================================================================
Uninstall dry run complete
Would remove 1 app, would free 7.4MB: Rectangle
======================================================================

[DRY RUN] Would refresh LaunchServices and update Dock entries
```

Grammar (all after `stripAnsi`):

- Start marker: `^→ DRY RUN MODE, No app files or settings will be modified$`.
- Match block: `^◎ Matched (\d+) app\(s\):$` then rows
  `^\d+\. <name>  <?size>  \|  Last: <age>$`.
- `^Files to be removed:$`; per app `^◎ <name>( \[Brew\])? , <size>$`; file rows
  `^  ✓ <path>( , <size>)?$`; system rows `^  ◎ System: <path>( , <size>)?$`;
  review-only rows `^  ◎ Review only: <path>( , <size>)?$`; Steam warning
  `^  ◎ Steam launcher only; ...$`; leftover warning
  `^  ◎ <text>$`.
- `^Personal data kept:$` then `^  ⊙ <path>$` rows (`~`-abbreviated).
- Optional `^D choose personal data$`.
- Confirm prompt: `^➤ Remove (\d+) app\(s\), <size>( \[Running\])?  Enter confirm, ESC cancel: $`
  (no trailing newline in the prompt itself; the following blank line is real).
- Summary: `^Uninstall dry run complete$` then
  `^Would remove (\d+) app\(s\), would free <size>: <name>[, <name>...]$`
  (max 3 names per line; extra continuation lines are headerless name lists).
- Post-summary dry-run notices: `^\[DRY RUN\] Would refresh LaunchServices and update Dock entries$`.
- Real runs replace `Uninstall dry run complete` with `Uninstall complete` or
  `Uninstall incomplete`, and `Would remove N apps, would free X: ...` with
  `Removed N apps, freed X: ...`. Failure detail lines:
  `• Failed: <names> <reason>`, `⊙ Kept <n> system-level path(s), which Mole never removes`,
  `⊙ System extensions may remain after removal: ...`,
  `⊙ Background item still running for ...`.
- Sizes may be absent on individual paths; app rows always carry a size when
  measurable. CJK names are full-width; do not truncate by bytes.
- Parser scope rules: only lines between `Files to be removed:` and
  `Personal data kept:`/`D choose personal data`/the confirm prompt contribute
  `apps`; each `◎ <name> , <size>` starts an app and the following indented path
  rows belong to it. The match block (`◎ Matched N app(s):` + numbered rows) is
  metadata, not apps. `keptPersonal` must stop at the end of its block. The
  confirm prompt line (`➤ Remove N app(s), …`) supplies `confirmLine` and
  `wouldRemoveCount`; the final block supplies `title` and `summaryLines`.
  Paths must be captured without the trailing `, <size>` (extract the size
  separately). `~` paths stay `~`-abbreviated.

### 7.3 `uninstall names...` (real run)

Same preview, then execution. `--permanent` switches the default Trash routing
to immediate removal; absent it, files go to the macOS Trash (recoverable).
Privileged: needs a sudo session only for apps with system-level files/Homebrew
casks; the GUI's pre-auth wrapper establishes it. The CLI still renders and
confirms the same preview; at EOF it auto-confirms (§7.4).

### 7.4 Confirmation / EOF behavior (verified in source, do not execute for real)

`_batch_preview_and_confirm` (lib/uninstall/batch.sh) reads one raw key:
`IFS= read -r -s -n1 key || key=""`. The empty string is in the confirm branch:

```bash
case "$key" in
  $'\e' | q | Q) return 2 ;;        # cancel
  "" | $'\n' | $'\r' | y | Y) break ;;   # CONFIRM
  *) return 2 ;;                    # unknown key cancels
esac
```

So **EOF / closed stdin / `/dev/null` auto-confirms**, exactly like Enter. This
is intentional for `y`-style prompts but dangerous for a GUI: a spawned real
`uninstall` job with stdin `/dev/null` proceeds to removal without any UI
prompt. Consequence:

- The GUI must show its own confirmation modal before spawning a real
  uninstall and before spawning `purge --yes`.
- The preview job (`--dry-run`) may be spawned freely with `/dev/null`; it
  completes rather than hanging.
- Cancellation must come from SIGINT to the process group, not from stdin.
- Verified safe run: `MOLE_TEST_NO_AUTH=1 ./mole uninstall --dry-run Rectangle
  </dev/null` → exit 0, `Uninstall dry run complete`, no deletions.

Fixture: `gui/fixtures/uninstall-dry-run.txt` (scrubbed real output),
`gui/fixtures/ansi-sample.txt` (raw sequences for `stripAnsi` tests).

---

## 8. `clean`

### 8.1 `clean --dry-run` (preview)

argv: `['clean', '--dry-run']` (+ `'--debug'`). Exit `0` on a completed preview,
`124`/`130`/`143` on timeout/signal, other nonzero when cleanup was incomplete
(the summary heading says so). stderr is empty on success.

Header (stdout):

```

Clean Your Mac

Dry Run Mode, Preview only, no deletions

◎ System caches need sudo, run sudo -v && mo clean --dry-run for full preview   <- no cached sudo
    …or…
✓ Admin access available, system preview included                              <- cached sudo session adopted

⚙ Apple Silicon | Free space: 327.15GB
✓ Whitelist: 19 core patterns active
  ↳ /Users/example/Library/Caches/ms-playwright*
  ↳ …
```

- The sudo line is `adopt_sudo_session`, which checks for a cached session with
  `sudo -n` and **never prompts**. With stdout piped and a cached session the
  system-cache sections are included and the line above is the `✓` one. The GUI
  should run the preview unprivileged; after a privileged clean (or via the Swift
  pre-auth wrapper) the session is cached and the next preview is complete.
  Under `MOLE_TEST_NO_AUTH=1` adoption is forced off (dev only).
- `⚙` machine line: `^⚙ (.+) \| Free space: (.+)$` (Apple Silicon/Intel marker).
- Whitelist: `^✓ Whitelist: (\d+) core patterns active$` followed by
  `^  ↳ (.+)$` pattern rows; or a `whitelist` warning line if unreadable.

Body: sections `➤ <Section Name>` then item rows `  <glyph> <label> · <detail>`.
Representative dry-run rows (all `stripAnsi`d):

```
➤ User essentials
  → User app cache · 58 items, 8.87GB dry
  → User app logs · 18 items, 24.5MB dry
  ◎ Trash · skipped, grant Full Disk Access to your terminal

➤ Browsers
  → Chrome cache · 1.98GB dry
  → Chrome Service Worker, would clean 522.2MB, 0 protected

➤ Developer tools
  → npm cache · would clean
  → npm cache directory · 4 items, 30.34GB dry
  ⊙ Docker unused data · review with docker system df
  ◎ Codex marketplace staging · skipped (open-file check unavailable)
  → Homebrew cleanup · would free 1.5GB
    ~/Library/Caches/Homebrew/ada-url--4.0.0 · 336.1KB        <- 4-space detail row
    /opt/homebrew/Library/Homebrew/vendor/portable-ruby/4.0.3 · 34.6MB

➤ App leftovers
  → Orphaned Caches: com.github.wasilibs · 2.6MB dry
  → Would clean 9 items, about 16.2MB

➤ Large files
  ⊙ Docker Desktop data · 27.84GB · ~/Library/Containers/com.docker.docker/Data

➤ Virtualization
  ✓ Nothing to clean
```

Item grammar (after stripping ANSI, one leading space pair):

```
^  (→|✓|◎|⊙|-|\*) (.+)$
```

- `→` = dry-run candidate / would-do row (`MOLE_DRY_RUN` marker).
- `✓` = success row; an item row that is only `✓ Nothing to clean` means the
  section is empty.
- `◎` = warning / skipped / disabled (`skipped …`, `stopped (…)`, `Failed …`).
- `⊙` = manual review / needs attention (`manual review`, `review with …`).
- `-` = unavailable / disabled (gray dash; e.g. optimize shared file lists).
- Detail column: after the label a ` · ` separator normally starts the detail;
  some rows use `, would clean …` or a bare `· would clean`. Extract the first
  decimal size token `(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\b`; attach `+` when the
  token is followed by `+`; a trailing ` dry` marks dry-run rows. Item counts:
  `(\d+) items?`, `(\d+) files?`, `(\d+) dirs?`, `(\d+) stubs?`, `(\d+) apps?`.
  `at least ` and `about ` prefixes are qualifiers, not part of the number.
- `~` at the start of a path means `$HOME`; the GUI should display it as-is
  (do not expand to the real home in tables) and expand only via host events.
- 4-space-indented rows under `➤ Homebrew cleanup` are detail paths:
  `^    (~|/).* · <size>$`; they belong to the preceding item and must **not**
  be emitted as separate section items (skip them in the parser).
- `Would clean N items, about <size>` is a rolled-up row without a size column
  in the `·` position.
- Sections with no rows or only `✓ Nothing to clean` are empty: the literal
  `✓ Nothing to clean` line is a section-empty marker, not an item. `➤` headers
  are recycled/erased on TTYs; in piped output every section header appears.
- `wouldClean` is true only when the row text literally contains `would clean`
  or `would free`. A `→` row with a measured size but no such wording (e.g.
  `User app cache · 8.87GB dry`) is a dry-run candidate (`dry: true`), not a
  "would clean" row.

Summary block (dry run):

```
======================================================================
Dry run complete - no changes made
Potential space: 46.83GB+ | Items: 1681 | Categories: 7
Detailed file list: /Users/example/.config/mole/clean-list.txt
Use mo clean --whitelist to add protection rules
======================================================================
```

Regexes:

- `^Dry run complete - no changes made$` (also `Dry run cancelled`, `Dry run
  interrupted`, `Dry run incomplete`; real runs: `Cleanup complete`,
  `Cleanup cancelled`, `Cleanup interrupted`, `Cleanup incomplete`).
- `^Potential space: ([\d.]+\s*(?:B|KB|MB|GB|TB))(\+?)(?: \| Items: (\d+))?(?: \| Categories: (\d+))?$`
  (the size is colored only on a TTY; parse after stripping).
- `^Detailed file list: (.+)$` — path to `~/.config/mole/clean-list.txt`
  (`$XDG_CONFIG_HOME`/`$HOME/.config/mole/`); may be absent when nothing was
  written (`Cleanup preview file could not be written safely`).
- `^Use mo clean --whitelist to add protection rules$`.
- Empty system: heading `Dry run complete - no changes made` with
  `No significant reclaimable space detected, system already clean.`
- Partial total: size ends with `+` when some sizes are unknown
  (`DRY_RUN_TOTAL_PARTIAL`).
- Free-space delta line appears on real runs only (`Free space: X (freed Y)`);
  dry run reports `Potential space` instead.

`clean-list.txt` (the detailed file list) is a separate text file:

```
# Mole Cleanup Preview - 2026-10-17 21:51:00
#
# How to protect files:
...
=== <Section Name> ===
/Users/example/Library/Caches/foo  # 12.3MB, 3 items
/Users/example/...  # size unknown
```

The GUI may read it behind a "show details" action; lines are
`<path>  # <human size>[ N items][, counted under <parent>]` or
`<path>  # size unknown[...]`, grouped by `=== <section> ===`.

`--debug` (preview or real): sets `MO_DEBUG=1`; the CLI writes
`[DEBUG] …` lines to **stderr** and appends
`Debug session log saved to: <path>` after the summary block on stdout.
`--debug` output can be much larger and may contain slow-probe diagnostics
(e.g. `[TIMEOUT] Perl fallback…`); never parse stderr.

Fixture: `gui/fixtures/clean-preview.txt`.

### 8.2 `clean` (real, privileged)

Same body and summary blocks, with `✓`/size rows instead of `→…dry`,
`Tracked cleanup: <size> | Items cleaned: N` and `Free space: X (freed Y)`.
Non-interactive stdin prints `Running in non-interactive mode`, then
`• System-level cleanup enabled, sudo session active` or `• System-level cleanup
skipped, requires sudo`. System cleanup participation is decided once by
`adopt_sudo_session`; a cached sudo session (pre-authed by the GUI) enables
system sections, otherwise they are skipped (not an error). Exit status follows
the summary heading: `Cleanup complete` → 0, cancelled/interrupted/incomplete →
124/130/143/other nonzero.

---

## 9. `optimize`

### 9.1 `optimize --dry-run` (preview)

argv: `['optimize', '--dry-run']`. Exit `0` when every task reported an outcome
and none failed; `1` if any task outcome is `failed` or outcomes are incomplete.
~3 s. stdout only (debug goes to stderr with `--debug`). Output starts with a
blank line:

```

Optimize
→ DRY RUN MODE, No files will be modified

⚙ System  18/32 GB RAM | 579/926 GB Disk | Uptime 19d

Performance diagnosis
  ✓ No sustained high-CPU bottleneck detected

➤ Finder Cache Refresh
  → QuickLook thumbnails refreshed
  → Icon services cache rebuilt

➤ App State Cleanup
  → App saved states optimized

➤ Database Optimization
  ◎ Close these apps before database optimization: Mail

➤ Shared File Lists
  - Shared file lists not readable (check directory permissions and Full Disk Access)

➤ Notifications
  → Notification Center database is healthy (561KB)

======================================================================
Dry Run Complete, No Changes Made
Would apply 2 optimizations
12 unchanged | 3 skipped | 2 unavailable
Run without --dry-run to apply these changes
======================================================================
```

Grammar:

- `^→ DRY RUN MODE, No files will be modified$`.
- `^⚙ System\s+(\d+)/(\d+) GB RAM \| (\d+)/(\d+) GB Disk \| Uptime (\d+)d$`.
- `^Performance diagnosis$` is a plain header (no `➤`); its body uses the same
  `  <glyph> <text>` item grammar. The parser must keep this block (emit it as a
  first synthetic section named `Performance diagnosis`) instead of dropping
  items that appear before the first `➤`.
- Task sections: `^➤ (.+)$`; each item `^  (→|✓|◎|⊙|-|✗) (.+)$`.
  - `→` dry-run / would-apply, `✓` success/no change needed, `◎` warning or
    needs attention, `⊙` manual review, `-` unavailable/skipped.
- No per-section totals; outcome counts exist only in the summary. `-` is the
  unavailable/disabled mark (`Shared File Lists`), `◎` is attention/warning,
  `✗` would be a failed task (not seen in dry runs).
- Summary: `^Dry Run Complete, No Changes Made$` /
  `^Would apply (\d+) optimizations$`;
  `^(\d+) unchanged(?: \| (\d+) skipped)?(?: \| (\d+) unavailable)?(?: \| (\d+) need attention)?(?: \| (\d+) failed)?$`;
  `^Run without --dry-run to apply these changes$`.
- Real run heading `Optimization Complete`; detail
  `Applied N optimizations[. <cache cleaned>]`, same outcome-count line,
  `Review the warnings above` when attention/failed > 0.
- `--debug` changes the reported outcome of at least one probe in some
  environments (e.g. `- Shared file lists not readable …` → `◎ Failed to scan
  shared file lists`) and can flip the exit code to `1`. The GUI must not treat
  a `--debug` optimize exit as a product failure and does not use this flag.

Fixture: `gui/fixtures/optimize-preview.txt`.

### 9.2 `optimize` (real, privileged)

Prompts for a sudo session (`ensure_sudo_session`) unless stdin is not a TTY and
no cached session exists; then prints
`Skipping sudo-required optimizations: admin access not granted` and continues
with unprivileged tasks. The GUI pre-auths sudo so tasks run. Exit `0` when no
task failed, `1` otherwise, `124`/`130`/`143` on timeout/signal.

---

## 10. `purge` (project artifacts)

### 10.1 `purge --dry-run`

argv: `['purge', '--dry-run']`. Fully unattended (no TTY, no confirmation),
exit `0` for completed preview / no candidates. Scans
`~/.config/mole/purge_paths` if present, else default project roots
(`~/www`, `~/dev`, `~/Projects`, `~/GitHub`, `~/Code`, `~/Workspace`, `~/Repos`,
`~/Development`, `~/Library/CloudStorage`, `~/.codex/worktrees`,
`~/.claude/worktrees`) and project containers under `$HOME`.

With candidates (sandbox fake-HOME, artifact paths resolved to physical paths):

```
→ DRY RUN MODE, No project artifacts will be removed

Purge Project Artifacts

✓ [DRY RUN] /private/tmp/mole-purge-sandbox/home/projects/demo/node_modules, 2.1MB
✓ [DRY RUN] /private/tmp/mole-purge-sandbox/home/projects/demo/dist, 524KB


======================================================================
Dry run complete - no changes made
Would free approximately: 2.6MB | Items: 2 | Free: 327.14GB
======================================================================
```

No candidates (typical on a clean machine):

```
→ DRY RUN MODE, No project artifacts will be removed

Purge Project Artifacts

✓ Great! No old project artifacts to clean
```

(No summary block in the no-candidate case: `perform_purge` returns before the
summary for `no_candidates`/`cancelled`; the parser reports
`mode:"none", noCandidates:true`.)

Grammar:

- `^→ DRY RUN MODE, No project artifacts will be removed$`.
- `^Purge Project Artifacts$`.
- Candidate row: `^✓ \[DRY RUN\] (.+), ([\d.]+\s*(?:B|KB|MB|GB|TB))$`;
  path is absolute/physical; a row may omit the size (`unknown` sizes).
- No-candidate: `^✓ Great! No old project artifacts to clean$`;
  scan-problem variant: `^◎ No artifacts could be prepared for review$`.
- Non-interactive skips cloud-synced candidates:
  `^◎ Skipped (\d+) cloud-synced artifact(s)? in non-interactive mode \(confirmation required\)$`.
- Interactive-only lines (not seen headless): `No items selected`,
  `Purge cancelled`.
- Summary: `^Dry run complete - no changes made$`;
  `^Would free approximately: ([\d.]+\s*(?:B|KB|MB|GB|TB))(\+?)(?: \| Items: (\d+))?(?: \| Free: (.+))?$`;
  `^No artifacts were removed\.$`; `^Free space: (.+)$`;
  incomplete: heading `Dry run incomplete - no changes made` +
  `Some artifacts were skipped or could not be processed.`

### 10.2 `purge --yes` (real, unattended, destructive)

argv: `['purge', '--yes']`. Sets `MOLE_PURGE_YES=1`. With stdin not a TTY:
**no prompt at all**; selects all non-recent, non-cloud-synced artifacts and
removes them. Exit `0` for completed; `1` for incomplete/scan failure;
`124`/`130`/`143` on timeout/signal. Sample (sandbox fake HOME):

```
Purge Project Artifacts



======================================================================
Purge complete
Estimated space freed: 2.6MB | Items: 2 | Free: 327.13GB
======================================================================

```

- Cloud-synced roots are skipped non-interactively with the warning line above.
- Parsing: the completion summary must become `mode:"complete"`, with
  `itemCount` from `Items:` and `totalBytes` from `Estimated space freed:`;
  `freeBytes` comes from the separate `Free:` segment, not from the freed
  amount. `Purge complete` plus no artifact rows is still a completion.
- The GUI **must** show a confirmation before spawning this.
- `purge` without `--yes` and without a TTY: exit `1`, stdout only
  `Purge Project Artifacts`, stderr:
  `Purge requires confirmation. Run mo purge in a terminal, or use --dry-run to preview and --yes to confirm unattended cleanup.`
  This is a refusal, not a crash. With a TTY, ESC/unknown cancels with exit `0`.

Fixtures: `gui/fixtures/purge-preview.txt` (seeded no-candidate),
`gui/fixtures/purge-preview-artifacts.txt`,
`gui/fixtures/purge-run-complete.txt`.

---

## 11. `installer` (interactive TUI — hand off to Terminal)

argv: `['installer']` (optional `--dry-run`). Cannot be driven by the GUI: it
sets `stty -echo -icanon`, draws with ANSI, and reads single keys from stdin
(↑/↓ move, Space toggle, A all, I invert, Enter confirm, Q/ESC quit).
`hide_cursor`/alt-screen paths require a TTY. With EOF stdin it immediately
treats the empty read as Enter and confirms an empty selection — harmless but
useless, so the GUI must not spawn it in-process.

Behavior: opens Terminal via `openTerminal(['installer'])`, prints an explainer
in the Reclaim screen. The CLI itself exits `0` on a completed/empty selection,
`1` on incomplete/scan failure, `124`/`130`/`143` on timeout/signal.
`--dry-run` prints `→ DRY RUN MODE, No installer files will be removed` and the
same selector; it still needs a TTY for the interactive step.

---

## 12. `analyze --json PATH`

argv: `['analyze', '--json', path]`. `--json` may appear before or after the
path (`analyze PATH --json` also works); `MO_ANALYZE_PATH` overrides the operand.
Without a path it scans the machine-wide overview (`overview: true`). Exit `0`
for a completed scan even when `scan_status` is `partial`/`unavailable`; exit `1`
for bad flags (`flag provided but not defined: …` + usage hint on stderr),
unresolvable target, or a scan failure with an empty/missing result. A failed
scan prints `failed to scan directory: <err>` on stderr and nothing on stdout.
`--help` prints the usage text on stdout, exit `0`.

Schema (`cmd/analyze/json.go`; 2-space indent, trailing newline):

```jsonc
{
  "scan_status": "complete",        // "complete" | "partial" | "unavailable"
  "path": "/Users/example/Documents",// absolute resolved path (string)
  "overview": false,                // bool: machine-wide overview vs one directory
  "entries": [                      // []jsonEntry, sorted by size desc
    {
      "scan_status": "complete",    // per-entry coverage state
      "name": "big.bin",            // string (basename)
      "path": "/Users/example/Documents/big.bin", // string absolute
      "size": 65536,                // int64 bytes; may be -1 in overview internals,
                                    //   normalized before output
      "is_dir": false,              // bool
      "insight": true,              // ?bool, overview insight rows only
      "cleanable": true,            // ?bool, dirs that are safe known caches
      "last_access": "2026-10-17T13:51:38Z" // ?RFC3339 UTC
    }
  ],
  "large_files": [                  // ?[]fileEntry (omitted when empty)
    { "name": "big.bin", "path": "/Users/example/Documents/big.bin", "size": 65536 }
  ],
  "total_size": 98309,              // int64 bytes scanned (>= 0)
  "total_files": 3                  // ?int64 (omitted when 0)
}
```

- `entries` is `[]` (not null) for an empty directory; `large_files` is absent
  when empty. Empty directory sample: `{"scan_status":"complete","path":"…",
  "overview":false,"entries":[],"total_size":0}`.
- `cleanable`/`insight` are omitted rather than `false`; treat absence as false.
- Unknown sizes are represented by coverage state (`partial`/`unavailable`) and a
  small/zero size; do not assume zero means empty directory.
- Trash-move actions are per-item CLI operations; the GUI calls
  `analyze --json` only for reading. A TUI without `--json` must not be spawned.

Fixtures: `gui/fixtures/analyze.json` (seeded sample),
`gui/fixtures/analyze-empty.json`, `gui/fixtures/analyze-no-large-files.json`.

---

## 13. Parser contracts (web UI)

`gui/app/web/js/parsers.js` must assign `window.MoleParsers` and be loadable as a
plain browser script (no imports, no top-level DOM access). Every function is
total: it never throws, and on an unexpected shape it returns the documented
fallback with `ok: false` and the raw text preserved.

```js
window.MoleParsers = {
  stripAnsi(text) -> string,                    // §2.5 (includes CR normalization)
  formatSize(value) -> number|null,             // alias parseSize; §2.6 (1024 base)
  parseSize(value) -> number|null,              // alias of formatSize

  parseCleanPreview(text) -> {
    ok, raw,
    title,                                      // first body heading: "Clean Your Mac"
    potentialBytes, potentialPlus: bool,        // "Potential space: 46.83GB+"
    items, categories,                          // ints or null
    detailFile,                                 // clean-list.txt path or null
    sections: [{ name, items: [{
      mark,                                     // '→' | '✓' | '◎' | '⊙' | '-' | '*'
      label, detail,                            // strings after the mark
      sizeBytes, sizePlus: bool,                // first/largest decimal size token
      count,                                    // int items/files/dirs/stubs or null
      dry: bool,                                // trailing " dry"
      wouldClean: bool                          // text contains "would clean"/"would free"
    }] }],
    summaryLines: [string]                      // detail lines of the final block
  },
  // Optional additions (not required by the contract tests, useful to screens:
  // freeBytes, whitelistCount, sudoSkipped, sudoAvailable.)

  parseOptimizePreview(text) -> {
    ok, raw, title,                             // "Optimize"
    applied, unchanged, skipped, unavailable, attention, failed,   // ints/0 or null
    sections: [{ name, items: [{ mark, label, detail }] }],
                                                // includes a synthetic
                                                // {name:"Performance diagnosis"} section
    summaryLines: [string]
  },

  parsePurgePreview(text) -> {
    ok, raw,
    mode,                                       // 'preview'|'complete'|'cancelled'|'none'|'error'
    title,                                      // "Purge Project Artifacts"
    artifacts: [{ path, sizeText, sizeBytes, count }],   // count null when absent
    itemCount, totalBytes, totalPlus: bool, freeBytes,   // numbers/bool or null
    noCandidates: bool,                         // "Great! No old project artifacts"
    summaryLines: [string]
    // optional: nonInteractiveSkip (int cloud-synced rows skipped)
  },

  parseUninstallDryRun(text) -> {
    ok, raw,
    title,                                      // "Uninstall dry run complete"
    apps: [{ name, sizeText, sizeBytes,
             paths: [{ path, kind, sizeText, sizeBytes }] }],
                                                // only apps from "Files to be removed:"
                                                // kind: 'app' (bundle) | 'related' | 'system' | 'review'
    keptPersonal: [string],                     // ⊙ rows inside "Personal data kept:" only
    confirmLine,                                // the ➤ confirm prompt line or ''
    wouldRemoveCount, totalBytes,
    summaryLines: [string]
    // optional: dryRun:bool, matchedCount, brew:bool, postNotes:[string]
  },

  parseAppsJson(text) -> array|null,            // uninstall --list array (single-line or pretty)
  parseStatusJson(text) -> object|null,
  parseHistoryJson(text) -> object|null,
  parseAnalyzeJson(text) -> object|null,
  parseVersion(text) -> {version, os, arch, kernel, sip, diskFree, install, shell, nightly} | null
};
```

Rules:

- The `parse*/Json` family returns `null` on malformed/truncated input; never
  throws and never partially returns a mutated object for invalid JSON.
- `stripAnsi` + CR normalization happens inside each text parser; callers may
  pass raw chunks.
- Text parsers must tolerate: leading blank lines, trailing blank lines, missing
  summary (cancelled/no-candidate), `EXIT=<n>` harness markers if a captured
  fixture ever carries one, CRLF, and chunk boundaries (callers may buffer until
  exit).
- Raw CLI output is displayed only through `textContent`/`escapeHtml`, never as
  markup.
- `formatSize`/`parseSize` use 1024 multipliers (§2.6) so they round-trip with
  `MoleUI.formatBytes`.

Failure-degradation rules (the UI behavior behind `ok:false`/`null`):

1. JSON command: if stdout parses → use it even if exit code is nonzero; show
   stderr and a warning toast. If it does not parse → raw log panel, error state
   with the CLI exit code, no crash.
2. Text command: partial parse is allowed (keep whatever was extracted,
   `ok:false` if the title/summary is missing); always append the raw log.
3. Empty stdout + exit 0 → empty state (e.g. no project artifacts, empty history,
   empty directory).
4. Empty stdout + nonzero exit → failure card with the stderr first line and a
   "retry" action.
5. Never infer success from output text when the exit code is 124/130/143: those
   are timeout/cancel and the UI must show a cancelled/stopped state.
6. Auth failures are host-level (`job_exit.error` = `auth_cancelled` /
   `auth_failed`), not CLI output; the CLI is not spawned when the native dialog
   is cancelled (`code:130`).

---

## 14. Verified command log (read-only; generated 2026-10-17)

All runs used `MOLE_TEST_NO_AUTH=1` (dev-only), `NO_COLOR=1`, `TERM=dumb` from
this session, so captured bash output has no SGR colors; uninstall still emitted
`ESC[2J ESC[H`.

| command | exit | notes |
| --- | --- | --- |
| `./mole --version` | 0 | 136 B, blank-line framed |
| `./mole status --json` | 0 | 4.7 KB, schema §5 |
| `./mole history --json --limit 100` | 0 | 2.5 KB, schema §6 |
| `./mole history --json` with empty fake `HOME` | 0 | empty arrays |
| `./mole uninstall --list` (piped) | 0 | 58 JSON rows |
| `./mole uninstall --dry-run Rectangle </dev/null` | 0 | EOF auto-confirm verified, ~12 s, no deletion |
| `./mole analyze --json /tmp/…/sample` | 0 | entries + large_files |
| `./mole analyze --json /tmp/…/empty` | 0 | `entries: []`, no `large_files`/`total_files` |
| `./mole analyze --json /tmp/does-not-exist` | 1 | stderr `failed to scan directory: open …` |
| `./mole clean --dry-run` | 0 | 18.7 KB, ~4 min, `Potential space: 45.08GB+` |
| `./mole optimize --dry-run` | 0 | 1.9 KB, ~3.4 s |
| `./mole optimize --dry-run --debug` | 1 | one probe reports `failed` under debug (see §9.1) |
| `./mole purge --dry-run` | 0 | no candidates (machine already clean) |
| `HOME=/tmp/mole-purge-sandbox/home ./mole purge --dry-run` | 0 | 2 candidates, summary block |
| `HOME=/tmp/mole-purge-sandbox/home ./mole purge --yes </dev/null` | 0 | deleted both sandbox artifacts, no prompt |
| `HOME=/tmp/mole-purge-sandbox/home ./mole purge </dev/null` | 1 | stderr confirmation refusal |
| `HOME=/tmp/mole-purge-sandbox/home ./mole purge --dry-run --debug` | 0 | `Debug session log saved to:` after summary |

Not executed (prohibited without explicit approval): real `clean`, real
`uninstall`, real `optimize`, `purge --yes` against the real `$HOME`, `installer`.
No sudo prompts were triggered. The sandbox `HOME` under `/tmp` was isolated;
`purge --yes` never saw the real home.

---

## 15. Fixtures

All fixtures are deterministic, ANSI-light captures or scrubbed derivatives.
Home paths are `/Users/example`; machine-specific hostnames, IPs and Bluetooth
names are generic. Seeded files keep their names; new files are additive.

| file | source | contents |
| --- | --- | --- |
| `version.txt` | `--version` | 10-line version block |
| `status.json` | `status --json` | full snapshot schema §5 |
| `history.json` | `history --json` | 2 sessions, empty deletions (seed) |
| `history-100.json` | synthetic, scrubbed | 100 sessions + 20 deletions, every attribution/action/status variant |
| `history-empty.json` | empty fake HOME | empty-state JSON |
| `apps.json` | `uninstall --list` | 12+ rows: App, Homebrew, `--` sizes, CJK widths |
| `apps-single-line.json` | compacted `apps.json` | one-line JSON array variant |
| `analyze.json` | `analyze --json` | sample tree with large file (seed) |
| `analyze-empty.json` | `analyze --json` empty dir | `entries: []` shape |
| `analyze-no-large-files.json` | `analyze --json` | no `large_files` key |
| `clean-preview.txt` | `clean --dry-run` | full preview + summary (seed, scrubbed) |
| `optimize-preview.txt` | `optimize --dry-run` | sections + outcome summary (seed) |
| `purge-preview.txt` | `purge --dry-run` | no-candidate shape (seed) |
| `purge-preview-artifacts.txt` | sandbox smoke | candidate rows + dry-run summary |
| `purge-run-complete.txt` | sandbox smoke | `purge --yes` completion summary |
| `purge-refusal.txt` | sandbox smoke | non-TTY refusal (stdout+stderr merged) |
| `uninstall-dry-run.txt` | `uninstall --dry-run Rectangle` | scrubbed preview + dry-run summary |
| `ansi-sample.txt` | composed | CSI/OSC/CR/C1 sequences for `stripAnsi` |

No `status-cli-missing` fixture: "CLI missing" is a **host** state, not CLI
output. The GUI learns it from the bridge (`ready.cli.ok === false` / `cli.error`)
or from exit `1` with stderr `Bundled status binary not found. …` /
`Bundled analyzer binary not found. …`; mock mode fakes it with
`scenario: 'cli-missing'`. There is likewise no "clean preview with cached sudo"
fixture — obtaining one requires a real sudo session; §8.1 documents the exact
delta from source instead.

---

## 16. Mock bridge contract (`js/mock.js`)

`index.html?mock=1` must answer every documented `MoleBridge.post(action, …)`
asynchronously through `window.__moleNative(jsonString)`, and serve the fixtures
above. Contract the tests assert when the file exists:

- importable by loading `mock.js` after a stub `window`/`document`;
- `post('init', {})` → emits `ready` with `app`, `cli`, `config`, `home`, `paths`;
- `post('run', {jobId,args,privileged,label})` → `job_started` then
  `job_output` chunks and finally `job_exit` with `{jobId, code, cancelled,
  durationMs, error:''}`;
- `post('cancel', {jobId})` → final `job_exit` with `cancelled:true, code:130`;
- `post('getConfig')` / `post('setConfig',{patch})` → `config_changed`;
- `post('chooseCLI')` → `cli_changed`; `post('reveal'|'openExternal'|`clipboard`|
  `exportJSON`|`uninstallSelf`|`quit`)` → `toast`/no-op without throwing;
- scenarios from `gui/SPEC.md` resolve and set `window.__moleSnapshotReady`;
- unknown actions do not throw.

Mock activation (ui-core/app.js + mock.js): besides `index.html?mock=1`, the
native host may inject the globals `window.__MOLE_MOCK__ = true`,
`window.__MOLE_MOCK_SCREEN__ = '<screen>'` and `window.__MOLE_MOCK_SCENARIO__ =
'<scenario>'` before app scripts run — a `--webview-check` file:// URL cannot
carry a query string. `mock.js` must honor both activation forms and set
`window.MoleMock` / `window.__moleMockFixtures`.

Host shell hook: the native app exposes `window.__moleOpenScreen(name)` so the
macOS 设置 (Settings) menu can switch screens; `app.js` implements it by routing
through the screen registry (same path as Cmd+1…8). It is not part of the bridge
action table and must not run CLI jobs by itself.

If `mock.js` is not present yet, `node gui/tests/run.js` prints a SKIP line and
exits 0; once present it is asserted like any other contract.

---

## 17. Test harness

`node gui/tests/run.js` (plain Node, no dependencies):

- loads `gui/app/web/js/parsers.js` in a shim (`global.window = global`, then
  `vm.runInThisContext`), failing with a readable diff if any contract function
  or field is missing;
- unit-tests `stripAnsi`, `formatSize`/`parseSize` round-trips and size edge
  cases; clean/optimize/purge/uninstall-preview parsers; apps/status/history/
  analyze JSON parsers incl. malformed/truncated/single-line variants; version
  parser; mock bridge actions if `mock.js` exists;
- exits nonzero with a diff-style report on failure.

Run it before claiming the GUI works. The parsers are owned by ui-core; this
test file (owned by cli-contract) must not be edited to hide a parser gap —
report the gap to the Lead instead.
