#!/usr/bin/env bash
set -euo pipefail
umask 077
release_id="${1:?Usage: activate.sh RELEASE_ID}"
[[ "$release_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
app_root="${ARENA_BOT_DEPLOY_ROOT:-$HOME/arena-discord-bot}"
mkdir -p -- "$app_root/releases"
app_root="$(cd -- "$app_root" && pwd -P)"
exec 9>"$app_root/deploy.lock"
flock -n 9 || { echo 'Another bot deployment is active' >&2; exit 1; }
attempts="${ARENA_BOT_HEALTH_ATTEMPTS:-90}"
[[ "$attempts" =~ ^[0-9]+$ ]] && ((attempts > 0 && attempts <= 120))
stop_attempts="${ARENA_BOT_STOP_ATTEMPTS:-30}"
[[ "$stop_attempts" =~ ^[0-9]+$ ]] && ((stop_attempts > 0 && stop_attempts <= 120))
release="$app_root/releases/$release_id"
test ! -e "$release" && test ! -L "$release" || { echo 'Release already exists' >&2; exit 1; }
test -f "$app_root/$release_id.tar.gz"
previous=''
if [[ -e "$app_root/current" || -L "$app_root/current" ]]; then
  test -L "$app_root/current" || { echo 'current must be a symlink' >&2; exit 1; }
  previous="$(readlink -f -- "$app_root/current")"
  case "$previous" in "$app_root"/releases/*) ;; *) echo 'Previous release is outside bot directory' >&2; exit 1 ;; esac
fi

app_pid() {
  local expected="$1" pid
  [[ -f "$app_root/bot.pid" ]] || return 1
  read -r pid < "$app_root/bot.pid"
  [[ "$pid" =~ ^[0-9]+$ ]] && ((pid > 1)) || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ "$(stat -c %u "/proc/$pid" 2>/dev/null)" == "$(id -u)" ]] || return 1
  [[ "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" == "$expected" ]] || return 1
  tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fxq -- "$expected/src/index.mjs" || return 1
  printf '%s' "$pid"
}
previous_pid=''
if [[ -n "$previous" ]]; then
  test -f "$app_root/.env" || { echo 'Configure arena-discord-bot/.env first' >&2; exit 1; }
  previous_pid="$(app_pid "$previous" || true)"
  if [[ -z "$previous_pid" ]]; then
    recorded_pid=''
    if [[ -f "$app_root/bot.pid" ]]; then read -r recorded_pid < "$app_root/bot.pid" || true; fi
    if [[ -n "$recorded_pid" ]] && { [[ ! "$recorded_pid" =~ ^[0-9]+$ ]] || kill -0 "$recorded_pid" 2>/dev/null; }; then
      echo 'Recorded PID is not a verified bot process; inspect bot.pid and Enhance logs' >&2
      exit 1
    fi
    flock -n "$app_root/bot.lock" true || { echo 'An untracked bot process holds the launcher lock; inspect Enhance logs' >&2; exit 1; }
    echo 'Previous bot is down; attempting recovery through Enhance Automatic mode'
  fi
fi

# Bound shutdown even when an in-flight Discord role sync is rate limited.
# Revalidate ownership, release and command immediately before every signal.
stop_bot() {
  local expected="$1" pid="$2" i
  [[ -n "$pid" ]] || return 0
  [[ "$(app_pid "$expected" || true)" == "$pid" ]] || return 0
  kill -TERM "$pid" 2>/dev/null || true
  for ((i=0; i<stop_attempts; i++)); do
    [[ "$(app_pid "$expected" || true)" == "$pid" ]] || return 0
    sleep 1
  done
  if [[ "$(app_pid "$expected" || true)" == "$pid" ]]; then
    echo 'Graceful shutdown timed out; forcing stop of verified bot process' >&2
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

mkdir -- "$release"
tar -xzf "$app_root/$release_id.tar.gz" -C "$release" --no-same-owner
test -f "$release/src/index.mjs"
test -f "$release/node_modules/discord.js/package.json"
test -f "$release/start-hosting.sh"
install_launcher() {
  local next_launcher
  next_launcher="$(mktemp "$app_root/.start-hosting.XXXXXX")"
  cp -- "$1" "$next_launcher"
  mv -f -- "$next_launcher" "$app_root/start-hosting.sh"
}
if [[ -f "$app_root/start-hosting.sh" ]]; then
  cp -- "$app_root/start-hosting.sh" "$release/.previous-start-hosting.sh"
fi
point_to() {
  local link
  link="$(mktemp -u "$app_root/.current.XXXXXX")"
  ln -s -- "$1" "$link"
  mv -Tf -- "$link" "$app_root/current"
}
healthy() {
  local expected="$1" pid status_pid heartbeat ready now i
  for ((i=0; i<attempts; i++)); do
    pid="$(app_pid "$expected" || true)"
    if [[ -n "$pid" && -f "$app_root/status/$pid" ]] &&
       read -r status_pid heartbeat ready < "$app_root/status/$pid"; then
      now="$(date +%s)"
      if [[ "$status_pid" == "$pid" && "$ready" == 1 && "$heartbeat" =~ ^[0-9]{10}$ ]] &&
         ((heartbeat <= now && now - heartbeat <= 15)); then return 0; fi
    fi
    sleep 1
  done
  return 1
}
install_launcher "$release/start-hosting.sh"
point_to "$release"
if [[ -z "$previous" ]]; then
  echo 'First bot release staged. Configure arena-discord-bot/.env, then set Enhance:'
  echo 'Working directory: arena-discord-bot; startup: bash start-hosting.sh; Node 24; Automatic; proxy disabled.'
  echo 'If replacing an FTP installation, stop its old app before starting this launcher.'
  echo 'The bot is not live until it is started in the panel.'
  rm -f -- "$app_root/$release_id.tar.gz"
  exit 0
fi
stop_bot "$previous" "$previous_pid"
if healthy "$release"; then
  echo "Healthy bot release: $release_id"
  rm -f -- "$app_root/$release_id.tar.gz"
  for candidate in "$app_root"/releases/*; do
    [[ -d "$candidate" && ! -L "$candidate" && "$candidate" != "$release" && "$candidate" != "$previous" ]] || continue
    candidate_id="${candidate##*/}"
    [[ "$candidate_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || continue
    [[ "$(readlink -f -- "$candidate")" == "$app_root/releases/$candidate_id" ]] || continue
    rm -rf -- "$candidate"
  done
  exit 0
fi
echo 'New bot release failed; restoring previous release' >&2
if [[ -f "$release/.previous-start-hosting.sh" ]]; then
  install_launcher "$release/.previous-start-hosting.sh"
else
  install_launcher "$previous/start-hosting.sh"
fi
point_to "$previous"
failed_pid="$(app_pid "$release" || true)"
stop_bot "$release" "$failed_pid"
if healthy "$previous"; then echo 'Rollback healthy' >&2; else echo 'Rollback did not become healthy; inspect Enhance logs' >&2; fi
exit 1
