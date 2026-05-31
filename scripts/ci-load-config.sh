#!/usr/bin/env bash
# Load ci/build.env and export derived paths. Appends to GITHUB_ENV when set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${CI_BUILD_ENV:-$ROOT/ci/build.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "::error::Missing CI config: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

WS="${GITHUB_WORKSPACE:-$ROOT}"
EXPORT_RAW="${WS}/${EXPORT_RAW_DIR:-export-raw}"
EXPORT_BUNDLE="${EXPORT_RAW}/${EXPORT_BUNDLE_SUBDIR:-emi}"
EXPORT_OPT_STAGING="${WS}/${EXPORT_OPT_DIR:-export-opt}"
RUNNER_HOME="${RUNNER_HOME:-${HOME:-/home/runner}}"

export RUNNER_HOME JAVA_VERSION NODE_VERSION
export MC_VERSION MC_ASSET_INDEX FORGE_BUILD
export HMC_VERSION MODPACK_DIR MODPACK_TAG
export MWE_VERSION RENDERER_VERSION OPTIMIZE_VERSION EMI_RAW_CACHE_KEY_PREFIX
export EXPORT_WARMUP_TICKS EXPORT_TIMEOUT_SECONDS
export EXPORT_RAW EXPORT_BUNDLE EXPORT_OPT_STAGING
export EXPORT_RAW_DIR EXPORT_BUNDLE_SUBDIR EXPORT_OPT_DIR

if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    printf 'RUNNER_HOME=%s\n' "$RUNNER_HOME"
    printf 'JAVA_VERSION=%s\n' "$JAVA_VERSION"
    printf 'NODE_VERSION=%s\n' "$NODE_VERSION"
    printf 'MC_VERSION=%s\n' "$MC_VERSION"
    printf 'MC_ASSET_INDEX=%s\n' "$MC_ASSET_INDEX"
    printf 'FORGE_BUILD=%s\n' "$FORGE_BUILD"
    printf 'HMC_VERSION=%s\n' "$HMC_VERSION"
    printf 'MODPACK_DIR=%s\n' "$MODPACK_DIR"
    printf 'MODPACK_TAG=%s\n' "${MODPACK_TAG:-}"
    printf 'MWE_VERSION=%s\n' "$MWE_VERSION"
    printf 'RENDERER_VERSION=%s\n' "$RENDERER_VERSION"
    printf 'OPTIMIZE_VERSION=%s\n' "$OPTIMIZE_VERSION"
    printf 'EMI_RAW_CACHE_KEY_PREFIX=%s\n' "${EMI_RAW_CACHE_KEY_PREFIX:-emi-raw-s2}"
    printf 'EXPORT_WARMUP_TICKS=%s\n' "$EXPORT_WARMUP_TICKS"
    printf 'EXPORT_TIMEOUT_SECONDS=%s\n' "$EXPORT_TIMEOUT_SECONDS"
    printf 'EXPORT_RAW_DIR=%s\n' "${EXPORT_RAW_DIR:-export-raw}"
    printf 'EXPORT_BUNDLE_SUBDIR=%s\n' "${EXPORT_BUNDLE_SUBDIR:-emi}"
    printf 'EXPORT_OPT_DIR=%s\n' "${EXPORT_OPT_DIR:-export-opt}"
    printf 'EXPORT_RAW=%s\n' "$EXPORT_RAW"
    printf 'EXPORT_BUNDLE=%s\n' "$EXPORT_BUNDLE"
    printf 'EXPORT_OPT_STAGING=%s\n' "$EXPORT_OPT_STAGING"
  } >> "$GITHUB_ENV"
fi
