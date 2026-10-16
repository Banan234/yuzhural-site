import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mapSeoSummaryToPublishedPaths,
  publishImportArtifacts,
  writeFileAtomic,
} from './importPublisher.js';
import { DESIGNATION_KNOWLEDGE_REVISION } from '../../shared/productDesignationReference.js';

describe('writeFileAtomic', () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('создаёт вложенный файл целиком и применяет запрошенный mode', async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'price-import-publisher-')
    );
    const filePath = path.join(tempDir, 'nested', 'artifact.txt');

    await writeFileAtomic(filePath, 'complete artifact', { mode: 0o444 });

    expect(await fs.readFile(filePath, 'utf-8')).toBe('complete artifact');
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o444);
  });
});

describe('mapSeoSummaryToPublishedPaths', () => {
  it('заменяет временный staging-каталог итоговым каталогом публикации', () => {
    const summary = mapSeoSummaryToPublishedPaths(
      {
        indexPath: '/tmp/public-stage/sitemap.xml',
        robotsPath: '/tmp/public-stage/robots.txt',
        productSitemapPaths: [
          '/tmp/public-stage/sitemap-products-1.xml',
          '/tmp/public-stage/sitemap-products-2.xml',
        ],
        counts: { products: 2 },
      },
      '/tmp/public-stage',
      '/srv/site/public'
    );

    expect(summary).toEqual({
      indexPath: '/srv/site/public/sitemap.xml',
      robotsPath: '/srv/site/public/robots.txt',
      productSitemapPaths: [
        '/srv/site/public/sitemap-products-1.xml',
        '/srv/site/public/sitemap-products-2.xml',
      ],
      counts: { products: 2 },
    });
  });
});

describe('publishImportArtifacts', () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('готовит и устанавливает data, SEO, отчёт и историю как один пакет', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'price-import-publish-'));
    const projectRoot = tempDir;
    const catalogDir = path.join(projectRoot, 'data', 'catalog-current');
    const publicDir = path.join(catalogDir, 'public');
    const dataDir = path.join(projectRoot, 'data');
    const sharedDir = path.join(projectRoot, 'shared');
    await fs.mkdir(sharedDir, { recursive: true });
    const paths = {
      outputFile: path.join(catalogDir, 'products.json'),
      registryFile: path.join(catalogDir, 'productRegistry.json'),
      reportFile: path.join(dataDir, 'import-report.json'),
      reportHtmlFile: path.join(dataDir, 'import-report.html'),
      historyFile: path.join(dataDir, 'import-history.json'),
      publicPriceFile: path.join(publicDir, 'price.xls'),
      redirectsFile: path.join(publicDir, 'redirects.json'),
      redirectsNginxFile: path.join(publicDir, 'redirects.nginx.conf'),
      inputFile: path.join(dataDir, 'price.xls'),
      categoriesFile: path.join(sharedDir, 'catalogCategories.json'),
    };
    await fs.writeFile(paths.categoriesFile, JSON.stringify({ sections: [] }));
    const generatedAt = '2026-10-10T10:00:00.000Z';
    const report = {
      generatedAt,
      sourceFile: paths.inputFile,
      summary: {},
      diff: {},
      productsByCategory: {},
      skippedRows: [],
      reviewRows: [],
      diagnostics: {},
      manufacturers: {},
      suspiciousPriceStats: {},
    };

    const publishOptions = {
      projectRoot,
      catalogDir,
      publicDir,
      ...paths,
      runtimePrerenderTemplateDir: path.join(projectRoot, 'dist'),
      runtimePrerenderEnabled: false,
      siteUrl: 'https://example.test',
      products: [],
      registry: { version: 1, nextId: 1, entries: {} },
      report,
      sourcePriceBuffer: Buffer.from('price workbook'),
      downloadedPriceBuffer: null,
      slugRedirects: {},
      importConfig: { suspiciousPriceStats: { historyLimit: 8 } },
      importHistory: { imports: [] },
      generatedAt,
      source: { kind: 'local', requestedUrl: null },
    };
    const result = await publishImportArtifacts(publishOptions);

    expect(await fs.readFile(paths.outputFile, 'utf-8')).toBe('[]');
    expect(await fs.readFile(paths.publicPriceFile, 'utf-8')).toBe(
      'price workbook'
    );
    expect(await fs.readFile(paths.redirectsFile, 'utf-8')).toBe('{}');
    expect((await fs.lstat(catalogDir)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(catalogDir)).toContain(
      '.catalog-current-releases/release-'
    );
    const activeRelease = await fs.realpath(catalogDir);
    expect(await fs.realpath(paths.outputFile)).toBe(
      path.join(activeRelease, 'products.json')
    );
    expect(await fs.realpath(paths.publicPriceFile)).toBe(
      path.join(activeRelease, 'public', 'price.xls')
    );
    expect(await fs.readFile(paths.outputFile, 'utf-8')).toBe('[]');
    expect((await fs.lstat(paths.outputFile)).isSymbolicLink()).toBe(false);
    expect(
      (await fs.lstat(path.join(dataDir, 'products.json'))).isSymbolicLink()
    ).toBe(false);
    expect(
      await fs.readFile(path.join(dataDir, 'products.json'), 'utf-8')
    ).toBe('[]');
    expect(
      JSON.parse(
        await fs.readFile(path.join(dataDir, 'productRegistry.json'), 'utf-8')
      )
    ).toEqual({ version: 1, nextId: 1, entries: {} });
    expect(result.seoSummary.indexPath).toBe(
      path.join(publicDir, 'sitemap.xml')
    );
    expect(result.seoSummary.robotsPath).toBe(
      path.join(publicDir, 'robots.txt')
    );
    expect(
      JSON.parse(await fs.readFile(paths.historyFile, 'utf-8')).generatedAt
    ).toBe(generatedAt);
    expect(
      JSON.parse(await fs.readFile(paths.reportFile, 'utf-8')).seo.total
    ).toBeGreaterThan(0);
    expect(await fs.readFile(paths.reportHtmlFile, 'utf-8')).toContain(
      'Отчёт импорта'
    );
    expect(result.runtimeProductPrerenderCount).toBeNull();

    // A later price introduces previously unseen SKUs. Stale imported metadata
    // cannot bypass the current database at the publication boundary.
    const newProducts = [
      {
        id: 99,
        sku: 'NEW-99',
        slug: 'new-99',
        mark: 'КСБ',
        name: 'КСБ 2х2х0,8',
        sourceName: 'КСБ 2х2х0,8',
        price: 123.45,
        stock: 56,
        unit: 'м',
        designationDecoded: { knowledgeRevision: 'obsolete', family: 'wrong' },
      },
      {
        id: 100,
        sku: 'NEW-100',
        slug: 'new-100',
        mark: 'КГXYZ',
        name: 'КГXYZ 3х2,5',
        sourceName: 'КГXYZ 3х2,5',
        price: 42,
        stock: 19,
        unit: 'м',
      },
    ];
    await publishImportArtifacts({ ...publishOptions, products: newProducts });
    const saved = JSON.parse(await fs.readFile(paths.outputFile, 'utf8'));
    expect(saved[0]).toMatchObject({
      sku: 'NEW-99',
      price: 123.45,
      stock: 56,
      designationDecoded: {
        family: 'КСБ',
        knowledgeRevision: DESIGNATION_KNOWLEDGE_REVISION,
      },
    });
    expect(saved[1].designationDecoded.family).toBeNull();
    expect(saved[1].designationDecoded.status).toBe('unresolved');
    const coverage = JSON.parse(
      await fs.readFile(
        path.join(catalogDir, 'designation-coverage.json'),
        'utf8'
      )
    );
    expect(coverage.counts).toMatchObject({
      products: 2,
      familyIdentified: 1,
      unresolved: 1,
    });
    expect(coverage.pending[0].sku).toBe('NEW-100');
    expect(
      JSON.parse(await fs.readFile(paths.reportFile, 'utf8'))
        .designationDecoding
    ).toEqual(coverage);
  });
});
