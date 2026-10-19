# Mole GUI

**Mole GUI** 是 [Mole CLI](https://github.com/tw93/Mole) 的本地 macOS 桌面外壳：一个 `Mole GUI.app`，用原生窗口承载网页界面，所有操作仍然通过**内置的 Mole CLI** 执行。GUI 不复制业务逻辑，CLI 依旧是安全规则、白名单、路径保护、日志和 dry-run 的唯一来源。

- 应用名：`Mole GUI`
- Bundle ID：`fit.mole.gui`
- 可执行文件：`MoleGUI`
- 安装位置：`/Applications/Mole GUI.app`
- 内置 CLI：`Mole GUI.app/Contents/Resources/mole-runtime/mole`

> **未签名本地构建，不要分发给他人。**
> 这个 app 是 ad-hoc 签名的本地构建，没有 Developer ID 签名，也没有经过 Apple 公证。它只适合在构建它的这台 Mac 上使用。不要把 `.app` 或 `.icns` 打包发给别人；若要分发，请自行完成签名、公证，并遵守 Mole 的许可协议。

---

## 它是什么

- **本地桌面同伴**：在图形界面里完成一遍真实任务，不用开终端：预览、确认、执行、查看日志。
- **薄外壳**：每个动作都是一次 argv 形式的 CLI 调用，例如 `clean --dry-run`、`status --json`、`uninstall --list`。GUI 从不自己删文件。
- **覆盖完整流程**：概览、清理、卸载、优化、空间回收（项目清理 / installer 清理）、磁盘分析、历史、设置。
- **安静、快速、离线**：深色界面、无网络请求、无遥测、无后台常驻、无菜单栏图标、无自动清理、无定时任务。

### 不是什么

- 不是 Mole CLI 的功能替代品，也不会增加 CLI 没有的能力；CLI 没有的 flag，GUI 也不会自己发明。
- 不是 Mole Mac 的替代品，也不要求在 CLI 和 GUI 之间做功能对齐。
- 不会编辑白名单文件（v1 请在终端使用 `mo clean --whitelist`，设置页会说明）。
- 不会在后台监控磁盘、不弹通知、不自动更新。

## 界面

| 屏幕 | 做什么 |
| --- | --- |
| 概览 | 读取 `status --json`：健康评分、磁盘、内存、CPU、电池、温度、网络、高占用进程 |
| 清理 | `clean --dry-run` 预览可释放空间与分类，确认后以管理员权限执行 |
| 卸载 | `uninstall --list` 列出应用，`--dry-run` 预览残留，确认后卸载 |
| 优化 | `optimize --dry-run` 预览维护任务，确认后执行 |
| 空间回收 | `purge --dry-run` 预览项目缓存；installer 清理交给终端 |
| 磁盘分析 | `analyze --json <path>` 查看目录占用，交互式浏览交给终端 |
| 历史 | `history --json --limit 100` 查看操作日志 |
| 设置 | 内置/外部 CLI 路径、版本与状态、CLI 使用说明、卸载入口 |

按钮：`Cmd+1`…`Cmd+8` 切换屏幕，`Cmd+R` 刷新，`Cmd+,` 打开设置，`Esc` 关闭弹窗。窗口默认 1280×840，最小 1060×700。

## 仓库布局

本仓库是 **Mole GUI** 的完整源码，是一个独立仓库。两种用法：

```bash
# 1) 独立 clone（推荐给只想装 GUI 的人）
git clone https://github.com/isongxw/Mole-GUI.git
cd Mole-GUI
bash build.sh      # 首次构建会拉取 Mole CLI 源码到 .cache/mole
bash install.sh    # 安装到 /Applications 并启动

# 2) 作为 Mole CLI 仓库的子模块（CLI 仓库用 git submodule 引用本仓库）
git submodule update --init --recursive
```

**GUI 是 CLI 的外壳，不是它的替代品。** 每个动作都是一次 argv 形式的 CLI 调用，所以构建需要 Mole CLI 源码（`mole`、`mo`、`lib/`、`bin/`）。构建脚本按下面的顺序找它：

1. 环境变量 `MOLE_CLI_ROOT` 指定的目录；
2. **本仓库的上一级目录**——子模块布局 `<Mole 仓库根>/gui`，上一级就是 CLI 仓库，直接用它，不额外下载；
3. `.cache/mole`——独立 clone 时由 `tools/fetch-mole.sh` 拉取的固定版本 CLI 源码（默认最新正式版 `V<x.y.z>`，Windows CLI 的 `V<x.y.z>-windows` 标签是另一个产品，不参与解析）。

第 3 步的拉取默认在首次构建时自动发生，也可以显式执行、换版本或关掉：

```bash
bash tools/fetch-mole.sh              # 拉取最新正式版
bash tools/fetch-mole.sh --ref main   # 拉取指定分支或标签
bash tools/fetch-mole.sh --update     # 重新解析到最新正式版
MOLE_CLI_AUTO_FETCH=0 bash build.sh   # 缺少 CLI 源码时直接报错，不自动下载
```

## 安装

要求：

- macOS 13（Ventura）或更新版本
- Apple Silicon（arm64）Mac，本轮只构建 arm64
- 命令行工具（Command Line Tools）：`xcode-select --install`。无需完整 Xcode
- Go 工具链（编译内置 CLI 的 Go 辅助程序 `status-go` / `analyze-go`）
- 网络（仅首次构建：拉取 Mole CLI 源码和 Go 模块；之后构建离线可用）

```bash
# 在本仓库根目录执行
bash build.sh    # 产出 build/Mole GUI.app
bash install.sh  # 安装到 /Applications 并启动
```

`bash install.sh` 会做这些事：

1. 如果 `build/Mole GUI.app` 不存在，自动执行 `bash build.sh`；build.sh 在 Go 辅助程序（`bin/status-go`、`bin/analyze-go`）缺失时会在 CLI 源码目录里执行 `make build`（需要 Go 工具链与模块下载）。
2. 如果 Mole GUI 正在运行，先优雅退出；超时后用 `pkill -x MoleGUI` 精确结束同名进程。
3. 只在确认目标恰好是 `/Applications/Mole GUI.app` 之后才移除旧 bundle，再用 `ditto` 复制新构建。
4. 校验 `Info.plist`（bundle id、可执行文件名）、可执行权限和 `codesign --verify --deep --strict`，然后 `open` 启动。

脚本**从不在内部调用 sudo**，也拒绝以 root 身份运行（安装到 `/Applications` 不需要 root）。若 `/Applications` 不可写，会提示需要管理员账号或手动执行 `sudo ditto`。重复运行是安全的（幂等）。`bash install.sh --help` 列出全部参数。

## 更新

GUI 不是自更新应用，内置 CLI 也不会跟着 `mo update` 更新。更新流程：

```bash
git pull
bash build.sh
bash install.sh
```

想换内置 CLI 的版本，先更新 `.cache/mole` 再重新构建：

```bash
bash tools/fetch-mole.sh --update   # 或 --ref <tag>
bash build.sh && bash install.sh
```

安装脚本会自动退出正在运行的旧版本，再把新构建复制到 `/Applications`。

## 卸载

```bash
bash install.sh --uninstall            # 保留 ~/Library/Logs/mole（与 CLI 共享）
bash install.sh --uninstall --purge-logs  # 连操作日志一起删（会删掉 CLI 历史）
bash install.sh --uninstall --dry-run  # 只打印计划
```

卸载会：退出 app、移除 `/Applications/Mole GUI.app`、移除 `~/Library/Application Support/Mole GUI`。默认**保留** `~/Library/Logs/mole/operations.log`，因为它是 Mole CLI 的共享操作日志；`--purge-logs` 才会删除它。Mole CLI 本身不受影响。

设置页里的「卸载 App」只会把 app bundle 移到废纸篓，不会清理 GUI 配置；要彻底清理请用上面的脚本。

## 安全模型

- **先预览，再执行**：清理、卸载、优化都先运行 `--dry-run` 展示将要发生的事，再要求用户明确确认。
- **GUI 不删文件**：删除路径全部经过 CLI 的 `mole_delete`、废纸篓通道和路径保护规则；GUI 只负责显示和确认。
- **可恢复优先**：CLI 按项目约定把用户文件移入废纸篓；确认弹窗用红色主按钮，并写清后果。
- **管理员密码只用于系统级操作**：普通的预览、列表、历史不需要密码。系统级动作（如清理系统缓存）会弹出原生密码框，密码只通过 stdin 交给 `sudo -S -v` 建立会话，不写入 argv、不写入环境变量、不落盘、不进日志。取消密码框 = 中止任务，界面恢复可用；密码错误会提示重试。
- **取消可控**：取消任务时向进程组依次发送 `SIGINT → SIGTERM → SIGKILL`，不会留下僵死进程。
- **离线**：没有网络请求，没有遥测，没有远程资源；界面资源全部来自 app bundle。
- **不常驻**：不注册登录项、不做后台监控、通知或定时任务；退出 app 后不留下常驻进程。
- **白名单仍归 CLI**：GUI 不写白名单文件，设置页会告诉你去终端运行 `mo clean --whitelist`。

## 内置 CLI 运行时

app 里带一份构建时拷贝的 Mole CLI：

```
Mole GUI.app/Contents/Resources/mole-runtime/
├── mole
├── mo
├── lib/
└── bin/
```

- 版本在**构建时**从当前 checkout 打入；侧边栏底部显示内置 CLI 版本和状态点。
- `mo update` 只更新独立安装的 CLI，**不会**更新 app 内的副本。想升级 GUI 里的 CLI：`git pull && bash build.sh && bash install.sh`（内置 CLI 来自 `.cache/mole` 时，先 `bash tools/fetch-mole.sh --update`）。
- 设置页可选用外部 CLI 路径（`cliPath`），但默认始终使用内置运行时，避免外部 CLI 版本不匹配。
- 内置 CLI 不可执行或缺失时，界面顶部会显示「CLI 缺失」横幅，提供重新检测、选择外部 CLI 和安装命令。

## 已知限制

- **未签名、未公证**：本地 ad-hoc 构建；从别的机器拷过来的 app 会被 Gatekeeper 拦截（见下一节）。不要分发给他人。
- **installer 清理**：`mo installer` 是交互式命令，GUI 会把它交给**终端**执行，完成后回到 GUI。
- **磁盘分析的交互式浏览**：GUI 展示 `analyze --json` 的结果；需要方向键浏览的 TUI 会交给终端。
- **空间回收**：`purge` 在 GUI 内确认后以 `--yes` 执行；installer 清理同样走终端。
- **不支持**：后台监控、菜单栏常驻、通知、定时/自动清理、白名单图形化编辑、自动更新、远程控制。
- **部分清理耗时较长**：大目录的扫描和清理可能需要几十秒到几分钟，界面会显示运行日志；可以随时取消。
- **权限决定预览完整度**：未授予完整磁盘访问权限时，部分目录不可见，预览可能偏小（见故障排查）。

## 故障排查

**Gatekeeper 拒绝打开（“无法验证开发者” / “已损坏”）**

本地构建通常没有 quarantine 标记；如果你从别处拷贝或压缩后再解压，可能会出现。处理方式：

1. 在 Finder 里右键 app →「打开」→ 再次确认打开。
2. 或移除 quarantine 标记：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Mole GUI.app"
   ```

3. 仍失败就重新本地构建：`bash build.sh && bash install.sh`。

**清理预览不完整 / 废纸篓大小偏小**

给 app「完全磁盘访问权限」：系统设置 → 隐私与安全性 → 完全磁盘访问权限 → `+` → 选择 `/Applications/Mole GUI.app`，然后重启 app。没有这个权限时，受保护目录不会被扫描，预览会偏小但不会出错。

**密码输入后提示“管理员授权未生效 / 授权失败”？**

说明 sudo 会话没有在 CLI 子进程中生效。先取消并重试一次；仍失败时，在终端执行一次 `sudo -v` 后立即回到 GUI 重试，或把系统级清理留给 `mo clean`。普通预览、卸载列表和历史不受影响。

**为什么弹出了管理员密码框？**

这是 Mole 在执行系统级维护（如系统缓存清理、部分应用卸载）。密码只用于建立 sudo 会话，Mole GUI 不保存、不记录。普通预览、列表、历史不需要密码。不想提供就直接取消，任务会中止。

**构建失败**

- 先确认 `xcode-select -p` 可用；`swiftc --version` 能输出版本。
- 先确认 CLI 源码就位：`bash tools/fetch-mole.sh`（或把 `MOLE_CLI_ROOT` 指向一个 Mole 仓库）。
- 再运行 `bash build.sh`。
- 查看 `bash build.sh` 的输出定位具体步骤。

**日志和配置在哪里**

| 内容 | 位置 |
| --- | --- |
| CLI 操作日志与删除明细（与 CLI 共享，`mo history` 也读取） | `~/Library/Logs/mole/operations.log`、`~/Library/Logs/mole/deletions.log` |
| GUI 配置（外部 CLI 路径、上次屏幕、欢迎页状态） | `~/Library/Application Support/Mole GUI/` |
| CLI 配置（白名单、`clean-list.txt` 等，GUI 不修改） | `~/.config/mole/` |
| 构建产物 | `build/Mole GUI.app`、`build/AppIcon.icns` |

**卸载后还有残留？**

默认只保留 `~/Library/Logs/mole`（CLI 共享日志）。要连日志一起清掉：`bash install.sh --uninstall --purge-logs`。

## 开发

- 规格与契约：[`SPEC.md`](./SPEC.md) 是强制契约；CLI 输出契约由 `CONTRACT.md` 维护（存在时一并阅读）。
- 文件所有权见 SPEC 的「File ownership」表。`install.sh`、`README.md`、`tools/icon.swift` 属于 packaging/文档；不要在没有约定的情况下改别人的文件。

常用命令（本仓库根目录）：

```bash
bash tools/fetch-mole.sh                   # 拉取 Mole CLI 源码到 .cache/mole（构建前置）
bash build.sh                               # 构建 app（Go 辅助程序在缺失时自动编译）
"build/Mole GUI.app/Contents/MacOS/MoleGUI" --self-test
"build/Mole GUI.app/Contents/MacOS/MoleGUI" --exec --version
bash tools/verify.sh                     # 全量验证：构建 + 原生自检 + 真实 CLI + 网页快照 + 测试
bash tools/snapshot-web.sh               # 仅 Chrome headless 网页快照
node tests/run.js                        # 解析器与 mock bridge 测试
bash tests/privileged_argv_test.sh       # 管理员权限任务启动参数回归测试（不弹密码框）

# 真实桥接 + 内置 CLI 的无窗口端到端检查（渲染真实 status 数据并截图）
"build/Mole GUI.app/Contents/MacOS/MoleGUI" --webview-check --live --snapshot /tmp/live.png

bash install.sh --dry-run                # 预览安装动作
bash install.sh --uninstall --dry-run    # 预览卸载动作

bash -n install.sh
shfmt -d -i 4 -ci -sr install.sh         # 安装了 shfmt 时
```

生成应用图标（无参数、无需 GUI 会话）：

```bash
/usr/bin/swiftc -O tools/icon.swift -o /tmp/mole-icon-gen && /tmp/mole-icon-gen
# 输出 build/AppIcon.iconset/ 和 build/AppIcon.icns
```

开发期安全约定：只运行 `--dry-run` / `--list` / `--json` / `--version` 等只读命令；不要在开发过程中真正执行 `mo clean`、`mo uninstall`、`mo optimize`、`mo purge --yes` 或 `mo installer`（除非明确是在测试安装脚本本身）。更完整的安全规则见 Mole CLI 仓库的 [`AGENTS.md`](https://github.com/tw93/Mole/blob/main/AGENTS.md) 的「Critical Safety Rules」。

## 许可协议

GPL-3.0，与它内置的 [Mole CLI](https://github.com/tw93/Mole) 相同。`build/Mole GUI.app/Contents/Resources/mole-runtime/` 里打包的 CLI 运行时是 Mole CLI 本体（© tw93），按 GPL-3.0 一并分发，详见 [`LICENSE`](./LICENSE)。「Mole」是其权利人的商标；本仓库是独立的配套应用，不是 CLI 的官方发布渠道。

---

## English

**Mole GUI** is a local macOS desktop companion for the Mole CLI: a native window hosting a bundled web UI, where every action is still an argv invocation of the bundled Mole CLI. The CLI remains the single source of truth for safety rules, whitelists, path protection, logging and dry-run behavior; the app adds no business logic and never deletes files itself.

- Bundle: `Mole GUI.app` (bundle id `fit.mole.gui`, executable `MoleGUI`), installed to `/Applications`.
- Screens: dashboard, clean, uninstall, optimize, reclaim (purge / installer hand-off), disk analyze, history, settings.
- Layout: this repository holds the whole GUI. The Mole CLI sources it bundles are resolved from `$MOLE_CLI_ROOT`, from the parent directory (the submodule layout `<mole-root>/gui`), or from `.cache/mole`, which `bash tools/fetch-mole.sh` fetches at a pinned release tag. Windows CLI tags (`V<x.y.z>-windows`) are a different product and are never resolved here.
- Install (repo root, macOS 13+, Apple Silicon, Command Line Tools, Go toolchain):

  ```bash
  bash build.sh && bash install.sh
  ```

  The script builds when needed, quits a running instance, replaces the bundle only after verifying the exact path, checks `Info.plist`, the executable and `codesign --verify --deep --strict`, then launches. It never calls sudo; if `/Applications` is not writable it prints an actionable manual command. It is idempotent.

- Update: `git pull && bash build.sh && bash install.sh`.
- Uninstall: `bash install.sh --uninstall` (keeps the shared CLI operation logs) or `--uninstall --purge-logs`. `--dry-run` previews. The Mole CLI itself is untouched.
- Safety: always preview (`--dry-run`) and confirm before destructive actions; the GUI only runs documented CLI commands, deletions go through the CLI's Trash routing and protection rules. The admin password prompt is used only for system-level jobs; the password travels over stdin into `sudo -S -v`, is never stored or logged. No network, no telemetry, no background agents.
- Bundled runtime: the CLI is copied into the app at build time. `mo update` does not update the bundled copy — rebuild the app. Settings can point at an external CLI, but the bundled runtime is the default.
- Requirements: macOS 13+, Apple Silicon (arm64 build). No full Xcode needed. The first build needs network access (CLI sources + Go modules).
- Limitations: installer cleanup and interactive analyze TUI hand off to Terminal; the app is not notarized (local ad-hoc build only) and must not be distributed.
- Troubleshooting: Gatekeeper → right-click Open or `xattr -dr com.apple.quarantine "/Applications/Mole GUI.app"`; grant Full Disk Access for complete clean previews and Trash sizing; logs live in `~/Library/Logs/mole`, GUI config in `~/Library/Application Support/Mole GUI`, CLI config in `~/.config/mole`.
- Development: see [`SPEC.md`](./SPEC.md) for the binding build spec and file ownership; icon generation is `swiftc -O tools/icon.swift -o /tmp/mole-icon-gen && /tmp/mole-icon-gen`.

> **Unsigned local build — do not redistribute.** This app is ad-hoc signed and not notarized. It is meant for the machine that built it. Sign and notarize it yourself before sharing.

## License

GPL-3.0, the same license as the [Mole CLI](https://github.com/tw93/Mole) it bundles. The bundled CLI runtime in `build/Mole GUI.app/Contents/Resources/mole-runtime/` is Mole CLI, © tw93, redistributed under GPL-3.0; see [`LICENSE`](./LICENSE). "Mole" is a trademark of its owner — this repository is an independent companion app, not an official release channel of the CLI.
