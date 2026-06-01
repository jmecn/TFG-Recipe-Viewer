import { FALLBACK_LOCALE, UI_TEXT } from './constants.js';
import { fetchJson } from './http.js';

let activeUiText = UI_TEXT;

export function getActiveUiText() {
  return activeUiText;
}

export function normalizeLocale(locale) {
  return String(locale || FALLBACK_LOCALE).trim().toLowerCase().replace('-', '_');
}

export function uiLocale(locale) {
  const normalized = normalizeLocale(locale);
  return normalized.startsWith('zh') ? 'zh_cn' : 'en_us';
}

export function uiText(locale, key, vars = {}) {
  const lang = uiLocale(locale);
  const template = activeUiText[lang]?.[key] ?? activeUiText.en_us?.[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function deepMergeUiText(base, override) {
  const out = {};
  for (const [locale, table] of Object.entries(base || {})) {
    out[locale] = { ...(table || {}) };
  }
  for (const [locale, table] of Object.entries(override || {})) {
    if (!table || typeof table !== 'object') continue;
    out[locale] = { ...(out[locale] || {}), ...table };
  }
  return out;
}

export function normalizeLanguageConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const enabledLocales = Array.isArray(cfg.enabledLocales)
    ? cfg.enabledLocales.map((code) => normalizeLocale(code)).filter(Boolean)
    : [];
  const localeNames = {};
  if (cfg.localeNames && typeof cfg.localeNames === 'object') {
    for (const [code, label] of Object.entries(cfg.localeNames)) {
      if (typeof label === 'string' && label.trim()) {
        localeNames[normalizeLocale(code)] = label.trim();
      }
    }
  }
  const uiTextConfig = {};
  if (cfg.uiText && typeof cfg.uiText === 'object') {
    for (const [code, table] of Object.entries(cfg.uiText)) {
      if (table && typeof table === 'object') {
        uiTextConfig[normalizeLocale(code)] = table;
      }
    }
  }
  return {
    defaultLocale: normalizeLocale(cfg.defaultLocale || FALLBACK_LOCALE),
    enabledLocales,
    localeNames,
    uiText: uiTextConfig,
  };
}

export async function loadLanguageConfig() {
  const raw = await fetchJson(globalThis.siteUrl('language.json'), null);
  const cfg = normalizeLanguageConfig(raw);
  activeUiText = deepMergeUiText(UI_TEXT, cfg.uiText);
  return cfg;
}
