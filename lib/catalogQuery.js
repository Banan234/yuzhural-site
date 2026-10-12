// Файл реализует серверные фильтры, сортировку, пагинацию и подсказки для API каталога.

import { createRequire } from 'module';
import { getCatalogProductsByCategory as getDefaultCatalogProductsByCategory } from './catalog.js';
import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from './catalogClassifiers.js';
import {
  applyCatalogFiltersAndSort as applyCatalogFiltersAndSortShared,
  applyProductFilters as applyProductFiltersShared,
  buildCatalogFacets as buildCatalogFacetsShared,
  buildCatalogFacetsForQuery as buildCatalogFacetsForQueryShared,
  filterProductsBySearch as filterProductsBySearchShared,
  normalizeSearchKey,
  normalizeSearchText,
  normalizeCatalogFilterQuery,
  parseCsvNumbers,
  parseCsvParam,
  productMatchesSearch,
  sortProducts as sortProductsShared,
} from '../shared/catalogQuery.js';

const require = createRequire(import.meta.url);
const catalogCategoriesData = require('../shared/catalogCategories.json');

export const DEFAULT_PRODUCTS_LIMIT = 24;
export const MAX_PRODUCTS_LIMIT = 96;
export const DEFAULT_FACET_CACHE_TTL_MS = 60_000;

// Реэкспорт для обратной совместимости — у потребителей catalogQuery
// исторически работал доступ к классификаторам через этот модуль.
export { getConductorMaterial, getCoreVariantLabel, getWireConstruction };
export { normalizeSearchKey, parseCsvNumbers, parseCsvParam };

const DEFAULT_CATALOG_ORDER = 9999;
export const MAX_SEARCH_INDEX_TOKEN_LENGTH = 48;
const SEARCH_INDEX_FIELDS = [
  { key: 'mark', includeCompact: true },
  { key: 'sku', includeCompact: true },
  { key: 'title', includeCompact: false },
  { key: 'fullName', includeCompact: false },
];

export const CANONICAL_CATEGORY_ORDER = new Map(
  catalogCategoriesData.sections.flatMap((section) =>
    section.categories.map((category, index) => [category.slug, index])
  )
);

export function getCanonicalCategoryOrder(categorySlug) {
  return CANONICAL_CATEGORY_ORDER.get(categorySlug) ?? DEFAULT_CATALOG_ORDER;
}

function getSearchTokens(value) {
  return normalizeSearchText(value)
    .split(/[^0-9a-zа-я]+/)
    .map(normalizeSearchKey)
    .filter(Boolean);
}

function boundSearchToken(token) {
  if (!token) return '';
  return String(token).slice(0, MAX_SEARCH_INDEX_TOKEN_LENGTH);
}

function addSearchToken(tokenMap, token, product) {
  if (!token) return;

  let bucket = tokenMap.get(token);
  if (!bucket) {
    bucket = new Set();
    tokenMap.set(token, bucket);
  }
  bucket.add(product);
}

function addSearchTokenPrefixes(tokenMap, token, product) {
  const boundedToken = boundSearchToken(token);
  const maxLength = boundedToken.length;
  for (let length = 1; length <= maxLength; length += 1) {
    addSearchToken(tokenMap, boundedToken.slice(0, length), product);
  }
}

function getSearchFieldTokens(value, { includeCompact = false } = {}) {
  const tokens = new Set(
    getSearchTokens(value)
      .map((token) => boundSearchToken(token))
      .filter(Boolean)
  );
  if (includeCompact) {
    const compact = boundSearchToken(normalizeSearchKey(value));
    if (compact) tokens.add(compact);
  }

  return tokens;
}

function addSearchField(tokenMap, product, value, options) {
  const tokens = getSearchFieldTokens(value, options);
  for (const token of tokens) {
    addSearchTokenPrefixes(tokenMap, token, product);
  }
}

export function buildCatalogSearchIndex(items) {
  const tokenSets = new Map();
  const itemOrder = new Map();

  for (let index = 0; index < items.length; index += 1) {
    const product = items[index];
    itemOrder.set(product, index);

    for (const field of SEARCH_INDEX_FIELDS) {
      addSearchField(tokenSets, product, product[field.key], field);
    }
  }

  return {
    itemOrder,
    tokenMap: new Map(
      [...tokenSets.entries()].map(([token, products]) => [
        token,
        [...products],
      ])
    ),
  };
}

function intersectCandidateBuckets(buckets) {
  if (buckets.length === 0) return [];

  const [smallest, ...rest] = [...buckets].sort((a, b) => a.length - b.length);
  if (rest.length === 0) return smallest;

  const restSets = rest.map((bucket) => new Set(bucket));
  return smallest.filter((product) =>
    restSets.every((set) => set.has(product))
  );
}

function orderSearchCandidates(candidates, itemOrder) {
  return [...new Set(candidates)].sort(
    (a, b) => itemOrder.get(a) - itemOrder.get(b)
  );
}

function filterProductsWithSearchIndex(items, search, searchIndex) {
  const query = String(search || '').trim();
  if (!query) return items;

  const normalizedSearch = normalizeSearchKey(query);
  if (!normalizedSearch) return items;

  const boundedNormalizedSearch = boundSearchToken(normalizedSearch);
  const exactCandidates = searchIndex.tokenMap.get(boundedNormalizedSearch);
  if (exactCandidates) {
    return exactCandidates.filter((product) =>
      productMatchesSearch(product, query)
    );
  }

  const tokens = [
    ...new Set(
      getSearchTokens(query)
        .map((token) => boundSearchToken(token))
        .filter(Boolean)
    ),
  ];
  const buckets = tokens
    .map((token) => searchIndex.tokenMap.get(token))
    .filter(Boolean);

  if (buckets.length === tokens.length && buckets.length > 0) {
    return orderSearchCandidates(
      intersectCandidateBuckets(buckets),
      searchIndex.itemOrder
    ).filter((product) => productMatchesSearch(product, query));
  }

  // Prefix index stays compact on purpose. When a query falls outside indexed
  // prefixes, keep legacy substring behavior by scanning the original slice.
  return filterProductsBySearchShared(items, query);
}

export function getSearchFilteredProducts(items, search) {
  if (!String(search || '').trim()) return items;

  return filterProductsWithSearchIndex(
    items,
    search,
    buildCatalogSearchIndex(items)
  );
}

export function buildCatalogFacets(items) {
  return buildCatalogFacetsShared(items);
}

export function buildCatalogFacetsForQuery(items, query) {
  return buildCatalogFacetsForQueryShared(items, query);
}

function normalizeFacetCachePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function applyProductFilters(items, query) {
  return applyProductFiltersShared(items, query);
}

export function sortProducts(items, sortBy) {
  return sortProductsShared(items, sortBy);
}

export function applyCatalogFiltersAndSort(items, query) {
  return applyCatalogFiltersAndSortShared(items, query);
}

export function parsePage(value) {
  const page = Number(value);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function parseLimit(value, fallback, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function resolveCatalogQueryItems(
  allItems,
  category,
  getCatalogProductsByCategory
) {
  const categoryValue = typeof category === 'string' ? category.trim() : '';
  if (!categoryValue || categoryValue === 'Все') return allItems;

  const bySlug = getCatalogProductsByCategory(categoryValue, allItems);
  if (bySlug.length > 0 || CANONICAL_CATEGORY_ORDER.has(categoryValue)) {
    return bySlug;
  }

  return allItems.filter(
    (item) =>
      item.catalogCategory === categoryValue || item.category === categoryValue
  );
}

export function hasProductFilters(query) {
  return (
    [
      'search',
      'priceMin',
      'priceMax',
      'material',
      'construction',
      'cores',
      'section',
      'voltage',
      'appType',
      'powerGroup',
      'spe',
    ].some((key) => typeof query[key] === 'string' && query[key].trim()) ||
    (typeof query.sort === 'string' &&
      query.sort.trim() &&
      query.sort !== 'default')
  );
}

export function buildProductSuggestions(items, search, limit) {
  const normalizedSearch = normalizeSearchKey(search);
  if (!normalizedSearch) return [];

  const markMap = new Map();

  for (const product of items) {
    const mark = String(product.mark || '').trim();
    if (!mark) continue;

    const key = normalizeSearchKey(mark);
    if (!key || !key.startsWith(normalizedSearch)) continue;

    const current = markMap.get(key);
    if (current) {
      current.count += 1;
    } else {
      markMap.set(key, { key, mark, count: 1 });
    }
  }

  return [...markMap.values()]
    .sort((a, b) => {
      const exactDiff =
        Number(b.key === normalizedSearch) - Number(a.key === normalizedSearch);
      if (exactDiff !== 0) return exactDiff;
      return b.count - a.count || a.mark.localeCompare(b.mark, 'ru');
    })
    .slice(0, limit);
}

function buildCatalogSections(items) {
  const sectionOrder = [];
  const sectionMap = new Map();

  for (const item of items) {
    const sectionSlug = item.catalogSectionSlug;
    const categorySlug = item.catalogCategorySlug;

    if (!sectionSlug || !categorySlug) {
      continue;
    }

    if (!sectionMap.has(sectionSlug)) {
      sectionOrder.push(sectionSlug);
      sectionMap.set(sectionSlug, {
        name: item.catalogSection,
        slug: sectionSlug,
        categoryOrder: [],
        categoryMap: new Map(),
      });
    }

    const section = sectionMap.get(sectionSlug);

    if (!section.categoryMap.has(categorySlug)) {
      section.categoryOrder.push(categorySlug);
      section.categoryMap.set(categorySlug, {
        name: item.catalogCategory,
        slug: categorySlug,
        count: 0,
      });
    }

    section.categoryMap.get(categorySlug).count++;
  }

  return sectionOrder.map((sectionSlug) => {
    const section = sectionMap.get(sectionSlug);
    const categories = section.categoryOrder
      .map((categorySlug) => section.categoryMap.get(categorySlug))
      .sort(
        (a, b) =>
          getCanonicalCategoryOrder(a.slug) - getCanonicalCategoryOrder(b.slug)
      );

    return {
      name: section.name,
      slug: section.slug,
      categories,
    };
  });
}

export function createCatalogQueryStore({
  getCatalogProductsByCategory = getDefaultCatalogProductsByCategory,
  facetCacheTtlMs = DEFAULT_FACET_CACHE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  let catalogSectionsCacheItems = null;
  let catalogSectionsCache = null;
  let catalogSearchIndexItems = null;
  let catalogSearchIndex = null;
  const facetCache = new Map();

  function reset() {
    catalogSectionsCacheItems = null;
    catalogSectionsCache = null;
    catalogSearchIndexItems = null;
    catalogSearchIndex = null;
    facetCache.clear();
  }

  function getCatalogQueryItems(allItems, category) {
    return resolveCatalogQueryItems(
      allItems,
      category,
      getCatalogProductsByCategory
    );
  }

  function getSearchIndex(items) {
    if (catalogSearchIndexItems !== items || !catalogSearchIndex) {
      catalogSearchIndexItems = items;
      catalogSearchIndex = buildCatalogSearchIndex(items);
    }

    return catalogSearchIndex;
  }

  function getSearchFilteredProducts(items, search) {
    if (!String(search || '').trim()) return items;

    return filterProductsWithSearchIndex(items, search, getSearchIndex(items));
  }

  function getCatalogFacets(
    items,
    { categorySlug = '', search = '', catalogItems = null, filters = {} } = {}
  ) {
    if (!Number.isFinite(facetCacheTtlMs) || facetCacheTtlMs <= 0) {
      return buildCatalogFacetsForQuery(items, filters);
    }

    const timestamp = now();
    const normalizedFilters = normalizeCatalogFilterQuery(filters);
    normalizedFilters.sortBy = 'default';
    normalizedFilters.search = '';
    const key = `${normalizeFacetCachePart(categorySlug)}\u0000${normalizeFacetCachePart(search)}\u0000${JSON.stringify(normalizedFilters)}`;
    const entry = facetCache.get(key);

    if (
      entry &&
      entry.expiresAt > timestamp &&
      entry.catalogItems === catalogItems
    ) {
      return entry.facets;
    }

    const facets = buildCatalogFacetsForQuery(items, filters);
    facetCache.set(key, {
      catalogItems,
      expiresAt: timestamp + facetCacheTtlMs,
      facets,
    });

    return facets;
  }

  function getCatalogSections(items) {
    if (catalogSectionsCacheItems === items && catalogSectionsCache) {
      return catalogSectionsCache;
    }

    catalogSectionsCacheItems = items;
    catalogSectionsCache = buildCatalogSections(items);
    return catalogSectionsCache;
  }

  return {
    reset,
    getCatalogQueryItems,
    getSearchFilteredProducts,
    getCatalogFacets,
    getCatalogSections,
  };
}

export const defaultCatalogQueryStore = createCatalogQueryStore();

export function getCatalogQueryItems(allItems, category) {
  return defaultCatalogQueryStore.getCatalogQueryItems(allItems, category);
}

export function getCatalogSearchFilteredProducts(items, search) {
  return defaultCatalogQueryStore.getSearchFilteredProducts(items, search);
}

export function getCatalogFacets(items, options) {
  return defaultCatalogQueryStore.getCatalogFacets(items, options);
}

export function getCatalogSections(items) {
  return defaultCatalogQueryStore.getCatalogSections(items);
}
