#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd -- "$repo_root"
test -f .next/standalone/server.js || {
  echo "Run npm run build:release on Linux first" >&2; exit 1;
}
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
cp -a .next/standalone/. "$stage/"
# Turbopack can trace absolute links to external packages from the build
# workspace. Rebase them onto the traced runtime; never ship escaping links.
python3 - "$stage" <<'PY'
import os
import sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
for directory, folders, files in os.walk(root, followlinks=False):
    for name in folders + files:
        link = Path(directory) / name
        if not link.is_symlink():
            continue
        resolved = link.resolve()
        if resolved.is_relative_to(root):
            continue
        parts = resolved.parts
        if "node_modules" not in parts:
            raise RuntimeError(f"External release link: {link.relative_to(root)}")
        index = max(i for i, part in enumerate(parts) if part == "node_modules")
        target = root / "node_modules" / Path(*parts[index + 1:])
        if not target.exists() or not target.resolve().is_relative_to(root):
            raise RuntimeError(f"Missing traced dependency: {link.relative_to(root)}")
        relative = os.path.relpath(target, link.parent)
        link.unlink()
        link.symlink_to(relative, target_is_directory=target.is_dir())
PY
mkdir -p "$stage/.next/static"
cp -a .next/static/. "$stage/.next/static/"
if [[ -d public ]]; then cp -a public "$stage/public"; fi
cp scripts/hosting/start-hosting.sh "$stage/start-hosting.sh"
# The browser is installed on the Linux runner, not downloaded by a player
# request. Keep cache images outside releases; only ship the browser/runtime.
if [[ -d .playwright-browsers ]]; then cp -a .playwright-browsers "$stage/.playwright-browsers"; fi
if [[ -f scripts/warm-weapon-thumbnails.mjs ]]; then
  mkdir -p "$stage/scripts" "$stage/lib/economy"
  cp scripts/warm-weapon-thumbnails.mjs scripts/weapon-thumbnail-warmup.mjs "$stage/scripts/"
  for name in thumbnail-cache.ts thumbnail-renderer.ts thumbnail-browser.ts thumbnail-paths.ts weapon-thumbnail.ts weapon-model.ts weapon-preview.ts cs2-skin-models.json cs2-finishes.json cs2-finish-catalogue.ts cs2-finish-validation.json; do
    if [[ -f "lib/economy/$name" ]]; then cp "lib/economy/$name" "$stage/lib/economy/"; fi
  done
fi
# Next's standalone trace can copy local env files. Never ship them in artifacts.
find "$stage" -name '.env*' -type f -delete
mkdir -p dist
tar -czf dist/freakhosting-release.tar.gz -C "$stage" .
echo "Created dist/freakhosting-release.tar.gz (runtime and assets; no env files)"
