#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANG_CFG="${ROOT}/language.json"

resolve_export_languages() {
  if [[ ! -f "$LANG_CFG" ]]; then
    echo "en_us,zh_cn"
    return
  fi
  node -e "
const fs=require('fs');
const p=process.argv[1];
const cfg=JSON.parse(fs.readFileSync(p,'utf8'));
const arr=Array.isArray(cfg.enabledLocales) ? cfg.enabledLocales : [];
const norm=[...new Set(arr.map(s=>String(s||'').trim().toLowerCase().replace('-', '_')).filter(Boolean))];
process.stdout.write((norm.length?norm:['en_us','zh_cn']).join(','));
" "$LANG_CFG"
}

EXPORT_LANGUAGES="$(resolve_export_languages)"

if [[ "${1:-}" == "--stdout" ]]; then
  echo "$EXPORT_LANGUAGES"
  exit 0
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "export_languages=${EXPORT_LANGUAGES}" >> "$GITHUB_OUTPUT"
fi
echo "Export languages: ${EXPORT_LANGUAGES}"
