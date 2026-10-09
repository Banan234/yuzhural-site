// Файл строит серверное хранилище каталога, нормализует товары, категории, цены и поисковые индексы.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConductorMaterial } from './catalogClassifiers.js';
import { getProductImage } from '../shared/productImages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsFile = path.resolve(
  process.env.CATALOG_PRODUCTS_FILE ||
    path.resolve(__dirname, '..', 'data', 'products.json')
);
const overridesFile = path.resolve(
  __dirname,
  '..',
  'data',
  'priceOverrides.json'
);
const catalogOverridesFile = path.resolve(
  __dirname,
  '..',
  'data',
  'catalogOverrides.json'
);
const NON_CABLE_SECTION = {
  name: 'Некабельная продукция',
  slug: 'nekabelnaya-produkciya',
};

function createEmptyCatalogOverrides() {
  return {
    hide: [],
    rename: [],
    merge: [],
    promote: [],
  };
}

function createCatalogState() {
  return {
    catalogCache: null,
    catalogCacheByCategory: null,
    catalogListCacheItems: null,
    catalogListCache: null,
    catalogListCacheByCategory: null,
    catalogCacheMtime: 0,
    catalogCacheFileSignature: '',
    catalogCacheOverridesMtime: 0,
    catalogCacheCatalogOverridesMtime: 0,
    imageOverrides: {},
    imageMatchers: [],
    catalogOverrides: createEmptyCatalogOverrides(),
  };
}

function normalizeMarkKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

async function loadImageOverrides(state, fsApi, filePath) {
  try {
    const stat = await fsApi.stat(filePath);

    if (stat.mtimeMs === state.catalogCacheOverridesMtime) {
      return { mtime: stat.mtimeMs, changed: false };
    }

    const raw = await fsApi.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const overrides = parsed?.overrides || {};
    const next = {};
    for (const [key, value] of Object.entries(overrides)) {
      if (value && typeof value.image === 'string' && value.image) {
        next[key] = value.image;
      }
    }
    state.imageOverrides = next;
    const matchers = Array.isArray(parsed?.matchers) ? parsed.matchers : [];
    state.imageMatchers = matchers
      .filter(
        (m) =>
          m && typeof m === 'object' && typeof m.image === 'string' && m.image
      )
      .map((m) => ({
        ...m,
        mark: normalizeMarkKey(m.mark),
        cores: m.cores != null ? Number(m.cores) : null,
        crossSection: m.crossSection != null ? Number(m.crossSection) : null,
        voltage: m.voltage != null ? Number(m.voltage) : null,
        image: m.image,
      }));
    return { mtime: stat.mtimeMs, changed: true };
  } catch {
    state.imageOverrides = {};
    state.imageMatchers = [];
    return { mtime: 0, changed: state.catalogCacheOverridesMtime !== 0 };
  }
}

function findImageByMatcher(rawProduct, state) {
  if (state.imageMatchers.length === 0) return null;
  const mark = normalizeMarkKey(rawProduct.mark);
  if (!mark) return null;
  const match = state.imageMatchers.find((m) => {
    if (m.mark !== mark) return false;
    return matchesCableFields(m, rawProduct);
  });
  return match ? match.image : null;
}

function matchesCableFields(matcher, product) {
  for (const field of [
    'cores',
    'groupCores',
    'crossSection',
    'groundCores',
    'groundSection',
    'voltage',
  ]) {
    if (
      matcher[field] != null &&
      Number(matcher[field]) !== Number(product[field])
    ) {
      return false;
    }
  }
  if (
    matcher.conductorConfiguration != null &&
    normalizeText(matcher.conductorConfiguration) !==
      normalizeText(product.conductorConfiguration)
  ) {
    return false;
  }
  const attributes = getAttributes(product).map((value) =>
    normalizeText(value).toLowerCase()
  );
  return (
    !Array.isArray(matcher.attributes) ||
    matcher.attributes.every((value) =>
      attributes.includes(normalizeText(value).toLowerCase())
    )
  );
}

async function loadCatalogOverrides(state, fsApi, filePath) {
  try {
    const stat = await fsApi.stat(filePath);

    if (stat.mtimeMs === state.catalogCacheCatalogOverridesMtime) {
      return { mtime: stat.mtimeMs, changed: false };
    }

    const raw = await fsApi.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    state.catalogOverrides = {
      hide: Array.isArray(parsed?.hide) ? parsed.hide : [],
      rename: Array.isArray(parsed?.rename) ? parsed.rename : [],
      merge: Array.isArray(parsed?.merge) ? parsed.merge : [],
      promote: Array.isArray(parsed?.promote) ? parsed.promote : [],
    };
    return { mtime: stat.mtimeMs, changed: true };
  } catch {
    const wasLoaded = state.catalogCacheCatalogOverridesMtime !== 0;
    state.catalogOverrides = createEmptyCatalogOverrides();
    return { mtime: 0, changed: wasLoaded };
  }
}

function matcherMatches(matcher, product) {
  if (!matcher || typeof matcher !== 'object') return false;
  if (typeof matcher.slug === 'string' && matcher.slug) {
    return product.slug === matcher.slug;
  }
  if (typeof matcher.sku === 'string' && matcher.sku) {
    return product.sku === matcher.sku;
  }
  if (typeof matcher.name === 'string' && matcher.name) {
    return product.name === matcher.name || product.fullName === matcher.name;
  }
  if (matcher.mark) {
    if (normalizeMarkKey(matcher.mark) !== normalizeMarkKey(product.mark))
      return false;
    return matchesCableFields(matcher, product);
  }
  return false;
}

function applyCatalogOverrides(products, state) {
  let items = products;

  if (state.catalogOverrides.hide.length > 0) {
    items = items.filter(
      (product) =>
        !state.catalogOverrides.hide.some((m) => matcherMatches(m, product))
    );
  }

  if (state.catalogOverrides.merge.length > 0) {
    const toRemove = new Set();
    for (const rule of state.catalogOverrides.merge) {
      if (!rule || !rule.target || !Array.isArray(rule.sources)) continue;
      const target = items.find((p) => matcherMatches(rule.target, p));
      if (!target) continue;
      for (const sourceMatcher of rule.sources) {
        for (const candidate of items) {
          if (candidate === target || toRemove.has(candidate)) continue;
          if (!matcherMatches(sourceMatcher, candidate)) continue;
          toRemove.add(candidate);
          if (rule.sumStock) {
            target.stock = (target.stock || 0) + (candidate.stock || 0);
            target.inStock = target.stock > 0;
          }
        }
      }
    }
    if (toRemove.size > 0) {
      items = items.filter((p) => !toRemove.has(p));
    }
  }

  if (state.catalogOverrides.rename.length > 0) {
    for (const rule of state.catalogOverrides.rename) {
      if (!rule || !rule.match) continue;
      for (const product of items) {
        if (!matcherMatches(rule.match, product)) continue;
        if (typeof rule.name === 'string' && rule.name) {
          product.name = rule.name;
        }
        if (typeof rule.fullName === 'string' && rule.fullName) {
          product.fullName = rule.fullName;
          product.title = rule.fullName;
        }
        if (typeof rule.shortDescription === 'string') {
          product.shortDescription = rule.shortDescription;
        }
      }
    }
  }

  if (state.catalogOverrides.promote.length > 0) {
    for (const product of items) {
      if (
        state.catalogOverrides.promote.some((m) => matcherMatches(m, product))
      ) {
        product.promoted = true;
      }
    }
  }

  return items;
}

function buildCatalogCategoryIndex(items) {
  const index = new Map();

  for (const item of items) {
    for (const key of new Set([
      item.catalogCategorySlug,
      item.catalogSectionSlug,
    ])) {
      if (!key) continue;

      const bucket = index.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        index.set(key, [item]);
      }
    }
  }

  return index;
}

function getFileSignature(stat) {
  return [stat.mtimeMs, stat.ctimeMs, stat.size, stat.ino, stat.birthtimeMs]
    .map((value) => (value == null ? '' : String(value)))
    .join(':');
}

function assignPresent(target, key, value) {
  if (value !== null && value !== undefined && value !== '') {
    target[key] = value;
  }
}

function createCatalogListProduct(product) {
  const listProduct = {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    title: product.title,
    fullName: product.fullName,
    mark: product.mark,
    category: product.category,
    catalogCategory: product.catalogCategory,
    price: product.price,
    unit: product.unit,
    stock: product.stock,
    shortDescription: product.shortDescription,
    image: product.image,
  };

  assignPresent(
    listProduct,
    'brand',
    product.manufacturer || product.catalogBrand
  );
  assignPresent(listProduct, 'cores', product.cores);
  assignPresent(listProduct, 'groupCores', product.groupCores);
  assignPresent(listProduct, 'crossSection', product.crossSection);
  assignPresent(
    listProduct,
    'conductorConfiguration',
    product.conductorConfiguration
  );
  assignPresent(listProduct, 'groundCores', product.groundCores);
  assignPresent(listProduct, 'groundSection', product.groundSection);
  if (product.attributes.length > 0) {
    listProduct.attributes = product.attributes;
  }
  assignPresent(listProduct, 'voltage', product.voltage);
  assignPresent(listProduct, 'catalogType', product.catalogType);
  assignPresent(
    listProduct,
    'catalogApplicationType',
    product.catalogApplicationType
  );

  if (getConductorMaterial(product) === 'алюминий') {
    listProduct.isAluminum = true;
  }

  return listProduct;
}

function buildCatalogListCache(items) {
  const listItems = items.map(createCatalogListProduct);
  const index = new Map();

  for (let i = 0; i < items.length; i += 1) {
    for (const key of new Set([
      items[i].catalogCategorySlug,
      items[i].catalogSectionSlug,
    ])) {
      if (!key) continue;

      const bucket = index.get(key);
      if (bucket) {
        bucket.push(listItems[i]);
      } else {
        index.set(key, [listItems[i]]);
      }
    }
  }

  return { index, listItems };
}

function ensureCatalogListCache(state, items) {
  if (items !== state.catalogCache) {
    return buildCatalogListCache(items);
  }

  if (
    state.catalogListCacheItems !== items ||
    !state.catalogListCache ||
    !state.catalogListCacheByCategory
  ) {
    const next = buildCatalogListCache(items);
    state.catalogListCacheItems = items;
    state.catalogListCache = next.listItems;
    state.catalogListCacheByCategory = next.index;
  }

  return {
    index: state.catalogListCacheByCategory,
    listItems: state.catalogListCache,
  };
}

export function createCatalogStore({
  fs: fsApi = fs,
  productsFile: productsPath = productsFile,
  overridesFile: overridesPath = overridesFile,
  catalogOverridesFile: catalogOverridesPath = catalogOverridesFile,
} = {}) {
  let state = createCatalogState();

  function reset() {
    state = createCatalogState();
  }

  function getCatalogProductListItems(items = state.catalogCache) {
    if (!items) return [];
    return ensureCatalogListCache(state, items).listItems;
  }

  function getCatalogProductListItemsByCategory(
    categorySlug,
    items = state.catalogCache
  ) {
    if (!items) return [];
    if (!categorySlug) return getCatalogProductListItems(items);

    return ensureCatalogListCache(state, items).index.get(categorySlug) || [];
  }

  function getCatalogProductsByCategory(
    categorySlug,
    items = state.catalogCache
  ) {
    if (!items) return [];
    if (!categorySlug) return items;

    const index =
      items === state.catalogCache
        ? state.catalogCacheByCategory ||
          (state.catalogCacheByCategory = buildCatalogCategoryIndex(items))
        : buildCatalogCategoryIndex(items);

    return index.get(categorySlug) || [];
  }

  async function loadCatalogProducts() {
    const [stat, overridesState, catalogOverridesState] = await Promise.all([
      fsApi.stat(productsPath),
      loadImageOverrides(state, fsApi, overridesPath),
      loadCatalogOverrides(state, fsApi, catalogOverridesPath),
    ]);
    const productsSignature = getFileSignature(stat);

    if (
      state.catalogCache &&
      productsSignature === state.catalogCacheFileSignature &&
      !overridesState.changed &&
      !catalogOverridesState.changed
    ) {
      return state.catalogCache;
    }

    const raw = await fsApi.readFile(productsPath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Файл products.json должен содержать массив товаров');
    }

    const normalized = parsed
      .filter((item) => normalizeNumber(item?.stock) > 0)
      .map((item) => normalizeCatalogProduct(item, state));
    state.catalogCache = applyCatalogOverrides(normalized, state);
    state.catalogCacheByCategory = buildCatalogCategoryIndex(
      state.catalogCache
    );
    state.catalogListCacheItems = null;
    state.catalogListCache = null;
    state.catalogListCacheByCategory = null;
    state.catalogCacheMtime = stat.mtimeMs;
    state.catalogCacheFileSignature = productsSignature;
    state.catalogCacheOverridesMtime = overridesState.mtime;
    state.catalogCacheCatalogOverridesMtime = catalogOverridesState.mtime;
    return state.catalogCache;
  }

  async function loadCatalogProductsByCategory(categorySlug) {
    const items = await loadCatalogProducts();
    return getCatalogProductsByCategory(categorySlug, items);
  }

  async function getCatalogMtime() {
    const stat = await fsApi.stat(productsPath);
    return stat.mtimeMs;
  }

  async function findProductBySlug(slug) {
    const items = await loadCatalogProducts();

    return items.find((item) => item.slug === slug) || null;
  }

  return {
    reset,
    getCatalogProductListItems,
    getCatalogProductListItemsByCategory,
    getCatalogProductsByCategory,
    loadCatalogProducts,
    loadCatalogProductsByCategory,
    getCatalogMtime,
    findProductBySlug,
  };
}

export const defaultCatalogStore = createCatalogStore();

export function getCatalogProductListItems(items) {
  return defaultCatalogStore.getCatalogProductListItems(items);
}

export function getCatalogProductListItemsByCategory(categorySlug, items) {
  return defaultCatalogStore.getCatalogProductListItemsByCategory(
    categorySlug,
    items
  );
}

export function getCatalogProductsByCategory(categorySlug, items) {
  return defaultCatalogStore.getCatalogProductsByCategory(categorySlug, items);
}

export async function loadCatalogProducts() {
  return defaultCatalogStore.loadCatalogProducts();
}

export async function loadCatalogProductsByCategory(categorySlug) {
  return defaultCatalogStore.loadCatalogProductsByCategory(categorySlug);
}

export async function getCatalogMtime() {
  return defaultCatalogStore.getCatalogMtime();
}

export async function findProductBySlug(slug) {
  return defaultCatalogStore.findProductBySlug(slug);
}

function normalizeCatalogProduct(rawProduct, state) {
  const title = normalizeText(
    rawProduct.fullName || rawProduct.name || 'Товар'
  );
  const mark = normalizeText(rawProduct.mark || title);
  const category = normalizeText(rawProduct.category || 'Без категории');
  const unit = normalizeText(rawProduct.unit || '');
  const stock = normalizeNumber(rawProduct.stock);
  const price = normalizeNumber(rawProduct.price);
  const catalogPlacement = normalizeCatalogPlacement(rawProduct);

  // Стабильные id/slug/sku приходят из productRegistry.json (см. scripts/importPrice.js).
  // Fallback на хеш используется только для legacy-данных без id (бэкап для разработки).
  const fallbackId = createStableId(`${title}|${category}|${unit}`);
  const id = Number.isFinite(rawProduct.id) ? rawProduct.id : fallbackId;
  const slugBase = slugify(title || mark);
  const fallbackSlug = slugBase
    ? `${slugBase}-${id.toString(36)}`
    : `product-${id.toString(36)}`;
  const slug =
    typeof rawProduct.slug === 'string' && rawProduct.slug
      ? rawProduct.slug
      : fallbackSlug;
  const sku =
    typeof rawProduct.sku === 'string' && rawProduct.sku
      ? rawProduct.sku
      : `YU-${String(id).padStart(7, '0').slice(-7)}`;
  const name = normalizeText(rawProduct.name || title);
  const image =
    state.imageOverrides[name] ||
    state.imageOverrides[title] ||
    findImageByMatcher(rawProduct, state) ||
    getProductImage({
      ...rawProduct,
      category,
      catalogSection: catalogPlacement.section,
      catalogSectionSlug: catalogPlacement.sectionSlug,
      catalogCategory: catalogPlacement.category,
      catalogCategorySlug: catalogPlacement.categorySlug,
    });

  return {
    id,
    slug,
    sku,
    title,
    fullName: title,
    name,
    sourceName: String(
      rawProduct.sourceName ?? rawProduct.fullName ?? rawProduct.name ?? ''
    ),
    parsingWarnings: Array.isArray(rawProduct.parsingWarnings)
      ? [...rawProduct.parsingWarnings]
      : [],
    mark,
    markFamily: normalizeText(rawProduct.markFamily || ''),
    category,
    price,
    unit,
    stock,
    shortDescription: buildShortDescription(rawProduct),
    description: buildDescription(rawProduct, category, unit, stock),
    image,
    specs: buildSpecs(rawProduct, unit, stock),
    inStock: stock > 0,
    leadTime: stock > 0 ? 'Со склада' : 'Под заказ',
    manufacturer: normalizeText(rawProduct.manufacturer || '') || null,
    catalogBrand: normalizeText(rawProduct.catalogBrand || '') || null,
    cores: rawProduct.cores ?? null,
    crossSection: rawProduct.crossSection ?? null,
    groupCores: rawProduct.groupCores ?? null,
    conductorConfiguration:
      normalizeText(rawProduct.conductorConfiguration || '') || null,
    hasGroundCore: Boolean(rawProduct.hasGroundCore),
    groundCores: rawProduct.groundCores ?? null,
    groundSection: rawProduct.groundSection ?? null,
    voltage: rawProduct.voltage ?? null,
    attributes: getAttributes(rawProduct),
    sourceCategory: normalizeText(rawProduct.sourceCategory || ''),
    catalogSection: catalogPlacement.section,
    catalogSectionSlug: catalogPlacement.sectionSlug,
    catalogCategory: catalogPlacement.category,
    catalogCategorySlug: catalogPlacement.categorySlug,
    catalogType: normalizeText(rawProduct.catalogType || ''),
    catalogApplicationType:
      normalizeText(rawProduct.catalogApplicationType || '') || null,
    cableDecoded: rawProduct.cableDecoded ?? null,
  };
}

const CABLE_SECTIONS = new Set(['Кабель и провод', 'Специальные кабели']);

function normalizeCatalogPlacement(rawProduct) {
  const section = normalizeText(rawProduct.catalogSection || 'Прочее');
  const sectionSlug = normalizeText(rawProduct.catalogSectionSlug || 'prochee');
  const category = normalizeLegacyCatalogCategory(
    normalizeText(rawProduct.catalogCategory || 'Прочее')
  );
  const categorySlug = normalizeLegacyCatalogCategorySlug(
    normalizeText(rawProduct.catalogCategorySlug || 'prochee')
  );

  if (section && !CABLE_SECTIONS.has(section)) {
    return {
      section: NON_CABLE_SECTION.name,
      sectionSlug: NON_CABLE_SECTION.slug,
      category: NON_CABLE_SECTION.name,
      categorySlug: NON_CABLE_SECTION.slug,
    };
  }

  return {
    section,
    sectionSlug,
    category,
    categorySlug,
  };
}

function normalizeLegacyCatalogCategory(value) {
  return value === 'Монтажный провод' ? 'Монтажный кабель' : value;
}

function normalizeLegacyCatalogCategorySlug(value) {
  return value === 'montazhnyy-provod' ? 'montazhnyy-kabel' : value;
}

export function buildShortDescription(rawProduct) {
  const parts = [];

  if (rawProduct.mark) {
    parts.push(normalizeText(rawProduct.mark));
  }

  const configuration = normalizeText(rawProduct.conductorConfiguration);
  if (configuration) {
    parts.push(configuration);
  } else if (rawProduct.cores && rawProduct.crossSection) {
    const main = rawProduct.groupCores
      ? `${rawProduct.cores}х(${rawProduct.groupCores}х${formatNumber(rawProduct.crossSection)})`
      : `${rawProduct.cores}х${formatNumber(rawProduct.crossSection)}`;
    const additional =
      rawProduct.groundCores && rawProduct.groundSection
        ? `+${rawProduct.groundCores}х${formatNumber(rawProduct.groundSection)}`
        : '';
    parts.push(`${main}${additional} мм2`);
  } else if (rawProduct.crossSection) {
    parts.push(`${formatNumber(rawProduct.crossSection)} мм2`);
  }

  if (getAttributes(rawProduct).length > 0) {
    parts.push(getAttributes(rawProduct).join(', '));
  }

  return parts.join(' · ') || 'Позиция из актуального прайс-листа.';
}

function buildDescription(rawProduct, category, unit, stock) {
  const fragments = [`${buildShortDescription(rawProduct)}.`];

  if (rawProduct.voltage) {
    fragments.push(
      `Номинальное напряжение: ${formatNumber(rawProduct.voltage)} кВ.`
    );
  }

  fragments.push(
    'Позиция загружена из актуального прайс-листа поставщика.',
    `Категория: ${category}.`
  );

  if (unit) {
    fragments.push(`Единица измерения: ${unit}.`);
  }

  if (stock > 0) {
    fragments.push(
      `Текущий остаток: ${formatNumber(stock)} ${unit || ''}`.trim() + '.'
    );
  } else {
    fragments.push('Текущий остаток отсутствует, возможна поставка под заказ.');
  }

  return fragments.join(' ');
}

export function buildSpecs(
  rawProduct,
  unit = rawProduct.unit,
  stock = rawProduct.stock
) {
  const specs = {};

  if (rawProduct.mark) {
    specs['Марка'] = normalizeText(rawProduct.mark);
  }

  const configuration = normalizeText(rawProduct.conductorConfiguration);
  if (configuration) {
    specs['Конфигурация жил'] = configuration;
  } else if (rawProduct.cores) {
    specs['Количество жил'] = rawProduct.groupCores
      ? `${rawProduct.cores}х${rawProduct.groupCores}`
      : String(rawProduct.cores);
  }

  if (!configuration && rawProduct.crossSection) {
    specs['Сечение жилы'] = `${formatNumber(rawProduct.crossSection)} мм2`;
  }

  if (!configuration && rawProduct.groundCores && rawProduct.groundSection) {
    specs['Доп. жила'] =
      `${rawProduct.groundCores}х${formatNumber(rawProduct.groundSection)} мм2`;
  }

  if (rawProduct.voltage) {
    specs['Напряжение'] = `${formatNumber(rawProduct.voltage)} кВ`;
  }

  if (unit) {
    specs['Ед. изм.'] = unit;
  }

  specs['Остаток'] = `${formatNumber(stock)}${unit ? ` ${unit}` : ''}`;

  const attributes = getAttributes(rawProduct);

  if (attributes.length > 0) {
    specs['Особенности'] = attributes.join(', ');
  }

  return specs;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttributes(rawProduct) {
  return Array.isArray(rawProduct.attributes) ? rawProduct.attributes : [];
}

function normalizeNumber(value) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNumber(value) {
  return Number(String(value ?? '').replace(',', '.')).toLocaleString('ru-RU', {
    maximumFractionDigits: 3,
  });
}

function fnv1a32(value, seed) {
  let hash = seed;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Двойной FNV-1a с разной солью даёт 53-битное пространство (помещается в safe integer).
// Для ~6700 позиций вероятность коллизии ≈ 2·10⁻⁹ против ~0.5% у одиночного 32-битного хеша.
function createStableId(value) {
  const high = fnv1a32(value, 2166136261);
  const low = fnv1a32(`${value}|salt`, 0x5f3759df);
  return high * 0x200000 + (low & 0x1fffff);
}

function slugify(value) {
  const transliterated = transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return transliterated;
}

function transliterate(value) {
  const map = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };

  return [...String(value || '')]
    .map((character) => {
      const lower = character.toLowerCase();
      return map[lower] ?? character;
    })
    .join('');
}
