#!/usr/bin/env bash
set -Eeuo pipefail

KEEP_RELEASES="${KEEP_RELEASES:-3}"
RELEASES_DIR="${RELEASES_DIR:-/opt/sjz/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/sjz/current}"
HEALTH_URL="${HEALTH_URL:-}"
UPSTREAM_FILE="${UPSTREAM_FILE:-/etc/caddy/sjz-upstream.caddy}"
WARN_PERCENT="${WARN_PERCENT:-70}"
CRITICAL_PERCENT="${CRITICAL_PERCENT:-85}"
DRY_RUN=0

usage() {
  echo "Usage: $0 [--dry-run] [--keep NUMBER]"
}

while (($#)); do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --keep)
      KEEP_RELEASES="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ ! "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]]; then
  echo "KEEP_RELEASES must be a positive integer" >&2
  exit 64
fi

exec 9>/run/lock/sjz-blue-green-deploy.lock
if ! flock -n 9; then
  echo "Deployment or cleanup is already running; exiting."
  exit 0
fi

if [[ -z "$HEALTH_URL" ]]; then
  active_port="$(grep -oE '127\.0\.0\.1:(8088|8089)' "$UPSTREAM_FILE" 2>/dev/null | head -n 1 | cut -d: -f2 || true)"
  if [[ -z "$active_port" ]]; then
    echo "Unable to determine the active port from $UPSTREAM_FILE" >&2
    exit 65
  fi
  HEALTH_URL="http://127.0.0.1:${active_port}/health"
fi

log() {
  local message="[$(date --iso-8601=seconds)] $*"
  echo "$message"
  logger -t sjz-deploy-cleanup -- "$message" || true
}

disk_percent() {
  df -P /opt/sjz | awk 'NR == 2 {gsub(/%/, "", $5); print $5}'
}

if [[ ! -d "$RELEASES_DIR" || ! -L "$CURRENT_LINK" ]]; then
  log "ABORT: release directory or current symlink is missing"
  exit 1
fi

current_release="$(readlink -f "$CURRENT_LINK")"
case "$current_release" in
  "$RELEASES_DIR"/*) ;;
  *)
    log "ABORT: current release is outside $RELEASES_DIR: $current_release"
    exit 1
    ;;
esac

if [[ ! -d "$current_release" ]]; then
  log "ABORT: current release does not exist: $current_release"
  exit 1
fi

log "Checking application health at $HEALTH_URL"
healthy=0
for attempt in {1..12}; do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
    healthy=1
    break
  fi
  if (( DRY_RUN == 1 )); then
    break
  fi
  sleep 5
done

if (( healthy == 0 )); then
  log "ABORT: application health check failed; no files were removed"
  exit 1
fi

before_percent="$(disk_percent)"
mapfile -t releases < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
    | awk '/^[0-9]{14}$/' \
    | sort -r
)

declare -A protected=()
protected["$current_release"]=1
kept=1
for release_name in "${releases[@]}"; do
  release_path="$RELEASES_DIR/$release_name"
  if [[ -n "${protected[$release_path]:-}" ]]; then
    continue
  fi
  if (( kept < KEEP_RELEASES )); then
    protected["$release_path"]=1
    ((kept += 1))
  fi
done

removed=0
for release_name in "${releases[@]}"; do
  release_path="$RELEASES_DIR/$release_name"
  if [[ -n "${protected[$release_path]:-}" ]]; then
    log "KEEP release $release_name"
    continue
  fi
  if (( DRY_RUN == 1 )); then
    log "DRY-RUN remove release $release_name"
  else
    rm -rf --one-file-system -- "$release_path"
    log "REMOVED release $release_name"
  fi
  ((removed += 1))
done

temp_removed=0
while IFS= read -r -d '' temp_file; do
  if (( DRY_RUN == 1 )); then
    log "DRY-RUN remove temporary package $temp_file"
  else
    rm -f -- "$temp_file"
    log "REMOVED temporary package $temp_file"
  fi
  ((temp_removed += 1))
done < <(
  find /tmp -maxdepth 1 -type f \
    \( -name 'sjz-*.tgz' -o -name 'sjz-*.tar.gz' \) -print0
)

after_percent="$(disk_percent)"
release_count="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | awk '/^[0-9]{14}$/' | wc -l)"
if (( DRY_RUN == 1 )); then
  log "SUMMARY dry_run=true releases_present=$release_count would_remove=$removed temp_would_remove=$temp_removed disk=${before_percent}%"
else
  log "SUMMARY kept=$release_count removed=$removed temp_removed=$temp_removed disk=${before_percent}%->${after_percent}%"
fi

if (( after_percent >= CRITICAL_PERCENT )); then
  log "CRITICAL: disk usage is ${after_percent}% (threshold ${CRITICAL_PERCENT}%)"
  exit 2
elif (( after_percent >= WARN_PERCENT )); then
  log "WARNING: disk usage is ${after_percent}% (threshold ${WARN_PERCENT}%)"
fi
