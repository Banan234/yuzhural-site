import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';
import { cableIllustrationDefects } from './lib/cableIllustrationDefects.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = 'outputs/cable-catalog-requirements-2026-11-15';
const read = async file => JSON.parse(await fs.readFile(path.join(root, file)));
const [before, queue, plan, tests, registry, manifest, decisions] = await Promise.all([
  read('outputs/cable-catalog-source-2026-11-15/dry-run/queue.json'),
  read(out+'/dry-run/queue.json'), read(out+'/dry-run/plan.json'), read(out+'/tests.json'),
  read('data/cable-approved-results/registry.json'), read('shared/generatedProductImages.json'),
  loadCableReviewDecisions(root),
]);
const oldRows = new Map(before.groups.flatMap(group => group.members.map(row => [row.sku,row])));
const rows = queue.groups.flatMap(group => group.members.map(row => ({...row, groupKey:group.visualKey})));
if (queue.catalogHash !== before.catalogHash || rows.length !== oldRows.size || rows.some(row=>!oldRows.has(row.sku)))
  throw Error('The report requires comparable family snapshots');
const covered = rows.filter(row=>row.status==='ALREADY_COVERED');
const blocked = rows.filter(row=>row.status==='NEEDS_TECHNICAL_REVIEW');
const newlyReady = rows.filter(row=>row.status==='READY_FOR_GENERATION' && oldRows.get(row.sku).status!=='READY_FOR_GENERATION');
const archived = Object.values(registry.byVisualKey).concat(Object.values(registry.alternativesBySha256 ?? {}));
const checks = await Promise.all([
  ...archived.map(entry=>({file:path.join(root,entry.draftDir,'image.png'),sha:entry.sha256})),
  ...decisions.map(({decision,decisionDir})=>({file:path.join(decisionDir,'image.png'),sha:decision.sha256})),
  ...covered.filter(row=>row.coverage==='existing-binding').map(row=>({
    file:path.join(root,'public',manifest.bySku[row.sku].image.slice(1)),sha:row.imageSha256,
  })),
].map(async ({file,sha})=>({file, sha, ok:await fs.readFile(file).then(bytes=>digest(bytes)===sha,()=>false)})));
const mismatches = checks.filter(check=>!check.ok);
const removedReasons = rows.reduce((total,row)=>total+oldRows.get(row.sku).reasons.filter(reason=>!row.reasons.includes(reason)).length,0);
const esc = value=>String(value??'').replace(/[&<>"']/gu, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const pretty = value=>esc(JSON.stringify(value,null,2));
const control = ['YU-0000919','YU-0000920','YU-0000879','YU-0000757'];
const ordered = [...rows].sort((a,b)=>(control.includes(b.sku)-control.includes(a.sku))||a.sku.localeCompare(b.sku));
const chosen = plan.groups.filter(group=>plan.control.visualKeys.includes(group.visualKey)&&group.request);
const category = {critical:'Критические',conditional:'По конструкции',optional:'Необязательные'};
const records = decisions.map(({decision,previous})=>{
  const relevant = cableIllustrationDefects.filter(defect=>defect.observedSha256?.includes(decision.sha256)||defect.hold?.some(item=>item.sha256===decision.sha256));
  return {sku:decision.sku, key:decision.visualKey, sha256:decision.sha256, status:decision.disposition??decision.status,
    rules:relevant.map(defect=>({id:defect.id,rule:defect.ruleId,family:defect.family,
      version:defect.ruleVersion,requirement:defect.expected??defect.description})), previous};
});
const document = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ВВГ · требования к данным каталога</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf2f6;color:#14293d;font:16px/1.5 system-ui,sans-serif}main{max-width:1460px;margin:auto;padding:clamp(12px,3vw,36px)}section{background:white;padding:clamp(12px,2vw,24px);margin:14px 0;border-radius:10px;border:1px solid #cbd5e1}h1,h2,p{margin:0 0 .65rem}input,select{font:inherit;padding:5px 8px;margin:0 8px 12px 0}.scroll{overflow:auto}table{width:100%;min-width:820px;border-collapse:collapse}td,th{padding:9px;text-align:left;vertical-align:top;border-bottom:1px solid #d8e1eb;overflow-wrap:anywhere}thead{background:#e3edf7}code{overflow-wrap:anywhere}pre{white-space:pre-wrap}small{color:#375772}summary{cursor:pointer}[hidden]{display:none}
</style><main><h1>ВВГ · достоверность каталожных профилей</h1>
<section><h2>Сверка с предыдущим выпуском</h2><p>Один выпуск каталога и те же ${rows.length} SKU. Сохранено существующее покрытие ${covered.length} SKU. На проверке ${blocked.length} SKU. Готовых к новой генерации ${newlyReady.length}. Удалено ${removedReasons} отдельных записей причин по SKU.</p><p>Прежде каждой неполной карточке присваивался собственный ключ. Теперь ${queue.groups.length} диагностических групп вместо ${before.groups.length} индивидуальных строк. Из них ${queue.summary.categories.NEEDS_TECHNICAL_REVIEW} затронуты блокировками. Это группы проверки, а не разрешение на совместное использование PNG.</p><p>Штатный план по заполненным карточкам содержит ${plan.summary.blockedProfiles} групп вне допуска, ${plan.summary.newGenerations} новых генераций и ${plan.summary.reusedImages} новых назначений из архива. Полная таблица ниже включает и позиции за рамками контрольной партии.</p></section>
<section><h2>SKU, технические и визуальные ключи</h2><p>Контрольные SKU показаны первыми. Технический идентификатор и visualKey появляются после подтверждения обязательной конструкции. Действующая иллюстрация имеет собственный SHA.</p>
<label>SKU, ключ, SHA или причина <input id="query" type="search"></label><label>Статус <select id="status"><option value="">Все</option><option value="NEEDS_TECHNICAL_REVIEW">Требуют проверки</option><option value="ALREADY_COVERED">Покрыты</option><option value="READY_FOR_GENERATION">Готовы</option></select></label>
<div class="scroll" tabindex="0"><table><thead><tr><th>SKU и кабель</th><th>Статус и идентификаторы</th><th>Обязательные поля и данные карточки</th></tr></thead>
<tbody>${ordered.map(row=>`<tr data-status="${row.status}"><th scope="row">${esc(row.sku)}<br>${esc(row.name)}</th><td>${esc(row.status)}<details><summary>Идентификаторы</summary><pre>${pretty({technicalProfileId:row.technicalProfileId??null,visualProfileId:row.visualProfileId??null,visualKey:row.confirmedVisualKey??null,diagnosticKey:row.diagnosticKey??null,imageSha256:row.imageSha256??null})}</pre></details></td><td>${row.reasons.map(esc).join('<br>')}<details><summary>Необходимость полей и исходные значения</summary>${Object.entries(row.requirements).map(([key,value])=>`<p><strong>${category[key]}</strong> · ${value.map(esc).join(', ')}</p>`).join('')}<pre>${pretty(row.catalogSource.fields)}</pre></details></td></tr>`).join('')}</tbody></table></div></section>
<section><h2>Запросы и референсы</h2>${chosen.length?chosen.map(group=>`<details><summary>${esc(group.visualKey)}</summary><pre>${pretty({skus:group.eligibleSkus,family:group.family,technical:group.request.technicalProfile,selection:group.request.referenceSelection,inputs:group.request.referenceInputs})}</pre></details>`).join(''):'<p>Запланированных запросов нет. Проверка multipart и разрешений референсов выполнена на временном каталоге через локальный API-mock.</p>'}</section>
<section><h2>Архив и проверки</h2><p>Проверено ${archived.length} архивных записей, ${decisions.length} решений и ${covered.length} действующих назначений ВВГ. Несовпадений SHA или отсутствующих PNG: ${mismatches.length}.</p>${mismatches.length?'<pre>'+pretty(mismatches)+'</pre>':''}<details><summary>Решения, предыдущие версии и связанные дефекты</summary><pre>${pretty(records)}</pre></details>
<p>Автоматические тесты: ${tests.numPassedTests} успешных, ${tests.numFailedTests} с ошибками. Визуальное соответствие пикселей остаётся предметом ручной приёмки. Платных запросов и изменений привязок нет.</p></section>
</main><script>const q=document.querySelector('#query'),s=document.querySelector('#status');function filter(){const v=q.value.trim().toLowerCase();for(const r of document.querySelectorAll('tbody tr'))r.hidden=(s.value&&s.value!==r.dataset.status)||!r.textContent.toLowerCase().includes(v)}q.oninput=s.onchange=filter;</script></html>`;
await fs.writeFile(path.join(root,out,'report.html'),document);
await fs.writeFile(path.join(root,out,'integrity.json'),JSON.stringify({checked:checks.length,mismatches},null,2));
console.log({skus:rows.length,groups:queue.groups.length,covered:covered.length,blocked:blocked.length,newlyReady:newlyReady.length,removedReasons,integrityMismatches:mismatches.length});
