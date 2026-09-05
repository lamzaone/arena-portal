#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
stage="$(mktemp -d)"
app_pid=""
cleanup() {
  if [[ -n "$app_pid" ]]; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  rm -rf -- "$stage"
}
trap cleanup EXIT
cp "$repo_root/dist/freakhosting-release.tar.gz" "$stage/smoke.tar.gz"
printf '%s\n' 'ECONOMY_PRICE_REFRESH_ENABLED=false' 'GAME_DATABASE_URL=' 'PORTAL_DATABASE_URL=' > "$stage/.env.production"
ARENA_DEPLOY_ROOT="$stage" PORT=4319 bash "$repo_root/scripts/hosting/activate.sh" smoke
printf '%s' 'persistent upload fixture' > "$stage/shared/economy-custom/ci-smoke.txt"
(
  export PORT=4319
  exec bash "$stage/start-hosting.sh"
) > "$stage/server.log" 2>&1 &
app_pid=$!
for ((attempt=0; attempt<60; attempt++)); do
  if curl -fsS http://127.0.0.1:4319/api/health 2>/dev/null |
     grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    asset="$(find "$stage/current/.next/static" -name '*.js' -print -quit)"
    test -n "$asset"
    curl -fsS "http://127.0.0.1:4319/_next/static/${asset#"$stage/current/.next/static/"}" > /dev/null
    test "$(curl -fsS http://127.0.0.1:4319/images/economy/custom/ci-smoke.txt)" = 'persistent upload fixture'
    echo "Packaged release launcher, health, JavaScript and shared uploads passed"
    exit 0
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then break; fi
  sleep 1
done
cat "$stage/server.log" >&2
echo "Packaged release failed its startup check" >&2
exit 1
