import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { createCatalogStore } from '../lib/catalog.js';
import {
  planCableVisualAudit,
  readCableVisualAssets,
  auditCsv,
  visualAuditFingerprint,
} from './lib/cableVisualAudit.js';
import { renderCableVisualReport } from './lib/cableVisualReport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file) =>
  JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));

async function snapshot() {
  const files = [
    'data/catalog-current/products.json',
    'data/priceOverrides.json',
    'shared/generatedProductImages.json',
    'data/cableImageConfig.json',
    'data/cableImageColors.json',
    'scripts/lib/cableImageSpec.js',
    'scripts/lib/cableImageVisual.js',
  ];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const p = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(p);
      else files.push(p);
    }
  }
  await walk('public/product-images');
  await walk('data/product-image-metadata');
  const hashes = {};
  for (const file of files.sort())
    hashes[file] = createHash('sha256')
      .update(await fs.readFile(path.join(root, file)))
      .digest('hex');
  return hashes;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
      catalog: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'Read-only cable visual classification. No image provider or .env access.\nnode scripts/auditCableVisuals.js --dry-run --out outputs/cable-visual-audit-2026-10-16\n--catalog PATH: optional JSON array or {items: []}'
    );
    return;
  }
  if (!values['dry-run'])
    throw new Error(
      'Only --dry-run is supported; generation and binding are unavailable'
    );
  const out = path.resolve(
    root,
    values.out || 'outputs/cable-visual-audit-2026-10-16'
  );
  if (!out.startsWith(path.join(root, 'outputs') + path.sep))
    throw new Error('--out must be a directory inside outputs/');
  const before = await snapshot();
  const rules = await read('data/cableVisualClassificationRules.json'),
    knowledge = await read('shared/designationKnowledgeBase.json'),
    colorRules = await read('data/cableImageColors.json');
  if (rules.schemaVersion !== 1 || rules.mode !== 'audit-only')
    throw new Error('Expected audit-only classification rules schema 1');
  const catalogFile = path.resolve(
    root,
    values.catalog || 'data/catalog-current/products.json'
  );
  const input = await read(catalogFile),
    products = Array.isArray(input) ? input : input.items;
  if (
    !Array.isArray(products) ||
    products.some((p) => !p || typeof p !== 'object')
  )
    throw new Error('Expected catalogue product array');
  if (
    products.some((p) => !p.sku) ||
    new Set(products.map((p) => p.sku)).size !== products.length
  )
    throw new Error('Duplicate/missing SKU in audit input');
  const context = { rules, knowledge, colorRules };
  const assets = await readCableVisualAssets(root, context);
  // Resolve the same storefront overrides, without making any request to the running site.
  const visible = await createCatalogStore({
    productsFile: catalogFile,
  }).loadCatalogProducts();
  const report = planCableVisualAudit({
    products,
    context,
    assets,
    currentImages: Object.fromEntries(visible.map((p) => [p.sku, p.image])),
  });
  report.generatedAt = new Date().toISOString();
  report.catalogFile = path.relative(root, catalogFile);
  report.auditFingerprint = visualAuditFingerprint({
    products,
    rules,
    knowledge,
    assets,
  });
  report.sources = { ...knowledge.sources, ...rules.sources };
  const after = await snapshot();
  report.integrity = {
    protectedFiles: Object.keys(before).length,
    unchanged: JSON.stringify(before) === JSON.stringify(after),
    before,
    after,
  };
  if (!report.integrity.unchanged)
    throw new Error('Protected catalogue/images/bindings changed during audit');
  await fs.mkdir(out, { recursive: true });
  for (const [file, value] of Object.entries({
    'audit.json': report,
    'groups.json': report.groups,
    'needs-review.json': report.needsReview,
    'existing-images.json': report.existingAssets,
    'summary.json': report.summary,
  }))
    await fs.writeFile(
      path.join(out, file),
      JSON.stringify(value, null, 2) + '\n'
    );
  await fs.writeFile(path.join(out, 'products.csv'), auditCsv(report.rows));
  await fs.writeFile(
    path.join(out, 'report.html'),
    renderCableVisualReport(report)
  );
  const s = report.summary;
  const summary = `# Классификация визуальных конструкций — полный dry-run\n\n- Всего товаров: ${s.totalProducts}\n- Распознано полностью: ${s.recognized}\n- Needs review (классификация): ${s.needsReview}\n- Семейство распознано: ${s.familyRecognized}\n- Уникальных familyId: ${s.uniqueFamilyIds} (из них подтверждённых: ${s.verifiedFamilyIds})\n- Уникальных visualProfile / visualKey: ${s.uniqueVisualProfiles} / ${s.uniqueVisualKeys}\n- Профилей без незакрытых вопросов: ${s.readyVisualProfiles}\n- Существующих утверждённых изображений: ${s.existingApprovedImages}\n- Статусы изображений по SKU: ${JSON.stringify(s.imageStatus)}\n- Confidence: ${JSON.stringify(s.confidence)}\n- API requests: 0; images generated: 0; bindings changed: 0.\n- Целостность ${report.integrity.protectedFiles} защищённых файлов: PASS.\n\n## Как читать\n\nПрофили с неизвестными значениями — кандидаты для проверки. Их нельзя генерировать или назначать автоматически. Число familyId включает нераспознанные исходные марки, это не число подтверждённых конструкций.\n\nREUSE означает подтверждённое соответствие профиля и имеющегося изображения. MISSING — полный профиль без подходящей картинки. NEEDS_REVIEW — неоднозначная конструкция либо недостаточное описание существующей картинки. Существующая иллюстрация не доказывает наличие PE/N или тип жилы у SKU.\n\nПредыдущий визуальный стандарт, PNG, prompt builder и привязки сохранены. Новая классификация пока является отдельным аудитом; прежние планы генерации не являются утверждением этих групп.\n\n## Причины ручной проверки (пересекаются)\n\n${Object.entries(
    s.reviewReasons
  )
    .map(([k, v]) => `- ${k}: ${v}`)
    .join(
      '\n'
    )}\n\n## Файлы\n\n- report.html — поиск, фильтры, таблица всех товаров, состав каждой группы и существующие изображения.\n- products.csv — полная таблица.\n- audit.json — полный отчёт, доказательства, причины, контрольные суммы.\n- needs-review.json — все SKU с вопросами классификации или сопоставления.\n- groups.json — все группы и входящие товары.\n- existing-images.json — соответствие прежних изображений новым профилям-кандидатам.\n`;
  await fs.writeFile(path.join(out, 'summary.md'), summary);
  console.log(
    JSON.stringify(
      {
        summary: s,
        integrity: {
          unchanged: true,
          protectedFiles: report.integrity.protectedFiles,
        },
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
