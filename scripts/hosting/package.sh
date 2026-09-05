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
mkdir -p "$stage/.next/static"
cp -a .next/static/. "$stage/.next/static/"
if [[ -d public ]]; then cp -a public "$stage/public"; fi
cp scripts/hosting/start-hosting.sh "$stage/start-hosting.sh"
# Next's standalone trace can copy local env files. Never ship them in artifacts.
find "$stage" -name '.env*' -type f -delete
mkdir -p dist
tar -czf dist/freakhosting-release.tar.gz -C "$stage" .
echo "Created dist/freakhosting-release.tar.gz (runtime and assets; no env files)"
