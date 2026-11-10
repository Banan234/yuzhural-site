import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { classifyPracticalCableVisualProduct } from './lib/familyVisualRules.js';
import {
  VISUALIZATION_TYPES,
  withCableVisualization,
} from './lib/cableVisualizationType.js';
import { renderVisualizationTypeReport } from './lib/cableVisualizationReport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const historicalSource = 'outputs/cable-visual-practical-2026-10-16/audit.json';
const currentSource = 'data/catalog-current/products.json';
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function protectedSnapshot() {
  const files = [
    currentSource,
    'data/products.json',
    'shared/generatedProductImages.json',
    'shared/rejectedProductImages.json',
    historicalSource,
    'data/cableImageConfig.json',
    'data/cableImageColors.json',
    'data/familyVisualRules.json',
    'data/cableVisualClassificationRules.json',
  ];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(file);
      else files.push(file);
    }
  }
  await walk('public/product-images');
  await walk('data/product-image-metadata');
  const entries = [];
  for (const file of files.sort())
    entries.push([file, sha(await fs.readFile(path.join(root, file)))]);
  return Object.fromEntries(entries);
}

function summarize(rows) {
  const buckets = VISUALIZATION_TYPES.map((type) => {
    const items = rows.filter(
      (r) => r.visualProfile.visualizationType === type
    );
    return {
      type,
      products: items.length,
      visualKeys: new Set(items.map((r) => r.visualKey)).size,
    };
  });
  const keyTypes = new Map();
  for (const r of rows) {
    const set = keyTypes.get(r.visualKey) || new Set();
    set.add(r.visualProfile.visualizationType);
    keyTypes.set(r.visualKey, set);
  }
  const reasons = new Map();
  for (const r of rows.filter(
    (r) => r.visualProfile.visualizationType === 'NEEDS_REVIEW'
  ))
    for (const code of new Set(r.visualization.reasons.map((i) => i.code)))
      reasons.set(code, (reasons.get(code) || 0) + 1);
  const examples = {};
  for (const type of VISUALIZATION_TYPES) {
    const candidates = rows.filter(
        (r) => r.visualProfile.visualizationType === type
      ),
      chosen = [],
      families = new Set();
    for (const r of candidates) {
      if (families.has(r.baseFamily)) continue;
      families.add(r.baseFamily);
      chosen.push({
        sku: r.sku,
        name: r.displayName,
        family: r.baseFamily,
        cores: r.cores,
        visualKey: r.visualKey,
        visibleLayers: r.visualization.visibleLayerCount,
        reasons: r.visualization.reasons,
        rationale: r.visualization.rationale,
      });
      if (chosen.length >= (type === 'NEEDS_REVIEW' ? 20 : 5)) break;
    }
    examples[type] = chosen;
  }
  return {
    totalProducts: rows.length,
    uniqueVisualKeys: keyTypes.size,
    buckets,
    mixedStatusVisualKeys: [...keyTypes]
      .filter(([, types]) => types.size > 1)
      .map(([key, types]) => ({ visualKey: key, types: [...types] })),
    reviewReasons: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1])),
    examples,
  };
}

function referencePlan(rows) {
  const preferredFamilies = {
    'simple-round': 'ВВГ',
    'simple-flexible': 'КГ',
    'simple-wire': 'ПУГВ',
    'simple-flat': 'ВВГ-П',
    'multicore-7': 'КВВГ',
    'multicore-dense': 'КВВГ',
    'layered-tape-armour': 'ВБШВ',
    'layered-foil-shield': 'КВВГЭ',
    'layered-fire-barrier': 'ВВГ',
    'combined-foil-shield': 'КВВГЭ',
  };
  const definitions = [
    [
      'simple-round',
      'SIMPLE',
      3,
      'Обычный круглый кабель: объёмное раскрытие трёх жил',
      (p) =>
        p.productType === 'power-cable' &&
        p.geometry === 'round' &&
        p.conductorMaterial === 'copper' &&
        p.conductorConstruction === 'solid',
    ],
    [
      'simple-flexible',
      'SIMPLE',
      3,
      'Гибкий кабель: раскрытие жил с многопроволочной медью',
      (p) =>
        p.productType === 'flexible-cable' &&
        p.geometry === 'round' &&
        p.conductorConstruction === 'stranded',
    ],
    [
      'simple-wire',
      'SIMPLE',
      1,
      'Одиночный гибкий провод без общей оболочки',
      (p) =>
        p.productType === 'installation-wire' &&
        p.conductorConstruction === 'stranded',
    ],
    [
      'simple-flat',
      'SIMPLE',
      3,
      'Плоская конструкция с сохранением расположения жил',
      (p) => p.geometry === 'flat',
    ],
    [
      'simple-sip',
      'SIMPLE',
      4,
      'СИП: скрученные изолированные жилы без общей оболочки',
      (p) => p.geometry === 'twisted-bundle',
    ],
    [
      'multicore-7',
      'MULTICORE',
      7,
      'Компактный объёмный срез семи жил вместо длинного веера',
      (p) => p.productType === 'control-cable',
    ],
    [
      'multicore-dense',
      'MULTICORE',
      27,
      'Плотный срез на 27 жилах: читаемость и проверка точного количества',
      (p) => p.productType === 'control-cable' && p.cores >= 19,
    ],
    [
      'layered-tape-armour',
      'LAYERED',
      3,
      'Ступенчатый разрез ленточной брони и оболочек',
      (p) => p.armorType === 'steel-tapes' && !p.shield,
    ],
    [
      'layered-foil-shield',
      'LAYERED',
      4,
      'Ступенчатый разрез общего фольгового экрана; контактный провод отдельно от изолированных жил',
      (p) => p.shieldType === 'overall-foil-with-drain',
    ],
    [
      'layered-copper-shield',
      'LAYERED',
      4,
      'Медный ленточный экран как отдельный конструктивный слой',
      (p) => p.shieldType === 'overall-copper-tape',
    ],
    [
      'layered-fire-barrier',
      'LAYERED',
      3,
      'Огнестойкий барьер в ступенчатом разрезе',
      (p) =>
        p.specialElements.includes('fire-barrier') && !p.armor && !p.shield,
    ],
    [
      'combined-tape-armour',
      'MULTICORE + LAYERED',
      7,
      'Компактный многожильный срез плюс ступени ленточной брони',
      (p) => p.armorType === 'steel-tapes',
    ],
    [
      'combined-wire-armour',
      'MULTICORE + LAYERED',
      7,
      'Компактный срез плюс ступени проволочной брони',
      (p) => p.armorType === 'steel-wires',
    ],
    [
      'combined-foil-shield',
      'MULTICORE + LAYERED',
      7,
      'Компактный многожильный срез плюс экран и контактный провод',
      (p) => p.shieldType === 'overall-foil-with-drain',
    ],
    [
      'combined-dense-fire-barrier',
      'MULTICORE + LAYERED',
      27,
      'Плотный многожильный срез и отдельный огнестойкий барьер',
      (p) => p.cores >= 19 && p.specialElements.includes('fire-barrier'),
    ],
  ];
  return definitions.map(([id, type, targetCores, purpose, predicate]) => {
    const candidates = rows.filter(
      (r) =>
        r.visualProfile.visualizationType === type &&
        ['AUTO_APPROVED', 'recognized'].includes(r.visualClassification) &&
        predicate(r.visualProfile)
    );
    candidates.sort(
      (a, b) =>
        Math.abs(a.cores - targetCores) - Math.abs(b.cores - targetCores) ||
        Number(b.baseFamily === preferredFamilies[id]) -
          Number(a.baseFamily === preferredFamilies[id]) ||
        Number(a.visualProfile.specialElements.includes('fire-barrier')) -
          Number(b.visualProfile.specialElements.includes('fire-barrier')) ||
        a.sku.localeCompare(b.sku)
    );
    const r = candidates[0];
    return {
      id,
      type,
      purpose,
      status: r ? 'PROPOSED_ONLY' : 'NEEDS_REVIEW',
      generated: false,
      targetCores,
      candidate: r
        ? {
            sku: r.sku,
            name: r.displayName,
            cores: r.cores,
            visualKey: r.visualKey,
            visualProfile: r.visualProfile,
          }
        : null,
    };
  });
}

const mdCell = (v) =>
  String(v ?? '—')
    .replace(/\|/g, '/')
    .replace(/\n/g, ' ');

function exportRow(row) {
  const fields = [
    'sku',
    'productId',
    'slug',
    'originalName',
    'displayName',
    'baseFamily',
    'familyId',
    'familyRecognized',
    'cores',
    'section',
    'sectionUnit',
    'auxiliaryCores',
    'auxiliarySection',
    'visualKey',
    'visualProfileId',
    'visualProfile',
    'technicalProfile',
    'visualClassification',
    'issues',
    'appliedFamilyVisualRule',
    'visualization',
  ];
  return Object.fromEntries(
    fields.filter((key) => key in row).map((key) => [key, row[key]])
  );
}
function summaryMarkdown(report) {
  const table = (summary) =>
    `| Тип | Товаров | Уникальных visualKey |\n|---|---:|---:|\n${summary.buckets.map((b) => `| ${b.type} | ${b.products} | ${b.visualKeys} |`).join('\n')}`;
  return `# Типы визуализации — dry-run\n\nДата: 8 ноября 2026. Генерация и назначение изображений запрещены этим инструментом.\n\n## Запрошенный срез: 5708 товаров\n\nИсточник: ${historicalSource}, сохранённые visualProfile и характеристики. Это исторический срез предыдущего утверждённого dry-run; текущий рабочий каталог содержит ${report.current.summary.totalProducts} товаров.\n\n${table(report.requested.summary)}\n\nВсего уникальных ключей: ${report.requested.summary.uniqueVisualKeys}. Ключей с несколькими статусами визуализации: ${report.requested.summary.mixedStatusVisualKeys.length}. Один ключ может встречаться в нескольких строках таблицы, если у отдельных SKU есть конфликт/неизвестный признак. Существующие visualKey не меняются.\n\n## Правила\n\n- SIMPLE: известная простая конструкция; раскрытие жил. Сюда также относятся одиночные провода, плоские изделия и СИП-4; для них сохраняется собственная геометрия и нужен отдельный пример.\n- MULTICORE: подтверждённый круглый кабель с общей оболочкой, начиная с ${report.rules.compactFromCores} жил. Это настраиваемый порог композиции, а не определение технического термина. Проволоки внутри stranded-жилы не считаются отдельными жилами.\n- LAYERED: броня, экран, отдельный огнестойкий барьер или явно известная внутренняя оболочка требуют ступенчатого разреза. Поэтому 3-жильный бронированный кабель не SIMPLE.\n- MULTICORE + LAYERED: обе стратегии одновременно.\n- NEEDS_REVIEW: неизвестные/противоречивые критические признаки, неописанные слои, парная или неподдержанная специальная конструкция.\n- visibleLayerCount считает только известные конверты для каталожной иллюстрации: изоляция жилы, общая оболочка и отдельные специальные слои. Это не точное число всех технологических слоёв; physicalLayerCount остаётся null. Неизвестный невидимый заполнитель сам по себе не блокирует классификацию.\n- Тип визуализации не изменяет visualClassification и не разрешает генерацию. Сечение не влияет на выбор стратегии. Поле visualizationType исключено из хеша идентичности как производное правило композиции.\n\n## Примеры каждого типа\n\n${Object.entries(
    report.requested.summary.examples
  )
    .filter(([type]) => type !== 'NEEDS_REVIEW')
    .map(
      ([type, examples]) =>
        `### ${type}\n\n| SKU | Товар | Жил | Видимых слоёв |\n|---|---|---:|---:|\n${examples.map((e) => `| ${e.sku} | ${mdCell(e.name)} | ${e.cores} | ${e.visibleLayers} |`).join('\n')}`
    )
    .join(
      '\n\n'
    )}\n\n## Неоднозначные случаи\n\nПолный список всех SKU и причин: needs-review.json; также доступен фильтр NEEDS_REVIEW в report.html.\n\n| SKU | Товар | Причины |\n|---|---|---|\n${report.requested.summary.examples.NEEDS_REVIEW.map((e) => `| ${e.sku} | ${mdCell(e.name)} | ${mdCell(e.reasons.map((r) => r.message).join('; '))} |`).join('\n')}\n\nПричины пересекаются (один SKU может иметь несколько):\n\n${Object.entries(
    report.requested.summary.reviewReasons
  )
    .map(([code, count]) => `- ${code}: ${count}`)
    .join(
      '\n'
    )}\n\n## Референсы для следующей проверки — только предложения\n\n| Тип | Что проверить | Кандидат | Статус |\n|---|---|---|---|\n${report.references.map((r) => `| ${r.type} | ${mdCell(r.purpose)} | ${mdCell(r.candidate?.name)}${r.candidate ? ` (${r.candidate.sku})` : ''} | ${r.status} |`).join('\n')}\n\nКаждый референс должен сохранять утверждённый компактный масштаб, небольшой наклон, цельную часть справа, разделку слева, точное число и цвета жил, прозрачность. Сейчас не создано ни одного референса. До уточнения NEEDS_REVIEW для этих конструкций референсы не назначаются.\n\n## Текущий рабочий каталог — отдельно\n\nИсточник: ${currentSource}. Он классифицирован заново текущими familyVisualRules и парсером; его ключи могут отличаться от исторического среза вследствие промежуточных изменений каталога/парсера, а не из-за поля visualizationType.\n\n${table(report.current.summary)}\n\nВ текущем срезе отсутствуют ${report.catalogDelta.onlyHistorical.length} исторических SKU; новых относительно исторического среза: ${report.catalogDelta.onlyCurrent.length}. Полная разница: catalog-delta.json.\n\n## Целостность\n\n${report.integrity.protectedFiles} файлов проверены SHA-256 до/после: без изменений. PNG, metadata, production manifest, привязки, действующий каталог и правила familyVisualRules сохранены. API requests: 0. Generated: 0. Bindings changed: 0. Publication: 0.\n`;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: { 'dry-run': { type: 'boolean' }, out: { type: 'string' } },
  });
  if (!values['dry-run'])
    throw new Error(
      'Only --dry-run is available: no image generation, binding or production writes'
    );
  const out = path.resolve(
    root,
    values.out || 'outputs/cable-visualization-types-2026-11-08'
  );
  if (!out.startsWith(path.join(root, 'outputs') + path.sep))
    throw new Error('--out must be inside outputs/');
  const before = await protectedSnapshot();
  const context = {
    rules: await read('data/cableVisualClassificationRules.json'),
    familyVisualRules: await read('data/familyVisualRules.json'),
    knowledge: await read('shared/designationKnowledgeBase.json'),
    colorRules: await read('data/cableImageColors.json'),
    visualizationRules: await read('data/cableVisualizationRules.json'),
  };
  const historical = await read(historicalSource);
  assert.equal(
    historical.rows.length,
    5708,
    'Requested 5708-row snapshot not found'
  );
  const requestedRows = historical.rows.map((r) => {
    const result = withCableVisualization(r, context);
    assert.equal(result.visualKey, r.visualKey);
    assert.equal(result.visualProfileId, r.visualProfileId);
    return exportRow(result);
  });
  const currentProducts = await read(currentSource);
  const currentRows = currentProducts.map((p) =>
    exportRow(classifyPracticalCableVisualProduct(p, context))
  );
  for (const rows of [requestedRows, currentRows]) {
    assert.equal(
      new Set(rows.map((r) => r.sku)).size,
      rows.length,
      'Duplicate SKU'
    );
    assert.ok(
      rows.every((r) =>
        VISUALIZATION_TYPES.includes(r.visualProfile.visualizationType)
      )
    );
  }
  const historicalSkus = new Set(requestedRows.map((r) => r.sku)),
    currentSkus = new Set(currentRows.map((r) => r.sku));
  const after = await protectedSnapshot();
  assert.deepEqual(
    after,
    before,
    'Protected PNG/metadata/manifest/bindings/catalogue changed during dry-run'
  );
  const report = {
    schemaVersion: 1,
    mode: 'dry-run',
    generationAllowed: false,
    bindingAllowed: false,
    generatedAt: new Date().toISOString(),
    rules: context.visualizationRules,
    requested: {
      source: historicalSource,
      rows: requestedRows,
      summary: summarize(requestedRows),
    },
    current: {
      source: currentSource,
      rows: currentRows,
      summary: summarize(currentRows),
    },
    catalogDelta: {
      onlyHistorical: requestedRows
        .filter((r) => !currentSkus.has(r.sku))
        .map((r) => ({ sku: r.sku, name: r.displayName })),
      onlyCurrent: currentRows
        .filter((r) => !historicalSkus.has(r.sku))
        .map((r) => ({ sku: r.sku, name: r.displayName })),
    },
    references: referencePlan(requestedRows),
    integrity: {
      unchanged: true,
      protectedFiles: Object.keys(before).length,
      before,
      after,
      apiRequests: 0,
      generated: 0,
      bindingsChanged: 0,
      productionWrites: 0,
    },
  };
  await fs.mkdir(out, { recursive: true });
  const save = (name, value) =>
    fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
  await save('audit.json', report);
  await save('products.json', requestedRows);
  await save('current-products.json', currentRows);
  await save('summary.json', {
    requested: report.requested.summary,
    current: report.current.summary,
  });
  await save(
    'needs-review.json',
    requestedRows
      .filter((r) => r.visualProfile.visualizationType === 'NEEDS_REVIEW')
      .map((r) => ({
        sku: r.sku,
        name: r.displayName,
        baseFamily: r.baseFamily,
        visualKey: r.visualKey,
        visualProfile: r.visualProfile,
        reasons: r.visualization.reasons,
      }))
  );
  await save('reference-plan.json', report.references);
  await save('catalog-delta.json', report.catalogDelta);
  await save('integrity.json', report.integrity);
  await fs.writeFile(path.join(out, 'summary.md'), summaryMarkdown(report));
  await fs.writeFile(
    path.join(out, 'report.html'),
    renderVisualizationTypeReport(report)
  );
  console.log(
    JSON.stringify(
      {
        requested: report.requested.summary.buckets,
        current: report.current.summary.buckets,
        referencesProposed: report.references.filter((r) => r.candidate).length,
        requestedVisualKeys: report.requested.summary.uniqueVisualKeys,
        mixedStatusKeys: report.requested.summary.mixedStatusVisualKeys.length,
        catalogDelta: {
          removed: report.catalogDelta.onlyHistorical.length,
          added: report.catalogDelta.onlyCurrent.length,
        },
        integrity: { unchanged: true, files: report.integrity.protectedFiles },
        report: path.join(out, 'report.html'),
      },
      null,
      2
    )
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
