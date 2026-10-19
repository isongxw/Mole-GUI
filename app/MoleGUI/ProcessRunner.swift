import Darwin
import Foundation

/// A single spawned Mole CLI job.
///
/// The process is started with `posix_spawn` in its own process group so that
/// cancel can signal the whole tree (bash + sudo + Go helper). stdout and
/// stderr are merged into one pipe; the CLI itself decides colors from `isatty`,
/// which is false here, so output is plain text.
final class CLIJob {
    let id: String
    let args: [String]
    let privileged: Bool
    let label: String

    private let cliPath: String
    private let startedAt = Date()
    private let ioQueue: DispatchQueue

    private var pid: pid_t = 0
    private var readFD: Int32 = -1
    private var readSource: DispatchSourceRead?
    private var pendingBytes: [UInt8] = []
    private var exited = false
    private var streamsOpen = 1
    private var finished = false
    private var cancelled = false
    private var exitCode: Int32 = 0
    private var forceFinishScheduled = false

    var onOutput: ((String) -> Void)?
    var onExit: ((JobResult) -> Void)?

    struct JobResult {
        let code: Int32
        let cancelled: Bool
        let durationMs: Int
        let error: String
    }

    init(id: String, cliPath: String, args: [String], privileged: Bool, label: String) {
        self.id = id
        self.cliPath = cliPath
        self.args = args
        self.privileged = privileged
        self.label = label
        self.ioQueue = DispatchQueue(label: "fit.mole.gui.job.\(id)")
    }

    // MARK: - Start / cancel

    func start(password: String?) -> String? {
        var outPipe: [Int32] = [-1, -1]
        guard pipe(&outPipe) == 0 else { return "无法创建输出管道" }
        var inPipe: [Int32] = [-1, -1]
        if privileged {
            guard pipe(&inPipe) == 0 else {
                close(outPipe[0])
                close(outPipe[1])
                return "无法创建输入管道"
            }
        }

        var fileActions: posix_spawn_file_actions_t?
        posix_spawn_file_actions_init(&fileActions)
        var attr: posix_spawnattr_t?
        posix_spawnattr_init(&attr)
        defer {
            posix_spawn_file_actions_destroy(&fileActions)
            posix_spawnattr_destroy(&attr)
        }

        posix_spawn_file_actions_adddup2(&fileActions, outPipe[1], STDOUT_FILENO)
        posix_spawn_file_actions_adddup2(&fileActions, outPipe[1], STDERR_FILENO)
        posix_spawn_file_actions_addclose(&fileActions, outPipe[0])
        posix_spawn_file_actions_addclose(&fileActions, outPipe[1])
        if privileged {
            posix_spawn_file_actions_adddup2(&fileActions, inPipe[0], STDIN_FILENO)
            posix_spawn_file_actions_addclose(&fileActions, inPipe[0])
            posix_spawn_file_actions_addclose(&fileActions, inPipe[1])
        } else {
            posix_spawn_file_actions_addopen(&fileActions, STDIN_FILENO, "/dev/null", O_RDONLY, 0)
        }

        posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETPGROUP))
        // pgroup 0 => the child becomes the leader of a new process group, so
        // kill(-pid, sig) reaches its children too.
        posix_spawnattr_setpgroup(&attr, 0)

        var argv: [String]
        if privileged {
            argv = ["/bin/bash", "-c", Self.authWrapper, cliPath] + args
        } else {
            argv = [cliPath] + args
        }

        let environment = CLIResolver.childEnvironment()
        var argvC: [UnsafeMutablePointer<CChar>?] = argv.map { strdup($0) }
        argvC.append(nil)
        var envC: [UnsafeMutablePointer<CChar>?] = environment.map { strdup("\($0.key)=\($0.value)") }
        envC.append(nil)
        defer {
            for pointer in argvC where pointer != nil { free(pointer) }
            for pointer in envC where pointer != nil { free(pointer) }
        }

        // The executable is bash for privileged jobs (it hosts the auth
        // wrapper); argv[0] must stay "/bin/bash" and the CLI is passed as $0.
        let executablePath = privileged ? "/bin/bash" : cliPath
        guard let pathC = strdup(executablePath) else { return "内存不足" }
        defer { free(pathC) }

        var childPid: pid_t = 0
        let rc = argvC.withUnsafeBufferPointer { argvBuffer -> Int32 in
            envC.withUnsafeBufferPointer { envBuffer -> Int32 in
                posix_spawn(&childPid, pathC, &fileActions, &attr, argvBuffer.baseAddress, envBuffer.baseAddress)
            }
        }
        guard rc == 0 else {
            close(outPipe[0])
            close(outPipe[1])
            if privileged {
                close(inPipe[0])
                close(inPipe[1])
            }
            return "无法启动 Mole CLI（errno \(rc)）"
        }

        close(outPipe[1])
        readFD = outPipe[0]
        let streamFD = readFD
        setNonBlocking(readFD)
        pid = childPid

        if privileged {
            close(inPipe[0])
            writePassword(password, to: inPipe[1])
            close(inPipe[1])
        }

        let source = DispatchSource.makeReadSource(fileDescriptor: readFD, queue: ioQueue)
        source.setEventHandler { [weak self] in self?.drainOutput() }
        source.setCancelHandler {
            close(streamFD)
        }
        readSource = source
        source.resume()

        let child = childPid
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            var status: Int32 = 0
            var reaped = false
            while true {
                let result = waitpid(child, &status, 0)
                if result == child {
                    reaped = true
                    break
                }
                if result == -1 && errno == EINTR { continue }
                break
            }
            self?.ioQueue.async { self?.processExited(status: reaped ? status : -1) }
        }
        return nil
    }

    func cancel() {
        ioQueue.async { [weak self] in
            guard let self = self, !self.finished, !self.cancelled else { return }
            self.cancelled = true
            self.signalGroup(SIGINT)
            self.scheduleEscalation(after: 1.5, signal: SIGTERM)
            self.scheduleEscalation(after: 3.0, signal: SIGKILL)
        }
    }

    private func scheduleEscalation(after: TimeInterval, signal sig: Int32) {
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + after) { [weak self] in
            guard let self = self else { return }
            self.ioQueue.async {
                guard !self.finished else { return }
                self.signalGroup(sig)
            }
        }
    }

    private func signalGroup(_ sig: Int32) {
        guard pid > 0 else { return }
        _ = kill(-pid, sig)
    }

    // MARK: - Output

    private func drainOutput() {
        guard readFD >= 0 else { return }
        var buffer = [UInt8](repeating: 0, count: 65536)
        let count = read(readFD, &buffer, buffer.count)
        if count > 0 {
            let chunk = decode(buffer: Array(buffer[0..<count]))
            if !chunk.isEmpty {
                let callback = onOutput
                DispatchQueue.main.async { callback?(chunk) }
            }
            return
        }
        if count == 0 {
            closeInputStream()
            return
        }
        if errno == EAGAIN || errno == EINTR { return }
        closeInputStream()
    }

    private func closeInputStream() {
        if readFD >= 0 {
            readSource?.cancel()
            readSource = nil
            readFD = -1
            // setCancelHandler closes the descriptor.
        }
        if streamsOpen > 0 {
            streamsOpen = 0
            let pending = flushPendingBytes()
            if !pending.isEmpty {
                let callback = onOutput
                DispatchQueue.main.async { callback?(pending) }
            }
        }
        finishIfReady(force: false)
    }

    /// Decode a UTF-8 chunk without corrupting multibyte characters split
    /// across reads. Invalid trailing bytes are retained for the next chunk.
    private func decode(buffer: [UInt8]) -> String {
        pendingBytes.append(contentsOf: buffer)
        if let text = String(bytes: pendingBytes, encoding: .utf8) {
            pendingBytes.removeAll(keepingCapacity: true)
            return text
        }
        var low = 0
        var high = pendingBytes.count
        while low < high {
            let mid = (low + high + 1) / 2
            if String(bytes: pendingBytes[0..<mid], encoding: .utf8) != nil {
                low = mid
            } else {
                high = mid - 1
            }
        }
        if low == 0 {
            if pendingBytes.count > 8192 {
                pendingBytes.removeAll(keepingCapacity: true)
                return String(decoding: buffer, as: UTF8.self)
            }
            return ""
        }
        let text = String(bytes: pendingBytes[0..<low], encoding: .utf8) ?? ""
        pendingBytes.removeFirst(low)
        return text
    }

    private func flushPendingBytes() -> String {
        guard !pendingBytes.isEmpty else { return "" }
        let text = String(decoding: pendingBytes, as: UTF8.self)
        pendingBytes.removeAll()
        return text
    }

    // MARK: - Exit

    private func processExited(status: Int32) {
        guard !exited else { return }
        exited = true
        if status < 0 {
            exitCode = 1
        } else if (status & 0x7f) == 0 {
            exitCode = (status >> 8) & 0xff
        } else {
            exitCode = 128 + (status & 0x7f)
        }
        finishIfReady(force: false)
        if !finished && !forceFinishScheduled {
            forceFinishScheduled = true
            ioQueue.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.finishIfReady(force: true)
            }
        }
    }

    private func finishIfReady(force: Bool) {
        guard !finished, exited else { return }
        guard force || streamsOpen == 0 else { return }
        finished = true
        if readFD >= 0 {
            readSource?.cancel()
            readSource = nil
            readFD = -1
        }
        let duration = Int(Date().timeIntervalSince(startedAt) * 1000)
        let result = JobResult(
            code: cancelled && exitCode == 0 ? 130 : exitCode,
            cancelled: cancelled,
            durationMs: duration,
            error: ""
        )
        let callback = onExit
        DispatchQueue.main.async { callback?(result) }
    }

    // MARK: - Helpers

    private func setNonBlocking(_ fd: Int32) {
        let flags = fcntl(fd, F_GETFL, 0)
        if flags >= 0 {
            _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
        }
    }

    private func writePassword(_ password: String?, to fd: Int32) {
        guard let password = password else { return }
        var bytes = Array((password + "\n").utf8)
        var offset = 0
        while offset < bytes.count {
            let written = bytes.withUnsafeBytes { raw -> Int in
                guard let base = raw.baseAddress else { return -1 }
                return write(fd, base.advanced(by: offset), bytes.count - offset)
            }
            if written <= 0 {
                if errno == EINTR { continue }
                break
            }
            offset += written
        }
        // Best effort: overwrite the local buffer copy. Swift strings cannot be
        // zeroed in place, so we keep this buffer as short-lived as possible.
        for index in bytes.indices { bytes[index] = 0 }
    }

    /// Fixed bash wrapper used only for privileged jobs. The password arrives on
    /// stdin, is handed to `sudo -S` and is never placed in argv or the
    /// environment. `exec` keeps the PID, which is what makes sudo's cached
    /// timestamp (keyed by parent PID when there is no TTY) visible to the CLI.
    static let authWrapper = """
    IFS= read -r -s mole_password || exit 1
    printf '%s\\n' "$mole_password" | /usr/bin/sudo -S -p '' -v > /dev/null 2>&1
    mole_auth_rc=$?
    unset mole_password
    [ "$mole_auth_rc" -eq 0 ] || exit 99
    /usr/bin/sudo -n true 2> /dev/null || exit 98
    exec "$0" "$@"
    """
}
