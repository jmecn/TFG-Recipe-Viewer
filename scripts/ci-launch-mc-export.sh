#!/usr/bin/env bash
# Launch modpack under xvfb for EMI export, then verify raw bundle layout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
EXPORT_RAW="${EXPORT_RAW:?EXPORT_RAW required}"
EXPORT_BUNDLE="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
HMC_VER="${HMC_VERSION:?HMC_VERSION required}"
launcher="headlessmc-launcher-${HMC_VER}.jar"

mkdir -p "$MP/config" "$MP/saves" "$EXPORT_RAW"
cp -f "$ROOT/ci/config/export-fml.toml" "$MP/config/fml.toml"
cp -f "$ROOT/ci/config/export-forge-client.toml" "$MP/config/forge-client.toml"
cat > "$MP/options.txt" <<EOF
onboardAccessibility:false
pauseOnLostFocus:false
EOF

if [[ "${MWE_JVM_FLAGS:-}" != *minecraftWebExport.exportLanguages=* ]]; then
  EXPORT_LANGUAGES="${EXPORT_LANGUAGES:-$(bash "$ROOT/scripts/ci-resolve-export-languages.sh" --stdout)}"
  MWE_JVM_FLAGS="${MWE_JVM_FLAGS} -DminecraftWebExport.exportLanguages=${EXPORT_LANGUAGES}"
  echo "Export languages (from language.json): ${EXPORT_LANGUAGES}"
fi

cd "$ROOT"
xvfb-run --server-args="-screen 0 1280x720x24" -a java \
  -Dhmc.check.xvfb=true \
  -jar "$launcher" \
  --command "launch .*forge.* -regex --jvm \"${MWE_JVM_FLAGS:?MWE_JVM_FLAGS required}\""

bash "$ROOT/scripts/ci-verify-emi-bundle.sh"
