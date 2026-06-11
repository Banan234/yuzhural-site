#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

PROJECT_ROOT="$(default_project_root)"
ENV_FILE=""
ROLLBACK_TAG=""
SKIP_PUBLIC_CHECKS="false"
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
      ROLLBACK_TAG="$2"
      shift 2
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
load_env_file "$ENV_FILE"
load_state_file "$STATE_FILE"

if [[ -z "$ROLLBACK_TAG" ]]; then
  if [[ "${LAST_DEPLOY_STATUS:-}" != "success" && -n "${LAST_GOOD_RELEASE_TAG:-}" ]]; then
    ROLLBACK_TAG="$LAST_GOOD_RELEASE_TAG"
  else
    ROLLBACK_TAG="${PREVIOUS_GOOD_RELEASE_TAG:-}"
  fi
fi

if [[ -z "$ROLLBACK_TAG" ]]; then
  echo "Rollback target is empty. Pass --tag explicitly or deploy at least two releases first." >&2
  exit 1
fi

export APP_ENV_FILE="$ENV_FILE"
export DEPLOY_TAG="$ROLLBACK_TAG"
export VITE_SENTRY_RELEASE="${SHELL_VITE_SENTRY_RELEASE:-$DEPLOY_TAG}"

OLD_LAST_GOOD_RELEASE_TAG="${LAST_GOOD_RELEASE_TAG:-}"
OLD_PREVIOUS_GOOD_RELEASE_TAG="${PREVIOUS_GOOD_RELEASE_TAG:-}"

echo "[rollback] project_root=$PROJECT_ROOT env_file=$ENV_FILE tag=$ROLLBACK_TAG"
compose_cmd "$PROJECT_ROOT" "$ENV_FILE" up -d --no-build
smoke_args=(--project-root "$PROJECT_ROOT" --env-file "$ENV_FILE")
if [[ "$SKIP_PUBLIC_CHECKS" == "true" ]]; then
  smoke_args+=(--skip-public-checks)
fi
"$PROJECT_ROOT/deploy/post-deploy-smoke.sh" "${smoke_args[@]}"

NEW_PREVIOUS_GOOD_RELEASE_TAG="$OLD_LAST_GOOD_RELEASE_TAG"
if [[ "$ROLLBACK_TAG" == "${OLD_LAST_GOOD_RELEASE_TAG:-}" ]]; then
  NEW_PREVIOUS_GOOD_RELEASE_TAG="$OLD_PREVIOUS_GOOD_RELEASE_TAG"
fi

write_state_file \
  "$STATE_FILE" \
  LIVE_RELEASE_TAG "$ROLLBACK_TAG" \
  LAST_GOOD_RELEASE_TAG "$ROLLBACK_TAG" \
  PREVIOUS_GOOD_RELEASE_TAG "$NEW_PREVIOUS_GOOD_RELEASE_TAG" \
  LAST_DEPLOY_STATUS "success" \
  LAST_DEPLOYED_AT "$(utc_now)" \
  LAST_ENV_FILE "$ENV_FILE"

echo "[rollback] success tag=$ROLLBACK_TAG"
