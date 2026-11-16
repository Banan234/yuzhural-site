import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const out='outputs/cable-catalog-evidence-2026-11-15';
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file)));
const [oldQueue,newQueue,allQueue,oldGallery,gallery,tests,decisions,registry,bindings]=await Promise.all([
  read('outputs/cable-catalog-requirements-2026-11-15/dry-run/queue.json'),read(out+'/vvg/queue.json'),
  read(out+'/all/queue.json'),read('outputs/cable-gallery-local-2026-11-15/inventory.json'),
  read(out+'/gallery.json'),read(out+'/tests.json'),loadCableReviewDecisions(root),
  read('data/cable-approved-results/registry.json'),read('shared/generatedProductImages.json'),
]);
const flatten=queue=>queue.groups.flatMap(group=>group.members);
const currentBySku=new Map(flatten(newQueue).map(row=>[row.sku,row]));
const familyPilot=flatten(oldQueue).filter(row=>row.status==='NEEDS_TECHNICAL_REVIEW')
  .map(before=>({before,after:currentBySku.get(before.sku)}));
if(oldQueue.catalogHash!==newQueue.catalogHash || familyPilot.length!==162 || familyPilot.some(row=>!row.after))
  throw Error('The 162-SKU pilot does not match the baseline');
const sortedImageIndex=value=>value.items.map(({sha256,status,approved,bindings,referenceAllowed})=>
  ({sha256,status,approved,bindings,referenceAllowed})).sort((a,b)=>a.sha256.localeCompare(b.sha256));
const sameInventory=digest(sortedImageIndex(oldGallery))===digest(sortedImageIndex(gallery));
const approvalEntries=[...Object.values(registry.byVisualKey),...Object.values(registry.alternativesBySha256??{})];
const expected=[
  ...decisions.map(record=>[path.join(record.decisionDir,'image.png'),record.decision.sha256]),
  ...approvalEntries.map(entry=>[path.join(root,entry.draftDir,'image.png'),entry.sha256]),
  ...gallery.items.filter(item=>item.bindings).flatMap(item=>item.skus
    .filter(sku=>bindings.bySku[sku]?.sha256===item.sha256)
    .map(sku=>[path.join(root,'public',bindings.bySku[sku].image),item.sha256])),
];
const mismatched=(await Promise.all(expected.map(async ([file,sha])=>
  await fs.readFile(file).then(bytes=>digest(bytes)===sha?null:file,()=>file)))).filter(Boolean);
const counts=(rows,select)=>{
  const result=new Map();
  for(const row of rows) for(const value of new Set(select(row))) result.set(value,(result.get(value)??0)+1);
  return [...result].sort((a,b)=>b[1]-a[1]);
};
const recovered=rows=>rows.filter(row=>Object.keys(row.catalogSource.recovered??{}).length);
const allRows=flatten(allQueue);
const visible=allRows.filter(row=>row.visible);
const scoped=visible.filter(row=>row.status==='NEEDS_TECHNICAL_REVIEW');
const restored=recovered(familyPilot.map(row=>row.after));
const exampleFields=new Set();
const examples=[];
const choose=row=>{
  if(row && !examples.includes(row) && examples.length<20) examples.push(row);
};
for(const sku of ['YU-0000920','YU-0000879','YU-0000757','YU-0000890','YU-0000975']) choose(familyPilot.find(row=>row.after.sku===sku));
for(const row of familyPilot) {
  const keys=Object.keys(row.after.catalogSource.recovered);
  if(keys.some(key=>!exampleFields.has(key))) choose(row);
  keys.forEach(key=>exampleFields.add(key));
}
for (const row of familyPilot.filter(pair=>Object.keys(pair.after.catalogSource.recovered).length)) choose(row);
const esc=value=>String(value??'').replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pre=value=>'<pre>'+esc(JSON.stringify(value,null,2))+'</pre>';
const rowHtml=({before,after})=>`<tr><th>${esc(after.sku)}<br>${esc(after.name)}</th><td>${esc(before.reasons.join(' · '))}</td><td>${Object.entries(after.catalogSource.recovered).map(([field,sources])=>`<p><strong>${esc(field)}</strong> · ${sources.map(row=>esc(row.value+' ← '+row.source+' · '+row.statement)).join('<br>')}</p>`).join('')||'Дополнительных однозначных сведений нет.'}</td><td>${esc(after.status)}<br>${esc(after.reasons.join(' · '))}
<details><summary>Источники всех известных полей, ключ и PNG</summary>${pre({facts:after.catalogSource.fields,sources:after.catalogSource.provenance,
  visualKey:after.confirmedVisualKey??null,diagnosticKey:after.diagnosticKey,approvedPng:after.imageSha256??null})}</details></td></tr>`;
const table=rows=>`<div class="scroll" tabindex="0"><table><thead><tr><th>SKU</th><th>До</th><th>Подтверждено из карточки</th><th>После</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
const families=new Map();
for(const row of visible) {
  const key=row.family??'Без классификации';
  if(!families.has(key)) families.set(key,{covered:0,blocked:0,ready:0,keys:new Set()});
  const stats=families.get(key);
  if(row.status==='ALREADY_COVERED') stats.covered++;
  else if(row.status==='READY_FOR_GENERATION') stats.ready++;
  else stats.blocked++;
  if(row.confirmedVisualKey) stats.keys.add(row.confirmedVisualKey);
}
const unresolved=familyPilot.filter(row=>row.after.status==='NEEDS_TECHNICAL_REVIEW').length;
const newlyReuse=familyPilot.filter(row=>row.after.coverage==='exact-reuse').length;
const newlyReady=familyPilot.filter(row=>row.after.status==='READY_FOR_GENERATION').length;
const list=(pairs,limit=100)=>'<ul>'+pairs.slice(0,limit).map(([text,n])=>`<li>${esc(text)} · ${n}</li>`).join('')+'</ul>';
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Каталожные данные · иллюстрации кабелей</title><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,sans-serif;color:#182e41;background:#eef2f6}main{max-width:1460px;margin:auto;padding:clamp(12px,3vw,36px)}section{background:white;border:1px solid #c8d5df;border-radius:10px;padding:clamp(10px,2vw,26px);margin:14px 0}h1,h2,p{margin:0 0 .65rem}.scroll{overflow:auto}table{border-collapse:collapse;min-width:850px;width:100%}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #d5e0e7}thead{background:#e1edf5}pre{white-space:pre-wrap;overflow-wrap:anywhere}input{font:inherit;padding:6px;margin:7px 0}summary{cursor:pointer}</style></head><body><main>
<h1>Совместимость кабельных иллюстраций</h1>
<section><h2>ВВГ · 162 ранее заблокированных SKU</h2><p>Разблокировано ${162-unresolved} · осталось ${unresolved} · повторное использование ${newlyReuse} · новая генерация ${newlyReady}.</p><p>Восстановлены поля у ${restored.length} SKU. Наличие одного подтверждённого признака не доказывает остальные. Неопределённые поля и несовместимость видны в таблице.</p>
${list(counts(restored,row=>Object.keys(row.catalogSource.recovered)))}<h3>Оставшиеся причины</h3>${list(counts(familyPilot.map(row=>row.after),row=>row.reasons),15)}</section>
<section><h2>20 примеров до и после</h2>${table(examples)}</section>
<section><h2>Все 162 позиции</h2><label>SKU, имя, поле или ключ <input id="search" type="search"></label><div id="pilot">${table(familyPilot)}</div></section>
<section><h2>Весь каталог</h2><p>Без подтверждённого профиля для свободных позиций было ${oldGallery.stats.unresolvedSku}, стало ${gallery.stats.unresolvedSku}. Проверенных новых назначений из архива ${gallery.stats.reuseSku}. Уникальных профилей в очереди генерации ${gallery.stats.missingProfiles}, READY ${gallery.stats.readyProfiles}. Покрыто ${gallery.stats.coveredSku} SKU.</p>
<p>Данные из других полей карточки добавлены для ${recovered(visible).length} видимых SKU. Уникальные визуальные ключи, доказанные из текущих карточек, ${new Set(visible.map(row=>row.confirmedVisualKey).filter(Boolean)).size}. Диагностические группы не являются визуальными профилями.</p>
<h3>Массовые причины</h3>${list(counts(scoped,row=>row.reasons),15)}
<details><summary>Распределение по семействам · ${families.size}</summary><div class="scroll" tabindex="0"><table><thead><tr><th>Семейство</th><th>Покрыто</th><th>Проверка</th><th>Готово</th><th>Подтверждённые ключи</th></tr></thead><tbody>${[...families].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,f])=>`<tr><th>${esc(key)}</th><td>${f.covered}</td><td>${f.blocked}</td><td>${f.ready}</td><td>${f.keys.size}</td></tr>`).join('')}</tbody></table></div></details></section>
<section><h2>Сохранность</h2><p>Проверено ${expected.length} ссылок на PNG, расхождений SHA: ${mismatched.length}. Состояние галереи совпадает с предыдущим снимком: ${sameInventory?'да':'есть различия'}. Перечитано ${decisions.length} постоянных решений с историей. Тесты: ${tests.numPassedTests} успешных, ${tests.numFailedTests} ошибок. Платных запросов и сохранённых новых PNG нет.</p></section>
</main><script>const input=document.querySelector('#search');input.oninput=()=>{const q=input.value.toLowerCase().trim();for(const r of document.querySelectorAll('#pilot tbody tr'))r.hidden=!r.textContent.toLowerCase().includes(q);};</script></body></html>`;
await fs.writeFile(path.join(root,out,'report.html'),html);
await fs.writeFile(path.join(root,out,'integrity.json'),JSON.stringify({
  sameInventory, checked:expected.length, mismatched, decisions:decisions.map(({decision,previous})=>({sha256:decision.sha256,status:decision.status,history:previous.length})),
},null,2));
console.log({recoveredPilot:restored.length,recoveredAll:recovered(visible).length,newlyReady,newlyReuse,examples:examples.length,sameInventory,integrityMismatches:mismatched.length});
