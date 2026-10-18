import fs from 'node:fs';
import path from 'node:path';
import categories from '../shared/catalogCategories.json' with { type: 'json' };
import { normalizeCatalogHierarchy } from '../shared/catalogCategoryHierarchy.js';
import {
  CONTROL_CABLE_CATEGORY_SLUG,
  CONTROL_CABLE_SOURCE_CATEGORIES,
  getControlCablePlacement,
} from '../shared/controlCableClassification.js';
import { classifyProduct } from './lib/catalogClassifier.js';

const inputPath = process.argv[2] || 'data/catalog-current/products.json';
const outputPath = process.argv[3] || '';
const products = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const selected = products.filter((product) =>
  CONTROL_CABLE_SOURCE_CATEGORIES.has(product.catalogCategorySlug)
);
const category = categories.sections
  .flatMap((section) => section.categories)
  .find((entry) => entry.slug === CONTROL_CABLE_CATEGORY_SLUG);
const definedSlugs = new Set(category.subcategories.map((entry) => entry.slug));
const importRuntimeDifferences = [];
const rows = selected.map((product) => {
  const normalized = normalizeCatalogHierarchy(product);
  const imported = classifyProduct(product);
  if (
    normalized.catalogCategorySlug !== imported.catalogCategorySlug ||
    normalized.catalogSubcategorySlug !== imported.catalogSubcategorySlug
  ) {
    importRuntimeDifferences.push(product.sku);
  }
  const rule = getControlCablePlacement(product);
  return {
    sku: product.sku,
    name: product.name,
    mark: product.mark,
    manufacturer: product.manufacturer,
    sourceCategory: product.sourceCategory,
    originalCategory: product.catalogCategorySlug,
    category: normalized.catalogCategorySlug,
    subcategory: normalized.catalogSubcategorySlug,
    rule: rule?.rule || 'unresolved',
    reference: rule?.reference || null,
  };
});
const counts = Object.fromEntries(
  category.subcategories.map((entry) => [
    entry.slug,
    rows.filter((row) => row.subcategory === entry.slug).length,
  ])
);
const unresolved = rows.filter(
  (row) => row.category === CONTROL_CABLE_CATEGORY_SLUG && !row.subcategory
);
const moved = rows.filter(
  (row) => row.category !== CONTROL_CABLE_CATEGORY_SLUG
);
const invalid = rows.filter(
  (row) =>
    row.category === CONTROL_CABLE_CATEGORY_SLUG &&
    row.subcategory &&
    !definedSlugs.has(row.subcategory)
);
const emptySubcategories = Object.entries(counts)
  .filter(([, count]) => !count)
  .map(([slug]) => slug);
const summary = {
  originalPositions: selected.length,
  originalCounts: Object.fromEntries(
    [...CONTROL_CABLE_SOURCE_CATEGORIES].map((slug) => [
      slug,
      selected.filter((product) => product.catalogCategorySlug === slug).length,
    ])
  ),
  countBySubcategory: counts,
  parentPositions: rows.filter(
    (row) => row.category === CONTROL_CABLE_CATEGORY_SLUG
  ).length,
  unresolved,
  moved,
  invalid,
  emptySubcategories,
  importRuntimeDifferences,
};
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({ ...summary, rows }, null, 2)}\n`
  );
}
console.log(
  JSON.stringify(
    {
      ...summary,
      unresolved: unresolved.map(({ sku, name }) => ({ sku, name })),
    },
    null,
    2
  )
);
if (
  invalid.length ||
  emptySubcategories.length ||
  importRuntimeDifferences.length
)
  process.exitCode = 1;
