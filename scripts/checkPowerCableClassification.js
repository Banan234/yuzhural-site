// Воспроизводимая проверка распределения актуального каталога без переимпорта прайса.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCatalogProducts } from '../lib/catalog.js';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const outputDir = path.resolve(
  projectRoot,
  process.argv[2] || 'outputs/power-cable-classification'
);
const rawProducts = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, 'data/catalog-current/products.json'),
    'utf8'
  )
);
const definitions = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, 'shared/catalogCategories.json'),
    'utf8'
  )
);
const category = definitions.sections
  .flatMap((section) => section.categories)
  .find((entry) => entry.slug === 'silovoy-kabel');
const products = await loadCatalogProducts();
const powerProducts = products.filter(
  (product) => product.catalogCategorySlug === category.slug
);
const rawBySku = new Map(rawProducts.map((product) => [product.sku, product]));
const groups = category.subcategories.map((entry) => ({
  name: entry.name,
  slug: entry.slug,
  count: powerProducts.filter(
    (product) => product.catalogSubcategorySlug === entry.slug
  ).length,
}));
const knownSlugs = new Set(groups.map((group) => group.slug));
const unassigned = powerProducts.filter(
  (product) => !knownSlugs.has(product.catalogSubcategorySlug)
);
assert.equal(unassigned.length, 0, 'Есть силовые позиции без подкатегории');
assert.equal(
  groups.reduce((sum, group) => sum + group.count, 0),
  powerProducts.length
);
assert.equal(
  new Set(powerProducts.map((product) => product.sku)).size,
  powerProducts.length,
  'Повторный SKU'
);

const rows = powerProducts.map((product) => {
  const raw = rawBySku.get(product.sku);
  assert.ok(raw, `Отсутствует исходный SKU ${product.sku}`);
  for (const field of ['slug', 'price', 'stock'])
    assert.equal(
      product[field],
      raw[field],
      `${product.sku}: изменено ${field}`
    );
  return {
    sku: product.sku,
    name: product.name,
    mark: product.mark,
    slug: product.slug,
    previousCategory: raw.catalogCategorySlug,
    subcategory: product.catalogSubcategory,
    subcategorySlug: product.catalogSubcategorySlug,
  };
});
const reviews = rows
  .filter((product) => product.mark === 'КПВП')
  .map((product) => ({
    ...product,
    reason:
      'Предварительно ПВХ по обозначению и существующей группе «Лифтовые силовые». Первичный каталог изготовителя не найден; требуется паспорт поставщика для подтверждения материала изоляции.',
  }));
const report = {
  generatedAt: new Date().toISOString(),
  catalogProducts: products.length,
  previousPowerProducts: rawProducts.filter(
    (product) => product.catalogCategorySlug === category.slug
  ).length,
  powerProducts: powerProducts.length,
  movedFromFlexible: rows.filter(
    (product) => product.previousCategory === 'gibkiy-kabel'
  ).length,
  unassigned: unassigned.length,
  groups,
  reviews,
  products: rows,
};
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, 'distribution.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
await fs.writeFile(
  path.join(outputDir, 'distribution.md'),
  [
    '# Подкатегории силового кабеля',
    '',
    `Распределено ${report.powerProducts} позиций; из гибких перенесено ${report.movedFromFlexible}. Без группы: ${report.unassigned}. SKU, URL, цена и остаток сохранены.`,
    '',
    '| Подкатегория | Позиции |',
    '| --- | ---: |',
    ...groups.map((group) => `| ${group.name} | ${group.count} |`),
    '',
    'Порядок при пересечении признаков: бумажная изоляция → броня → резина → полимерные композиции → СПЭ → ПВХ. Бронированные СПЭ относятся к броне; бумажные бронированные остаются в бумажной группе. ППГ не относится к СПЭ. Безгалогенная оболочка сама по себе не доказывает безгалогенную изоляцию.',
    '',
    'Резиновая группа объединяет гибкие и стационарные кабели с резиновой изоляцией. КГПП, КГпВэВ, РПШ, РКГМ, КНР и специальные/импортные категории не переносятся.',
    '',
    '## Проверка по первичным источникам для сложных серий',
    '',
    '- К9РВСБПМ: ЭПР и броня — https://www.mkm.ru/helpful-information/kabel-k9rvsbpmng-a-hf/',
    '- MEDIASTRIP: ЭПР — https://uglichcable.ru/catalog/cables-mediastrip/',
    '- НРГ: стационарный кабель с резиновой изоляцией — https://www.rkz.ru/f/1/RKZ_Katalog.pdf',
    '- АсКГ и АсКГН: гибкие серии — https://flex-cable.bgkz.ru/',
    '',
    '## Требует подтверждения паспортом',
    '',
    ...reviews.map(
      (product) => `- ${product.sku}, ${product.name}: ${product.reason}`
    ),
    '',
    'Полный построчный список распределения находится в distribution.json. Проверка покрытия не заменяет сверку паспортов каждого производителя.',
    '',
  ].join('\n')
);
console.log(
  JSON.stringify(
    { ...report, products: undefined, reviews: reviews.map((row) => row.sku) },
    null,
    2
  )
);
