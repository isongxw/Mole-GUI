#!/bin/bash
# Fetch the Mole CLI sources that Mole GUI bundles as its runtime.
#
# The GUI is a thin shell over the CLI: every action is an argv call into the
# bundled `mole` binary, and the CLI stays the single source of truth for
# safety rules, whitelists, path protection, logging and dry-run behavior. A
# build therefore needs the CLI sources (`mole`, `mo`, `lib/`, `bin/`) next to
# the GUI sources.
#
# In the "submodule" layout the parent checkout already provides them: this
# repository sits at <mole-root>/gui and the parent is the CLI checkout.
# Standalone, this script clones a pinned release of the CLI into .cache/mole
# so the GUI repository can build on its own.
#
# Usage:
#   bash tools/fetch-mole.sh              # fetch the newest plain V<x.y.z> tag
#   bash tools/fetch-mole.sh --ref main   # fetch a branch instead
#   bash tools/fetch-mole.sh --update     # re-resolve to the newest release tag
#
# Environment:
#   MOLE_CLI_REPO_URL   clone source (default https://github.com/tw93/Mole.git)
#   MOLE_CLI_REF        ref to fetch (default: newest plain V<x.y.z> tag)
#
# Prints the resolved CLI root on stdout.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
GUI_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
CACHE_DIR="$GUI_DIR/.cache/mole"
REPO_URL="${MOLE_CLI_REPO_URL:-https://github.com/tw93/Mole.git}"
REF="${MOLE_CLI_REF:-}"
UPDATE=0

log() { printf '\033[35m▸\033[0m %s\n' "$*" >&2; }
fail() {
    printf '\033[31m✗\033[0m %s\n' "$*" >&2
    exit 1
}

usage() {
    cat << 'EOF'
Fetch the Mole CLI sources used by the bundled runtime.

Usage:
  bash tools/fetch-mole.sh [--ref <ref>] [--update]

  --ref <ref>   Fetch this branch or tag instead of the newest release tag.
                Only plain V<x.y.z> tags are accepted as a release; the
                Windows CLI tags (V<x.y.z>-windows) are a different product.
  --update      Re-resolve to the newest release tag and re-clone.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ref)
            [[ $# -ge 2 ]] || fail "--ref needs a value"
            REF="$2"
            shift 2
            ;;
        --ref=*)
            REF="${1#--ref=}"
            shift
            ;;
        --update)
            UPDATE=1
            shift
            ;;
        --help | -h)
            usage
            exit 0
            ;;
        *)
            usage >&2
            fail "unknown argument: $1"
            ;;
    esac
done

# Newest plain V<x.y.z> release tag. The Windows CLI publishes its own
# V<x.y.z>-windows tags in the same repository, and `sort -V` ranks those
# above the macOS tag of the same version, so they are filtered out here.
latest_release_tag() {
    git ls-remote --tags --refs "$REPO_URL" 'V*' |
        awk '{print $2}' |
        sed 's|^refs/tags/||' |
        grep -E '^V[0-9]+\.[0-9]+\.[0-9]+$' |
        sort -V |
        tail -1
}

if [[ -z "$REF" ]]; then
    log "Resolving the newest Mole release tag"
    REF="$(latest_release_tag || true)"
    [[ -n "$REF" ]] || fail "could not resolve a release tag from $REPO_URL; pass --ref <ref>"
fi

if [[ "$UPDATE" -eq 0 && -d "$CACHE_DIR/.git" ]]; then
    cached_ref="$(cat "$CACHE_DIR/.mole-ref" 2> /dev/null || true)"
    if [[ "$cached_ref" == "$REF" ]]; then
        log "Mole CLI sources already at $CACHE_DIR ($REF)"
        printf '%s\n' "$CACHE_DIR"
        exit 0
    fi
    log "Replacing the cached Mole CLI sources ($cached_ref -> $REF)"
else
    log "Fetching the Mole CLI sources ($REF) into $CACHE_DIR"
fi

TMP_DIR="$CACHE_DIR.tmp"
rm -rf "$TMP_DIR" # SAFE: scratch clone directory under this repo's .cache
mkdir -p "$(dirname -- "$CACHE_DIR")"

if ! git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP_DIR"; then
    rm -rf "$TMP_DIR" # SAFE: scratch clone directory under this repo's .cache
    fail "could not clone $REF from $REPO_URL"
fi

rm -rf "$CACHE_DIR" # SAFE: replaceable cache of the fetched CLI sources
mv -- "$TMP_DIR" "$CACHE_DIR"
printf '%s\n' "$REF" > "$CACHE_DIR/.mole-ref"

log "Mole CLI sources ready at $CACHE_DIR ($REF)"
printf '%s\n' "$CACHE_DIR"
