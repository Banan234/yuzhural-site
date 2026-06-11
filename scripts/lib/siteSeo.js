// Файл генерирует sitemap, robots.txt и SEO-файлы на основе актуального каталога и настроек сайта.

// Генерация sitemap-индекса + сегментированных карт сайта и robots.txt.
// Запускается из scripts/importPrice.js после того, как products.json
// и categories посчитаны — чтобы карта сайта всегда соответствовала
// текущему ассортименту.
//
// Структура:
//   sitemap.xml             — sitemapindex (точка входа для поисковиков)
//   sitemap-pages.xml       — статические страницы (/, /catalog, /about, ...)
//   sitemap-categories.xml  — разделы и категории каталога
//   sitemap-products.xml    — карточки товара, первый chunk до 50 000 URL
//   sitemap-products-2.xml  — следующие chunks при росте каталога
//
// Зачем сегментация: в Я.Вебмастере и GSC видно охват по каждому сегменту —
// если просел продуктовый блок, это не маскируется здоровьем статики.

import fs from 'fs/promises';
import path from 'path';
import { toCanonicalSitePath } from '../../src/lib/canonicalPaths.js';

const DEFAULT_SITE_URL =
  process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://yu-uek.ru';

export const SITEMAP_FILES = {
  index: 'sitemap.xml',
  pages: 'sitemap-pages.xml',
  categories: 'sitemap-categories.xml',
  products: 'sitemap-products.xml',
};

export const MAX_SITEMAP_URLS = 50_000;

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  {
    path: toCanonicalSitePath('/catalog'),
    changefreq: 'daily',
    priority: '0.9',
  },
  {
    path: toCanonicalSitePath('/delivery'),
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: toCanonicalSitePath('/payment'),
    changefreq: 'monthly',
    priority: '0.4',
  },
  {
    path: toCanonicalSitePath('/about'),
    changefreq: 'monthly',
    priority: '0.4',
  },
  {
    path: toCanonicalSitePath('/contacts'),
    changefreq: 'monthly',
    priority: '0.5',
  },
  {
    path: toCanonicalSitePath('/privacy'),
    changefreq: 'yearly',
    priority: '0.2',
  },
];

const PRODUCT_SITEMAP_FILE_RE = /^sitemap-products(?:-\d+)?\.xml$/;
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeSitemapSiteUrl(value = DEFAULT_SITE_URL) {
  const fallback = 'https://yu-uek.ru';
  const raw = String(value || fallback).trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const isLocalhost = LOCALHOST_HOSTNAMES.has(hostname);
    const protocol = isLocalhost ? parsed.protocol : 'https:';
    const canonicalHostname =
      isLocalhost || !hostname.startsWith('www.')
        ? hostname
        : hostname.slice(4);
    const pathname =
      parsed.pathname && parsed.pathname !== '/'
        ? trimTrailingSlash(parsed.pathname)
        : '';

    return `${protocol}//${canonicalHostname}${parsed.port ? `:${parsed.port}` : ''}${pathname}`;
  } catch {
    return trimTrailingSlash(raw);
  }
}

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return ch;
    }
  });
}

function buildUrlEntry({ loc, lastmod, changefreq, priority }) {
  const lines = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${lines.join('\n')}\n  </url>`;
}

function buildUrlSet(routes, base, lastmod) {
  const entries = routes.map((route) =>
    buildUrlEntry({
      loc: `${base}${toCanonicalSitePath(route.path)}`,
      lastmod,
      changefreq: route.changefreq,
      priority: route.priority,
    })
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

function normalizeMaxUrlsPerSitemap(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('maxUrlsPerSitemap должен быть положительным целым числом');
  }
  return Math.min(number, MAX_SITEMAP_URLS);
}

function chunkRoutes(routes, chunkSize) {
  if (routes.length === 0) return [[]];

  const chunks = [];
  for (let index = 0; index < routes.length; index += chunkSize) {
    chunks.push(routes.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildProductSitemapFilename(index) {
  return index === 0
    ? SITEMAP_FILES.products
    : `sitemap-products-${index + 1}.xml`;
}

function collectCategoryRoutes(categoriesData) {
  const routes = [];
  const sections = Array.isArray(categoriesData?.sections)
    ? categoriesData.sections
    : [];

  for (const section of sections) {
    if (section.slug) {
      routes.push({
        path: `/catalog/${section.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
    const categories = Array.isArray(section.categories)
      ? section.categories
      : [];
    for (const category of categories) {
      if (!category.slug) continue;
      // Подкатегории живут на том же роуте /catalog/:slug — он умеет искать
      // и section.slug, и category.slug в catalogCategories.json.
      routes.push({
        path: `/catalog/${category.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
      });
    }
  }

  // Доп. подкатегория — некабельная продукция (она прописана в роутере,
  // но не лежит в sections). Дублирование с фильтром через slug допустимо.
  routes.push({
    path: '/catalog/nekabelnaya-produkciya',
    changefreq: 'weekly',
    priority: '0.6',
  });

  // Дедупликация по path — на случай если какая-то подкатегория совпадёт.
  const seen = new Set();
  return routes.filter((route) => {
    if (seen.has(route.path)) return false;
    seen.add(route.path);
    return true;
  });
}

function collectProductRoutes(products) {
  if (!Array.isArray(products)) return [];
  const seen = new Set();
  const routes = [];
  for (const product of products) {
    const slug = product?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    routes.push({
      path: `/product/${slug}`,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }
  return routes;
}

// ── Per-segment urlsets ────────────────────────────────────────────────────

export function buildSitemapPagesXml({
  siteUrl = DEFAULT_SITE_URL,
  lastmod = new Date().toISOString(),
} = {}) {
  return buildUrlSet(STATIC_ROUTES, normalizeSitemapSiteUrl(siteUrl), lastmod);
}

export function buildSitemapCategoriesXml({
  siteUrl = DEFAULT_SITE_URL,
  categoriesData = null,
  lastmod = new Date().toISOString(),
} = {}) {
  return buildUrlSet(
    collectCategoryRoutes(categoriesData),
    normalizeSitemapSiteUrl(siteUrl),
    lastmod
  );
}

export function buildSitemapProductsXml({
  siteUrl = DEFAULT_SITE_URL,
  products = [],
  lastmod = new Date().toISOString(),
} = {}) {
  const routes = collectProductRoutes(products);
  if (routes.length > MAX_SITEMAP_URLS) {
    throw new Error(
      `sitemap-products.xml получил ${routes.length} URL при лимите ${MAX_SITEMAP_URLS}. Используйте buildSitemapProductXmlFiles().`
    );
  }
  return buildUrlSet(routes, normalizeSitemapSiteUrl(siteUrl), lastmod);
}

export function buildSitemapProductXmlFiles({
  siteUrl = DEFAULT_SITE_URL,
  products = [],
  lastmod = new Date().toISOString(),
  maxUrlsPerSitemap = MAX_SITEMAP_URLS,
} = {}) {
  const base = normalizeSitemapSiteUrl(siteUrl);
  const chunkSize = normalizeMaxUrlsPerSitemap(maxUrlsPerSitemap);
  const routes = collectProductRoutes(products);
  const routeChunks = chunkRoutes(routes, chunkSize);

  return routeChunks.map((chunk, index) => ({
    filename: buildProductSitemapFilename(index),
    xml: buildUrlSet(chunk, base, lastmod),
    count: chunk.length,
  }));
}

// ── Sitemap index ─────────────────────────────────────────────────────────

export function buildSitemapIndexXml({
  siteUrl = DEFAULT_SITE_URL,
  sitemaps = [
    SITEMAP_FILES.pages,
    SITEMAP_FILES.categories,
    SITEMAP_FILES.products,
  ],
  lastmod = new Date().toISOString(),
} = {}) {
  const base = normalizeSitemapSiteUrl(siteUrl);
  const entries = sitemaps.map((file) =>
    [
      '  <sitemap>',
      `    <loc>${escapeXml(`${base}/${file}`)}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
      '  </sitemap>',
    ].join('\n')
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</sitemapindex>',
    '',
  ].join('\n');
}

// ── robots.txt ─────────────────────────────────────────────────────────────

export function buildRobotsTxt({ siteUrl = DEFAULT_SITE_URL } = {}) {
  const base = normalizeSitemapSiteUrl(siteUrl);
  return [
    'User-agent: *',
    'Allow: /',
    // SPA-служебные каталоги — на всякий случай прячем от ботов.
    'Disallow: /api/',
    'Disallow: /cart',
    '',
    // Один Sitemap-указатель — на индекс. Поисковик сам разберёт ссылки
    // на sitemap-pages/categories/products.
    `Sitemap: ${base}/${SITEMAP_FILES.index}`,
    '',
  ].join('\n');
}

// ── Orchestrator ───────────────────────────────────────────────────────────

async function removeStaleProductSitemaps(outputDir) {
  let entries;
  try {
    entries = await fs.readdir(outputDir);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(
    entries
      .filter((filename) => PRODUCT_SITEMAP_FILE_RE.test(filename))
      .map((filename) => fs.rm(path.join(outputDir, filename), { force: true }))
  );
}

export async function writeSeoArtifacts({
  outputDir,
  siteUrl,
  products,
  categoriesData,
  lastmod = new Date().toISOString(),
  maxUrlsPerSitemap = MAX_SITEMAP_URLS,
}) {
  await fs.mkdir(outputDir, { recursive: true });
  await removeStaleProductSitemaps(outputDir);

  const pagesXml = buildSitemapPagesXml({ siteUrl, lastmod });
  const categoriesXml = buildSitemapCategoriesXml({
    siteUrl,
    categoriesData,
    lastmod,
  });
  const productXmlFiles = buildSitemapProductXmlFiles({
    siteUrl,
    products,
    lastmod,
    maxUrlsPerSitemap,
  });
  const indexXml = buildSitemapIndexXml({
    siteUrl,
    lastmod,
    sitemaps: [
      SITEMAP_FILES.pages,
      SITEMAP_FILES.categories,
      ...productXmlFiles.map(({ filename }) => filename),
    ],
  });
  const robotsTxt = buildRobotsTxt({ siteUrl });

  const writes = [
    [SITEMAP_FILES.index, indexXml],
    [SITEMAP_FILES.pages, pagesXml],
    [SITEMAP_FILES.categories, categoriesXml],
    ...productXmlFiles.map(({ filename, xml }) => [filename, xml]),
    ['robots.txt', robotsTxt],
  ];

  for (const [filename, contents] of writes) {
    await fs.writeFile(path.join(outputDir, filename), contents, 'utf-8');
  }

  const countUrls = (xml) => xml.match(/<url>/g)?.length || 0;

  return {
    indexPath: path.join(outputDir, SITEMAP_FILES.index),
    pagesPath: path.join(outputDir, SITEMAP_FILES.pages),
    categoriesPath: path.join(outputDir, SITEMAP_FILES.categories),
    productsPath: path.join(outputDir, SITEMAP_FILES.products),
    productSitemapPaths: productXmlFiles.map(({ filename }) =>
      path.join(outputDir, filename)
    ),
    robotsPath: path.join(outputDir, 'robots.txt'),
    counts: {
      pages: countUrls(pagesXml),
      categories: countUrls(categoriesXml),
      products: productXmlFiles.reduce((sum, file) => sum + file.count, 0),
      productSitemaps: productXmlFiles.length,
      total:
        countUrls(pagesXml) +
        countUrls(categoriesXml) +
        productXmlFiles.reduce((sum, file) => sum + file.count, 0),
    },
  };
}
