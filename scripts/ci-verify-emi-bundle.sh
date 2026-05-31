#!/usr/bin/env bash
# Post-export contract check (bundle schema v2: PNG/WebP + per-recipe meta; no layout-packs/routes).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"

cd "$ROOT"
npx emi-bundle-optimize validate "$BUNDLE"
