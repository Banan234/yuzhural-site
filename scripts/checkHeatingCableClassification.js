import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { normalizeCatalogHierarchy } from '../shared/catalogCategoryHierarchy.js';
import {
  HEATING_CABLE_CATEGORY_SLUG,
  getHeatingCablePlacement,
} from '../shared/heatingCableClassification.js';
import { classifyProduct } from './lib/catalogClassifier.js';

const inputPath = process.argv[2] || 'data/catalog-current/products.json';
const outputPath = process.argv[3];
const products = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const selected = products.filter(
  (p) => p.catalogCategorySlug === HEATING_CABLE_CATEGORY_SLUG
);
const rows = selected.map((product) => {
  const placement = getHeatingCablePlacement(product);
  const runtime = normalizeCatalogHierarchy(product);
  const imported = classifyProduct(product);
  assert.equal(
    imported.catalogCategorySlug,
    runtime.catalogCategorySlug,
    product.sku
  );
  assert.equal(
    imported.catalogSubcategorySlug || '',
    runtime.catalogSubcategorySlug || '',
    product.sku
  );
  assert.deepEqual(
    normalizeCatalogHierarchy({ ...product, ...runtime }),
    runtime,
    product.sku
  );
  return {
    sku: product.sku,
    sourceName: product.sourceName,
    mark: product.mark,
    originalCategory: product.catalogCategorySlug,
    ...runtime,
    rule: placement?.rule || 'unresolved',
    reference: placement?.reference || null,
    ...(placement?.rule === 'dph'
      ? {
          note: 'В исходнике DHP-10; сопоставлено с DPH-10 V2 по обозначению V2, мощности 20/40 W и исполнению с вилкой. Исходное название сохранено.',
        }
      : {}),
  };
});
const countBySubcategory = {};
for (const row of rows.filter(
  (r) =>
    r.catalogCategorySlug === HEATING_CABLE_CATEGORY_SLUG &&
    r.catalogSubcategorySlug
)) {
  countBySubcategory[row.catalogSubcategorySlug] =
    (countBySubcategory[row.catalogSubcategorySlug] || 0) + 1;
}
const unresolved = rows.filter(
  (r) =>
    r.catalogCategorySlug === HEATING_CABLE_CATEGORY_SLUG &&
    !r.catalogSubcategorySlug
);
const moved = rows.filter(
  (r) => r.catalogCategorySlug !== HEATING_CABLE_CATEGORY_SLUG
);
const allRuntime = products.map((p) => ({
  ...p,
  ...normalizeCatalogHierarchy(p),
}));
assert.equal(
  new Set(allRuntime.map((p) => p.sku)).size,
  products.length,
  'Артикулы должны быть уникальны'
);
const summary = {
  originalPositions: selected.length,
  parentPositions: selected.length - moved.length,
  countBySubcategory,
  unresolved,
  moved,
  catalogPositions: allRuntime.length,
  uniqueSkus: new Set(allRuntime.map((p) => p.sku)).size,
  importRuntimeDifferences: 0,
};
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ ...summary, rows }, null, 2) + '\n'
  );
}
console.log(JSON.stringify(summary, null, 2));
