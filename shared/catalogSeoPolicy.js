import { DEFAULT_CATALOG_PAGE_SIZE } from './catalogPagination.js';
// Indexable pages use the same page size as the default catalog view.
export const CATALOG_SEO_PAGE_SIZE = DEFAULT_CATALOG_PAGE_SIZE;
export const CATALOG_QUERY_FILTERS = [
  'search',
  'category',
  'mark',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
  'powerGroup',
  'appType',
  'spe',
];
const SEMANTIC_KEYS = new Set([
  ...CATALOG_QUERY_FILTERS,
  'page',
  'sort',
  'limit',
]);
const isTrackingKey = (key) =>
  /^(?:utm_[a-z0-9_]+|gclid|yclid|_openstat|from)$/.test(key);
export function catalogSeoPolicy(
  pathname,
  params = new URLSearchParams(),
  rawSearch = params.toString()
) {
  const pageValue = params.get('page');
  const validPage = pageValue === null || /^[1-9]\d*$/.test(pageValue);
  const page = pageValue === null ? 1 : Number(pageValue);
  const invalidPage = !validPage || !Number.isSafeInteger(page);
  const noindex =
    rawSearch
      .replace(/^\?/, '')
      .split('&')
      .filter(Boolean)
      .some((part) => {
        const key = part.split('=')[0];
        return !SEMANTIC_KEYS.has(key) && !isTrackingKey(key);
      }) ||
    CATALOG_QUERY_FILTERS.some((key) => params.has(key)) ||
    (params.has('sort') && params.get('sort') !== 'default') ||
    (params.has('limit') &&
      params.get('limit') !== String(CATALOG_SEO_PAGE_SIZE)) ||
    [...new Set(params.keys())].some((key) => params.getAll(key).length > 1);
  const base = pathname.replace(/\/+$/, '') || '/catalog';
  const canonicalBase = base === '/catalog' ? '/catalog/' : base;
  return {
    page,
    invalidPage,
    noindex,
    canonical:
      noindex || invalidPage
        ? false
        : canonicalBase + (page > 1 ? `?page=${page}` : ''),
  };
}
