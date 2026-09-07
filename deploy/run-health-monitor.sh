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

running_services="$(compose_cmd "$PROJECT_ROOT" "$ENV_FILE" ps --status running --services || true)"
if ! grep -qx 'app' <<<"$running_services"; then
  echo "docker compose service 'app' is not running in $PROJECT_ROOT" >&2
  exit 1
fi

exec compose_cmd "$PROJECT_ROOT" "$ENV_FILE" exec -T app node scripts/monitorHealth.js
