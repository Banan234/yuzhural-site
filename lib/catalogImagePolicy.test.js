import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createCatalogStore } from './catalog.js';
import {
  approvedCableImagePath,
  getProductImage,
  withCatalogImagePolicy,
} from '../shared/productImages.js';
import { CABLE_STYLE_REVIEW_CHECKS } from '../scripts/lib/cableCoreGeometry.js';
import { classifyPracticalCableVisualProduct } from '../scripts/lib/familyVisualRules.js';
import { digest } from '../scripts/lib/cableStyleBatch.js';
import { prerenderProducts } from '../scripts/prerender.js';
import rules from '../data/cableVisualClassificationRules.json' with { type: 'json' };
import familyVisualRules from '../data/familyVisualRules.json' with { type: 'json' };
import knowledge from '../shared/designationKnowledgeBase.json' with { type: 'json' };
import colorRules from '../data/cableImageColors.json' with { type: 'json' };

const legacy = '/product-images/generated/vvg__3core.png';
const placeholder = '/category-placeholders/power-cable.svg';
const product = {
  id: 1,
  sku: 'TEST-1',
  slug: 'test-cable',
  name: 'ВВГ 3x1.5',
  sourceName: 'ВВГ 3x1.5',
  mark: 'ВВГ',
  category: 'Силовой кабель',
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  catalogCategorySlug: 'silovoy-kabel',
  cores: 3,
  crossSection: 1.5,
  price: 100,
  stock: 5,
  unit: 'м',
};
const { visualKey, visualProfile } = classifyPracticalCableVisualProduct(
  product,
  {
    rules,
    familyVisualRules,
    knowledge,
    colorRules,
  }
);
const approved = {
  status: 'APPROVED',
  APPROVED_FOR_CATALOG: true,
  APPROVED_AS_REFERENCE: false,
  visualKey,
  profileHash: digest(visualProfile),
  draftKey: 'a'.repeat(64),
  sha256: 'b'.repeat(64),
  standardVersion: 'approved-cable-style-1.1.0',
  referenceSha256: 'c'.repeat(64),
};
const binding = {
  status: 'approved',
  kind: 'generated-illustration',
  visualKey,
  image: approvedCableImagePath(approved),
  sha256: approved.sha256,
  styleVersion: approved.standardVersion,
  referenceSha256: approved.referenceSha256,
  productId: product.id,
  productName: product.name,
  primaryCores: 3,
  section: 1.5,
  manualReview: {
    status: 'APPROVED',
    sha256: approved.sha256,
    checks: Object.fromEntries(
      CABLE_STYLE_REVIEW_CHECKS.map((check) => [check, true])
    ),
  },
};
const policy = (entry = binding, approval = approved, revision = 'policy') => ({
  revision,
  manifest: { bySku: { [product.sku]: entry } },
  registry: { byVisualKey: approval ? { [visualKey]: approval } : {} },
});

it('requires permanent catalog approval, exact PNG identity and exact construction', () => {
  const resolve = (row, ...args) =>
    withCatalogImagePolicy(policy(...args), () => getProductImage(row));
  expect(resolve(product)).toBe(binding.image);
  expect(resolve(product, binding, null)).toBe(placeholder);
  expect(
    resolve(product, binding, { ...approved, status: 'NEEDS_REVIEW' })
  ).toBe(placeholder);
  expect(
    resolve(product, binding, {
      ...approved,
      APPROVED_FOR_CATALOG: false,
      APPROVED_AS_REFERENCE: true,
    })
  ).toBe(placeholder);
  expect(resolve(product, { ...binding, image: legacy })).toBe(placeholder);
  expect(resolve({ ...product, sku: 'NEW-1', image: binding.image })).toBe(
    placeholder
  );
  expect(resolve({ ...product, voltage: 6, image: binding.image })).toBe(
    placeholder
  );
  expect(resolve({ ...product, image: '/photos/manual.webp' })).toBe(
    '/photos/manual.webp'
  );
});

it('filters legacy raw images and matchers after a catalog update and in rebuilt product HTML', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'catalog-image-policy-')
  );
  const productsFile = path.join(root, 'products.json');
  const overridesFile = path.join(root, 'priceOverrides.json');
  const write = (file, value) => fs.writeFile(file, JSON.stringify(value));
  try {
    await write(productsFile, [product]);
    const store = createCatalogStore({ productsFile, overridesFile });
    const load = async (state) =>
      withCatalogImagePolicy(
        state,
        async () => (await store.loadCatalogProducts())[0].image
      );
    expect(await load(policy())).toBe(binding.image);
    const legacyMapping = policy({ ...binding, image: legacy }, null, 'legacy');
    expect(await load(legacyMapping)).toBe(placeholder);
    const reimported = { ...product, image: legacy };
    await write(productsFile, [reimported]);
    await write(overridesFile, {
      overrides: { [product.name]: { image: legacy } },
      matchers: [{ mark: product.mark, image: legacy }],
    });
    expect(await load(legacyMapping)).toBe(placeholder);
    const render = async () =>
      withCatalogImagePolicy(legacyMapping, () =>
        prerenderProducts(
          '<!doctype html><html><head><title>Test</title></head><body><div id="root"></div></body></html>',
          [reimported],
          { outputDir: root, overridesPath: overridesFile, log: null }
        )
      );
    await render();
    const html = await fs.readFile(
      path.join(root, 'product/test-cable.html'),
      'utf8'
    );
    expect(html).toContain(placeholder);
    expect(html).not.toContain(legacy);
    await write(overridesFile, {
      overrides: { [product.name]: { image: '/photos/manual.webp' } },
    });
    await render();
    expect(
      await fs.readFile(path.join(root, 'product/test-cable.html'), 'utf8')
    ).toContain('/photos/manual.webp');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
