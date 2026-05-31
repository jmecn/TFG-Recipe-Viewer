#!/usr/bin/env bash
# Optimize raw EMI export and install into site/bundles/<id> (run in Deploy Pages, not Export).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
RAW="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
OUT="${EXPORT_OPT_STAGING:?EXPORT_OPT_STAGING required}"

if [[ ! -f "$RAW/bundle.json" ]]; then
  echo "::error::Raw bundle missing at $RAW — run Export EMI bundle and ensure Deploy installed artifact emi-raw-$BUNDLE_ID.tar.gz." >&2
  exit 1
fi

cd "$ROOT"
bash scripts/ci-verify-emi-bundle.sh
echo "::group::emi-bundle-optimize"
npx emi-bundle-optimize optimize \
  --in "$RAW" \
  --out "$OUT" \
  --force \
  --no-recipe-webp
echo "::endgroup::"
npm run copy -- --id "$BUNDLE_ID" "$OUT"
npm run validate -- "site/bundles/$BUNDLE_ID"

echo "Optimized bundle staged at site/bundles/$BUNDLE_ID"
