// Файл инкапсулирует клиентские запросы к API товаров, категорий, подсказок и лид-форм.

import { messages } from '../../shared/messages.js';
import { expectOkApiJson } from './apiResponse.js';

async function fetchJson(url, signal, fallbackMessage) {
  const response = await fetch(url, { signal });
  return expectOkApiJson(response, fallbackMessage);
}

export function fetchProducts(signal, options = {}) {
  const params = new URLSearchParams();
  for (const key of [
    'category',
    'search',
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
    'sort',
    'page',
    'limit',
  ]) {
    if (
      options[key] !== undefined &&
      options[key] !== null &&
      options[key] !== ''
    ) {
      params.set(key, String(options[key]));
    }
  }
  const query = params.toString();
  const url = query ? `/api/products?${query}` : '/api/products';
  return fetchJson(url, signal, messages.errors.productApi.catalogLoadFailed);
}

export async function fetchFeaturedProducts(limit, signal) {
  const result = await fetchJson(
    `/api/products/featured?limit=${limit}`,
    signal,
    messages.errors.productApi.productsLoadFailed
  );

  return result.items;
}

export async function fetchRelatedProducts(slug, limit, signal) {
  const result = await fetchJson(
    `/api/products/${slug}/related?limit=${limit}`,
    signal,
    messages.errors.productApi.relatedProductsLoadFailed
  );

  return result.items;
}

export async function fetchProductSuggestions(search, limit, signal) {
  const params = new URLSearchParams();
  params.set('search', search);
  params.set('limit', String(limit));
  const result = await fetchJson(
    `/api/products/suggestions?${params.toString()}`,
    signal,
    messages.errors.productApi.suggestionsLoadFailed
  );

  return result.items;
}

export async function fetchProductBySlug(slug, signal) {
  const result = await fetchJson(
    `/api/products/${slug}`,
    signal,
    messages.errors.productApi.productLoadFailed
  );

  return result.item;
}
