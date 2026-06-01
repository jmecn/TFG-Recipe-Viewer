export function recipeListKey(ids) {
  return (Array.isArray(ids) ? ids : []).join('\u0001');
}

export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
}

export function isEmiTagDisplayRecipe(recipeId) {
  return String(recipeId || '').startsWith('emi:/tag/');
}

export function craftingRecipeIds(ids) {
  return (Array.isArray(ids) ? ids : []).filter((id) => !isEmiTagDisplayRecipe(id));
}

export function parseCategoriesManifest(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.categories)) {
    return { categories: [], byId: new Map(), order: [], iconCellSize: 16 };
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
  const iconCellSize = Number.isFinite(raw.iconCellSize) ? raw.iconCellSize : 16;
  return { categories, byId, order, iconCellSize };
}

export function sortCategoryIds(categoryIds, manifest) {
  const rank = new Map((manifest?.order || []).map((id, index) => [id, index]));
  return [...categoryIds].sort((a, b) => {
    const ai = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
    const bi = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

export function recipeIdsForCategory(grouped, categoryId) {
  if (!grouped || typeof grouped !== 'object' || !categoryId) return [];
  return craftingRecipeIds(grouped[categoryId]);
}

export function filterRecipeIds(ids, query) {
  return (Array.isArray(ids) ? ids : []).filter((id) => !query || id.toLowerCase().includes(query));
}

export function countGroupedRecipes(grouped, query) {
  if (!grouped || typeof grouped !== 'object') return 0;
  let total = 0;
  for (const categoryId of Object.keys(grouped)) {
    total += filterRecipeIds(recipeIdsForCategory(grouped, categoryId), query).length;
  }
  return total;
}

export function visibleCategoryIds(grouped, manifest, query) {
  if (!grouped || typeof grouped !== 'object') return [];
  const ids = Object.keys(grouped).filter((categoryId) => (
    filterRecipeIds(recipeIdsForCategory(grouped, categoryId), query).length > 0
  ));
  return sortCategoryIds(ids, manifest);
}

export function layoutPathForRecipeId(recipeId) {
  const file = String(recipeId || '').replace(/:/g, '_').replace(/\//g, '_') + '.json';
  return `recipes/layouts/${file}`;
}
