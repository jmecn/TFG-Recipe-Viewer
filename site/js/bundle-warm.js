import { FALLBACK_LOCALE } from './constants.js';
import { fetchWithAssetCache, joinBase } from './http.js';
import { normalizeLocale, uiText } from './i18n.js';

/** Warm bundle.json, lang, icon index/css, and priority atlas pages (Cache API + HTTP cache). */
export async function warmBundleAssets(baseUrl, locale, onStatus) {
  onStatus?.(uiText(locale, 'bootLoadingBundle'));
  const bundleWrap = await fetchWithAssetCache(joinBase(baseUrl, 'bundle.json'));
  let bundle = {};
  try {
    bundle = await bundleWrap.response.json();
  } catch {
    bundle = {};
  }

  const activeLocale = normalizeLocale(locale || FALLBACK_LOCALE);
  const langCodes = new Set([FALLBACK_LOCALE]);
  if (activeLocale !== FALLBACK_LOCALE) langCodes.add(activeLocale);

  onStatus?.(uiText(locale, 'bootLoadingLang'));
  await Promise.all([...langCodes].map(async (code) => {
    await fetchWithAssetCache(joinBase(baseUrl, `lang/${code}.json`));
  }));

  onStatus?.(uiText(locale, 'bootLoadingIcons'));
  const indexWrap = await fetchWithAssetCache(joinBase(baseUrl, 'icons/index.json'));
  let index = null;
  try {
    index = await indexWrap.response.json();
  } catch {
    index = null;
  }
  await fetchWithAssetCache(joinBase(baseUrl, 'icons/icons.css'));
  await fetchWithAssetCache(joinBase(baseUrl, 'textures/manifest.json'));
  await Promise.all([
    fetchWithAssetCache(joinBase(baseUrl, 'textures/emi/textures/gui/background.png')),
    fetchWithAssetCache(joinBase(baseUrl, 'textures/emi/textures/gui/widgets.png')),
  ]);

  const preloadUrls = [];
  const pages = Array.isArray(index?.pages) ? index.pages : [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const sources = Array.isArray(page?.sources) && page.sources.length
      ? page.sources
      : ((page?.file || page?.src) ? [{ file: page.file || page.src }] : []);
    const file = sources[0]?.file || sources[0]?.src;
    if (!file) continue;
    if (page?.preload === true || i === 0) {
      preloadUrls.push(joinBase(baseUrl, `icons/${file}`));
    }
  }

  if (preloadUrls.length) {
    onStatus?.(uiText(locale, 'bootWarmingAtlas'));
    await Promise.all(preloadUrls.map((url) => fetchWithAssetCache(url)));
  }

  onStatus?.(uiText(locale, 'bootLoadingSearch'));
  await fetchWithAssetCache(joinBase(baseUrl, `items-lang/${activeLocale}.json`));

  const cachedHint = bundleWrap.fromCache ? uiText(locale, 'cacheHint') : '';
  onStatus?.(uiText(locale, 'bootEntering', { cachedHint }));
  return bundle;
}
