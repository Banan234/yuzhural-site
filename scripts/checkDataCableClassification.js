import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import categories from '../shared/catalogCategories.json' with { type: 'json' };
import { normalizeCatalogHierarchy } from '../shared/catalogCategoryHierarchy.js';
import {
  DATA_CABLE_CATEGORY_SLUG,
  DATA_CABLE_SOURCE_CATEGORIES,
  getDataCablePlacement,
} from '../shared/dataCableClassification.js';
import { classifyProduct } from './lib/catalogClassifier.js';

const inputPath = process.argv[2] || 'data/catalog-current/products.json';
const outputPath = process.argv[3];
const products = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const selected = products.filter(
  (p) =>
    DATA_CABLE_SOURCE_CATEGORIES.has(p.catalogCategorySlug) ||
    getDataCablePlacement(p)
);
const definition = categories.sections
  .flatMap((s) => s.categories)
  .find((c) => c.slug === DATA_CABLE_CATEGORY_SLUG);
const countBySubcategory = Object.fromEntries(
  definition.subcategories.map((s) => [s.slug, 0])
);
const rows = selected.map((p) => {
  const placement = getDataCablePlacement(p);
  const normalized = normalizeCatalogHierarchy(p);
  assert.deepEqual(
    normalizeCatalogHierarchy({ ...p, ...normalized }),
    normalized,
    p.sku
  );
  if (
    normalized.catalogCategorySlug === DATA_CABLE_CATEGORY_SLUG &&
    normalized.catalogSubcategorySlug
  ) {
    assert(normalized.catalogSubcategorySlug in countBySubcategory, p.sku);
    countBySubcategory[normalized.catalogSubcategorySlug]++;
  }
  return {
    sku: p.sku,
    sourceName: p.sourceName,
    mark: p.mark,
    manufacturer: p.manufacturer,
    sourceCategory: p.sourceCategory,
    originalCategory: p.catalogCategorySlug,
    ...normalized,
    rule: placement?.rule || 'unresolved',
    reference: placement?.reference || null,
  };
});
const differences = [];
for (const p of products) {
  const runtime = normalizeCatalogHierarchy(p),
    imported = classifyProduct(p);
  if (
    runtime.catalogCategorySlug !== imported.catalogCategorySlug ||
    (runtime.catalogSubcategorySlug || '') !==
      (imported.catalogSubcategorySlug || '')
  )
    differences.push(p.sku);
}
assert.deepEqual(
  differences,
  [],
  'Классификация импорта должна совпадать с выдачей'
);
assert.equal(new Set(products.map((p) => p.sku)).size, products.length);
assert(
  Object.values(countBySubcategory).every(Boolean),
  'Все подкатегории должны иметь товары'
);
const summary = {
  originalPositions: selected.length,
  originalCounts: Object.fromEntries(
    [...new Set(selected.map((p) => p.catalogCategorySlug))].map((slug) => [
      slug,
      selected.filter((p) => p.catalogCategorySlug === slug).length,
    ])
  ),
  parentPositions: rows.filter(
    (r) => r.catalogCategorySlug === DATA_CABLE_CATEGORY_SLUG
  ).length,
  countBySubcategory,
  unresolved: rows.filter(
    (r) =>
      r.catalogCategorySlug === DATA_CABLE_CATEGORY_SLUG &&
      !r.catalogSubcategorySlug
  ),
  movedOut: rows.filter(
    (r) => r.catalogCategorySlug !== DATA_CABLE_CATEGORY_SLUG
  ),
  movedIn: rows.filter(
    (r) => !DATA_CABLE_SOURCE_CATEGORIES.has(r.originalCategory)
  ),
  catalogPositions: products.length,
  uniqueSkus: new Set(products.map((p) => p.sku)).size,
  importRuntimeDifferences: differences,
};
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ ...summary, rows }, null, 2) + '\n'
  );
}
console.log(
  JSON.stringify(
    {
      ...summary,
      unresolved: summary.unresolved.map(({ sku, sourceName }) => ({
        sku,
        sourceName,
      })),
      movedIn: summary.movedIn.length,
      movedOut: summary.movedOut.length,
    },
    null,
    2
  )
);
