#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USE_PROD=1
INCLUDE_ORDERS=true
MAX_RETRIES=3
RETRY_SLEEP_SECONDS=3

declare -a ONLY_ORGS=()

die() {
  echo "[error] $*" >&2
  exit 1
}

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

Options:
  --no-prod                 Run against dev deployment (default: prod)
  --include-orders <bool>   true|false (default: true)
  --only-org <orgId>        Rebuild only this org (can be repeated)
  --max-retries <n>         Retries per org on failure (default: 3)
  --retry-sleep <seconds>   Seconds between retries (default: 3)
  -h, --help                Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --include-orders false
  $(basename "$0") --only-org org_abc --only-org org_xyz
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-prod)
      USE_PROD=0
      shift
      ;;
    --include-orders)
      [[ $# -ge 2 ]] || die "Missing value for --include-orders"
      [[ "$2" == "true" || "$2" == "false" ]] || die "--include-orders must be true or false"
      INCLUDE_ORDERS="$2"
      shift 2
      ;;
    --only-org)
      [[ $# -ge 2 ]] || die "Missing value for --only-org"
      ONLY_ORGS+=("$2")
      shift 2
      ;;
    --max-retries)
      [[ $# -ge 2 ]] || die "Missing value for --max-retries"
      MAX_RETRIES="$2"
      shift 2
      ;;
    --retry-sleep)
      [[ $# -ge 2 ]] || die "Missing value for --retry-sleep"
      RETRY_SLEEP_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

command -v jq >/dev/null 2>&1 || die "jq is required"
command -v pnpm >/dev/null 2>&1 || die "pnpm is required"

run_convex() {
  local function_name="$1"
  local payload="$2"

  local cmd=(pnpm -C packages/backend exec convex run)
  if [[ "$USE_PROD" -eq 1 ]]; then
    cmd+=(--prod)
  fi

  cmd+=("system/migrations/rebuildOrganizationAggregates:${function_name}" "$payload")
  "${cmd[@]}"
}

get_org_ids() {
  if [[ ${#ONLY_ORGS[@]} -gt 0 ]]; then
    printf '%s\n' "${ONLY_ORGS[@]}"
    return
  fi

  local raw
  raw="$(run_convex listOrganizationIdsForAggregateRebuild '{}')"
  echo "$raw" | jq -r '.[]'
}

mapfile -t ORG_IDS < <(get_org_ids)
[[ ${#ORG_IDS[@]} -gt 0 ]] || die "No organizations found"

echo "[info] Starting org-by-org aggregate rebuild"
echo "[info] deployment=$([[ "$USE_PROD" -eq 1 ]] && echo prod || echo dev), includeOrders=$INCLUDE_ORDERS, orgCount=${#ORG_IDS[@]}"

declare -a FAILED_ORGS=()
SUCCESS_COUNT=0

for org_id in "${ORG_IDS[@]}"; do
  echo "\n[info] Rebuilding aggregates for org: $org_id"

  attempt=1
  success=0

  while [[ "$attempt" -le "$MAX_RETRIES" ]]; do
    payload="$(jq -cn --arg org "$org_id" --argjson io "$INCLUDE_ORDERS" '{organizationId:$org, includeOrders:$io}')"

    if output="$(run_convex rebuildOrganizationAggregatesForOrg "$payload" 2>&1)"; then
      conversations="$(echo "$output" | jq -r '.counts.conversations // 0')"
      contacts="$(echo "$output" | jq -r '.counts.contacts // 0')"
      menu_products="$(echo "$output" | jq -r '.counts.menuProducts // 0')"
      locations="$(echo "$output" | jq -r '.counts.restaurantLocations // 0')"
      delivery_areas="$(echo "$output" | jq -r '.counts.deliveryAreas // 0')"
      orders="$(echo "$output" | jq -r '.counts.orders // 0')"

      echo "[ok] $org_id -> conversations=$conversations contacts=$contacts menuProducts=$menu_products locations=$locations deliveryAreas=$delivery_areas orders=$orders"
      success=1
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      break
    else
      echo "[warn] Attempt $attempt/$MAX_RETRIES failed for $org_id"
      echo "[warn] $output"
      if [[ "$attempt" -lt "$MAX_RETRIES" ]]; then
        sleep "$RETRY_SLEEP_SECONDS"
      fi
    fi

    attempt=$((attempt + 1))
  done

  if [[ "$success" -ne 1 ]]; then
    FAILED_ORGS+=("$org_id")
  fi
done

echo "\n[summary] Successful orgs: $SUCCESS_COUNT/${#ORG_IDS[@]}"
if [[ ${#FAILED_ORGS[@]} -gt 0 ]]; then
  echo "[summary] Failed orgs (${#FAILED_ORGS[@]}):"
  printf ' - %s\n' "${FAILED_ORGS[@]}"
  exit 1
fi

echo "[summary] All organizations rebuilt successfully."
