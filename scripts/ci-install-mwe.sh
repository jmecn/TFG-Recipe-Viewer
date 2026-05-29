#!/usr/bin/env bash
# Download minecraft-web-export release jar and install into modpack mods/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
MWE_TAG="${MWE_TAG:-${MWE_VERSION:?MWE_VERSION or MWE_TAG required}}"
ver="${MWE_TAG#v}"
jar_name="minecraft-web-export-${ver}.jar"

cd "$ROOT"
rm -f minecraft-web-export-*.jar
gh release download "$MWE_TAG" \
  --repo jmecn/minecraft-web-export \
  --pattern "$jar_name" \
  --clobber

mkdir -p "$MP/mods"
find "$MP/mods" -maxdepth 1 -name 'minecraft-web-export*.jar' -delete
find "$MP/mods" -maxdepth 1 -name 'field-guide*.jar' -delete

jar=$(ls minecraft-web-export-*.jar | head -1)
if [[ -z "$jar" ]]; then
  echo "::error::No minecraft-web-export jar"
  exit 1
fi
cp -v "$jar" "$MP/mods/"

cp_cfg="$MP/config/craftpresence.json"
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
