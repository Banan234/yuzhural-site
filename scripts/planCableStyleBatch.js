import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createCatalogStore } from '../lib/catalog.js';
import { planCableStyleBatch } from './lib/cableStyleBatch.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.slice(2).join(' ') !== '--dry-run')
  throw Error('Only --dry-run allowed. No API or binding application.');
const read = async (f) =>
  JSON.parse(await fs.readFile(path.join(root, f), 'utf8'));
const out = path.join(root, 'outputs/cable-style-batch-dry-run');
async function snapshot() {
  const result = {};
  async function walk(p) {
    const stat = await fs.stat(path.join(root, p));
    if (stat.isDirectory())
      for (const n of await fs.readdir(path.join(root, p)))
        await walk(p + '/' + n);
    else
      result[p] = createHash('sha256')
        .update(await fs.readFile(path.join(root, p)))
        .digest('hex');
  }
  for (const p of [
    'data/catalog-current/products.json',
    'data/priceOverrides.json',
    'shared/generatedProductImages.json',
    'shared/rejectedProductImages.json',
    'data/product-image-metadata',
    'public/product-images',
    'cable-image-style.json',
    'assets/cable-style-reference',
  ])
    await walk(p);
  return result;
}
const before = await snapshot();
const context = {
  rules: await read('data/cableVisualClassificationRules.json'),
  familyVisualRules: await read('data/familyVisualRules.json'),
  knowledge: await read('shared/designationKnowledgeBase.json'),
  colorRules: await read('data/cableImageColors.json'),
};
const products = await read('data/catalog-current/products.json'),
  visibleProducts = await createCatalogStore().loadCatalogProducts(),
  bindings = await read('shared/generatedProductImages.json'),
  overrides = await read('data/priceOverrides.json');
const plan = await planCableStyleBatch({
  root,
  products,
  visibleProducts,
  bindings,
  overrides,
  context,
  cacheDir: path.join(root, 'outputs/cable-style-batch-drafts'),
});
const after = await snapshot();
assert.deepEqual(after, before, 'Protected state changed');
await fs.mkdir(out, { recursive: true });
for (const [file, value] of Object.entries({
  'plan.json': plan,
  'summary.json': plan.summary,
  'needs-review.json': plan.rows.filter((r) => r.status === 'NEEDS_REVIEW'),
  'protected-images.json': plan.rows.filter((r) => r.status === 'PROTECTED'),
  'integrity.json': {
    unchanged: true,
    files: Object.keys(before).length,
    before,
    after,
    apiRequests: 0,
  },
}))
  await fs.writeFile(
    path.join(out, file),
    JSON.stringify(value, null, 2) + '\n'
  );
const s = plan.summary;
const esc = (x) =>
  String(x ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
const compact = JSON.stringify(
  plan.groups.map((g) => ({
    key: g.visualKey,
    type: g.profile.visualizationType,
    status: g.status,
    members: g.members.map((r) => ({
      sku: r.sku,
      name: r.name,
      section: r.section,
      status: r.status,
      reason: r.reason,
    })),
    reference: g.request?.reference.path,
    draftKey: g.draftKey,
  }))
).replaceAll('<', '\\u003c');
await fs.writeFile(
  path.join(out, 'report.html'),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Стандарт 1.0.0 — массовый dry-run</title><style>body{font:15px system-ui;margin:24px;background:#f1f5f9;color:#243b53}article{background:white;padding:16px;margin:14px 0;border-radius:8px}input,select{font:inherit;padding:10px;margin:8px}pre,small{overflow-wrap:anywhere;white-space:pre-wrap}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:8px}</style><h1>Массовый dry-run — approved-cable-style-1.0.0</h1><p>API: 0. Все результаты требуют ручного review. Фото и ручные изображения исключены. Старые generated-иллюстрации заменяются только после утверждения новых.</p><pre>${esc(JSON.stringify(s, null, 2))}</pre><input id="q" placeholder="SKU, название, visualKey"><select id="filter"><option>ALL</option><option>READY</option><option>NEEDS_REVIEW</option><option>CACHED_NEEDS_REVIEW</option></select><p id="counter"></p><main id="list"></main><script type="application/json" id="data">${compact}</script><script>const data=JSON.parse(document.getElementById('data').textContent),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function render(){const q=document.getElementById('q').value.toLowerCase(),f=document.getElementById('filter').value,rows=data.filter(g=>(f==='ALL'||g.status===f)&&JSON.stringify(g).toLowerCase().includes(q));document.getElementById('counter').textContent='Групп: '+rows.length+'; показаны первые 100';document.getElementById('list').innerHTML=rows.slice(0,100).map(g=>'<article><b>'+esc(g.type)+' · '+esc(g.status)+'</b><p>'+esc(g.key)+'</p><small>Эталон: '+esc(g.reference||'—')+'</small><table>'+g.members.map(r=>'<tr><td>'+esc(r.sku)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.status)+'</td><td>'+esc(r.reason||'')+'</td></tr>').join('')+'</table></article>').join('')}document.getElementById('q').oninput=render;document.getElementById('filter').onchange=render;render();</script>`
);
await fs.writeFile(
  path.join(out, 'summary.md'),
  `# Dry-run массовой генерации\n\nАктуальный каталог: ${s.products} товаров / ${s.visualKeys} visualKey.\n\n| Тип | Товаров | Ключей | Запросов в очереди |\n|---|---:|---:|---:|\n${s.types.map((r) => `| ${r.type} | ${r.products} | ${r.visualKeys} | ${r.readyRequests} |`).join('\n')}\n\nNEEDS_REVIEW: ${s.needsReviewProducts} товаров. Защищено фото/ручных: ${s.protectedProducts}. Готово: ${s.eligibleProducts} SKU / ${s.readyVisualKeys} visualKey. Старые generated bindings: ${s.existingGeneratedBindings} товаров / ${s.existingGeneratedImages} уникальных путей изображений.\n\nЗамена: ${s.legacyReplacementProducts} SKU / ${s.replacementVisualKeys} ключей. Недостающие: ${s.missingProducts} SKU / ${s.missingVisualKeys} ключей. Эти количества ключей пересекаются, если группа содержит и старые привязки, и недостающие SKU.\n\nОжидаемых платных запросов: ${s.expectedPaidRequests} — один POST /images/edits на visualKey, без автоматических повторов. Реальных запросов: 0. Кэш: ${s.cachedVisualKeys} групп. Все новые PNG остаются NEEDS_REVIEW до ручного review с хешем файла.\n\nИсторический production manifest не является кэшем нового стандарта. Старые PNG не удаляются. Для круглых/плоских/СИП/проводов без общей оболочки стандарт не ослаблен: неподдержанные четырьмя эталонами конструкции остаются NEEDS_REVIEW. Сечение сохраняется по SKU; классификатор включает sectionKey только при явно заданном визуальном правиле.\n\nКонтрольные суммы ${Object.keys(before).length} защищённых файлов совпали. Ни каталог, ни bindings, ни production manifest, ни стандарт не изменены.\n`
);
console.log(JSON.stringify(s, null, 2));
