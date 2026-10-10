import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mapSeoSummaryToPublishedPaths,
  publishImportArtifacts,
  writeFileAtomic,
} from './importPublisher.js';

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
    const publicDir = path.join(projectRoot, 'public');
    const dataDir = path.join(projectRoot, 'data');
    const sharedDir = path.join(projectRoot, 'shared');
    await fs.mkdir(sharedDir, { recursive: true });
    const paths = {
      outputFile: path.join(dataDir, 'products.json'),
      registryFile: path.join(dataDir, 'productRegistry.json'),
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

    const result = await publishImportArtifacts({
      projectRoot,
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
    });

    expect(await fs.readFile(paths.outputFile, 'utf-8')).toBe('[]');
    expect(await fs.readFile(paths.publicPriceFile, 'utf-8')).toBe(
      'price workbook'
    );
    expect(await fs.readFile(paths.redirectsFile, 'utf-8')).toBe('{}');
    expect((await fs.lstat(publicDir)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(publicDir)).toContain('.public-releases/release-');
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
  });
});
