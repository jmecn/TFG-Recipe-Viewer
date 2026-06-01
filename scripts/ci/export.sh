#!/usr/bin/env bash
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CI_DIR/../.." && pwd)"
# shellcheck source=lib/modpack-tag.sh
source "$CI_DIR/lib/modpack-tag.sh"
# shellcheck source=lib/env.sh
source "$CI_DIR/lib/env.sh"
# shellcheck source=lib/bundle.sh
source "$CI_DIR/lib/bundle.sh"

resolve_export_languages() {
  local lang_cfg="$ROOT/language.json"
  if [[ ! -f "$lang_cfg" ]]; then
    echo "en_us,zh_cn"
    return
  fi
  node -e "
const fs=require('fs');
const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const arr=Array.isArray(cfg.enabledLocales)?cfg.enabledLocales:[];
const norm=[...new Set(arr.map(s=>String(s||'').trim().toLowerCase().replace('-','_')).filter(Boolean))];
process.stdout.write((norm.length?norm:['en_us','zh_cn']).join(','));
" "$lang_cfg"
}

cmd_load_config() { ci_load_config; }

cmd_prep_node() {
  cd "$ROOT"
  local renderer_ver="${RENDERER_VER:-${RENDERER_VERSION:?RENDERER_VER or RENDERER_VERSION required}}"
  local optimize_ver="${OPTIMIZE_VER:-${OPTIMIZE_VERSION:?OPTIMIZE_VER or OPTIMIZE_VERSION required}}"
  npm pkg set "dependencies.emi-recipe-renderer=${renderer_ver}"
  npm pkg set "dependencies.emi-bundle-optimize=${optimize_ver}"
  npm install --no-audit --no-fund
  echo "emi-recipe-renderer@${renderer_ver}"
  echo "emi-bundle-optimize@$(node -p "require('./node_modules/emi-bundle-optimize/package.json').version")"
}

cmd_checkout_modpack() {
  local mp="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
  local tag
  tag="$(resolve_modpack_tag)"
  if [[ -n "${MODPACK_TAG:-}" ]]; then
    echo "Using MODPACK_TAG override: $tag"
  else
    echo "Latest release tag: $tag"
  fi

  cd "$ROOT"
  if [[ -e "$mp/.git" ]]; then
    local current
    current="$(git -C "$mp" describe --tags --exact-match 2>/dev/null || true)"
    if [[ "$current" == "$tag" ]]; then
      echo "Modpack-Modern already at $tag"
    else
      echo "Replacing $mp (was ${current:-unknown}) with shallow clone @ $tag ..."
      rm -rf "$mp"
      git clone --depth 1 --branch "$tag" "$MODPACK_REPO" "$mp"
    fi
  else
    echo "Shallow cloning Modpack-Modern @ $tag into $mp ..."
    git clone --depth 1 --branch "$tag" "$MODPACK_REPO" "$mp"
  fi

  cd "$mp"
  git describe --tags --exact-match 2>/dev/null || git describe --tags --always

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "modpack_tag=$tag" >> "$GITHUB_OUTPUT"
  fi
}

cmd_prepare_metadata() {
  local tag="${MODPACK_TAG:?MODPACK_TAG required}"
  local id="tfg-${tag}"
  {
    echo "bundle_id=$id"
  } >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"
  echo "Modpack-Modern @ $tag"
  echo "bundle_id=$id"
}

cmd_install_mwe() {
  local mp="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
  local mwe_tag="${MWE_TAG:-${MWE_VERSION:?MWE_VERSION or MWE_TAG required}}"
  local ver="${mwe_tag#v}"
  local jar_name="minecraft-web-export-${ver}.jar"

  cd "$ROOT"
  rm -f minecraft-web-export-*.jar
  gh release download "$mwe_tag" \
    --repo jmecn/minecraft-web-export \
    --pattern "$jar_name" \
    --clobber

  mkdir -p "$mp/mods"
  find "$mp/mods" -maxdepth 1 -name 'minecraft-web-export*.jar' -delete
  find "$mp/mods" -maxdepth 1 -name 'field-guide*.jar' -delete

  local jar
  jar=$(ls minecraft-web-export-*.jar | head -1)
  if [[ -z "$jar" ]]; then
    echo "::error::No minecraft-web-export jar"
    exit 1
  fi
  cp -v "$jar" "$mp/mods/"

  local cp_cfg="$mp/config/craftpresence.json"
  if [[ -f "$cp_cfg" ]]; then
    python3 - "$cp_cfg" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("displaySettings", {}).setdefault("presenceData", {})["enabled"] = False
cfg.setdefault("advancedSettings", {})["maxConnectionAttempts"] = 1
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY
  fi
}

cmd_resolve_export_languages() {
  local langs
  langs="$(resolve_export_languages)"
  if [[ "${1:-}" == "--stdout" ]]; then
    echo "$langs"
    return
  fi
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "export_languages=${langs}" >> "$GITHUB_OUTPUT"
  fi
  echo "Export languages: ${langs}"
}

cmd_setup_hmc() {
  cd "$ROOT"
  local hmc_ver="${HMC_VERSION:?HMC_VERSION required}"
  local mc_ver="${MC_VERSION:?MC_VERSION required}"
  local forge="${FORGE_BUILD:?FORGE_BUILD required}"
  local mp="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
  local launcher="headlessmc-launcher-${hmc_ver}.jar"

  if [[ ! -f "$launcher" ]]; then
    gh release download "$hmc_ver" \
      --repo 3arthqu4ke/headlessmc \
      --pattern "$launcher" \
      --clobber
  fi

  mkdir -p HeadlessMC
  cat > HeadlessMC/config.properties <<EOF
hmc.java.versions=$JAVA_HOME/bin/java
hmc.gamedir=$GITHUB_WORKSPACE/$mp
hmc.offline=true
hmc.rethrow.launch.exceptions=true
hmc.exit.on.failed.command=true
EOF

  if [[ ! -f "$HOME/.minecraft/versions/$mc_ver/$mc_ver.json" ]]; then
    java -jar "$launcher" --command "download $mc_ver"
  fi
  if ! ls "$HOME/.minecraft/versions" 2>/dev/null | grep -q "$forge"; then
    java -jar "$launcher" --command "forge $mc_ver --uid $forge"
  fi
}

cmd_launch_mc_export() {
  local mp="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
  local hmc_ver="${HMC_VERSION:?HMC_VERSION required}"
  local launcher="headlessmc-launcher-${hmc_ver}.jar"

  mkdir -p "$mp/config" "$mp/saves" "${EXPORT_RAW:?EXPORT_RAW required}"
  cp -f "$ROOT/ci/config/export-fml.toml" "$mp/config/fml.toml"
  cp -f "$ROOT/ci/config/export-forge-client.toml" "$mp/config/forge-client.toml"
  cat > "$mp/options.txt" <<EOF
onboardAccessibility:false
pauseOnLostFocus:false
EOF

  if [[ "${MWE_JVM_FLAGS:-}" != *minecraftWebExport.exportLanguages=* ]]; then
    EXPORT_LANGUAGES="${EXPORT_LANGUAGES:-$(cmd_resolve_export_languages --stdout)}"
    MWE_JVM_FLAGS="${MWE_JVM_FLAGS} -DminecraftWebExport.exportLanguages=${EXPORT_LANGUAGES}"
    export MWE_JVM_FLAGS
    echo "Export languages (from language.json): ${EXPORT_LANGUAGES}"
  fi

  cd "$ROOT"
  xvfb-run --server-args="-screen 0 1280x720x24" -a java \
    -Dhmc.check.xvfb=true \
    -jar "$launcher" \
    --command "launch .*forge.* -regex --jvm \"${MWE_JVM_FLAGS:?MWE_JVM_FLAGS required}\""

  verify_emi_bundle
}

cmd_write_export_meta() {
  local bundle_id="${BUNDLE_ID:?BUNDLE_ID required}"
  local modpack_tag="${MODPACK_TAG:?MODPACK_TAG required}"
  local out="$ROOT/export-meta"
  mkdir -p "$out"
  printf '%s\n' "$bundle_id" > "$out/bundle-id"
  printf '%s\n' "$modpack_tag" > "$out/modpack-tag"
  echo "Wrote export-meta (bundle_id=$bundle_id modpack_tag=$modpack_tag)"
}

cmd_collect_export_debug() {
  local mp="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
  local out="$ROOT/ci-debug"
  local phase="${1:-}"

  rm -rf "$out"
  mkdir -p "$out"

  if [[ -d "$mp/logs" ]]; then
    mkdir -p "$out/modpack/logs"
    for f in "$mp/logs"/*; do
      [[ -f "$f" ]] || continue
      local base
      base=$(basename "$f")
      if [[ "$base" == latest.log ]] || [[ $(stat -c%s "$f" 2>/dev/null || stat -f%z "$f") -lt 5242880 ]]; then
        cp -a "$f" "$out/modpack/logs/"
      fi
    done
  fi

  if [[ -d "$mp/crash-reports" ]]; then
    cp -a "$mp/crash-reports" "$out/modpack/"
  fi

  local bundle="$ROOT/export-raw/emi"
  if [[ -f "$bundle/bundle.json" ]]; then
    mkdir -p "$out/export-raw/emi"
    cp "$bundle/bundle.json" "$out/export-raw/emi/"
    du -sh "$bundle" > "$out/export-raw/emi-size.txt" 2>/dev/null || true
    find "$bundle" -type f 2>/dev/null | head -200 > "$out/export-raw/emi-file-sample.txt" || true
  fi

  if [[ "$phase" == "--phase" && "${2:-}" == "optimize" ]]; then
    local opt="$ROOT/export-opt"
    if [[ -f "$opt/optimize-report.json" ]]; then
      mkdir -p "$out/export-opt"
      cp "$opt/optimize-report.json" "$out/export-opt/"
    fi
    if [[ -d "$opt" ]]; then
      du -sh "$opt" > "$out/export-opt-size.txt" 2>/dev/null || true
    fi
  fi

  if [[ -z "$(find "$out" -type f 2>/dev/null | head -1)" ]]; then
    echo "no debug files collected" > "$out/README.txt"
  fi

  echo "debug files under $out:"
  find "$out" -type f | head -50
}

cmd="${1:?export.sh: missing command}"
shift
case "$cmd" in
  load-config) cmd_load_config ;;
  prep-node) cmd_prep_node ;;
  checkout-modpack) cmd_checkout_modpack ;;
  prepare-metadata) cmd_prepare_metadata ;;
  install-mwe) cmd_install_mwe ;;
  resolve-export-languages) cmd_resolve_export_languages "$@" ;;
  setup-hmc) cmd_setup_hmc ;;
  launch-mc-export) cmd_launch_mc_export ;;
  write-export-meta) cmd_write_export_meta ;;
  collect-export-debug) cmd_collect_export_debug "$@" ;;
  *)
    echo "::error::Unknown export command: $cmd" >&2
    exit 1
    ;;
esac
