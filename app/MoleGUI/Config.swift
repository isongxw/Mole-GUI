import Foundation

/// Persistent GUI configuration. Stored at
/// ~/Library/Application Support/Mole GUI/config.json
struct ConfigData: Codable {
    var cliPath: String = ""
    var lastScreen: String = "dashboard"
    var welcomeSeen: Bool = false
}

/// Where the app, the bundled CLI runtime and the user's Mole state live.
enum AppPaths {
    static let appSupport: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Mole GUI", isDirectory: true)
    }()

    static var configFile: URL { appSupport.appendingPathComponent("config.json") }

    static var home: String { NSHomeDirectory() }
    static var logsDir: String { (home as NSString).appendingPathComponent("Library/Logs/mole") }
    static var moleConfigDir: String { (home as NSString).appendingPathComponent(".config/mole") }
    static var downloadsDir: String { (home as NSString).appendingPathComponent("Downloads") }
    static var applicationsDir: String { "/Applications" }

    /// CLI runtime bundled inside the .app. Nil when the executable is run
    /// straight out of the build directory without a bundle.
    static var bundledRuntimeDir: URL? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let dir = resources.appendingPathComponent("mole-runtime", isDirectory: true)
        return FileManager.default.fileExists(atPath: dir.path) ? dir : nil
    }

    static var bundledCLI: String? {
        guard let dir = bundledRuntimeDir else { return nil }
        let cli = dir.appendingPathComponent("mole").path
        return FileManager.default.isExecutableFile(atPath: cli) ? cli : nil
    }

    static var webDir: URL? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let dir = resources.appendingPathComponent("web", isDirectory: true)
        return FileManager.default.fileExists(atPath: dir.path) ? dir : nil
    }
}

final class AppConfig {
    private(set) var data: ConfigData
    private let lock = NSLock()

    init() {
        var loaded = ConfigData()
        if let raw = try? Data(contentsOf: AppPaths.configFile),
           let decoded = try? JSONDecoder().decode(ConfigData.self, from: raw) {
            loaded = decoded
        }
        data = loaded
    }

    func snapshot() -> ConfigData {
        lock.lock()
        defer { lock.unlock() }
        return data
    }

    func update(_ mutate: (inout ConfigData) -> Void) {
        lock.lock()
        mutate(&data)
        let copy = data
        lock.unlock()
        persist(copy)
    }

    private func persist(_ value: ConfigData) {
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: AppPaths.appSupport, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(value)
            let tmp = AppPaths.configFile.appendingPathExtension("tmp")
            try data.write(to: tmp, options: .atomic)
            _ = try? fm.replaceItemAt(AppPaths.configFile, withItemAt: tmp)
        } catch {
            // Configuration persistence is best-effort; the app keeps working
            // with in-memory settings when the support directory is read-only.
        }
    }
}

/// A resolved Mole CLI entrypoint.
struct CLIRef {
    var path: String = ""
    var version: String = ""
    var source: String = "none" // bundled | custom | system | none
    var ok: Bool = false
    var error: String = ""

    var json: [String: Any] {
        [
            "path": path,
            "version": version,
            "source": source,
            "ok": ok,
            "error": error,
        ]
    }
}

enum CLIResolver {
    private static let versionTimeout: TimeInterval = 8

    /// Resolve the CLI to use, in priority order:
    /// 1. MOLE_GUI_CLI environment override (development)
    /// 2. user-selected path from config
    /// 3. the runtime bundled inside the app
    /// 4. a system install (Homebrew / official installer)
    static func resolve(config: AppConfig) -> CLIRef {
        var errors: [String] = []

        if let override = ProcessInfo.processInfo.environment["MOLE_GUI_CLI"], !override.isEmpty {
            if let ref = probe(path: override, source: "custom", errors: &errors) {
                return ref
            }
        }

        let configured = config.snapshot().cliPath
        if !configured.isEmpty {
            if let ref = probe(path: configured, source: "custom", errors: &errors) {
                return ref
            }
            errors.append("configured CLI is not runnable: \(configured)")
        }

        if let bundled = AppPaths.bundledCLI {
            if let ref = probe(path: bundled, source: "bundled", errors: &errors) {
                return ref
            }
        }

        let home = AppPaths.home
        let candidates = [
            "/opt/homebrew/bin/mo",
            "/usr/local/bin/mo",
            "\(home)/.local/bin/mo",
            "\(home)/.mole/bin/mole",
            "/opt/homebrew/bin/mole",
            "/usr/local/bin/mole",
        ]
        for candidate in candidates where FileManager.default.isExecutableFile(atPath: candidate) {
            if let ref = probe(path: candidate, source: "system", errors: &errors) {
                return ref
            }
        }

        var missing = CLIRef()
        missing.error = errors.first ?? "未找到可用的 Mole CLI"
        return missing
    }

    static func probe(path: String, source: String, errors: inout [String]) -> CLIRef? {
        guard FileManager.default.isExecutableFile(atPath: path) else {
            errors.append("不可执行: \(path)")
            return nil
        }
        let (code, output) = runSync(path: path, args: ["--version"], timeout: versionTimeout)
        guard code == 0 else {
            errors.append("\(path) --version 退出码 \(code)")
            return nil
        }
        var ref = CLIRef()
        ref.path = path
        ref.source = source
        ref.version = parseVersion(output) ?? "unknown"
        ref.ok = true
        return ref
    }

    static func parseVersion(_ output: String) -> String? {
        // The CLI prints "Mole version 1.61.0" on its own line.
        for line in output.split(separator: "\n") {
            let text = String(line).trimmingCharacters(in: .whitespaces)
            if text.hasPrefix("Mole version ") {
                return String(text.dropFirst("Mole version ".count))
            }
        }
        return nil
    }

    /// Synchronous CLI invocation used for short probes (--version, sudo -n).
    static func runSync(path: String, args: [String], timeout: TimeInterval) -> (Int32, String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = args
        var env = childEnvironment()
        for (key, value) in ProcessInfo.processInfo.environment where env[key] == nil {
            env[key] = value
        }
        process.environment = env
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
        } catch {
            return (-1, "无法启动: \(error.localizedDescription)")
        }

        let deadline = DispatchTime.now() + timeout
        let finished = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in finished.signal() }
        if finished.wait(timeout: deadline) == .timedOut {
            process.terminate()
            _ = finished.wait(timeout: .now() + 2)
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
            process.waitUntilExit()
            return (-1, "超时")
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        return (process.terminationStatus, text)
    }

    /// Environment shared by every spawned CLI process. GUI apps inherit a
    /// minimal PATH from launchd, so Homebrew locations are added explicitly.
    static func childEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        if env["HOME"] == nil || env["HOME"]!.isEmpty {
            env["HOME"] = AppPaths.home
        }
        if env["LANG"] == nil || env["LANG"]!.isEmpty {
            env["LANG"] = "en_US.UTF-8"
        }
        if env["LC_ALL"] == nil {
            env["LC_ALL"] = env["LANG"]
        }
        env["TERM"] = "dumb"
        var path = env["PATH"] ?? ""
        let extras = [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ]
        for entry in extras where !path.split(separator: ":").map(String.init).contains(entry) {
            path = path.isEmpty ? entry : path + ":" + entry
        }
        env["PATH"] = path
        return env
    }
}
