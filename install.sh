#!/bin/bash
# Mole GUI - install, verify and launch the app, or uninstall it.
#
#   bash install.sh              build if needed, install to /Applications, launch
#   bash install.sh --uninstall  quit and remove the app + its GUI config
#   bash install.sh --dry-run    print what would happen, change nothing
#   bash install.sh --help       usage
#
# Safety contract:
#   - never calls sudo and never asks for a password; if /Applications is not
#     writable it prints an actionable command instead of escalating
#   - never touches the network
#   - writes only /Applications/Mole GUI.app and ~/Library/Application Support/Mole GUI
#     (~/Library/Logs/mole only with --uninstall --purge-logs)
#   - the only recursive delete is the exact installed bundle path, asserted below
#   - does not start, stop or reconfigure the Mole CLI; the CLI stays untouched

set -euo pipefail

readonly APP_NAME="Mole GUI"
readonly BUNDLE_ID="fit.mole.gui"
readonly EXECUTABLE="MoleGUI"
readonly APPLICATIONS_DIR="/Applications"
readonly TARGET_APP="${APPLICATIONS_DIR}/${APP_NAME}.app"
readonly TARGET_APP_SUPPORT="${HOME}/Library/Application Support/${APP_NAME}"
readonly OPERATION_LOG_DIR="${HOME}/Library/Logs/mole"

# BSD tools by absolute path: Homebrew coreutils/findutils can sit first in PATH.
readonly OSASCRIPT="/usr/bin/osascript"
readonly DITTO="/usr/bin/ditto"
readonly CODESIGN="/usr/bin/codesign"
readonly PGREP="/usr/bin/pgrep"
readonly PKILL="/usr/bin/pkill"
readonly OPEN="/usr/bin/open"
readonly PBUDDY="/usr/libexec/PlistBuddy"
readonly RM="/bin/rm"
readonly ID="/usr/bin/id"

SCRIPT_DIR=$(cd -- "$(/usr/bin/dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly SCRIPT_DIR
readonly BUILD_APP="${SCRIPT_DIR}/build/${APP_NAME}.app"
readonly BUILD_SCRIPT="${SCRIPT_DIR}/build.sh"

# shellcheck source=mole-env.sh
source "${SCRIPT_DIR}/mole-env.sh"

DRY_RUN=0
UNINSTALL=0
PURGE_LOGS=0

say() {
    printf '%s\n' "$*"
}

section() {
    printf '\n%s\n' "$*"
}

warn() {
    printf 'warning: %s\n' "$*" >&2
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat << 'EOF'
Mole GUI installer

Usage:
  bash install.sh [--dry-run]
  bash install.sh --uninstall [--purge-logs] [--dry-run]
  bash install.sh --help

Options:
  --dry-run       Print every planned action without changing anything.
  --uninstall     Quit Mole GUI, remove /Applications/Mole GUI.app and
                  ~/Library/Application Support/Mole GUI. The Mole CLI and the
                  operation logs in ~/Library/Logs/mole are kept.
  --purge-logs    With --uninstall, also remove ~/Library/Logs/mole. Those logs
                  are shared with the Mole CLI, so this deletes CLI history too.
  -h, --help      Show this help.

What the install does:
  1. If build/Mole GUI.app is missing, run: bash build.sh
  2. Quit a running Mole GUI (AppleScript quit, then SIGTERM to MoleGUI)
  3. Remove the old /Applications/Mole GUI.app only after verifying that exact
     path is a real bundle directory, then copy the fresh build with ditto.
     No user data lives inside the bundle, so the GUI config is left alone
  4. Verify Info.plist (bundle id, executable), the executable bit and the
     ad-hoc signature, then launch the app.

The script never uses sudo. If /Applications is not writable, ask an admin to
install or copy the bundle manually. See README.md for details.
EOF
}

app_is_running() {
    "$PGREP" -x "$EXECUTABLE" > /dev/null 2>&1
}

quit_app() {
    if ! app_is_running; then
        say "Mole GUI is not running."
        return 0
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would quit the running Mole GUI: AppleScript quit, then SIGTERM to ${EXECUTABLE} if needed."
        return 0
    fi

    say "Quitting Mole GUI..."
    # Run the AppleEvent quit in the background so an unresponsive app cannot
    # block the script; fall back to SIGTERM by exact process name. `timeout` is
    # not available on a stock macOS install, so poll instead.
    "$OSASCRIPT" -e "tell application id \"${BUNDLE_ID}\" to quit" > /dev/null 2>&1 &
    local quit_pid=$!
    local tries=0
    while [ "$tries" -lt 40 ] && app_is_running; do
        /bin/sleep 0.1
        tries=$((tries + 1))
    done
    if app_is_running; then
        say "  Graceful quit timed out; sending SIGTERM to ${EXECUTABLE}."
        "$PKILL" -x "$EXECUTABLE" > /dev/null 2>&1 || true
        tries=0
        while [ "$tries" -lt 40 ] && app_is_running; do
            /bin/sleep 0.1
            tries=$((tries + 1))
        done
    fi
    # Never let a stuck AppleEvent outlive the app it was asking to quit.
    if kill -0 "$quit_pid" > /dev/null 2>&1; then
        kill "$quit_pid" > /dev/null 2>&1 || true
    fi
    wait "$quit_pid" > /dev/null 2>&1 || true

    if app_is_running; then
        die "Mole GUI is still running. Quit it manually and retry."
    fi
    say "Mole GUI quit."
}

remove_app_bundle() {
    if [ ! -e "$TARGET_APP" ] && [ ! -L "$TARGET_APP" ]; then
        say "No installed app at ${TARGET_APP}."
        return 0
    fi

    # Guard: the only bundle this script may ever delete is the exact installed
    # location. The check uses its own literal so it does not share state with
    # the variable it validates.
    if [ "$TARGET_APP" != "/Applications/Mole GUI.app" ]; then
        die "refusing to remove unexpected path: ${TARGET_APP}"
    fi
    if [ -L "$TARGET_APP" ]; then
        die "${TARGET_APP} is a symlink; refusing to remove it. Inspect and remove it yourself, then retry."
    fi
    if [ ! -d "$TARGET_APP" ]; then
        die "${TARGET_APP} exists but is not an app bundle directory; inspect it yourself."
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would remove the old app bundle: ${TARGET_APP}"
        return 0
    fi

    say "Removing the old app bundle: ${TARGET_APP}"
    # SAFE: TARGET_APP is a hard-coded constant equal to /Applications/Mole GUI.app,
    # re-asserted above as a non-symlink directory inside /Applications. Nothing
    # else can reach this line.
    if ! "$RM" -rf -- "$TARGET_APP"; then
        die "could not remove ${TARGET_APP}. If it is owned by root, remove it manually: sudo rm -rf '${TARGET_APP}'"
    fi
}

plist_value() {
    local key="$1"
    local plist="${TARGET_APP}/Contents/Info.plist"
    local value
    if ! value=$("$PBUDDY" -c "Print :${key}" "$plist" 2> /dev/null); then
        die "could not read ${key} from ${plist}. The bundle looks incomplete; rebuild with: bash build.sh"
    fi
    printf '%s' "$value"
}

verify_installed_bundle() {
    local plist="${TARGET_APP}/Contents/Info.plist"
    local executable="${TARGET_APP}/Contents/MacOS/${EXECUTABLE}"

    [ -d "$TARGET_APP" ] || die "installed app is missing: ${TARGET_APP}"
    [ -f "$plist" ] || die "Info.plist is missing in ${TARGET_APP}; rebuild with: bash build.sh"

    local bundle_id
    bundle_id=$(plist_value "CFBundleIdentifier")
    [ "$bundle_id" = "$BUNDLE_ID" ] || die "Info.plist CFBundleIdentifier is '${bundle_id}', expected '${BUNDLE_ID}'. Rebuild with: bash build.sh"

    local bundle_executable
    bundle_executable=$(plist_value "CFBundleExecutable")
    [ "$bundle_executable" = "$EXECUTABLE" ] || die "Info.plist CFBundleExecutable is '${bundle_executable}', expected '${EXECUTABLE}'. Rebuild with: bash build.sh"

    [ -x "$executable" ] || die "${executable} is missing or not executable; rebuild with: bash build.sh"
    say "  Info.plist:   ${BUNDLE_ID} / ${EXECUTABLE}"
    say "  Executable:   ${executable}"

    # Bundled runtime sanity: a broken build still installs, but warn so a
    # missing runtime is not mistaken for a working app.
    if [ ! -d "${TARGET_APP}/Contents/Resources/web" ]; then
        warn "Contents/Resources/web is missing; the window will be empty. Rebuild with: bash build.sh"
    fi
    if [ ! -x "${TARGET_APP}/Contents/Resources/mole-runtime/mole" ]; then
        warn "the bundled Mole CLI is missing at Contents/Resources/mole-runtime/mole; the app will show the CLI-missing banner."
    fi

    local signature_error
    if ! signature_error=$("$CODESIGN" --verify --deep --strict "$TARGET_APP" 2>&1); then
        warn "codesign verification failed for the local ad-hoc build:"
        printf '%s\n' "$signature_error" >&2
        warn "If macOS refuses to launch it, rebuild with: bash build.sh"
    else
        say "  Signature:    codesign --verify --deep --strict passed (ad-hoc local build)"
    fi
}

install_app() {
    say "Mole GUI installer"
    say "  repo:   ${SCRIPT_DIR}"
    say "  target: ${TARGET_APP}"
    if [ "$DRY_RUN" -eq 1 ]; then
        say "  mode:   dry run (nothing will be changed)"
    fi

    section "1/4 Build"
    if [ -d "$BUILD_APP" ]; then
        say "Using the existing build: ${BUILD_APP}"
    elif [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] ${BUILD_APP} is missing; would run: bash build.sh"
    else
        [ -f "$BUILD_SCRIPT" ] || die "${BUILD_SCRIPT} is missing; this checkout cannot build Mole GUI."
        say "No built app at ${BUILD_APP}; building now (bash build.sh)..."
        if ! (cd -- "$SCRIPT_DIR" && bash "$BUILD_SCRIPT"); then
            die "build.sh failed. Fix the error above, then re-run bash install.sh. README.md documents the build requirements."
        fi
        [ -d "$BUILD_APP" ] || die "build.sh finished but ${BUILD_APP} does not exist; check its output."
        say "Build finished."
    fi

    section "2/4 Quit"
    quit_app

    section "3/4 Install"
    remove_app_bundle

    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would copy ${BUILD_APP} -> ${TARGET_APP} with ditto."
    else
        if [ ! -w "$APPLICATIONS_DIR" ]; then
            die "${APPLICATIONS_DIR} is not writable by $("$ID" -un). An administrator is needed to install there; ask one, or copy the app manually: sudo ditto '${BUILD_APP}' '${TARGET_APP}'"
        fi
        say "Copying ${BUILD_APP} -> ${TARGET_APP}"
        if ! "$DITTO" "$BUILD_APP" "$TARGET_APP"; then
            die "copy failed. ${APPLICATIONS_DIR} usually needs an administrator account; if yours is not one, ask an admin to install the app, or run manually: sudo ditto '${BUILD_APP}' '${TARGET_APP}'"
        fi
    fi

    section "4/4 Verify and launch"
    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would verify Info.plist, the executable and codesign --verify --deep --strict."
        say "[dry-run] Would launch: open '${TARGET_APP}'"
        say ""
        say "Dry run complete; nothing was changed."
        return 0
    fi

    verify_installed_bundle
    say "Launching ${APP_NAME}..."
    if ! "$OPEN" "$TARGET_APP"; then
        die "could not launch ${TARGET_APP}. Try opening it from Finder; if macOS blocks it, see the Gatekeeper section in README.md."
    fi

    # Confirm the process actually came up. A copy that verifies but never
    # launches is the failure this check exists to surface.
    local launch_tries=0
    while [ "$launch_tries" -lt 50 ] && ! app_is_running; do
        /bin/sleep 0.1
        launch_tries=$((launch_tries + 1))
    done
    if ! app_is_running; then
        warn "${APP_NAME} was installed and verified, but no MoleGUI process appeared after launch. Open it from Finder or check Console for errors."
    fi

    say ""
    say "Done. ${APP_NAME} is installed at ${TARGET_APP}."
    say "The app runs the Mole CLI bundled inside the bundle."
}

remove_app_support() {
    if [ ! -e "$TARGET_APP_SUPPORT" ] && [ ! -L "$TARGET_APP_SUPPORT" ]; then
        say "No GUI config at ${TARGET_APP_SUPPORT}."
        return 0
    fi

    # Guard: only the GUI's own Application Support directory may be removed.
    if [ "$TARGET_APP_SUPPORT" != "${HOME}/Library/Application Support/${APP_NAME}" ]; then
        die "refusing to remove unexpected path: ${TARGET_APP_SUPPORT}"
    fi
    if [ -L "$TARGET_APP_SUPPORT" ]; then
        warn "${TARGET_APP_SUPPORT} is a symlink; leaving it in place. Remove it yourself if it is unwanted."
        return 0
    fi
    if [ ! -d "$TARGET_APP_SUPPORT" ]; then
        warn "${TARGET_APP_SUPPORT} is not a directory; leaving it in place."
        return 0
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would remove the GUI config: ${TARGET_APP_SUPPORT}"
        return 0
    fi

    say "Removing the GUI config: ${TARGET_APP_SUPPORT}"
    # SAFE: TARGET_APP_SUPPORT is the GUI's own Application Support directory,
    # re-asserted above as a non-symlink directory under this user's HOME.
    if ! "$RM" -rf -- "$TARGET_APP_SUPPORT"; then
        die "could not remove ${TARGET_APP_SUPPORT}; inspect permissions and remove it manually."
    fi
}

remove_operation_logs() {
    if [ ! -e "$OPERATION_LOG_DIR" ] && [ ! -L "$OPERATION_LOG_DIR" ]; then
        say "No operation logs at ${OPERATION_LOG_DIR}."
        return 0
    fi
    # Guard: only the shared Mole log directory may be removed.
    if [ "$OPERATION_LOG_DIR" != "${HOME}/Library/Logs/mole" ]; then
        die "refusing to remove unexpected path: ${OPERATION_LOG_DIR}"
    fi
    if [ -L "$OPERATION_LOG_DIR" ]; then
        warn "${OPERATION_LOG_DIR} is a symlink; leaving it in place."
        return 0
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        say "[dry-run] Would remove the shared operation logs: ${OPERATION_LOG_DIR}"
        return 0
    fi

    say "Removing the shared operation logs: ${OPERATION_LOG_DIR}"
    # SAFE: OPERATION_LOG_DIR is the Mole CLI log directory, validated above to be
    # exactly ~/Library/Logs/mole and only reached with the explicit --purge-logs flag.
    if ! "$RM" -rf -- "$OPERATION_LOG_DIR"; then
        die "could not remove ${OPERATION_LOG_DIR}; inspect permissions and remove it manually."
    fi
}

uninstall_app() {
    say "Mole GUI uninstaller"
    say "  app:    ${TARGET_APP}"
    say "  config: ${TARGET_APP_SUPPORT}"
    if [ "$DRY_RUN" -eq 1 ]; then
        say "  mode:   dry run (nothing will be changed)"
    fi

    section "1/3 Quit"
    quit_app

    section "2/3 Remove the app and GUI config"
    remove_app_bundle
    remove_app_support

    section "3/3 Operation logs"
    if [ "$PURGE_LOGS" -eq 1 ]; then
        remove_operation_logs
    else
        say "Kept the operation logs (shared with the Mole CLI): ${OPERATION_LOG_DIR}"
        say "Remove them with: bash install.sh --uninstall --purge-logs"
    fi

    say ""
    if [ "$DRY_RUN" -eq 1 ]; then
        say "Dry run complete; nothing was changed."
    else
        say "Uninstall complete. The Mole CLI itself was not touched."
        say "Reinstall with: bash install.sh"
    fi
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --dry-run)
            DRY_RUN=1
            ;;
        --uninstall)
            UNINSTALL=1
            ;;
        --purge-logs)
            PURGE_LOGS=1
            ;;
        *)
            die "unknown option: $1 (try --help)"
            ;;
    esac
    shift
done

if [ "$PURGE_LOGS" -eq 1 ] && [ "$UNINSTALL" -eq 0 ]; then
    die "--purge-logs only applies with --uninstall"
fi

# Installing to /Applications needs no root; running as root would put the GUI
# config under root's HOME and leave files this account cannot clean up.
if [ "$("$ID" -u)" -eq 0 ]; then
    die "do not run this script as root (no sudo needed). Re-run it as your own account."
fi

if [ "$UNINSTALL" -eq 1 ]; then
    uninstall_app
else
    install_app
fi
