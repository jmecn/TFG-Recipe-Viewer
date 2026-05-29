#!/usr/bin/env bash
# Finalize site/ for Pages deploy after bundle cache restore (no MC export).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
BUNDLE_ROOT="$ROOT/site/bundles/$BUNDLE_ID"

if [[ ! -f "$BUNDLE_ROOT/bundle.json" ]]; then
  echo "::error::Missing bundle at site/bundles/$BUNDLE_ID — run Deploy Pages (needs emi-raw-$BUNDLE_ID cache from Export)." >&2
  exit 1
fi

cd "$ROOT"
bash scripts/ci-patch-renderer-version.sh
npm run copy -- --id "$BUNDLE_ID" "$BUNDLE_ROOT"
npm run validate
test -f site/app.js

echo "Deploy site ready (bundle: $BUNDLE_ID)"
