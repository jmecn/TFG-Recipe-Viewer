#!/usr/bin/env bash
# bundle id and version log (GITHUB_OUTPUT).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${MODPACK_TAG:?MODPACK_TAG required}"

id="tfg-${TAG}"

{
  echo "bundle_id=$id"
} >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"

echo "Modpack-Modern @ $TAG"
echo "bundle_id=$id"
