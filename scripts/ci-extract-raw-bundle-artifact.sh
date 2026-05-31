#!/usr/bin/env bash
# Install Export artifact: emi-raw-<bundle_id>.tar.gz → EXPORT_RAW/emi/
set -euo pipefail

EXPORT_RAW="${EXPORT_RAW:?EXPORT_RAW required}"
EXPORT_BUNDLE_SUBDIR="${EXPORT_BUNDLE_SUBDIR:-emi}"
BUNDLE_ID="${BUNDLE_ID:?BUNDLE_ID required}"
DEST="${EXPORT_RAW}/${EXPORT_BUNDLE_SUBDIR}"
ARCHIVE="./emi-raw-${BUNDLE_ID}.tar.gz"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "::error::Missing ${ARCHIVE} after artifact download." >&2
  ls -la
  exit 1
fi

rm -rf emi
tar -xzf "$ARCHIVE"

if [[ ! -f "emi/bundle.json" ]]; then
  echo "::error::${ARCHIVE} did not contain emi/bundle.json" >&2
  exit 1
fi

mkdir -p "$EXPORT_RAW"
rm -rf "$DEST"
cp -a emi "$DEST"
rm -rf emi "$ARCHIVE"

schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "${DEST}/bundle.json")"
imageScale="$(node -e "const b=require(process.argv[1]); console.log(b.imageScale??'')" "${DEST}/bundle.json")"
echo "Raw bundle at ${DEST}/bundle.json (schema=${schema} imageScale=${imageScale})"
