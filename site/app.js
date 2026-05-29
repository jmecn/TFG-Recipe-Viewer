/**
 * recipe-viewer: bundle-aware router + item-first browsing.
 */
(function (global) {
  'use strict';

  const { EmiRecipeRenderer, hideEmiTagPopover } = global;

  const STORAGE_LOCALE = 'emiRendererDemoLocale';
  const ITEMS_PER_PAGE = 60;
  const TAG_MEMBERS_PER_PAGE = 60;
  const ITEM_FILTER_HINT = 'Filter item id or name...';
  const DETAIL_FILTER_HINT = 'Filter recipe id...';
  const DEMO_JSON_CACHE = new Map();
  const TAG_BUCKET_ORDER = ['items', 'blocks', 'fluids'];
  const VIRTUAL_CARD_WIDTH = 340;
  const VIRTUAL_ROW_HEIGHT = 250;
  const VIRTUAL_BUFFER_ROWS = 2;

  function bundleBaseUrl(id) {
    const slug = String(id || '').trim().replace(/^\/+|\/+$/g, '');
    return global.siteUrl(`bundles/${slug}/`);
  }

  async function fetchJson(url, fallbackValue) {
    try {
      const r = await fetch(url);
      if (!r.ok) return fallbackValue;
      const contentType = String(r.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) return fallbackValue;
      return await r.json();
    } catch (e) {
      return fallbackValue;
    }
  }

  function joinBase(base, path) {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  function loadDemoJson(baseUrl, path, fallbackValue) {
    const key = joinBase(baseUrl, path);
    if (!DEMO_JSON_CACHE.has(key)) {
      DEMO_JSON_CACHE.set(key, fetch(key)
        .then(async (r) => {
          if (!r.ok) return fallbackValue;
          const contentType = String(r.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('application/json')) {
            return fallbackValue;
          }
          try {
            return await r.json();
          } catch (e) {
            return fallbackValue;
          }
        })
        .catch(() => fallbackValue));
    }
    return DEMO_JSON_CACHE.get(key);
  }

  function catalogIdFromIndexEntry(ns, path) {
    if (path.includes(':')) return path;
    return `${ns}:${path}`;
  }

  function parseItemsCatalog(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('items/index.json must be an object');
    const ids = new Set();
    for (const [ns, paths] of Object.entries(raw)) {
      if (ns === 'schema' || !Array.isArray(paths)) continue;
      for (const p of paths) {
        if (typeof p === 'string' && p.length > 0) ids.add(catalogIdFromIndexEntry(ns, p));
      }
    }
    return [...ids].sort();
  }

  function itemDetailPaths(itemId) {
    const id = canonicalItemId(itemId);
    const sep = id.indexOf(':');
    if (sep <= 0 || sep >= id.length - 1) return [];
    const paths = [
      `items/${id.slice(0, sep)}/${id.slice(sep + 1)}.json`,
      `items/fluid/${id}.json`,
    ];
    return [...new Set(paths)];
  }

  function mergeItemDetails(details) {
    const merged = { inputs: {}, outputs: {}, tags: { items: [], blocks: [], fluids: [] }, tagsInBundle: { items: [], blocks: [], fluids: [] } };
    let schema = null;
    for (const detail of details) {
      if (!detail || typeof detail !== 'object') continue;
      if (detail.schema != null) schema = detail.schema;
      for (const side of ['inputs', 'outputs']) {
        if (!detail[side] || typeof detail[side] !== 'object') continue;
        for (const [categoryId, recipeIds] of Object.entries(detail[side])) {
          if (!Array.isArray(recipeIds)) continue;
          const bucket = merged[side][categoryId] || (merged[side][categoryId] = new Set());
          for (const recipeId of recipeIds) bucket.add(recipeId);
        }
      }
      for (const bucket of TAG_BUCKET_ORDER) {
        for (const tagId of detail?.tags?.[bucket] || []) {
          if (typeof tagId === 'string' && tagId.length > 0) merged.tags[bucket].push(tagId);
        }
        for (const tagId of detail?.tagsInBundle?.[bucket] || []) {
          if (typeof tagId === 'string' && tagId.length > 0) merged.tagsInBundle[bucket].push(tagId);
        }
      }
    }
    const out = {};
    if (schema != null) out.schema = schema;
    for (const side of ['inputs', 'outputs']) {
      if (Object.keys(merged[side]).length === 0) continue;
      out[side] = {};
      for (const [categoryId, recipeIds] of Object.entries(merged[side])) {
        out[side][categoryId] = [...recipeIds].sort();
      }
    }
    for (const bucket of TAG_BUCKET_ORDER) {
      if (merged.tags[bucket].length) {
        out.tags = out.tags || { items: [], blocks: [], fluids: [] };
        out.tags[bucket] = [...new Set(merged.tags[bucket])].sort();
      }
      if (merged.tagsInBundle[bucket].length) {
        out.tagsInBundle = out.tagsInBundle || { items: [], blocks: [], fluids: [] };
        out.tagsInBundle[bucket] = [...new Set(merged.tagsInBundle[bucket])].sort();
      }
    }
    return Object.keys(out).length ? out : null;
  }

  function displayNameForId(renderer, id) {
    const bare = canonicalItemId(id);
    const langTable = renderer._activeLang?.current || null;
    const asItem = renderer.translateRegistry(id, 'item');
    if (asItem && asItem !== bare) return asItem;
    const asFluid = renderer.translateRegistry(id, 'fluid');
    if (asFluid && asFluid !== bare) return asFluid;
    if (global.GtceuTranslate?.composeRegistry) {
      const composedItem = global.GtceuTranslate.composeRegistry(
        bare,
        'item',
        (key) => renderer.translateKey(key),
        langTable,
      );
      if (composedItem) return composedItem;
      const composedFluid = global.GtceuTranslate.composeRegistry(
        bare,
        'fluid',
        (key) => renderer.translateKey(key),
        langTable,
      );
      if (composedFluid) return composedFluid;
    }
    return asFluid || bare;
  }

  function stripFormattedText(text) {
    if (EmiRecipeRenderer?.stripMinecraftFormatting) {
      return EmiRecipeRenderer.stripMinecraftFormatting(text);
    }
    if (global.MinecraftText?.strip) return global.MinecraftText.strip(text);
    return String(text ?? '').replace(/§./g, '');
  }

  function setFormattedText(el, text) {
    if (EmiRecipeRenderer?.setFormattedText) {
      EmiRecipeRenderer.setFormattedText(el, text);
      return;
    }
    if (global.MinecraftText?.apply) {
      global.MinecraftText.apply(el, text);
      return;
    }
    el.textContent = stripFormattedText(text);
  }

  function canonicalItemId(id) {
    if (!id) return id;
    let s = String(id);
    const brace = s.indexOf('{');
    if (brace >= 0) s = s.slice(0, brace);
    const at = s.indexOf('@');
    if (at >= 0) s = s.slice(0, at);
    return s;
  }

  function normalizedFilterQuery(input) {
    return String(input || '').trim().toLowerCase();
  }

  function itemDetailPath(itemId) {
    return itemDetailPaths(itemId)[0] || null;
  }

  function isEmiTagDisplayRecipe(recipeId) {
    return String(recipeId || '').startsWith('emi:/tag/');
  }

  function craftingRecipeIds(ids) {
    return (Array.isArray(ids) ? ids : []).filter((id) => !isEmiTagDisplayRecipe(id));
  }

  function emiCategoryNameKey(categoryId) {
    if (!categoryId) return 'emi.category.unknown';
    return `emi.category.${String(categoryId).replace(':', '.').replace(/\//g, '.')}`;
  }

  function parseCategoriesManifest(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.categories)) {
      return { categories: [], byId: new Map(), order: [] };
    }
    const categories = raw.categories.filter((c) => c && typeof c.id === 'string');
    categories.sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      const ap = Number.isFinite(a.priority) ? a.priority : 0;
      const bp = Number.isFinite(b.priority) ? b.priority : 0;
      if (ap !== bp) return ap - bp;
      return a.id.localeCompare(b.id);
    });
    const byId = new Map();
    const order = [];
    for (const entry of categories) {
      byId.set(entry.id, entry);
      order.push(entry.id);
    }
    return { categories, byId, order };
  }

  function sortCategoryIds(categoryIds, manifest) {
    const rank = new Map((manifest?.order || []).map((id, index) => [id, index]));
    return [...categoryIds].sort((a, b) => {
      const ai = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
      const bi = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  }

  function recipeIdsForCategory(grouped, categoryId) {
    if (!grouped || typeof grouped !== 'object' || !categoryId) return [];
    return craftingRecipeIds(grouped[categoryId]);
  }

  function filterRecipeIds(ids, query) {
    return (Array.isArray(ids) ? ids : []).filter((id) => !query || id.toLowerCase().includes(query));
  }

  function countGroupedRecipes(grouped, query) {
    if (!grouped || typeof grouped !== 'object') return 0;
    let total = 0;
    for (const categoryId of Object.keys(grouped)) {
      total += filterRecipeIds(recipeIdsForCategory(grouped, categoryId), query).length;
    }
    return total;
  }

  function visibleCategoryIds(grouped, manifest, query) {
    if (!grouped || typeof grouped !== 'object') return [];
    const ids = Object.keys(grouped).filter((categoryId) => (
      filterRecipeIds(recipeIdsForCategory(grouped, categoryId), query).length > 0
    ));
    return sortCategoryIds(ids, manifest);
  }

  function layoutPathForRecipeId(recipeId) {
    const file = String(recipeId || '').replace(/:/g, '_').replace(/\//g, '_') + '.json';
    return `recipes/layouts/${file}`;
  }

  function buildPageRange(current, total, radius = 2) {
    if (total <= 1) return [1];
    const pages = new Set([1, total]);
    for (let i = current - radius; i <= current + radius; i += 1) {
      if (i >= 1 && i <= total) pages.add(i);
    }
    const sorted = [...pages].sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const page of sorted) {
      if (prev && page - prev > 1) out.push('…');
      out.push(page);
      prev = page;
    }
    return out;
  }

  const DEV_QUERY_KEYS = ['dev', 'cdn', 'emiVersion'];

  function parseLocationQuery() {
    const params = new URLSearchParams(location.search);
    const bundleToken = params.get('bundle') || '_';
    const search = params.get('search') || '';
    const lang = params.get('lang') || null;
    const recipe = params.get('recipe');
    const tag = params.get('tag');
    const item = params.get('item');
    let view = 'items';
    let id = null;
    if (recipe) {
      view = 'recipe';
      id = recipe;
    } else if (tag) {
      view = 'tag';
      id = tag;
    } else if (item) {
      view = 'item';
      id = canonicalItemId(item);
    }
    return { bundleToken, view, id, search, lang };
  }

  function buildAppUrl(route) {
    const p = new URLSearchParams();
    const current = new URLSearchParams(location.search);
    for (const key of DEV_QUERY_KEYS) {
      const v = current.get(key);
      if (v) p.set(key, v);
    }
    if (route.bundleToken && route.bundleToken !== '_') {
      p.set('bundle', route.bundleToken);
    }
    if (route.lang) p.set('lang', route.lang);
    const search = route.search != null ? String(route.search).trim() : '';
    if (search) p.set('search', search);
    if (route.view === 'item' && route.id) p.set('item', route.id);
    else if (route.view === 'tag' && route.id) p.set('tag', route.id);
    else if (route.view === 'recipe' && route.id) p.set('recipe', route.id);
    const qs = p.toString();
    const base = global.siteBase();
    return qs ? `${base}?${qs}` : base;
  }

  class RecipeViewer {
    constructor(catalog) {
      this.catalog = catalog;
      this.bundleId = null;
      this.bundleToken = '_';
      this.baseUrl = '';
      this.locale = localStorage.getItem(STORAGE_LOCALE) || 'en_us';
      this.renderer = null;
      this.recipeIndex = null;
      this.bundle = null;
      this.itemIds = [];
      this.itemIdSet = new Set();
      this.itemDetailCache = new Map();
      this.categoriesManifest = null;
      this.itemCategorySelection = { recipes: null, uses: null };
      this.mountSession = null;
      this.filterTimer = null;
      this.itemsPage = 1;
      this.activeDetailTab = 'recipes';
      this.currentRoute = { bundleToken: '_', view: 'items', id: null, search: '', lang: null };
      this.currentItemDetail = null;
      this.currentItemId = null;
      this.detailScrollTop = { recipes: 0, uses: 0, tags: 0 };
      this.tagMembersPage = 1;
      this.tagMembersAll = [];
      this.virtual = {
        recipes: { ids: [], container: null, raf: 0 },
        uses: { ids: [], container: null, raf: 0 },
      };

      this.els = {
        main: document.querySelector('.demo-main'),
        bundleSelect: document.getElementById('bundle-select'),
        locale: document.getElementById('locale-select'),
        filter: document.getElementById('filter-input'),
        error: document.getElementById('demo-error'),
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
      this.els.main.addEventListener('scroll', () => this.scheduleVirtualUpdate());
      window.addEventListener('resize', () => this.scheduleVirtualUpdate());
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

    async ensureBundle(bundleToken) {
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
      DEMO_JSON_CACHE.clear();

      const renderer = new EmiRecipeRenderer(this.rendererOptions());
      const [recipeIndex, bundleRes, itemsRes, categoriesRes] = await Promise.all([
        renderer.loadIndex(),
        renderer.ensureBundle(),
        loadDemoJson(this.baseUrl, 'items/index.json', {}),
        loadDemoJson(this.baseUrl, 'categories/index.json', null),
      ]);
      this.renderer = renderer;
      this.recipeIndex = recipeIndex;
      this.bundle = bundleRes;
      this.itemIds = parseItemsCatalog(itemsRes);
      this.itemIdSet = new Set(this.itemIds);
      this.categoriesManifest = parseCategoriesManifest(categoriesRes);
      this.populateLocaleSelect();
      this.els.bundleSelect.value = bundleToken;
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
        const data = await loadDemoJson(this.baseUrl, `tags/${ns}/${kind}/${path}.json`, null);
        if (data && Array.isArray(data.values)) return true;
      }
      return false;
    }

    async recipeExists(recipeId) {
      if (this.renderer && this.recipeIndex) {
        try {
          await this.renderer.loadLayout(recipeId, this.recipeIndex);
          return true;
        } catch {
          // fall through to legacy per-file layouts
        }
      }
      const layout = await loadDemoJson(this.baseUrl, layoutPathForRecipeId(recipeId), null);
      return Boolean(layout && typeof layout === 'object');
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
      const langs = this.bundle?.languages || ['en_us'];
      this.els.locale.replaceChildren();
      if (!langs.includes(this.locale)) this.locale = langs[0];
      for (const code of langs) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code;
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
      await r.ensureIconStylesheets();
      await r.ensureIconIndices();
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

    async syncRouteFromLocation() {
      try {
        const route = parseLocationQuery();
        if (route.lang) {
          this.locale = route.lang;
          localStorage.setItem(STORAGE_LOCALE, this.locale);
        }
        this.els.filter.value = route.search;
        await this.ensureBundle(route.bundleToken);
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
      this.els.filter.placeholder = view === 'items' ? ITEM_FILTER_HINT : DETAIL_FILTER_HINT;
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
      localStorage.setItem(STORAGE_LOCALE, this.locale);
      this.syncQueryFromUi(true);
      await this.ensureRenderer();
      await this.syncRouteFromLocation();
    }

    filteredItemIds() {
      const q = normalizedFilterQuery(this.els.filter.value);
      if (!q) return [...this.itemIds];
      return this.itemIds.filter((id) => {
        const name = this.renderer
          ? stripFormattedText(displayNameForId(this.renderer, id)).toLowerCase()
          : '';
        return id.toLowerCase().includes(q) || name.includes(q);
      });
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
        summary: `${allIds.length} items`,
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
        const detail = await loadDemoJson(this.baseUrl, rel, null);
        if (detail && typeof detail === 'object') details.push(detail);
      }
      const merged = mergeItemDetails(details);
      if (!merged) return null;
      this.itemDetailCache.set(id, merged);
      return merged;
    }

    categoryLabel(categoryId) {
      const entry = this.categoriesManifest?.byId?.get(categoryId);
      const key = entry?.nameKey || emiCategoryNameKey(categoryId);
      const label = this.renderer?.translateKey(key);
      if (label && label !== key) return label;
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
        this.virtual[panelKey] = { ids: [], container, raf: 0 };
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
        const entry = this.categoriesManifest?.byId?.get(categoryId);
        const iconRef = entry?.iconKey || entry?.iconItem;
        if (iconRef && this.renderer) {
          this.mountIconSpan(iconWrap, this.renderer, iconRef, { atlasKey: String(iconRef).includes('@') });
        }
        const label = document.createElement('span');
        label.className = 'emi-category-tab-label';
        label.textContent = this.categoryLabel(categoryId);
        btn.title = label.textContent;
        btn.append(iconWrap, label);
        btn.addEventListener('click', () => {
          if (this.itemCategorySelection[panelKey] === categoryId) return;
          this.itemCategorySelection[panelKey] = categoryId;
          this.applyItemRecipePanel(panelKey, grouped, normalizedFilterQuery(this.els.filter.value));
          if (this.activeDetailTab === panelKey) {
            void this.updateVirtualList(panelKey);
          }
        });
        navEl.appendChild(btn);
      }

      const ids = filterRecipeIds(recipeIdsForCategory(grouped, active), query);
      this.virtual[panelKey] = { ids, container, raf: 0 };
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
      this.scheduleVirtualUpdate();
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

    async mountRecipeGrid(root) {
      if (this.mountSession?.disconnect) this.mountSession.disconnect();
      this.mountSession = null;
      if (!root.querySelector('.emi-recipe[data-recipe-id]')) return;
      this.mountSession = await EmiRecipeRenderer.mountAll({
        root,
        ...this.rendererOptions(),
        lazy: true,
        rootMargin: '300px 0px',
      });
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
      const ids = state.ids || [];
      const container = state.container;
      if (!container) return;
      if (ids.length === 0) {
        container.replaceChildren();
        return;
      }
      if (this.isDetailRecipeContainer(container)) {
        const frag = document.createDocumentFragment();
        for (const recipeId of ids) {
          frag.appendChild(this.makeRecipeCard(recipeId));
        }
        container.replaceChildren(frag);
        await this.mountRecipeGrid(container);
        return;
      }

      const mainTop = this.els.main.scrollTop;
      const containerTop = container.offsetTop;
      const viewHeight = this.els.main.clientHeight;
      const viewTop = Math.max(0, mainTop - containerTop);
      const viewBottom = viewTop + viewHeight;

      const cols = Math.max(1, Math.floor(container.clientWidth / VIRTUAL_CARD_WIDTH));
      const totalRows = Math.ceil(ids.length / cols);
      const startRow = Math.max(0, Math.floor(viewTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_BUFFER_ROWS);
      const endRow = Math.min(totalRows - 1, Math.floor(viewBottom / VIRTUAL_ROW_HEIGHT) + VIRTUAL_BUFFER_ROWS);
      const startIndex = Math.max(0, startRow * cols);
      const endIndex = Math.min(ids.length, (endRow + 1) * cols);

      const top = document.createElement('div');
      top.className = 'virtual-spacer';
      top.style.height = `${startRow * VIRTUAL_ROW_HEIGHT}px`;
      const bottom = document.createElement('div');
      bottom.className = 'virtual-spacer';
      bottom.style.height = `${Math.max(0, (totalRows - endRow - 1) * VIRTUAL_ROW_HEIGHT)}px`;

      const frag = document.createDocumentFragment();
      frag.appendChild(top);
      for (const recipeId of ids.slice(startIndex, endIndex)) {
        frag.appendChild(this.makeRecipeCard(recipeId));
      }
      frag.appendChild(bottom);
      container.replaceChildren(frag);
      await this.mountRecipeGrid(container);
    }

    async renderItemDetail(itemId) {
      const renderer = await this.ensureItemRenderer();
      const detail = await this.loadItemDetail(itemId);
      if (!detail) {
        this.goHome(true);
        return;
      }
      this.showError('');
      this.currentItemDetail = detail;
      const isNewItem = this.currentItemId !== canonicalItemId(itemId);
      this.currentItemId = canonicalItemId(itemId);
      if (isNewItem) {
        this.detailScrollTop = { recipes: 0, uses: 0, tags: 0 };
        this.itemCategorySelection = { recipes: null, uses: null };
        this.activeDetailTab = 'recipes';
      }
      const canonicalId = canonicalItemId(itemId);

      this.els.itemDetailHeader.replaceChildren();
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'item-detail-back';
      backBtn.setAttribute('aria-label', 'Back to items');
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
      backBtn.setAttribute('aria-label', 'Back to items');
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
        const data = await loadDemoJson(this.baseUrl, `tags/${ns}/${kind}/${path}.json`, null);
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
      await this.mountRecipeGrid(this.els.recipeSingle);
      const mounted = this.els.recipeSingle.querySelector('.emi-recipe[data-emi-mounted="1"]');
      this.els.recipeSingleEmpty.hidden = Boolean(mounted || this.els.recipeSingle.querySelector('.emi-recipe'));
    }
  }

  async function loadBundleCatalog() {
    const cfg = await fetchJson(global.siteUrl('bundles.json'), null);
    if (!cfg || !Array.isArray(cfg.bundles) || cfg.bundles.length === 0) {
      throw new Error('bundles.json: bundles must be a non-empty array');
    }
    return cfg;
  }

  async function bootVerifier() {
    global.normalizeSitePath?.();
    const errEl = document.getElementById('demo-error');
    try {
      const catalog = await loadBundleCatalog();
      const app = new RecipeViewer(catalog);
      await app.syncRouteFromLocation();
      global.recipeViewer = app;
      document.getElementById('tag-popover')?.addEventListener('click', (e) => {
        if (e.target.id === 'tag-popover') hideEmiTagPopover();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideEmiTagPopover();
      });
    } catch (e) {
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
})(window);
