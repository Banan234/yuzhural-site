#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Общий helper держит одинаковую логику env/compose для deploy-скриптов.
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

PROJECT_ROOT="$(default_project_root)"
ENV_FILE=""
MODE="scheduled"

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
    --mode)
      MODE="$2"
      shift 2
      ;;
    --scheduled)
      MODE="scheduled"
      shift
      ;;
    --force)
      MODE="force"
      shift
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

case "$MODE" in
  scheduled)
    NPM_SCRIPT="import:price:scheduled"
    ;;
  force)
    if [[ -n "${PRICE_URL:-}" || -n "${PRICE_PAGE_URL:-}" ]]; then
      NPM_SCRIPT="import:price:remote"
    else
      NPM_SCRIPT="import:price"
    fi
    ;;
  *)
    echo "Unsupported mode: $MODE" >&2
    exit 1
    ;;
esac

running_services="$(compose_cmd "$PROJECT_ROOT" "$ENV_FILE" ps --status running --services || true)"
if ! grep -qx 'app' <<<"$running_services"; then
  echo "docker compose service 'app' is not running in $PROJECT_ROOT" >&2
  exit 1
fi

exec_env=()
for env_name in \
  PRICE_URL \
  PRICE_PAGE_URL \
  PRICE_DOWNLOAD_MAX_BYTES \
  SITE_URL \
  VITE_SITE_URL \
  PRODUCT_PRERENDER_LIMIT \
  PRODUCT_PRERENDER_INCLUDE \
  TZ; do
  if [[ -n "${!env_name:-}" ]]; then
    exec_env+=(-e "$env_name=${!env_name}")
  fi
done

echo "[price-import] project_root=$PROJECT_ROOT env_file=$ENV_FILE mode=$MODE script=$NPM_SCRIPT"
compose_cmd "$PROJECT_ROOT" "$ENV_FILE" exec -T "${exec_env[@]}" app npm run "$NPM_SCRIPT"
