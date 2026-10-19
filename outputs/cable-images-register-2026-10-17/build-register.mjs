import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = '/Users/Shared/yuzhural-site';
const out = path.join(root, 'outputs/cable-images-register-2026-10-17');
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const plan = await read('data/product-image-metadata/production-v1/plan.json');
const manifest = await read('data/product-image-metadata/production-v1/manifest.json');
const bindings = await read('shared/generatedProductImages.json');
const rejected = await read('shared/rejectedProductImages.json');
const catalog = new Map((await read('data/catalog-current/products.json')).map(p => [p.sku, p]));
const labels = { generated: 'Новое · на сайте', reused: 'Ранее утверждено · на сайте', rejected: 'Отклонено · не назначено', failed: 'Ошибка API · изображения нет' };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const groups = [];
try {
  for (const g of plan.groups) {
    const record = manifest.groups[g.visualKey];
    assert.ok(record);
    const status = rejected.byVisualKey[g.visualKey] || record.qualityRejected ? 'rejected' : record.status === 'reused' ? 'reused' : record.status === 'generated' && record.bound ? 'generated' : 'failed';
    let preview = '', bytes = 0;
    if (status !== 'failed') {
      const png = await fs.readFile(path.join(root, 'public', g.image.slice(1)));
      bytes = png.length;
      preview = await page.evaluate(async (src) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 768 / image.width, 512 / image.height);
        canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.88);
      }, 'data:image/png;base64,' + png.toString('base64'));
      assert.ok(preview.startsWith('data:image/webp;base64,'));
    }
    const members = g.members.map(member => {
      const p = catalog.get(member.sku);
      assert.ok(p);
      const assigned = Boolean(record.bound && !rejected.byVisualKey[g.visualKey] && bindings.bySku[p.sku]?.visualKey === g.visualKey && bindings.bySku[p.sku]?.status === 'approved');
      assert.equal(assigned, status === 'generated' || status === 'reused');
      return { sku: p.sku, name: p.name, section: member.section, url: 'http://localhost:5173/product/' + p.slug, assigned };
    });
    groups.push({ key: g.visualKey, status, label: labels[status], family: g.visualProfile.family, cores: g.visualProfile.cores, preview, image: g.image, width: record.validation?.width, height: record.validation?.height, bytes, reason: rejected.byVisualKey[g.visualKey]?.reason || record.error || '', members });
    if (groups.length % 80 === 0) console.log('Prepared ' + groups.length + '/' + plan.groups.length);
  }
} finally { await browser.close(); }
groups.sort((a,b) => (['generated','reused','rejected','failed'].indexOf(a.status)-['generated','reused','rejected','failed'].indexOf(b.status)) || a.family.localeCompare(b.family, 'ru') || a.cores-b.cores);
const count = status => groups.filter(g => g.status === status).length;
assert.equal(count('generated'), 312); assert.equal(count('reused'), 119); assert.equal(count('rejected'), 130); assert.equal(count('failed'), 4);
assert.equal(groups.flatMap(g => g.members).filter(p => p.assigned).length, 1604);
assert.equal(groups.flatMap(g => g.members).length, 1877);
const data = JSON.stringify(groups).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Изображения кабелей и позиции каталога</title>
<style>
:root{font:15px/1.5 system-ui,sans-serif;color:#21354b;background:#f2f5f8}*{box-sizing:border-box}body{margin:0}main{max-width:1450px;margin:auto;padding:30px 24px}h1{font-size:32px;line-height:1.2;margin:0 0 10px}h2{font-size:20px;margin:12px 0}p{margin:6px 0 14px}.muted{color:#5a6e80}.counts{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}.stat{background:white;border:1px solid #dfe6ed;padding:14px 20px;border-radius:12px}.stat strong{display:block;font-size:26px}.controls{position:sticky;top:0;z-index:2;background:#f2f5f8f5;padding:12px 0;backdrop-filter:blur(8px)}input{width:100%;padding:13px 16px;border:1px solid #b9c8d6;border-radius:8px;font:inherit;margin-bottom:12px}.filters{display:flex;gap:8px;flex-wrap:wrap}button,.download{font:inherit;cursor:pointer;border:1px solid #b9c8d6;background:white;border-radius:8px;padding:9px 14px;color:#21354b}button.active{background:#173e67;color:white;border-color:#173e67}.download{margin-left:auto}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{min-width:0;border:1px solid #dce4ec;background:white;border-radius:12px;overflow:hidden}.picture{height:210px;width:100%;border:0;border-radius:0;background:repeating-conic-gradient(#fff 0% 25%,#edf0f4 0% 50%) 50%/20px 20px;padding:0}.picture img{width:100%;height:100%;object-fit:contain}.content{padding:16px}.badge{font-size:12px;font-weight:650;border-radius:6px;padding:5px 9px;display:inline-block;background:#e6f3eb;color:#22603b}.reused{background:#e8f0fa;color:#285786}.rejected,.failed{background:#fff0e4;color:#854713}.key{font-size:11px;overflow-wrap:anywhere;color:#68798b;margin-top:14px}.details{font-size:12px;color:#68798b}.reason{background:#fff6eb;padding:10px;border-radius:8px;font-size:12px;overflow-wrap:anywhere;margin:10px 0}details{margin-top:12px}summary{cursor:pointer;font-weight:650;padding:8px 0}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;padding:9px 4px;vertical-align:top;border-top:1px solid #e6edf3}td:first-child{white-space:nowrap}a{color:#2365a4;text-decoration:none}a:hover{text-decoration:underline}.empty{padding:24px;text-align:center}.notassigned{font-weight:650;color:#854713}dialog{border:0;border-radius:14px;max-width:min(1000px,95vw);padding:18px;color:#21354b}dialog::backdrop{background:#102337aa}dialog img{width:100%;max-height:65vh;object-fit:contain;background:repeating-conic-gradient(#fff 0% 25%,#edf0f4 0% 50%) 50%/20px 20px}dialog header{display:flex;justify-content:space-between;gap:12px;align-items:center}dialog p{font-size:13px;overflow-wrap:anywhere}@media(max-width:1050px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){main{padding:20px 12px}h1{font-size:25px}.grid{grid-template-columns:1fr}.stat{flex:1;padding:10px}.filters button{font-size:12px;padding:8px}.download{margin-left:0}}
</style>
<main><h1>Изображения кабелей и позиции каталога</h1><p class="muted">Первый этап наполнения · 17 октября 2026 · превью встроены в файл</p><p>У каждого изображения перечислены все позиции соответствующей visual-группы. Пометка «на сайте» означает подтверждённую привязку. У отклонённых результатов показаны предполагаемые позиции, которым это изображение <b>не назначено</b>.</p>
<div class="counts"><div class="stat"><strong>312</strong>новых изображений · 1034 товара</div><div class="stat"><strong>119</strong>ранее утверждённых · 570 товаров</div><div class="stat"><strong>130</strong>отклонено после проверки</div><div class="stat"><strong>4</strong>ошибки API · без изображения</div></div>
<p class="muted">Превью до 768 × 512 px; исходные PNG не изменены. Карточки товаров открываются при запущенном локальном сайте. 3831 товар NEEDS_REVIEW в этот файл не входит.</p>
<div class="controls"><input id="search" type="search" placeholder="Поиск по названию, SKU, семейству или visualKey" aria-label="Поиск"><div class="filters"><button class="active" data-filter="generated">Новые на сайте · 312</button><button data-filter="reused">Ранее утверждённые · 119</button><button data-filter="rejected">Отклонённые · 130</button><button data-filter="failed">Ошибки API · 4</button><button data-filter="all">Все группы · 565</button><button id="csv" class="download">Скачать все привязки CSV</button></div></div><p id="shown" class="muted"></p><section id="grid" class="grid"></section><p id="empty" class="empty" hidden>Ничего не найдено</p></main>
<dialog id="preview"><header><b id="previewTitle"></b><button id="closePreview">Закрыть</button></header><img id="large" alt="Увеличенное превью кабеля"><p id="previewKey"></p></dialog>
<script id="data" type="application/json">${data}</script><script>
const groups=JSON.parse(document.getElementById('data').textContent),grid=document.getElementById('grid');let filter='generated';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchText=g=>[g.key,g.family,...g.members.flatMap(p=>[p.sku,p.name])].join(' ').toLocaleLowerCase('ru');
const texts=groups.map(searchText);function render(){const q=document.getElementById('search').value.trim().toLocaleLowerCase('ru'),list=groups.map((g,i)=>({...g,i})).filter(g=>(filter==='all'||g.status===filter)&&texts[g.i].includes(q));document.getElementById('shown').textContent='Групп: '+list.length+' · позиций: '+list.reduce((n,g)=>n+g.members.length,0);document.getElementById('empty').hidden=list.length>0;
grid.innerHTML=list.map(g=>'<article class="card" data-key="'+esc(g.key)+'"><div class="picture">'+(g.preview?'<button class="picture" data-preview="'+g.i+'" aria-label="Увеличить изображение"><img loading="lazy" src="'+g.preview+'" alt="'+esc(g.members[0].name)+'"></button>':'<div class="empty">Изображение не получено</div>')+'</div><div class="content"><span class="badge '+g.status+'">'+esc(g.label)+'</span><h2>'+esc(g.members[0].name)+'</h2><div class="details">'+esc(g.family)+' · жил: '+g.cores+(g.width?' · PNG '+g.width+' × '+g.height+' · '+(g.bytes/1048576).toFixed(2)+' МБ':'')+'</div>'+((g.status==='rejected'||g.status==='failed')?'<p class="notassigned">Эта иллюстрация не назначена перечисленным товарам.</p><div class="reason">'+esc(g.reason)+'</div>':'')+'<details open><summary>'+((g.status==='generated'||g.status==='reused')?'Привязанные товары':'Предполагаемые позиции')+' · '+g.members.length+'</summary><table><thead><tr><th>SKU</th><th>Наименование</th></tr></thead><tbody>'+g.members.map(p=>'<tr><td>'+esc(p.sku)+'</td><td><a href="'+esc(p.url)+'" target="_blank" rel="noopener">'+esc(p.name)+'</a></td></tr>').join('')+'</tbody></table></details><div class="key">'+esc(g.key)+'</div></div></article>').join('');}
document.getElementById('search').addEventListener('input',render);document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render()});
grid.addEventListener('click',e=>{const b=e.target.closest('[data-preview]');if(!b)return;const g=groups[Number(b.dataset.preview)];document.getElementById('large').src=g.preview;document.getElementById('previewTitle').textContent=g.members[0].name;document.getElementById('previewKey').textContent=g.key;document.getElementById('preview').showModal()});document.getElementById('closePreview').onclick=()=>document.getElementById('preview').close();
document.getElementById('csv').onclick=()=>{const fields=['Статус','Назначено товару','SKU','Наименование','Сечение мм2','visualKey','Файл PNG','Карточка товара','Причина отклонения'];const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const rows=[fields,...groups.flatMap(g=>g.members.map(p=>[g.label,p.assigned?'ДА':'НЕТ',p.sku,p.name,p.section,g.key,g.image,p.url,g.reason]))];const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\\r\\n')],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='cable-images-and-products.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};render();
</script></html>`;
const file = path.join(out, 'cable-images-and-products.html');
await fs.writeFile(file, html);
console.log(JSON.stringify({ file, bytes: Buffer.byteLength(html), images: groups.filter(g => g.preview).length, groups: groups.length, assignedProducts: groups.flatMap(g => g.members).filter(p => p.assigned).length }));
