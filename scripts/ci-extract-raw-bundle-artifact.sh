#!/usr/bin/env bash
# Extract emi-raw-<bundle_id>.tar.gz (from Export workflow artifact) into EXPORT_RAW/.
set -euo pipefail

BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
EXPORT_RAW="${EXPORT_RAW:?EXPORT_RAW required}"
EXPORT_BUNDLE_SUBDIR="${EXPORT_BUNDLE_SUBDIR:-emi}"

ARCHIVE="emi-raw-${BUNDLE_ID}.tar.gz"
if [[ ! -f "$ARCHIVE" ]]; then
  echo "::error::Missing $ARCHIVE in $(pwd)" >&2
  exit 1
fi

mkdir -p "$EXPORT_RAW"
tar -xzf "$ARCHIVE" -C "$EXPORT_RAW"
BUNDLE_JSON="${EXPORT_RAW}/${EXPORT_BUNDLE_SUBDIR}/bundle.json"
if [[ ! -f "$BUNDLE_JSON" ]]; then
  echo "::error::After extract, missing $BUNDLE_JSON" >&2
  exit 1
fi

schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "$BUNDLE_JSON")"
imageScale="$(node -e "const b=require(process.argv[1]); console.log(b.imageScale??'')" "$BUNDLE_JSON")"
echo "Raw bundle from artifact: schema=${schema} imageScale=${imageScale} path=$BUNDLE_JSON"
