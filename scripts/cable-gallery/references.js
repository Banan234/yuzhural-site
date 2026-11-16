const element = id => document.getElementById(id);
const token = document.querySelector('[name=write-token]').content;
const roles = ['primary','geometry'];
const empty = {primary:'',geometry:''};
const family = element('family'), group = element('group');
let selected, loading = 0, saving = false;

async function request(query, body) {
  const response = await fetch('/api/group-references'+query, body ? {
    method:'POST', headers:{'Content-Type':'application/json','X-Gallery-Token':token}, body:JSON.stringify(body),
  } : undefined);
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}

const notice = value => { element('status').textContent = value; };
const queryFor = id => '?'+new URLSearchParams({family:family.value,...(id && {id})});
const options = (select, entries, label) => select.replaceChildren(new Option(label,''),
  ...entries.map(entry=>new Option(entry.name,entry.id)));

function preview(role) {
  const input = element(role), link = element(role+'-preview');
  const image = link.firstElementChild;
  link.hidden = !input.value;
  if (link.hidden) return;
  link.href = '/png/'+input.value;
  image.src = link.href;
  image.alt = input.selectedOptions[0].text;
}

async function openGroup() {
  const sequence = ++loading;
  selected = null;
  element('editor').hidden = true;
  element('members').hidden = true;
  element('group-info').textContent = '';
  notice('');
  if (!group.value) return;
  notice('Проверяю совместимость и очередь…');
  try {
    const detail = await request(queryFor(group.value));
    if (sequence !== loading) return;
    selected = detail;
    for (const role of roles) {
      const input = element(role);
      const entries = detail.references[role].map(ref=>({id:ref.sha,
        name:ref.name+' · '+ref.sha.slice(0,8)+(ref.family===family.value?'':' · '+ref.family)}));
      const saved = detail.assignment[role];
      if (saved && !entries.some(entry=>entry.id===saved))
        entries.push({id:saved,name:'Сохранённый PNG сейчас недоступен · '+saved.slice(0,8)});
      options(input,entries,'Автоматический подбор');
      input.value = saved;
      preview(role);
    }
    const conflict = element('assignment-conflict');
    conflict.replaceChildren();
    conflict.hidden = !detail.assignment.conflicts?.length;
    if (!conflict.hidden) {
      const title = document.createElement('p');
      title.textContent = 'У объединённой группы несколько ручных назначений. Выберите вариант и сохраните его.';
      conflict.append(title);
      for (const [index,alternative] of detail.assignment.conflicts.entries()) {
        const choose=document.createElement('button');
        choose.type='button';
        choose.textContent='Вариант '+(index+1)+' · '+[alternative.primary,alternative.geometry].filter(Boolean).map(sha=>sha.slice(0,8)).join(' / ');
        choose.onclick=()=>{
          for (const role of roles) {
            const input=element(role), sha=alternative[role];
            if (sha && ![...input.options].some(option=>option.value===sha))
              input.add(new Option('PNG требует проверки совместимости · '+sha.slice(0,8),sha));
            input.value=sha;
            preview(role);
          }
        };
        conflict.append(choose);
      }
    }
    element('group-info').textContent = 'Товаров в группе: ' + detail.skus.length;
    element('sku-count').textContent = 'Товары группы · '+detail.skus.length;
    element('skus').replaceChildren(...detail.skus.map(({sku,name})=>{
      const li = document.createElement('li');
      li.textContent = sku+' · '+name;
      return li;
    }));
    element('members').hidden = false;
    element('editor').hidden = false;
    element('remove').disabled = !roles.some(role=>detail.assignment[role]);
    notice('');
  } catch (error) { if (sequence === loading) notice(error.message); }
}

async function openFamily() {
  const sequence = ++loading;
  options(group,[],'Загрузка групп…');
  group.disabled = true;
  selected = null;
  element('editor').hidden = element('members').hidden = true;
  element('group-info').textContent = '';
  notice('');
  try {
    const entries = await request(queryFor());
    if (sequence !== loading) return;
    options(group,entries,
      entries.length?'Выберите группу':'Нет подтверждённых групп');
    group.disabled = !entries.length;
  } catch (error) { if (sequence === loading) notice(error.message); }
}

async function save(remove) {
  if (saving || !selected) return;
  saving = true;
  const selectors = [family,group,...roles.map(element),element('save'),element('remove')];
  selectors.forEach(control=>{control.disabled=true;});
  try {
    const choices = remove ? empty : Object.fromEntries(roles.map(role=>[role,element(role).value]));
    await request('',{family:family.value,id:selected.id,choices,previous:selected.assignment});
    await openGroup();
    showTransferInfo();
    if (selected) notice(remove?'Назначения удалены.':'Сохранено для всей группы.');
  } catch (error) { notice(error.message); }
  finally {
    saving = false;
    selectors.forEach(control=>{control.disabled=false;});
    element('remove').disabled = !roles.some(role=>selected?.assignment[role]);
  }
}

family.onchange = openFamily;
group.onchange = openGroup;
for (const role of roles) element(role).onchange = () => preview(role);
element('save').onclick = () => save(false);
element('remove').onclick = () => save(true);
request('').then(entries=>{
  options(family,entries,'Выберите семейство');
  family.value = entries.some(entry=>entry.id==='kvvg') ? 'kvvg' : (entries[0]?.id ?? '');
  if (family.value) return openFamily();
}).catch(error=>notice(error.message));

const picker = element('picker');
const pickerFields = ['search','status','family','cores','shield','armor','geometry','compatible'];
let inventoryPromise, pickerRole, pickerItems = [], pickerLimit = 30;
const allImages = () => inventoryPromise ??= fetch('/api/inventory').then(response=>{
  if (!response.ok) throw Error('Не удалось открыть библиотеку PNG.');
  return response.json();
}).catch(error=>{ inventoryPromise=null; throw error; });
const displayedStatus = item => item.referenceAllowed && ['PENDING','ARCHIVED'].includes(item.status) ?
  'APPROVED' : (({PENDING:'NEEDS_REVIEW',WITH_NOTES:'APPROVED'})[item.status] ?? item.status);

function drawPicker(append=false) {
  if (!pickerRole || !selected) return;
  const get = key => element('picker-'+key).value;
  const search = get('search').trim().toLowerCase();
  const allowed = new Map(selected.references[pickerRole].map((ref,index)=>[ref.sha,index]));
  const usable = item => allowed.has(item.sha256);
  const matches = pickerItems.filter(item=>
    (!element('picker-compatible').checked || usable(item)) &&
    (!get('status') || displayedStatus(item)===get('status')) &&
    (!get('family') || item.familyId===get('family')) &&
    (!get('cores') || item.cores===Number(get('cores'))) &&
    (!get('geometry') || item.geometry===get('geometry')) &&
    ['shield','armor'].every(key=>!get(key) || (typeof item[key]==='boolean' && item[key]===(get(key)==='yes'))) &&
    (!search || [item.name,...item.skus,item.sha256].join(' ').toLowerCase().includes(search)));
  matches.sort((a,b)=>Number(usable(b))-Number(usable(a)) ||
    (pickerRole==='primary' ? Number(b.familyId===family.value)-Number(a.familyId===family.value) : 0) ||
    (allowed.get(a.sha256) ?? Infinity)-(allowed.get(b.sha256) ?? Infinity) || a.name.localeCompare(b.name,'ru'));
  const container = element('picker-grid');
  if (!append) container.replaceChildren();
  const labels = new Map([...family.options].map(option=>[option.value,option.text]));
  for (const item of matches.slice(container.children.length,pickerLimit)) {
    const card = document.createElement('article');
    card.className='card';
    const title=document.createElement('h3');
    title.textContent=item.name;
    const link=document.createElement('a');
    link.className='image reference-preview';
    link.href='/png/'+item.sha256;
    link.target='_blank';
    link.rel='noopener';
    link.setAttribute('aria-label','Увеличить '+item.name);
    const img=document.createElement('img');
    img.alt=item.name;
    img.loading='lazy';
    img.src=link.href;
    link.append(img);
    const metadata=document.createElement('p');
    metadata.className='metadata';
    metadata.textContent=[displayedStatus(item),labels.get(item.familyId) ?? item.familyId,
      item.cores && item.cores+' жил',item.shield && 'с экраном',item.armor && 'с бронёй',item.sha256.slice(0,8)].filter(Boolean).join(' · ');
    const choose=document.createElement('button');
    choose.type='button';
    choose.disabled=!usable(item);
    choose.textContent=choose.disabled ? 'Недоступен для этой роли' : 'Выбрать';
    choose.onclick=()=>{
      element(pickerRole).value=item.sha256;
      preview(pickerRole);
      picker.close();
    };
    card.append(title,link,metadata,choose);
    container.append(card);
  }
  element('picker-more').hidden=matches.length<=pickerLimit;
  element('picker-count').textContent=matches.length ? 'Найдено: '+matches.length : 'По этим фильтрам PNG не найдены.';
}

async function openPicker(role) {
  if (!selected || saving) return;
  const groupId = selected.id;
  try {
    const inventory = await allImages();
    if (selected?.id!==groupId || saving) return;
    pickerRole=role;
    pickerItems=inventory.items;
    pickerLimit=30;
    element('picker-title').textContent=role==='primary' ? 'Выбрать основной референс' : 'Выбрать геометрический референс';
    options(element('picker-family'),[...family.options].filter(option=>option.value).map(option=>({id:option.value,name:option.text})),'Все семейства');
    const counts = [...new Set(pickerItems.map(item=>item.cores).filter(Number.isFinite))].sort((a,b)=>a-b);
    options(element('picker-cores'),counts.map(value=>({id:value,name:String(value)})),'Любое число');
    for (const field of pickerFields.filter(value=>!['status','compatible'].includes(value)))
      element('picker-'+field).value='';
    element('picker-status').value='APPROVED';
    element('picker-compatible').checked=true;
    drawPicker();
    if (!picker.open) picker.showModal();
    element('picker-search').focus();
  } catch (error) { notice(error.message); }
}
for (const button of document.querySelectorAll('[data-gallery]'))
  button.onclick=()=>openPicker(button.dataset.gallery);
element('picker-close').onclick=()=>picker.close();
for (const field of pickerFields) element('picker-'+field).oninput=()=>{ pickerLimit=30; drawPicker(); };
element('picker-more').onclick=()=>{ pickerLimit+=30; drawPicker(true); };

const lastExportKey='cable-reference-last-export';
const exportPanel=element('export-dialog');
let exportCount=0;
let exportSequence=0;
const lastExport=()=>localStorage.getItem(lastExportKey);

function exportQuery(preview, summary=false) {
  const query=new URLSearchParams();
  if (preview) query.set('preview','1');
  if (!summary && element('export-scope').value==='family') query.set('family',family.value);
  if (summary || element('export-assigned').checked) query.set('assigned','1');
  if (!summary && element('export-changed').checked && lastExport()) query.set('since',lastExport());
  return '/api/group-reference-export?'+query;
}

async function transferRequest(url) {
  const response=await fetch(url);
  const result=await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}

async function showTransferInfo() {
  try {
    const {assigned}=await transferRequest(exportQuery(true,true));
    const date=lastExport();
    element('transfer-info').textContent='Групп с назначениями: '+assigned+' · '+(date ?
      'Последний экспорт: '+new Date(date).toLocaleString('ru') : 'Экспорта ещё не было');
  } catch (error) { element('transfer-info').textContent=error.message; }
}

async function countExport() {
  const sequence=++exportSequence;
  element('export-download').disabled=true;
  element('export-count').textContent='Считаю группы и SKU…';
  try {
    const {groups,skus}=await transferRequest(exportQuery(true));
    if (sequence!==exportSequence) return;
    exportCount=groups;
    element('export-count').textContent='Групп: '+groups+' · SKU: '+skus;
    element('export-download').disabled=groups===0;
  } catch (error) { if (sequence===exportSequence) element('export-count').textContent=error.message; }
}
element('export-open').onclick=()=>{
  element('export-scope').options[0].disabled=!family.value;
  if (!family.value) element('export-scope').value='all';
  element('export-changed').disabled=!lastExport();
  if (!lastExport()) element('export-changed').checked=false;
  exportPanel.showModal();
  countExport();
};
element('export-close').onclick=()=>exportPanel.close();
for (const id of ['export-scope','export-changed','export-assigned']) element(id).onchange=countExport;
element('export-download').onclick=async()=>{
  if (!exportCount) return;
  element('export-download').disabled=true;
  try {
    const result=await transferRequest(exportQuery(false));
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='cable-reference-assignments-'+result.exportedAt.replace(/[:.]/gu,'-')+'.json';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    localStorage.setItem(lastExportKey,result.exportedAt);
    exportPanel.close();
    showTransferInfo();
  } catch (error) { element('export-count').textContent=error.message; }
  finally { element('export-download').disabled=false; }
};

const codexInstruction = `Работай в общей копии yuzhural-site. Если оба чата используют один рабочий каталог, свежие назначения уже доступны в data/cable-approved-results/group-references.json. Штатный prepareCableStyleRequest загружает их автоматически по визуальной группе целевого SKU. Импорт для общей копии не нужен.

Если передан JSON из другой копии, проверь его: node scripts/importCableGroupReferences.js снимок.json --dry-run
После проверки примени: node scripts/importCableGroupReferences.js снимок.json --apply
При конфликте сравни current и incoming в отчёте. Только после отдельного решения о замене используй --apply --replace-conflicts для согласованного снимка.

Перед отправкой проверь referenceInputs и multipart image[]: защищённый эталон, основной PNG (FAMILY_PRIMARY), затем геометрический PNG (GEOMETRY_MATCH), если назначены оба. Если для двух ролей выбран один и тот же PNG, он загружается один раз, а обе роли указываются для этой позиции. Технический профиль SKU задаёт материалы, цвета и слои. Геометрический PNG задаёт расположение жил соответствующего количества. Платный вызов требует отдельной команды.`;
element('copy-codex').onclick=async()=>{
  try {
    await navigator.clipboard.writeText(codexInstruction);
    notice('Инструкция для Codex скопирована.');
  } catch {
    notice(codexInstruction);
  }
};
showTransferInfo();
