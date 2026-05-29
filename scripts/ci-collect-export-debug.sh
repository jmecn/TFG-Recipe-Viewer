#!/usr/bin/env bash
# Collect small debug files for upload-artifact (avoid globbing export-raw/** — stack overflow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
OUT="$ROOT/ci-debug"
PHASE="${1:-}"

rm -rf "$OUT"
mkdir -p "$OUT"

copy_if() {
  local src="$1"
  local dest="$2"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -a "$src" "$dest"
  fi
}

# MC / modpack logs
if [[ -d "$MP/logs" ]]; then
  mkdir -p "$OUT/modpack/logs"
  for f in "$MP/logs"/*; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    # latest.log + small rotated logs only
    if [[ "$base" == latest.log ]] || [[ $(stat -c%s "$f" 2>/dev/null || stat -f%z "$f") -lt 5242880 ]]; then
      cp -a "$f" "$OUT/modpack/logs/"
    fi
  done
fi

if [[ -d "$MP/crash-reports" ]]; then
  cp -a "$MP/crash-reports" "$OUT/modpack/"
fi

# EMI export summary (not the full tree)
BUNDLE="$ROOT/export-raw/emi"
if [[ -f "$BUNDLE/bundle.json" ]]; then
  mkdir -p "$OUT/export-raw/emi"
  cp "$BUNDLE/bundle.json" "$OUT/export-raw/emi/"
  du -sh "$BUNDLE" > "$OUT/export-raw/emi-size.txt" 2>/dev/null || true
  find "$BUNDLE" -type f 2>/dev/null | head -200 > "$OUT/export-raw/emi-file-sample.txt" || true
fi

if [[ "$PHASE" == "--phase" && "${2:-}" == "optimize" ]]; then
  OPT="$ROOT/export-opt"
  if [[ -f "$OPT/optimize-report.json" ]]; then
    mkdir -p "$OUT/export-opt"
    cp "$OPT/optimize-report.json" "$OUT/export-opt/"
  fi
  if [[ -d "$OPT" ]]; then
    du -sh "$OPT" > "$OUT/export-opt-size.txt" 2>/dev/null || true
  fi
fi

if [[ -z "$(find "$OUT" -type f 2>/dev/null | head -1)" ]]; then
  echo "no debug files collected" > "$OUT/README.txt"
fi

echo "debug files under $OUT:"
find "$OUT" -type f | head -50
