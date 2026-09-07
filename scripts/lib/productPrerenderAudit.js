// Файл проверяет, что product URL из sitemap имеют runtime HTML с SEO-данными.

import fs from 'fs/promises';
import path from 'path';
import { parseProductPrerenderLimit } from '../prerender.js';

const PRODUCT_SITEMAP_FILE_RE = /^sitemap-products(?:-\d+)?\.xml$/;

function decodeXml(value) {
  return String(value || '').replace(
    /&(amp|lt|gt|apos|quot);/g,
    (entity, name) =>
      ({
        amp: '&',
        lt: '<',
        gt: '>',
        apos: "'",
        quot: '"',
      })[name] || entity
  );
}

function extractProductSlugFromLoc(loc) {
  const decoded = decodeXml(loc).trim();
  if (!decoded) return '';

  try {
    const url = decoded.startsWith('http')
      ? new URL(decoded)
      : new URL(decoded, 'https://example.test');
    const match = url.pathname.match(/^\/product\/([a-z0-9-]+)\/?$/i);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

export function extractProductSlugsFromSitemapXml(xml) {
  return [
    ...new Set(
      [...String(xml || '').matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
        .map((match) => extractProductSlugFromLoc(match[1]))
        .filter(Boolean)
    ),
  ];
}

async function listProductSitemapPaths(publicDir) {
  const entries = await fs.readdir(publicDir);
  const productSitemaps = entries
    .filter((entry) => PRODUCT_SITEMAP_FILE_RE.test(entry))
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((entry) => path.join(publicDir, entry));

  if (productSitemaps.length > 0) {
    return productSitemaps;
  }

  // Older/local imports may still keep product URLs in a single sitemap.xml.
  // Use it as a fallback so the check cannot pass with "0 URLs" while product
  // pages are actually present in the published sitemap.
  if (entries.includes('sitemap.xml')) {
    return [path.join(publicDir, 'sitemap.xml')];
  }

  return [];
}

async function readSitemapProductSlugs({ publicDir, productSitemapPaths }) {
  const paths =
    productSitemapPaths?.length > 0
      ? productSitemapPaths
      : await listProductSitemapPaths(publicDir);

  const slugs = [];
  for (const sitemapPath of paths) {
    const xml = await fs.readFile(sitemapPath, 'utf8');
    slugs.push(...extractProductSlugsFromSitemapXml(xml));
  }

  return [...new Set(slugs)];
}

function hasProductSeoHtml(html, slug) {
  const canonicalRe = new RegExp(
    `<link\\s+rel="canonical"\\s+href="[^"]*/product/${slug}">`,
    'i'
  );

  return (
    canonicalRe.test(html) &&
    html.includes('type="application/ld+json"') &&
    html.includes('"@type":"Product"') &&
    html.includes('id="yuzhural-prerender-data"')
  );
}

function chooseLongTailProduct(products, limit, slugs) {
  if (limit === null || !Number.isSafeInteger(limit)) return null;
  if (!Array.isArray(products) || products.length <= limit) return null;

  const sitemapSlugs = new Set(slugs);
  const candidates = products
    .slice(limit)
    .map((product) => product?.slug)
    .filter((slug) => slug && sitemapSlugs.has(slug));
  if (candidates.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (const char of today) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return candidates[hash % candidates.length];
}

export class ProductPrerenderCoverageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProductPrerenderCoverageError';
    this.details = details;
  }
}

export async function assertProductPrerenderCoverage({
  publicDir,
  productDir: explicitProductDir,
  products,
  productSitemapPaths = [],
  buildLimit = parseProductPrerenderLimit(process.env.PRODUCT_PRERENDER_LIMIT),
} = {}) {
  if (!publicDir) {
    throw new ProductPrerenderCoverageError(
      'Не задан publicDir для проверки runtime product-prerender.'
    );
  }

  const sitemapSlugs = await readSitemapProductSlugs({
    publicDir,
    productSitemapPaths,
  });
  if (
    sitemapSlugs.length === 0 &&
    Array.isArray(products) &&
    products.length > 0
  ) {
    throw new ProductPrerenderCoverageError(
      'Product sitemap не содержит product URL для проверки runtime product-prerender.',
      { missing: [], bare: [], longTailSlug: null, sitemapCount: 0 }
    );
  }

  const productDir = explicitProductDir || path.join(publicDir, 'product');
  const missing = [];
  const bare = [];

  for (const slug of sitemapSlugs) {
    const htmlPath = path.join(productDir, `${slug}.html`);
    let html;
    try {
      html = await fs.readFile(htmlPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        missing.push(slug);
        continue;
      }
      throw error;
    }

    if (!hasProductSeoHtml(html, slug)) {
      bare.push(slug);
    }
  }

  const longTailSlug = chooseLongTailProduct(
    products,
    buildLimit,
    sitemapSlugs
  );
  if (
    longTailSlug &&
    !missing.includes(longTailSlug) &&
    !bare.includes(longTailSlug)
  ) {
    const html = await fs.readFile(
      path.join(productDir, `${longTailSlug}.html`),
      'utf8'
    );
    if (!hasProductSeoHtml(html, longTailSlug)) {
      bare.push(longTailSlug);
    }
  }

  if (missing.length > 0 || bare.length > 0) {
    throw new ProductPrerenderCoverageError(
      [
        'Runtime product-prerender не покрывает product sitemap.',
        missing.length > 0
          ? `Нет HTML для ${missing.length} URL: ${missing.slice(0, 5).join(', ')}`
          : '',
        bare.length > 0
          ? `HTML без product SEO для ${bare.length} URL: ${bare.slice(0, 5).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      { missing, bare, longTailSlug, sitemapCount: sitemapSlugs.length }
    );
  }

  return {
    sitemapCount: sitemapSlugs.length,
    htmlCount: sitemapSlugs.length,
    longTailSlug,
  };
}
