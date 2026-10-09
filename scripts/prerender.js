// Файл рендерит build-time HTML для статических страниц и важных карточек товаров с SEO-метаданными.

// Build-time prerender для статических страниц и карточек товаров.
// Запускается после `vite build && vite build --ssr src/entry-server.jsx`
// и пишет в dist/<route>/index.html HTML-шаблоны с заполненным <head>
// (title, meta, OG, Twitter, JSON-LD) и настоящей React-разметкой в #root.
// Клиентский entry затем делает hydrateRoot(...), поэтому стартовая геометрия
// страницы не меняется из-за замены SEO-shell на приложение.
// Build-time карточки товара пишутся плоско в dist/product/<slug>.html и
// ограничиваются важным набором SKU, чтобы не раздувать web-образ тысячами
// HTML-файлов. Длинный хвост остаётся в sitemap и обслуживается runtime
// product-prerender из volume или SPA/static fallback.
//
// Запуск: node scripts/prerender.js
// Зависит от: dist/index.html (из vite build), data/products.json (из импортёра).

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import {
  buildProductBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductMetaTitle,
  getProductBreadcrumbs,
} from '../src/lib/productSeo.js';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  resolveSocialImageUrl,
} from '../src/lib/siteConfig.js';
import { toCanonicalSitePath } from '../src/lib/canonicalPaths.js';
import { normalizeMetaDescription } from '../src/lib/metaDescription.js';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../src/lib/staticPageJsonLd.js';
import { getProductImage } from '../shared/productImages.js';
import { buildShortDescription, buildSpecs } from '../lib/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const productsFile = path.join(repoRoot, 'data', 'products.json');
const catalogCategoriesFile = path.join(
  repoRoot,
  'shared',
  'catalogCategories.json'
);
const serverEntryFile = 'entry-server.js';
const CATALOG_PRERENDER_PAGE_SIZE = 24;
const buildManifestFile = path.join(distDir, '.vite', 'manifest.json');
const DEFAULT_PRODUCT_PRERENDER_LIMIT = 720;
const PRODUCT_PRERENDER_LIMIT_ENV = 'PRODUCT_PRERENDER_LIMIT';
const PRODUCT_PRERENDER_INCLUDE_ENV = 'PRODUCT_PRERENDER_INCLUDE';

export const STATIC_ROUTES = [
  {
    path: '/',
    title: `Кабель оптом в Челябинске — ${SITE_NAME}`,
    description:
      'Работаем с юрлицами. Подберём кабель под ваш объект и подготовим коммерческое предложение в течение 30 минут.',
    h1: 'Кабель оптом со склада в Челябинске',
    intro:
      'Оптовая поставка кабеля и провода в Челябинске и по России. Склад, отгрузка от 1 дня, работа с юрлицами по НДС.',
  },
  {
    path: '/catalog',
    title: `Каталог кабельной продукции — ${SITE_NAME}`,
    description:
      'Полный каталог кабельно-проводниковой продукции: силовые кабели, провода, контрольные кабели и СПЭ. 6 700+ позиций со склада в Челябинске.',
    h1: 'Каталог кабельной продукции',
    intro:
      'Силовые и контрольные кабели, провода, кабели СПЭ. Все позиции — со склада в Челябинске, отгрузка от 1 дня.',
  },
  {
    path: '/about',
    title: `О компании — ${SITE_NAME}`,
    description:
      'ООО «ЮжУралЭлектроКабель» — оптовый поставщик кабельной продукции в Челябинске. Прямые контракты с заводами, работа с юрлицами по НДС.',
    h1: 'О компании',
    intro:
      'Поставляем кабель и провод оптом для строительных и промышленных компаний Урала и России с прямыми контрактами с заводами-изготовителями.',
  },
  {
    path: '/contacts',
    title: `Контакты — ${SITE_NAME}`,
    description:
      'Адрес склада в Челябинске, телефоны отдела продаж, email для запроса коммерческих предложений. Реквизиты ООО «ЮжУралЭлектроКабель».',
    h1: 'Контакты',
    intro:
      'Адрес склада, телефоны отдела продаж, email для коммерческих предложений и реквизиты компании.',
  },
  {
    path: '/delivery',
    title: `Доставка — ${SITE_NAME}`,
    description:
      'Условия доставки кабельной продукции: самовывоз со склада в Челябинске, транспортные компании по России, отгрузка от 1 дня.',
    h1: 'Доставка',
    intro:
      'Самовывоз со склада в Челябинске, отправка ТК по России. Отгрузка от 1 рабочего дня после оплаты.',
  },
  {
    path: '/payment',
    title: `Оплата — ${SITE_NAME}`,
    description:
      'Способы оплаты для юридических лиц: безналичный расчёт по счёту, работа с НДС, договор поставки. Отсрочка платежа по согласованию.',
    h1: 'Оплата',
    intro:
      'Работаем с юрлицами по безналичному расчёту с НДС. Договор поставки, отсрочка платежа — по согласованию.',
  },
  {
    path: '/privacy',
    title: `Политика конфиденциальности — ${SITE_NAME}`,
    description:
      'Политика конфиденциальности ЮжУралЭлектроКабель: обработка персональных данных, cookie, формы заявок и порядок обращения.',
    h1: 'Политика конфиденциальности',
    intro:
      'Порядок обработки персональных данных, использования cookie и обратной связи на сайте ЮжУралЭлектроКабель.',
  },
];

export const NOT_FOUND_ROUTE = Object.freeze({
  path: '/404',
  title: `Страница не найдена — ${SITE_NAME}`,
  description:
    'Страница не найдена. Перейдите в каталог ЮжУралЭлектроКабель или вернитесь на главную.',
  h1: 'Страница не найдена',
  intro: 'Адрес устарел или был набран с ошибкой.',
});

const PRODUCT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const URL_OR_ROOT_PATH_RE = /^(https?:\/\/[^\s"<>]+|\/(?!\/)[^\s"<>]*)$/i;
const PRODUCT_NAME_FIELDS = ['title', 'fullName', 'name'];
const HOME_FEATURED_PRODUCTS_LIMIT = 10;
const OPTIONAL_STRING_FIELDS = [
  'title',
  'fullName',
  'name',
  'sourceName',
  'mark',
  'description',
  'shortDescription',
  'conductorConfiguration',
  'sku',
  'unit',
  'category',
  'sourceCategory',
  'catalogSection',
  'catalogCategory',
  'catalogType',
  'catalogApplicationType',
  'catalogBrand',
  'manufacturer',
];
const OPTIONAL_SLUG_FIELDS = ['catalogSectionSlug', 'catalogCategorySlug'];
const OPTIONAL_NON_NEGATIVE_NUMBER_FIELDS = ['price', 'stock'];
const OPTIONAL_POSITIVE_NUMBER_FIELDS = [
  'cores',
  'groupCores',
  'crossSection',
  'groundCores',
  'groundSection',
  'voltage',
];
const MAX_VALIDATION_ISSUES_IN_MESSAGE = 20;
const ROUTE_MODULES = [
  {
    test: (routePath) => routePath === '/catalog',
    module: 'src/pages/CatalogPage.jsx',
  },
  {
    test: (routePath) => routePath.startsWith('/catalog/'),
    module: 'src/pages/CatalogPage.jsx',
  },
  {
    test: (routePath) => routePath.startsWith('/product/'),
    module: 'src/pages/ProductPage.jsx',
  },
  {
    test: (routePath) => routePath === '/about',
    module: 'src/pages/AboutPage.jsx',
  },
  {
    test: (routePath) => routePath === '/contacts',
    module: 'src/pages/ContactsPage.jsx',
  },
  {
    test: (routePath) => routePath === '/delivery',
    module: 'src/pages/DeliveryPage.jsx',
  },
  {
    test: (routePath) => routePath === '/payment',
    module: 'src/pages/PaymentPage.jsx',
  },
  {
    test: (routePath) => routePath === '/privacy',
    module: 'src/pages/PrivacyPage.jsx',
  },
  {
    test: (routePath) => routePath === '/404',
    module: 'src/pages/NotFoundPage.jsx',
  },
];

export function parseProductPrerenderLimit(
  value,
  fallback = DEFAULT_PRODUCT_PRERENDER_LIMIT
) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  if (['all', 'full', '*'].includes(raw)) return null;

  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      `[prerender] ${PRODUCT_PRERENDER_LIMIT_ENV} должен быть целым числом >= 0 или "all".`
    );
  }
  return number;
}

function normalizeProductPrerenderKey(value) {
  let raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return '';

  try {
    if (/^https?:\/\//i.test(raw)) {
      raw = new URL(raw).pathname;
    }
  } catch {
    // Если это невалидный URL, обработаем как обычный ключ ниже.
  }

  raw = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (raw.startsWith('product/')) {
    raw = raw.slice('product/'.length);
  }
  return raw;
}

export function parseProductPrerenderInclude(value) {
  return [
    ...new Set(
      String(value ?? '')
        .split(/[\s,;]+/)
        .map(normalizeProductPrerenderKey)
        .filter(Boolean)
    ),
  ];
}

function getProductPrerenderKeys(product) {
  return [product?.slug, product?.sku, product?.id]
    .map(normalizeProductPrerenderKey)
    .filter(Boolean);
}

export function selectBuildPrerenderProducts(
  products,
  { limit = DEFAULT_PRODUCT_PRERENDER_LIMIT, include = [] } = {}
) {
  if (!Array.isArray(products)) return { products: [], missing: [] };
  if (limit === null) return { products, missing: [] };

  const explicitKeys = Array.isArray(include)
    ? include.map(normalizeProductPrerenderKey).filter(Boolean)
    : parseProductPrerenderInclude(include);
  const productByKey = new Map();
  for (const product of products) {
    for (const key of getProductPrerenderKeys(product)) {
      if (!productByKey.has(key)) productByKey.set(key, product);
    }
  }

  const selected = [];
  const selectedSlugs = new Set();
  const addProduct = (product) => {
    const slug = normalizeProductPrerenderKey(product?.slug);
    if (!product || selectedSlugs.has(slug)) return;
    selected.push(product);
    selectedSlugs.add(slug);
  };

  const missing = [];
  for (const key of explicitKeys) {
    const product = productByKey.get(key);
    if (product) {
      addProduct(product);
    } else {
      missing.push(key);
    }
  }

  let autoSelected = 0;
  for (const product of products) {
    if (autoSelected >= limit) break;
    const before = selected.length;
    addProduct(product);
    if (selected.length > before) {
      autoSelected += 1;
    }
  }

  return { products: selected, missing };
}

function formatProductPrerenderLimit(limit) {
  return limit === null ? 'all' : String(limit);
}

export class PrerenderProductValidationError extends Error {
  constructor(issues, { source = 'products.json' } = {}) {
    const visibleIssues = issues
      .slice(0, MAX_VALIDATION_ISSUES_IN_MESSAGE)
      .map((issue) => `- ${issue.path}: ${issue.message}`)
      .join('\n');
    const hiddenCount = issues.length - MAX_VALIDATION_ISSUES_IN_MESSAGE;
    const hiddenMessage =
      hiddenCount > 0 ? `\n- ... ещё ${hiddenCount} ошибок` : '';

    super(
      `[prerender] ${source} не прошёл проверку схемы товара: ${issues.length} ошибок.\n` +
        `${visibleIssues}${hiddenMessage}`
    );
    this.name = 'PrerenderProductValidationError';
    this.issues = issues;
    this.source = source;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return Number.isFinite(Number(value.replace(',', '.')));
}

function numberLikeValue(value) {
  return typeof value === 'number' ? value : Number(value.replace(',', '.'));
}

function isPositiveIntegerLike(value) {
  if (!isFiniteNumberLike(value)) return false;
  const number = numberLikeValue(value);
  return Number.isSafeInteger(number) && number > 0;
}

function isValidSlug(value) {
  return isNonEmptyString(value) && PRODUCT_SLUG_RE.test(value);
}

function isValidPublicAssetUrl(value) {
  return typeof value === 'string' && URL_OR_ROOT_PATH_RE.test(value);
}

function addIssue(issues, path, message) {
  issues.push({ path, message });
}

export function extractProductsPayload(
  payload,
  { source = 'products.json' } = {}
) {
  if (Array.isArray(payload)) return payload;
  if (isPlainObject(payload) && Array.isArray(payload.items)) {
    return payload.items;
  }

  throw new PrerenderProductValidationError(
    [
      {
        path: '$',
        message: 'ожидался массив товаров или объект с массивом items',
      },
    ],
    { source }
  );
}

export function validatePrerenderProducts(
  products,
  { source = 'products.json' } = {}
) {
  const issues = [];

  if (!Array.isArray(products)) {
    addIssue(issues, '$', 'ожидался массив товаров');
  } else {
    products.forEach((product, index) => {
      const itemPath = `items[${index}]`;
      if (!isPlainObject(product)) {
        addIssue(issues, itemPath, 'ожидался объект товара');
        return;
      }

      if (!isValidSlug(product.slug)) {
        addIssue(
          issues,
          `${itemPath}.slug`,
          'обязательный URL-сегмент: латиница, цифры и дефисы без /, пробелов и query'
        );
      }

      const hasDisplayName = PRODUCT_NAME_FIELDS.some((field) =>
        isNonEmptyString(product[field])
      );
      if (!hasDisplayName) {
        addIssue(
          issues,
          `${itemPath}.title/fullName/name`,
          'нужно хотя бы одно непустое название товара'
        );
      }

      const hasJsonLdSku =
        isNonEmptyString(product.sku) || isPositiveIntegerLike(product.id);
      if (!hasJsonLdSku) {
        addIssue(
          issues,
          `${itemPath}.sku`,
          'нужен непустой sku или положительный числовой id для JSON-LD'
        );
      }

      if (product.id != null && !isPositiveIntegerLike(product.id)) {
        addIssue(
          issues,
          `${itemPath}.id`,
          'должен быть положительным целым числом'
        );
      }

      for (const field of OPTIONAL_STRING_FIELDS) {
        if (product[field] != null && typeof product[field] !== 'string') {
          addIssue(
            issues,
            `${itemPath}.${field}`,
            'должно быть строкой или null'
          );
        }
      }

      for (const field of OPTIONAL_SLUG_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isValidSlug(value)) {
          addIssue(
            issues,
            `${itemPath}.${field}`,
            'должен быть URL-сегментом: латиница, цифры и дефисы'
          );
        }
      }

      for (const field of OPTIONAL_NON_NEGATIVE_NUMBER_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isFiniteNumberLike(value) || numberLikeValue(value) < 0) {
          addIssue(issues, `${itemPath}.${field}`, 'должно быть числом >= 0');
        }
      }

      for (const field of OPTIONAL_POSITIVE_NUMBER_FIELDS) {
        const value = product[field];
        if (value == null || value === '') continue;
        if (!isFiniteNumberLike(value) || numberLikeValue(value) <= 0) {
          addIssue(issues, `${itemPath}.${field}`, 'должно быть числом > 0');
        }
      }

      if (product.image != null && product.image !== '') {
        if (!isValidPublicAssetUrl(product.image)) {
          addIssue(
            issues,
            `${itemPath}.image`,
            'должен быть http(s)-URL или root-relative путь вида /image.png'
          );
        }
      }
    });
  }

  if (issues.length > 0) {
    throw new PrerenderProductValidationError(issues, { source });
  }

  return products;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildMetaTags({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
  noindex = false,
}) {
  const fullTitle = title;
  const metaDescription = normalizeMetaDescription(description);
  const image = resolveSocialImageUrl(ogImage);
  const tags = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(metaDescription)}">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:type" content="${escapeHtml(ogType)}">`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(metaDescription)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(fullTitle)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metaDescription)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ];

  if (canonical) {
    tags.splice(2, 0, `<link rel="canonical" href="${escapeHtml(canonical)}">`);
    tags.splice(
      8,
      0,
      `<meta property="og:url" content="${escapeHtml(canonical)}">`
    );
  }

  if (noindex) {
    tags.push('<meta name="robots" content="noindex,follow">');
  }

  return tags.join('\n    ');
}

function buildHomeHeroPreloadLink() {
  return [
    '<link rel="preload" as="image" href="/hero-bg-1280.avif" data-prerender="home-hero"',
    'type="image/avif"',
    'imagesrcset="/hero-bg-768.avif 768w, /hero-bg-1024.avif 1024w, /hero-bg-1280.avif 1280w, /hero-bg-1536.avif 1536w"',
    'imagesizes="100vw"',
    'fetchpriority="high">',
  ].join(' ');
}

export async function loadBuildManifest({
  manifestPath = buildManifestFile,
  warn = console.warn,
} = {}) {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      warn?.(
        `[prerender] Vite manifest не найден: ${manifestPath}. Route CSS preload будет пропущен.`
      );
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `[prerender] ${manifestPath} содержит некорректный JSON: ${error.message}`
      );
    }
    throw error;
  }
}

function getRouteModule(routePath) {
  return ROUTE_MODULES.find((route) => route.test(routePath))?.module || null;
}

function getManifestEntry(manifest, modulePath) {
  if (!manifest || !modulePath) return null;
  if (manifest[modulePath]) return manifest[modulePath];

  return (
    Object.values(manifest).find((entry) => entry?.src === modulePath) || null
  );
}

function collectManifestCss(manifest, modulePath, seen = new Set()) {
  if (!manifest || !modulePath || seen.has(modulePath)) return [];
  seen.add(modulePath);

  const entry = getManifestEntry(manifest, modulePath);
  if (!entry) return [];

  const css = [...(entry.css || [])];
  for (const importKey of entry.imports || []) {
    const importEntry = getManifestEntry(manifest, importKey);
    if (importEntry?.isEntry) continue;
    css.push(...collectManifestCss(manifest, importKey, seen));
  }

  return [...new Set(css)];
}

function toPublicAssetPath(file) {
  if (!file) return '';
  return file.startsWith('/') ? file : `/${file}`;
}

export function buildRouteCssLinks(routePath, manifest) {
  const modulePath = getRouteModule(routePath);
  const cssFiles = collectManifestCss(manifest, modulePath);

  return cssFiles
    .map(
      (file) =>
        `<link rel="stylesheet" href="${escapeHtml(
          toPublicAssetPath(file)
        )}" data-prerender="route-css">`
    )
    .join('\n    ');
}

export function buildJsonLdScripts(payloads, idPrefix = 'prerender') {
  return payloads
    .filter(Boolean)
    .map((payload, index) => buildJsonLdScript(payload, `${idPrefix}-${index}`))
    .join('\n    ');
}

export function buildJsonLdScript(payload, id) {
  if (!payload || !id) return '';

  return `<script type="application/ld+json" id="${escapeHtml(id)}">${JSON.stringify(
    payload
  ).replace(/</g, '\\u003c')}</script>`;
}

export function buildPrerenderDataScript(data) {
  if (!data || Object.keys(data).length === 0) return '';

  return `<script type="application/json" id="yuzhural-prerender-data">${JSON.stringify(
    data
  ).replace(/</g, '\\u003c')}</script>`;
}

function getProductDisplayName(product) {
  return (
    product.title || product.fullName || product.name || product.mark || ''
  );
}

function getCatalogProductImage(product) {
  return getProductImage(product);
}

function buildCatalogSections(products) {
  const sections = new Map();

  for (const product of products) {
    const sectionName = product.catalogSection || 'Каталог';
    const sectionSlug = product.catalogSectionSlug || sectionName;
    const categoryName = product.catalogCategory || product.category;
    const categorySlug = product.catalogCategorySlug || categoryName;
    if (!categoryName || !categorySlug) continue;

    if (!sections.has(sectionSlug)) {
      sections.set(sectionSlug, {
        name: sectionName,
        slug: sectionSlug,
        categories: new Map(),
      });
    }

    const section = sections.get(sectionSlug);
    const current = section.categories.get(categorySlug) || {
      name: categoryName,
      slug: categorySlug,
      count: 0,
    };
    current.count += 1;
    section.categories.set(categorySlug, current);
  }

  return [...sections.values()].map((section) => ({
    name: section.name,
    slug: section.slug,
    categories: [...section.categories.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru')
    ),
  }));
}

function buildCatalogListItem(product) {
  const title = getProductDisplayName(product);

  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku || '',
    title,
    fullName: product.fullName || title,
    mark: product.mark || title,
    category: product.category || product.catalogCategory || '',
    catalogSection: product.catalogSection || '',
    catalogSectionSlug: product.catalogSectionSlug || '',
    catalogCategory: product.catalogCategory || '',
    catalogCategorySlug: product.catalogCategorySlug || '',
    price: Number(product.price) || 0,
    unit: product.unit || 'м',
    stock: Number(product.stock) || 0,
    shortDescription:
      product.shortDescription || buildShortDescription(product),
    image: getCatalogProductImage(product),
    cores: product.cores ?? null,
    groupCores: product.groupCores ?? null,
    crossSection: product.crossSection ?? null,
    conductorConfiguration: product.conductorConfiguration || null,
    groundCores: product.groundCores ?? null,
    groundSection: product.groundSection ?? null,
    attributes: Array.isArray(product.attributes) ? product.attributes : [],
    voltage: product.voltage ?? null,
    catalogType: product.catalogType || null,
    catalogApplicationType: product.catalogApplicationType || null,
    manufacturer: product.manufacturer || null,
    catalogBrand: product.catalogBrand || null,
  };
}

function filterCatalogProductsByRoute(products, categorySlug = '') {
  if (!categorySlug) return products;

  return products.filter(
    (product) =>
      product.catalogCategorySlug === categorySlug ||
      product.catalogSectionSlug === categorySlug
  );
}

export function buildCatalogPrerenderData(
  products,
  { path = '/catalog', categorySlug = '' } = {}
) {
  const filteredProducts = filterCatalogProductsByRoute(products, categorySlug);
  const items = filteredProducts
    .slice(0, CATALOG_PRERENDER_PAGE_SIZE)
    .map(buildCatalogListItem);
  const total = filteredProducts.length;

  return {
    path,
    items,
    catalogSections: buildCatalogSections(products),
    meta: {
      count: items.length,
      total,
      catalogCount: products.length,
      pagination: {
        page: 1,
        limit: CATALOG_PRERENDER_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / CATALOG_PRERENDER_PAGE_SIZE)),
      },
      filter: null,
    },
  };
}

function getFeaturedProducts(products, limit = HOME_FEATURED_PRODUCTS_LIMIT) {
  return [...products]
    .sort((a, b) => {
      const promotedDiff = (b.promoted ? 1 : 0) - (a.promoted ? 1 : 0);
      if (promotedDiff !== 0) return promotedDiff;
      return (Number(b.stock) || 0) - (Number(a.stock) || 0);
    })
    .slice(0, limit);
}

export function buildHomePrerenderData(products) {
  return {
    featuredProducts: getFeaturedProducts(products).map(buildCatalogListItem),
  };
}

export function buildBreadcrumbsHtml(crumbs) {
  return [
    '<nav aria-label="Хлебные крошки" class="prerender-only">',
    '  <ol>',
    ...crumbs.map(
      (item) =>
        `    <li><a href="${escapeHtml(item.to)}">${escapeHtml(
          item.label
        )}</a></li>`
    ),
    '  </ol>',
    '</nav>',
  ].join('\n');
}

export function buildProductBodyShell(product) {
  const crumbs = getProductBreadcrumbs(product);
  const description = buildProductMetaDescription(product);
  const heading =
    product.title || product.fullName || product.name || product.mark || '';

  // Минимальный shell для краулеров и пользователей без JS. Он видимый, чтобы
  // не превращать prerender в скрытый SEO-блок; React при mount() заменит #root.
  const specs = Object.entries(product.specs || buildSpecs(product));
  if (product.catalogCategory)
    specs.push(['Категория', product.catalogCategory]);
  if (product.manufacturer || product.catalogBrand) {
    specs.push(['Производитель', product.manufacturer || product.catalogBrand]);
  }

  const specsHtml =
    specs.length > 0
      ? [
          '<dl class="prerender-only">',
          ...specs.map(
            ([label, value]) =>
              `  <dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
          ),
          '</dl>',
        ].join('\n')
      : '';

  return `
<div class="prerender-only">
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(description)}</p>
  ${buildBreadcrumbsHtml(crumbs)}
  ${specsHtml}
  <p><noscript>Включите JavaScript для просмотра карточки товара полностью.</noscript></p>
</div>`.trim();
}

export function buildCompactProductBodyShell(product) {
  const description = buildProductMetaDescription(product);
  const heading =
    product.title || product.fullName || product.name || product.mark || '';

  return `<div class="prerender-only"><h1>${escapeHtml(
    heading
  )}</h1><p>${escapeHtml(description)}</p></div>`;
}

export function buildStaticBodyShell(route) {
  const crumbs =
    route.path === '/'
      ? [{ label: 'Главная', to: '/' }]
      : [
          { label: 'Главная', to: '/' },
          { label: route.h1, to: route.path, isCurrent: true },
        ];

  return `
<div class="prerender-only">
  <h1>${escapeHtml(route.h1)}</h1>
  <p>${escapeHtml(route.intro)}</p>
  ${buildBreadcrumbsHtml(crumbs)}
</div>`.trim();
}

function buildCatalogRouteTitle(route) {
  return `${route.name} — купить оптом в Челябинске — ${SITE_NAME}`;
}

function buildCatalogRouteDescription(route) {
  return `Купить ${route.name.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`;
}

export function injectIntoTemplate(
  template,
  { headExtras, bodyShell, bodyEndExtras = '' }
) {
  // Стираем уже существующий <title> и наши же мета-теги, чтобы повторный
  // прогон не дублировал теги (если кто-то запустит prerender на уже
  // обработанном dist).
  let html = stripPrerenderManagedHead(template);

  html = injectManagedHeadExtras(html, headExtras);
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>/,
    `<div id="root">${bodyShell}</div>`
  );
  if (bodyEndExtras) {
    html = html.replace('</body>', `    ${bodyEndExtras}\n  </body>`);
  }

  return normalizePrerenderHtml(html);
}

function normalizeHeadLines(value) {
  const source = String(value || '');
  const tags = source.match(
    /<title\b[\s\S]*?<\/title>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>/gi
  );

  if (tags) return tags.map((tag) => tag.trim()).filter(Boolean);

  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findFirstRuntimeAssetIndex(lines) {
  return lines.findIndex((line) => /^<(?:link|script|style)\b/i.test(line));
}

function buildHead(openHead, lines, closeHead) {
  return [openHead, ...lines.map((line) => `    ${line}`), `  ${closeHead}`]
    .filter(Boolean)
    .join('\n');
}

export function injectManagedHeadExtras(html, headExtras) {
  const normalizedInnerExtras = normalizeHeadLines(headExtras);

  return html.replace(
    /(<head[^>]*>)([\s\S]*?)(<\/head>)/i,
    (_match, openHead, headInner, closeHead) => {
      const headLines = normalizeHeadLines(headInner);
      const assetIndex = findFirstRuntimeAssetIndex(headLines);

      if (normalizedInnerExtras.length === 0) {
        return buildHead(openHead, headLines, closeHead);
      }

      if (assetIndex === -1) {
        return buildHead(
          openHead,
          [...headLines, ...normalizedInnerExtras],
          closeHead
        );
      }

      return buildHead(
        openHead,
        [
          ...headLines.slice(0, assetIndex),
          ...normalizedInnerExtras,
          ...headLines.slice(assetIndex),
        ],
        closeHead
      );
    }
  );
}

export function stripPrerenderManagedHead(html) {
  return html
    .replace(/<title>[^<]*<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<link\b[^>]*\sdata-prerender="[^"]*"[^>]*>/gi, '')
    .replace(
      /<link\b[^>]*\srel="preload"[^>]*\shref="\/hero-bg-1536\.avif"[^>]*>/gi,
      ''
    )
    .replace(
      /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
}

export function minifyPrerenderHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

export function normalizePrerenderHtml(html) {
  return String(html)
    .replace(/^<!doctype html>/i, '<!DOCTYPE html>')
    .replace(
      /\s(srcSet|fetchPriority|inputMode|autoComplete|maxLength|referrerPolicy|noValidate)=/g,
      (_match, attr) => {
        const normalized = {
          srcSet: 'srcset',
          fetchPriority: 'fetchpriority',
          inputMode: 'inputmode',
          autoComplete: 'autocomplete',
          maxLength: 'maxlength',
          referrerPolicy: 'referrerpolicy',
          noValidate: 'novalidate',
        }[attr];
        return ` ${normalized}=`;
      }
    )
    .replace(
      /\s(download|hidden|selected|disabled|novalidate)=""(?=[\s>])/g,
      ' $1'
    )
    .replace(/<(meta|link|img|source|input|br)([^>]*)\/>/gi, '<$1$2>');
}

function getRuntimeHeadShell(template, headExtras = '') {
  const strippedTemplate = injectManagedHeadExtras(
    stripPrerenderManagedHead(template),
    headExtras
  );
  const match = strippedTemplate.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return minifyPrerenderHtml(match?.[1] || '');
}

export function injectIntoThinTemplate(
  template,
  { headExtras, bodyShell, bodyEndExtras = '' }
) {
  const runtimeHeadShell = getRuntimeHeadShell(template, headExtras);

  return normalizePrerenderHtml(
    minifyPrerenderHtml(
      [
        '<!doctype html>',
        '<html lang="ru">',
        '<head>',
        runtimeHeadShell,
        '</head>',
        '<body>',
        `<div id="root">${bodyShell}</div>`,
        bodyEndExtras,
        '</body>',
        '</html>',
      ].join('')
    )
  );
}

export async function loadServerRenderer({ outputDir = distDir } = {}) {
  process.env.NODE_ENV ||= 'production';

  const entryPath = path.join(outputDir, 'server', serverEntryFile);
  try {
    await fs.access(entryPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `[prerender] SSR bundle не найден: ${entryPath}. Запустите npm run build:ssr перед prerender.`
      );
    }
    throw error;
  }

  const moduleUrl = pathToFileURL(entryPath);
  moduleUrl.search = `v=${Date.now()}`;
  const serverModule = await import(moduleUrl.href);

  if (typeof serverModule.render !== 'function') {
    throw new Error(
      `[prerender] ${entryPath} должен экспортировать функцию render(url, options).`
    );
  }

  return serverModule.render;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeRoute(
  routePath,
  html,
  { outputDir = distDir } = {}
) {
  const trimmed = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  const dir = trimmed ? path.join(outputDir, trimmed) : outputDir;
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
}

export async function writeProductRoute(
  slug,
  html,
  { outputDir = distDir } = {}
) {
  const dir = path.join(outputDir, 'product');
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `${slug}.html`), html, 'utf8');
}

export async function writeStatusPage(
  filename,
  html,
  { outputDir = distDir } = {}
) {
  await fs.writeFile(path.join(outputDir, filename), html, 'utf8');
}

export async function loadTemplate({ outputDir = distDir } = {}) {
  const template = await fs.readFile(
    path.join(outputDir, 'index.html'),
    'utf8'
  );
  if (!/<div id="root">/.test(template)) {
    throw new Error(
      'dist/index.html не содержит <div id="root"> — vite build не отработал?'
    );
  }
  return template;
}

export async function loadProducts({
  filePath = productsFile,
  warn = console.warn,
} = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `[prerender] ${filePath} содержит некорректный JSON: ${error.message}`
      );
    }
    return extractProductsPayload(parsed, { source: filePath });
  } catch (error) {
    if (error.code === 'ENOENT') {
      warn?.(
        `[prerender] data/products.json не найден — карточки товара будут пропущены.\n` +
          `           Запустите npm run import:price перед сборкой.`
      );
      return [];
    }
    throw error;
  }
}

export async function loadCatalogCategories({
  filePath = catalogCategoriesFile,
  warn = console.warn,
} = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { sections: [] };
  } catch (error) {
    if (error.code === 'ENOENT') {
      warn?.(
        `[prerender] ${path.relative(repoRoot, filePath)} не найден — category prerender будет пропущен.`
      );
      return { sections: [] };
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `[prerender] ${filePath} содержит некорректный JSON: ${error.message}`
      );
    }
    throw error;
  }
}

export function collectCatalogRouteEntries(categoriesData) {
  const entries = [];
  const seen = new Set();

  const addEntry = (slug, name) => {
    const normalizedSlug = String(slug || '').trim();
    const normalizedName = String(name || '').trim();
    if (!normalizedSlug || !normalizedName || seen.has(normalizedSlug)) {
      return;
    }

    seen.add(normalizedSlug);
    entries.push({
      slug: normalizedSlug,
      name: normalizedName,
      path: `/catalog/${normalizedSlug}`,
    });
  };

  for (const section of categoriesData?.sections || []) {
    addEntry(section.slug, section.name);

    for (const category of section.categories || []) {
      addEntry(category.slug, category.name);

      for (const subcategory of category.subcategories || []) {
        addEntry(subcategory.slug, subcategory.name);
      }
    }
  }

  return entries;
}

export async function prerenderStatic(
  template,
  {
    outputDir = distDir,
    log = console.log,
    renderApp,
    products = [],
    manifest = null,
  } = {}
) {
  for (const route of STATIC_ROUTES) {
    const canonicalPath = toCanonicalSitePath(route.path);
    const canonical = absoluteUrl(canonicalPath);
    const staticJsonLd = buildStaticPageJsonLd(canonicalPath);
    const staticJsonLdId = getStaticPageJsonLdId(canonicalPath);
    const prerenderData =
      route.path === '/'
        ? { home: buildHomePrerenderData(products) }
        : route.path === '/catalog'
          ? {
              catalog: buildCatalogPrerenderData(products, {
                path: '/catalog',
              }),
            }
          : {};
    const headExtras = [
      buildMetaTags({
        title: route.title,
        description: route.description,
        canonical,
        ogType: route.path === '/' ? 'website' : 'article',
      }),
      buildRouteCssLinks(route.path, manifest),
      route.path === '/' ? buildHomeHeroPreloadLink() : '',
      buildJsonLdScript(staticJsonLd, staticJsonLdId),
    ].join('\n    ');
    const html = injectIntoTemplate(template, {
      headExtras,
      bodyShell: renderApp
        ? await renderApp(route.path, { prerenderData })
        : buildStaticBodyShell(route),
      bodyEndExtras: buildPrerenderDataScript(prerenderData),
    });
    await writeRoute(route.path, html, { outputDir });
  }
  log?.(
    `[prerender] static: ${STATIC_ROUTES.length} pages → dist/{${STATIC_ROUTES.map(
      (r) => r.path
    ).join(', ')}}`
  );
}

export async function prerenderCatalogRoutes(
  template,
  categoriesData,
  {
    outputDir = distDir,
    log = console.log,
    renderApp,
    products = [],
    manifest = null,
  } = {}
) {
  const routes = collectCatalogRouteEntries(categoriesData);

  for (const route of routes) {
    const canonical = absoluteUrl(route.path);
    const prerenderData = {
      catalog: buildCatalogPrerenderData(products, {
        path: route.path,
        categorySlug: route.slug,
      }),
    };
    const headExtras = [
      buildMetaTags({
        title: buildCatalogRouteTitle(route),
        description: buildCatalogRouteDescription(route),
        canonical,
      }),
      buildRouteCssLinks(route.path, manifest),
    ].join('\n    ');
    const html = injectIntoTemplate(template, {
      headExtras,
      bodyShell: renderApp
        ? await renderApp(route.path, { prerenderData })
        : buildStaticBodyShell({
            path: route.path,
            h1: route.name,
            intro: buildCatalogRouteDescription(route),
          }),
      bodyEndExtras: buildPrerenderDataScript(prerenderData),
    });
    await writeRoute(route.path, html, { outputDir });
  }

  log?.(
    `[prerender] categories: ${routes.length} pages → dist/catalog/<slug>/index.html`
  );
}

export async function prerenderNotFoundPage(
  template,
  { outputDir = distDir, log = console.log, renderApp, manifest = null } = {}
) {
  const headExtras = [
    buildMetaTags({
      title: NOT_FOUND_ROUTE.title,
      description: NOT_FOUND_ROUTE.description,
      noindex: true,
    }),
    buildRouteCssLinks(NOT_FOUND_ROUTE.path, manifest),
  ].join('\n    ');
  const html = injectIntoTemplate(template, {
    headExtras,
    bodyShell: renderApp
      ? await renderApp(NOT_FOUND_ROUTE.path)
      : buildStaticBodyShell(NOT_FOUND_ROUTE),
  });

  await writeStatusPage('404.html', html, { outputDir });
  log?.('[prerender] 404: dist/404.html');
}

export async function prerenderProducts(
  template,
  products,
  {
    outputDir = distDir,
    log = console.log,
    validate = true,
    renderApp,
    manifest = null,
    titleProducts = products,
    totalProducts = products.length,
  } = {}
) {
  if (validate) {
    validatePrerenderProducts(products);
  }

  await fs.rm(path.join(outputDir, 'product'), {
    recursive: true,
    force: true,
  });

  const titleCounts = new Map();
  for (const product of titleProducts) {
    const title = buildProductMetaTitle(product);
    if (title) {
      titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    }
  }

  let written = 0;
  for (const product of products) {
    const productImage = getProductImage(product);
    const productWithImage = {
      ...product,
      image: productImage,
      shortDescription:
        product.shortDescription || buildShortDescription(product),
      specs: product.specs || buildSpecs(product),
    };
    const canonical = absoluteUrl(`/product/${productWithImage.slug}`);
    const productLabel = buildProductMetaTitle(productWithImage, {
      disambiguate:
        titleCounts.get(buildProductMetaTitle(productWithImage)) > 1,
    });
    const fullTitle = productLabel
      ? `${productLabel} — ${SITE_NAME}`
      : SITE_NAME;
    const description = buildProductMetaDescription(productWithImage);
    const ogImage = resolveSocialImageUrl(productImage);
    const productLd = buildProductJsonLd(productWithImage);
    const breadcrumbLd = buildProductBreadcrumbJsonLd(productWithImage);
    const prerenderData = { product: productWithImage };

    const headExtras = [
      buildMetaTags({
        title: fullTitle,
        description,
        canonical,
        ogType: 'product',
        ogImage,
      }),
      buildRouteCssLinks(`/product/${productWithImage.slug}`, manifest),
      buildJsonLdScripts([breadcrumbLd, productLd], 'product-ld'),
    ].join('\n    ');

    const html = injectIntoThinTemplate(template, {
      headExtras,
      bodyShell: renderApp
        ? await renderApp(`/product/${productWithImage.slug}`, {
            prerenderData,
          })
        : buildCompactProductBodyShell(productWithImage),
      bodyEndExtras: buildPrerenderDataScript(prerenderData),
    });
    await writeProductRoute(productWithImage.slug, html, { outputDir });
    written += 1;
  }
  log?.(
    `[prerender] products: ${written}/${totalProducts} pages → dist/product/<slug>.html`
  );
}

export async function prerender({
  outputDir = distDir,
  productsPath = productsFile,
  log = console.log,
  warn = console.warn,
  renderApp,
  productPrerenderLimit = parseProductPrerenderLimit(
    process.env[PRODUCT_PRERENDER_LIMIT_ENV]
  ),
  productPrerenderInclude = parseProductPrerenderInclude(
    process.env[PRODUCT_PRERENDER_INCLUDE_ENV]
  ),
} = {}) {
  const template = await loadTemplate({ outputDir });
  const manifest = await loadBuildManifest({
    manifestPath: path.join(outputDir, '.vite', 'manifest.json'),
    warn,
  });
  const products = await loadProducts({ filePath: productsPath, warn });
  const categoriesData = await loadCatalogCategories({ warn });
  validatePrerenderProducts(products, { source: productsPath });
  const routeRenderer = renderApp || (await loadServerRenderer({ outputDir }));
  await prerenderStatic(template, {
    outputDir,
    log,
    renderApp: routeRenderer,
    products,
    manifest,
  });
  await prerenderCatalogRoutes(template, categoriesData, {
    outputDir,
    log,
    renderApp: routeRenderer,
    products,
    manifest,
  });
  await prerenderNotFoundPage(template, {
    outputDir,
    log,
    renderApp: routeRenderer,
    manifest,
  });
  const productSelection = selectBuildPrerenderProducts(products, {
    limit: productPrerenderLimit,
    include: productPrerenderInclude,
  });
  if (productSelection.missing.length > 0) {
    warn?.(
      `[prerender] ${PRODUCT_PRERENDER_INCLUDE_ENV}: не найдены SKU/slug: ${productSelection.missing.join(
        ', '
      )}`
    );
  }
  if (productSelection.products.length < products.length) {
    log?.(
      `[prerender] build product cap: ${productSelection.products.length}/${products.length} pages (limit=${formatProductPrerenderLimit(
        productPrerenderLimit
      )}; long-tail → runtime/static fallback)`
    );
  }
  await prerenderProducts(template, productSelection.products, {
    outputDir,
    log,
    validate: false,
    renderApp: routeRenderer,
    manifest,
    titleProducts: products,
    totalProducts: products.length,
  });
  log?.('[prerender] done.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  prerender().catch((error) => {
    console.error('[prerender] failed:', error);
    process.exit(1);
  });
}
