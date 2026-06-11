// Файл проверяет генерацию sitemap, robots.txt, canonical URL и сегментацию SEO-карт.

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  SITEMAP_FILES,
  buildRobotsTxt,
  buildSitemapCategoriesXml,
  buildSitemapIndexXml,
  buildSitemapPagesXml,
  buildSitemapProductXmlFiles,
  buildSitemapProductsXml,
  writeSeoArtifacts,
} from './siteSeo.js';

const SITE = 'https://example.test';

describe('buildSitemapPagesXml', () => {
  it('содержит только статические маршруты и обёрнут <urlset>', () => {
    const xml = buildSitemapPagesXml({ siteUrl: SITE, lastmod: '2026-01-01' });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/catalog/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/contacts/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/privacy</loc>`);
    expect(xml).not.toContain(`<loc>${SITE}/privacy/</loc>`);
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
    // Не должно быть карточек, категорий-уровня-2 или внутренних страниц.
    expect(xml).not.toContain('/product/');
    expect(xml).not.toContain('/catalog/silovoy-kabel');
    expect(xml).not.toContain('/cart');
    expect(xml).not.toContain('/internal/runtime');
  });

  it('убирает завершающий слэш у siteUrl', () => {
    const xml = buildSitemapPagesXml({ siteUrl: `${SITE}//` });
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).not.toContain(`${SITE}///`);
  });

  it('нормализует siteUrl к https non-www для sitemap', () => {
    const xml = buildSitemapPagesXml({
      siteUrl: 'http://www.example.test//',
    });

    expect(xml).toContain('<loc>https://example.test/catalog/</loc>');
    expect(xml).toContain('<loc>https://example.test/contacts/</loc>');
    expect(xml).not.toContain('http://www.example.test');
  });
});

describe('buildSitemapCategoriesXml', () => {
  it('собирает разделы и категории, дедуплицирует совпадения', () => {
    const xml = buildSitemapCategoriesXml({
      siteUrl: SITE,
      categoriesData: {
        sections: [
          {
            slug: 'kabel-i-provod',
            categories: [
              { slug: 'silovoy-kabel' },
              { slug: 'silovoy-kabel' }, // дубль
              { slug: '' }, // пропустить
            ],
          },
        ],
      },
      lastmod: '2026-01-01',
    });

    expect(xml).toContain(`<loc>${SITE}/catalog/kabel-i-provod</loc>`);
    expect(xml).toContain(`<loc>${SITE}/catalog/silovoy-kabel</loc>`);
    // Дополнительная подкатегория добавляется автоматически.
    expect(xml).toContain(`<loc>${SITE}/catalog/nekabelnaya-produkciya</loc>`);
    const matches = xml.match(/\/catalog\/silovoy-kabel</g) || [];
    expect(matches.length).toBe(1);
  });

  it('не содержит статики или карточек товара', () => {
    const xml = buildSitemapCategoriesXml({
      siteUrl: SITE,
      categoriesData: { sections: [] },
    });
    expect(xml).not.toContain('<loc>https://example.test/</loc>');
    expect(xml).not.toContain('/product/');
  });
});

describe('buildSitemapProductsXml', () => {
  it('содержит только карточки товара, дедуплицирует по slug', () => {
    const xml = buildSitemapProductsXml({
      siteUrl: SITE,
      products: [
        { slug: 'vvg-3h2-5' },
        { slug: 'vvg-3h2-5' }, // дубль — должен схлопнуться
        { slug: 'sip-4-16' },
        { slug: '' }, // пропускаем
      ],
      lastmod: '2026-01-01',
    });

    expect(xml).toContain(`<loc>${SITE}/product/vvg-3h2-5</loc>`);
    expect(xml).toContain(`<loc>${SITE}/product/sip-4-16</loc>`);
    const matches = xml.match(/\/product\/vvg-3h2-5</g) || [];
    expect(matches.length).toBe(1);
    expect(xml).not.toContain('/catalog/');
  });

  it('экранирует XML-спецсимволы в slug', () => {
    const xml = buildSitemapProductsXml({
      siteUrl: SITE,
      products: [{ slug: 'a&b' }],
    });
    expect(xml).toContain('/product/a&amp;b');
    expect(xml).not.toContain('/product/a&b<');
  });
});

describe('buildSitemapProductXmlFiles', () => {
  it('дробит карточки товара на несколько sitemap-файлов по лимиту URL', () => {
    const files = buildSitemapProductXmlFiles({
      siteUrl: SITE,
      products: [
        { slug: 'p-1' },
        { slug: 'p-2' },
        { slug: 'p-2' }, // дубль — не должен занимать место в chunk
        { slug: 'p-3' },
        { slug: 'p-4' },
        { slug: 'p-5' },
      ],
      lastmod: '2026-01-01',
      maxUrlsPerSitemap: 2,
    });

    expect(files.map((file) => file.filename)).toEqual([
      SITEMAP_FILES.products,
      'sitemap-products-2.xml',
      'sitemap-products-3.xml',
    ]);
    expect(files.map((file) => file.count)).toEqual([2, 2, 1]);
    expect(files[0].xml).toContain(`<loc>${SITE}/product/p-1</loc>`);
    expect(files[0].xml).toContain(`<loc>${SITE}/product/p-2</loc>`);
    expect(files[1].xml).toContain(`<loc>${SITE}/product/p-3</loc>`);
    expect(files[2].xml).toContain(`<loc>${SITE}/product/p-5</loc>`);
  });

  it('не даёт собрать один oversized sitemap-products.xml', () => {
    const products = Array.from({ length: 50_001 }, (_, index) => ({
      slug: `p-${index}`,
    }));

    expect(() => buildSitemapProductsXml({ siteUrl: SITE, products })).toThrow(
      'sitemap-products.xml получил 50001 URL при лимите 50000'
    );
  });
});

describe('buildSitemapIndexXml', () => {
  it('генерирует <sitemapindex> со ссылками на сегменты', () => {
    const xml = buildSitemapIndexXml({
      siteUrl: SITE,
      lastmod: '2026-01-01',
    });

    expect(xml).toContain(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    );
    expect(xml).toContain(`<loc>${SITE}/${SITEMAP_FILES.pages}</loc>`);
    expect(xml).toContain(`<loc>${SITE}/${SITEMAP_FILES.categories}</loc>`);
    expect(xml).toContain(`<loc>${SITE}/${SITEMAP_FILES.products}</loc>`);
    // Поисковики ждут lastmod на каждом sitemap-entry.
    const lastmods = xml.match(/<lastmod>2026-01-01<\/lastmod>/g) || [];
    expect(lastmods.length).toBe(3);
  });

  it('принимает кастомный список сегментов', () => {
    const xml = buildSitemapIndexXml({
      siteUrl: SITE,
      sitemaps: ['sitemap-products.xml'],
    });
    expect(xml).toContain(`<loc>${SITE}/sitemap-products.xml</loc>`);
    expect(xml).not.toContain('sitemap-pages.xml');
  });
});

describe('buildRobotsTxt', () => {
  it('разрешает всё, прячет служебные пути и указывает sitemap-индекс', () => {
    const txt = buildRobotsTxt({ siteUrl: SITE });

    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /api/');
    expect(txt).toContain('Disallow: /cart');
    expect(txt).toContain(`Sitemap: ${SITE}/${SITEMAP_FILES.index}`);
  });

  it('нормализует siteUrl к https non-www для robots', () => {
    const txt = buildRobotsTxt({ siteUrl: 'http://www.example.test//' });
    expect(txt).toContain('Sitemap: https://example.test/sitemap.xml');
    expect(txt).not.toContain('http://www.example.test');
  });
});

describe('writeSeoArtifacts', () => {
  it('пишет sitemap-index со всеми product chunks и удаляет старые chunks', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'yuzhural-seo-'));
    try {
      await writeFile(
        path.join(outputDir, 'sitemap-products-99.xml'),
        'stale',
        'utf-8'
      );

      const result = await writeSeoArtifacts({
        outputDir,
        siteUrl: SITE,
        products: Array.from({ length: 5 }, (_, index) => ({
          slug: `p-${index + 1}`,
        })),
        categoriesData: { sections: [] },
        lastmod: '2026-01-01',
        maxUrlsPerSitemap: 2,
      });

      const indexXml = await readFile(
        path.join(outputDir, SITEMAP_FILES.index),
        'utf-8'
      );
      const firstProductsXml = await readFile(
        path.join(outputDir, SITEMAP_FILES.products),
        'utf-8'
      );
      const thirdProductsXml = await readFile(
        path.join(outputDir, 'sitemap-products-3.xml'),
        'utf-8'
      );

      expect(indexXml).toContain(`${SITE}/${SITEMAP_FILES.products}`);
      expect(indexXml).toContain(`${SITE}/sitemap-products-2.xml`);
      expect(indexXml).toContain(`${SITE}/sitemap-products-3.xml`);
      expect(indexXml).not.toContain('sitemap-products-99.xml');
      expect(firstProductsXml.match(/<url>/g)).toHaveLength(2);
      expect(thirdProductsXml.match(/<url>/g)).toHaveLength(1);
      await expect(
        readFile(path.join(outputDir, 'sitemap-products-99.xml'), 'utf-8')
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        result.productSitemapPaths.map((filePath) => path.basename(filePath))
      ).toEqual([
        SITEMAP_FILES.products,
        'sitemap-products-2.xml',
        'sitemap-products-3.xml',
      ]);
      expect(result.counts).toMatchObject({
        products: 5,
        productSitemaps: 3,
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
