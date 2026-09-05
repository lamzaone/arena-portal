#!/usr/bin/env bash
set -euo pipefail
umask 077

release_id="${1:?Usage: activate.sh RELEASE_ID}"
[[ "$release_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || {
  echo "Invalid release ID" >&2; exit 1;
}
app_root="${ARENA_DEPLOY_ROOT:-$HOME/arena-portal}"
mkdir -p -- "$app_root/releases"
app_root="$(cd -- "$app_root" && pwd -P)"
exec 9>"$app_root/deploy.lock"
flock -n 9 || { echo "Another deployment is active" >&2; exit 1; }
test -f "$app_root/.env.production" || {
  echo "Configure $app_root/.env.production first" >&2; exit 1;
}
port="${PORT:-3000}"
[[ "$port" =~ ^[0-9]+$ ]] && ((port >= 1024 && port <= 65535))
attempts="${ARENA_HEALTH_ATTEMPTS:-60}"
[[ "$attempts" =~ ^[0-9]+$ ]] && ((attempts > 0 && attempts <= 120))
release="$app_root/releases/$release_id"
test ! -e "$release" || { echo "Release already exists: $release_id" >&2; exit 1; }
test -f "$app_root/$release_id.tar.gz"

previous=""
if [[ -e "$app_root/current" || -L "$app_root/current" ]]; then
  test -L "$app_root/current" || { echo "current must be a symlink" >&2; exit 1; }
  previous="$(readlink -f -- "$app_root/current")"
  case "$previous" in
    "$app_root"/releases/*) ;;
    *) echo "Previous release is outside deployment directory" >&2; exit 1 ;;
  esac
fi

# Return only a live PID owned by this website user in the expected release.
# Never use pkill: the account may run other Node apps.
app_pid() {
  local expected="$1" pid
  [[ -f "$app_root/app.pid" ]] || return 1
  read -r pid < "$app_root/app.pid"
  [[ "$pid" =~ ^[0-9]+$ ]] && ((pid > 1)) || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(stat -c %u "/proc/$pid" 2>/dev/null)" == "$(id -u)" ]] || return 1
  [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" == "$expected" ]] || return 1
  printf '%s' "$pid"
}

previous_pid=""
if [[ -n "$previous" ]]; then
  previous_pid="$(app_pid "$previous")" || {
    echo "Current app is not running under start-hosting.sh; check Automatic mode and logs" >&2
    exit 1
  }
fi

mkdir -- "$release"
tar -xzf "$app_root/$release_id.tar.gz" -C "$release" --no-same-owner
test -f "$release/server.js"
test -f "$release/.next/BUILD_ID"
test -f "$release/start-hosting.sh"
# Staff catalogue uploads are filesystem data referenced by persistent DB URLs.
# Import a legacy source deployment once, then share the same files across releases.
shared_images="$app_root/shared/economy-custom"
custom_images="$release/public/images/economy/custom"
mkdir -p -- "$shared_images" "$(dirname -- "$custom_images")"
for source in "$app_root/public/images/economy/custom" \
              "${previous:-$release}/public/images/economy/custom" "$custom_images"; do
  if [[ -d "$source" && ! -L "$source" ]]; then
    cp -an -- "$source/." "$shared_images/"
  fi
done
if [[ -d "$custom_images" && ! -L "$custom_images" ]]; then
  mv -- "$custom_images" "$release/economy-custom-build"
fi
test ! -e "$custom_images" && test ! -L "$custom_images"
ln -s -- "$shared_images" "$custom_images"
# Keep the stable supervisor entry point outside versioned releases.
if [[ ! -f "$app_root/start-hosting.sh" ]]; then
  cp -- "$release/start-hosting.sh" "$app_root/start-hosting.sh"
fi

point_to() {
  ln -s -- "$1" "$app_root/current.next"
  mv -Tf -- "$app_root/current.next" "$app_root/current"
}
healthy() {
  local expected="$1"
  for ((i=0; i<attempts; i++)); do
    if app_pid "$expected" >/dev/null &&
       curl -fsS --max-time 2 "http://127.0.0.1:$port/api/health" 2>/dev/null |
         grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

point_to "$release"
if [[ -z "$previous" ]]; then
  echo "First release staged. Set Enhance startup to: bash start-hosting.sh"
  echo "Working directory: arena-portal; Automatic mode; proxy port: $port"
  echo "The app is not live until you start it in the panel and verify /api/health."
  rm -f -- "$app_root/$release_id.tar.gz"
  exit 0
fi

# Re-check ownership immediately before signalling. Enhance restarts the exited
# process and the launcher resolves the updated symlink on its next invocation.
if [[ "$(app_pid "$previous" || true)" == "$previous_pid" ]]; then
  kill -TERM "$previous_pid" 2>/dev/null || true
fi
if healthy "$release"; then
  echo "Healthy release: $release_id"
  rm -f -- "$app_root/$release_id.tar.gz"
  # Keep current and immediate rollback releases. Only remove validated, real
  # directories directly beneath this app's releases; never follow symlinks.
  for candidate in "$app_root"/releases/*; do
    [[ -d "$candidate" && ! -L "$candidate" ]] || continue
    [[ "$candidate" != "$release" && "$candidate" != "$previous" ]] || continue
    candidate_id="${candidate##*/}"
    [[ "$candidate_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || continue
    [[ "$(readlink -f -- "$candidate")" == "$app_root/releases/$candidate_id" ]] || continue
    rm -rf -- "$candidate"
    rm -f -- "$app_root/$candidate_id.tar.gz"
  done
  exit 0
fi

echo "New release failed; restoring previous release" >&2
point_to "$previous"
failed_pid="$(app_pid "$release" || true)"
if [[ -n "$failed_pid" ]]; then
  kill -TERM "$failed_pid" 2>/dev/null || true
fi
if healthy "$previous"; then
  echo "Rollback healthy" >&2
else
  echo "Rollback did not become healthy; inspect the Enhance application log" >&2
fi
exit 1
