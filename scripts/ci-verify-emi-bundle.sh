#!/usr/bin/env bash
# Post-export contract check (bundle schema v2: PNG/WebP + per-recipe meta; no layout-packs/routes).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
BUNDLE_JSON="$BUNDLE/bundle.json"

if [[ ! -f "$BUNDLE_JSON" ]]; then
  echo "::error::Missing $BUNDLE_JSON" >&2
  exit 1
fi

schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "$BUNDLE_JSON")"
if [[ "$schema" != "2" ]]; then
  echo "::error::bundle.json schema must be 2 (got: ${schema:-<missing>})." >&2
  echo "::error::Raw bundle is not schema 2. Re-run Export EMI bundle (MWE ${MWE_VERSION:-?}); Deploy must use emi-raw-* artifact, not stale Actions cache." >&2
  exit 1
fi

cd "$ROOT"
npx emi-bundle-optimize validate "$BUNDLE"
