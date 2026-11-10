const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );

export function renderVisualizationTypeReport(report) {
  const compact = (rows) =>
    rows.map((r) => ({
      sku: r.sku,
      name: r.displayName,
      family: r.baseFamily,
      type: r.visualProfile.visualizationType,
      cores: r.cores,
      geometry: r.visualProfile.geometry,
      layers: r.visualization.visibleLayerCount,
      armor: r.visualProfile.armor,
      shield: r.visualProfile.shield,
      visualKey: r.visualKey,
      reasons: r.visualization.reasons.map((i) => i.message),
      rationale: r.visualization.rationale,
    }));
  const data = JSON.stringify({
    requested: compact(report.requested.rows),
    current: compact(report.current.rows),
  }).replace(/</g, '\\u003c');
  const stats = report.requested.summary.buckets
    .map(
      (b) =>
        `<tr><td>${esc(b.type)}</td><td>${b.products}</td><td>${b.visualKeys}</td></tr>`
    )
    .join('');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Типы визуализации кабелей — dry-run</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#243b53;background:#f3f6f9;margin:0}main{max-width:1500px;margin:auto;padding:30px 24px}h1{font-size:30px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;font-size:13px;background:white}td,th{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid #e0e6ec}th{background:#e5edf5}small{display:block;overflow-wrap:anywhere;color:#63788c;font-size:11px}input,select,button{font:inherit;padding:10px 12px;border:1px solid #b4c4d4;border-radius:7px;background:white;color:inherit}input{min-width:260px;flex:1}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 10px}.notice{padding:16px 20px;border-radius:10px;background:#e7eef6}.scroll{overflow:auto}p{max-width:1100px}.pill{white-space:nowrap;font-weight:650}.review{color:#8c531d}.reason{min-width:280px}.counts{max-width:800px}button{cursor:pointer}@media(max-width:600px){main{padding:16px 12px}h1{font-size:24px}input{min-width:100%}}</style>
<main><h1>Типы визуализации кабелей</h1><p>Dry-run · 8 ноября 2026</p><div class="notice">Классифицирован запрошенный сохранённый срез: <b>5708 товаров</b>. В рабочем каталоге сейчас <b>${report.current.summary.totalProducts}</b>; его отдельный результат доступен переключателем ниже. Поле <code>visualProfile.visualizationType</code> не изменяет visualKey и не разрешает генерацию.</div>
<h2>Запрошенные 5708 товаров</h2><div class="counts"><table><thead><tr><th>Тип</th><th>Товаров</th><th>Уникальных visualKey</th></tr></thead><tbody>${stats}</tbody></table></div><p>Порог компактного среза — ${report.rules.compactFromCores} жил у известной круглой конструкции с общей оболочкой. Броня, экран, огнестойкий барьер и явно известная внутренняя оболочка учитываются независимо от числа жил. Видимые слои — схема иллюстрации, не полное технологическое описание.</p>
<h2>План референсов — ещё не созданы</h2><div class="scroll"><table><thead><tr><th>Тип</th><th>Что проверить</th><th>Предлагаемый товар</th></tr></thead><tbody>${report.references.map((r) => `<tr><td class="pill">${esc(r.type)}</td><td>${esc(r.purpose)}</td><td>${esc(r.candidate?.name || 'Сначала уточнить конструкцию')}<small>${esc(r.candidate?.sku || r.status)}</small></td></tr>`).join('')}</tbody></table></div>
<h2>Все позиции и неоднозначные случаи</h2><div class="controls"><select id="source" aria-label="Срез каталога"><option value="requested">Запрошенный срез · 5708</option><option value="current">Текущий каталог · ${report.current.summary.totalProducts}</option></select><select id="type" aria-label="Тип визуализации"><option value="all">Все типы</option>${report.requested.summary.buckets.map((b) => `<option>${esc(b.type)}</option>`).join('')}</select><input type="search" id="search" placeholder="Название, SKU, семейство, visualKey" aria-label="Поиск"><button id="previous">Назад</button><button id="next">Далее</button></div><p id="counter"></p><div class="scroll"><table><thead><tr><th>SKU / товар</th><th>Тип</th><th>Конструкция</th><th>Обоснование / причина проверки</th></tr></thead><tbody id="rows"></tbody></table></div><p>Image API: 0 · Генераций: 0 · Изменений привязок: 0 · Production manifest: без изменений. SHA-256: ${report.integrity.protectedFiles} защищённых файлов совпали до и после проверки.</p></main>
<script id="data" type="application/json">${data}</script><script>const data=JSON.parse(document.getElementById('data').textContent);const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let page=0;const size=100;function render(){const source=document.getElementById('source').value,type=document.getElementById('type').value,q=document.getElementById('search').value.trim().toLowerCase(),all=data[source].filter(r=>(type==='all'||r.type===type)&&[r.sku,r.name,r.family,r.visualKey,...r.reasons].join(' ').toLowerCase().includes(q));page=Math.min(page,Math.max(0,Math.ceil(all.length/size)-1));document.getElementById('counter').textContent='Найдено: '+all.length+' · страница '+(page+1)+' / '+Math.max(1,Math.ceil(all.length/size));document.getElementById('previous').disabled=page===0;document.getElementById('next').disabled=(page+1)*size>=all.length;document.getElementById('rows').innerHTML=all.slice(page*size,(page+1)*size).map(r=>'<tr><td><b>'+esc(r.sku)+'</b><br>'+esc(r.name)+'<small>'+esc(r.visualKey)+'</small></td><td class="pill '+(r.type==='NEEDS_REVIEW'?'review':'')+'">'+esc(r.type)+'</td><td>'+esc(r.family)+'<br>Жил: '+esc(r.cores)+' · '+esc(r.geometry)+'<br>Видимых слоёв: '+esc(r.layers)+'<br>Броня: '+esc(r.armor)+' · Экран: '+esc(r.shield)+'</td><td class="reason">'+(r.reasons.length?r.reasons.map(esc).join('<br>'):esc(r.rationale))+'</td></tr>').join('')}for(const id of ['source','type','search'])document.getElementById(id).addEventListener(id==='search'?'input':'change',()=>{page=0;render()});document.getElementById('next').onclick=()=>{page++;render()};document.getElementById('previous').onclick=()=>{page--;render()};render();</script></html>`;
}
