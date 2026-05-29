#!/usr/bin/env bash
# Write export metadata for deploy workflow_run (artifact download).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
MODPACK_TAG="${MODPACK_TAG:?MODPACK_TAG required}"
OUT="$ROOT/export-meta"

mkdir -p "$OUT"
printf '%s\n' "$BUNDLE_ID" > "$OUT/bundle-id"
printf '%s\n' "$MODPACK_TAG" > "$OUT/modpack-tag"
echo "Wrote export-meta (bundle_id=$BUNDLE_ID modpack_tag=$MODPACK_TAG)"
