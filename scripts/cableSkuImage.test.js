import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { archiveApprovedCableResult } from './lib/cableApprovedResults.js';
import { CABLE_STYLE_REVIEW_CHECKS } from './lib/cableCoreGeometry.js';
import { galleryPlacement } from './lib/cableGalleryPlacement.js';
import { digest } from './lib/cableStyleBatch.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runCableSkuBatch, runCableSkuImage } from './cableSkuImage.js';
import {
  buildCableGallery,
  describeCableGalleryItem,
} from './lib/cableGallery.js';
import { commitGalleryReviews } from './lib/cableGalleryJournal.js';
import {
  indexCableSkuCards,
  readCableSkuImageFacts,
} from './lib/cableSkuImageFacts.js';
import {
  catalogCableSpecs,
  writeCatalogImageFixture,
} from './lib/fixtures/cableCatalogFixture.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const product = {
  id: 1,
  sku: 'TEST-A',
  slug: 'test-a',
  name: 'ВВГ 2х1.5',
  sourceName: 'ВВГ 2х1.5',
  mark: 'ВВГ',
  markFamily: 'ВВГ',
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  cores: 2,
  crossSection: 1.5,
  price: 100,
  stock: 10,
  unit: 'м',
  specs: catalogCableSpecs,
};
const other = {
  ...product,
  id: 2,
  sku: 'TEST-B',
  slug: 'test-b',
  name: 'ВВГ 2х2.5',
  sourceName: 'ВВГ 2х2.5',
  crossSection: 2.5,
};
let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-sku-'));
  for (const dir of [
    'data/cable-approved-results',
    'data/product-image-metadata',
    'shared',
    'assets',
    'public/product-images/generated',
  ])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  for (const [file, data] of [
    ['shared/generatedProductImages.json', { bySku: {} }],
    ['data/cable-approved-results/registry.json', { byVisualKey: {} }],
  ])
    await fs.writeFile(path.join(root, file), JSON.stringify(data));
  await fs.cp(
    path.join(project, 'assets/cable-style-reference'),
    path.join(root, 'assets/cable-style-reference'),
    { recursive: true }
  );
  await fs.copyFile(
    path.join(project, 'cable-image-style.json'),
    path.join(root, 'cable-image-style.json')
  );
  await writeCatalogImageFixture(root, [product, other]);
});

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

test('previews, generates once, and binds only the requested SKU after manual review', async () => {
  const png = await fs.readFile(
    path.join(root, 'assets/cable-style-reference/simple.png')
  );
  const draft = PNG.sync.write(PNG.sync.read(png));
  const generate = vi.fn(async () => ({ buffer: draft, httpStatus: 200 }));
  const providerFactory = vi.fn(() => ({ generate }));
  const run = (sku, options = {}) =>
    runCableSkuImage({ root, sku, providerFactory, ...options });

  const preview = await run(product.sku);
  expect(preview).toMatchObject({
    status: 'PREPARED_NOT_SENT',
    sku: product.sku,
    request: { endpoint: 'images/edits' },
  });
  expect(providerFactory).not.toHaveBeenCalled();
  await expect(fs.stat(path.join(root, 'outputs'))).rejects.toMatchObject({
    code: 'ENOENT',
  });

  const result = await run(product.sku, { generate: true });
  const sha = result.validation.sha256;
  expect(result).toMatchObject({ status: 'NEEDS_REVIEW', sku: product.sku });
  expect(
    await fs.readFile(path.join(root, result.draftDir, 'image.png'))
  ).toEqual(draft);
  expect(generate.mock.calls[0][0].prompt).toBe(preview.request.prompt);
  await expect(run(product.sku, { bind: sha })).rejects.toThrow(
    'approve this exact PNG'
  );
  await expect(run(product.sku, { generate: true })).resolves.toMatchObject({
    status: 'PENDING_REVIEW',
  });
  expect(generate).toHaveBeenCalledTimes(1);

  const gallery = await buildCableGallery(root, { queueEnabled: false, archive: false });
  const view = describeCableGalleryItem(gallery, gallery.files.get(sha));
  await commitGalleryReviews(gallery, {
    reviewer: 'Fixture',
    catalog: 'APPROVED',
    rows: [
      {
        sha256: sha,
        revision: view.reviewRevision,
        visualKey: preview.visualKey,
        checks: Object.fromEntries(
          view.requirements.required.map((key) => [key, true])
        ),
      },
    ],
  });
  await expect(run(other.sku)).resolves.toMatchObject({
    status: 'APPROVED_DRAFT_NOT_PUBLISHED',
    sha256: sha,
  });
  const binding = await run(other.sku, { bind: sha });
  expect(binding).toMatchObject({
    status: 'APPLIED',
    sku: other.sku,
    sha256: sha,
  });
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, 'shared/generatedProductImages.json'),
      'utf8'
    )
  );
  expect(Object.keys(manifest.bySku)).toEqual([other.sku]);
  await expect(run(other.sku, { generate: true })).resolves.toMatchObject({
    status: 'EXISTING_STANDARD_APPROVED',
  });
  await fs.unlink(path.join(root, 'public', binding.image.slice(1)));
  await expect(run(other.sku, { generate: true })).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(generate).toHaveBeenCalledTimes(1);
}, 15000);

test('protects a manual photo and stops on missing or insufficient catalog data', async () => {
  const providerFactory = vi.fn();
  await writeCatalogImageFixture(root, [
    { ...product, image: '/manual-photo.png' },
    {
      ...other,
      name: 'НЕИЗВЕСТНЫЙ 2х2.5',
      sourceName: 'НЕИЗВЕСТНЫЙ 2х2.5',
      mark: 'НЕИЗВЕСТНЫЙ',
      markFamily: 'НЕИЗВЕСТНЫЙ',
      specs: {},
    },
  ]);
  const run = (sku) =>
    runCableSkuImage({ root, sku, providerFactory, generate: true });
  await expect(run(product.sku)).rejects.toThrow(
    'manual/photo image is protected'
  );
  await expect(run(other.sku)).rejects.toThrow('NEEDS_TECHNICAL_REVIEW');
  await expect(run('SKU-MISSING')).rejects.toThrow(
    'catalog SKU missing or ambiguous'
  );
  expect(providerFactory).not.toHaveBeenCalled();
});

test('uses the containing card for nested offers and separates photo protection from generated bindings', () => {
  const grouped = {
    sku: product.sku,
    image: '/manual.png',
    offers: [{ sku: product.sku }, { sku: other.sku, image: '/offer.png' }],
  };
  const empty = { bySku: {} };
  const cards = indexCableSkuCards([grouped]);
  expect(cards.get(other.sku)).toBe(grouped);
  expect(
    readCableSkuImageFacts(other, cards.get(other.sku), empty, {
      byVisualKey: {},
    })
  ).toMatchObject({
    binding: null,
    hasPhoto: true,
    protected: true,
    generatedImage: '',
  });

  const overrides = { matchers: [{ mark: other.mark, image: '/manual.png' }] };
  expect(
    readCableSkuImageFacts(
      other,
      undefined,
      empty,
      { byVisualKey: {} },
      overrides
    )
  ).toMatchObject({ hasPhoto: false, protected: true, generatedImage: '' });
});

test('allows one new attempt for a gallery correction', async () => {
  const original = PNG.sync.read(await fs.readFile(path.join(root, 'assets/cable-style-reference/simple.png')));
  const firstPng = PNG.sync.write(original);
  original.data[0] ^= 1;
  const correctedPng = PNG.sync.write(original);
  const generate = vi.fn()
    .mockResolvedValueOnce({ buffer: firstPng, httpStatus: 200 })
    .mockResolvedValueOnce({ buffer: correctedPng, httpStatus: 200 });
  const run = correctionSourceSha => runCableSkuImage({
    root, sku: product.sku, generate: true, correctionSourceSha,
    providerFactory: () => ({ generate }),
  });
  const first = await run();
  const sha256 = first.validation.sha256;
  const gallery = await buildCableGallery(root, { queueEnabled: false, archive: false });
  const item = describeCableGalleryItem(gallery, gallery.files.get(sha256));
  await commitGalleryReviews(gallery, {
    reviewer: 'Fixture', catalog: 'NEEDS_CORRECTION', correction: { reason: 'Положение жил' },
    rows: [{ sha256, revision: item.reviewRevision, visualKey: item.visualKey }],
  });
  const updated = await buildCableGallery(root, { queueEnabled: false, archive: false });
  expect(describeCableGalleryItem(updated, updated.files.get(sha256)).retrySku).toBe(product.sku);
  const corrected = await run(sha256);
  expect(corrected.status).toBe('NEEDS_REVIEW');
  expect(corrected.validation.sha256).not.toBe(sha256);
  expect((await run(sha256)).status).toBe('PENDING_REVIEW');
  expect(generate).toHaveBeenCalledTimes(2);
}, 15000);

test('runs distinct visual groups sequentially through the single-SKU workflow', async () => {
  const third = {
    ...other, sku: 'TEST-C', slug: 'test-c', id: 3,
    name: 'ВВГ 1х2.5', sourceName: 'ВВГ 1х2.5', cores: 1,
  };
  await writeCatalogImageFixture(root, [product, other, third]);
  const png = await fs.readFile(path.join(root, 'assets/cable-style-reference/simple.png'));
  const generate = vi.fn(async () => ({ buffer: png, httpStatus: 200 }));
  const options = { root, skus: [product.sku, other.sku, third.sku], providerFactory: () => ({ generate }) };
  const preview = await runCableSkuBatch(options);
  expect(preview.map(({ sku, skus, status }) => ({ sku, skus, status }))).toEqual([
    { sku: product.sku, skus: [product.sku, other.sku], status: 'PREPARED_NOT_SENT' },
    { sku: third.sku, skus: [third.sku], status: 'PREPARED_NOT_SENT' },
  ]);
  expect(generate).not.toHaveBeenCalled();
  const generated = await runCableSkuBatch({ ...options, generate: true });
  expect(generated.map(row => row.status)).toEqual(['NEEDS_REVIEW', 'NEEDS_REVIEW']);
  expect(generated.map(row => row.draftDir)).not.toContain(undefined);
  expect(generate).toHaveBeenCalledTimes(2);
  expect((await runCableSkuBatch({ ...options, generate: true })).map(row => row.status))
    .toEqual(['PENDING_REVIEW', 'PENDING_REVIEW']);
  expect(generate).toHaveBeenCalledTimes(2);
});

test('lists compatible approvals from another family and binds a manually chosen alternative', async () => {
  const variant = (sku, name, markFamily, crossSection, attributes) => ({
    ...product, sku, slug: sku.toLowerCase(), id: Number(sku.slice(-1)),
    name, sourceName: name, mark: markFamily, markFamily, cores: 1,
    catalogCategorySlug: 'silovoy-kabel', crossSection, attributes, specs: {},
  });
  const standard = variant('TEST-1', 'ВВГ 1х4', 'ВВГ', 4, []);
  const otherMark = variant('TEST-2', 'ВВГнг(А) 1х4', 'ВВГ', 4, ['нг(А)']);
  const target = variant('TEST-3', 'ППГнг(А)-HF 1х10', 'ППГ', 10, ['нг(А)-HF']);
  await writeCatalogImageFixture(root, [standard, otherMark, target]);
  const source = PNG.sync.read(await fs.readFile(path.join(root, 'assets/cable-style-reference/simple.png')));
  const run = (sku, options = {}) => runCableSkuImage({ root, sku, ...options });
  // Simulate two intact approvals already in the registry, written in reverse priority.
  const previews = await Promise.all([run(otherMark.sku), run(standard.sku)]);
  const approvals = [];
  for (const preview of previews) {
    const draftDir = path.join(root, 'outputs', preview.sku);
    await fs.mkdir(draftDir, { recursive: true });
    source.data[0] ^= 1;
    const png = PNG.sync.write(source);
    const sha256 = digest(png);
    const { visualKey, request } = preview;
    await fs.writeFile(path.join(draftDir, 'image.png'), png);
    const group = { visualKey, profile: request.profile, standardVersion: request.standardVersion,
      referenceSha256: request.reference.sha256, draftKey: sha256, members: [{ sku: preview.sku }] };
    await archiveApprovedCableResult({
      root, draftDir, group,
      approval: { visualKey, sha256, standardVersion: group.standardVersion, status:'APPROVED',
        reviewer:'Fixture', APPROVED_FOR_CATALOG:true, reviewedAt:new Date().toISOString(),
        checks:Object.fromEntries(CABLE_STYLE_REVIEW_CHECKS.map(check => [check, true])) },
    });
    approvals.push({ visualKey, sha256 });
  }
  const preview = await run(target.sku);
  const [alternative, preferred] = approvals;
  expect(preview.sha256).toBe(preferred.sha256);
  expect(preview.alternatives).toEqual([alternative]);
  await expect(run(otherMark.sku)).resolves.toMatchObject({ sha256:preferred.sha256 });
  const gallery = await buildCableGallery(root, { queueEnabled:false, archive:false });
  expect(galleryPlacement(gallery, [alternative])[0].skus).toContain(target.sku);
  await expect(run(target.sku, { bind: alternative.sha256 })).resolves.toMatchObject({
    status:'APPLIED', sha256:alternative.sha256, sku:target.sku,
  });
  await expect(run(target.sku)).resolves.toMatchObject({
    status:'EXISTING_STANDARD_APPROVED', sha256:alternative.sha256,
  });
});
