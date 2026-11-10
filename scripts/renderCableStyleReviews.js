import { CABLE_REVIEW_IMAGE_CSS } from './lib/cableReviewImages.js';
import { loadCableImageStyle } from './lib/cableImageStyle.js';
import {
  CABLE_STYLE_REVIEW_CHECKS,
  CABLE_STYLE_REVIEW_LABELS,
} from './lib/cableCoreGeometry.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, 'outputs/cable-style-batch-drafts');
const currentStyle = await loadCableImageStyle(root);
const out = path.join(root, 'outputs/cable-style-batch-dry-run');
let entries = [];
try {
  entries = await fs.readdir(cache, { withFileTypes: true });
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const groups = [];
for (const e of entries.filter((x) => x.isDirectory())) {
  try {
    const g = JSON.parse(
      await fs.readFile(path.join(cache, e.name, 'group.json'))
    );
    let image = null;
    try {
      image =
        'data:image/png;base64,' +
        (await fs.readFile(path.join(cache, e.name, 'image.png'))).toString(
          'base64'
        );
    } catch {}
    groups.push({ ...g, image });
  } catch {}
}
const data = JSON.stringify(groups).replaceAll('<', '\\u003c');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, 'review-gallery.html'),
  `<!doctype html><meta charset="utf-8"><title>Ручная проверка черновиков стандарта</title><style>body{font:15px system-ui;margin:24px;color:#24384d;background:#f1f5f8}article{background:white;margin:18px 0;padding:18px}${CABLE_REVIEW_IMAGE_CSS}.picture{background:white}.checker{background:repeating-conic-gradient(#fff 0% 25%,#dde3eb 0% 50%) 50%/20px 20px}.dark{background:#18212d}label{display:block;margin:8px}button,input{font:inherit;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Ручная проверка новых изображений</h1><p>Черновики не назначены товарам. Отметьте проверки и сохраните решение с точным SHA-256 PNG. Веб-страница сама bindings не меняет.</p><input id="reviewer" placeholder="Кто проверил"><main id="list"></main><script id="data" type="application/json">${data}</script><script>const currentVersion=${JSON.stringify(currentStyle.version)};const groups=JSON.parse(document.getElementById('data').textContent),keys=${JSON.stringify(CABLE_STYLE_REVIEW_CHECKS)},labels=${JSON.stringify(CABLE_STYLE_REVIEW_LABELS)};const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));document.getElementById('list').innerHTML=groups.length?groups.map((g,i)=>'<article><h2>'+esc(g.profile.visualizationType)+'</h2><p>'+esc(g.visualKey)+' · '+esc(g.status)+' · '+esc(g.standardVersion)+'</p>'+((g.validation?.warnings||[]).map(w=>'<p>'+esc(w)+'</p>').join(''))+[g.image?'<div class="picture" id="pic'+i+'"><img src="'+g.image+'"></div><button data-bg="" data-i="'+i+'">Белый</button><button data-bg="checker" data-i="'+i+'">Шахматный</button><button data-bg="dark" data-i="'+i+'">Тёмный</button>':'Изображение не получено'].join('')+'<details><summary>SKU и характеристики</summary><pre>'+esc(JSON.stringify({profile:g.profile,members:g.members},null,2))+'</pre></details>'+keys.map((k,n)=>'<label><input type="checkbox" id="'+i+k+'">'+labels[n]+'</label>').join('')+'<button data-review="APPROVED" '+(g.standardVersion===currentVersion?'':'disabled title="Старая версия стандарта; нельзя утверждать как 1.1.0"')+' data-i="'+i+'">Сохранить APPROVED</button> <button data-review="REJECTED" data-i="'+i+'">Сохранить REJECTED</button></article>').join(''):'<p>Черновиков пока нет: Image API ещё не вызывался. Эта страница готова для будущего review.</p>';document.addEventListener('click',e=>{const b=e.target;if(b.dataset.bg!==undefined)document.getElementById('pic'+b.dataset.i).className='picture '+b.dataset.bg;if(b.dataset.review){const i=Number(b.dataset.i),g=groups[i],reviewer=document.getElementById('reviewer').value.trim(),checks=Object.fromEntries(keys.map(k=>[k,document.getElementById(i+k).checked]));if(!reviewer||!g.validation?.sha256||(b.dataset.review==='APPROVED'&&!Object.values(checks).every(Boolean))){alert('Нужны имя проверяющего, корректный PNG и все проверки для APPROVED');return}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({status:b.dataset.review,sha256:g.validation.sha256,reviewer,checks},null,2)],{type:'application/json'}));a.download=g.draftKey+'-decision.json';a.click();}});</script>`
);
console.log('Review gallery prepared; drafts:', groups.length);
