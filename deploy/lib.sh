#!/usr/bin/env bash
set -euo pipefail

default_project_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

resolve_env_file() {
  local project_root="$1"
  local explicit_env_file="${2:-}"

  if [[ -n "$explicit_env_file" ]]; then
    printf '%s\n' "$explicit_env_file"
    return
  fi

  if [[ -n "${APP_ENV_FILE:-}" ]]; then
    printf '%s\n' "$APP_ENV_FILE"
    return
  fi

  if [[ -f /etc/yuzhural-site/production.env ]]; then
    printf '%s\n' "/etc/yuzhural-site/production.env"
    return
  fi

  printf '%s\n' "$project_root/.env"
}

load_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
}

compose_cmd() {
  local project_root="$1"
  local env_file="$2"
  shift 2

  local cmd=(docker compose --project-directory "$project_root")
  if [[ -f "$env_file" ]]; then
    cmd+=(--env-file "$env_file")
  fi

  "${cmd[@]}" "$@"
}

state_file_path() {
  local project_root="$1"
  if [[ -n "${DEPLOY_STATE_FILE:-}" ]]; then
    printf '%s\n' "$DEPLOY_STATE_FILE"
    return
  fi

  printf '%s\n' "$project_root/deploy/state/production-release.env"
}

load_state_file() {
  local state_file="$1"
  if [[ -f "$state_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$state_file"
    set +a
  fi
}

write_state_file() {
  local state_file="$1"
  shift

  mkdir -p "$(dirname "$state_file")"
  : >"$state_file"

  while [[ "$#" -gt 0 ]]; do
    local key="$1"
    local value="$2"
    shift 2
    printf '%s=%q\n' "$key" "$value" >>"$state_file"
  done
}

utc_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

web_port_from_bind() {
  local bind_value="${1:-127.0.0.1:8080}"
  printf '%s\n' "${bind_value##*:}"
}
