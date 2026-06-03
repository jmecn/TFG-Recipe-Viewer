#!/usr/bin/env bash
# Resolve CI dependency versions and print a single summary block.
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CI_DIR/../.." && pwd)"
# shellcheck source=lib/env.sh
source "$CI_DIR/lib/env.sh"
# shellcheck source=lib/modpack-tag.sh
source "$CI_DIR/lib/modpack-tag.sh"

cmd_print_versions() {
  ci_load_config

  # workflow_dispatch 留空时会注入 MODPACK_TAG=""，视为未指定以便解析最新 tag
  if [[ -z "${MODPACK_TAG:-}" ]]; then
    unset MODPACK_TAG
  fi

  local modpack mwe site renderer optimize hmc bundle_id

  modpack="$(resolve_modpack_tag)" || exit 1
  if [[ -z "$modpack" ]]; then
    echo "::error::Could not resolve Modpack-Modern release tag" >&2
    exit 1
  fi
  bundle_id="tfg-${modpack}"
  mwe="$(resolve_mwe_tag)"
  site="$(resolve_site_viewer_version)"
  renderer="$(resolve_renderer_version)"
  optimize="$(resolve_optimize_version)"
  hmc="$(resolve_hmc_version)"

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
      printf 'MODPACK_TAG=%s\n' "$modpack"
      printf 'BUNDLE_ID=%s\n' "$bundle_id"
      printf 'MWE_TAG=%s\n' "$mwe"
      printf 'SITE_VIEWER_VERSION=%s\n' "$site"
      printf 'RENDERER_VERSION=%s\n' "$renderer"
      printf 'OPTIMIZE_VERSION=%s\n' "$optimize"
      printf 'HMC_VERSION=%s\n' "$hmc"
    } >> "$GITHUB_ENV"
  fi

  echo "::group::CI resolved versions"
  printf '%s\n' \
    "modpack_tag=${modpack}" \
    "bundle_id=${bundle_id}" \
    "mwe_tag=${mwe}" \
    "site_viewer=v${site}" \
    "emi_recipe_renderer=${renderer}" \
    "emi_bundle_optimize=${optimize}" \
    "headlessmc=${hmc}" \
    "node=${NODE_VERSION}" \
    "minecraft=${MC_VERSION} (assets ${MC_ASSET_INDEX})" \
    "forge_build=${FORGE_BUILD}"
  echo "::endgroup::"

  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "## Resolved versions"
      echo ""
      echo "| Component | Version |"
      echo "|-----------|---------|"
      echo "| Modpack-Modern | \`${modpack}\` |"
      echo "| Bundle id | \`${bundle_id}\` |"
      echo "| minecraft-web-export | \`${mwe}\` |"
      echo "| TFG-Recipe-Viewer-React | \`v${site}\` |"
      echo "| emi-recipe-renderer | \`${renderer}\` |"
      echo "| emi-bundle-optimize | \`${optimize}\` |"
      echo "| HeadlessMC | \`${hmc}\` |"
      echo "| Node (CI) | \`${NODE_VERSION}\` |"
      echo "| Minecraft / Forge | \`${MC_VERSION}\` / \`${FORGE_BUILD}\` |"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

cmd="${1:?info.sh: missing command}"
case "$cmd" in
  print-versions) cmd_print_versions ;;
  *)
    echo "::error::Unknown info command: $cmd" >&2
    exit 1
    ;;
esac
