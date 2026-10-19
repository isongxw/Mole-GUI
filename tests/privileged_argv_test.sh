#!/bin/bash
# Regression test for the privileged job spawn path.
#
# A privileged job runs /bin/bash with the auth wrapper, which then `exec`s the
# CLI. A past bug spawned the CLI as the executor while passing bash's argv
# ("/bin/bash -c ..."), so the CLI received "-c" as its first argument and
# answered "Unknown command: -c" after the admin password was accepted.
#
# The test compiles the real ProcessRunner/Config sources with /usr/bin/sudo
# replaced by /usr/bin/true (no authentication prompt, no privileged command),
# runs a real CLI job through the privileged path, and asserts that the CLI
# receives its expected arguments.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT # SAFE: own mktemp directory

cp "$ROOT_DIR/gui/app/MoleGUI/Config.swift" "$WORK_DIR/"
cp "$ROOT_DIR/gui/app/MoleGUI/ProcessRunner.swift" "$WORK_DIR/"

if ! grep -q '/usr/bin/sudo' "$WORK_DIR/ProcessRunner.swift"; then
    echo "FAIL: auth wrapper no longer calls /usr/bin/sudo; update this test" >&2
    exit 1
fi
# Every sudo call in the wrapper is replaced so the wrapper succeeds without a
# password. The wrapper contains at least two: the authenticate call and the
# cached-session probe.
replaced=$(grep -c '/usr/bin/sudo' "$WORK_DIR/ProcessRunner.swift")
if [[ "$replaced" -lt 2 ]]; then
    echo "FAIL: expected the auth wrapper to contain at least two sudo calls, found $replaced" >&2
    exit 1
fi
sed -i '' 's|/usr/bin/sudo|/usr/bin/true|g' "$WORK_DIR/ProcessRunner.swift"

cat > "$WORK_DIR/main.swift" << 'SWIFT'
import Foundation

let config = AppConfig()
let cli = CLIResolver.resolve(config: config)
guard cli.ok else {
    FileHandle.standardError.write(Data("CLI_NOT_FOUND\n".utf8))
    exit(2)
}
let job = CLIJob(id: "privileged-argv", cliPath: cli.path, args: ["--version"], privileged: true, label: "test")
var output = ""
var exitCode: Int32 = -1
var finished = false
job.onOutput = { chunk in output += chunk }
job.onExit = { result in
    exitCode = result.code
    finished = true
}
if let error = job.start(password: "test-password") {
    FileHandle.standardError.write(Data("START_ERROR: \(error)\n".utf8))
    exit(2)
}
let deadline = Date().addingTimeInterval(30)
while !finished && Date() < deadline {
    RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
}
FileHandle.standardOutput.write(Data(output.utf8))
if !finished {
    FileHandle.standardError.write(Data("TIMEOUT\n".utf8))
    exit(124)
}
exit(exitCode)
SWIFT

swiftc -O -swift-version 5 \
    -target "$(uname -m)-apple-macos13.0" \
    "$WORK_DIR/Config.swift" "$WORK_DIR/ProcessRunner.swift" "$WORK_DIR/main.swift" \
    -framework Cocoa -o "$WORK_DIR/privileged-argv-test"

set +e
MOLE_GUI_CLI="$ROOT_DIR/mole" \
    MOLE_TEST_NO_AUTH=1 \
    "$WORK_DIR/privileged-argv-test" > "$WORK_DIR/out.txt" 2> "$WORK_DIR/err.txt"
status=$?
set -e

if grep -q "Unknown command:" "$WORK_DIR/out.txt" "$WORK_DIR/err.txt"; then
    echo "FAIL: the CLI received the bash argv (Unknown command)." >&2
    cat "$WORK_DIR/out.txt" >&2
    exit 1
fi
if ! grep -q '^Mole version ' "$WORK_DIR/out.txt"; then
    echo "FAIL: privileged job did not run the CLI's --version." >&2
    cat "$WORK_DIR/out.txt" "$WORK_DIR/err.txt" >&2
    exit 1
fi
if [[ "$status" -ne 0 ]]; then
    echo "FAIL: privileged job exited $status" >&2
    cat "$WORK_DIR/out.txt" "$WORK_DIR/err.txt" >&2
    exit 1
fi

echo "ok: privileged job execs the CLI with its own argv"
