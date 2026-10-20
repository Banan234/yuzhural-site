// Файл реализует серверные фильтры, сортировку, пагинацию и подсказки для API каталога.

import {
  buildCatalogSearchIndex,
  getCatalogSearchCorrections,
} from '../shared/catalogSearch.js';
export { buildCatalogSearchIndex, getCatalogSearchCorrections };

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
  normalizeCatalogFilterQuery,
  parseCsvNumbers,
  parseCsvParam,
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
export const CANONICAL_CATEGORY_ORDER = new Map(
  catalogCategoriesData.sections.flatMap((section) =>
    section.categories.map((category, index) => [category.slug, index])
  )
);

export function getCanonicalCategoryOrder(categorySlug) {
  return CANONICAL_CATEGORY_ORDER.get(categorySlug) ?? DEFAULT_CATALOG_ORDER;
}

export function getSearchFilteredProducts(items, search) {
  return filterProductsBySearchShared(items, search);
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
      'mark',
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

export function buildProductSuggestions(items, search, limit = 7) {
  if (typeof search !== 'string' || !search.trim()) return [];
  const matching = getSearchFilteredProducts(items, search);
  if (!matching.length) {
    return getCatalogSearchCorrections(items, search, limit).map(
      ({ query, count }) => ({
        key: `correction:${query}`,
        mark: query,
        query,
        count,
        type: 'correction',
      })
    );
  }
  const groups = new Map();
  for (const product of matching) {
    const mark = String(product.mark || '').trim();
    if (!mark) continue;
    const key = normalizeSearchKey(mark);
    if (groups.has(key)) groups.get(key).count++;
    else groups.set(key, { key, mark, count: 1 });
  }
  // Preserve every word and numeric constraint when selecting a mark suggestion.
  return [...groups.values()].slice(0, limit).map((group) => ({
    ...group,
    query: search.trim(),
    filterMark: group.mark,
  }));
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
      const definition = catalogCategoriesData.sections
        .flatMap((entry) => entry.categories)
        .find((entry) => entry.slug === categorySlug);
      section.categoryOrder.push(categorySlug);
      section.categoryMap.set(categorySlug, {
        name: item.catalogCategory,
        slug: categorySlug,
        count: 0,
        ...(definition?.subcategories?.length
          ? {
              subcategories: definition.subcategories.map((subcategory) => ({
                name: subcategory.name,
                slug: subcategory.slug,
                count: 0,
              })),
            }
          : {}),
      });
    }

    const category = section.categoryMap.get(categorySlug);
    category.count++;
    const subcategory = category.subcategories?.find(
      (entry) => entry.slug === item.catalogSubcategorySlug
    );
    if (subcategory) subcategory.count++;
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
  const facetCache = new Map();

  function reset() {
    catalogSectionsCacheItems = null;
    catalogSectionsCache = null;
    facetCache.clear();
  }

  function getCatalogQueryItems(allItems, category) {
    return resolveCatalogQueryItems(
      allItems,
      category,
      getCatalogProductsByCategory
    );
  }

  function getSearchFilteredProducts(items, search) {
    return filterProductsBySearchShared(items, search);
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
    const key = `${normalizeFacetCachePart(categorySlug)}\u0000${normalizeFacetCachePart(search)}\u0000${normalizeFacetCachePart(filters.mark)}\u0000${JSON.stringify(normalizedFilters)}`;
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
