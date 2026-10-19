import Cocoa
import WebKit

// MARK: - Entry point

let cliArguments = CommandLine.arguments

if cliArguments.contains("--help") || cliArguments.contains("-h") {
    print(
        """
        Mole GUI — local macOS window for the Mole CLI

        Usage:
          MoleGUI                     launch the app
          MoleGUI --self-test         print a JSON health report and exit
          MoleGUI --exec <args...>    run the bundled CLI with <args> and relay output
          MoleGUI --job-test <args...>
                                      run the streamed job pipeline (cancellable) and exit
          MoleGUI --webview-check [--snapshot FILE] [--screen NAME] [--live]
                                      load the web UI headlessly and report readiness;
                                      --live exercises the real bridge + bundled CLI

        The app is a thin host: every action runs the bundled Mole CLI in
        gui/build/Mole GUI.app/Contents/Resources/mole-runtime.
        """
    )
    exit(0)
}

if cliArguments.contains("--self-test") {
    exit(SelfTest.run())
}

if let execIndex = cliArguments.firstIndex(of: "--exec") {
    let forwarded = Array(cliArguments[(execIndex + 1)...])
    exit(ExecMode.run(args: forwarded))
}

if let jobTestIndex = cliArguments.firstIndex(of: "--job-test") {
    let forwarded = Array(cliArguments[(jobTestIndex + 1)...])
    exit(JobTest.run(args: forwarded))
}

if cliArguments.contains("--webview-check") {
    var snapshotPath: String?
    if let snapshotIndex = cliArguments.firstIndex(of: "--snapshot"),
       snapshotIndex + 1 < cliArguments.count {
        snapshotPath = cliArguments[snapshotIndex + 1]
    }
    var screen = "dashboard"
    if let screenIndex = cliArguments.firstIndex(of: "--screen"),
       screenIndex + 1 < cliArguments.count {
        screen = cliArguments[screenIndex + 1]
    }
    let live = cliArguments.contains("--live")
    WebViewCheck.run(snapshotPath: snapshotPath, screen: screen, live: live) // calls exit()
}

let application = NSApplication.shared
let appDelegate = AppDelegate()
application.delegate = appDelegate
application.setActivationPolicy(.regular)
application.run()

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var bridge: Bridge!

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let contentRect = NSRect(x: 0, y: 0, width: 1280, height: 840)
        window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Mole GUI"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 1060, height: 700)
        window.backgroundColor = NSColor(calibratedRed: 0.043, green: 0.039, blue: 0.071, alpha: 1)
        window.setFrameAutosaveName("MoleGUIWindow")
        window.center()

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: "window.__MOLE_NATIVE__ = true;",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        bridge = Bridge()
        configuration.userContentController.add(bridge, name: "mole")

        guard let contentView = window.contentView else { return }
        webView = WKWebView(frame: contentView.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false

        bridge.webView = webView
        bridge.window = window
        contentView.addSubview(webView)

        // The top 40pt strip is the native window drag area; the web UI keeps
        // that band free of controls (see gui/SPEC.md).
        let dragView = DragView(
            frame: NSRect(x: 0, y: contentView.bounds.height - 40, width: contentView.bounds.width, height: 40)
        )
        dragView.autoresizingMask = [.width, .minYMargin]
        contentView.addSubview(dragView, positioned: .above, relativeTo: webView)

        loadWebUI()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    private func loadWebUI() {
        guard let webDir = AppPaths.webDir else {
            webView.loadHTMLString(
                "<html><body style=\"background:#0b0a12;color:#f4f2fb;font-family:-apple-system;padding:40px\">"
                    + "<h2>Web 资源缺失</h2><p>请重新运行 <code>bash gui/build.sh</code> 构建应用。</p></body></html>",
                baseURL: nil
            )
            return
        }
        let index = webDir.appendingPathComponent("index.html")
        guard FileManager.default.fileExists(atPath: index.path) else {
            webView.loadHTMLString(
                "<html><body style=\"background:#0b0a12;color:#f4f2fb;font-family:-apple-system;padding:40px\">"
                    + "<h2>index.html 缺失</h2><p>请重新运行 <code>bash gui/build.sh</code>。</p></body></html>",
                baseURL: nil
            )
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: webDir)
    }

    // MARK: Navigation

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.isFileURL {
            decisionHandler(.allow)
            return
        }
        if let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           scheme == "https" || scheme == "http" {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: JavaScript dialogs

    // The web screens use window.confirm for a few last-step confirmations.
    // WKWebView only displays them when the UI delegate implements these
    // panels; without them the confirmation would silently return false.
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Mole GUI"
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Mole GUI"
        alert.informativeText = message
        alert.addButton(withTitle: "确认")
        alert.addButton(withTitle: "取消")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Mole GUI"
        alert.informativeText = prompt
        alert.addButton(withTitle: "好")
        alert.addButton(withTitle: "取消")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    // MARK: Menu

    @objc private func openSettingsMenu() {
        webView.evaluateJavaScript("window.__moleOpenScreen && window.__moleOpenScreen('settings')")
    }

    @objc private func reloadInterface() {
        webView.reload()
    }

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "关于 Mole GUI",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        let settingsItem = NSMenuItem(title: "设置…", action: #selector(openSettingsMenu), keyEquivalent: ",")
        settingsItem.target = self
        appMenu.addItem(settingsItem)
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "隐藏 Mole GUI",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        appMenu.addItem(
            withTitle: "退出 Mole GUI",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: Selector(("cut:")), keyEquivalent: "x")
        editMenu.addItem(withTitle: "拷贝", action: Selector(("copy:")), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: Selector(("paste:")), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: Selector(("selectAll:")), keyEquivalent: "a")
        editItem.submenu = editMenu

        let viewItem = NSMenuItem()
        mainMenu.addItem(viewItem)
        let viewMenu = NSMenu(title: "显示")
        let reloadItem = NSMenuItem(title: "重新加载界面", action: #selector(reloadInterface), keyEquivalent: "R")
        reloadItem.keyEquivalentModifierMask = [.command, .shift]
        reloadItem.target = self
        viewMenu.addItem(reloadItem)
        viewItem.submenu = viewMenu

        let windowItem = NSMenuItem()
        mainMenu.addItem(windowItem)
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }
}

/// Transparent strip that makes the custom titlebar draggable.
final class DragView: NSView {
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            window?.zoom(nil)
        } else {
            window?.performDrag(with: event)
        }
    }

    override var mouseDownCanMoveWindow: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

// MARK: - Headless modes

enum SelfTest {
    static func run() -> Int32 {
        var checks: [[String: Any]] = []
        var ok = true

        func check(_ name: String, _ passed: Bool, _ detail: String = "") {
            checks.append(["name": name, "ok": passed, "detail": detail])
            if !passed { ok = false }
        }

        let config = AppConfig()
        let cli = CLIResolver.resolve(config: config)
        check("cli", cli.ok, cli.ok ? "\(cli.path) (\(cli.version), \(cli.source))" : cli.error)

        var runtime: [String: Any] = ["dir": AppPaths.bundledRuntimeDir?.path ?? "", "missing": [String]()]
        var missing: [String] = []
        if let runtimeDir = AppPaths.bundledRuntimeDir {
            let required = [
                "mole",
                "mo",
                "lib/core/common.sh",
                "lib/core/file_ops.sh",
                "bin/status-go",
                "bin/analyze-go",
                "bin/history.sh",
                "bin/clean.sh",
                "bin/uninstall.sh",
            ]
            for relative in required {
                let path = runtimeDir.appendingPathComponent(relative).path
                let exists = FileManager.default.isExecutableFile(atPath: path)
                    || FileManager.default.fileExists(atPath: path)
                if !exists { missing.append(relative) }
            }
            runtime["missing"] = missing
        } else {
            missing.append("mole-runtime")
            runtime["missing"] = missing
        }
        check("runtime", missing.isEmpty, missing.isEmpty ? "all required files present" : "missing: \(missing.joined(separator: ", "))")

        var web: [String: Any] = ["dir": AppPaths.webDir?.path ?? "", "index": false, "js": 0, "css": 0]
        if let webDir = AppPaths.webDir {
            let index = webDir.appendingPathComponent("index.html")
            let indexExists = FileManager.default.fileExists(atPath: index.path)
            web["index"] = indexExists
            let jsFiles = (try? FileManager.default.contentsOfDirectory(at: webDir.appendingPathComponent("js"), includingPropertiesForKeys: nil)) ?? []
            let cssFiles = (try? FileManager.default.contentsOfDirectory(at: webDir.appendingPathComponent("css"), includingPropertiesForKeys: nil)) ?? []
            web["js"] = jsFiles.filter { $0.pathExtension == "js" }.count
            web["css"] = cssFiles.filter { $0.pathExtension == "css" }.count
            check("web", indexExists && !jsFiles.isEmpty, indexExists ? "index.html present" : "index.html missing")
        } else {
            check("web", false, "web resources directory missing")
        }

        let report: [String: Any] = [
            "ok": ok,
            "app": [
                "version": (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "dev",
                "build": (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0",
                "bundle": Bundle.main.bundleURL.path,
                "executable": Bundle.main.executableURL?.path ?? CommandLine.arguments[0],
            ],
            "cli": cli.json,
            "runtime": runtime,
            "web": web,
            "paths": [
                "home": AppPaths.home,
                "logs": AppPaths.logsDir,
                "config": AppPaths.moleConfigDir,
                "appSupport": AppPaths.appSupport.path,
            ],
            "configFile": AppPaths.configFile.path,
            "checks": checks,
        ]

        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            print(text)
        }
        return ok ? 0 : 1
    }
}

enum ExecMode {
    static func run(args: [String]) -> Int32 {
        let config = AppConfig()
        let cli = CLIResolver.resolve(config: config)
        guard cli.ok else {
            FileHandle.standardError.write(Data("Mole CLI not found: \(cli.error)\n".utf8))
            return 2
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cli.path)
        process.arguments = args
        process.environment = CLIResolver.childEnvironment()
        process.standardInput = FileHandle.standardInput
        process.standardOutput = FileHandle.standardOutput
        process.standardError = FileHandle.standardError
        do {
            try process.run()
        } catch {
            FileHandle.standardError.write(Data("Failed to spawn CLI: \(error.localizedDescription)\n".utf8))
            return 2
        }
        process.waitUntilExit()
        return process.terminationStatus
    }
}

/// Exercise the streaming/cancel-capable job pipeline without a window. Used by
/// build verification for the real CLI. Exits with the CLI's exit status.
enum JobTest {
    static func run(args: [String]) -> Int32 {
        let config = AppConfig()
        let cli = CLIResolver.resolve(config: config)
        guard cli.ok else {
            FileHandle.standardError.write(Data("Mole CLI not found: \(cli.error)\n".utf8))
            return 2
        }
        let job = CLIJob(id: "job-test", cliPath: cli.path, args: args, privileged: false, label: "job-test")
        var exitCode: Int32 = 2
        var finished = false
        job.onOutput = { text in
            FileHandle.standardOutput.write(Data(text.utf8))
        }
        job.onExit = { result in
            exitCode = result.code
            finished = true
        }
        if let error = job.start(password: nil) {
            FileHandle.standardError.write(Data("job failed to start: \(error)\n".utf8))
            return 2
        }
        let deadline = Date().addingTimeInterval(120)
        while !finished && Date() < deadline {
            RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
        if !finished {
            job.cancel()
            _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(1.0))
            return 124
        }
        return exitCode
    }
}

/// Headless WKWebView load used by build/verification scripts. It proves the
/// real WebKit host can boot the web UI, not only Chrome headless.
final class WebViewCheck: NSObject, WKNavigationDelegate {
    private static let shared = WebViewCheck()

    private let app = NSApplication.shared
    private var window: NSWindow?
    private var webView: WKWebView?
    private var bridge: Bridge?
    private var attempts = 0
    private var snapshotPath: String?
    private var targetScreen = "dashboard"
    private var live = false
    private var navigated = false
    private var lastInfo: [String: Any] = [:]

    static func run(snapshotPath: String?, screen: String, live: Bool) {
        shared.snapshotPath = snapshotPath
        shared.targetScreen = screen
        shared.live = live
        shared.app.setActivationPolicy(.accessory)
        shared.prepare()
        shared.app.run()
        // app.run() never returns; finish() exits the process.
    }

    private func prepare() {
        guard let webDir = AppPaths.webDir else {
            finish(ok: false, error: "web resources directory missing", extra: [:])
            return
        }
        let index = webDir.appendingPathComponent("index.html")
        guard FileManager.default.fileExists(atPath: index.path) else {
            finish(ok: false, error: "index.html missing", extra: [:])
            return
        }

        let configuration = WKWebViewConfiguration()
        if live {
            let bridge = Bridge()
            configuration.userContentController.add(bridge, name: "mole")
            self.bridge = bridge
        } else {
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: "window.__MOLE_MOCK__ = true; window.__MOLE_MOCK_SCREEN__ = '\(targetScreen)'; window.__MOLE_MOCK_SCENARIO__ = 'default';",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }
        // Record the first uncaught error so a headless failure is diagnosable.
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: "window.addEventListener('error', function (e) { if (!window.__moleBootError) window.__moleBootError = String(e.message || e.error || 'error'); }); window.addEventListener('unhandledrejection', function (e) { if (!window.__moleBootError) window.__moleBootError = 'rejection: ' + String(e.reason); });",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        let frame = NSRect(x: 0, y: 0, width: 1200, height: 800)
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window?.setFrameOrigin(NSPoint(x: -4000, y: -4000))
        let view = WKWebView(frame: frame, configuration: configuration)
        view.navigationDelegate = self
        window?.contentView = view
        webView = view
        if let bridge = bridge {
            bridge.webView = view
            bridge.window = window
        }
        window?.orderFront(nil)

        view.loadFileURL(index, allowingReadAccessTo: webDir)

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.poll()
        }
    }

    private func poll() {
        attempts += 1
        if attempts > 160 {
            finish(ok: false, error: "timed out waiting for the web UI", extra: lastInfo)
            return
        }
        guard let view = webView else {
            finish(ok: false, error: "webview unavailable", extra: [:])
            return
        }
        let readyExpression: String
        if live {
            // Real bridge: the dashboard is ready once real status cards render.
            readyExpression = """
            (function () {
              var cards = document.querySelectorAll('#screen-body .card, #screen-body .stat-card, #screen-body .dash-card');
              var text = document.body ? document.body.innerText : '';
              var hasData = text.indexOf('健康评分') >= 0 || text.indexOf('系统健康') >= 0;
              return cards.length >= 3 && hasData;
            })()
            """
        } else {
            readyExpression = "window.__moleSnapshotReady === true"
        }
        let script = """
        JSON.stringify({
          ready: \(readyExpression),
          title: document.title,
          navItems: document.querySelectorAll('.nav-item').length,
          textLength: document.body ? document.body.innerText.length : 0,
          href: String(location.href),
          state: String(document.readyState),
          htmlLength: document.documentElement ? document.documentElement.outerHTML.length : 0,
          errorText: (window.__moleBootError || '')
        })
        """
        view.evaluateJavaScript(script) { [weak self] result, error in
            guard let self = self else { return }
            if let error = error {
                self.finish(ok: false, error: "javascript error: \(error.localizedDescription)", extra: [:])
                return
            }
            guard let text = result as? String,
                  let data = text.data(using: .utf8),
                  let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.finish(ok: false, error: "unreadable probe result", extra: [:])
                return
            }
            self.lastInfo = info
            let ready = (info["ready"] as? Bool) ?? false
            if self.live && !self.navigated && ((info["navItems"] as? Int) ?? 0) >= 8 {
                // The app restores the last screen from config; force the
                // requested screen so the headless check is deterministic.
                self.navigated = true
                view.evaluateJavaScript("window.__moleOpenScreen && window.__moleOpenScreen('\(self.targetScreen)')")
            }
            if !ready {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll() }
                return
            }
            if !self.live && self.targetScreen != "dashboard" && !self.navigated {
                self.navigated = true
                view.evaluateJavaScript("window.__moleOpenScreen && window.__moleOpenScreen('\(self.targetScreen)')")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.poll() }
                return
            }
            self.capture(info: info)
        }
    }

    private func capture(info: [String: Any]) {
        guard let path = snapshotPath, let view = webView else {
            finish(ok: true, error: "", extra: info)
            return
        }
        // Give the offscreen window one more run-loop cycle to paint the data
        // that arrived asynchronously through the bridge before snapshotting.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            self.captureNow(info: info, path: path, view: view)
        }
    }

    private func captureNow(info: [String: Any], path: String, view: WKWebView) {
        let configuration = WKSnapshotConfiguration()
        configuration.rect = view.bounds
        view.takeSnapshot(with: configuration) { image, error in
            guard let image = image,
                  let tiff = image.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiff),
                  let png = bitmap.representation(using: .png, properties: [:]) else {
                self.finish(ok: false, error: "snapshot failed: \(error?.localizedDescription ?? "unknown")", extra: info)
                return
            }
            do {
                try png.write(to: URL(fileURLWithPath: path))
            } catch {
                self.finish(ok: false, error: "snapshot write failed: \(error.localizedDescription)", extra: info)
                return
            }
            self.finish(ok: true, error: "", extra: info)
        }
    }

    private func finish(ok: Bool, error: String, extra: [String: Any]) {
        var report: [String: Any] = [
            "ok": ok,
            "webview": true,
            "ready": extra["ready"] ?? false,
            "title": extra["title"] ?? "",
            "navItems": extra["navItems"] ?? 0,
            "textLength": extra["textLength"] ?? 0,
            "snapshot": snapshotPath ?? "",
            "live": live,
            "screen": targetScreen,
            "href": extra["href"] ?? "",
            "state": extra["state"] ?? "",
            "htmlLength": extra["htmlLength"] ?? 0,
            "errorText": extra["errorText"] ?? "",
        ]
        if !error.isEmpty { report["error"] = error }
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            print(text)
        }
        exit(ok ? 0 : 1)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(ok: false, error: "navigation failed: \(error.localizedDescription)", extra: [:])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(ok: false, error: "provisional navigation failed: \(error.localizedDescription)", extra: [:])
    }
}
