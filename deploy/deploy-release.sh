#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

PROJECT_ROOT="$(default_project_root)"
ENV_FILE=""
DEPLOY_TAG_OVERRIDE=""
SKIP_BUILD="false"
SKIP_PUBLIC_CHECKS="false"
SHELL_DEPLOY_TAG="${DEPLOY_TAG:-}"
SHELL_VITE_SENTRY_RELEASE="${VITE_SENTRY_RELEASE:-}"

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
    --tag)
      DEPLOY_TAG_OVERRIDE="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --skip-public-checks)
      SKIP_PUBLIC_CHECKS="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ENV_FILE="$(resolve_env_file "$PROJECT_ROOT" "$ENV_FILE")"
STATE_FILE="$(state_file_path "$PROJECT_ROOT")"

require_command docker
require_command git
load_env_file "$ENV_FILE"
load_state_file "$STATE_FILE"

DEFAULT_TAG="$(date +%Y%m%d%H%M)-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)"
export APP_ENV_FILE="$ENV_FILE"
export DEPLOY_TAG="${DEPLOY_TAG_OVERRIDE:-${SHELL_DEPLOY_TAG:-$DEFAULT_TAG}}"
export VITE_SENTRY_RELEASE="${SHELL_VITE_SENTRY_RELEASE:-$DEPLOY_TAG}"

OLD_LAST_GOOD_RELEASE_TAG="${LAST_GOOD_RELEASE_TAG:-}"
OLD_PREVIOUS_GOOD_RELEASE_TAG="${PREVIOUS_GOOD_RELEASE_TAG:-}"

echo "[deploy] project_root=$PROJECT_ROOT env_file=$ENV_FILE tag=$DEPLOY_TAG"

if [[ "$SKIP_BUILD" != "true" ]]; then
  compose_cmd "$PROJECT_ROOT" "$ENV_FILE" build
fi

compose_cmd "$PROJECT_ROOT" "$ENV_FILE" up -d --no-build

smoke_args=(--project-root "$PROJECT_ROOT" --env-file "$ENV_FILE")
if [[ "$SKIP_PUBLIC_CHECKS" == "true" ]]; then
  smoke_args+=(--skip-public-checks)
fi

if "$PROJECT_ROOT/deploy/post-deploy-smoke.sh" "${smoke_args[@]}"; then
  write_state_file \
    "$STATE_FILE" \
    LIVE_RELEASE_TAG "$DEPLOY_TAG" \
    LAST_GOOD_RELEASE_TAG "$DEPLOY_TAG" \
    PREVIOUS_GOOD_RELEASE_TAG "${OLD_LAST_GOOD_RELEASE_TAG:-$OLD_PREVIOUS_GOOD_RELEASE_TAG}" \
    LAST_DEPLOY_STATUS "success" \
    LAST_DEPLOYED_AT "$(utc_now)" \
    LAST_ENV_FILE "$ENV_FILE"
  echo "[deploy] success tag=$DEPLOY_TAG"
  exit 0
fi

write_state_file \
  "$STATE_FILE" \
  LIVE_RELEASE_TAG "$DEPLOY_TAG" \
  LAST_GOOD_RELEASE_TAG "$OLD_LAST_GOOD_RELEASE_TAG" \
  PREVIOUS_GOOD_RELEASE_TAG "$OLD_PREVIOUS_GOOD_RELEASE_TAG" \
  LAST_DEPLOY_STATUS "failed" \
  LAST_DEPLOYED_AT "$(utc_now)" \
  LAST_ENV_FILE "$ENV_FILE"

echo "[deploy] smoke failed for tag=$DEPLOY_TAG" >&2
exit 1
