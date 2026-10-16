import fs from 'node:fs';
import path from 'node:path';
import catalogCategories from '../shared/catalogCategories.json' with { type: 'json' };
import { normalizeCatalogHierarchy } from '../shared/catalogCategoryHierarchy.js';
import { WIRE_SUBCATEGORY_SOURCES } from '../shared/wireClassification.js';

const inputPath = process.argv[2] || 'data/catalog-current/products.json';
const reportPath = process.argv[3] || '';
const products = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const wires = products.filter(
  (product) => product.catalogCategorySlug === 'provoda'
);
const wireCategory = catalogCategories.sections
  .flatMap((section) => section.categories)
  .find((category) => category.slug === 'provoda');
const definedSlugs = new Set(
  wireCategory.subcategories.map((entry) => entry.slug)
);
const rows = wires.map((product) => {
  const placement = normalizeCatalogHierarchy(product);
  return {
    sku: product.sku,
    name: product.name,
    mark: product.mark,
    sourceCategory: product.sourceCategory,
    category: placement.catalogCategorySlug,
    subcategory: placement.catalogSubcategorySlug,
    reference:
      WIRE_SUBCATEGORY_SOURCES[placement.catalogSubcategorySlug] || null,
  };
});
const countBySubcategory = Object.fromEntries(
  wireCategory.subcategories.map((entry) => [
    entry.slug,
    rows.filter((row) => row.subcategory === entry.slug).length,
  ])
);
const unresolved = rows.filter(
  (row) => row.category === 'provoda' && !row.subcategory
);
const movedFromWires = rows.filter((row) => row.category !== 'provoda');
const invalid = rows.filter(
  (row) =>
    row.category === 'provoda' &&
    row.subcategory &&
    !definedSlugs.has(row.subcategory)
);
const emptySubcategories = Object.entries(countBySubcategory)
  .filter(([, count]) => count === 0)
  .map(([slug]) => slug);
const report = {
  input: inputPath,
  originalWirePositions: wires.length,
  countBySubcategory,
  movedFromWires: movedFromWires.length,
  unresolved,
  emptySubcategories,
  invalid,
  rows,
};

if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(
  JSON.stringify(
    {
      originalWirePositions: report.originalWirePositions,
      countBySubcategory,
      movedFromWires: report.movedFromWires,
      unresolved,
      emptySubcategories,
      invalid,
    },
    null,
    2
  )
);

if (
  invalid.length ||
  emptySubcategories.length ||
  unresolved.some((row) => row.name !== 'ПБПЭ 2х0.35')
) {
  process.exitCode = 1;
}
