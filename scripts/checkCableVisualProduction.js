import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { getGeneratedProductImage } from '../shared/productImages.js';
import {
  productionSummary,
  writeProductionJson,
} from './lib/cableVisualProduction.js';
import { validateCableImagePng } from './lib/cableImagePng.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.join(root, 'data/product-image-metadata/production-v1');
const out = path.join(root, 'outputs/cable-image-production-2026-10-16');
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );

export async function main() {
  const plan = await read(path.relative(root, path.join(state, 'plan.json')));
  const manifest = await read(
    path.relative(root, path.join(state, 'manifest.json'))
  );
  const baseline = await read(
    path.relative(root, path.join(state, 'baseline-bindings.json'))
  );
  const binding = await read('shared/generatedProductImages.json');
  const rejections = await read('shared/rejectedProductImages.json');
  if (process.argv.includes('--finalize-quality')) {
    const locked = await fs
      .access(path.join(root, 'data/product-image-metadata/.pipeline.lock'))
      .then(
        () => true,
        (e) => {
          if (e.code === 'ENOENT') return false;
          throw e;
        }
      );
    assert.equal(
      locked,
      false,
      'Wait for active production writers before finalizing visual QA'
    );
    for (const [key, rejection] of Object.entries(rejections.byVisualKey)) {
      const group = plan.groups.find((g) => g.visualKey === key);
      assert.equal(
        group?.action,
        'MISSING',
        'Visual QA must not replace an existing approved image'
      );
      const record = manifest.groups[key];
      assert.ok(record, 'Rejected image has no production checkpoint');
      for (const member of group.members) {
        if (baseline.bySku[member.sku])
          binding.bySku[member.sku] = baseline.bySku[member.sku];
        else delete binding.bySku[member.sku];
      }
      Object.assign(record, {
        status: 'failed',
        bound: false,
        qualityRejected: true,
        error: rejection.reason,
        visualReview: rejection,
        updatedAt: new Date().toISOString(),
      });
      const file = path.join(state, 'groups', `${key}.json`);
      const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
      await writeProductionJson(file, { ...metadata, ...record });
    }
    await writeProductionJson(
      path.join(root, 'shared/generatedProductImages.json'),
      binding
    );
    await writeProductionJson(path.join(state, 'manifest.json'), manifest);
  }
  const audit = await read(
    'outputs/cable-visual-practical-2026-10-16/audit.json'
  );
  const productsBuffer = await fs.readFile(
    path.join(root, 'data/catalog-current/products.json')
  );
  assert.equal(
    sha(productsBuffer),
    plan.catalogSha256,
    'Catalog names/prices/specifications/categories changed'
  );
  const products = new Map(JSON.parse(productsBuffer).map((p) => [p.sku, p]));
  const eligible = new Set(
    plan.groups.flatMap((g) => g.members.map((p) => p.sku))
  );
  for (const sku of plan.reviewSkus)
    assert.deepEqual(
      binding.bySku[sku],
      baseline.bySku[sku],
      `NEEDS_REVIEW binding changed: ${sku}`
    );
  for (const sku of new Set([
    ...Object.keys(binding.bySku),
    ...Object.keys(baseline.bySku),
  ]))
    if (!eligible.has(sku))
      assert.deepEqual(
        binding.bySku[sku],
        baseline.bySku[sku],
        `Out-of-scope binding changed: ${sku}`
      );
  let oldFiles = 0;
  for (const [file, expected] of Object.entries(audit.integrity.after)) {
    if (file === 'shared/generatedProductImages.json') continue;
    assert.equal(
      sha(await fs.readFile(path.join(root, file))),
      expected,
      `Protected existing file changed: ${file}`
    );
    oldFiles++;
  }
  let bound = 0,
    validImages = 0;
  const completed = [];
  for (const group of plan.groups) {
    const record = manifest.groups[group.visualKey];
    if (!record?.bound) continue;
    if (rejections.byVisualKey[group.visualKey]) continue;
    const validation = validateCableImagePng(
      await fs.readFile(path.join(root, 'public', group.image.slice(1))),
      {
        background: 'transparent',
        size: plan.renderConfig.size,
        composition: { rightEdgeCrop: false },
      }
    );
    assert.equal(validation.sha256, record.validation.sha256);
    assert.ok(validation.has_alpha_channel && validation.has_transparency);
    validImages++;
    for (const member of group.members) {
      assert.equal(binding.bySku[member.sku]?.visualKey, group.visualKey);
      assert.equal(
        getGeneratedProductImage(products.get(member.sku), binding),
        group.image
      );
      assert.equal(binding.bySku[member.sku].section, member.section);
      bound++;
    }
    completed.push({ ...group, record });
  }
  const predicates = [
    ['одножильный провод', (p) => p.productType === 'installation-wire'],
    ['2 жилы', (p) => p.cores === 2 && p.hasOuterJacket],
    ['3 жилы', (p) => p.cores === 3 && p.hasOuterJacket],
    ['4 жилы', (p) => p.cores === 4 && p.hasOuterJacket],
    ['5 жил', (p) => p.cores === 5 && p.hasOuterJacket],
    [
      'многожильный контрольный',
      (p) => p.productType === 'control-cable' && p.cores > 5,
    ],
    ['плоский', (p) => p.geometry === 'flat'],
    [
      'stranded',
      (p) => p.conductorConstruction === 'stranded' && p.hasOuterJacket,
    ],
    ['бронированный', (p) => p.armor],
    ['экранированный', (p) => p.shield],
    ['СИП', (p) => p.geometry === 'twisted-bundle'],
  ];
  const samples = predicates.map(([type, test]) => {
    const group =
      completed.find((g) => g.action === 'MISSING' && test(g.visualProfile)) ||
      completed.find((g) => test(g.visualProfile));
    return group
      ? {
          type,
          visualKey: group.visualKey,
          image: group.image,
          product: group.members[0],
          profile: group.visualProfile,
        }
      : { type, pending: true };
  });
  const summary = productionSummary(plan, manifest, rejections.byVisualKey);
  const verification = {
    checkedAt: new Date().toISOString(),
    catalogUnchanged: true,
    protectedExistingFilesUnchanged: oldFiles,
    existingApprovedPngUnchanged: audit.existingAssets.length,
    needsReviewUntouched: plan.reviewSkus.length,
    eligibleSkus: eligible.size,
    verifiedBoundSkus: bound,
    verifiedImages: validImages,
    pending: summary.pending,
    perSkuSectionsPreserved: true,
    allAssignedImagesResolve: true,
    samples,
  };
  await writeProductionJson(path.join(out, 'verification.json'), verification);
  await writeProductionJson(path.join(out, 'summary.json'), summary);
  const card = (g, label) =>
    `<article><h3>${esc(label)}</h3><div class="picture"><img loading="lazy" src="../../public${esc(g.image)}"></div><p>${esc(g.product?.productName || g.members?.[0]?.productName)}</p><small>${esc(g.visualKey)}</small><pre>${esc(JSON.stringify(g.profile || g.visualProfile, null, 2))}</pre></article>`;
  const failedCards = summary.failed
    .filter((f) => f.image)
    .map((f) => {
      const group = plan.groups.find((g) => g.visualKey === f.visualKey);
      return card(group, 'FAILED: ' + f.reason);
    })
    .join('');
  await fs.writeFile(
    path.join(out, 'gallery.html'),
    `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Production кабелей — проверка</title><style>body{font:15px Arial;margin:30px;color:#203045;background:#f4f6f9}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}article{padding:14px;background:white;border:1px solid #dce1e7;border-radius:10px;min-width:0}.picture{height:220px;background:repeating-conic-gradient(#fff 0% 25%,#f0f1f3 0% 50%) 50% / 20px 20px}img{width:100%;height:100%;object-fit:contain}small{overflow-wrap:anywhere}pre{white-space:pre-wrap;font-size:11px}</style><h1>Иллюстрации каталога — production</h1><p>Generated: ${summary.generated.visualKeys} / 446 · REUSE: ${summary.reuseExisting.visualKeys} / 119 · FAILED: ${summary.failed.length}</p><h2>Выборка конструкций</h2><section>${samples
      .filter((s) => !s.pending)
      .map((s) => card(s, s.type))
      .join('')}</section><h2>Все новые изображения</h2><section>${completed
      .filter((g) => g.action === 'MISSING')
      .map((g) =>
        card(g, g.visualProfile.family + ' · ' + g.visualProfile.cores + ' жил')
      )
      .join(
        ''
      )}</section><h2>Отклонённые результаты — в карточках не используются</h2><section>${failedCards}</section></html>`
  );
  const failed = summary.failed.length
    ? summary.failed
        .map(
          (f) =>
            `- ${f.image ? `[${f.visualKey}](${path.join(root, 'public', f.image.slice(1))})` : f.visualKey}: ${f.reason}`
        )
        .join('\n')
    : 'Нет.';
  await fs.writeFile(
    path.join(out, 'summary.md'),
    `# Production, этап 1\n\n| Показатель | Результат |\n|---|---:|\n| REUSE existing | ${summary.reuseExisting.visualKeys} visualKey / ${summary.reuseExisting.products} товаров |\n| Generated and bound after visual QA | ${summary.generated.visualKeys} visualKey / ${summary.generated.products} товаров |\n| PNG received and decoded before visual QA | ${summary.decodedNewPngReceived} |\n| Failed | ${summary.failed.length} visualKey |\n| Skipped/cache | ${summary.skippedCache} |\n| API requests | ${summary.apiRequests} |\n| Products with illustrations | ${summary.productsWithIllustrations} |\n| NEEDS_REVIEW untouched | ${summary.needsReviewUntouched} |\n| Pending | ${summary.pending} |\n\n## Проверка\n\nИсходный каталог и ${oldFiles} защищённых существующих файлов не изменились. Все 119 утверждённых PNG сохранены. Привязки всех 3831 NEEDS_REVIEW сохранены. ${bound} назначенных SKU разрешаются через штатный getGeneratedProductImage; сечения сохранены по SKU. PNG проверены декодированием, CRC, alpha и SHA-256. Проверка структуры пикселей требует визуального просмотра; программная проверка не считает жилы.\n\nПолучено ${summary.decodedNewPngReceived} PNG; из них ${Object.keys(rejections.byVisualKey).length} результатов исключены из новых привязок после визуальной проверки. Причины включают неверное число жил и невозможность достоверно проверить число из-за перекрывающихся концов. Исходные файлы сохранены, повторной генерации ради другого варианта не было. FAILED также включает ошибки API после ограниченных повторов.\n\n## FAILED\n\n${failed}\n\n## Возобновление\n\nАвторитетный manifest: data/product-image-metadata/production-v1/manifest.json. Команда: npm run images:cables:production -- --run. Успешные файлы и FAILED не генерируются заново.\n`
  );
  console.log(
    JSON.stringify(
      {
        summary,
        verification: {
          ...verification,
          samples: samples.map((s) => ({
            type: s.type,
            visualKey: s.visualKey,
            pending: s.pending,
          })),
        },
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
