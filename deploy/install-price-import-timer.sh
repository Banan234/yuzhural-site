#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-/opt/yuzhural-site}"
ENV_FILE="${2:-/etc/yuzhural-site/production.env}"
UNIT_NAME="yuzhural-price-import"
SYSTEMD_DIR="/etc/systemd/system"
SERVICE_TEMPLATE="$PROJECT_ROOT/infra/systemd/${UNIT_NAME}.service.tmpl"
TIMER_TEMPLATE="$PROJECT_ROOT/infra/systemd/${UNIT_NAME}.timer.tmpl"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

render_template() {
  local source_file="$1"
  local target_file="$2"
  sed \
    -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    "$source_file" >"$target_file"
}

render_template "$SERVICE_TEMPLATE" "$TMP_DIR/${UNIT_NAME}.service"
render_template "$TIMER_TEMPLATE" "$TMP_DIR/${UNIT_NAME}.timer"

sudo install -D -m 0644 \
  "$TMP_DIR/${UNIT_NAME}.service" \
  "$SYSTEMD_DIR/${UNIT_NAME}.service"
sudo install -D -m 0644 \
  "$TMP_DIR/${UNIT_NAME}.timer" \
  "$SYSTEMD_DIR/${UNIT_NAME}.timer"

sudo systemctl daemon-reload
sudo systemctl enable --now "${UNIT_NAME}.timer"
sudo systemctl status "${UNIT_NAME}.timer" --no-pager
