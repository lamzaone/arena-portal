#!/usr/bin/env bash
set -euo pipefail
bot_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
repo_root="$(dirname -- "$bot_root")"
cd -- "$bot_root"
test -f src/index.mjs
test -f node_modules/discord.js/package.json || { echo 'Run npm ci in discord-bot first' >&2; exit 1; }
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
cp -a src node_modules package.json package-lock.json "$stage/"
cp hosting/start-hosting.sh "$stage/start-hosting.sh"
mkdir -p -- "$repo_root/dist"
tar --exclude='.env*' --exclude='*/.env*' -czf "$repo_root/dist/freakhosting-discord-bot.tar.gz" -C "$stage" .
echo 'Created dist/freakhosting-discord-bot.tar.gz (bot and dependencies; no environment files)'
