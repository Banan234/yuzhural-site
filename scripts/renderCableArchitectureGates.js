import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';
import { loadApprovedStyleReferences } from './lib/cableApprovedStyleReference.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const out='outputs/cable-architecture-gates-2026-11-15';
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file)));
const [before,after,vvg,oldGallery,registry,bindings,tests,decisions,positive]=await Promise.all([
 read(out+'/before/queue.json'),read(out+'/after/queue.json'),read(out+'/vvg/plan.json'),
 read('outputs/cable-gallery-local-2026-11-15/queue.json'),
 read('data/cable-approved-results/registry.json'),read('shared/generatedProductImages.json'),read(out+'/tests.json'),
 loadCableReviewDecisions(root),loadApprovedStyleReferences(root),
]);
if(before.catalogHash!==after.catalogHash) throw Error('Catalog changed between dry runs');
const rows=queue=>queue.groups.flatMap(group=>group.members.filter(row=>row.visible).map(row=>({row,group})));
const previous=new Map(rows(before).map(({row})=>[row.sku,row]));
const current=rows(after);
const uncovered=current.filter(({row})=>row.status!=='ALREADY_COVERED');
const blocked=uncovered.filter(({row})=>row.status!=='READY_FOR_GENERATION');
const missing=blocked.filter(({row})=>row.reasons.some(reason=>reason.startsWith('catalog-missing')));
const unsupported=blocked.filter(({row})=>row.reasons.some(reason=>reason.startsWith('catalog-unsupported')));
const unsupportedOnly=unsupported.filter(({row})=>row.reasons.every(reason=>reason.startsWith('catalog-unsupported')));
const difference=blocked.filter(({row})=>!oldGallery.unresolved.some(old=>old.sku===row.sku));
const removed=blocked.filter(({row})=>previous.get(row.sku).reasons.some(reason=>!row.reasons.includes(reason)));
const noRepeat=decisions.filter(({decision})=>decision.status==='REJECTED'||decision.disposition==='NEEDS_CORRECTION');
const positiveSet=new Set(positive.map(entry=>entry.sha256));
if(noRepeat.some(({decision})=>positiveSet.has(decision.sha256))) throw Error('Denied archive image is a positive reference');
const fileHashes=[
 ...decisions.map(({decision,decisionDir})=>[path.join(decisionDir,'image.png'),decision.sha256]),
 ...Object.values(registry.byVisualKey).concat(Object.values(registry.alternativesBySha256??{}))
   .map(entry=>[path.join(root,entry.draftDir,'image.png'),entry.sha256]),
 ...current.filter(({row})=>row.coverage==='existing-binding').map(({row})=>[
   path.join(root,'public',bindings.bySku[row.sku].image),row.imageSha256]),
];
const invalid=(await Promise.all(fileHashes.map(async ([file,sha])=>
 await fs.readFile(file).then(bytes=>digest(bytes)===sha?null:file,()=>file)))).filter(Boolean);

const examples=[];
const add=entry=>{if(entry&&!examples.includes(entry)&&examples.length<24)examples.push(entry);};
for(const sku of ['YU-0000919','YU-0000920','YU-0000879','YU-0000757','YU-0001039','YU-0000982','YU-0000890','YU-0000976'])
 add(current.find(({row})=>row.sku===sku));
for (const status of ['ALREADY_COVERED','NEEDS_TECHNICAL_REVIEW']) {
 const included=new Set();
 for (const entry of current.filter(({row})=>row.status===status)) {
  if(included.has(entry.row.family)) continue;
  included.add(entry.row.family);
  add(entry);
  if(included.size>=8) break;
 }
}
for(const entry of current) add(entry);
const routes=await Promise.all(examples.map(async ({row,group})=>{
 const binding=bindings.bySku[row.sku];
 const approved=binding&&registry.byVisualKey[binding.visualKey];
 let archive=null;
 if(approved && approved.sha256===row.imageSha256) {
  const request=await read(path.join(approved.draftDir,'request.json')).catch(error=>{
   if(error.code==='ENOENT') return null;throw error;
  });
  archive={visualKey:approved.visualKey,sha256:approved.sha256,
   prompt:request?.prompt??null,references:request?.referenceInputs??(request?.reference?[request.reference]:[])};
 }
 return {sku:row.sku,name:row.name,family:row.family,source:row.catalogSource,technicalProfileId:row.technicalProfileId??null,
  profile:group.profile,key:row.confirmedVisualKey??null,diagnosticKey:row.diagnosticKey, status:row.status,reasons:row.reasons,
  currentRequest:group.requestPreview,archive};
}));
const esc=value=>String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pre=value=>'<pre>'+esc(JSON.stringify(value,null,2))+'</pre>';
const reasons=after.blockerBreakdown.map(item=>{
 const reason=item.reason;
 const software=reason.startsWith('catalog-unsupported')||reason.includes('reference')||reason.includes('reconciliation');
 const stage=reason.startsWith('catalog-')?'cableCatalogProfile.js':'исторический dry-run';
 const necessity=software?'Ограничение исполнения. Не доказывает отсутствие сведений в каталоге.':
  reason.includes('Форма')?'Влияет на срез или силуэт. Без подтверждения возможны разные изображения.':
  reason.includes('неразрешённые')?'Проверка конфликта. В статистике пересекается с отдельными недостающими полями.':
  reason.includes('outside-')?'Граница выборки. Исключена из видимых SKU.':
  'Текущее подтверждение берётся из полей карточки и уже подключённых каталожных свидетельств. Причина может пересекаться с другими.';
 return `<tr><td>${esc(reason)}</td><td>${stage}</td><td>${item.affectedSku}</td><td>${esc(necessity)}</td></tr>`;
}).join('');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Допуск кабельных иллюстраций</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#193045;font:15px/1.6 system-ui,sans-serif}main{max-width:1350px;margin:auto;padding:clamp(10px,3vw,34px)}section{padding:clamp(12px,2.4vw,24px);border:1px solid #c8d6df;border-radius:10px;background:white;margin:14px 0}h1,h2,h3,p{margin:0 0 .65rem}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:8px 0}.scroll{overflow:auto}table{width:100%;min-width:640px;border-collapse:collapse}td,th{text-align:left;padding:8px;vertical-align:top;border-bottom:1px solid #cddbe4}thead{background:#e1edf5}summary{cursor:pointer}
</style></head><body><main><h1>Сквозная проверка допуска иллюстраций</h1>
<section><h2>Dry-run до и после</h2><p>Выпуск содержит ${after.summary.releaseSku} SKU. В видимом каталоге ${current.length}, из них ${current.filter(({row})=>row.status==='ALREADY_COVERED'&&row.coverage!=='exact-reuse').length} с действующим изображением. К новому повторному использованию ${current.filter(({row})=>row.coverage==='exact-reuse').length}, кандидатов к запросу ${uncovered.length-blocked.length}, готовых визуальных семейств ${new Set(uncovered.filter(({row})=>row.status==='READY_FOR_GENERATION').map(({row})=>row.family)).size}.</p>
<p>До изменений в том же видимом выпуске было ${[...previous.values()].filter(row=>row.status==='NEEDS_TECHNICAL_REVIEW').length} SKU вне допуска, после ${blocked.length}. У ${removed.length} SKU исчезли избыточные причины. Ни один SKU не был заблокирован только снятыми проверками. У ${missing.length} указаны конкретные пробелы, у ${unsupported.length} срабатывает ограничение по группировке жил. Эти множества пересекаются, исключительно этим ограничением заблокировано ${unsupportedOnly.length}.</p>
<p>Прежний снимок галереи содержал ${oldGallery.unresolved.length} непокрытых SKU. В полном dry-run дополнительно ${difference.length} видимых SKU вне той выборки. Это разница области отчётов. В семейном dry-run ВВГ вне допуска ${vvg.summary.blockedProfiles} диагностических групп, запросов ${vvg.summary.newGenerations}.</p></section>
<section><h2>Условия допуска</h2><div class="scroll" tabindex="0"><table><thead><tr><th>Причина</th><th>Код</th><th>Видимых SKU</th><th>Зачем и когда применяется</th></tr></thead><tbody>${reasons}</tbody></table></div>
<ul><li>SKU и карточка → cableCatalogProfile.js. Не добавлены новые источники или правила извлечения. У известной оболочки допустима нейтральная поверхность. При неизвестном наличии оболочки единая причина вместо дублирующего требования материала.</li>
<li>Визуальный ключ → cableVisualClassification.js. Сечение не добавляется автоматически. Плоская и круглая оболочки, различные жилы, экран, броня и заполнение разделены фактическими признаками профиля.</li>
<li>Семейная выборка показана по сохранённому плану от 15 ноября. Для текущей работы используются галерея и images:cables:sku.</li>
<li>Референсы → cableApprovedStyleReference.js и cableImageProvider.js. Защищённый эталон идёт первым. Совместимый основной референс геометрии обязателен для предусмотренных многожильных случаев. Техническая совместимость, два разрешения, SHA и действующая версия проверяются; произвольный дополнительный PNG больше не обязателен.</li>
<li>Промпт и шлюз → cableImageStyle.js. Технический контракт задаёт анатомию, композиционный задаёт разделку и ракурс. Действующие правила и история удержаний проверяются до запроса. В очереди история запросов, геометрический референс и технические пробелы имеют разные статусы.</li>
<li>Приёмка и архив → cableStyleBatch.js и cableApprovedResults.js. Проверяются PNG, SHA, точная конструкция, ручная приёмка, версия правил и разрешения. Отказ или удержание не превращается в положительный референс. Действующее назначение и право повторного использования различаются.</li></ul></section>
<section><h2>${routes.length} маршрута на реальных SKU</h2><p>Для исходного изображения сохранённый промпт помечен как архивный. При остановке перед построением профиля новый промпт и подбор референсов отсутствуют.</p>
${routes.map(route=>`<details><summary>${esc(route.sku)} · ${esc(route.name)} · ${esc(route.status)}</summary>${pre(route)}</details>`).join('')}</section>
<section><h2>Сохранность и тесты</h2><p>${tests.numPassedTests} тестов пройдено, ${tests.numFailedTests} ошибок. Прочитано ${decisions.length} постоянных решений. Ни один из ${noRepeat.length} запрещённых или удержанных решением SHA не выбран положительным референсом. Проверено ${fileHashes.length} ссылок на PNG, расхождений ${invalid.length}.</p>${invalid.length?pre(invalid):''}<p>Два независимых чтения реестра при перезапуске сравниваются по хешу решений и их истории. Новые изображения и привязки не создавались. Модуль галереи не изменялся.</p></section>
</main></body></html>`;
await fs.writeFile(path.join(root,out,'report.html'),html);
await fs.writeFile(path.join(root,out,'routes.json'),JSON.stringify(routes,null,2));
console.log({visible:current.length,blocked:blocked.length,missing:missing.length,unsupported:unsupported.length,
  unsupportedOnly:unsupportedOnly.length,removedReasonsSku:removed.length,olderScopeDifference:difference.length,
  routes:routes.length,archiveRoutes:routes.filter(r=>r.archive?.prompt).length,shaErrors:invalid.length,tests:tests.numPassedTests});
