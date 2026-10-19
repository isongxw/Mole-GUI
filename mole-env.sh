#!/bin/bash
# Shared layout resolution for the Mole GUI repository.
#
# This file is sourced, never executed. It answers two questions:
#
#   MOLE_GUI_DIR   where the GUI sources live (this repository)
#   MOLE_CLI_ROOT  where the Mole CLI sources live (the runtime we bundle)
#
# The GUI is a thin shell: every action is an argv call into a bundled copy of
# the Mole CLI, so a build needs the CLI sources (`mole`, `mo`, `lib/`, `bin/`)
# next to it. The CLI root is resolved in this order:
#
#   1. $MOLE_CLI_ROOT                    explicit override
#   2. the parent directory of this repo "submodule" layout: <mole-root>/gui
#   3. .cache/mole                       a pinned clone fetched by tools/fetch-mole.sh
#
# Set MOLE_CLI_AUTO_FETCH=0 to fail with a pointer to tools/fetch-mole.sh
# instead of fetching the CLI sources on demand.

MOLE_GUI_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
MOLE_GUI_CACHE_DIR="${MOLE_GUI_CACHE_DIR:-$MOLE_GUI_DIR/.cache}"
MOLE_CLI_CACHE_DIR="$MOLE_GUI_CACHE_DIR/mole"
MOLE_CLI_REPO_URL="${MOLE_CLI_REPO_URL:-https://github.com/tw93/Mole.git}"
MOLE_CLI_AUTO_FETCH="${MOLE_CLI_AUTO_FETCH:-1}"

# A directory is a Mole CLI root when it carries the shell CLI and the trees
# the build bundles with it.
mole_gui_is_cli_root() {
    local dir="${1:-}"
    [[ -n "$dir" && -d "$dir" ]] || return 1
    [[ -x "$dir/mole" && -d "$dir/lib" && -d "$dir/bin" ]]
}

# Prints the resolved CLI root on stdout.
#   0 = resolved
#   1 = nothing found
#   2 = $MOLE_CLI_ROOT is set but is not a Mole CLI checkout
mole_cli_root() {
    local candidate parent

    candidate="${MOLE_CLI_ROOT:-}"
    if [[ -n "$candidate" ]]; then
        if mole_gui_is_cli_root "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
        printf 'MOLE_CLI_ROOT is set to %s, but that is not a Mole CLI checkout (needs mole, lib/ and bin/)\n' "$candidate" >&2
        return 2
    fi

    parent="$(cd -- "$MOLE_GUI_DIR/.." && pwd -P)"
    if mole_gui_is_cli_root "$parent"; then
        printf '%s\n' "$parent"
        return 0
    fi

    if mole_gui_is_cli_root "$MOLE_CLI_CACHE_DIR"; then
        printf '%s\n' "$MOLE_CLI_CACHE_DIR"
        return 0
    fi

    return 1
}

# Fetches the CLI sources into the cache. The script prints the resolved root on
# stdout; send it to stderr so a caller that captures stdout stays clean.
mole_cli_fetch() {
    bash "$MOLE_GUI_DIR/tools/fetch-mole.sh" "$@" >&2
}

# Resolves the CLI root, fetching it when the repository has none yet.
# Returns the same status codes as mole_cli_root (0 resolved, 1 nothing found
# and not fetched, 2 the explicit override is invalid).
mole_cli_root_or_fetch() {
    local root status

    if root="$(mole_cli_root)"; then
        printf '%s\n' "$root"
        return 0
    else
        status=$?
    fi

    if [[ $status -eq 2 ]]; then
        return 2
    fi

    if [[ "$MOLE_CLI_AUTO_FETCH" != "1" ]]; then
        return 1
    fi

    if ! mole_cli_fetch; then
        return 1
    fi

    mole_cli_root
}
