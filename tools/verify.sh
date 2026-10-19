#!/bin/bash
# End-to-end build verification for Mole GUI.
#
# Runs everything that can be checked without a human in front of the screen:
#   1. build the .app (Swift + bundled CLI runtime + icon)
#   2. --self-test (CLI resolution, runtime files, web assets)
#   3. --exec --version (bundled CLI runs)
#   4. --job-test status --json (streamed job pipeline)
#   5. --webview-check (real WKWebView boots the mock UI and snapshots it)
#   6. parser/bridge unit tests (node) if present
#   7. headless Chrome snapshots for every screen/scenario
#
# Usage: bash tools/verify.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP="$GUI_DIR/build/Mole GUI.app"
BIN="$APP/Contents/MacOS/MoleGUI"
OUT="$GUI_DIR/build/verify"
failures=0

cd "$GUI_DIR"
mkdir -p "$OUT"

step() { printf '\n\033[35m▸ %s\033[0m\n' "$*"; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() {
    printf '  \033[31m✗\033[0m %s\n' "$*"
    failures=$((failures + 1))
}

step "Build"
if bash build.sh > "$OUT/build.log" 2>&1; then
    pass "build build/Mole GUI.app"
else
    fail "build failed (see $OUT/build.log)"
    tail -20 "$OUT/build.log"
    echo
    echo "Verification stopped: the app bundle does not exist."
    exit 1
fi

step "Native self-test"
if "$BIN" --self-test > "$OUT/self-test.json" 2>&1; then
    pass "self-test ok"
    grep -E '"version"|"source"|"ok"' "$OUT/self-test.json" | head -6 | sed 's/^/    /'
else
    fail "self-test failed (see $OUT/self-test.json)"
    tail -20 "$OUT/self-test.json"
fi

step "Bundled CLI"
if "$BIN" --exec --version > "$OUT/cli-version.txt" 2>&1; then
    pass "cli: $(grep -m1 '^Mole version ' "$OUT/cli-version.txt" || echo 'version line missing')"
else
    fail "--exec --version failed"
fi

step "Streamed job pipeline"
if "$BIN" --job-test status --json > "$OUT/status.json" 2> "$OUT/status.err"; then
    if grep -q '"health_score"' "$OUT/status.json"; then
        pass "status --json streamed and parsed"
    else
        fail "status --json output missing expected fields"
    fi
else
    fail "--job-test status --json failed (see $OUT/status.err)"
fi

step "WKWebView boot and snapshot (mock)"
if "$BIN" --webview-check --snapshot "$OUT/webview-check.png" > "$OUT/webview-check.json" 2>&1; then
    pass "WKWebView ready ($(grep -o '"navItems" : [0-9]*' "$OUT/webview-check.json" | head -1))"
    if [[ -s "$OUT/webview-check.png" ]]; then
        pass "snapshot $(stat -f%z "$OUT/webview-check.png") bytes"
    else
        fail "webview snapshot missing"
    fi
else
    fail "webview check failed (see $OUT/webview-check.json)"
fi

step "Live bridge + bundled CLI (real status data)"
if "$BIN" --webview-check --live --snapshot "$OUT/webview-live.png" > "$OUT/webview-live.json" 2>&1; then
    if grep -q '"ready" : true' "$OUT/webview-live.json"; then
        pass "real bridge booted and rendered live status"
    else
        fail "live check returned ready=false"
    fi
    if [[ -s "$OUT/webview-live.png" ]]; then
        pass "live snapshot $(stat -f%z "$OUT/webview-live.png") bytes"
    else
        fail "live snapshot missing"
    fi
else
    fail "live webview check failed (see $OUT/webview-live.json)"
fi

step "Privileged exec path (regression)"
if bash tests/privileged_argv_test.sh > "$OUT/privileged-argv.log" 2>&1; then
    pass "privileged job execs the CLI with its own argv"
else
    fail "privileged argv regression (see $OUT/privileged-argv.log)"
    tail -20 "$OUT/privileged-argv.log"
fi

step "Parser and bridge tests"
if [[ -f "$GUI_DIR/tests/run.js" ]]; then
    if node "$GUI_DIR/tests/run.js" > "$OUT/tests.log" 2>&1; then
        pass "node tests/run.js"
    else
        fail "node tests failed (see $OUT/tests.log)"
        tail -30 "$OUT/tests.log"
    fi
else
    fail "tests/run.js is missing"
fi

step "Web UI snapshots (Chrome headless)"
if bash tools/snapshot-web.sh > "$OUT/snapshots.log" 2>&1; then
    pass "all screen snapshots rendered"
else
    fail "snapshot run failed (see $OUT/snapshots.log)"
    tail -20 "$OUT/snapshots.log"
fi

echo
if [[ $failures -gt 0 ]]; then
    printf '\033[31m%s check(s) failed\033[0m\n' "$failures"
    exit 1
fi
printf '\033[32mAll verification checks passed\033[0m\n'
echo "Artifacts: $OUT"
