/**
 * RecipeViewer — item-first browsing UI.
 */
import {
  ITEMS_PER_PAGE,
  getStoredLocale,
  setStoredLocale,
  TAG_BUCKET_ORDER,
  TAG_MEMBERS_PER_PAGE,
  VIRTUAL_BUFFER_ROWS,
  VIRTUAL_CARD_WIDTH,
  VIRTUAL_MAX_WINDOW_ITEMS,
  VIRTUAL_ROW_HEIGHT,
} from './constants.js';
import { warmBundleAssets } from './bundle-warm.js';
import { Transition } from './boot-ui.js';
import {
  itemDetailPaths,
  mergeItemDetails,
  parseItemsCatalog,
} from './catalog.js';
import { vlog } from './debug.js';
import { bundleBaseUrl, bundleJsonCache, loadBundleJson } from './http.js';
import {
  normalizeLanguageConfig,
  normalizeLocale,
  uiText,
} from './i18n.js';
import {
  countGroupedRecipes,
  filterRecipeIds,
  parseCategoriesManifest,
  recipeIdsForCategory,
  recipeListKey,
  rangesOverlap,
  visibleCategoryIds,
} from './recipe-meta.js';
import { buildAppUrl, parseLocationQuery } from './routing.js';
import { offsetTopInScrollParent, scrollViewportHeight } from './scroll.js';
import {
  buildPageRange,
  canonicalItemId,
  displayNameForId,
  normalizedFilterQuery,
  setFormattedText,
  yieldToMain,
} from './util.js';

const { EmiRecipeRenderer } = globalThis;
class RecipeViewer {
  constructor(catalog, languageConfig) {
    this.catalog = catalog;
    this.languageConfig = languageConfig || normalizeLanguageConfig(null);
    this.bundleId = null;
    this.bundleToken = '_';
    this.baseUrl = '';
    this.locale = normalizeLocale(getStoredLocale() || this.languageConfig.defaultLocale || 'en_us');
    this.renderer = null;
    this.recipeIndex = null;
    this.bundle = null;
    this.itemIds = [];
    this.itemIdSet = new Set();
    this.itemDetailCache = new Map();
    this.categoriesManifest = null;
    this.itemCategorySelection = { recipes: null, uses: null };
    this.mountSessions = { recipes: null, uses: null };
    this.recipeCardPool = new Map();
    this.filterTimer = null;
    this.itemsPage = 1;
    this.activeDetailTab = 'recipes';
    this.currentRoute = { bundleToken: '_', view: 'items', id: null, search: '', lang: null };
    this.currentItemDetail = null;
    this.currentItemId = null;
    this.detailScrollTop = { recipes: 0, uses: 0, tags: 0 };
    this.tagMembersPage = 1;
    this.tagMembersAll = [];
    this.itemSearchRows = null;
    this.itemDetailLoadSeq = 0;
    this.virtual = {
      recipes: { ids: [], container: null, raf: 0, renderKey: null, visibleRange: null },
      uses: { ids: [], container: null, raf: 0, renderKey: null, visibleRange: null },
    };
    this.resizeTimer = 0;

    this.els = {
      main: document.querySelector('.app-main'),
      bundleSelect: document.getElementById('bundle-select'),
      locale: document.getElementById('locale-select'),
      filter: document.getElementById('filter-input'),
      error: document.getElementById('app-error'),
      panelItems: document.getElementById('panel-items'),
      panelItemDetail: document.getElementById('panel-item-detail'),
      panelTagDetail: document.getElementById('panel-tag-detail'),
      panelRecipeDetail: document.getElementById('panel-recipe-detail'),
      itemGrid: document.getElementById('item-grid'),
      itemPager: document.getElementById('item-pager'),
      itemDetailHeader: document.getElementById('item-detail-header'),
      detailTabRecipes: document.getElementById('detail-tab-recipes'),
      detailTabUses: document.getElementById('detail-tab-uses'),
      detailTabTags: document.getElementById('detail-tab-tags'),
      detailPanelRecipes: document.getElementById('detail-panel-recipes'),
      detailPanelUses: document.getElementById('detail-panel-uses'),
      detailPanelTags: document.getElementById('detail-panel-tags'),
      itemRecipeCategoryTabs: document.getElementById('item-recipe-category-tabs'),
      itemUsesCategoryTabs: document.getElementById('item-uses-category-tabs'),
      itemRecipes: document.getElementById('item-recipes'),
      itemUses: document.getElementById('item-uses'),
      itemTagsList: document.getElementById('item-tags-list'),
      itemRecipesEmpty: document.getElementById('item-recipes-empty'),
      itemUsesEmpty: document.getElementById('item-uses-empty'),
      itemTagsEmpty: document.getElementById('item-tags-empty'),
      backItemsFromRecipe: document.getElementById('btn-back-items-from-recipe'),
      tagDetailHeader: document.getElementById('tag-detail-header'),
      tagMembers: document.getElementById('tag-members'),
      tagMembersEmpty: document.getElementById('tag-members-empty'),
      tagPager: document.getElementById('tag-pager'),
      recipeDetailHeader: document.getElementById('recipe-detail-header'),
      recipeSingle: document.getElementById('recipe-single'),
      recipeSingleEmpty: document.getElementById('recipe-single-empty'),
    };

    this.bindEvents();
    this.applyShellI18n();
  }

  bindEvents() {
    this.populateBundleSelect();
    this.els.bundleSelect.addEventListener('change', () => {
      const next = this.els.bundleSelect.value;
      const route = { ...this.currentRoute, bundleToken: next };
      this.navigate(route);
    });
    this.els.locale.addEventListener('change', () => this.onLocaleChange());
    this.els.filter.addEventListener('input', () => {
      clearTimeout(this.filterTimer);
      this.filterTimer = setTimeout(() => this.onFilterChanged(), 150);
    });
    this.els.backItemsFromRecipe.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'items', id: null }));
    this.els.detailTabRecipes.addEventListener('click', () => this.switchDetailTab('recipes'));
    this.els.detailTabUses.addEventListener('click', () => this.switchDetailTab('uses'));
    this.els.detailTabTags.addEventListener('click', () => this.switchDetailTab('tags'));
    this.els.main.addEventListener('scroll', () => this.scheduleVirtualUpdate(), { passive: true });
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        vlog('resize', { activeTab: this.activeDetailTab });
        this.scheduleVirtualUpdate();
      }, 120);
    });
    window.addEventListener('popstate', () => void this.syncRouteFromLocation());
  }

  populateBundleSelect() {
    this.els.bundleSelect.replaceChildren();
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '_';
    defaultOpt.textContent = '_ (default)';
    this.els.bundleSelect.appendChild(defaultOpt);
    for (const id of this.catalog.bundles) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.els.bundleSelect.appendChild(opt);
    }
  }

  resolveBundle(bundleToken) {
    if (bundleToken === '_') {
      if (this.catalog.default && this.catalog.bundles.includes(this.catalog.default)) return this.catalog.default;
      return this.catalog.bundles[0];
    }
    return this.catalog.bundles.includes(bundleToken) ? bundleToken : null;
  }

  showError(msg) {
    this.els.error.hidden = !msg;
    this.els.error.textContent = msg || '';
  }

  ui(key, vars = {}) {
    return uiText(this.locale, key, vars);
  }

  applyShellI18n() {
    const siteName = document.querySelector('.site-name');
    const siteBrand = document.querySelector('.site-brand');
    const bootTitle = document.querySelector('.app-boot-title');
    const localeLabel = document.querySelector('.header-control--locale .header-control-label');
    const bundleLabel = document.querySelector('.header-control--bundle .header-control-label');

    if (siteName) siteName.textContent = this.ui('appTitle');
    if (siteBrand) siteBrand.title = this.ui('brandTitle');
    if (bootTitle) bootTitle.textContent = this.ui('appTitle');
    if (localeLabel) localeLabel.textContent = this.ui('labelLang');
    if (bundleLabel) bundleLabel.textContent = this.ui('labelBundle');

    this.els.detailTabRecipes.textContent = this.ui('tabsRecipes');
    this.els.detailTabUses.textContent = this.ui('tabsUses');
    this.els.detailTabTags.textContent = this.ui('tabsTags');
    this.els.backItemsFromRecipe.textContent = this.ui('backItemsButton');
    this.els.backItemsFromRecipe.setAttribute('aria-label', this.ui('backToItemsAria'));
    this.els.itemRecipesEmpty.textContent = this.ui('emptyRecipes');
    this.els.itemUsesEmpty.textContent = this.ui('emptyUses');
    this.els.itemTagsEmpty.textContent = this.ui('emptyTags');
    this.els.tagMembersEmpty.textContent = this.ui('emptyTagMembers');
    this.els.recipeSingleEmpty.textContent = this.ui('emptyRecipeLayout');
    this.syncFilterPlaceholder(this.currentRoute?.view || 'items');
  }

  renderPager(container, { current, total, summary, onPage }) {
    container.replaceChildren();

    if (summary) {
      const meta = document.createElement('span');
      meta.className = 'list-pager-meta';
      meta.textContent = summary;
      container.appendChild(meta);
    }

    const addButton = (label, page, opts = {}) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `list-pager-btn${opts.current ? ' is-current' : ''}`;
      btn.textContent = label;
      if (opts.current) {
        btn.disabled = true;
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.addEventListener('click', () => onPage(page));
      }
      container.appendChild(btn);
    };

    if (total <= 1) return;

    for (const entry of buildPageRange(current, total)) {
      if (entry === '…') {
        const gap = document.createElement('span');
        gap.className = 'list-pager-ellipsis';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        container.appendChild(gap);
      } else {
        addButton(String(entry), entry, { current: entry === current });
      }
    }
  }

  async ensureBundle(bundleToken, options = {}) {
    const resolved = this.resolveBundle(bundleToken);
    if (!resolved) throw new Error(`Unknown bundle: ${bundleToken}`);
    if (resolved === this.bundleId && bundleToken === this.bundleToken) return;

    this.bundleToken = bundleToken;
    this.bundleId = resolved;
    this.baseUrl = bundleBaseUrl(resolved);
    this.renderer = null;
    this.recipeIndex = null;
    this.bundle = null;
    this.itemIds = [];
    this.itemIdSet = new Set();
    this.itemDetailCache.clear();
    this.categoriesManifest = null;
    this.itemCategorySelection = { recipes: null, uses: null };
    this.recipeCardPool.clear();
    this.mountSessions = { recipes: null, uses: null };
    this.invalidateItemSearchIndex();
    bundleJsonCache.clear();

    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
    await warmBundleAssets(this.baseUrl, this.locale, onStatus);

    onStatus?.(this.ui('bootLoadingItemsIndex'));
    const renderer = new EmiRecipeRenderer(this.rendererOptions());
    const [recipeIndex, bundleRes, itemsRes, categoriesRes] = await Promise.all([
      renderer.loadIndex(),
      renderer.ensureBundle(),
      loadBundleJson(this.baseUrl, 'items/index.json', {}),
      loadBundleJson(this.baseUrl, 'categories/index.json', null),
    ]);
    onStatus?.(this.ui('bootApplyingIconStyles'));
    await Promise.all([
      renderer.ensureIconStylesheets(),
      renderer.ensureCategoryIconStylesheets?.() ?? Promise.resolve(),
    ]);
    this.renderer = renderer;
    this.recipeIndex = recipeIndex;
    this.bundle = bundleRes;
    this.itemIds = parseItemsCatalog(itemsRes);
    this.itemIdSet = new Set(this.itemIds);
    this.categoriesManifest = parseCategoriesManifest(categoriesRes);
    this.populateLocaleSelect();
    this.applyShellI18n();
    this.els.bundleSelect.value = bundleToken;
    await this.loadItemsSearchIndex();
  }

  itemExists(itemId) {
    return this.itemIdSet.has(canonicalItemId(itemId));
  }

  async tagExists(tagId) {
    const sep = String(tagId || '').indexOf(':');
    if (sep <= 0 || sep >= tagId.length - 1) return false;
    const ns = tagId.slice(0, sep);
    const path = tagId.slice(sep + 1);
    for (const kind of TAG_BUCKET_ORDER) {
      const data = await loadBundleJson(this.baseUrl, `tags/${ns}/${kind}/${path}.json`, null);
      if (data && Array.isArray(data.values)) return true;
    }
    return false;
  }

  async recipeExists(recipeId) {
    try {
      const renderer = await this.ensureRenderer();
      await renderer.loadRecipeMeta(recipeId);
      return true;
    } catch {
      return false;
    }
  }

  async routeTargetExists(view, id) {
    if (!id) return false;
    if (view === 'item') return this.itemExists(id);
    if (view === 'tag') return this.tagExists(id);
    if (view === 'recipe') return this.recipeExists(id);
    return false;
  }

  goHome(replace = true) {
    this.itemsPage = 1;
    this.navigate({
      bundleToken: this.bundleToken,
      view: 'items',
      id: null,
      search: this.els.filter.value,
      lang: this.locale,
    }, replace);
  }

  populateLocaleSelect() {
    const fromBundle = this.bundle?.languages || ['en_us'];
    const enabled = this.languageConfig?.enabledLocales || [];
    const langs = enabled.length > 0
      ? fromBundle.filter((code) => enabled.includes(normalizeLocale(code)))
      : fromBundle;
    this.els.locale.replaceChildren();
    const visibleLangs = langs.length > 0 ? langs : [this.languageConfig.defaultLocale || 'en_us'];
    if (!visibleLangs.includes(this.locale)) this.locale = visibleLangs[0];
    for (const code of visibleLangs) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = this.languageConfig?.localeNames?.[normalizeLocale(code)] || code;
      if (code === this.locale) opt.selected = true;
      this.els.locale.appendChild(opt);
    }
  }

  rendererOptions() {
    return {
      baseUrl: this.baseUrl,
      injectIconStylesheets: true,
      locale: this.locale,
      onItemClick: (itemId) => this.navigate({ ...this.currentRoute, view: 'item', id: canonicalItemId(itemId) }),
      onTagClick: (tagId) => this.navigate({ ...this.currentRoute, view: 'tag', id: tagId }),
    };
  }

  async ensureRenderer() {
    if (!this.renderer) this.renderer = new EmiRecipeRenderer(this.rendererOptions());
    this.renderer.setBaseUrl(this.baseUrl);
    this.renderer.onItemClick = this.rendererOptions().onItemClick;
    this.renderer.onTagClick = this.rendererOptions().onTagClick;
    await this.renderer.setLocale(this.locale);
    return this.renderer;
  }

  async ensureItemRenderer() {
    const r = await this.ensureRenderer();
    await Promise.all([
      r.ensureItemNameKeys?.() ?? Promise.resolve(),
      r.ensureIconStylesheets(),
      r.ensureCategoryIconStylesheets?.() ?? Promise.resolve(),
    ]);
    await r.ensureIconIndices();
    await r.ensureCategoryIconIndices?.();
    return r;
  }

  buildRouteFromUi(partial = {}) {
    return {
      bundleToken: partial.bundleToken ?? this.bundleToken,
      view: partial.view ?? this.currentRoute.view,
      id: partial.id !== undefined ? partial.id : this.currentRoute.id,
      search: partial.search !== undefined ? partial.search : this.els.filter.value,
      lang: partial.lang ?? this.locale,
    };
  }

  navigate(partial, replace = false) {
    const route = this.buildRouteFromUi(partial);
    if (route.view === 'items') route.id = null;
    if (route.view === 'item' && route.id) {
      route.search = '';
      this.els.filter.value = '';
    }
    const url = buildAppUrl(route);
    if (replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
    void this.syncRouteFromLocation();
  }

  syncQueryFromUi(replace = true) {
    const route = this.buildRouteFromUi();
    if (route.view === 'items') route.id = null;
    const url = buildAppUrl(route);
    if (replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
    this.currentRoute = { ...this.currentRoute, search: route.search, lang: route.lang };
  }

  async syncRouteFromLocation(options = {}) {
    try {
      const route = parseLocationQuery();
      if (route.lang) {
        this.locale = route.lang;
        setStoredLocale(this.locale);
      }
      this.els.filter.value = route.search;
      await this.ensureBundle(route.bundleToken, {
        onStatus: options.onStatus,
      });
      if (route.view !== 'items' && route.id) {
        const ok = await this.routeTargetExists(route.view, route.id);
        if (!ok) {
          this.showError('');
          this.goHome(true);
          return;
        }
      }
      this.currentRoute = route;
      this.syncPanels(route.view);
      this.syncFilterPlaceholder(route.view);
      if (route.view === 'items') await this.renderItems();
      else if (route.view === 'item') await this.renderItemDetail(route.id);
      else if (route.view === 'tag') await this.renderTagDetail(route.id);
      else if (route.view === 'recipe') await this.renderRecipeDetail(route.id);
      else await this.renderItems();
    } catch (e) {
      this.showError(`Failed to load route: ${e.message || e}`);
    }
  }

  syncPanels(view) {
    this.els.panelItems.hidden = view !== 'items';
    this.els.panelItemDetail.hidden = view !== 'item';
    this.els.panelTagDetail.hidden = view !== 'tag';
    this.els.panelRecipeDetail.hidden = view !== 'recipe';
  }

  syncFilterPlaceholder(view) {
    this.els.filter.placeholder = view === 'items' ? this.ui('filterItems') : this.ui('filterDetail');
  }

  onFilterChanged() {
    this.syncQueryFromUi(true);
    if (this.currentRoute.view === 'items') {
      this.itemsPage = 1;
      void this.renderItems();
    } else if (this.currentRoute.view === 'item' && this.currentItemDetail) {
      void this.renderItemDetail(this.currentRoute.id);
    }
  }

  async onLocaleChange() {
    this.locale = this.els.locale.value;
    setStoredLocale(this.locale);
    this.applyShellI18n();
    this.itemSearchRows = null;
    this.syncQueryFromUi(true);
    Transition.show(this.ui('switchingLanguage'));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      await this.ensureRenderer();
      const loaded = await this.loadItemsSearchIndex();
      if (loaded && this.currentRoute.view === 'items' && normalizedFilterQuery(this.els.filter.value)) {
        void this.renderItems();
      }
      await this.syncRouteFromLocation();
    } finally {
      Transition.hide();
    }
  }

  invalidateItemSearchIndex() {
    this.itemSearchRows = null;
  }

  async loadItemsSearchIndex() {
    if (!this.itemIds.length) {
      this.itemSearchRows = null;
      return false;
    }
    const loc = normalizeLocale(this.locale);
    const data = await loadBundleJson(this.baseUrl, `items-search/${loc}.json`, null);
    if (!data?.items?.length) {
      this.itemSearchRows = null;
      return false;
    }
    const idToHay = new Map();
    for (const row of data.items) {
      if (row?.id && row.haystack != null) {
        idToHay.set(row.id, String(row.haystack).toLowerCase());
      }
    }
    const rows = new Array(this.itemIds.length);
    for (let i = 0; i < this.itemIds.length; i++) {
      const id = this.itemIds[i];
      rows[i] = {
        id,
        haystack: idToHay.get(id) ?? id.toLowerCase(),
      };
      if (i > 0 && i % 1200 === 0) {
        await yieldToMain();
      }
    }
    this.itemSearchRows = rows;
    return true;
  }

  itemsFilterSummary(matchCount) {
    const base = this.ui('itemsCount', { count: matchCount });
    const q = normalizedFilterQuery(this.els.filter.value);
    if (!q) return base;
    if (this.itemSearchRows && this.itemSearchRows.length === this.itemIds.length) return base;
    return `${base} ${this.ui('itemsSearchMissing')}`;
  }

  filteredItemIds() {
    const q = normalizedFilterQuery(this.els.filter.value);
    if (!q) return this.itemIds;
    const rows = this.itemSearchRows;
    if (rows && rows.length === this.itemIds.length) {
      const out = [];
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].haystack.includes(q)) out.push(rows[i].id);
      }
      return out;
    }
    return this.itemIds.filter((id) => id.toLowerCase().includes(q));
  }

  createLazyIconWrap(itemId) {
    const wrap = document.createElement('div');
    wrap.className = 'item-card-icon';
    wrap.dataset.iconKey = itemId;
    return wrap;
  }

  mountIconSpan(wrap, renderer, itemId, options = {}) {
    const key = options.atlasKey ? String(itemId) : canonicalItemId(itemId);
    wrap.replaceChildren(renderer.createAtlasSpanForIconKey(key));
    const span = wrap.querySelector('.icon-atlas');
    const displayPx = options.displayPx;
    if (span && Number.isFinite(displayPx) && displayPx > 0) {
      const cell = renderer.iconAtlas?.cellSize || 32;
      const scale = displayPx / cell;
      span.style.transform = `scale(${scale})`;
      span.style.transformOrigin = 'top left';
    }
    wrap.dataset.iconMounted = '1';
  }

  buildItemCard(renderer, id) {
    const card = document.createElement('article');
    card.className = 'item-card';
    card.dataset.itemId = id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'item', id }));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.navigate({ ...this.currentRoute, view: 'item', id });
      }
    });
    const iconWrap = this.createLazyIconWrap(id);
    const text = document.createElement('div');
    text.className = 'item-card-text';
    const name = document.createElement('div');
    name.className = 'item-card-name';
    setFormattedText(name, displayNameForId(renderer, id));
    const idEl = document.createElement('div');
    idEl.className = 'item-card-id';
    idEl.textContent = id;
    text.append(name, idEl);
    card.append(iconWrap, text);
    return { card, iconWrap };
  }

  async renderItems() {
    const renderer = await this.ensureItemRenderer();
    const allIds = this.filteredItemIds();
    const totalPages = Math.max(1, Math.ceil(allIds.length / ITEMS_PER_PAGE));
    this.itemsPage = Math.min(this.itemsPage, totalPages);
    const start = (this.itemsPage - 1) * ITEMS_PER_PAGE;
    const pageIds = allIds.slice(start, start + ITEMS_PER_PAGE);

    const frag = document.createDocumentFragment();
    for (const id of pageIds) {
      const { card, iconWrap } = this.buildItemCard(renderer, id);
      this.mountIconSpan(iconWrap, renderer, canonicalItemId(iconWrap.dataset.iconKey));
      frag.appendChild(card);
    }
    this.els.itemGrid.replaceChildren(frag);
    this.renderPager(this.els.itemPager, {
      current: this.itemsPage,
      total: totalPages,
      summary: this.itemsFilterSummary(allIds.length),
      onPage: (page) => {
        this.itemsPage = page;
        void this.renderItems();
      },
    });
    this.els.main.scrollTo({ top: 0, behavior: 'auto' });
  }

  async loadItemDetail(itemId) {
    const id = canonicalItemId(itemId);
    if (this.itemDetailCache.has(id)) return this.itemDetailCache.get(id);
    const details = [];
    for (const rel of itemDetailPaths(id)) {
      const detail = await loadBundleJson(this.baseUrl, rel, null);
      if (detail && typeof detail === 'object') details.push(detail);
    }
    const merged = mergeItemDetails(details);
    if (!merged) return null;
    this.itemDetailCache.set(id, merged);
    return merged;
  }

  categoryLabel(categoryId) {
    const entry = this.categoriesManifest?.byId?.get(categoryId);
    const key = entry?.nameKey;
    if (key) {
      const label = this.renderer?.translateKey(key);
      if (label && label !== key) return label;
    }
    const path = categoryId.includes(':') ? categoryId.slice(categoryId.indexOf(':') + 1) : categoryId;
    return path
      .replace(/[/_]/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  applyItemRecipePanel(panelKey, grouped, query) {
    const navEl = panelKey === 'recipes'
      ? this.els.itemRecipeCategoryTabs
      : this.els.itemUsesCategoryTabs;
    const container = panelKey === 'recipes' ? this.els.itemRecipes : this.els.itemUses;
    const emptyEl = panelKey === 'recipes' ? this.els.itemRecipesEmpty : this.els.itemUsesEmpty;
    const categories = visibleCategoryIds(grouped, this.categoriesManifest, query);
    const total = countGroupedRecipes(grouped, query);

    emptyEl.hidden = total > 0;
    if (categories.length === 0) {
      navEl.hidden = true;
      navEl.replaceChildren();
      this.virtual[panelKey] = { ids: [], container, raf: 0, renderKey: null };
      delete container.dataset.virtualRenderKey;
      container.classList.remove('is-loading');
      container.replaceChildren();
      return;
    }

    let active = this.itemCategorySelection[panelKey];
    if (!active || !categories.includes(active)) {
      active = categories[0];
      this.itemCategorySelection[panelKey] = active;
    }

    navEl.hidden = categories.length <= 1;
    navEl.replaceChildren();
    for (const categoryId of categories) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emi-category-tab';
      if (categoryId === active) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'true');
      }
      const iconWrap = document.createElement('span');
      iconWrap.className = 'emi-category-tab-icon';
      const displaySize = 16;
      const atlasCell = this.renderer?.categoryIconAtlas?.cellSize
        || this.categoriesManifest?.iconCellSize
        || displaySize;
      iconWrap.style.width = `${displaySize}px`;
      iconWrap.style.height = `${displaySize}px`;
      iconWrap.style.flex = `0 0 ${displaySize}px`;
      const entry = this.categoriesManifest?.byId?.get(categoryId);
      if (this.renderer?.createAtlasSpanForCategoryIcon) {
        const span = this.renderer.createAtlasSpanForCategoryIcon(categoryId);
        if (atlasCell > 0 && atlasCell !== displaySize) {
          const scale = displaySize / atlasCell;
          span.style.transform = `scale(${scale})`;
          span.style.transformOrigin = 'top left';
        }
        iconWrap.appendChild(span);
      } else {
        const iconRef = entry?.iconKey || entry?.iconItem;
        if (iconRef) {
          this.mountIconSpan(iconWrap, this.renderer, iconRef, {
            atlasKey: String(iconRef).includes('@'),
            displayPx: displaySize,
          });
        }
      }
      const label = document.createElement('span');
      label.className = 'emi-category-tab-label';
      setFormattedText(label, this.categoryLabel(categoryId));
      btn.title = label.textContent;
      btn.append(iconWrap, label);
      btn.addEventListener('click', () => {
        if (this.itemCategorySelection[panelKey] === categoryId) return;
        this.itemCategorySelection[panelKey] = categoryId;
        vlog('categoryTab', { panelKey, categoryId });
        this.applyItemRecipePanel(panelKey, grouped, normalizedFilterQuery(this.els.filter.value));
        if (this.activeDetailTab === panelKey) {
          requestAnimationFrame(() => {
            void this.updateVirtualList(panelKey);
          });
        }
      });
      navEl.appendChild(btn);
    }

    const ids = filterRecipeIds(recipeIdsForCategory(grouped, active), query);
    const prev = this.virtual[panelKey];
    const idsKey = ids.join('\u0001');
    const prevIdsKey = prev?.ids?.join('\u0001');
    if (prevIdsKey === idsKey) {
      this.virtual[panelKey] = { ...prev, ids, container, raf: prev?.raf || 0 };
      vlog('applyItemRecipePanel:ids-unchanged', {
        panelKey,
        category: active,
        count: ids.length,
      });
    } else {
      this.virtual[panelKey] = { ids, container, raf: 0, renderKey: null, visibleRange: null };
      delete container.dataset.virtualRenderKey;
      if (this.mountSessions[panelKey]?.disconnect) {
        this.mountSessions[panelKey].disconnect();
        this.mountSessions[panelKey] = null;
      }
      this.detailScrollTop[panelKey] = 0;
      if (this.activeDetailTab === panelKey) {
        this.els.main.scrollTo({ top: 0, behavior: 'auto' });
      }
      vlog('applyItemRecipePanel:ids-changed', {
        panelKey,
        category: active,
        count: ids.length,
        prevCount: prev?.ids?.length ?? 0,
      });
    }
    container.classList.remove('is-loading');
  }

  clampMainScrollForContainer(container, totalRows, cols) {
    const scrollEl = this.els.main;
    const containerTop = offsetTopInScrollParent(container, scrollEl);
    const contentHeight = Math.ceil(totalRows) * VIRTUAL_ROW_HEIGHT;
    const maxScroll = Math.max(0, containerTop + contentHeight - scrollViewportHeight(scrollEl));
    if (scrollEl.scrollTop > maxScroll) {
      const from = scrollEl.scrollTop;
      scrollEl.scrollTop = maxScroll;
      vlog('clampScroll', { from, to: maxScroll, totalRows, cols });
    }
  }

  /** Hidden panels report clientWidth 0; use main width so tab switches do not reshuffle cols. */
  measureVirtualCols(container) {
    const w = container.clientWidth;
    if (w >= VIRTUAL_CARD_WIDTH * 0.5) {
      return Math.max(1, Math.floor(w / VIRTUAL_CARD_WIDTH));
    }
    const mainW = this.els.main.clientWidth;
    if (mainW > 0) {
      return Math.max(1, Math.floor((mainW - 28) / VIRTUAL_CARD_WIDTH));
    }
    return 3;
  }

  computeVirtualWindow(key) {
    const state = this.virtual[key];
    if (!state?.container) return null;
    const ids = state.ids || [];
    const container = state.container;
    if (!ids.length) return null;
    const scrollEl = this.els.main;
    const cols = this.measureVirtualCols(container);
    const totalRows = Math.ceil(ids.length / cols);
    this.clampMainScrollForContainer(container, totalRows, cols);

    const containerTop = offsetTopInScrollParent(container, scrollEl);
    const viewportHeight = scrollViewportHeight(scrollEl);
    const contentHeight = totalRows * VIRTUAL_ROW_HEIGHT;
    const maxViewTop = Math.max(0, contentHeight - viewportHeight);
    let viewTop = Math.max(0, scrollEl.scrollTop - containerTop);
    viewTop = Math.min(viewTop, maxViewTop);
    const viewBottom = Math.min(viewTop + viewportHeight, contentHeight);

    const startRow = Math.max(0, Math.floor(viewTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_BUFFER_ROWS);
    let endRow = Math.min(
      totalRows - 1,
      Math.ceil(viewBottom / VIRTUAL_ROW_HEIGHT) + VIRTUAL_BUFFER_ROWS,
    );
    const maxRowsInWindow = Math.ceil(VIRTUAL_MAX_WINDOW_ITEMS / cols) + VIRTUAL_BUFFER_ROWS * 2;
    endRow = Math.min(endRow, startRow + maxRowsInWindow - 1);

    const startIndex = Math.max(0, startRow * cols);
    let endIndex = Math.min(ids.length, (endRow + 1) * cols);
    if (endIndex - startIndex > VIRTUAL_MAX_WINDOW_ITEMS) {
      endIndex = startIndex + VIRTUAL_MAX_WINDOW_ITEMS;
      endRow = Math.ceil(endIndex / cols) - 1;
    }
    const windowIds = ids.slice(startIndex, endIndex);
    const renderKey = `${recipeListKey(ids)}:${cols}:${startIndex}:${endIndex}`;
    vlog('computeVirtualWindow', {
      key,
      scrollTop: scrollEl.scrollTop,
      containerTop,
      viewportHeight,
      clientHeight: scrollEl.clientHeight,
      viewTop,
      viewBottom,
      cols,
      totalRows,
      startRow,
      endRow,
      startIndex,
      endIndex,
      windowCount: windowIds.length,
      idsCount: ids.length,
    });
    return { container, ids, cols, totalRows, startRow, endRow, startIndex, endIndex, windowIds, renderKey };
  }

  virtualWindowMatchesDom(container, windowIds) {
    const stages = container.querySelectorAll('.recipe-card .recipe-card-stage[data-recipe-id]');
    if (stages.length !== windowIds.length) return false;
    for (let i = 0; i < windowIds.length; i += 1) {
      if (stages[i].dataset.recipeId !== windowIds[i]) return false;
    }
    return windowIds.length > 0;
  }

  ensureVirtualSpacers(container) {
    let top = container.querySelector(':scope > .virtual-spacer[data-virtual-spacer="top"]');
    if (!top) {
      top = document.createElement('div');
      top.className = 'virtual-spacer';
      top.dataset.virtualSpacer = 'top';
      container.prepend(top);
    }
    let bottom = container.querySelector(':scope > .virtual-spacer[data-virtual-spacer="bottom"]');
    if (!bottom) {
      bottom = document.createElement('div');
      bottom.className = 'virtual-spacer';
      bottom.dataset.virtualSpacer = 'bottom';
      container.appendChild(bottom);
    }
    return { top, bottom };
  }

  syncVirtualSpacers(container, startRow, endRow, totalRows) {
    const { top, bottom } = this.ensureVirtualSpacers(container);
    const topH = `${startRow * VIRTUAL_ROW_HEIGHT}px`;
    const bottomH = `${Math.max(0, (totalRows - endRow - 1) * VIRTUAL_ROW_HEIGHT)}px`;
    if (top.style.height !== topH) top.style.height = topH;
    if (bottom.style.height !== bottomH) bottom.style.height = bottomH;
  }

  collectRecipeCardsById(container) {
    const map = new Map();
    for (const card of container.querySelectorAll(':scope > .recipe-card')) {
      const id = card.querySelector('.recipe-card-stage[data-recipe-id]')?.dataset.recipeId;
      if (id) map.set(id, card);
    }
    return map;
  }

  /** Slide window: reorder in place, add/remove edge cards only (no replaceChildren). */
  patchVirtualListDom(container, win) {
    const { windowIds, startRow, endRow, totalRows } = win;
    this.syncVirtualSpacers(container, startRow, endRow, totalRows);
    const idToCard = this.collectRecipeCardsById(container);
    const wantSet = new Set(windowIds);
    for (const [id, card] of idToCard) {
      if (!wantSet.has(id)) card.remove();
    }
    const { top } = this.ensureVirtualSpacers(container);
    let anchor = top;
    for (const recipeId of windowIds) {
      let card = idToCard.get(recipeId);
      if (!card) card = this.acquireRecipeCard(recipeId);
      const next = anchor.nextElementSibling;
      if (next !== card) {
        anchor.insertAdjacentElement('afterend', card);
      }
      anchor = card;
    }
    return windowIds.filter((recipeId) => {
      const card = this.recipeCardPool.get(recipeId);
      const stage = card?.querySelector('.recipe-card-stage[data-recipe-id]');
      return !stage || stage.dataset.emiMounted !== '1';
    });
  }

  acquireRecipeCard(recipeId) {
    let card = this.recipeCardPool.get(recipeId);
    if (!card) {
      card = this.makeRecipeCard(recipeId);
      this.recipeCardPool.set(recipeId, card);
    }
    return card;
  }

  switchDetailTab(tab) {
    this.detailScrollTop[this.activeDetailTab] = this.els.main.scrollTop;
    this.activeDetailTab = tab;
    this.els.detailPanelRecipes.hidden = tab !== 'recipes';
    this.els.detailPanelUses.hidden = tab !== 'uses';
    this.els.detailPanelTags.hidden = tab !== 'tags';
    this.els.detailTabRecipes.setAttribute('aria-current', tab === 'recipes' ? 'page' : 'false');
    this.els.detailTabUses.setAttribute('aria-current', tab === 'uses' ? 'page' : 'false');
    this.els.detailTabTags.setAttribute('aria-current', tab === 'tags' ? 'page' : 'false');
    this.els.main.scrollTo({ top: this.detailScrollTop[tab] || 0, behavior: 'auto' });
    if (tab !== 'recipes' && tab !== 'uses') return;

    const tryReuseOrUpdate = () => {
      const win = this.computeVirtualWindow(tab);
      if (win && this.virtualWindowMatchesDom(win.container, win.windowIds)) {
        const state = this.virtual[tab];
        if (state) {
          state.renderKey = win.renderKey;
          state.visibleRange = { startIndex: win.startIndex, endIndex: win.endIndex };
          win.container.dataset.virtualRenderKey = win.renderKey;
        }
        this.syncVirtualSpacers(win.container, win.startRow, win.endRow, win.totalRows);
        vlog('switchDetailTab:skip', {
          tab,
          renderKey: win.renderKey,
          windowCount: win.windowIds.length,
        });
        return;
      }
      vlog('switchDetailTab:schedule', {
        tab,
        hasWin: Boolean(win),
        windowCount: win?.windowIds?.length ?? 0,
      });
      this.scheduleVirtualUpdate();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tryReuseOrUpdate);
    });
  }

  makeRecipeCard(recipeId) {
    const card = document.createElement('article');
    card.className = 'recipe-card';
    const label = document.createElement('p');
    label.className = 'recipe-card-id';
    label.textContent = recipeId;
    const stage = document.createElement('div');
    stage.className = 'emi-recipe emi-recipe-pending recipe-card-stage';
    stage.dataset.recipeId = recipeId;
    card.append(stage, label);
    return card;
  }

  isDetailRecipeContainer(container) {
    return container === this.els.itemRecipes || container === this.els.itemUses;
  }

  syncRecipeCardLabelWidths(root) {
    for (const card of root.querySelectorAll('.recipe-card')) {
      const label = card.querySelector('.recipe-card-id');
      if (!label) continue;
      label.title = label.textContent || '';
    }
  }

  async mountRecipeGrid(root, panelKey, options = {}) {
    const pending = root.querySelectorAll('.emi-recipe[data-recipe-id]:not([data-emi-mounted="1"])');
    vlog('mountRecipeGrid', {
      panelKey,
      pending: pending.length,
      incremental: Boolean(options.incremental),
    });
    if (pending.length === 0) return;
    if (this.mountSessions[panelKey]?.disconnect) {
      this.mountSessions[panelKey].disconnect();
      this.mountSessions[panelKey] = null;
    }
    if (!root.querySelector('.emi-recipe[data-recipe-id]')) return;
    this.mountSessions[panelKey] = await EmiRecipeRenderer.mountAll({
      root,
      ...this.rendererOptions(),
      lazy: true,
      observeRoot: this.els.main,
      rootMargin: '120px 0px',
    });
    if (options.incremental && this.mountSessions[panelKey]?.flush) {
      void this.mountSessions[panelKey].flush();
    }
    this.syncRecipeCardLabelWidths(root);
  }

  scheduleVirtualUpdate() {
    if (this.activeDetailTab !== 'recipes' && this.activeDetailTab !== 'uses') return;
    const state = this.virtual[this.activeDetailTab];
    if (!state?.container) return;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      void this.updateVirtualList(this.activeDetailTab).catch((e) => {
        console.warn('[recipe-viewer] virtual list update failed', e);
      });
    });
  }

  async updateVirtualList(key) {
    const state = this.virtual[key];
    if (!state?.container) return;
    const win = this.computeVirtualWindow(key);
    if (!win) {
      delete state.container.dataset.virtualRenderKey;
      state.visibleRange = null;
      if (this.mountSessions[key]?.disconnect) {
        this.mountSessions[key].disconnect();
        this.mountSessions[key] = null;
      }
      state.container.replaceChildren();
      return;
    }
    const {
      container, cols, totalRows, startRow, endRow, windowIds, renderKey,
    } = win;
    const nextRange = { startIndex: win.startIndex, endIndex: win.endIndex };

    const domRenderKey = container.dataset.virtualRenderKey || null;
    const domMatches = this.virtualWindowMatchesDom(container, windowIds);
    const canSkipByKey = (domRenderKey === renderKey || state.renderKey === renderKey) && domMatches;
    if (canSkipByKey) {
      state.renderKey = renderKey;
      state.visibleRange = nextRange;
      container.dataset.virtualRenderKey = renderKey;
      this.syncVirtualSpacers(container, startRow, endRow, totalRows);
      container.classList.remove('is-loading');
      vlog('updateVirtualList:skip', {
        key,
        renderKey,
        cols,
        windowCount: windowIds.length,
        startIndex: win.startIndex,
      });
      return;
    }

    const prevRange = state.visibleRange;
    const canPatch = prevRange
      && rangesOverlap(prevRange, nextRange)
      && container.querySelector(':scope > .recipe-card');

    if (canPatch) {
      const needsMountIds = this.patchVirtualListDom(container, win);
      state.renderKey = renderKey;
      state.visibleRange = nextRange;
      container.dataset.virtualRenderKey = renderKey;
      vlog('updateVirtualList:patch', {
        key,
        cols,
        windowCount: windowIds.length,
        needsMount: needsMountIds.length,
        prevStart: prevRange.startIndex,
        nextStart: win.startIndex,
      });
      if (needsMountIds.length > 0) {
        try {
          await this.mountRecipeGrid(container, key, { incremental: true });
          void this.waitForRecipeCardsReady(container, 10000, true);
        } catch (e) {
          console.warn('[recipe-viewer] incremental mount failed', e);
        }
      }
      return;
    }

    state.renderKey = renderKey;
    state.visibleRange = nextRange;

    const { top, bottom } = this.ensureVirtualSpacers(container);
    top.style.height = `${startRow * VIRTUAL_ROW_HEIGHT}px`;
    bottom.style.height = `${Math.max(0, (totalRows - endRow - 1) * VIRTUAL_ROW_HEIGHT)}px`;

    const frag = document.createDocumentFragment();
    frag.appendChild(top);
    for (const recipeId of windowIds) {
      frag.appendChild(this.acquireRecipeCard(recipeId));
    }
    frag.appendChild(bottom);
    const needsMountIds = windowIds.filter((recipeId) => {
      const card = this.recipeCardPool.get(recipeId);
      const stage = card?.querySelector('.recipe-card-stage[data-recipe-id]');
      return !stage || stage.dataset.emiMounted !== '1';
    });
    if (needsMountIds.length > 0) container.classList.add('is-loading');
    if (this.mountSessions[key]?.disconnect) {
      this.mountSessions[key].disconnect();
      this.mountSessions[key] = null;
    }
    container.replaceChildren(frag);
    container.dataset.virtualRenderKey = renderKey;
    vlog('updateVirtualList:rebuild', {
      key,
      renderKey,
      cols,
      containerWidth: container.clientWidth,
      windowCount: windowIds.length,
      needsMount: needsMountIds.length,
      domRenderKey,
      sampleIds: windowIds.slice(0, 3),
    });
    try {
      if (needsMountIds.length > 0) {
        await this.mountRecipeGrid(container, key);
        await this.waitForRecipeCardsReady(container, 10000);
      }
    } finally {
      container.classList.remove('is-loading');
    }
  }

  async waitForRecipeCardsReady(container, timeoutMs = 8000, onlyUnmounted = false) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const stages = onlyUnmounted
        ? [...container.querySelectorAll('.recipe-card-stage:not([data-emi-mounted="1"])')]
        : [...container.querySelectorAll('.recipe-card-stage')];
      if (stages.length === 0) return;
      let allReady = true;
      for (const stage of stages) {
        if (stage.classList.contains('emi-recipe-pending')) {
          allReady = false;
          break;
        }
        const pendingInner = stage.querySelector('.emi-recipe-pending');
        if (pendingInner) {
          allReady = false;
          break;
        }
        const images = stage.querySelectorAll('img');
        for (const img of images) {
          if (!img.complete) {
            allReady = false;
            break;
          }
        }
        if (!allReady) break;
      }
      if (allReady) return;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  async renderItemDetail(itemId) {
    const loadSeq = ++this.itemDetailLoadSeq;
    const canonicalId = canonicalItemId(itemId);
    const isNewItem = this.currentItemId !== canonicalId;
    if (isNewItem) {
      this.showItemDetailLoading(canonicalId);
    }
    const renderer = await this.ensureItemRenderer();
    if (loadSeq !== this.itemDetailLoadSeq) return;
    const detail = await this.loadItemDetail(itemId);
    if (loadSeq !== this.itemDetailLoadSeq) return;
    if (!detail) {
      this.goHome(true);
      return;
    }
    this.showError('');
    this.currentItemDetail = detail;
    this.currentItemId = canonicalId;
    if (isNewItem) {
      this.detailScrollTop = { recipes: 0, uses: 0, tags: 0 };
      this.itemCategorySelection = { recipes: null, uses: null };
      this.activeDetailTab = 'recipes';
    }

    this.els.itemDetailHeader.replaceChildren();
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'item-detail-back';
    backBtn.setAttribute('aria-label', this.ui('backToItemsAria'));
    backBtn.textContent = '←';
    backBtn.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'items', id: null }));
    const iconWrap = document.createElement('div');
    iconWrap.className = 'item-detail-icon';
    this.mountIconSpan(iconWrap, renderer, canonicalId);
    const text = document.createElement('div');
    text.className = 'item-detail-body';
    const title = document.createElement('h1');
    title.className = 'item-detail-title';
    setFormattedText(title, displayNameForId(renderer, canonicalId));
    const sub = document.createElement('p');
    sub.className = 'item-detail-id';
    sub.textContent = canonicalId;
    text.append(title, sub);
    this.els.itemDetailHeader.append(backBtn, iconWrap, text);

    const q = normalizedFilterQuery(this.els.filter.value);
    const outputsGrouped = detail.outputs && typeof detail.outputs === 'object' ? detail.outputs : {};
    const inputsGrouped = detail.inputs && typeof detail.inputs === 'object' ? detail.inputs : {};
    this.applyItemRecipePanel('recipes', outputsGrouped, q);
    this.applyItemRecipePanel('uses', inputsGrouped, q);

    const tagEntries = [];
    const seen = new Set();
    const tagsInBundle = detail?.tagsInBundle && typeof detail.tagsInBundle === 'object'
      ? detail.tagsInBundle
      : {};
    for (const bucket of TAG_BUCKET_ORDER) {
      const ids = Array.isArray(detail?.tags?.[bucket]) ? detail.tags[bucket] : [];
      for (const id of ids) {
        if (typeof id !== 'string' || seen.has(id)) continue;
        seen.add(id);
        tagEntries.push({ id, bucket });
      }
    }
    this.els.itemTagsList.replaceChildren();
    this.els.itemTagsEmpty.hidden = tagEntries.length > 0;
    for (const entry of tagEntries.sort((a, b) => a.id.localeCompare(b.id))) {
      const chip = document.createElement('a');
      chip.className = 'item-tag-chip';
      chip.textContent = entry.id;
      const bundleList = Array.isArray(tagsInBundle?.[entry.bucket]) ? tagsInBundle[entry.bucket] : [];
      const clickable = bundleList.includes(entry.id);
      if (clickable) {
        chip.href = buildAppUrl({
          bundleToken: this.bundleToken,
          view: 'tag',
          id: entry.id,
          lang: this.locale,
        });
        chip.setAttribute('aria-label', `Open tag ${entry.id}`);
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigate({ ...this.currentRoute, view: 'tag', id: entry.id });
        });
      } else {
        chip.classList.add('is-disabled');
        chip.removeAttribute('href');
        chip.setAttribute('aria-label', `Tag ${entry.id} not exported in bundle`);
      }
      this.els.itemTagsList.appendChild(chip);
    }

    this.switchDetailTab(this.activeDetailTab || 'recipes');
    if (this.activeDetailTab === 'recipes' || this.activeDetailTab === 'uses') {
      await this.updateVirtualList(this.activeDetailTab);
    }
    this.els.itemRecipes.classList.remove('is-loading');
    this.els.itemUses.classList.remove('is-loading');
  }

  showItemDetailLoading(itemId) {
    this.recipeCardPool.clear();
    this.currentItemDetail = null;
    this.currentItemId = itemId;
    this.detailScrollTop = { recipes: 0, uses: 0, tags: 0 };
    this.itemCategorySelection = { recipes: null, uses: null };
    this.activeDetailTab = 'recipes';
    this.virtual.recipes = { ids: [], container: this.els.itemRecipes, raf: 0, renderKey: null };
    this.virtual.uses = { ids: [], container: this.els.itemUses, raf: 0, renderKey: null };

    this.els.itemDetailHeader.replaceChildren();
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'item-detail-back';
    backBtn.setAttribute('aria-label', this.ui('backToItemsAria'));
    backBtn.textContent = '←';
    backBtn.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'items', id: null }));

    const text = document.createElement('div');
    text.className = 'item-detail-body';
    const title = document.createElement('h1');
    title.className = 'item-detail-title is-loading';
    title.textContent = itemId;
    const sub = document.createElement('p');
    sub.className = 'item-detail-id';
    sub.textContent = itemId;
    text.append(title, sub);
    this.els.itemDetailHeader.append(backBtn, text);

    this.els.itemRecipeCategoryTabs.hidden = true;
    this.els.itemUsesCategoryTabs.hidden = true;
    this.els.itemRecipeCategoryTabs.replaceChildren();
    this.els.itemUsesCategoryTabs.replaceChildren();
    this.els.itemRecipes.replaceChildren();
    this.els.itemUses.replaceChildren();
    this.els.itemTagsList.replaceChildren();
    this.els.itemRecipes.classList.add('is-loading');
    this.els.itemUses.classList.add('is-loading');
    this.els.itemRecipesEmpty.hidden = true;
    this.els.itemUsesEmpty.hidden = true;
    this.els.itemTagsEmpty.hidden = true;
    this.switchDetailTab('recipes');
    this.els.main.scrollTo({ top: 0, behavior: 'auto' });
  }

  async renderTagMembersPage() {
    const renderer = await this.ensureItemRenderer();
    const list = this.tagMembersAll;
    const totalPages = Math.max(1, Math.ceil(list.length / TAG_MEMBERS_PER_PAGE));
    this.tagMembersPage = Math.min(this.tagMembersPage, totalPages);
    const start = (this.tagMembersPage - 1) * TAG_MEMBERS_PER_PAGE;
    const page = list.slice(start, start + TAG_MEMBERS_PER_PAGE);
    this.els.tagMembers.replaceChildren();
    this.els.tagMembersEmpty.hidden = page.length > 0;
    this.renderPager(this.els.tagPager, {
      current: this.tagMembersPage,
      total: totalPages,
      summary: `${list.length} members`,
      onPage: (page) => {
        this.tagMembersPage = page;
        void this.renderTagMembersPage();
      },
    });
    if (page.length === 0) return;
    const frag = document.createDocumentFragment();
    for (const row of page) {
      const card = document.createElement('article');
      card.className = 'item-card';
      const iconWrap = document.createElement('div');
      iconWrap.className = 'item-card-icon';
      if (row.isItem) this.mountIconSpan(iconWrap, renderer, canonicalItemId(row.id));
      const text = document.createElement('div');
      text.className = 'item-card-text';
      const name = document.createElement('div');
      name.className = 'item-card-name';
      const rowLabel = row.isItem ? renderer.translateRegistry(row.id, 'item') : row.id;
      setFormattedText(name, rowLabel);
      const idEl = document.createElement('div');
      idEl.className = 'item-card-id';
      idEl.textContent = row.raw;
      text.append(name, idEl);
      card.append(iconWrap, text);
      if (row.isItem) {
        card.tabIndex = 0;
        card.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'item', id: row.id }));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.navigate({ ...this.currentRoute, view: 'item', id: row.id });
          }
        });
      }
      frag.appendChild(card);
    }
    this.els.tagMembers.appendChild(frag);
    this.els.main.scrollTo({ top: 0, behavior: 'auto' });
  }

  async renderTagDetail(tagId) {
    this.showError('');
    const renderer = await this.ensureItemRenderer();
    const label = renderer.translateTag(tagId);
    const hasTranslation = label !== tagId;

    this.els.tagDetailHeader.replaceChildren();
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'item-detail-back';
    backBtn.setAttribute('aria-label', this.ui('backToItemsAria'));
    backBtn.textContent = '←';
    backBtn.addEventListener('click', () => this.navigate({ ...this.currentRoute, view: 'items', id: null }));
    const text = document.createElement('div');
    text.className = 'item-detail-body';
    const title = document.createElement('h1');
    title.className = 'item-detail-title';
    setFormattedText(title, label);
    const sub = document.createElement('p');
    sub.className = 'item-detail-id';
    sub.textContent = tagId;
    sub.hidden = !hasTranslation;
    text.append(title, sub);
    this.els.tagDetailHeader.append(backBtn, text);

    const sep = tagId.indexOf(':');
    if (sep <= 0 || sep >= tagId.length - 1) {
      this.els.tagMembers.replaceChildren();
      this.els.tagMembersEmpty.hidden = false;
      return;
    }
    const ns = tagId.slice(0, sep);
    const path = tagId.slice(sep + 1);
    let members = null;
    let bucket = 'items';
    for (const kind of TAG_BUCKET_ORDER) {
      const data = await loadBundleJson(this.baseUrl, `tags/${ns}/${kind}/${path}.json`, null);
      if (data && Array.isArray(data.values)) {
        members = data.values;
        bucket = kind;
        break;
      }
    }
    const list = Array.isArray(members) ? members.filter((v) => typeof v === 'string') : [];
    this.tagMembersAll = list.map((raw) => {
      const isItem = bucket === 'items' && !raw.startsWith('#');
      return { raw, isItem, id: raw.replace(/^#/, '') };
    });
    this.tagMembersPage = 1;
    await this.renderTagMembersPage();
  }

  async renderRecipeDetail(recipeId) {
    this.showError('');
    this.els.recipeDetailHeader.textContent = `Recipe: ${recipeId}`;
    const card = this.makeRecipeCard(recipeId);
    this.els.recipeSingle.replaceChildren(card);
    await this.mountRecipeGrid(this.els.recipeSingle, 'single');
    const mounted = this.els.recipeSingle.querySelector('.emi-recipe[data-emi-mounted="1"]');
    this.els.recipeSingleEmpty.hidden = Boolean(mounted || this.els.recipeSingle.querySelector('.emi-recipe'));
  }
}

export { RecipeViewer };
