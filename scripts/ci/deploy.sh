#!/usr/bin/env bash
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CI_DIR/../.." && pwd)"
# shellcheck source=lib/modpack-tag.sh
source "$CI_DIR/lib/modpack-tag.sh"
# shellcheck source=lib/bundle.sh
source "$CI_DIR/lib/bundle.sh"

cmd_resolve_bundle_id() {
  local tag id
  tag="$(resolve_modpack_tag)"
  id="tfg-${tag}"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "modpack_tag=$tag"
      echo "bundle_id=$id"
    } >> "$GITHUB_OUTPUT"
  fi
  echo "Modpack-Modern @ $tag"
  echo "bundle_id=$id"
}

cmd_extract_raw_bundle() {
  local export_raw="${EXPORT_RAW:?EXPORT_RAW required}"
  local subdir="${EXPORT_BUNDLE_SUBDIR:-emi}"
  local bundle_id="${BUNDLE_ID:?BUNDLE_ID required}"
  local dest="${export_raw}/${subdir}"
  local archive="./emi-raw-${bundle_id}.tar.gz"

  if [[ ! -f "$archive" ]]; then
    echo "::error::Missing ${archive} after artifact download." >&2
    ls -la
    exit 1
  fi

  rm -rf emi
  tar -xzf "$archive"

  if [[ ! -f "emi/bundle.json" ]]; then
    echo "::error::${archive} did not contain emi/bundle.json" >&2
    exit 1
  fi

  mkdir -p "$export_raw"
  rm -rf "$dest"
  cp -a emi "$dest"
  rm -rf emi "$archive"

  local schema image_scale
  schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "${dest}/bundle.json")"
  image_scale="$(node -e "const b=require(process.argv[1]); console.log(b.imageScale??'')" "${dest}/bundle.json")"
  echo "Raw bundle at ${dest}/bundle.json (schema=${schema} imageScale=${image_scale})"
}

cmd_fetch_raw_bundle() {
  local bundle_id="${BUNDLE_ID:?BUNDLE_ID required}"
  local artifact_name="emi-raw-${bundle_id}"
  local export_raw="${EXPORT_RAW:?EXPORT_RAW required}"

  if [[ -f "${export_raw}/emi/bundle.json" ]]; then
    echo "Raw bundle already at ${export_raw}/emi"
    return 0
  fi

  if ! command -v gh >/dev/null 2>&1 || [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
    echo "::error::gh CLI and GITHUB_TOKEN required to download artifact ${artifact_name}" >&2
    exit 1
  fi

  local run_id
  run_id="$(gh run list \
    --repo "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}" \
    --workflow "Export EMI bundle" \
    --status success \
    --limit 1 \
    --json databaseId \
    -q '.[0].databaseId')"

  if [[ -z "$run_id" ]]; then
    echo "::error::No successful Export EMI bundle run found" >&2
    exit 1
  fi

  rm -rf emi "emi-raw-${bundle_id}.tar.gz"
  gh run download "$run_id" --repo "$GITHUB_REPOSITORY" -n "$artifact_name" -D .
  bash "$ROOT/scripts/ci.sh" extract-raw-bundle
  echo "Installed from Export run $run_id (artifact ${artifact_name})"
}

cmd_verify_emi_bundle() { verify_emi_bundle; }

cmd_optimize_and_stage() {
  local bundle_id="${BUNDLE_ID:?BUNDLE_ID required}"
  local raw="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
  local out="${EXPORT_OPT_STAGING:?EXPORT_OPT_STAGING required}"

  if [[ ! -f "$raw/bundle.json" ]]; then
    echo "::error::Raw bundle missing at $raw — run Export EMI bundle and ensure Deploy installed artifact emi-raw-$bundle_id.tar.gz." >&2
    exit 1
  fi

  cd "$ROOT"
  verify_emi_bundle
  echo "::group::emi-bundle-optimize"
  npx emi-bundle-optimize optimize \
    --in "$raw" \
    --out "$out" \
    --force \
    --no-recipe-webp
  echo "::endgroup::"
  npm run copy -- --id "$bundle_id" "$out"
  npm run validate -- "site/bundles/$bundle_id"
  echo "Optimized bundle staged at site/bundles/$bundle_id"
}

cmd_prep_deploy_site() {
  local bundle_id="${BUNDLE_ID:?BUNDLE_ID required}"
  local bundle_root="$ROOT/site/bundles/$bundle_id"

  if [[ ! -f "$bundle_root/bundle.json" ]]; then
    echo "::error::Missing bundle at site/bundles/$bundle_id — run Deploy Pages after a successful Export (emi-raw-$bundle_id artifact)." >&2
    exit 1
  fi

  cd "$ROOT"
  patch_renderer_version_meta
  npm run copy -- --id "$bundle_id" "$bundle_root"
  npm run validate
  test -f site/js/main.js
  echo "Deploy site ready (bundle: $bundle_id)"
}

cmd="${1:?deploy.sh: missing command}"
shift
case "$cmd" in
  resolve-bundle-id) cmd_resolve_bundle_id ;;
  extract-raw-bundle) cmd_extract_raw_bundle ;;
  fetch-raw-bundle) cmd_fetch_raw_bundle ;;
  verify-emi-bundle) cmd_verify_emi_bundle ;;
  optimize-and-stage) cmd_optimize_and_stage ;;
  prep-deploy-site) cmd_prep_deploy_site ;;
  *)
    echo "::error::Unknown deploy command: $cmd" >&2
    exit 1
    ;;
esac
