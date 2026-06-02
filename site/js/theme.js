import { getStoredTheme, setStoredTheme, THEME_STORAGE_KEY } from './constants.js';
import { uiText } from './i18n.js';

function systemPrefersDark() {
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
}

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

export function getActiveTheme() {
  return normalizeTheme(document.documentElement?.dataset?.theme) || (systemPrefersDark() ? 'dark' : 'light');
}

export function applyTheme(theme) {
  const value = normalizeTheme(theme) || (systemPrefersDark() ? 'dark' : 'light');
  document.documentElement.dataset.theme = value;
  return value;
}

function setIconVisibility(root, activeTheme) {
  const lightIcon = root.querySelector('[data-theme-icon="light"]');
  const darkIcon = root.querySelector('[data-theme-icon="dark"]');
  if (lightIcon) lightIcon.hidden = activeTheme !== 'light';
  if (darkIcon) darkIcon.hidden = activeTheme !== 'dark';
}

export function initThemeToggle(locale = 'en_us') {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const stored = getStoredTheme();
  const active = applyTheme(stored || getActiveTheme());
  btn.setAttribute('aria-label', uiText(locale, 'labelTheme'));
  setIconVisibility(btn, active);

  btn.addEventListener('click', () => {
    const next = getActiveTheme() === 'dark' ? 'light' : 'dark';
    setStoredTheme(next);
    applyTheme(next);
    setIconVisibility(btn, next);
  });

  // Follow system only when user hasn't overridden.
  const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (media && !stored) {
    const handler = () => {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      const next = systemPrefersDark() ? 'dark' : 'light';
      applyTheme(next);
      setIconVisibility(btn, next);
    };
    try {
      media.addEventListener('change', handler);
    } catch {
      media.addListener?.(handler);
    }
  }
}

