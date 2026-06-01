/**
 * recipe-viewer: bundle-aware router + item-first browsing.
 */
import { loadBundleCatalog } from './bundle-catalog.js';
import { Boot } from './boot-ui.js';
import { isVirtualDebug } from './debug.js';
import { loadLanguageConfig, uiText } from './i18n.js';
import { parseLocationQuery } from './routing.js';
import { getStoredLocale } from './constants.js';
import { RecipeViewer } from './recipe-viewer.js';

const { hideEmiTagPopover } = globalThis;

async function bootVerifier() {
  globalThis.normalizeSitePath?.();
  if (isVirtualDebug()) {
    console.log('[recipe-viewer:virtual] debug enabled — add ?debug=virtual to URL');
  }
  const errEl = document.getElementById('app-error');
  Boot.ensure();
  try {
    const languageConfig = await loadLanguageConfig();
    const initialLocale = parseLocationQuery().lang
      || getStoredLocale()
      || languageConfig.defaultLocale
      || 'en_us';
    Boot.setStatus(uiText(initialLocale, 'bootReadingConfig'));
    const catalog = await loadBundleCatalog();
    const app = new RecipeViewer(catalog, languageConfig);
    await app.syncRouteFromLocation({ onStatus: (msg) => Boot.setStatus(msg) });
    globalThis.recipeViewer = app;
    Boot.finish();
    document.getElementById('tag-popover')?.addEventListener('click', (e) => {
      if (e.target.id === 'tag-popover') hideEmiTagPopover();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideEmiTagPopover();
    });
  } catch (e) {
    Boot.finish();
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = e?.message || String(e);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootVerifier, { once: true });
} else {
  void bootVerifier();
}
