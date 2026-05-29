#!/usr/bin/env bash
# Resolve bundle id (tfg-<modpack tag>) without cloning Modpack-Modern.
# Writes modpack_tag and bundle_id to GITHUB_OUTPUT when set.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ci-modpack-tag.lib.sh"

TAG="$(resolve_modpack_tag)"
id="tfg-${TAG}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "modpack_tag=$TAG"
    echo "bundle_id=$id"
  } >> "$GITHUB_OUTPUT"
fi

echo "Modpack-Modern @ $TAG"
echo "bundle_id=$id"
