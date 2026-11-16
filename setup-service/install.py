#!/usr/bin/env python3
import argparse
from pathlib import Path
import re
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description="Install one plugin from this checkout.")
    parser.add_argument("plugin", help="Plugin name, such as general")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", args.plugin):
        parser.error("use a plugin name such as general or ai-tools")

    codex = shutil.which("codex")
    if codex is None:
        parser.exit(1, "Codex CLI was not found on PATH.\n")

    root = Path(__file__).resolve().parents[1]
    if not (root / "plugins" / args.plugin / "plugin.json").is_file():
        parser.error(f"unknown plugin: {args.plugin}")

    registered = subprocess.run([codex, "plugin", "marketplace", "add", str(root)])
    if registered.returncode:
        return registered.returncode
    return subprocess.run([codex, "plugin", "add", f"{args.plugin}@cmander-skills"]).returncode


if __name__ == "__main__":
    raise SystemExit(main())
