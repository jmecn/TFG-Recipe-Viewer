#!/usr/bin/env bash
# Obtain raw EMI bundle for Deploy: download latest successful Export artifact (only source).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
EXPORT_RAW="${EXPORT_RAW:?EXPORT_RAW required}"

ARCHIVE="emi-raw-${BUNDLE_ID}.tar.gz"

if [[ -f "$ARCHIVE" ]]; then
  echo "Using raw bundle artifact: $ARCHIVE"
  bash "$ROOT/scripts/ci-extract-raw-bundle-artifact.sh"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI not available; cannot download Export artifact" >&2
  exit 1
fi

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$token" ]]; then
  echo "::error::GH_TOKEN/GITHUB_TOKEN not set; cannot download Export artifact" >&2
  exit 1
fi

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"

echo "Searching successful Export EMI bundle runs on ${repo} ..."
mapfile -t run_ids < <(gh run list \
  --repo "$repo" \
  --workflow "Export EMI bundle" \
  --status success \
  --limit 20 \
  --json databaseId \
  -q '.[].databaseId')

for run_id in "${run_ids[@]}"; do
  [[ -z "$run_id" ]] && continue
  rm -f "$ARCHIVE"
  if gh run download "$run_id" --repo "$repo" -n "$ARCHIVE" -D . 2>/dev/null && [[ -f "$ARCHIVE" ]]; then
    echo "Downloaded $ARCHIVE from Export run $run_id"
    bash "$ROOT/scripts/ci-extract-raw-bundle-artifact.sh"
    exit 0
  fi
done

echo "::error::No emi-raw-${BUNDLE_ID}.tar.gz in recent successful Export EMI bundle runs. Run Export first; Deploy does not use Actions cache." >&2
exit 1
