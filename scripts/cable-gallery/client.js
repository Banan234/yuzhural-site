const byId = id => document.getElementById(id);
const token = document.querySelector('[name=write-token]').content;
const escape = value => String(value ?? '').replace(/[&<>"']/gu, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pretty = value => escape(JSON.stringify(value, null, 2));
const catalog = {
  NEEDS_CORRECTION: 'Требует исправления', REJECTED: 'Отклонить', UNDECIDED: 'Пока не решил',
};
const reference = {
  PRIMARY: 'Утвердить как основной референс', ADDITIONAL: 'Разрешить как дополнительный референс',
  DENIED: 'Запретить использовать как референс', UNDECIDED: 'Пока не решил',
};
const origins = {
  generated: 'Генерация', style: 'Защищённый эталон', 'catalog-photo': 'Фото из каталога',
  manual: 'Ручное назначение', 'review-artifact': 'Материал проверки', unknown: 'Неизвестно',
};
const statsLabels = {
  uniquePng: 'Уникальных PNG', approved: 'Допуск в каталог', primary: 'Основные референсы',
  additional: 'Дополнительные референсы', catalogOnly: 'Только для каталога',
  correction: 'На исправление', rejected: 'Отклонены', pending: 'Ожидают решения',
  archived: 'Архив без привязок', activeSku: 'SKU с изображениями',
  conflicts: 'Конфликты', unknown: 'Без подтверждённого профиля', duplicates: 'PNG с копиями',
};
const statusText = {
  APPROVED: 'Утверждён', WITH_NOTES: 'Допустим с замечаниями', NEEDS_CORRECTION: 'На исправлении',
  REJECTED: 'Отклонён', UNDECIDED: 'Ожидает решения', PENDING: 'Ожидает решения',
  ARCHIVED: 'Архив', PROTECTED: 'Защищённый эталон',
};
const referenceText = {
  PRIMARY: 'Основной референс', ADDITIONAL: 'Дополнительный референс',
  DENIED: 'Референс запрещён', UNDECIDED: 'Решение по референсу открыто', PROTECTED: 'Стилевой эталон',
};
const pageSize = 18;
const dialog = byId('detail');
const content = byId('contents');
const selection = new Set();
let state = { items: [], stats: {} };
let found = [];
let page = 0;
let navigation = [];
let detailRequest = 0;
let busy = false;
let focusTarget;
let fileToImport;
let generating = false;
let groupRequest = 0;

const options = (labels, blank) => '<option value="">' + blank + '</option>' +
  Object.entries(labels).map(([value, text]) => '<option value="' + escape(value) + '">' + escape(text) + '</option>').join('');
byId('status').innerHTML = options({ ...statusText }, 'Все');
byId('reference').innerHTML = options(referenceText, 'Все');
byId('origin').innerHTML = options(origins, 'Все');

async function request(url, body) {
  const response = await fetch(url, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}

function load(data) {
  state = data;
  const workLabels = { total: 'SKU в каталоге', approved: 'С утверждённым PNG',
    photo: 'С фото', missing: 'Без изображения', pending: 'PNG на проверке' };
  const totals = data.archive ? { ...data.stats, activeSku: data.stats.coveredSku + data.stats.photoSku } : data.work;
  byId('stats').innerHTML = Object.entries(data.archive ? statsLabels : workLabels).map(([key, label]) =>
    '<li><strong>' + Number(totals[key]).toLocaleString('ru') + '</strong>' + escape(label) + '</li>').join('');
  const groupPicker = byId('work-group');
  const selectedGroup = groupPicker.value;
  byId('work').hidden = Boolean(data.archive);
  groupPicker.replaceChildren(new Option('Выберите группу', ''), ...data.work.groups.map(group =>
    new Option(group.name + ' · ' + group.sku + ' · ' + group.count + ' SKU', group.sku)));
  groupPicker.value = data.work.groups.some(group => group.sku === selectedGroup) ? selectedGroup : '';
  groupPicker.disabled = !data.work.groups.length || generating;
  byId('generate').disabled = true;
  if (!generating) void previewGroup();
  const families = [...new Set(data.items.flatMap(item => item.families))].sort((a, b) => a.localeCompare(b, 'ru'));
  const family = byId('family');
  const previous = family.value;
  family.replaceChildren(new Option('Все', ''), ...families.map(name => new Option(name, name)));
  family.value = families.includes(previous) ? previous : '';
  const ids = new Set(data.items.map(item => item.sha256));
  for (const sha of selection) if (!ids.has(sha)) selection.delete(sha);
  render();
}

const generationStatus = {
  PREPARED_NOT_SENT: 'Можно создать PNG.',
  NEEDS_REVIEW: 'PNG готов к ручной проверке.',
  APPROVED_DRAFT_NOT_PUBLISHED: 'Есть утверждённый совместимый PNG.',
  EXISTING_STANDARD_APPROVED: 'У SKU уже есть утверждённое изображение.',
  PENDING_REVIEW: 'Предыдущий PNG ожидает ручной проверки.',
  REQUEST_OUTCOME_UNKNOWN: 'Исход предыдущего запроса неизвестен.',
  HISTORICAL_PROFILE_REVIEW_REQUIRED: 'Нужно сверить предыдущий запрос или решение.',
  HELD_DEFECT: 'Предыдущий PNG отправлен на исправление.',
  REJECTED: 'Предыдущий PNG отклонён.',
  FAILED: 'У предыдущего запроса зафиксирована ошибка.',
};

async function previewGroup() {
  const sku = byId('work-group').value;
  const requestId = ++groupRequest;
  const message = byId('generation-message');
  const products = byId('work-products');
  const images = byId('work-images');
  byId('generate').disabled = true;
  products.hidden = true;
  images.replaceChildren();
  message.textContent = sku ? 'Проверяю группу…' : '';
  if (!sku) return;
  try {
    const group = await request('/api/work-group?sku=' + encodeURIComponent(sku));
    if (requestId !== groupRequest) return;
    products.querySelector('ul').innerHTML = group.products.map(row =>
      '<li>' + escape(row.sku) + ' · ' + escape(row.name) + '</li>').join('');
    products.hidden = false;
    message.textContent = generationStatus[group.status] ?? group.reason ?? group.status ?? '';
    byId('generate').disabled = group.status !== 'PREPARED_NOT_SENT';
    images.innerHTML = group.choices.map((row,index) => `
      <div><button data-open="${index}">${index === 0 ? 'Рекомендуемый PNG' : 'Другой PNG'} · ${escape(row.name ?? row.sha256.slice(0, 8))}</button>
        <button data-place="${index}" ${row.count ? '' : 'disabled'}>Назначить · ${row.count} SKU</button></div>`).join('');
    images.onclick = async event => {
      const { open, place } = event.target.dataset;
      if (open !== undefined) {
        navigation = group.choices.map(row => row.sha256);
        await openItem(group.choices[Number(open)].sha256);
      }
      if (place === undefined) return;
      const { sha256, visualKey } = group.choices[Number(place)];
      try {
        const preview = await request('/api/placement', { rows:[{ sha256, visualKey }] });
        if (!window.confirm('Назначить выбранный PNG для ' + preview.rows[0].skus.length + ' SKU?')) return;
        const data = await request('/api/place-approved', preview);
        load(data);
        byId('message').textContent = 'Назначено SKU · ' + data.placed;
      } catch (error) {
        message.textContent = error.message;
      }
    };
  } catch (error) {
    if (requestId === groupRequest) message.textContent = error.message;
  }
}
byId('work-group').onchange = previewGroup;
async function generateForSku(sku, retryFrom) {
  const picker = byId('work-group');
  if (generating || !sku || !window.confirm('Проверить готовые PNG для ' + sku +
    ' и отправить один платный запрос, если подходящего изображения нет?')) return;
  generating = true;
  picker.disabled = true;
  byId('generate').disabled = true;
  const message = byId('generation-message');
  message.textContent = 'Проверяю утверждения и запросы…';
  try {
    const result = await request('/api/generate', { sku, retryFrom });
    load(result);
    message.textContent = generationStatus[result.status] ?? result.reason ?? result.status;
    if (result.sha256 && result.items.some(item => item.sha256 === result.sha256))
      await openItem(result.sha256);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    generating = false;
    picker.disabled = !state.work.groups.length;
    byId('generate').disabled = true;
    if (picker.value && !retryFrom) void previewGroup();
  }
}
byId('generate').onclick = () => generateForSku(byId('work-group').value);

function renderSelection() {
  byId('selected').textContent = 'Выбрано ' + selection.size;
  byId('bulk').disabled = !selection.size;
  byId('clear').disabled = !selection.size;
}

function render() {
  const query = byId('q').value.trim().toLowerCase();
  const status = byId('status').value;
  const ref = byId('reference').value;
  const family = byId('family').value;
  const origin = byId('origin').value;
  const bindings = byId('bindings').value;
  const view = byId('view').value;
  found = state.items.filter(item => (!family || item.families.includes(family)) &&
    (!status || [item.status, item.catalogStatus].includes(status)) &&
    (!ref || item.referenceStatus === ref) && (!origin || item.origins.includes(origin)) &&
    (!bindings || Boolean(item.bindings) === (bindings === 'yes')) &&
    (!view || ({ unknown: item.unknown, conflict: item.conflict, duplicates: item.copies > 1,
      archive: item.status === 'ARCHIVED' && !item.bindings })[view]) &&
    [item.name, item.sha256, ...item.families, ...item.visualKeys, ...item.skus].join(' ').toLowerCase().includes(query));
  const last = Math.max(0, Math.ceil(found.length / pageSize) - 1);
  page = Math.min(page, last);
  byId('grid').innerHTML = found.slice(page * pageSize, (page + 1) * pageSize).map(item => `
    <article>
      <button type="button" class="thumb" data-sha="${item.sha256}" aria-label="Открыть ${escape(item.name)}">
        <div class="picture ${escape(byId('background').value)}"><img loading="lazy" src="/png/${item.sha256}" alt=""></div>
      </button>
      <div class="meta"><h3>${escape(item.name)}</h3>
        <p>${escape(item.family)} · ${escape(statusText[item.status])}<br><small>${escape(referenceText[item.referenceStatus])}${item.conflict ? ' · Конфликт' : ''}</small></p>
        <small>${escape(item.skus.slice(0, 4).join(', '))}${item.skus.length > 4 ? ' …' : ''}<br>
          ${item.bindings} привязок · ${item.copies} файлов · ${item.origins.map(origin => escape(origins[origin])).join(', ')}</small>
      </div>
      <div class="row"><button data-sha="${item.sha256}">Открыть</button>
      ${item.protected ? '' : `<label><input type="checkbox" data-select="${item.sha256}" ${selection.has(item.sha256) ? 'checked' : ''}> Выбрать <span class="muted">${item.sha256.slice(0, 8)}</span></label>`}</div>
    </article>`).join('') || '<p>Изображений по этим фильтрам нет.</p>';
  byId('page').textContent = (page + 1) + ' / ' + (last + 1) + ' · найдено ' + found.length;
  byId('prev').disabled = page === 0;
  byId('next').disabled = page === last;
  byId('select-page').disabled = !found.length;
  renderSelection();
}

function openDialog(title) {
  byId('title').textContent = title;
  byId('dialog-message').textContent = '';
  content.textContent = '';
  if (!dialog.open) {
    focusTarget = document.activeElement;
    dialog.showModal();
  }
  byId('title').focus();
}

function details(title, html) {
  return '<details><summary>' + escape(title) + '</summary>' + html + '</details>';
}

function history(item) {
  const events = item.journal.slice().reverse().map(event => {
    const changed = [
      [(event.effectiveBefore ?? event.before).catalog, (event.effectiveAfter ?? event.after).catalog, statusText],
      [(event.effectiveBefore ?? event.before).reference, (event.effectiveAfter ?? event.after).reference, referenceText],
    ].filter(([before, after]) => before !== after).map(([before, after, labels]) =>
      (labels[before] ?? 'Прежнее решение') + ' → ' + (labels[after] ?? 'Прежнее решение'));
    return '<li><strong>' + escape(new Date(event.at).toLocaleString('ru', { timeZone: 'Asia/Yekaterinburg' })) + '</strong> · ' + escape(event.reviewer) +
      (event.undoOf ? ' · Отмена' : '') + '<br>' + escape(changed.join(' · ')) +
      (event.note ? '<br>' + escape(event.note) : '') + '</li>';
  });
  const old = item.history.filter(event => event.note || event.status || typeof event.enabled === 'boolean');
  return details('История решений · ' + (events.length + old.length),
    (events.length ? '<ol class="history">' + events.join('') + '</ol>' : '') +
    (old.length ? '<h3>Прежние записи</h3><ul class="history">' + old.map(event => '<li>' +
      escape([event.reviewedAt ?? event.at, event.status ?? (event.enabled ? 'Референс разрешён' : 'Референс запрещён'),
        event.reviewer, event.note, event.source].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul>' : ''));
}

function renderEditor(items, container, bulk) {
  container.innerHTML = `
    <label>Проверяющий <input id="reviewer" maxlength="120" autocomplete="name" value="${escape(sessionStorage.getItem('cable-reviewer'))}"></label>
    <label>Решение по каталогу <select id="catalog-decision">${options(catalog, 'Оставить текущее')}</select></label>
    <label>Решение по референсу <select id="reference-decision">${options(reference, 'Оставить текущее')}</select></label>
    <label>Комментарий <textarea id="note" maxlength="2000" rows="3"></textarea></label>
    <label><input type="checkbox" id="resolve"> Подтверждаю новое решение при расхождении с прежним</label>
    ${!bulk ? '<p><a href="/standards?sha='+items[0].sha256+'">Открыть для утверждения</a></p>' :
      '<p><a href="/standards">Перейти к быстрой проверке</a></p>'}
    <div class="row"><button class="primary" id="save-review">${bulk ? 'Сохранить для ' + items.length + ' PNG' : 'Сохранить решение'}</button>
    ${!bulk && items[0].journal.length ? '<button id="undo-review">Отменить последнее решение</button>' : ''}</div>`;
  const catalogSelect = byId('catalog-decision');
  const referenceSelect = byId('reference-decision');
  const submit = async undo => {
    if (busy) return;
    try {
      const body = {
        reviewer: byId('reviewer').value, note: byId('note').value, resolve: byId('resolve').checked, undo,
        catalog: undo ? undefined : catalogSelect.value || undefined,
        reference: undo ? undefined : referenceSelect.value || undefined,
        rows:items.map(item=>({sha256:item.sha256,revision:item.reviewRevision,visualKey:item.visualKey})),
      };
      await save('/api/reviews', body);
      sessionStorage.setItem('cable-reviewer', body.reviewer);
      if (bulk) {
        selection.clear();
        render();
        dialog.close();
      } else {
        await openItem(items[0].sha256);
        byId('dialog-message').textContent = 'Решение сохранено в журнале.';
      }
    } catch (error) {
      byId('dialog-message').textContent = error.message;
    }
  };
  byId('save-review').onclick = () => submit(false);
  if (byId('undo-review')) byId('undo-review').onclick = () => submit(true);
}

async function save(url, body) {
  busy = true;
  for (const button of dialog.querySelectorAll('button')) button.disabled = true;
  byId('dialog-message').textContent = 'Сохраняю…';
  try {
    const data = await request(url, body);
    load(data);
    byId('message').textContent = data.changed ? 'Сохранено решений · ' + data.changed : 'Журнал уже содержит эти решения.';
    return data;
  } finally {
    busy = false;
    for (const button of dialog.querySelectorAll('button')) button.disabled = false;
  }
}

function displayItem(item) {
  const at = navigation.indexOf(item.sha256);
  byId('title').textContent = item.name;
  const background = byId('background').value;
  const legacyRejection = item.history.find(event => /^rejected$/iu.test(event.status ?? '') && event.note);
  content.innerHTML = `
    <div class="row"><button id="item-prev" ${at <= 0 ? 'disabled' : ''}>Предыдущий PNG</button>
    <span>${at < 0 ? '' : (at + 1) + ' из ' + navigation.length}</span>
    <button id="item-next" ${at < 0 || at >= navigation.length - 1 ? 'disabled' : ''}>Следующий PNG</button></div>
    <div class="detail-grid">
      <section aria-label="Просмотр изображения">
        <div class="row">
          <label>Фон <select id="single-background"><option value="">Белый</option><option value="dark">Тёмный</option><option value="checker">Шахматный</option></select></label>
          <label>Увеличение <select id="zoom"><option value="100">По ширине</option><option value="150">150%</option><option value="200">200%</option><option value="300">300%</option></select></label>
          <a href="/png/${item.sha256}" target="_blank" rel="noopener">Исходный PNG</a>
        </div>
        <div id="preview" class="picture ${escape(background)}" tabindex="0" aria-label="Область просмотра PNG с прокруткой"><img id="sample" src="/png/${item.sha256}" alt="${escape(item.name)}"></div>
        <p class="muted">${escape(item.family)} · ${item.origins.map(origin => escape(origins[origin])).join(', ')} ·
          ${item.createdAt ? escape(new Date(item.createdAt).toLocaleString('ru', { timeZone: 'Asia/Yekaterinburg' })) : 'Дата создания неизвестна'}</p>
        <p><code>${item.sha256}</code></p>
        <p>${item.bindings} действующих привязок · ${Math.max(0, item.bindings - 1)} повторных использований</p>
        ${details('Файлы и дубликаты · ' + item.paths.length, '<pre>' + escape(item.paths.join('\n')) + '</pre>')}
        ${details('Референсы при создании', item.referenceSources.length ? '<pre>' + pretty(item.referenceSources) + '</pre>' : '<p>Сведения отсутствуют.</p>')}
        ${details('Совместимость по visualKey · ' + item.scopes.length, item.unknown ? '<p>Совместимость неизвестна.</p>' :
          item.scopes.map(scope => '<p><strong>' + escape(scope.family) + '</strong> · ' + escape(scope.visualizationType) + '<br><code>' +
            escape(scope.visualKey) + '</code><br>' + escape(scope.skus.join(', ')) + '</p>').join(''))}
        ${details('Связанные SKU · ' + item.skus.length, '<p>' + escape(item.skus.join(', ')) + '</p>' +
          '<p>Действующие привязки · ' + escape(item.currentBindings.join(', ')) + '</p>' +
          '<pre>' + pretty(item.catalog) + '</pre>')}
      </section>
      <section aria-label="Решения по изображению">
        <p><strong>${escape(statusText[item.status])}</strong><br>${escape(referenceText[item.referenceStatus])}
          ${!item.referenceAllowed && ['PRIMARY', 'ADDITIONAL'].includes(item.referenceStatus) ? ' · применение заблокировано' : ''}</p>
        ${item.conflict ? '<p class="notice">Конфликт с прежней записью. Сверьте историю и явно подтвердите выбранное решение. Действующие назначения сохраняются.</p>' : ''}
        ${item.unknown ? '<p class="notice">Связь с техническим профилем текущего каталога не подтверждена.</p>' : ''}
        ${item.hold ? '<p class="notice">Техническое удержание · ' + escape(item.hold) + '</p>' : ''}
        ${legacyRejection ? '<p>Прежнее отклонение · ' + escape(legacyRejection.note) + '</p>' : ''}
        <div id="editor"></div>
        ${!state.archive && item.retrySku ? '<button id="retry">Создать исправленный PNG</button>' : ''}
        ${history(item)}
      </section>
    </div>`;
  byId('single-background').value = background;
  byId('single-background').onchange = event => { byId('preview').className = 'picture ' + event.target.value; };
  byId('zoom').onchange = event => { byId('sample').style.width = event.target.value + '%'; };
  byId('item-prev').onclick = () => openItem(navigation[at - 1]);
  byId('item-next').onclick = () => openItem(navigation[at + 1]);
  if (!item.protected) renderEditor([item], byId('editor'), false);
  const retry = byId('retry');
  if (retry) retry.onclick = async () => {
    retry.disabled = true;
    dialog.close();
    await generateForSku(item.retrySku, item.sha256);
  };
  byId('sample').onclick = event => {
    const ends = content.querySelector('[data-ends]');
    if (!ends) return;
    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    const point = Math.floor((event.clientX - rect.left) * image.naturalWidth / rect.width) + ',' +
      Math.floor((event.clientY - rect.top) * image.naturalHeight / rect.height);
    ends.value = [ends.value.trim(), point].filter(Boolean).join('\n');
  };
}

async function openItem(sha) {
  if (!sha || busy) return;
  const pending = ++detailRequest;
  openDialog('Загрузка PNG…');
  try {
    const item = await request('/api/item/' + sha);
    if (dialog.open && pending === detailRequest) displayItem(item);
  } catch (error) {
    byId('dialog-message').textContent = error.message;
  }
}

byId('grid').onclick = event => {
  const key = event.target.closest('[data-sha]')?.dataset.sha;
  if (!key) return;
  navigation = found.map(item => item.sha256);
  openItem(key);
};
byId('grid').onchange = event => {
  const key = event.target.dataset.select;
  if (!key) return;
  if (event.target.checked) selection.add(key);
  else selection.delete(key);
  renderSelection();
};
byId('select-page').onclick = () => {
  for (const item of found.slice(page * pageSize, (page + 1) * pageSize)) if (!item.protected) selection.add(item.sha256);
  render();
};
byId('clear').onclick = () => { selection.clear(); render(); };
byId('bulk').onclick = async () => {
  openDialog('Пакетное решение');
  content.textContent = 'Загрузка выбранных PNG…';
  try {
    const keys = [...selection];
    const items = [];
    for (let offset = 0; offset < keys.length; offset += 24) {
      items.push(...await Promise.all(keys.slice(offset, offset + 24).map(sha => request('/api/item/' + sha))));
      if (!dialog.open) return;
    }
    renderEditor(items, content, true);
  } catch (error) { byId('dialog-message').textContent = error.message; }
};
byId('close').onclick = () => { if (!busy) dialog.close(); };
dialog.oncancel = event => { if (busy) event.preventDefault(); };
dialog.onclose = () => {
  detailRequest++;
  const replacement = focusTarget?.dataset.sha && byId('grid').querySelector('[data-sha="' + focusTarget.dataset.sha + '"]');
  (focusTarget?.isConnected ? focusTarget : replacement || byId('q')).focus();
};
byId('prev').onclick = () => { page--; render(); };
byId('next').onclick = () => { page++; render(); };
for (const id of ['q', 'status', 'reference', 'family', 'origin', 'bindings', 'view', 'background']) {
  byId(id).oninput = () => { page = 0; render(); };
}
byId('scan').onclick = async () => {
  byId('scan').disabled = true;
  byId('message').textContent = 'Сверяю PNG и решения…';
  try { load(await request('/api/rescan', {})); byId('message').textContent = 'Инвентарь обновлён.'; }
  catch (error) { byId('message').textContent = error.message; }
  finally { byId('scan').disabled = false; }
};
byId('issues').onclick = async () => {
  openDialog('Целостность инвентаря');
  try {
    const issues = await request('/api/issues');
    content.innerHTML = issues.length ? '<pre>' + pretty(issues) + '</pre>' : '<p>Расхождений не обнаружено.</p>';
  } catch (error) { byId('dialog-message').textContent = error.message; }
};
byId('import').onchange = async event => {
  fileToImport = event.target.files[0];
  if (!fileToImport) return;
  event.target.value = '';
  openDialog('Импорт журнала JSON');
  content.innerHTML = '<p>' + escape(fileToImport.name) + '</p><p>Применяются только недостающие записи с совпадающей историей и SHA. При конфликте откройте карточку PNG и выберите решение вручную.</p><button class="primary" id="confirm-import">Применить JSON</button>';
  byId('confirm-import').onclick = async () => {
    try { await save('/api/import', JSON.parse(await fileToImport.text())); dialog.close(); }
    catch (error) { byId('dialog-message').textContent = error.message; }
  };
};
request('/api/inventory').then(data => { load(data); byId('message').textContent = ''; })
  .catch(error => { byId('message').textContent = error.message; });
