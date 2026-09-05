#!/usr/bin/env bash
set -euo pipefail
umask 077

# Enhance provides the selected Node runtime in Automatic mode. This launcher
# uses exec so the recorded PID is the application, and Enhance owns restarts.
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
release="$(readlink -f -- "$app_root/current")"
case "$release" in
  "$app_root"/releases/*) ;;
  *) echo "Invalid current release" >&2; exit 1 ;;
esac
test -f "$release/server.js"
test -f "$app_root/.env.production"
cd -- "$release"
printf '%s\n' "$$" > "$app_root/app.pid.next"
mv -f -- "$app_root/app.pid.next" "$app_root/app.pid"
export NODE_ENV=production HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
exec node --env-file="$app_root/.env.production" "$release/server.js"
