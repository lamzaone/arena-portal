#!/usr/bin/env bash
set -euo pipefail
umask 077
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
release="$(readlink -f -- "$app_root/current")"
case "$release" in "$app_root"/releases/*) ;; *) echo 'Invalid bot release' >&2; exit 1 ;; esac
test -f "$release/src/index.mjs"
test -f "$app_root/.env" || { echo 'Configure arena-discord-bot/.env first' >&2; exit 1; }
# Prevent a delayed old process and a new supervisor attempt from running together.
exec 8>"$app_root/bot.lock"
flock -n 8 || { echo 'Another bot process is still running' >&2; exit 1; }
cd -- "$release"
mkdir -p -- "$app_root/status"
printf '%s\n' "$$" > "$app_root/bot.pid.next"
mv -f -- "$app_root/bot.pid.next" "$app_root/bot.pid"
export NODE_ENV=production
export ARENA_BOT_HEALTH_DIR="$app_root/status"
exec node --env-file="$app_root/.env" "$release/src/index.mjs"
