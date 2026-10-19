#!/bin/bash
# Build "Mole GUI.app" — a local, ad-hoc-signed macOS app that hosts the web UI
# and a bundled copy of the Mole CLI runtime.
#
# Usage: bash gui/build.sh [--no-sign]
# Output: gui/build/Mole GUI.app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
APP_NAME="Mole GUI"
APP="$BUILD_DIR/$APP_NAME.app"
CONTENTS="$APP/Contents"
RESOURCES="$CONTENTS/Resources"
ARCH="$(uname -m)"
DEPLOYMENT_TARGET="macos13.0"
SWIFT_TARGET="$ARCH-apple-$DEPLOYMENT_TARGET"
SIGN=true

for argument in "$@"; do
    case "$argument" in
        --no-sign) SIGN=false ;;
        --help | -h)
            echo "Usage: bash gui/build.sh [--no-sign]"
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

cd "$ROOT_DIR"

[[ "$(uname -s)" == "Darwin" ]] || fail "Mole GUI can only be built on macOS"
command -v swiftc > /dev/null 2>&1 || fail "swiftc not found. Install the Xcode Command Line Tools: xcode-select --install"
command -v iconutil > /dev/null 2>&1 || fail "iconutil not found (part of the macOS Command Line Tools)"

# 1. Go helpers (status/analyze) are bundled with the app.
if [[ ! -x "$ROOT_DIR/bin/status-go" || ! -x "$ROOT_DIR/bin/analyze-go" ]]; then
    log "Building Go helpers (bin/status-go, bin/analyze-go)"
    make build
fi

# 2. Web UI is required; the Swift host only renders what ships in Resources.
[[ -f "$ROOT_DIR/gui/app/web/index.html" ]] || fail "gui/app/web/index.html is missing; the web UI has not been written yet"
[[ -f "$ROOT_DIR/gui/app/MoleGUI/main.swift" ]] || fail "Swift sources are missing"

# 3. Fresh bundle skeleton. The path is fixed and generated.
log "Preparing bundle"
rm -rf "$APP" # SAFE: generated build artifact under gui/build
mkdir -p "$CONTENTS/MacOS" "$RESOURCES"

# 4. Compile the Swift host.
log "Compiling Swift host for $SWIFT_TARGET"
swiftc \
    -O \
    -swift-version 5 \
    -target "$SWIFT_TARGET" \
    "$ROOT_DIR"/gui/app/MoleGUI/*.swift \
    -framework Cocoa \
    -framework WebKit \
    -o "$CONTENTS/MacOS/MoleGUI"

# 5. Bundle metadata.
cp "$ROOT_DIR/gui/app/Info.plist" "$CONTENTS/Info.plist"
printf 'APPL????' > "$CONTENTS/PkgInfo"
RESOURCE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CONTENTS/Info.plist" 2> /dev/null || echo 1.0.0)"

# 6. Web UI.
log "Copying web UI"
ditto "$ROOT_DIR/gui/app/web" "$RESOURCES/web"
find "$RESOURCES/web" -name '.DS_Store' -delete

# 7. Bundled CLI runtime (mole + lib + bin, including the Go helpers).
log "Bundling Mole CLI runtime"
RUNTIME="$RESOURCES/mole-runtime"
mkdir -p "$RUNTIME"
cp "$ROOT_DIR/mole" "$ROOT_DIR/mo" "$RUNTIME/"
ditto "$ROOT_DIR/lib" "$RUNTIME/lib"
ditto "$ROOT_DIR/bin" "$RUNTIME/bin"
find "$RUNTIME" -name '.DS_Store' -delete
chmod +x "$RUNTIME/mole" "$RUNTIME/mo"
find "$RUNTIME/bin" -type f \( -name '*.sh' -o -name '*-go' \) -exec chmod +x {} +

# The CLI must be able to resolve its own lib/ from the bundle location.
"$RUNTIME/mole" --version > /dev/null 2>&1 || fail "bundled CLI failed to run; check gui/build and bin/ contents"
CLI_VERSION="$("$RUNTIME/mole" --version 2> /dev/null | sed -n 's/^Mole version //p' | head -1)"

# 8. App icon (optional generator owned by gui/tools/icon.swift).
if [[ -f "$ROOT_DIR/gui/tools/icon.swift" ]]; then
    log "Generating app icon"
    ICON_TOOL="$BUILD_DIR/icon-gen"
    if [[ ! -x "$ICON_TOOL" || "$ROOT_DIR/gui/tools/icon.swift" -nt "$ICON_TOOL" ]]; then
        swiftc -O "$ROOT_DIR/gui/tools/icon.swift" -o "$ICON_TOOL" || fail "icon generator failed to compile"
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
    codesign --force --deep --sign - "$APP" > /dev/null 2>&1 || fail "codesign failed"
    codesign --verify --deep --strict "$APP" > /dev/null 2>&1 || fail "codesign verification failed"
fi

APP_SIZE="$(du -sh "$APP" | awk '{print $1}')"
log "Built $APP"
echo "  arch:     $ARCH"
echo "  cli:      ${CLI_VERSION:-unknown}"
echo "  version:  $RESOURCE_VERSION"
echo "  size:     $APP_SIZE"
echo "  next:     bash gui/install.sh    (copy to /Applications and launch)"
