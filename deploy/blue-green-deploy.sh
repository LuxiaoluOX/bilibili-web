#!/usr/bin/env bash
set -Eeuo pipefail

RELEASES_DIR="${RELEASES_DIR:-/opt/sjz/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/sjz/current}"
SLOTS_DIR="${SLOTS_DIR:-/opt/sjz/slots}"
UPSTREAM_FILE="${UPSTREAM_FILE:-/etc/caddy/sjz-upstream.caddy}"
CADDY_CONFIG="${CADDY_CONFIG:-/etc/caddy/Caddyfile}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://sjz.lx-zero.cn/health}"

usage() {
  echo "Usage: $0 RELEASE_ID"
}

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]{14}$ ]]; then
  usage >&2
  exit 64
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root" >&2
  exit 77
fi

exec 9>/run/lock/sjz-blue-green-deploy.lock
flock -n 9 || { echo "Deployment or cleanup is already running" >&2; exit 75; }

release_id="$1"
new_release="$RELEASES_DIR/$release_id"
if [[ ! -f "$new_release/build/server/index.js" || ! -x "$new_release/node_modules/.bin/react-router-serve" ]]; then
  echo "Release is incomplete: $new_release" >&2
  exit 66
fi

active_port="$(grep -oE '127\.0\.0\.1:(8088|8089)' "$UPSTREAM_FILE" 2>/dev/null | head -n 1 | cut -d: -f2 || true)"
case "$active_port" in
  8088) standby_port=8089 ;;
  8089) standby_port=8088 ;;
  *) echo "Unable to determine active port from $UPSTREAM_FILE" >&2; exit 65 ;;
esac

old_release="$(readlink -f "$CURRENT_LINK")"
old_upstream="$(cat "$UPSTREAM_FILE")"
new_service="sjz-web@${standby_port}.service"
old_service="sjz-web@${active_port}.service"
switched=0
upstream_changed=0

rollback() {
  local exit_code=$?
  if (( upstream_changed == 1 )); then
    printf '%s\n' "$old_upstream" > "$UPSTREAM_FILE"
    caddy validate --config "$CADDY_CONFIG" >/dev/null 2>&1 || true
    systemctl reload caddy || true
  fi
  if (( switched == 1 )); then
    ln -sfn "$old_release" "$CURRENT_LINK"
    systemctl restart sjz-worker || true
  fi
  systemctl disable --now "$new_service" || true
  echo "Deployment failed; traffic remains on $old_service ($old_release)" >&2
  exit "$exit_code"
}
trap rollback ERR

mkdir -p "$SLOTS_DIR"
systemctl stop "$new_service" 2>/dev/null || true
ln -sfn "$new_release" "$SLOTS_DIR/$standby_port"
chown -h root:root "$SLOTS_DIR/$standby_port"
systemctl enable --now "$new_service"

healthy=0
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 2 "http://127.0.0.1:${standby_port}/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if (( healthy == 0 )); then
  echo "Standby service failed health check on port $standby_port" >&2
  false
fi

upstream_changed=1
printf 'reverse_proxy 127.0.0.1:%s {\n\theader_up X-SJZ-Client-IP {remote_host}\n}\n' "$standby_port" > "$UPSTREAM_FILE"
caddy validate --config "$CADDY_CONFIG" >/dev/null
systemctl reload caddy
switched=1

curl --fail --silent --show-error --max-time 10 "$PUBLIC_HEALTH_URL" >/dev/null
ln -sfn "$new_release" "$CURRENT_LINK"
systemctl restart sjz-worker
systemctl disable --now "$old_service" 2>/dev/null || true
switched=0
trap - ERR

echo "DEPLOYED release=$release_id active_port=$standby_port previous_port=$active_port"
