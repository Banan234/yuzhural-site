import { isProductPending } from '../../shared/productAvailability.js';
import { groupProductOffers } from '../../shared/productOffers.js';
// Файл проверяет, что product URL из sitemap имеют runtime HTML с SEO-данными.

import fs from 'fs/promises';
import { buildProductJsonLd } from '../../src/lib/productSeo.js';
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
    products.some((p) => !isProductPending(p))
  ) {
    throw new ProductPrerenderCoverageError(
      'Product sitemap не содержит product URL для проверки runtime product-prerender.',
      { missing: [], bare: [], longTailSlug: null, sitemapCount: 0 }
    );
  }

  const productDir = explicitProductDir || path.join(publicDir, 'product');
  const bySlug = new Map(
    (products || []).map((product) => [product.slug, product])
  );
  const groupedBySlug = new Map();
  for (const group of groupProductOffers(products || [])) {
    for (const offer of group.offers || [group]) {
      groupedBySlug.set(
        offer.slug,
        group.offers
          ? {
              ...group,
              slug: offer.slug,
              sku: offer.sku,
              selectedOfferId: offer.id,
            }
          : group
      );
    }
  }
  if (Array.isArray(products)) {
    const sitemapSet = new Set(sitemapSlugs);
    const absent = products
      .filter(
        (product) => !isProductPending(product) && !sitemapSet.has(product.slug)
      )
      .map((product) => product.slug);
    const extra = sitemapSlugs.filter(
      (slug) => !bySlug.has(slug) || isProductPending(bySlug.get(slug))
    );
    const files = await fs.readdir(productDir).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const extraHtml = files.filter(
      (name) => name.endsWith('.html') && !bySlug.has(name.slice(0, -5))
    );
    if (
      absent.length ||
      extra.length ||
      extraHtml.length ||
      bySlug.size !== products.length
    ) {
      throw new ProductPrerenderCoverageError(
        'Наборы JSON, sitemap и HTML не совпадают.',
        { absent, extra, extraHtml }
      );
    }
  }
  const inconsistent = [];
  const missing = [];
  const bare = [];

  const htmlSlugs = Array.isArray(products)
    ? products.map((p) => p.slug)
    : sitemapSlugs;
  for (const slug of htmlSlugs) {
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
    const product = groupedBySlug.get(slug);
    if (product && ('price' in product || 'stock' in product)) {
      try {
        const scripts = [
          ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
        ];
        const payload = JSON.parse(
          scripts.find((match) =>
            /id="yuzhural-prerender-data"/.test(match[1])
          )[2]
        ).product;
        const fields = [
          'id',
          'sku',
          'slug',
          'price',
          'stock',
          'unit',
          'dataStatus',
          'selectedOfferId',
        ];
        const schemas = scripts
          .filter((match) => /type="application\/ld\+json"/.test(match[1]))
          .map((match) => JSON.parse(match[2]));
        const schema = schemas.find((item) => item['@type'] === 'Product');
        const expected = buildProductJsonLd(product)?.offers;
        if (
          isProductPending(product) &&
          (product.price !== null ||
            product.stock !== null ||
            product.unit !== null ||
            schema?.offers)
        )
          throw new Error('Pending product contains a commercial offer');
        if (
          fields.some((field) => payload[field] !== product[field]) ||
          !schema ||
          [
            '@type',
            'price',
            'priceCurrency',
            'availability',
            'lowPrice',
            'highPrice',
            'offerCount',
          ].some((field) => schema.offers?.[field] !== expected?.[field]) ||
          JSON.stringify(payload.offers) !== JSON.stringify(product.offers)
        )
          inconsistent.push(slug);
      } catch {
        inconsistent.push(slug);
      }
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

  if (missing.length > 0 || bare.length > 0 || inconsistent.length > 0) {
    throw new ProductPrerenderCoverageError(
      [
        'Runtime product-prerender не покрывает product sitemap.',
        inconsistent.length
          ? `Коммерческие данные HTML/JSON-LD отличаются от JSON: ${inconsistent.length} (${inconsistent.slice(0, 5).join(', ')})`
          : '',
        missing.length > 0
          ? `Нет HTML для ${missing.length} URL: ${missing.slice(0, 5).join(', ')}`
          : '',
        bare.length > 0
          ? `HTML без product SEO для ${bare.length} URL: ${bare.slice(0, 5).join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      {
        missing,
        bare,
        inconsistent,
        longTailSlug,
        sitemapCount: sitemapSlugs.length,
      }
    );
  }

  return {
    sitemapCount: sitemapSlugs.length,
    htmlCount: htmlSlugs.length,
    longTailSlug,
  };
}
