#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! ${1:-} =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    echo "Usage: bash setup-service/install.sh <plugin-name>" >&2
    exit 2
fi
if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI was not found on PATH." >&2
    exit 1
fi

plugin=$1
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ ! -f "$root/plugins/$plugin/plugin.json" ]]; then
    echo "Unknown plugin: $plugin" >&2
    exit 2
fi

codex plugin marketplace add "$root"
exec codex plugin add "$plugin@cmander-skills"
