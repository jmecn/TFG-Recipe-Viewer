#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANG_CFG="${ROOT}/language.json"

if [[ ! -f "$LANG_CFG" ]]; then
  echo "export_languages=en_us,zh_cn" >> "$GITHUB_OUTPUT"
  echo "Export languages: en_us,zh_cn (language.json missing)"
  exit 0
fi

EXPORT_LANGUAGES="$(
  node -e "
const fs=require('fs');
const p=process.argv[1];
const cfg=JSON.parse(fs.readFileSync(p,'utf8'));
const arr=Array.isArray(cfg.enabledLocales) ? cfg.enabledLocales : [];
const norm=[...new Set(arr.map(s=>String(s||'').trim().toLowerCase().replace('-', '_')).filter(Boolean))];
process.stdout.write((norm.length?norm:['en_us','zh_cn']).join(','));
" "$LANG_CFG"
)"

echo "export_languages=${EXPORT_LANGUAGES}" >> "$GITHUB_OUTPUT"
echo "Export languages: ${EXPORT_LANGUAGES}"
