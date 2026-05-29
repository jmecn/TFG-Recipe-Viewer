#!/usr/bin/env bash
# Post-export contract check (routes + layout-packs; no legacy recipes/index.json).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"

cd "$ROOT"
npx emi-bundle-optimize validate "$BUNDLE"
