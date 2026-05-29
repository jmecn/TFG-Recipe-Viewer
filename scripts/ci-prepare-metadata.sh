#!/usr/bin/env bash
# bundle id, pakku hash, EMI cache keys, and version log (GITHUB_OUTPUT).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
TAG="${MODPACK_TAG:?MODPACK_TAG required}"
MC_VER="${MC_VERSION:?MC_VERSION required}"

id="tfg-${TAG}"
hash=$(sha256sum "$MP/pakku-lock.json" | awk '{print $1}')
suffix="${MC_VER}-${TAG}-${hash}"

{
  echo "bundle_id=$id"
  echo "pakku_lock_hash=$hash"
  echo "emi_bundle=emi-bundle-${suffix}"
  echo "emi_opt=emi-opt-${suffix}"
} >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"

echo "Modpack-Modern @ $TAG"
echo "bundle_id=$id"
