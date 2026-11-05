// Файл проверяет аудит runtime product-prerender относительно product sitemap.

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProductPrerenderCoverageError,
  assertProductPrerenderCoverage,
  extractProductSlugsFromSitemapXml,
} from './productPrerenderAudit.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-audit-'));
  tempDirs.push(dir);
  return dir;
}

function buildProductSitemap(slugs) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...slugs.map(
      (slug) => `  <url><loc>https://yu-uek.ru/product/${slug}</loc></url>`
    ),
    '</urlset>',
    '',
  ].join('\n');
}

function buildProductHtml(slug) {
  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    `  <link rel="canonical" href="https://yu-uek.ru/product/${slug}">`,
    '  <script type="application/ld+json" id="prerender-product">{"@type":"Product","name":"Товар"}</script>',
    '  <script type="application/json" id="yuzhural-prerender-data">{"product":{"slug":"x"}}</script>',
    '</head>',
    '<body><div id="root"><main>Product</main></div></body>',
    '</html>',
  ].join('\n');
}

async function writeRuntimeFixture(publicDir, slugs, htmlBySlug = {}) {
  await mkdir(path.join(publicDir, 'product'), { recursive: true });
  await writeFile(
    path.join(publicDir, 'sitemap-products.xml'),
    buildProductSitemap(slugs),
    'utf8'
  );

  for (const slug of Object.keys(htmlBySlug)) {
    await writeFile(
      path.join(publicDir, 'product', `${slug}.html`),
      htmlBySlug[slug],
      'utf8'
    );
  }
}

async function writeLegacyRuntimeFixture(publicDir, slugs, htmlBySlug = {}) {
  await mkdir(path.join(publicDir, 'product'), { recursive: true });
  await writeFile(
    path.join(publicDir, 'sitemap.xml'),
    buildProductSitemap(slugs),
    'utf8'
  );

  for (const slug of Object.keys(htmlBySlug)) {
    await writeFile(
      path.join(publicDir, 'product', `${slug}.html`),
      htmlBySlug[slug],
      'utf8'
    );
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('extractProductSlugsFromSitemapXml', () => {
  it('достаёт только product URL из sitemap', () => {
    const xml = [
      '<urlset>',
      '<url><loc>https://example.test/product/first-product</loc></url>',
      '<url><loc>https://example.test/catalog</loc></url>',
      '<url><loc>/product/second-product/</loc></url>',
      '</urlset>',
    ].join('');

    expect(extractProductSlugsFromSitemapXml(xml)).toEqual([
      'first-product',
      'second-product',
    ]);
  });
});

describe('assertProductPrerenderCoverage', () => {
  it('подтверждает HTML для всех product URL и проверяет long-tail за build-limit', async () => {
    const publicDir = await makeTempDir();
    const slugs = ['first-product', 'second-product', 'third-product'];
    await writeRuntimeFixture(publicDir, slugs, {
      'first-product': buildProductHtml('first-product'),
      'second-product': buildProductHtml('second-product'),
      'third-product': buildProductHtml('third-product'),
    });

    const result = await assertProductPrerenderCoverage({
      publicDir,
      products: slugs.map((slug) => ({ slug })),
      buildLimit: 1,
    });

    expect(result).toMatchObject({
      sitemapCount: 3,
      htmlCount: 3,
    });
    expect(['second-product', 'third-product']).toContain(result.longTailSlug);
  });

  it('падает, если URL из sitemap не имеет runtime HTML', async () => {
    const publicDir = await makeTempDir();
    await writeRuntimeFixture(publicDir, ['first-product', 'missing-product'], {
      'first-product': buildProductHtml('first-product'),
    });

    await expect(
      assertProductPrerenderCoverage({
        publicDir,
        products: [{ slug: 'first-product' }, { slug: 'missing-product' }],
        buildLimit: 1,
      })
    ).rejects.toMatchObject({
      name: 'ProductPrerenderCoverageError',
      details: { missing: ['missing-product'] },
    });
  });

  it('падает, если long-tail карточка отдаёт голый index.html без product SEO', async () => {
    const publicDir = await makeTempDir();
    await writeRuntimeFixture(publicDir, ['first-product', 'tail-product'], {
      'first-product': buildProductHtml('first-product'),
      'tail-product':
        '<!doctype html><html><head><title>ЮУЭК</title></head><body><div id="root"></div></body></html>',
    });

    await expect(
      assertProductPrerenderCoverage({
        publicDir,
        products: [{ slug: 'first-product' }, { slug: 'tail-product' }],
        buildLimit: 1,
      })
    ).rejects.toBeInstanceOf(ProductPrerenderCoverageError);
  });

  it('проверяет legacy sitemap.xml, если sitemap-products.xml ещё не сгенерирован', async () => {
    const publicDir = await makeTempDir();
    await writeLegacyRuntimeFixture(publicDir, ['legacy-product'], {
      'legacy-product': buildProductHtml('legacy-product'),
    });

    await expect(
      assertProductPrerenderCoverage({
        publicDir,
        products: [{ slug: 'legacy-product' }],
        buildLimit: 720,
      })
    ).resolves.toMatchObject({
      sitemapCount: 1,
      htmlCount: 1,
    });
  });

  it('может проверять новую product-папку до её публикации', async () => {
    const publicDir = await makeTempDir();
    const stagedProductDir = path.join(publicDir, 'staged-product');
    await writeRuntimeFixture(publicDir, ['staged-product']);
    await mkdir(stagedProductDir, { recursive: true });
    await writeFile(
      path.join(stagedProductDir, 'staged-product.html'),
      buildProductHtml('staged-product'),
      'utf8'
    );

    await expect(
      assertProductPrerenderCoverage({
        publicDir,
        productDir: stagedProductDir,
        products: [{ slug: 'staged-product' }],
      })
    ).resolves.toMatchObject({ sitemapCount: 1, htmlCount: 1 });
  });

  it('не проходит молча, если sitemap не содержит product URL', async () => {
    const publicDir = await makeTempDir();
    await writeFile(
      path.join(publicDir, 'sitemap.xml'),
      '<urlset><url><loc>https://example.test/catalog</loc></url></urlset>',
      'utf8'
    );

    await expect(
      assertProductPrerenderCoverage({
        publicDir,
        products: [{ slug: 'known-product' }],
      })
    ).rejects.toMatchObject({
      name: 'ProductPrerenderCoverageError',
      details: { sitemapCount: 0 },
    });
  });
});

it('rejects stale commercial payload/schema, omitted catalog slugs and leftover HTML', async () => {
  const { prerenderProducts } = await import('../prerender.js');
  const { readFile } = await import('node:fs/promises');
  const publicDir = await makeTempDir();
  const product = {
    id: 1,
    sku: 'SYNTHETIC-1',
    slug: 'synthetic-1',
    name: 'ВВГ 3х2.5',
    price: 123.456,
    stock: 17,
    unit: 'м',
  };
  const template =
    '<!doctype html><html><head><title>fixture</title></head><body><div id="root"></div></body></html>';
  await writeRuntimeFixture(publicDir, [product.slug]);
  await prerenderProducts(template, [product], {
    outputDir: publicDir,
    log: null,
  });
  const htmlPath = path.join(publicDir, 'product', product.slug + '.html');
  const original = await readFile(htmlPath, 'utf8');
  await expect(
    assertProductPrerenderCoverage({ publicDir, products: [product] })
  ).resolves.toMatchObject({ htmlCount: 1 });
  for (const [before, after] of [
    ['"price":123.456', '"price":999'],
    ['"stock":17', '"stock":0'],
    ['"price":"123.46"', '"price":"888.88"'],
  ]) {
    expect(original).toContain(before);
    await writeFile(htmlPath, original.replace(before, after));
    await expect(
      assertProductPrerenderCoverage({ publicDir, products: [product] })
    ).rejects.toMatchObject({ details: { inconsistent: [product.slug] } });
  }
  await writeFile(htmlPath, original);
  await expect(
    assertProductPrerenderCoverage({
      publicDir,
      products: [product, { ...product, slug: 'missing-from-sitemap' }],
    })
  ).rejects.toMatchObject({ details: { absent: ['missing-from-sitemap'] } });
  await writeFile(path.join(publicDir, 'product/removed.html'), original);
  await expect(
    assertProductPrerenderCoverage({ publicDir, products: [product] })
  ).rejects.toMatchObject({ details: { extraHtml: ['removed.html'] } });
});
