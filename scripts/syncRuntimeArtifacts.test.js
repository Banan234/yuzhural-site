import * as fs from 'fs/promises';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncRuntimeArtifacts } from './syncRuntimeArtifacts.js';

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-runtime-sync-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('syncRuntimeArtifacts', () => {
  it('synchronizes runtime data with current build artifacts', async () => {
    vi.resetModules();
    const root = await makeTempDir();
    const distDir = path.join(root, 'dist');
    const runtimePublicDir = path.join(root, 'data', 'public');
    const productsPath = path.join(root, 'data', 'products.json');
    const categoriesPath = path.join(root, 'shared', 'catalogCategories.json');
    const priceSource = path.join(root, 'data', 'price.xls');
    const redirectsJsonSource = path.join(root, 'public', 'redirects.json');
    const redirectsNginxSource = path.join(
      root,
      'public',
      'redirects.nginx.conf'
    );

    await mkdir(path.join(root, 'data'), { recursive: true });
    await mkdir(path.join(root, 'shared'), { recursive: true });
    await mkdir(path.join(root, 'public'), { recursive: true });
    await mkdir(path.join(distDir, 'assets'), { recursive: true });

    await writeFile(
      path.join(distDir, 'index.html'),
      `<!doctype html>
<html lang="ru">
  <head>
    <title>Old title</title>
    <meta name="description" content="old description">
    <meta property="og:title" content="old og">
    <meta name="twitter:title" content="old twitter">
    <link rel="canonical" href="https://old.example/">
    <script type="module" src="/assets/index.js"></script>
  </head>
  <body>
    <div id="root"><main>Old app shell</main></div>
  </body>
</html>`,
      'utf8'
    );

    await writeFile(
      productsPath,
      JSON.stringify({
        items: [
          {
            id: 1,
            slug: 'test-product',
            title: 'Тестовый товар',
            fullName: 'Тестовый товар',
            name: 'Тестовый товар',
            mark: 'TEST',
            sku: 'SKU-1',
            price: 100,
            stock: 5,
            unit: 'м',
            manufacturer: 'Factory',
            catalogSection: 'Кабель и провод',
            catalogSectionSlug: 'kabel-i-provod',
            catalogCategory: 'Силовой кабель',
            catalogCategorySlug: 'silovoy-kabel',
            image: '/images/test.png',
          },
        ],
      }),
      'utf8'
    );
    await writeFile(
      categoriesPath,
      JSON.stringify({
        sections: [
          {
            slug: 'kabel-i-provod',
            name: 'Кабель и провод',
            categories: [
              {
                slug: 'silovoy-kabel',
                name: 'Силовой кабель',
                subcategories: [],
              },
            ],
          },
        ],
      }),
      'utf8'
    );
    await writeFile(priceSource, 'price-binary', 'utf8');
    await writeFile(
      redirectsJsonSource,
      JSON.stringify({ 'old-product': 'test-product' }, null, 2),
      'utf8'
    );
    await writeFile(
      redirectsNginxSource,
      'location = /product/old-product { return 301 /product/test-product; }\n',
      'utf8'
    );

    const result = await syncRuntimeArtifacts({
      projectDir: root,
      productsPath,
      categoriesPath,
      templateDir: distDir,
      runtimePublicDir,
      priceSource,
      redirectsJsonSource,
      redirectsNginxSource,
      siteUrl: 'https://yu-uek.ru',
      log: null,
    });

    expect(result.seoSummary.counts.products).toBe(1);
    expect(result.coverage.htmlCount).toBe(1);

    const runtimeSitemapPages = await readFile(
      path.join(runtimePublicDir, 'sitemap-pages.xml'),
      'utf8'
    );
    const runtimeProductHtml = await readFile(
      path.join(runtimePublicDir, 'product', 'test-product.html'),
      'utf8'
    );
    const runtime404 = await readFile(
      path.join(runtimePublicDir, 'robots.txt'),
      'utf8'
    );
    const runtimePrice = await readFile(
      path.join(runtimePublicDir, 'price.xls'),
      'utf8'
    );
    const runtimeRedirects = await readFile(
      path.join(runtimePublicDir, 'redirects.nginx.conf'),
      'utf8'
    );

    expect(runtimeSitemapPages).toContain(
      '<loc>https://yu-uek.ru/catalog/</loc>'
    );
    expect(runtimeProductHtml).toContain(
      '<link rel="canonical" href="https://yu-uek.ru/product/test-product">'
    );
    expect(runtimeProductHtml).toContain('"@type":"Product"');
    expect(runtime404).toContain('Sitemap: https://yu-uek.ru/sitemap.xml');
    expect(runtimePrice).toBe('price-binary');
    expect(runtimeRedirects).toContain('/product/old-product');
  });

  it('falls back to copy/remove when directory rename hits EXDEV', async () => {
    vi.resetModules();
    const root = await makeTempDir();
    const distDir = path.join(root, 'dist');
    const runtimePublicDir = path.join(root, 'data', 'public');
    const productsPath = path.join(root, 'data', 'products.json');
    const categoriesPath = path.join(root, 'shared', 'catalogCategories.json');

    await mkdir(path.join(root, 'data', 'public', 'product'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'shared'), { recursive: true });
    await mkdir(path.join(distDir, 'assets'), { recursive: true });

    await writeFile(
      path.join(distDir, 'index.html'),
      `<!doctype html>
<html lang="ru">
  <head>
    <title>Old title</title>
    <meta name="description" content="old description">
    <meta property="og:title" content="old og">
    <meta name="twitter:title" content="old twitter">
    <link rel="canonical" href="https://old.example/">
    <script type="module" src="/assets/index.js"></script>
  </head>
  <body>
    <div id="root"><main>Old app shell</main></div>
  </body>
</html>`,
      'utf8'
    );
    await writeFile(
      productsPath,
      JSON.stringify({
        items: [
          {
            id: 1,
            slug: 'test-product',
            title: 'Тестовый товар',
            fullName: 'Тестовый товар',
            name: 'Тестовый товар',
            mark: 'TEST',
            sku: 'SKU-1',
            price: 100,
            stock: 5,
            unit: 'м',
            manufacturer: 'Factory',
            catalogSection: 'Кабель и провод',
            catalogSectionSlug: 'kabel-i-provod',
            catalogCategory: 'Силовой кабель',
            catalogCategorySlug: 'silovoy-kabel',
            image: '/images/test.png',
          },
        ],
      }),
      'utf8'
    );
    await writeFile(
      categoriesPath,
      JSON.stringify({
        sections: [
          {
            slug: 'kabel-i-provod',
            name: 'Кабель и провод',
            categories: [
              {
                slug: 'silovoy-kabel',
                name: 'Силовой кабель',
                subcategories: [],
              },
            ],
          },
        ],
      }),
      'utf8'
    );
    await writeFile(
      path.join(runtimePublicDir, 'product', 'stale-product.html'),
      'stale',
      'utf8'
    );

    const fsModule = {
      ...fs,
      rename: async (source, target) => {
        if (
          source === path.join(runtimePublicDir, 'product') ||
          target === path.join(runtimePublicDir, 'product')
        ) {
          const error = new Error('cross-device link not permitted');
          error.code = 'EXDEV';
          throw error;
        }
        return fs.rename(source, target);
      },
    };

    const result = await syncRuntimeArtifacts({
      projectDir: root,
      productsPath,
      categoriesPath,
      templateDir: distDir,
      runtimePublicDir,
      siteUrl: 'https://yu-uek.ru',
      log: null,
      fsModule,
    });

    expect(result.coverage.htmlCount).toBe(1);
    await expect(
      readFile(
        path.join(runtimePublicDir, 'product', 'test-product.html'),
        'utf8'
      )
    ).resolves.toContain('https://yu-uek.ru/product/test-product');
    await expect(
      fs.access(path.join(runtimePublicDir, 'product', 'stale-product.html'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
