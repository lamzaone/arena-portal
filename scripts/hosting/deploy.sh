#!/usr/bin/env bash

set -euo pipefail
# OpenSSH diagnostics are classified below; keep their language predictable.
export LC_ALL=C
mode=deploy
if (($# > 0)); then
  if [[ "$#" != 1 || "$1" != --check-ssh ]]; then
    echo 'Usage: bash scripts/hosting/deploy.sh [--check-ssh]' >&2
    exit 2
  fi
  mode=check
fi
: "${SSH_HOST:?Set FREAKHOSTING_SSH_HOST}"
: "${SSH_USER:?Set FREAKHOSTING_SSH_USER}"
: "${SSH_PRIVATE_KEY:?Set FREAKHOSTING_SSH_KEY}"
: "${SSH_KNOWN_HOSTS:?Set FREAKHOSTING_KNOWN_HOSTS}"
: "${RUNNER_TEMP:?Set RUNNER_TEMP}"
if [[ "$mode" == deploy ]]; then
  : "${RELEASE_ID:?Set RELEASE_ID}"
  if ! [[ "$RELEASE_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]]; then
    echo '::error::Invalid release ID.' >&2
    exit 1
  fi
fi
SSH_PORT="${SSH_PORT:-22}"
if ! [[ "$SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ &&
        "$SSH_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*$ &&
        "$SSH_PORT" =~ ^[0-9]{1,5}$ ]]; then
  echo '::error::Invalid SSH host, user or port.' >&2
  exit 1
fi
SSH_PORT="$((10#$SSH_PORT))"
if ((SSH_PORT < 1 || SSH_PORT > 65535)); then
  echo '::error::FREAKHOSTING_SSH_PORT must be between 1 and 65535.' >&2
  exit 1
fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
if [[ "$mode" == deploy ]] && [[ ! -s dist/freakhosting-release.tar.gz || ! -s scripts/hosting/activate.sh ]]; then
  echo '::error::The release archive or activation script is missing.' >&2
  exit 1
fi

umask 077
transport_dir="$(mktemp -d "$RUNNER_TEMP/freakhosting-ssh.XXXXXX")"
key="$transport_dir/key"
hosts="$transport_dir/known-hosts"
error_log="$transport_dir/stderr"
trap 'rm -f -- "$key" "$hosts" "$error_log"; rmdir -- "$transport_dir"' EXIT
printf '%s\n' "$SSH_PRIVATE_KEY" > "$key"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$hosts"
options=(-i "$key" -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
target="$SSH_USER@$SSH_HOST"

if [[ "$mode" == check ]]; then
  printf 'SSH diagnostic UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Report this runner's outbound address for provider log correlation. HTTPS
  # and SSH may use different NAT routes; the provider must confirm the SSH IP.
  # No SSH credentials or destination details are sent to this lookup service.
  if runner_ip="$(curl --ipv4 --fail --silent --show-error --connect-timeout 5 --max-time 10 https://api.ipify.org)" &&
      [[ "$runner_ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    printf 'Runner public IPv4 (observed over HTTPS): %s\n' "$runner_ip"
  else
    echo '::warning::Runner public IPv4 lookup unavailable; continuing with SSH.' >&2
  fi
  ssh -V
  echo 'Checking SSH authentication and a read-only command (one attempt; no upload or activation)'
  # Verbose SSH logs show protocol/authentication/session stages, never private
  # key contents. Keep the deployment's pinned host keys and identity options.
  if ssh -vv -n -T "${options[@]}" -p "$SSH_PORT" "$target" 'true'; then
    echo 'SSH authentication and remote command succeeded. This diagnostic did not deploy a release.'
    exit 0
  else
    status=$?
    echo "::error::SSH diagnostic failed (exit $status). Share this check's UTC time, runner IP and SSH error with FreakHosting so they can correlate firewall and SSH logs. No release was uploaded or activated." >&2
    exit "$status"
  fi
fi

# Only idempotent preparation and archive upload may be retried. Authentication,
# host verification, remote command and disk failures need intervention.
retry_transfer() {
  local label="$1" attempt status
  shift
  for attempt in 1 2 3; do
    echo "$label (attempt $attempt/3)"
    if "$@" 2> "$error_log"; then
      cat -- "$error_log" >&2
      return 0
    else
      status=$?
    fi
    cat -- "$error_log" >&2
    if ! { [[ "$status" == 255 ]] || [[ "$1" == scp && "$status" == 1 ]]; } ||
        grep -Eiq 'Permission denied|Authentication failed|Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|Load key |invalid format|error in libcrypto|Bad configuration|No space left|Disk quota exceeded' "$error_log" ||
        ! grep -Eiq 'Connection (reset|closed|timed out|refused)|Operation timed out|Broken pipe|Timeout, server .* not responding|No route to host|Network is unreachable' "$error_log"; then
      echo "::error::$label failed (exit $status); this error is not retried. Check the SSH or filesystem error above." >&2
      return "$status"
    fi
    if ((attempt == 3)); then
      echo "::error::$label failed after 3 attempts. Activation has not started. Verify FREAKHOSTING_SSH_HOST and FREAKHOSTING_SSH_PORT and confirm FreakHosting allows external SSH from GitHub Actions runners (firewall/IP restrictions and SSH connection limits)." >&2
      return "$status"
    fi
    echo "Connection interrupted; retrying in $((attempt * 5)) seconds." >&2
    sleep "$((attempt * 5))"
  done
}

retry_transfer 'Connecting to FreakHosting and preparing the release directory' \
  ssh "${options[@]}" -p "$SSH_PORT" "$target" 'mkdir -p "$HOME/arena-portal"'
retry_transfer 'Uploading the release archive to FreakHosting' \
  scp "${options[@]}" -P "$SSH_PORT" dist/freakhosting-release.tar.gz "$target:arena-portal/$RELEASE_ID.tar.gz"

echo "Activating release $RELEASE_ID on FreakHosting (one attempt)"
# A disconnect may occur after the remote script starts. Replaying activation
# could switch/restart an application while the original attempt is still running.
if ssh "${options[@]}" -p "$SSH_PORT" "$target" "bash -s -- '$RELEASE_ID'" < scripts/hosting/activate.sh; then
  echo 'Remote activation command completed. See its staging or health-check result above.'
else
  status=$?
  if [[ "$status" == 255 ]]; then
    echo '::error::SSH disconnected during activation; the remote release state is unknown. Activation was not retried. Check ~/arena-portal/current and /api/health in the hosting panel before another deployment.' >&2
  else
    echo "::error::Activation failed (exit $status) and was not retried. Check the activation and rollback output above." >&2
  fi
  exit "$status"
fi
