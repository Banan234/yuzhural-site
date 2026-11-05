#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

PROJECT_ROOT="$(default_project_root)"
ENV_FILE=""

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --project-root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ENV_FILE="$(resolve_env_file "$PROJECT_ROOT" "$ENV_FILE")"
require_command docker
load_env_file "$ENV_FILE"
export APP_ENV_FILE="$ENV_FILE"

running_services="$(compose_cmd "$PROJECT_ROOT" "$ENV_FILE" ps --status running --services || true)"
if ! grep -qx 'app' <<<"$running_services"; then
  echo "docker compose service 'app' is not running in $PROJECT_ROOT" >&2
  exit 1
fi

exec_env=()
for env_name in MONITOR_BASE_URL MONITOR_WEBHOOK_URL MONITOR_ALERT_WEBHOOK_URL \
  MONITOR_REQUIRE_FORMS MONITOR_CHECK_FORMS MONITOR_CHECK_VK MONITOR_TIMEOUT_MS \
  MONITOR_RETRIES MONITOR_PRODUCT_PATH MONITOR_STATE_FILE SITE_URL VITE_SITE_URL \
  INTERNAL_METRICS_TOKEN VK_SMOKE_ALLOW_DISABLED; do
  if declare -p "$env_name" >/dev/null 2>&1; then
    export "$env_name"
    exec_env+=(-e "$env_name")
  fi
done
compose_cmd "$PROJECT_ROOT" "$ENV_FILE" exec -T "${exec_env[@]}" app node scripts/monitorHealth.js
