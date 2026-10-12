// Файл переэкспортирует общий query-core каталога для совместимости клиентских и серверных импортов.

import {
  applyCatalogFiltersAndSortCore,
  applyProductFiltersCore,
  buildCatalogFacetsCore,
  buildCatalogFacetsForQueryCore,
  compareProductsByPrice,
  filterProductsBySearchCore,
  getSortablePrice,
  normalizeCatalogFilterQueryCore,
  normalizeSearchKey,
  normalizeSearchText,
  parseCsvNumbers,
  parseCsvParam,
  productMatchesSearchCore,
  sortProductsCore,
} from './catalogQueryCore.js';

export { compareProductsByPrice, getSortablePrice };
export {
  normalizeSearchKey,
  normalizeSearchText,
  parseCsvNumbers,
  parseCsvParam,
};

export function normalizeCatalogFilterQuery(query = {}) {
  return normalizeCatalogFilterQueryCore(query);
}

export function productMatchesSearch(product, search) {
  return productMatchesSearchCore(product, search);
}

export function filterProductsBySearch(items, search) {
  return filterProductsBySearchCore(items, search);
}

export function buildCatalogFacets(items) {
  return buildCatalogFacetsCore(items);
}

export function buildCatalogFacetsForQuery(items, query) {
  return buildCatalogFacetsForQueryCore(items, query);
}

export function applyProductFilters(items, query) {
  return applyProductFiltersCore(items, normalizeCatalogFilterQuery(query));
}

export function sortProducts(items, sortBy) {
  return sortProductsCore(items, sortBy);
}

export function applyCatalogFiltersAndSort(items, query) {
  return applyCatalogFiltersAndSortCore(items, query);
}
