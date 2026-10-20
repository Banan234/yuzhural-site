// Exhaustive self-lookup plus buyer-query checks against the current catalog.
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCatalogProducts } from '../lib/catalog.js';
import {
  searchCatalogProducts,
  getCatalogSearchCorrections,
} from '../shared/catalogSearch.js';

const products = await loadCatalogProducts();
const output = process.argv[2] || 'outputs/catalog-search-audit.json';
const failures = [],
  timings = [],
  scenarios = [];
const started = performance.now();
for (const product of products) {
  for (const [kind, query] of [
    ['title', product.title],
    ['sku', product.sku],
  ]) {
    if (!query) continue;
    const before = performance.now();
    const results = searchCatalogProducts(products, query);
    timings.push(performance.now() - before);
    if (!results.includes(product))
      failures.push({
        kind,
        query,
        sku: product.sku,
        resultCount: results.length,
      });
  }
}
const sections = [
  ...new Set(products.map((p) => p.crossSection).filter((n) => Number(n) > 0)),
];
for (const section of sections) {
  const query = String(section).replace('.', ',') + ' мм²';
  const results = searchCatalogProducts(products, query);
  const expected = products.filter(
    (p) => Number(p.crossSection) === Number(section)
  );
  if (
    results.length !== expected.length ||
    results.some((p) => Number(p.crossSection) !== Number(section))
  )
    failures.push({
      kind: 'section',
      query,
      expected: expected.length,
      actual: results.length,
    });
}
for (const query of [
  'ВВГ 185',
  'ВВГ 3х2,5',
  'ВВГ 3х2.5 нг(А)-LS',
  'vvgng(a)-ls 3x2.5',
  'ПУГВ6 белый',
  'СИП 4 4х16',
  'КПС 1х2х0,5',
  'СИП-2 3х50+1х54,6',
  'NYМ 2х1.5',
  'F/UTP cat.5e',
  'ВВГ 1 кВ',
  'ddu 3x2.5',
  'ПУГБ 6 белый',
  'несуществующаямарка 999',
]) {
  const results = searchCatalogProducts(products, query);
  scenarios.push({
    query,
    count: results.length,
    examples: results.slice(0, 3).map((p) => ({ sku: p.sku, title: p.title })),
    corrections: results.length
      ? []
      : getCatalogSearchCorrections(products, query),
  });
}
timings.sort((a, b) => a - b);
const report = {
  generatedAt: new Date().toISOString(),
  products: products.length,
  selfLookups: products.length * 2,
  sectionLookups: sections.length,
  failures,
  elapsedMs: Math.round(performance.now() - started),
  queryP95Ms: +timings[Math.floor(timings.length * 0.95)].toFixed(2),
  scenarios,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    products: products.length,
    selfLookups: report.selfLookups,
    failures: failures.length,
    p95Ms: report.queryP95Ms,
    elapsedMs: report.elapsedMs,
  })
);
if (failures.length) {
  console.log(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exitCode = 1;
}
