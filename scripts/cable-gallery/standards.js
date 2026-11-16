const byId = id => document.getElementById(id);
const token = document.querySelector('[name=write-token]').content;
const esc = value => String(value ?? '').replace(/[&<>"']/gu, char =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const status = { APPROVED:'Утверждён', WITH_NOTES:'Утверждён с замечаниями', PENDING:'На проверке',
  NEEDS_CORRECTION:'На исправлении', REJECTED:'Отклонён', ARCHIVED:'В архиве' };
const reasons = ['Количество жил','Расположение жил','Лишний или отсутствующий слой','Экран',
  'Броня','Цвета','Зачистка','Композиция','Другое'];
const dialog = byId('dialog');
const picks = new Set();
const skipped = new Set();
let data = { items:[], families:[] };
let family = 'kvvg', mode = 'detail', current = null, shown = [], offset = 0, compare = false;
let familyLimit = 40;
let busy = false, renderVersion = 0, placementRetry = null;
let lastApprovalAt = -Infinity;
const approvalUndoKey = 'cable-standards-last-approval';
const pageSize = 24;

async function api(url, body) {
  const response = await fetch(url, body === undefined ? undefined : {
    method:'POST', headers:{ 'Content-Type':'application/json', 'X-Gallery-Token':token }, body:JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
const get = sha => data.items.find(item => item.sha256 === sha);
const pending = item => item.status === 'PENDING';
const approved = item => Boolean(item.visualApproval) || ['APPROVED','WITH_NOTES'].includes(item.catalogStatus);
const detail = sha => api('/api/item/' + sha);
const message = value => { byId(dialog.open ? 'dialog-status' : 'status').textContent = value; };
const errorMessage = error => message(error.message);
function install(result) {
  data = result;
  if (family && !data.families.some(row => row.id === family)) family = data.families[0]?.id ?? '';
  const total = data.families.reduce((sum,row) => sum+row.total,0);
  const covered = data.families.reduce((sum,row) => sum+row.covered,0);
  byId('overall').textContent = covered.toLocaleString('ru') + ' из ' + total.toLocaleString('ru') + ' SKU с изображениями';
  byId('overall-progress').max = total || 1;
  byId('overall-progress').value = covered;
  const cores = byId('cores');
  const previous = cores.value;
  cores.replaceChildren(new Option('Все',''), ...[...new Set(data.items.map(item => item.cores).filter(Boolean))]
    .sort((a,b) => a-b).map(count => new Option(count,count)));
  cores.value = Array.from(cores.options).some(option => option.value === previous) ? previous : '';
  byId('undo').hidden = !localStorage.getItem('cable-standards-last');
  byId('undo-approval').hidden = !localStorage.getItem(approvalUndoKey);
}
function image(item, label, big = false) {
  return '<figure><figcaption>'+esc(label)+'</figcaption><button type="button" class="image '+byId('background').value+
    (big?' large':'')+'" data-zoom="'+esc(item.sha256)+'" aria-label="Увеличить '+esc(label)+'"><img src="/png/'+
    esc(item.sha256)+'" alt="'+esc(item.name || label)+'" '+(big?'':'loading="lazy"')+'></button></figure>';
}
function familyList() {
  const query = byId('family-search').value.trim().toLowerCase();
  const matches = data.families.filter(row => (row.name+' '+row.id).toLowerCase().includes(query));
  byId('families').innerHTML = (mode === 'library' ? '<button data-family="" aria-pressed="'+(!family)+'">Все семейства</button>' : '') +
    matches.slice(0,familyLimit).map(row => '<button data-family="'+esc(row.id)+'" aria-pressed="'+(family===row.id)+'"><strong>'+
      esc(row.name)+'</strong><small>'+row.covered+' / '+row.total+' SKU · без изображения '+row.missing+
      '</small><small>'+row.approved+' эталонов · '+row.pending+' на проверке</small><small>После приёмки до '+row.expected+
      '</small><progress aria-label="Охват '+esc(row.name)+'" max="'+row.total+'" value="'+row.covered+'"></progress></button>').join('') +
    (matches.length > familyLimit ? '<button id="more-families">Показать ещё семейства</button>' :
      matches.length ? '' : '<p>Семейства не найдены.</p>');
  const more = byId('more-families');
  if (more) more.onclick = () => { familyLimit += 40; familyList(); };
}
function matchesFilters(item) {
  const query = byId('search').value.trim().toLowerCase(), cores = byId('cores').value;
  const construction = byId('construction').value;
  return (!family || item.familyId === family) && (!cores || item.cores === Number(cores)) &&
    (!construction || ({shield:item.shield,armor:item.armor,flat:item.geometry==='flat',plain:!item.shield&&!item.armor})[construction]) &&
    (!query || [item.name,item.sha256,...item.skus].join(' ').toLowerCase().includes(query));
}
function render() {
  const version = ++renderVersion;
  familyList();
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed',button.dataset.mode===mode);
  shown = data.items.filter(item => !item.protected && matchesFilters(item) &&
    (mode === 'library' ? approved(item) : (item.sha256 === placementRetry || !approved(item)) &&
      (item.origins.includes('generated') || item.sha256 === current) &&
      (pending(item) || item.status === 'NEEDS_CORRECTION' || item.sha256 === current) && !skipped.has(item.sha256)));
  shown.sort((a,b) => Number(pending(b))-Number(pending(a)) || b.coverage-a.coverage || b.modified-a.modified || a.name.localeCompare(b.name,'ru'));
  if (!shown.some(item => item.sha256 === current)) current = shown[0]?.sha256 ?? null;
  if (!shown.length) {
    byId('view').innerHTML = '<div class="panel"><h2>Нет изображений для просмотра</h2><p>Выберите другое семейство или измените фильтры.</p></div>';
    return;
  }
  if (mode === 'detail') {
    const item = get(current);
    byId('view').innerHTML = '<div class="panel">Загружаю изображение…</div>';
    detail(item.sha256).then(value => { if (renderVersion === version) showDetail(value); }).catch(errorMessage);
    return;
  }
  const page = shown.slice(offset,offset+pageSize);
  const groups = new Map();
  for (const item of page) {
    const heading = mode === 'library' ? [
      item.cores ? 'Жил: '+item.cores : 'Количество жил не указано',
      item.shield ? 'с экраном' : '', item.armor ? 'с бронёй' : '', item.geometry === 'flat' ? 'плоский' : '',
    ].filter(Boolean).join(' · ') : 'Черновики';
    if (!groups.has(heading)) groups.set(heading,[]);
    groups.get(heading).push(item);
  }
  byId('view').innerHTML = '<div class="toolbar"><strong>'+shown.length+' изображений</strong>'+
    (mode==='grid' ? '<button class="primary" data-action="batch" '+(picks.size?'':'disabled')+'>Утвердить выбранные · '+picks.size+'</button>' : '')+
    '</div>'+[...groups].map(([heading,items]) => '<h3>'+esc(heading)+'</h3><div class="cards">'+items.map(item =>
      '<article class="card">'+image(item,item.name)+'<p>'+esc(status[item.status] ?? item.status)+' · '+item.bindings+
      ' привязано</p><p class="coverage">Ещё '+item.coverage+' SKU</p><div class="toolbar"><button data-open="'+item.sha256+
      '">Открыть</button>'+(mode==='grid'?'<label class="pick"><input type="checkbox" data-pick="'+item.sha256+'" '+
      (picks.has(item.sha256)?'checked':'')+'> Выбрать</label>':'')+'</div></article>').join('')+'</div>').join('')+
    '<div class="toolbar"><button data-action="previousPage" '+(offset?'':'disabled')+'>Предыдущая страница</button>'+
    '<span>'+(offset+1)+'–'+Math.min(offset+pageSize,shown.length)+'</span><button data-action="nextPage" '+
    (offset+pageSize<shown.length?'':'disabled')+'>Следующая страница</button></div>';
}
function refs(item) {
  const inputs = item.referenceSources.find(source => Array.isArray(source) && source.some(row => row.role === 'FAMILY_PRIMARY' || row.role === 'GEOMETRY_MATCH')) ?? [];
  return [['FAMILY_PRIMARY','Основной референс'],['GEOMETRY_MATCH','Геометрический референс']].map(([role,title]) => {
    const ref = inputs.find(entry => entry.role === role);
    if (!ref) return {title};
    return {title, item:get(ref.sha256) ?? {sha256:ref.sha256,name:ref.sha256.slice(0,8)}};
  });
}
function showDetail(item, target = byId('view')) {
  const references = refs(item);
  const profile = item.profile;
  const anatomy = profile ? [profile.cores + ' жил', profile.geometry === 'round' ? 'круглый' :
    profile.geometry === 'flat' ? 'плоский' : null, profile.conductorMaterial === 'copper' ? 'медь' :
    profile.conductorMaterial === 'aluminium' ? 'алюминий' : null, profile.shield ? 'с экраном' : null,
    profile.armor ? 'с бронёй' : null].filter(Boolean).join(' · ') : '';
  const main = '<article class="panel"><div class="toolbar"><h2>'+esc(item.name)+'</h2><span class="coverage">Ещё '+item.coverage+
    ' SKU</span></div><p class="metadata">'+esc(data.families.find(row => row.id === item.familyId)?.name ?? item.family)+
    ' · '+esc(status[item.status] ?? item.status)+' · уже привязано '+item.bindings+'</p>';
  const nav = target === byId('view') ? '<button data-action="previous">Предыдущее</button><button data-action="next">Следующее изображение</button>' : '';
  const versions = item.visualKey ? data.items.filter(row => row.sha256 !== item.sha256 &&
    row.familyId === item.familyId && row.visualKey === item.visualKey).sort((a,b)=>b.modified-a.modified) : [];
  const candidates = item.placement.find(row => row.visualKey === item.visualKey)?.skus ?? [];
  const approvalLimit = item.visualApproval ? '<p class="metadata">Визуально утверждено · '+esc(item.visualApproval.reason)+'</p>' : '';
  target.innerHTML = main+(anatomy ? '<p class="metadata">'+esc(anatomy)+'</p>' : '')+'<div class="media '+(compare?'compare':'')+'">'+image(item,approved(item)?'Утверждённое изображение':'Изображение на проверке',true)+
    (compare ? references.filter(ref=>ref.item).map(ref=>image(ref.item,ref.title,true)).join('') : '')+
    '</div><p class="metadata">'+references.map(ref=>esc(ref.title)+' — '+esc(ref.item?.name ?? 'не использовался')).join(' · ')+
    '</p><div class="toolbar"><button data-action="compare" aria-pressed="'+compare+'">Сравнение рядом</button>'+nav+'</div>'+
    '<div class="toolbar">'+(approved(item) && (!item.coverage || item.visualApproval) ? '' :
      '<button class="primary" data-action="approve">'+(approved(item)?'Привязать совместимые SKU':'Утвердить')+'</button>')+
    '<button data-action="redo">Переделать</button><button data-action="reject">Отклонить</button>'+
    (target===byId('view')?'<button data-action="skip">Пропустить</button>':'')+
    (approved(item) && !item.visualApproval?'<button data-action="permission">Роль референса</button>':'')+
    (item.canRestore?'<button data-action="restore">Восстановить привязки</button>':'')+
    '</div><details data-correction><summary>Параметры исправления · необязательно</summary>'+
    '<label class="field">Причина<select data-reason><option value="">Без указания причины</option>'+
    reasons.map(reason=>'<option>'+esc(reason)+'</option>').join('')+'</select></label>'+
    '<label class="field">Замечание<textarea data-note maxlength="2000" rows="2"></textarea></label>'+
    '<label class="field">Основной референс<select data-primary><option value="">Автоматически</option></select></label>'+
    '<label class="field">Геометрический референс<select data-geometry><option value="">Автоматически</option></select></label>'+
    '</details><details><summary>SKU, которые получат изображение · '+candidates.length+'</summary>'+
    '<p>'+esc(candidates.join(', '))+'</p></details>'+approvalLimit+
    '<details><summary>SKU, использующие изображение · '+item.currentBindings.length+'</summary>'+
    '<ul>'+item.currentBindings.map(sku=>'<li>'+esc(sku)+' · '+esc(item.catalog.find(row=>row.sku===sku)?.name)+'</li>').join('')+
    '</ul></details><details><summary>Другие версии · '+versions.length+'</summary><ul>'+
    versions.map(row=>'<li><button data-open="'+row.sha256+'">'+esc(row.name)+' · '+esc(status[row.status]??row.status)+' · '+row.sha256.slice(0,8)+'</button></li>').join('')+
    '</ul></details><details><summary>История решений</summary><ul>'+
    [...item.history,...item.journal].filter(row=>row.note || row.status || row.after).map(row=>'<li>'+esc(
      [row.reviewedAt??row.at,row.status??status[row.after?.catalog]??row.after?.catalog,row.note,row.after?.correction?.reason].filter(Boolean).join(' · '))+
      '</li>').join('')+'</ul></details></article>';
  target.dataset.sha = item.sha256;
  const correction = target.querySelector('[data-correction]');
  correction.ontoggle = async () => {
    if (!correction.open) return;
    correction.ontoggle = null;
    try {
      const choices = await api('/api/reference-choices/'+item.sha256);
      for (const role of ['primary','geometry']) {
        const select = correction.querySelector('[data-'+role+']');
        for (const sha of choices[role]) {
          const ref = get(sha);
          if (ref && sha!==item.sha256) select.add(new Option(ref.name+' · '+sha.slice(0,8),sha));
        }
      }
    } catch (error) { errorMessage(error); }
  };
}
function open(title, html) {
  byId('dialog-title').textContent = title;
  byId('dialog-status').textContent = '';
  byId('dialog-body').innerHTML = html;
  delete byId('dialog-body').dataset.sha;
  if (!dialog.open) dialog.showModal();
}
function move(step, skip = false) {
  const index = shown.findIndex(item => item.sha256 === current);
  if (skip && current) skipped.add(current);
  current = shown[index+step]?.sha256 ?? (skip ? shown.find(item=>!skipped.has(item.sha256))?.sha256 : current);
  render();
}
function rowFor(item) {
  return {sha256:item.sha256, revision:item.reviewRevision, visualKey:item.visualKey};
}
const reviewerName = () => localStorage.getItem('cable-standards-reviewer') ?? 'Владелец каталога';
function remember(result, items, body, placements = null) {
  localStorage.setItem('cable-standards-reviewer',body.reviewer);
  if (result.changed || placements?.length) {
    const key = placements ? approvalUndoKey : 'cable-standards-last';
    const previous = JSON.parse(localStorage.getItem(key) ?? '[]');
    const rows = items.map(item => {
      const originalHead = item.journal.at(-1)?.hash ?? null;
      const retry = previous.find(row=>row.pendingPlacement && row.sha256===item.sha256 && row.head===originalHead);
      return { ...rowFor(item), originalHead:retry ? retry.originalHead : originalHead,
        head:result.items.find(row => row.sha256===item.sha256)?.journalHead ?? null,
        placementHash:placements?.find(row=>row.sha256===item.sha256)?.hash,
        pendingPlacement:Boolean(result.placementError) };
    });
    localStorage.setItem(key,JSON.stringify(rows));
  }
}
async function submit(url, body, onSuccess) {
  if (busy) return;
  busy = true;
  for (const button of dialog.querySelectorAll('button')) button.disabled = true;
  message('Сохраняю…');
  try { await onSuccess(await api(url,body)); }
  catch (error) { errorMessage(error); }
  finally {
    busy = false;
    for (const button of dialog.querySelectorAll('button')) button.disabled = false;
  }
}
async function approve(shas, section, button) {
  if (busy || !shas.length || performance.now()-lastApprovalAt<350) return;
  busy = true;
  lastApprovalAt = performance.now();
  button.disabled = true;
  const from = section?.dataset.sha ?? current;
  message('Сохраняю…');
  try {
    const items = await Promise.all(shas.map(detail));
    const body = { reviewer:reviewerName(), resolve:true, rows:items.map(rowFor) };
    const result = await api('/api/approve-and-place',body);
    remember(result,items,body,result.placements ?? []);
    install(result);
    if (result.placementError) {
      placementRetry = shas[0];
      current = from;
      if (dialog.open && section?.dataset.sha)
        showDetail(await detail(section.dataset.sha), section);
      else render();
      message('Статус сохранён, привязка не завершена: '+result.placementError);
      return;
    }
    placementRetry = null;
    const approvedShas = new Set(shas);
    const index = shown.findIndex(item=>item.sha256===from);
    current = shown.slice(index+1).find(item=>!approvedShas.has(item.sha256))?.sha256 ??
      shown.find(item=>!approvedShas.has(item.sha256))?.sha256 ?? null;
    if (dialog.open) dialog.close();
    picks.clear();
    render();
    message('Утверждено · привязано к '+result.placed+' SKU'+
      (result.visualOnly?.length ? '\nБез автоматической привязки: '+[...new Set(result.visualOnly)].join(' ') : ''));
  } catch (error) { errorMessage(error); }
  finally {
    busy = false;
    if (button.isConnected) button.disabled = false;
  }
}
function revision(item, action, section) {
  const correction = action==='redo';
  const note = section.querySelector('[data-note]').value;
  const body = {reviewer:reviewerName(),note,resolve:true,
    catalog:correction?'NEEDS_CORRECTION':'REJECTED',rows:[rowFor(item)]};
  if (correction) body.correction = {
    reason:section.querySelector('[data-reason]').value || 'Требуется исправление',
    references:Object.fromEntries(['primary','geometry'].flatMap(role=>{
      const sha = section.querySelector('[data-'+role+']').value;
      return sha ? [[role,sha]] : [];
    })),
  };
  return submit('/api/reviews',body,result=>{
    remember(result,[item],body);
    install(result);
    if (dialog.open) dialog.close();
    if (mode==='detail') move(1,true); else render();
    message(correction?'Отправлено на исправление.':'Отклонено.');
  });
}
function permission(item) {
  open('Роль референса','<form id="permission-form">'+
    '<label class="field">Использование<select name="role"><option value="PRIMARY">Основной референс семейства</option>'+
    '<option value="ADDITIONAL">Геометрический референс при совместимой компоновке</option><option value="DENIED">Запретить референс</option>'+
    '</select></label><button class="primary">Сохранить</button></form>');
  const form = byId('permission-form');
  form.elements.role.value = ['PRIMARY','ADDITIONAL','DENIED'].includes(item.referenceStatus) ? item.referenceStatus : 'ADDITIONAL';
  form.onsubmit = event => {
    event.preventDefault();
    const body = {reviewer:reviewerName(),reference:form.elements.role.value,preferReferenceRole:true,rows:[rowFor(item)]};
    submit('/api/reviews',body,result=>{
      remember(result,[item],body);
      install(result); dialog.close(); render(); message('Роль сохранена.');
    });
  };
}
async function undoRows(items, key) {
  if (busy) return;
  busy = true;
  const undoDecision = Boolean(key);
  try {
    if (undoDecision && items.some(row=>get(row.sha256)?.journalHead !== row.head))
      throw Error('После этого действия появились новые решения. Откройте соответствующую карточку.');
    const placed = items.filter(row=>row.placementHash || row.placed || !undoDecision);
    let restored = 0;
    if (placed.length) {
      const response = await api('/api/restore-placement',{rows:placed});
      restored = response.restored;
      install(response);
      if (undoDecision) {
        for (const row of items) { delete row.placementHash; delete row.placed; }
        localStorage.setItem(key,JSON.stringify(items));
      }
    }
    const decisions = items.filter(row=>row.originalHead !== row.head);
    if (undoDecision && decisions.length) install(await api('/api/reviews',{
      undo:true,reviewer:reviewerName(),rows:decisions.map(row=>({ ...rowFor(get(row.sha256)), expectedHead:row.head })),
    }));
    if (undoDecision) localStorage.removeItem(key);
    byId('undo').hidden = !localStorage.getItem('cable-standards-last');
    byId('undo-approval').hidden = !localStorage.getItem(approvalUndoKey);
    if (key === approvalUndoKey) current = items[0]?.sha256 ?? current;
    if (dialog.open) dialog.close();
    render();
    message(key === approvalUndoKey ? 'Утверждение отменено · снято '+restored+' новых привязок' :
      'Готово. Восстановлено привязок: '+restored+'.');
  } catch (error) { errorMessage(error); }
  finally { busy=false; }
}
function restore(items, alsoUndo = false) {
  open(alsoUndo?'Отмена последнего действия':'Восстановление привязок','<p>'+
    esc(items.map(row=>get(row.sha256)?.name ?? row.sha256).join(', '))+
    '</p><button class="primary" id="confirm-restore">Подтвердить</button>');
  byId('confirm-restore').onclick = () => undoRows(items,alsoUndo ? 'cable-standards-last' : null);
}
async function clickAction(action, item, section) {
  if (action==='previous' || action==='next' || action==='skip') return move(action==='previous'?-1:1,action==='skip');
  if (action==='nextPage' || action==='previousPage') { offset+=pageSize*(action==='nextPage'?1:-1); return render(); }
  if (!item) return;
  if (action==='compare') { compare=!compare; return showDetail(item,dialog.open?byId('dialog-body'):byId('view')); }
  if (action==='redo' || action==='reject') return revision(item,action,section);
  if (action==='permission') return permission(item);
  if (action==='restore') return restore([rowFor(item)]);
}
document.addEventListener('click',async event=>{
  if (busy) return;
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.hasAttribute('data-family')) { family=button.dataset.family; offset=0; picks.clear(); skipped.clear(); render(); }
    if (button.dataset.mode) { mode=button.dataset.mode; offset=0; picks.clear(); skipped.clear(); render(); }
    if (button.dataset.open) {
      const item = await detail(button.dataset.open);
      open(item.name,''); showDetail(item,byId('dialog-body'));
    }
    if (button.dataset.zoom) {
      const src = '/png/'+button.dataset.zoom;
      window.open(src,'_blank','noopener');
    }
    if (button.dataset.action) {
      const section = button.closest('#dialog-body,#view');
      const action = button.dataset.action;
      if (action==='approve' || action==='batch') {
        if (event.detail > 1) return;
        return await approve(action==='batch' ? [...picks] : [section.dataset.sha],section,button);
      }
      const item = ['compare','redo','reject','permission','restore'].includes(action) ?
        await detail(section?.dataset.sha ?? current) : null;
      await clickAction(action,item,section);
    }
  } catch (error) { errorMessage(error); }
});
document.addEventListener('change',event=>{
  const input = event.target;
  if (!input.dataset.pick) return;
  if (input.checked) picks.add(input.dataset.pick); else picks.delete(input.dataset.pick);
  const button = document.querySelector('[data-action=batch]');
  button.disabled = picks.size===0;
  button.textContent = 'Утвердить выбранные · '+picks.size;

});
document.addEventListener('keydown',event=>{
  if (dialog.open || busy || mode!=='detail' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest('input, select, textarea, [contenteditable]')) return;
  const key = event.code;
  const action = {ArrowLeft:'previous',ArrowRight:'next',KeyA:'approve',KeyR:'redo',KeyS:'skip'}[key];
  if (!action) return;
  const button = byId('view').querySelector('[data-action="'+action+'"]');
  if (button) { event.preventDefault(); button.click(); }
});
for (const id of ['search','cores','construction','background']) byId(id).addEventListener('input',()=>{
  if (busy) return;
  if (id!=='background') { offset=0; picks.clear(); }
  render();
});
byId('family-search').addEventListener('input',()=>{ familyLimit=40; familyList(); });
byId('close').onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel',event=>{ if (busy) event.preventDefault(); });
byId('undo').onclick = () => {
  const last = JSON.parse(localStorage.getItem('cable-standards-last')??'[]');
  if (last.length) restore(last,true);
};
byId('undo-approval').onclick = () => {
  const last = JSON.parse(localStorage.getItem(approvalUndoKey)??'[]');
  if (last.length) undoRows(last,approvalUndoKey);
};
byId('refresh').onclick = async () => {
  if (busy) return;
  busy=true;
  try { install(await api('/api/rescan',{})); render(); message('Инвентарь обновлён.'); }
  catch (error) { errorMessage(error); }
  finally { busy=false; }
};
api('/api/inventory').then(result=>{
  install(result);
  const requested = get(new URLSearchParams(location.search).get('sha'));
  if (requested && !requested.protected) {
    current = requested.sha256;
    family = data.families.some(row=>row.id === requested.familyId) ? requested.familyId : '';
    mode = approved(requested) ? 'library' : 'detail';
    if (mode === 'library') byId('search').value = requested.sha256;
  }
  render();
}).catch(errorMessage);
