#!/bin/bash
# Build "Mole GUI.app" — a local, ad-hoc-signed macOS app that hosts the web UI
# and a bundled copy of the Mole CLI runtime.
#
# Usage: bash build.sh [--no-sign]
# Output: build/Mole GUI.app
#
# The CLI sources the app bundles are resolved by mole-env.sh: the parent
# checkout in the submodule layout (<mole-root>/gui), a pinned clone in
# .cache/mole otherwise (fetched on demand by tools/fetch-mole.sh).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_DIR="$SCRIPT_DIR"
BUILD_DIR="$GUI_DIR/build"
APP_NAME="Mole GUI"
APP="$BUILD_DIR/$APP_NAME.app"
CONTENTS="$APP/Contents"
RESOURCES="$CONTENTS/Resources"
ARCH="$(uname -m)"
DEPLOYMENT_TARGET="macos13.0"
SWIFT_TARGET="$ARCH-apple-$DEPLOYMENT_TARGET"
SIGN=true

# shellcheck source=mole-env.sh
source "$GUI_DIR/mole-env.sh"

for argument in "$@"; do
    case "$argument" in
        --no-sign) SIGN=false ;;
        --help | -h)
            echo "Usage: bash build.sh [--no-sign]"
            exit 0
            ;;
        *)
            echo "Unknown option: $argument" >&2
            exit 1
            ;;
    esac
done

log() { printf '\033[35m▸\033[0m %s\n' "$*"; }
fail() {
    printf '\033[31m✗\033[0m %s\n' "$*" >&2
    exit 1
}

cd "$GUI_DIR"

[[ "$(uname -s)" == "Darwin" ]] || fail "Mole GUI can only be built on macOS"
command -v swiftc > /dev/null 2>&1 || fail "swiftc not found. Install the Xcode Command Line Tools: xcode-select --install"
command -v iconutil > /dev/null 2>&1 || fail "iconutil not found (part of the macOS Command Line Tools)"

# 0. The bundled runtime needs the Mole CLI sources. They come from the parent
# checkout in the submodule layout, or from a pinned clone this build fetches.
CLI_ROOT=""
if CLI_ROOT="$(mole_cli_root)"; then
    :
else
    cli_status=$?
    if [[ $cli_status -eq 2 ]]; then
        fail "MOLE_CLI_ROOT is set, but it is not a Mole CLI checkout (needs mole, lib/ and bin/)."
    fi
    if [[ "$MOLE_CLI_AUTO_FETCH" != "1" ]]; then
        fail "the Mole CLI sources were not found. Run: bash tools/fetch-mole.sh"
    fi
    log "Fetching the Mole CLI sources (runtime to bundle)"
    if ! CLI_ROOT="$(mole_cli_root_or_fetch)"; then
        fail "could not obtain the Mole CLI sources. Run: bash tools/fetch-mole.sh"
    fi
fi
log "Bundling the Mole CLI runtime from $CLI_ROOT"

# 1. Go helpers (status/analyze) are bundled with the app.
if [[ ! -x "$CLI_ROOT/bin/status-go" || ! -x "$CLI_ROOT/bin/analyze-go" ]]; then
    log "Building Go helpers (bin/status-go, bin/analyze-go)"
    command -v go > /dev/null 2>&1 || fail "go not found. Install the Go toolchain, or copy bin/status-go and bin/analyze-go into $CLI_ROOT/bin"
    make -C "$CLI_ROOT" build
fi

# 2. Web UI is required; the Swift host only renders what ships in Resources.
[[ -f "$GUI_DIR/app/web/index.html" ]] || fail "app/web/index.html is missing; the web UI has not been written yet"
[[ -f "$GUI_DIR/app/MoleGUI/main.swift" ]] || fail "Swift sources are missing"

# 3. Fresh bundle skeleton. The path is fixed and generated.
log "Preparing bundle"
rm -rf "$APP" # SAFE: generated build artifact under build
mkdir -p "$CONTENTS/MacOS" "$RESOURCES"

# 4. Compile the Swift host.
log "Compiling Swift host for $SWIFT_TARGET"
swiftc \
    -O \
    -swift-version 5 \
    -target "$SWIFT_TARGET" \
    "$GUI_DIR"/app/MoleGUI/*.swift \
    -framework Cocoa \
    -framework WebKit \
    -o "$CONTENTS/MacOS/MoleGUI"

# 5. Bundle metadata.
cp "$GUI_DIR/app/Info.plist" "$CONTENTS/Info.plist"
printf 'APPL????' > "$CONTENTS/PkgInfo"
RESOURCE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CONTENTS/Info.plist" 2> /dev/null || echo 1.0.0)"

# 6. Web UI.
log "Copying web UI"
ditto "$GUI_DIR/app/web" "$RESOURCES/web"
find "$RESOURCES/web" -name '.DS_Store' -delete

# 7. Bundled CLI runtime (mole + lib + bin, including the Go helpers).
log "Bundling Mole CLI runtime"
RUNTIME="$RESOURCES/mole-runtime"
mkdir -p "$RUNTIME"
cp "$CLI_ROOT/mole" "$CLI_ROOT/mo" "$RUNTIME/"
ditto "$CLI_ROOT/lib" "$RUNTIME/lib"
ditto "$CLI_ROOT/bin" "$RUNTIME/bin"
find "$RUNTIME" -name '.DS_Store' -delete
chmod +x "$RUNTIME/mole" "$RUNTIME/mo"
find "$RUNTIME/bin" -type f \( -name '*.sh' -o -name '*-go' \) -exec chmod +x {} +

# The CLI must be able to resolve its own lib/ from the bundle location.
"$RUNTIME/mole" --version > /dev/null 2>&1 || fail "bundled CLI failed to run; check build/ and bin/ contents"
CLI_VERSION="$("$RUNTIME/mole" --version 2> /dev/null | sed -n 's/^Mole version //p' | head -1)"

# 8. App icon (optional generator owned by tools/icon.swift).
if [[ -f "$GUI_DIR/tools/icon.swift" ]]; then
    log "Generating app icon"
    ICON_TOOL="$BUILD_DIR/icon-gen"
    if [[ ! -x "$ICON_TOOL" || "$GUI_DIR/tools/icon.swift" -nt "$ICON_TOOL" ]]; then
        swiftc -O "$GUI_DIR/tools/icon.swift" -o "$ICON_TOOL" || fail "icon generator failed to compile"
    fi
    if "$ICON_TOOL" > /dev/null 2>&1 && [[ -f "$BUILD_DIR/AppIcon.icns" ]]; then
        cp "$BUILD_DIR/AppIcon.icns" "$RESOURCES/AppIcon.icns"
    else
        echo "  (icon generation skipped; app will use the generic icon)"
    fi
fi

# 9. Ad-hoc signature so the local build launches without Gatekeeper prompts.
if [[ "$SIGN" == "true" ]]; then
    log "Signing (ad-hoc)"
    xattr -cr "$APP" 2> /dev/null || true
    codesign --force --deep --sign - "$APP" > /dev/null || fail "codesign failed"
    codesign --verify --deep --strict "$APP" > /dev/null || fail "codesign verification failed"
fi

APP_SIZE="$(du -sh "$APP" | awk '{print $1}')"
log "Built $APP"
echo "  arch:     $ARCH"
echo "  cli:      ${CLI_VERSION:-unknown}"
echo "  version:  $RESOURCE_VERSION"
echo "  size:     $APP_SIZE"
echo "  next:     bash install.sh    (copy to /Applications and launch)"
