#!/bin/bash
# Render every Mole GUI screen in mock mode with headless Chrome.
# Output: gui/build/snapshots/<name>.png
#
# This is a development/verification tool. It does not need a GUI session and
# never talks to the real Mole CLI.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_DIR="$ROOT_DIR/gui/app/web"
OUT_DIR="$ROOT_DIR/gui/build/snapshots"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WIDTH=1440
HEIGHT=900
BUDGET=8000

[[ -x "$CHROME" ]] || {
    echo "Chrome not found at: $CHROME" >&2
    exit 1
}
[[ -f "$WEB_DIR/index.html" ]] || {
    echo "gui/app/web/index.html is missing" >&2
    exit 1
}

mkdir -p "$OUT_DIR"
INDEX_URL="file://$WEB_DIR/index.html"

# name|screen|scenario
CASES=(
    "dashboard-default|dashboard|default"
    "dashboard-loading|dashboard|loading"
    "dashboard-cli-missing|dashboard|cli-missing"
    "clean-default|clean|default"
    "clean-preview|clean|preview"
    "clean-running|clean|running"
    "optimize-default|optimize|default"
    "optimize-preview|optimize|preview"
    "uninstall-default|uninstall|default"
    "uninstall-selected|uninstall|selected"
    "uninstall-preview|uninstall|preview"
    "reclaim-default|reclaim|default"
    "reclaim-purge-preview|reclaim|purge-preview"
    "reclaim-installer|reclaim|installer"
    "analyze-default|analyze|default"
    "analyze-result|analyze|result"
    "history-default|history|default"
    "history-empty|history|empty"
    "settings-default|settings|default"
)

failures=0
for entry in "${CASES[@]}"; do
    IFS='|' read -r name screen scenario <<< "$entry"
    output="$OUT_DIR/$name.png"
    profile="$(mktemp -d)"
    url="$INDEX_URL?mock=1&screen=$screen&scenario=$scenario"
    if ! "$CHROME" \
        --headless=new \
        --disable-gpu \
        --hide-scrollbars \
        --no-first-run \
        --force-prefers-reduced-motion \
        --run-all-compositor-stages-before-draw \
        --no-default-browser-check \
        --force-device-scale-factor=1 \
        --window-size="$WIDTH,$HEIGHT" \
        --virtual-time-budget="$BUDGET" \
        --user-data-dir="$profile" \
        --screenshot="$output" \
        "$url" > /dev/null 2>&1; then
        echo "FAILED (chrome) $name"
        failures=$((failures + 1))
    else
        size=$(stat -f%z "$output" 2> /dev/null || echo 0)
        if [[ "$size" -lt 15000 ]]; then
            echo "SUSPECT (${size}B) $name -> $output"
            failures=$((failures + 1))
        else
            echo "ok  $name  (${size}B)"
        fi
    fi
    rm -rf "$profile" # SAFE: temporary Chrome profile created above
done

echo
if [[ $failures -gt 0 ]]; then
    echo "$failures snapshot(s) failed; inspect $OUT_DIR"
    exit 1
fi
echo "All snapshots written to $OUT_DIR"
