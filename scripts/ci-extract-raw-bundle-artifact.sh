#!/usr/bin/env bash
# Install Export artifact into EXPORT_RAW/emi/. Artifact must contain ./emi/bundle.json.
set -euo pipefail

EXPORT_RAW="${EXPORT_RAW:?EXPORT_RAW required}"
EXPORT_BUNDLE_SUBDIR="${EXPORT_BUNDLE_SUBDIR:-emi}"
SRC="./${EXPORT_BUNDLE_SUBDIR}"
DEST="${EXPORT_RAW}/${EXPORT_BUNDLE_SUBDIR}"

if [[ ! -f "${SRC}/bundle.json" ]]; then
  echo "::error::Expected ${SRC}/bundle.json after artifact download (Export uploads export-raw/ → emi/)." >&2
  ls -la
  exit 1
fi

mkdir -p "$EXPORT_RAW"
rm -rf "$DEST"
cp -a "$SRC" "$DEST"

schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "${DEST}/bundle.json")"
imageScale="$(node -e "const b=require(process.argv[1]); console.log(b.imageScale??'')" "${DEST}/bundle.json")"
echo "Raw bundle at ${DEST}/bundle.json (schema=${schema} imageScale=${imageScale})"
