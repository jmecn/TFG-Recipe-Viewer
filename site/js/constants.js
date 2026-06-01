/** Shared constants for recipe-viewer site. */

export const LOCALE_STORAGE_KEY = 'recipeViewerLocale';
const LEGACY_LOCALE_STORAGE_KEY = 'emiRendererDemoLocale';

export function getStoredLocale() {
  return localStorage.getItem(LOCALE_STORAGE_KEY)
    || localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
}

export function setStoredLocale(locale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
export const ITEMS_PER_PAGE = 60;
export const TAG_MEMBERS_PER_PAGE = 60;

export const TAG_BUCKET_ORDER = ['items', 'blocks', 'fluids'];

export const VIRTUAL_CARD_WIDTH = 340;
/** Estimated row height for virtual list spacers (GTCEu cards are often taller than 200px). */
export const VIRTUAL_ROW_HEIGHT = 260;
export const VIRTUAL_BUFFER_ROWS = 2;
/** Safety cap when viewport measurement is still wrong. */
export const VIRTUAL_MAX_WINDOW_ITEMS = 48;

export const ASSET_CACHE = 'tfg-recipe-viewer-v1';
export const FALLBACK_LOCALE = 'en_us';

export const DEV_QUERY_KEYS = ['dev', 'profile'];
export const DEV_PROFILE_BUNDLE_ID = 'dev-local';

export const UI_TEXT = {
  en_us: {
    appTitle: 'Recipe Viewer',
    brandTitle: 'Recipe Viewer home',
    labelLang: 'lang:',
    labelBundle: 'bundle:',
    tabsRecipes: 'Recipes',
    tabsUses: 'Uses',
    tabsTags: 'Tags',
    backToItemsAria: 'Back to items',
    backItemsButton: '← Items',
    filterItems: 'Filter item id or name...',
    filterDetail: 'Filter recipe id...',
    itemsCount: '{count} items',
    itemsSearchMissing: '(id only; items-search missing — re-export bundle)',
    emptyRecipes: 'No recipes produce this item.',
    emptyUses: 'No recipes use this item as input.',
    emptyTags: 'No tags for this item.',
    emptyTagMembers: 'No members found for this tag.',
    emptyRecipeLayout: 'Recipe layout not found.',
    bootStarting: 'Starting...',
    bootReadingConfig: 'Loading site config...',
    bootLoadingBundle: 'Loading bundle...',
    bootLoadingLang: 'Loading languages...',
    bootLoadingIcons: 'Loading icons...',
    bootWarmingAtlas: 'Warming icon atlases...',
    bootLoadingSearch: 'Loading item search index...',
    bootEntering: 'Entering...{cachedHint}',
    bootLoadingItemsIndex: 'Loading items index...',
    bootApplyingIconStyles: 'Applying icon styles...',
    switchingLanguage: 'Switching language...',
    cacheHint: ' (cached)',
  },
  zh_cn: {
    appTitle: '配方浏览器',
    brandTitle: '配方浏览器首页',
    labelLang: '语言：',
    labelBundle: '包：',
    tabsRecipes: '配方',
    tabsUses: '用途',
    tabsTags: '标签',
    backToItemsAria: '返回物品列表',
    backItemsButton: '← 物品',
    filterItems: '按物品 ID 或名称筛选…',
    filterDetail: '按配方 ID 筛选…',
    itemsCount: '{count} 个物品',
    itemsSearchMissing: '（仅按 id；缺少 items-search，请重新导出 bundle）',
    emptyRecipes: '没有配方产出该物品。',
    emptyUses: '没有配方将该物品作为输入。',
    emptyTags: '该物品没有标签。',
    emptyTagMembers: '该标签暂无成员。',
    emptyRecipeLayout: '未找到该配方布局。',
    bootStarting: '正在启动…',
    bootReadingConfig: '正在读取站点配置…',
    bootLoadingBundle: '正在加载 bundle…',
    bootLoadingLang: '正在加载语言…',
    bootLoadingIcons: '正在加载图标…',
    bootWarmingAtlas: '正在预热图标图集…',
    bootLoadingSearch: '正在加载物品搜索索引…',
    bootEntering: '正在进入…{cachedHint}',
    bootLoadingItemsIndex: '正在加载物品索引…',
    bootApplyingIconStyles: '正在应用图标样式…',
    switchingLanguage: '正在切换语言…',
    cacheHint: '（已缓存）',
  },
};
