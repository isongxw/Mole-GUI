import Cocoa
import WebKit

/// Owns the JS <-> native message bridge:
/// * JS calls `window.webkit.messageHandlers.mole.postMessage({action, ...})`
/// * Native pushes events with `window.__moleNative(jsonString)`
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    weak var window: NSWindow?

    private let config = AppConfig()
    private var cli: CLIRef
    private var jobs: [String: CLIJob] = [:]

    private var appVersion: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"
    }

    private var appBuild: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
    }

    override init() {
        cli = CLIRef()
        super.init()
        cli = CLIResolver.resolve(config: config)
    }

    // MARK: - Message handling

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "mole",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "init":
            emitReady()
        case "run":
            handleRun(body)
        case "cancel":
            if let jobId = body["jobId"] as? String {
                jobs[jobId]?.cancel()
            }
        case "getConfig":
            emitConfig()
        case "setConfig":
            handleSetConfig(body)
        case "chooseCLI":
            handleChooseCLI()
        case "reveal":
            if let path = body["path"] as? String { reveal(path: path) }
        case "openExternal":
            if let url = body["url"] as? String { openExternal(url: url) }
        case "openTerminal":
            if let args = body["args"] as? [Any] {
                let list = args.compactMap { $0 as? String }
                openTerminal(args: list)
            }
        case "clipboard":
            if let text = body["text"] as? String {
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                pasteboard.setString(text, forType: .string)
                emit(["type": "toast", "message": "已复制到剪贴板", "tone": "success"])
            }
        case "exportJSON":
            if let content = body["content"] as? String {
                exportJSON(suggestedName: body["suggestedName"] as? String ?? "mole-export.json", content: content)
            }
        case "uninstallSelf":
            uninstallSelf()
        case "quit":
            NSApp.terminate(nil)
        default:
            emit(["type": "native_error", "message": "未知操作: \(action)"])
        }
    }

    // MARK: - Events out

    func emitReady() {
        cli = CLIResolver.resolve(config: config)
        var payload: [String: Any] = [
            "type": "ready",
            "app": ["version": appVersion, "build": appBuild],
            "cli": cli.json,
            "config": configJSON(),
            "home": AppPaths.home,
            "paths": [
                "logs": AppPaths.logsDir,
                "config": AppPaths.moleConfigDir,
                "appSupport": AppPaths.appSupport.path,
                "downloads": AppPaths.downloadsDir,
                "applications": AppPaths.applicationsDir,
            ],
        ]
        if !cli.ok {
            payload["cliError"] = cli.error
        }
        emit(payload)
    }

    private func emitConfig() {
        emit(["type": "config_changed", "config": configJSON()])
    }

    private func configJSON() -> [String: Any] {
        let data = config.snapshot()
        return [
            "cliPath": data.cliPath,
            "lastScreen": data.lastScreen,
            "welcomeSeen": data.welcomeSeen,
        ]
    }

    private func emitCLIChanged() {
        emit(["type": "cli_changed", "cli": cli.json])
    }

    func emit(_ event: [String: Any]) {
        guard let webView = webView else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: event, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        let literal = Self.jsStringLiteral(json)
        DispatchQueue.main.async {
            webView.evaluateJavaScript("window.__moleNative(\(literal))") { _, error in
                if let error = error {
                    // The page may not have registered the handler yet (reload
                    // race). There is nothing else to do with the event.
                    NSLog("MoleGUI bridge emit failed: \(error.localizedDescription)")
                }
            }
        }
    }

    private static func jsStringLiteral(_ string: String) -> String {
        var out = "\""
        for scalar in string.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{2028}": out += "\\u2028"
            case "\u{2029}": out += "\\u2029"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }

    // MARK: - Jobs

    private func handleRun(_ body: [String: Any]) {
        guard let jobId = body["jobId"] as? String, !jobId.isEmpty else {
            emit(["type": "native_error", "message": "缺少任务 ID"])
            return
        }
        guard let rawArgs = body["args"] as? [Any] else {
            emit(["type": "native_error", "message": "缺少命令参数"])
            return
        }
        let args = rawArgs.compactMap { $0 as? String }
        guard args.count == rawArgs.count, !args.isEmpty, args.count <= 64 else {
            emit(["type": "native_error", "message": "命令参数不合法"])
            return
        }
        guard args.allSatisfy({ $0.count <= 4096 }) else {
            emit(["type": "native_error", "message": "命令参数过长"])
            return
        }
        guard jobs[jobId] == nil else {
            emit(["type": "native_error", "message": "任务 ID 重复"])
            return
        }
        guard cli.ok else {
            emit([
                "type": "job_exit", "jobId": jobId, "code": -1, "cancelled": false,
                "durationMs": 0, "error": "cli_missing",
            ])
            emit(["type": "toast", "message": "未找到可用的 Mole CLI", "tone": "danger"])
            return
        }

        let privileged = body["privileged"] as? Bool ?? false
        let label = body["label"] as? String ?? ""

        var password: String?
        if privileged {
            emit(["type": "auth_waiting", "jobId": jobId])
            guard let entered = promptForPassword(reason: label) else {
                emit([
                    "type": "job_exit", "jobId": jobId, "code": 130, "cancelled": true,
                    "durationMs": 0, "error": "auth_cancelled",
                ])
                emit(["type": "toast", "message": "已取消管理员授权", "tone": "warning"])
                return
            }
            password = entered
        }

        let job = CLIJob(
            id: jobId,
            cliPath: cli.path,
            args: args,
            privileged: privileged,
            label: label
        )
        jobs[jobId] = job

        job.onOutput = { [weak self] text in
            self?.emit([
                "type": "job_output", "jobId": jobId, "stream": "stdout", "text": text,
            ])
        }
        job.onExit = { [weak self] result in
            guard let self = self else { return }
            self.jobs.removeValue(forKey: jobId)
            var error = result.error
            if privileged {
                if result.code == 99 { error = "auth_failed" }
                if result.code == 98 { error = "auth_session_failed" }
            }
            self.emit([
                "type": "job_exit", "jobId": jobId, "code": Int(result.code),
                "cancelled": result.cancelled, "durationMs": result.durationMs,
                "error": error,
            ])
            if error == "auth_failed" {
                self.emit(["type": "toast", "message": "管理员密码不正确，请重试", "tone": "danger"])
            } else if error == "auth_session_failed" {
                self.emit(["type": "toast", "message": "管理员授权未生效，请重试", "tone": "danger"])
            }
        }

        emit([
            "type": "job_started", "jobId": jobId, "args": args,
            "label": label, "privileged": privileged,
        ])

        if let error = job.start(password: password) {
            password = nil
            jobs.removeValue(forKey: jobId)
            emit([
                "type": "job_exit", "jobId": jobId, "code": -1, "cancelled": false,
                "durationMs": 0, "error": "spawn_failed",
            ])
            emit(["type": "toast", "message": "无法启动 Mole CLI：\(error)", "tone": "danger"])
            return
        }
        password = nil
    }

    private func promptForPassword(reason: String) -> String? {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "需要管理员权限"
        let context = reason.isEmpty ? "" : "（\(reason)）"
        alert.informativeText = "此操作需要修改系统级项目\(context)。\nMole 只会请求这一次管理员授权，密码仅交给 sudo，不会被保存。"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "继续")
        alert.addButton(withTitle: "取消")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        field.placeholderString = "管理员密码"
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return nil }
        let password = field.stringValue
        return password.isEmpty ? nil : password
    }

    // MARK: - Config / CLI selection

    private func handleSetConfig(_ body: [String: Any]) {
        guard let patch = body["patch"] as? [String: Any] else { return }
        config.update { data in
            if let value = patch["lastScreen"] as? String, !value.isEmpty {
                data.lastScreen = value
            }
            if let value = patch["welcomeSeen"] as? Bool {
                data.welcomeSeen = value
            }
            if let value = patch["cliPath"] as? String {
                data.cliPath = value
            }
        }
        let cliPathChanged = (patch["cliPath"] as? String) != nil
        emitConfig()
        if cliPathChanged {
            cli = CLIResolver.resolve(config: config)
            emitCLIChanged()
        }
    }

    private func handleChooseCLI() {
        let panel = NSOpenPanel()
        panel.title = "选择 Mole CLI"
        panel.message = "选择 mo 或 mole 可执行文件（通常在 /usr/local/bin 或 /opt/homebrew/bin）"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = URL(fileURLWithPath: "/usr/local/bin")
        guard panel.runModal() == .OK, let url = panel.url else { return }
        var errors: [String] = []
        guard let ref = CLIResolver.probe(path: url.path, source: "custom", errors: &errors) else {
            emit(["type": "toast", "message": "该文件不是可用的 Mole CLI", "tone": "danger"])
            return
        }
        config.update { $0.cliPath = ref.path }
        cli = ref
        emitConfig()
        emitCLIChanged()
        emit(["type": "toast", "message": "已切换到 CLI \(ref.version)", "tone": "success"])
    }

    // MARK: - Native helpers

    private func reveal(path: String) {
        let fm = FileManager.default
        let expanded = (path as NSString).expandingTildeInPath
        if fm.fileExists(atPath: expanded) {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: expanded)])
            return
        }
        let parent = (expanded as NSString).deletingLastPathComponent
        if fm.fileExists(atPath: parent) {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: parent)])
        } else {
            emit(["type": "toast", "message": "路径不存在", "tone": "warning"])
        }
    }

    private func openExternal(url: String) {
        guard let parsed = URL(string: url),
              let scheme = parsed.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            emit(["type": "toast", "message": "只允许打开 http(s) 链接", "tone": "warning"])
            return
        }
        NSWorkspace.shared.open(parsed)
    }

    private func openTerminal(args: [String]) {
        guard cli.ok else {
            emit(["type": "toast", "message": "未找到可用的 Mole CLI", "tone": "danger"])
            return
        }
        let command = ([cli.path] + args).map(Self.shellQuote).joined(separator: " ")
        let escaped = command
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let source = """
        tell application "Terminal"
            activate
            do script "\(escaped)"
        end tell
        """
        var error: NSDictionary?
        if let script = NSAppleScript(source: source) {
            script.executeAndReturnError(&error)
        }
        if let error = error {
            emit(["type": "toast", "message": "无法打开终端", "tone": "danger"])
            NSLog("MoleGUI openTerminal failed: \(error)")
        }
    }

    static func shellQuote(_ token: String) -> String {
        let safe = token.range(of: "^[A-Za-z0-9_./+=:,@%^-]+$", options: .regularExpression) != nil
        if safe { return token }
        return "'" + token.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private func exportJSON(suggestedName: String, content: String) {
        let panel = NSSavePanel()
        panel.title = "导出"
        panel.nameFieldStringValue = suggestedName
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try content.data(using: .utf8)?.write(to: url, options: .atomic)
            emit(["type": "toast", "message": "已导出到 \(url.lastPathComponent)", "tone": "success"])
        } catch {
            emit(["type": "toast", "message": "导出失败：\(error.localizedDescription)", "tone": "danger"])
        }
    }

    private func uninstallSelf() {
        let bundleURL = Bundle.main.bundleURL
        guard bundleURL.pathExtension == "app" else {
            emit(["type": "toast", "message": "当前不是 .app 运行，无法自动卸载", "tone": "warning"])
            return
        }
        do {
            var trashed: NSURL?
            try FileManager.default.trashItem(at: bundleURL, resultingItemURL: &trashed)
            NSApp.terminate(nil)
        } catch {
            emit(["type": "toast", "message": "移动到废纸篓失败：\(error.localizedDescription)", "tone": "danger"])
        }
    }
}
