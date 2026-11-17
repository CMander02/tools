#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: bash setup-service/install.sh [--target all|codex|antigravity] <plugin-name>" >&2
    exit 2
}

target="all"
plugin=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            [[ $# -ge 2 ]] || usage
            target="$2"
            shift 2
            ;;
        --target=*)
            target="${1#--target=}"
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            usage
            ;;
        *)
            [[ -z "$plugin" ]] || usage
            plugin="$1"
            shift
            ;;
    esac
done

case "$target" in
    all|codex|antigravity) ;;
    *) usage ;;
esac

if [[ -z "$plugin" || ! "$plugin" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    usage
fi

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
plugin_src="$root/plugins/$plugin"
if [[ ! -f "$plugin_src/plugin.json" ]]; then
    echo "Unknown plugin: $plugin" >&2
    exit 2
fi

if [[ -n "${ANTIGRAVITY_CONFIG_DIR:-}" ]]; then
    agy_config="$ANTIGRAVITY_CONFIG_DIR"
    has_agy=1
else
    agy_config="$HOME/.gemini/config"
    if [[ -d "$agy_config" || -d "$HOME/.gemini" ]]; then
        has_agy=1
    else
        has_agy=0
    fi
fi

ran_any=0

if [[ "$target" == "all" || "$target" == "codex" ]]; then
    if command -v codex >/dev/null 2>&1; then
        codex plugin marketplace add "$root"
        codex plugin add "$plugin@cmander-skills"
        ran_any=1
    elif [[ "$target" == "codex" ]]; then
        echo "Codex CLI was not found on PATH." >&2
        exit 1
    fi
fi

if [[ "$target" == "antigravity" || ( "$target" == "all" && "$has_agy" -eq 1 ) ]]; then
    plugins_root="$agy_config/plugins"
    mkdir -p "$plugins_root"
    stage_dir=$(mktemp -d "$plugins_root/.${plugin}-stage.XXXXXX")
    cleanup() {
        rm -rf "$stage_dir"
    }
    trap cleanup EXIT

    tar -C "$plugin_src" \
        --exclude='node_modules' \
        --exclude='dist' \
        --exclude='zhihu_profile' \
        --exclude='cookies.json' \
        --exclude='.DS_Store' \
        --exclude='__pycache__' \
        --exclude='*.log' \
        -cf - . | (mkdir -p "$stage_dir/$plugin" && tar -C "$stage_dir/$plugin" -xf -)

    rm -rf "$plugins_root/$plugin"
    mv "$stage_dir/$plugin" "$plugins_root/$plugin"
    echo "Installed Antigravity plugin \`$plugin\` to $plugins_root/$plugin"
    ran_any=1
fi

if [[ "$ran_any" -eq 0 ]]; then
    echo "Neither Codex CLI on PATH nor Antigravity (~/.gemini) was found." >&2
    exit 1
fi
