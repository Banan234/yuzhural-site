#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

PROJECT_ROOT="$(default_project_root)"
ENV_FILE=""
PUBLIC_URL=""
SKIP_PUBLIC_CHECKS="false"

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
    --public-url)
      PUBLIC_URL="$2"
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

require_command curl
require_command docker
load_env_file "$ENV_FILE"

WEB_HTTP_BIND="${WEB_HTTP_BIND:-127.0.0.1:8080}"
LOCAL_BASE_URL="http://127.0.0.1:$(web_port_from_bind "$WEB_HTTP_BIND")"
PUBLIC_URL="${PUBLIC_URL:-${SITE_URL:-${VITE_SITE_URL:-}}}"

check_url() {
  local url="$1"
  local label="$2"
  local output_file
  output_file="$(mktemp)"
  local http_code

  http_code="$(
    curl -sS \
      --connect-timeout 5 \
      --max-time 20 \
      -o "$output_file" \
      -w '%{http_code}' \
      "$url"
  )"

  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    echo "Smoke check failed for $label: $url returned HTTP $http_code" >&2
    cat "$output_file" >&2 || true
    rm -f "$output_file"
    exit 1
  fi

  rm -f "$output_file"
}

check_html_contains() {
  local url="$1"
  local expected_pattern="$2"
  local label="$3"
  local output_file
  output_file="$(mktemp)"

  curl -fsS --connect-timeout 5 --max-time 20 "$url" >"$output_file"
  if ! grep -Eqi "$expected_pattern" "$output_file"; then
    echo "Smoke check failed for $label: expected pattern '$expected_pattern' in $url" >&2
    rm -f "$output_file"
    exit 1
  fi

  rm -f "$output_file"
}

flag_enabled() {
  case "${1:-}" in
    true | TRUE | 1 | yes | YES | on | ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

json_has_bool() {
  local body="$1"
  local key="$2"
  local value="$3"
  grep -Eq "\"$key\"[[:space:]]*:[[:space:]]*$value" <<<"$body"
}

json_has_string() {
  local body="$1"
  local key="$2"
  local value="$3"
  grep -Eq "\"$key\"[[:space:]]*:[[:space:]]*\"$value\"" <<<"$body"
}

json_string_value() {
  local body="$1"
  local key="$2"
  sed -nE "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p" <<<"$body" | head -n 1
}

json_bool_value() {
  local body="$1"
  local key="$2"
  sed -nE "s/.*\"$key\"[[:space:]]*:[[:space:]]*(true|false).*/\1/p" <<<"$body" | head -n 1
}

fail_vk_health() {
  local http_code="$1"
  local body="$2"
  local reason="$3"
  local status
  local ok

  status="$(json_string_value "$body" "status")"
  ok="$(json_bool_value "$body" "ok")"

  echo "Smoke check failed: /api/vk/health?refresh=1 $reason" >&2
  echo "VK health summary: http=$http_code ok=${ok:-unknown} status=${status:-unknown}" >&2
  echo "Full VK diagnostics omitted from smoke logs to avoid leaking operational details." >&2
  exit 1
}

services_running="$(compose_cmd "$PROJECT_ROOT" "$ENV_FILE" ps --status running --services || true)"
for service_name in app web; do
  if ! grep -qx "$service_name" <<<"$services_running"; then
    echo "Smoke check failed: service '$service_name' is not running" >&2
    exit 1
  fi
done

check_url "$LOCAL_BASE_URL/healthz" "local web health"
check_url "$LOCAL_BASE_URL/api/health" "local api health"
check_html_contains "$LOCAL_BASE_URL/" '<!doctype html|<html' "homepage shell"
check_html_contains "$LOCAL_BASE_URL/sitemap.xml" '<urlset|<sitemapindex' "sitemap"
check_html_contains "$LOCAL_BASE_URL/robots.txt" 'Sitemap:' "robots"

forms_health_file="$(mktemp)"
forms_health_code="$(
  curl -sS \
    --connect-timeout 5 \
    --max-time 20 \
    -o "$forms_health_file" \
    -w '%{http_code}' \
    "$LOCAL_BASE_URL/api/forms/health"
)"
forms_health_body="$(cat "$forms_health_file")"
rm -f "$forms_health_file"

if [[ "$forms_health_code" != "200" && "$forms_health_code" != "503" ]]; then
  echo "Smoke check failed: /api/forms/health returned HTTP $forms_health_code" >&2
  echo "$forms_health_body" >&2
  exit 1
fi

if ! grep -Eq '"status":"(ready|unavailable)"' <<<"$forms_health_body"; then
  echo "Smoke check failed: unexpected /api/forms/health response" >&2
  echo "$forms_health_body" >&2
  exit 1
fi

if [[ -n "${INTERNAL_METRICS_TOKEN:-}" ]]; then
  runtime_body="$(
    curl -fsS \
      --connect-timeout 5 \
      --max-time 20 \
      -H "Authorization: Bearer ${INTERNAL_METRICS_TOKEN}" \
      "$LOCAL_BASE_URL/api/runtime"
  )"
  if ! grep -q '"ok":true' <<<"$runtime_body"; then
    echo "Smoke check failed: /api/runtime did not report ok=true" >&2
    echo "$runtime_body" >&2
    exit 1
  fi

  vk_health_file="$(mktemp)"
  vk_health_code="$(
    curl -sS \
      --connect-timeout 5 \
      --max-time 20 \
      -H "Authorization: Bearer ${INTERNAL_METRICS_TOKEN}" \
      -o "$vk_health_file" \
      -w '%{http_code}' \
      "$LOCAL_BASE_URL/api/vk/health?refresh=1"
  )"
  vk_health_body="$(cat "$vk_health_file")"
  rm -f "$vk_health_file"

  if [[ "$vk_health_code" == "200" ]] &&
    json_has_bool "$vk_health_body" "ok" "true" &&
    json_has_string "$vk_health_body" "status" "ready"; then
    :
  elif flag_enabled "${VK_SMOKE_ALLOW_DISABLED:-false}"; then
    if [[ "$vk_health_code" == "503" ]] &&
      json_has_bool "$vk_health_body" "ok" "false" &&
      json_has_string "$vk_health_body" "status" "unavailable"; then
      echo "[smoke] vk bridge disabled by VK_SMOKE_ALLOW_DISABLED=true"
    else
      fail_vk_health "$vk_health_code" "$vk_health_body" \
        "did not report the documented disabled state"
    fi
  else
    fail_vk_health "$vk_health_code" "$vk_health_body" \
      "did not report ok=true and status=ready"
  fi
fi

compose_cmd "$PROJECT_ROOT" "$ENV_FILE" exec -T app npm run check:product-prerender

if [[ "$SKIP_PUBLIC_CHECKS" != "true" && -n "$PUBLIC_URL" ]]; then
  check_url "$PUBLIC_URL" "public homepage"
  check_url "$PUBLIC_URL/api/health" "public api health"
fi

echo "[smoke] ok local=$LOCAL_BASE_URL public=${PUBLIC_URL:-skipped}"
