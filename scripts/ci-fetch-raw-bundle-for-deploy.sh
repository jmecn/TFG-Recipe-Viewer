#!/usr/bin/env bash
# Download artifact emi-raw-<bundle_id> from the latest successful Export run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
ARTIFACT_NAME="emi-raw-${BUNDLE_ID}"

if [[ -f "${EXPORT_RAW:?EXPORT_RAW required}/emi/bundle.json" ]]; then
  echo "Raw bundle already at ${EXPORT_RAW}/emi"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1 || [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  echo "::error::gh CLI and GITHUB_TOKEN required to download artifact ${ARTIFACT_NAME}" >&2
  exit 1
fi

run_id="$(gh run list \
  --repo "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}" \
  --workflow "Export EMI bundle" \
  --status success \
  --limit 1 \
  --json databaseId \
  -q '.[0].databaseId')"

if [[ -z "$run_id" ]]; then
  echo "::error::No successful Export EMI bundle run found" >&2
  exit 1
fi

rm -rf emi
gh run download "$run_id" --repo "$GITHUB_REPOSITORY" -n "$ARTIFACT_NAME" -D .
bash "$ROOT/scripts/ci-extract-raw-bundle-artifact.sh"
echo "Installed from Export run $run_id (artifact ${ARTIFACT_NAME})"
