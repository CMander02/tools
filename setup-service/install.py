#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

EXCLUDED_NAMES = {
    "node_modules",
    "dist",
    "zhihu_profile",
    "cookies.json",
    ".DS_Store",
    "__pycache__",
}


def ignore_entries(_src: str, names: list[str]) -> set[str]:
    return {name for name in names if name in EXCLUDED_NAMES or name.endswith(".log")}


def install_antigravity(plugin_src: Path, plugin: str, config_dir: Path) -> None:
    plugins_root = config_dir / "plugins"
    plugins_root.mkdir(parents=True, exist_ok=True)
    dest = plugins_root / plugin
    staging_parent = Path(tempfile.mkdtemp(prefix=f".{plugin}-stage-", dir=str(plugins_root)))
    try:
        staged = staging_parent / plugin
        shutil.copytree(plugin_src, staged, ignore=ignore_entries)
        if dest.is_symlink() or dest.is_file():
            dest.unlink()
        elif dest.exists():
            shutil.rmtree(dest)
        staged.rename(dest)
    finally:
        if staging_parent.exists():
            shutil.rmtree(staging_parent, ignore_errors=True)
    print(f"Installed Antigravity plugin `{plugin}` to {dest}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install one plugin from this checkout into Codex and/or Antigravity."
    )
    parser.add_argument("plugin", help="Plugin name, such as general, ai-tools, or web")
    parser.add_argument(
        "--target",
        choices=("all", "codex", "antigravity"),
        default="all",
        help="Target host runtime (default: all)",
    )
    args = parser.parse_args()

    if not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", args.plugin):
        parser.error("use a plugin name such as general or ai-tools")

    root = Path(__file__).resolve().parents[1]
    plugin_src = root / "plugins" / args.plugin
    if not (plugin_src / "plugin.json").is_file():
        parser.error(f"unknown plugin: {args.plugin}")

    env_agy = os.environ.get("ANTIGRAVITY_CONFIG_DIR")
    agy_config = Path(env_agy).expanduser() if env_agy else (Path.home() / ".gemini" / "config")
    has_agy = bool(env_agy) or agy_config.exists() or (Path.home() / ".gemini").exists()
    codex = shutil.which("codex")

    ran_any = False

    if args.target in ("all", "codex"):
        if codex is None:
            if args.target == "codex":
                sys.stderr.write("Codex CLI was not found on PATH.\n")
                return 1
        else:
            registered = subprocess.run([codex, "plugin", "marketplace", "add", str(root)])
            if registered.returncode != 0:
                return registered.returncode
            installed = subprocess.run([codex, "plugin", "add", f"{args.plugin}@cmander-skills"])
            if installed.returncode != 0:
                return installed.returncode
            ran_any = True

    if args.target in ("all", "antigravity"):
        if args.target == "antigravity" or has_agy:
            install_antigravity(plugin_src, args.plugin, agy_config)
            ran_any = True

    if not ran_any:
        sys.stderr.write("Neither Codex CLI on PATH nor Antigravity (~/.gemini) was found.\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
