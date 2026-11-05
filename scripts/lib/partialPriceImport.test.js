import { writeCatalogRendererFixture } from '../test/catalogRendererFixture.js';
import { normalizeImportedProduct } from './priceParser.js';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  extractProducts,
  classifyEligibleProducts,
} from './priceCatalogPreparation.js';
import { validateNormalizedProducts } from './importDiagnostics.js';
import { quarantineInvalidProducts } from './quarantineProducts.js';
import { buildStableKey, assignStableIdentity } from './productRegistry.js';
import {
  indexSourceIdentities,
  resolveSourcePresence,
  finishPartialImport,
  sourcePosition,
} from './partialPriceImport.js';
import { evaluatePublishGuard } from './importPublishGuard.js';
import { publishImportArtifacts } from './importPublisher.js';
import { createCatalogStore } from '../../lib/catalog.js';
import { assertProductPrerenderCoverage } from './productPrerenderAudit.js';
import { buildDiff, buildHistorySnapshot } from './priceImportComparison.js';
import { createPendingProduct } from '../../shared/productAvailability.js';

const product = (id, name) => ({
  ...normalizeImportedProduct({ name, unit: 'м', price: 100 + id, stock: 20 }),
  id,
  sku: 'SYNTHETIC-' + id,
  slug: 'synthetic-' + id,
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  catalogCategory: 'Силовой кабель',
  catalogCategorySlug: 'silovoy-kabel',
});
const header = ['Наименование', 'Ед.изм', 'Цена', 'Остаток'];

function prepare(previous, rows, normalizeFixture = (p) => p) {
  const registry = { version: 1, nextId: 100, entries: {} };
  for (const p of previous) registry.entries[buildStableKey(p)] = { ...p };
  const parsed = extractProducts(rows),
    classified = classifyEligibleProducts(parsed.products, {
      ...parsed,
      previousProducts: previous,
      registry,
    });
  const identities = indexSourceIdentities(classified, registry),
    presence = resolveSourcePresence(
      previous,
      parsed.sourceObservations,
      identities
    );
  // Allows a fixture to reproduce loss of title identity at the normalized-input boundary.
  const normalized = classified.map(normalizeFixture);
  const diagnostics = validateNormalizedProducts(normalized);
  const { eligible } = quarantineInvalidProducts(
    normalized,
    diagnostics.errors,
    parsed.reviewRows
  );
  const active = eligible.map((p) => ({
    ...p,
    ...assignStableIdentity(registry, p, '2026-10-27', {
      identityDiscriminator: identities.get(sourcePosition(p))
        ?.identityDiscriminator,
    }),
  }));
  const result = finishPartialImport(previous, active, presence);
  return { ...result, parsed, diagnostics, registry };
}

describe('partial import source presence and release', () => {
  it('refreshes only a uniquely known classification-review row, keeps its public taxonomy and leaves new review isolated', () => {
    const previous = [product(1, 'АОЛ-П-12Y 1х35')];
    const result = prepare(previous, [
      header,
      ['АОЛ-П-12Y 1х35', 'м', 222, 7],
      ['Неизвестное изделие 2х4', 'м', 90, 3],
    ]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      id: 1,
      price: 222,
      stock: 7,
      catalogCategory: previous[0].catalogCategory,
      classificationReview: { previousId: 1 },
    });
    expect(result.pendingProducts).toEqual([]);
    expect(result.parsed.reviewRows).toHaveLength(2);
    expect(result.registry.nextId).toBe(100);
  });
  it.each([
    ['м', '1.234,56', 5],
    ['', 100, 5],
    ['м', 100, 0],
    ['м', 100, -2],
  ])(
    'never lets classification-only admission bypass commercial validation (%s %s %s)',
    (unit, price, stock) => {
      const result = prepare(
        [product(1, 'АОЛ-П-12Y 1х35')],
        [header, ['АОЛ-П-12Y 1х35', unit, price, stock]]
      );
      expect(result.pendingProducts.map((p) => p.id)).toEqual([1]);
      expect(result.products[0]).toMatchObject({
        price: null,
        stock: null,
        dataStatus: 'pending',
      });
    }
  );
  it('does not treat an ambiguous old name as unique identity', () => {
    const result = prepare(
      [product(1, 'АОЛ-П-12Y 1х35'), product(2, 'АОЛ-П-12Y 1х35')],
      [header, ['АОЛ-П-12Y 1х35', 'м', 120, 7]]
    );
    expect(result.pendingProducts.map((p) => p.id)).toEqual([1, 2]);
  });
  it('keeps a review row with a price override in commercial quarantine', () => {
    const previous = product(1, 'АПБ 1,8х4,0/1,92');
    const record = {
      ...previous,
      sourceRowIndex: 1,
      importDisposition: 'review',
      price: 425.7,
      priceOverrideApplied: { sourcePrice: 425700, correctedPrice: 425.7 },
    };
    expect(
      validateNormalizedProducts([record]).errors.map((e) => e.code)
    ).toContain('review_price_override');
  });
  it('isolates a normalized title-identity error with its physical row while updating the valid item', async () => {
    const previous = [product(1, 'ВВГ 3х1'), product(2, 'HELUKABEL 2х2х0.75')];
    const rows = [
      header,
      ['ВВГ 3х1', 'м', 222.34, 88],
      ...Array.from({ length: 40 }, () => []),
      ['HELUKABEL 2х2х0.75', 'м', 500, 17],
    ];
    // Reproduce the original malformed normalized title, retaining the source name/manufacturer.
    const result = prepare(previous, rows, (p) =>
      p.sourceRowIndex === 42
        ? {
            ...p,
            name: '2х2х0.75',
            fullName: '2х2х0.75',
            title: '2х2х0.75',
            manufacturer: 'HELUKABEL',
          }
        : p
    );
    expect(result.diagnostics.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'title_missing_identity',
          rowIndex: 42,
        }),
      ])
    );
    expect(result.parsed.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 42,
          sourceCells: { name: 'A43', unit: 'B43', price: 'C43', stock: 'D43' },
          codes: expect.arrayContaining(['title_missing_identity']),
        }),
      ])
    );
    expect(result.products.find((p) => p.id === 1)).toMatchObject({
      price: 222.34,
      stock: 88,
    });
    expect(result.pendingProducts.map((p) => p.id)).toEqual([2]);
    expect(result.pendingProducts[0]).toMatchObject({
      dataStatus: 'pending',
      price: null,
      stock: null,
    });
    const guard = evaluatePublishGuard({
      config: { minProducts: 1 },
      previousProducts: previous,
      products: result.products,
      rowErrors: result.diagnostics.errors,
      reviewRows: result.parsed.reviewRows,
      sourceProductCount: 2,
    });
    expect(guard.ok).toBe(true);
    expect(guard.issues).toEqual([]);
    expect(guard.warnings.map((issue) => issue.key)).toContain('maxErrors');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'title-isolation-'));
    try {
      const productsFile = path.join(root, 'products.json');
      await fs.writeFile(productsFile, JSON.stringify(result.products));
      const store = createCatalogStore({
        productsFile,
        overridesFile: path.join(root, 'absent'),
        catalogOverridesFile: path.join(root, 'absent2'),
      });
      expect((await store.loadCatalogProducts()).map((p) => p.id)).toEqual([1]);
      expect(await store.findProductBySlug('synthetic-1')).toMatchObject({
        price: 222.34,
        stock: 88,
      });
      expect(await store.findProductBySlug('synthetic-2')).toMatchObject({
        dataStatus: 'pending',
        price: null,
        stock: null,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('updates good rows, isolates bad/new rows, distinguishes genuine disappearance and restores known cards on correction', async () => {
    const previous = [
      product(1, 'ВВГ 3х1'),
      product(2, 'ВВГ 3х2'),
      product(3, 'ВВГ 3х3'),
      product(4, 'ВВГ 3х4'),
    ];
    const mixed = prepare(previous, [
      header,
      ['ВВГ 3х1', 'м', 222.34, 88],
      ['ВВГ 3х2', '', 12345, 0.5],
      ['ВВГ 3х3', 'м', '1.234,56', 10],
      ['ВВГ 3х5', '', 100, 10],
    ]);
    expect(mixed.products).toHaveLength(3);
    expect(mixed.products.find((p) => p.id === 1)).toMatchObject({
      price: 222.34,
      stock: 88,
    });
    expect(mixed.pendingProducts.map((p) => p.id)).toEqual([2, 3]);
    for (const p of mixed.pendingProducts)
      expect(p).toMatchObject({
        dataStatus: 'pending',
        price: null,
        stock: null,
        unit: null,
        description: 'Данные уточняются',
      });
    expect(mixed.absentProducts.map((p) => p.id)).toEqual([4]);
    expect(mixed.parsed.reviewRows).toHaveLength(3);
    expect(mixed.parsed.reviewRows.map((p) => p.sourceCells.price)).toEqual([
      'C3',
      'C4',
      'C5',
    ]);
    const guard = evaluatePublishGuard({
      config: { minProducts: 1, maxRemovedPercent: 100 },
      previousProducts: previous,
      products: mixed.products,
      diff: buildDiff(previous, mixed.products),
      rowErrors: mixed.diagnostics.errors,
      reviewRows: mixed.parsed.reviewRows,
      totalRows: 5,
      sourceProductCount: 4,
    });
    expect(guard.ok).toBe(true);
    expect(guard.warnings.map((p) => p.key)).toContain('maxErrors');
    expect(buildDiff(previous, mixed.products).priceChanged).toHaveLength(1);
    expect(
      buildHistorySnapshot(mixed.products, { generatedAt: '2026-10-27' })
        .unitPrices
    ).toEqual({ м: [222.34] });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'partial-release-'));
    try {
      await fs.mkdir(path.join(root, 'dist'));
      await writeCatalogRendererFixture(path.join(root, 'dist'));
      await fs.mkdir(path.join(root, 'shared'));
      await fs.writeFile(
        path.join(root, 'dist/index.html'),
        '<!doctype html><html><head><title>Fixture</title></head><body><div id="root"></div></body></html>'
      );
      await fs.writeFile(path.join(root, 'shared/categories.json'), '{}');
      const catalogDir = path.join(root, 'data/catalog-current'),
        publicDir = path.join(catalogDir, 'public');
      const options = {
        projectRoot: root,
        catalogDir,
        publicDir,
        outputFile: path.join(catalogDir, 'products.json'),
        registryFile: path.join(catalogDir, 'productRegistry.json'),
        reportFile: path.join(root, 'data/report.json'),
        reportHtmlFile: path.join(root, 'data/report.html'),
        historyFile: path.join(root, 'data/history.json'),
        publicPriceFile: path.join(publicDir, 'price.xls'),
        redirectsFile: path.join(publicDir, 'redirects.json'),
        redirectsNginxFile: path.join(publicDir, 'redirects.nginx.conf'),
        inputFile: path.join(root, 'data/price.xls'),
        categoriesFile: path.join(root, 'shared/categories.json'),
        runtimePrerenderTemplateDir: path.join(root, 'dist'),
        siteUrl: 'https://example.com',
        products: mixed.products,
        registry: mixed.registry,
        report: {
          summary: {},
          reviewRows: mixed.parsed.reviewRows,
          skippedRows: mixed.parsed.skippedRows,
          diagnostics: mixed.diagnostics,
          sourceDisposition: mixed.report,
        },
        sourcePriceBuffer: Buffer.from('synthetic source'),
        slugRedirects: {},
        importConfig: { suspiciousPriceStats: { historyLimit: 8 } },
        importHistory: { imports: [] },
        generatedAt: '2026-10-27T00:00:00Z',
        source: { kind: 'local' },
      };
      await publishImportArtifacts(options);
      const saved = JSON.parse(await fs.readFile(options.outputFile, 'utf8'));
      const store = createCatalogStore({
        productsFile: options.outputFile,
        overridesFile: path.join(root, 'absent'),
        catalogOverridesFile: path.join(root, 'absent2'),
      });
      expect((await store.loadCatalogProducts()).map((p) => p.id)).toEqual([1]);
      expect(await store.findProductBySlug('synthetic-2')).toMatchObject({
        dataStatus: 'pending',
        price: null,
        stock: null,
      });
      expect(await store.findProductBySlug('synthetic-4')).toBeNull();
      const { createApp } = await import('../../server.js');
      const app = createApp({
        env: { FORMS_ENABLED: 'false', SITE_URL: 'https://example.com' },
        catalogStore: store,
        chatStore: {},
        vkBridge: {},
      });
      const api = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => api.once('listening', resolve));
      try {
        const base = 'http://127.0.0.1:' + api.address().port;
        expect(
          (await (await fetch(base + '/api/products')).json()).items.map(
            (p) => p.id
          )
        ).toEqual([1]);
        expect(
          (await (await fetch(base + '/api/products/synthetic-2')).json()).item
        ).toMatchObject({ dataStatus: 'pending', price: null, stock: null });
        expect((await fetch(base + '/api/products/synthetic-4')).status).toBe(
          404
        );
        const lookup = await (
          await fetch(base + '/api/products/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [1, 2, 4] }),
          })
        ).json();
        expect(lookup.found.map((p) => p.id)).toEqual([1]);
        expect(lookup.pending).toEqual([2]);
        expect(lookup.missing).toEqual([2, 4]);
      } finally {
        api.closeAllConnections();
        await new Promise((resolve) => api.close(resolve));
      }

      const html = await fs.readFile(
        path.join(publicDir, 'product/synthetic-2.html'),
        'utf8'
      );
      expect(html).toContain('Данные уточняются');
      expect(html).toContain('data-client-render="true"');
      expect(html).not.toContain('"@type":"Offer"');
      expect(html).not.toContain('"price":102');
      const xml = await fs.readFile(
        path.join(publicDir, 'sitemap-products.xml'),
        'utf8'
      );
      expect(xml).toContain('/product/synthetic-1');
      expect(xml).not.toContain('/product/synthetic-2');
      expect(xml).not.toContain('/product/synthetic-4');
      expect(
        await assertProductPrerenderCoverage({ publicDir, products: saved })
      ).toMatchObject({ htmlCount: 3, sitemapCount: 1 });
      const { createBackup, restoreBackup } = await import('../backupData.js');
      const backup = await createBackup({
        projectPath: root,
        env: {},
        backupId: 'mixed',
      });
      const pointer = await fs.readlink(catalogDir);
      await expect(
        publishImportArtifacts({
          ...options,
          runtimePrerenderTemplateDir: path.join(root, 'missing'),
        })
      ).rejects.toThrow();
      expect(await fs.readlink(catalogDir)).toBe(pointer);
      await expect(
        publishImportArtifacts({
          ...options,
          products: [{ ...mixed.pendingProducts[0], price: 102 }],
        })
      ).rejects.toThrow(/Небезопасные/);
      expect(await fs.readlink(catalogDir)).toBe(pointer);
      const fixed = prepare(mixed.products, [
        header,
        ['ВВГ 3х1', 'м', 223, 90],
        ['ВВГ 3х2', 'м', 333, 12],
      ]);
      expect(fixed.products.find((p) => p.id === 2)).toMatchObject({
        price: 333,
        stock: 12,
      });
      expect(fixed.pendingProducts).toEqual([]);
      expect(fixed.absentProducts.map((p) => p.id)).toEqual([3]);
      await publishImportArtifacts({ ...options, products: fixed.products });
      expect(await store.findProductBySlug('synthetic-2')).toMatchObject({
        id: 2,
        price: 333,
        stock: 12,
      });
      expect(store.getPendingProducts()).toEqual([]);
      await restoreBackup(backup.backupPath, {
        projectPath: root,
        apply: true,
      });
      expect(await store.findProductBySlug('synthetic-2')).toMatchObject({
        dataStatus: 'pending',
        price: null,
        stock: null,
      });
      await publishImportArtifacts({ ...options, products: fixed.products });
      const gone = prepare(fixed.products, [header, ['ВВГ 3х1', 'м', 224, 91]]);
      await publishImportArtifacts({ ...options, products: gone.products });
      expect(await store.findProductBySlug('synthetic-2')).toBeNull();
      await expect(
        fs.access(path.join(publicDir, 'product/synthetic-2.html'))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('preserves the second duplicate identity when the first row is quarantined', () => {
    const parsed = extractProducts([
      header,
      ['ВВГ 3х1', 'м', 'broken', 5],
      [],
      ['ВВГ 3х1', 'м', 250, 8],
    ]);
    const classified = classifyEligibleProducts(parsed.products, parsed);
    const registry = { version: 1, nextId: 1, entries: {} };
    const originalIndex = indexSourceIdentities(classified, registry);
    const previous = classified.map((p) => ({
      ...p,
      ...assignStableIdentity(registry, p, '2026-10-26', {
        identityDiscriminator: originalIndex.get(sourcePosition(p))
          .identityDiscriminator,
      }),
    }));
    const indexed = indexSourceIdentities(classified, registry);
    const diagnostics = validateNormalizedProducts(classified);
    const { eligible } = quarantineInvalidProducts(
      classified,
      diagnostics.errors,
      parsed.reviewRows
    );
    expect(eligible).toHaveLength(1);
    const active = eligible.map((p) => ({
      ...p,
      ...assignStableIdentity(registry, p, '2026-10-27', {
        identityDiscriminator: indexed.get(sourcePosition(p))
          .identityDiscriminator,
      }),
    }));
    expect(active[0].id).toBe(previous[1].id);
    expect(active[0].slug).toBe(previous[1].slug);
    const finished = finishPartialImport(
      previous,
      active,
      resolveSourcePresence(previous, parsed.sourceObservations, indexed)
    );
    expect(finished.pendingProducts.map((p) => p.id)).toEqual([previous[0].id]);
    expect(new Set(finished.products.map((p) => p.id)).size).toBe(2);
  });
  it('holds unidentifiable disappearances without assigning an anonymous bad row to a guessed SKU', () => {
    const previous = [product(1, 'ВВГ 3х1'), product(2, 'ВВГ 3х2')];
    const mixed = prepare(previous, [
      header,
      ['ВВГ 3х1', 'м', 222, 3],
      ['', 'м', 100, 5],
    ]);
    expect(mixed.pendingProducts.map((p) => p.id)).toEqual([2]);
    expect(mixed.absentProducts).toEqual([]);
    expect(mixed.report.pending[0].evidence).toBe('source_identity_unresolved');
    expect(mixed.report.unresolvedIdentity[0].sourceCells.name).toBe('A3');
  });
  it('keeps source and global-safety failures blocking while row-quality limits are advisory', () => {
    expect(
      evaluatePublishGuard({
        products: [{}],
        sourceProductCount: 100,
        rowErrors: [{}],
        reviewRows: Array.from({ length: 90 }, () => ({})),
        totalRows: 100,
      }).ok
    ).toBe(true);
    expect(
      evaluatePublishGuard({ products: [{}], sourceProductCount: 1 }).ok
    ).toBe(false);
    expect(
      evaluatePublishGuard({
        products: [{}],
        sourceProductCount: 100,
        sourceErrors: [{ message: 'source failure' }],
      }).ok
    ).toBe(false);
    expect(
      evaluatePublishGuard({ products: [], sourceProductCount: 100 }).ok
    ).toBe(false);
  });
});
