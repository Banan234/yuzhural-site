import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cableStyleReviewRequirements, digest } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';
import { cableReviewExportVersion } from './lib/cableReviewImport.js';
import { cableIllustrationHold, cableIllustrationDefects } from './lib/cableIllustrationDefects.js';
import { CABLE_STYLE_REVIEW_CHECKS, CABLE_STYLE_REVIEW_LABELS, CABLE_FRAME_REVIEW_LABELS } from './lib/cableCoreGeometry.js';
import { VVG_CUT_REVIEW_LABELS, vvgCutHold } from './lib/cableVvgCutQuality.js';
import { matchesApprovedCableConstruction } from '../shared/productImages.js';
import { VVG_TYPICAL_ILLUSTRATION } from './lib/cableVvgIllustration.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = 'outputs/cable-vvg-manual-review-2026-11-15';
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file)));
const [previous, plan, cohort, archived, evidence, tests, products] = await Promise.all([
  read('outputs/cable-blockers-verification-2026-11-15/blockers.json'), read(out+'/dry-run/plan.json'),
  read('outputs/catalog-analysis-2026-11-15/catalog.json'), loadCableReviewDecisions(root),
  read(out+'/evidence.json'), read(out+'/tests.json'), read('data/catalog-current/products.json'),
]);
const complete = new Set(cohort.rows.filter(row => row.status === 0).map(row => row.sku));
const outside = new Set(plan.groups.filter(group =>
  !['READY', 'APPROVED_DRAFT_NOT_PUBLISHED', 'PENDING_REVIEW'].includes(group.status) &&
  group.members.some(row => complete.has(row.sku) && !row.reasons.includes('existing-catalog-image'))
).map(group => group.visualKey));
const groupsBySku = new Map(plan.groups.flatMap(group => group.members.map(row => [row.sku, group])));
const rowRoutes = previous.rows.map(row => {
  const groups = [...new Set(row.skus.map(({sku}) => groupsBySku.get(sku)))];
  if (groups.length !== 1 || !groups[0]) throw Error('Unmapped or split profile ' + row.previousKey);
  return { row, group: groups[0] };
});
const mappedOutside = new Set(rowRoutes.map(({group}) => group.visualKey).filter(key => outside.has(key)));
if (outside.size !== plan.summary.blockedProfiles || mappedOutside.size !== outside.size)
  throw Error('Dry-run and historical scope differ');

const productsBySku = new Map(products.map(product => [product.sku, product]));
const images = new Map();
const technicalRows = [];
const allDecisions = new Map(archived.map(entry => [entry.decision.sha256, entry]));
for (const {row, group} of rowRoutes) {
  if (row.category !== 'existing') {
    technicalRows.push({ row, group, ...diagnose(row, group) });
    continue;
  }
  const dir = group.claim?.draftDir;
  const image = await fs.readFile(path.join(dir, 'image.png'));
  const sha = digest(image);
  const entry = allDecisions.get(sha);
  const draft = await read(path.join(dir, 'group.json'));
  const request = await read(path.join(dir, 'request.json'));
  const req = cableStyleReviewRequirements(draft, request);
  const claimKey = group.claim.key;
  if (!images.has(sha)) {
    const approvalProfile = { profileHash: digest(draft.profile) };
    const illustration = { policy: VVG_TYPICAL_ILLUSTRATION, profile: draft.profile };
    const compatible = plan.sourceQueue.groups.flatMap(candidate => candidate.members.filter(member =>
      matchesApprovedCableConstruction(productsBySku.get(member.sku), approvalProfile, illustration)
    ).map(member => [member.sku, member.name]));
    const related = archived.filter(record => record.claimKey === claimKey ||
      (record.decision.sku && draft.members.some(member => member.sku === record.decision.sku)));
    const localApproval = await read(path.join(dir, 'approval.json')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const decision = entry?.decision ?? (localApproval?.sha256 === sha ? localApproval : null);
    images.set(sha, {
      sha, dir: path.relative(root, dir), draft, req, decision, previous: entry ? digest(entry.decision) : null,
      history: [...(entry?.previous ?? []), ...related.filter(record => record !== entry)
        .flatMap(record => [...record.previous, record.decision])],
      hold: cableIllustrationHold(sha), held: vvgCutHold(sha), compatible: [...new Map(compatible)],
      data: image.toString('base64'), rows: [],
    });
  }
  images.get(sha).rows.push({row, group});
}

function diagnose(row, group) {
  const p = group.profile;
  const reasons = row.reasons.join(' ');
  const facts = 'Из маркировки и профиля: ' + p.cores + ' жил; ' +
    (p.conductorMaterial === 'copper' ? 'медь' : p.conductorMaterial) + '; ' + p.family +
    (p.coreLayout ? '; группы сечений ' + JSON.stringify(p.coreLayout) : '') + '.';
  if (reasons.includes('mixed-size')) return {
    category: 'Разноразмерные жилы и укладка', missing: 'Расположение, роли и цвета основных и уменьшенной жилы, геометрия каждой группы.',
    facts, docs: 'Сечение и схема укладки из паспорта или чертежа исполнения.',
    action: 'Внести подтверждённую раскладку и проверить отдельный контракт разноразмерных жил.',
  };
  if (reasons.includes('barrier documentation')) return {
    category: 'Конструктивные слои и FR-барьер', missing: 'Материал и положение барьера для точного исполнения.',
    facts, docs: 'Конструкция FR-барьера и применимость к указанным индексам и сечениям.',
    action: 'Добавить источник в техническое правило для точного исполнения, затем пересчитать профиль.',
  };
  if (/classification-needs-review|unsupported visualizationType|conflicts with profile flags/u.test(reasons)) return {
    category: 'Флаги исполнения и тип визуализации',
    missing: p.shield ? 'Согласованный профиль экранированного исполнения и его реальных слоёв.' : 'Подтверждённая расшифровка индекса НГ-FR-LS и наличие, материал и положение барьера.',
    facts: facts + (p.shield ? ' Индекс Э указывает на экран; его не следует заменять бронёй.' : ' Точное написание индекса сохранено.'),
    docs: 'Точное исполнение по исходной маркировке и схема слоёв производителя.',
    action: 'После подтверждения зарегистрировать отдельное правило и проверить флаги и тип. Подмена обычным ВВГ или общим FRLS недопустима.',
  };
  const held = group.blocker === 'EXISTING_APPROVAL_HELD';
  return {
    category: held ? 'Утверждённый PNG удержан по дефекту' : 'Строение и форма проводников',
    missing: 'Одно- или многопроволочное исполнение, круглая или секторная форма жил.' +
      (reasons.includes('unconfirmed-interstitial') ? ' Уточнить наличие заполнения для точного исполнения.' : '') +
      (held ? ' Утверждённый источник удержан для новых привязок.' : ' Имеющийся PNG не подтверждает совместимость с этими SKU.'),
    facts, docs: 'Паспорт или спецификация для данного сечения и маркировки, включая применимые слои.',
    action: 'Пересчитать подпись по подтверждённой конструкции и повторно проверить существующий PNG.' +
      (held ? ' Снять удержание можно через отдельную приёмку допустимого варианта.' : ''),
  };
}

const esc = value => String(value ?? '').replace(/[&<>"']/gu, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const json = value => esc(JSON.stringify(value, null, 2));
const embedded = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const labels = { ...Object.fromEntries(CABLE_STYLE_REVIEW_CHECKS.map((key, index) =>
  [key, CABLE_STYLE_REVIEW_LABELS[index]])), ...CABLE_FRAME_REVIEW_LABELS, ...VVG_CUT_REVIEW_LABELS };
const keyDetails = (row, group) => `<details><summary>Маршрут visualKey</summary><code>${esc(row.previousKey)}</code> → <code>${esc(group.visualKey)}</code><p>${esc(group.status)} · ${outside.has(group.visualKey) ? 'входит в 40' : 'вне счётчика 40'}</p></details>`;
const skuList = list => list.map(({sku, name}) => esc(sku + ' · ' + name)).join('<br>');
const imageCards = [...images.values()].map(card => {
  const {sha, draft, req, previous, decision, data, hold, held} = card;
  const status = decision?.status ?? card.rows[0].group.status;
  const meta = { sha256: sha, draftDir: card.dir, visualKey: draft.visualKey, previous,
    multicore: Boolean(req.composition) };
  const history = [...card.history, ...(decision ? [decision] : [])];
  const preview = ['white', 'dark', 'checker'].map((background, index) =>
    `<figure><div class="preview ${background}"><img data-sha="${sha}" alt="Разделка кабеля" ${index === 0 && req.composition ? 'data-markable tabindex="0" role="button" aria-label="Отметить центр металлического конца"' : ''}></div><figcaption>${['Белый', 'Тёмный', 'Шахматный'][index]}</figcaption></figure>`).join('');
  return `<article data-image='${esc(JSON.stringify(meta))}'>
  <h3>${esc(card.rows[0].row.skus[0].name)} <span>${esc(status)}</span></h3>
  <p><code>SHA-256 ${sha}</code></p>
  <div class="previews">${preview}</div>
  <p>${draft.profile.cores} жил · ${esc(draft.profile.geometry)} · ${esc(draft.profile.conductorConstruction)} · ${esc(draft.profile.conductorShape)}.
  ${draft.profile.cores === 4 ? 'Две компактные пары в глубину для равных круглых жил.' : draft.profile.cores > 1 ? 'Компактная укладка в глубину по круговой геометрии, без веера.' : 'Одна центральная жила.'}</p>
  <details><summary>Технический профиль PNG и слои</summary><code>${esc(draft.visualKey)}</code><pre>${json({profile: draft.profile, layers: req.technical.layers})}</pre></details>
  <details><summary>Совпадение конструкции по текущему каталогу · ${card.compatible.length} SKU</summary>${skuList(card.compatible.map(([sku,name])=>({sku,name})))}<p>Допуск к привязке проверяется отдельно после утверждения. SKU из старого отбора перечислены ниже даже при отсутствии доказанной совместимости.</p></details>
  <ul>${card.rows.map(({row,group})=>`<li>${skuList(row.skus)}<p>${esc(group.blocker)} · ${esc(row.action)}</p>${keyDetails(row,group)}</li>`).join('')}</ul>
  <p>${hold ? 'Удержание: ' + esc(hold.defectId) + ' · ' + esc(cableIllustrationDefects.find(defect => defect.id === hold.defectId)?.description ?? hold.revisionMode) : ''}</p>
  <details><summary>История решений · ${history.length}</summary>${history.length ? '<pre>'+json(history)+'</pre>' : 'Решения по SHA и связанным редакциям отсутствуют.'}</details>
  ${status === 'APPROVED' ? '<p>Утверждённое решение доступно для чтения.</p>' : `<fieldset><legend>Решение по этому PNG</legend>
  ${status === 'REJECTED' ? '<label><input class="reopen" type="checkbox"> Явно открыть повторную приёмку отклонённого PNG</label>' : ''}
  <label>Действие <select class="action"><option value="">Без решения</option>${!held ? '<option value="APPROVE">APPROVE · утвердить</option>' : ''}<option value="REJECT">REJECT · отклонить</option><option value="NEEDS_CORRECTION">NEEDS_CORRECTION · точечное исправление</option><option value="KEEP_PENDING">KEEP_PENDING · оставить на проверке</option></select></label>
  <label>Комментарий <textarea rows="2" class="note"></textarea></label>
  ${held ? '<p>Утверждение заблокировано действующим правилом дефекта. Этот SHA остаётся удержанным.</p>' : `<details class="approval" hidden><summary>Обязательные проверки для APPROVE</summary>
  ${req.required.map(key=>`<label><input type="checkbox" class="check" value="${esc(key)}"> ${esc(labels[key] ?? key)}</label>`).join('')}
  <label><input class="catalog" type="checkbox"> Разрешить совместимое использование в каталоге при отдельной привязке</label>
  ${req.composition ? `<p>Отметьте центры полностью видимых металлических концов на белом превью. Клавиатурой можно ввести координаты в исходных пикселях.</p>
  <label>Центры металла (x,y по одному на строку) <textarea rows="4" class="tips"></textarea></label>
  <p>Введите фактически видимые значения. Сверьте их с техническим профилем выше.</p>
  ${Object.entries({ insulatedCoreCount: 'Изолированных жил', additionalConductorCount: 'Дополнительных проводников', conductorMaterial: 'Металл (copper / aluminium)', conductorConstruction: 'Строение (solid / stranded)', conductorShape: 'Форма (circular / sector)', coreColors: 'Цвета через запятую (ключи из профиля)', layerRoles: 'Роли слоёв через запятую (ключи из профиля)' }).map(([key,label]) =>
    `<label>${label} <input data-observation="${key}" type="${key.endsWith('Count') ? 'number' : 'text'}"></label>`).join('')}
  <label><input class="visible" type="checkbox"> Все отмеченные металлические концы видны целиком</label>` : ''}</details>`}
  </fieldset>`}
  </article>`;
}).join('');
const table = technicalRows.map(({row,group,category,missing,facts,docs,action}) =>
  `<tr><th scope="row">${skuList(row.skus)}${keyDetails(row,group)}</th><td>${category}<br>${esc(missing)}<details><summary>Диагностика</summary>${row.reasons.map(esc).join('<br>')}</details></td><td>${esc(facts)}</td><td>${esc(docs)}</td><td>${esc(action)}</td></tr>`).join('');
const counts = Object.groupBy(technicalRows, row => row.category);
const countedRows = rowRoutes.filter(({group}) => outside.has(group.visualKey)).length;
const pending = [...images.values()].filter(card => !card.held && !['REJECTED','APPROVED'].includes(card.decision?.status)).length;
const dataBySha = Object.fromEntries([...images.values()].map(({sha,data})=>[sha,'data:image/png;base64,'+data]));
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ВВГ и ВВГз · приёмка и блокировки</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f4;color:#162437;font:16px/1.5 system-ui,sans-serif}main{max-width:1360px;margin:auto;padding:clamp(12px,3vw,36px)}section,article{overflow-wrap:anywhere}article,header,section.summary{margin:0 0 16px;padding:clamp(12px,2vw,24px);background:white;border:1px solid #cad4df;border-radius:12px}h1,h2,h3,p{margin-top:0}h3 span{font-size:.8rem;background:#e4ebf3;padding:4px 8px;border-radius:6px;margin-left:6px}a{color:#00579d}code{font-size:.85rem}pre{white-space:pre-wrap;font-size:.82rem}details{margin:8px 0}summary{cursor:pointer}fieldset{margin-top:12px;border:1px solid #cad4df;padding:12px}label{display:block;margin:8px 0}textarea,input,select,button{font:inherit}textarea{width:100%}.previews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.preview{border:1px solid #cad4df}.preview img{display:block;width:100%;height:auto}.preview img[data-markable]{cursor:crosshair}.white{background:white}.dark{background:#202734}.checker{background:repeating-conic-gradient(#a7b3c2 0 25%, #e2e7ee 0 50%) 0/20px 20px}figure{margin:0}figcaption{padding:5px;color:#34485d}.table{overflow:auto;background:white}table{border-collapse:collapse;min-width:1000px;width:100%}td,th{border-bottom:1px solid #cad4df;padding:12px;text-align:left;vertical-align:top}thead{background:#dce7f2}button{background:#17436a;color:white;border:0;border-radius:5px;padding:8px 14px;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #0076c8;outline-offset:2px}li{margin-bottom:8px}@media(max-width:600px){.previews{grid-template-columns:1fr}}
</style></head><body><main><header><h1>ВВГ и ВВГз</h1><p>Ручная приёмка и разбор 52 профилей · 15 ноября 2026</p><nav><a href="#review">А. Существующие PNG</a> · <a href="#technical">Б. Технические блокировки</a></nav></header>
<section id="review"><h2>А. Приёмка 17 профилей</h2><p>17 профилей ссылаются на ${images.size} PNG. Каждое решение относится к одному SHA. Связанные варианты в истории имеют собственные SHA.</p>
<label>Имя проверяющего <input id="reviewer"></label><button type="button" id="export">Скачать JSON решений</button> <output id="message" aria-live="polite"></output>
<p>Из корня проекта проверьте файл командой <code>node scripts/importCableReviewDecisions.js /путь/к/cable-review-decisions.json</code>. Для записи в архив повторите с <code>--apply</code>. Применение меняет только решения по выбранным SHA. После импорта обновите HTML командой <code>node scripts/renderVvgBlockerReview.js</code> для следующей сессии.</p>
${imageCards}</section>
<section id="technical"><h2>Б. 35 технических блокировок</h2><ul>${Object.entries(counts).map(([key,rows])=>`<li>${esc(key)} · ${rows.length}</li>`).join('')}</ul><div class="table" tabindex="0" aria-label="Технические блокировки"><table><thead><tr><th>SKU и маршрут</th><th>Недостающие сведения</th><th>Уже известно</th><th>Документация производителя</th><th>Действие</th></tr></thead><tbody>${table}</tbody></table></div></section>
<section class="summary"><h2>Сверка 52 → ${outside.size}</h2><p>${countedRows} исторических строк соответствуют ${outside.size} уникальным ключам вне допуска. Один прежний ключ YU-0001079 объединился с уже удержанным профилем ВВГз. Оставшиеся ${rowRoutes.length-countedRows} строк имеют статус PENDING_REVIEW и исключены из метрики. Маршрут каждого профиля раскрывается в карточке или строке таблицы. Параметр generation-limit исключает ожидающие приёмки PNG из контрольной генерации, поэтому счётчик выбранных черновиков равен нулю.</p>
<h2>Проверки и готовность</h2>
<p>Node ${esc(evidence.node)} · ${tests.numPassedTests} пройденных тестов · ${evidence.providerCalls} вызовов провайдера. Четыре решения прочитаны после перезапуска. SKU ${esc(evidence.reuse.sku)} подтвердил повторное использование, его копия с новым SKU прошла проверку совместимости, разноразмерный ${esc(evidence.blocked.sku)} остался за шлюзом.</p>
<ul><li>Технически разблокировано по штатному планировщику без дополнительных сведений: 0 из 35.</li><li>Нуждаются в техническом подтверждении: ${technicalRows.length} профилей. Применимый документ или точная спецификация партии могут закрыть перечисленные поля.</li><li>Подтверждённых программных причин среди этих 35: 0. Конфликтующие флаги показаны отдельно и требуют доказательства применимости.</li><li>Ожидают решения человека: ${pending} разных PNG. Ещё ${images.size-pending} PNG удержаны из-за зарегистрированных дефектов.</li><li>К оплате по текущему dry-run: ${plan.summary.newGenerations}. После получения сведений точное число установит повторный план с проверкой несовместимости, утверждений, оплаченных PNG и референсов.</li></ul>
<p><strong>Массовый запуск пока заблокирован.</strong> HTTP и машинные проверки не заменяют ручную приёмку пикселей. Текущие привязки и архивные утверждения сохранены. Для совместимости действуют подпись конструкции, версия стиля, эталон и версия экрана. Удержания по SHA применяются к будущему повторному использованию. Если решение содержит версию проверенных правил и она изменилась, новый подбор блокируется. Исторические решения без такой отметки сохраняют прежний допуск и не подтверждают проверку по новой версии.</p></section></main>
<script>
const images = ${embedded(dataBySha)};
for (const img of document.querySelectorAll('img[data-sha]')) img.src = images[img.dataset.sha];
const cards = [...document.querySelectorAll('article[data-image]')];
for (const card of cards) {
  const action = card.querySelector('.action');
  const approval = card.querySelector('.approval');
  if (action && approval) action.onchange = () => { approval.hidden = action.value !== 'APPROVE'; if (!approval.hidden) approval.open = true; };
  const picture = card.querySelector('[data-markable]');
  const tips = card.querySelector('.tips');
  if (picture && tips) {
    picture.onclick = event => {
      const box = picture.getBoundingClientRect();
      const x = Math.floor((event.clientX - box.left) * picture.naturalWidth / box.width);
      const y = Math.floor((event.clientY - box.top) * picture.naturalHeight / box.height);
      tips.value = [tips.value.trim(), x + ',' + y].filter(Boolean).join('\\n');
    };
    picture.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tips.focus(); } };
  }
}
document.querySelector('#export').onclick = () => {
  const message = document.querySelector('#message');
  try {
    const reviewer = document.querySelector('#reviewer').value.trim();
    if (!reviewer) throw Error('Укажите имя проверяющего.');
    const decisions = [];
    for (const card of cards) {
      const action = card.querySelector('.action')?.value;
      if (!action) continue;
      const {multicore, ...identity} = JSON.parse(card.dataset.image);
      const title = card.querySelector('h3').textContent;
      const note = card.querySelector('.note').value.trim();
      const reopen = card.querySelector('.reopen')?.checked === true;
      if (['NEEDS_CORRECTION', 'REJECT'].includes(action) && !note) throw Error(title + ' · укажите причину.');
      if (action === 'APPROVE' && card.querySelector('.reopen') && !reopen) throw Error(title + ' · явно откройте повторную приёмку.');
      const row = {...identity, action, note, reopen};
      if (action === 'APPROVE') {
        const checks = [...card.querySelectorAll('.check')];
        if (!checks.every(check => check.checked)) throw Error(title + ' · завершите обязательные проверки.');
        row.checks = Object.fromEntries(checks.map(check => [check.value,true]));
        row.catalog = card.querySelector('.catalog').checked;
        if (multicore) {
          const tips = card.querySelector('.tips').value.trim().split(/\\n+/);
          const complete = card.querySelector('.visible').checked;
          const fields = [...card.querySelectorAll('[data-observation]')];
          if (!complete || tips.some(tip => !/^\\d+,\\s*\\d+$/.test(tip.trim())) || fields.some(field => !field.value.trim()))
            throw Error(title + ' · заполните ручные наблюдения и координаты концов.');
          row.observations = {sha256:row.sha256,ends:tips.map(tip=>{const [x,y] = tip.split(',').map(Number); return {x,y,complete};})};
          for (const field of fields) {
            const key = field.dataset.observation;
            row.observations[key] = field.type === 'number' ? Number(field.value) : ['coreColors','layerRoles'].includes(key)
              ? field.value.split(',').map(value=>value.trim()).filter(Boolean) : field.value.trim();
          }
        }
      }
      decisions.push(row);
    }
    if (!decisions.length) throw Error('Выберите хотя бы одно решение.');
    const blob = new Blob([JSON.stringify({version:${embedded(cableReviewExportVersion)},reviewer,decisions}, null, 2)],{type:'application/json'});
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cable-review-decisions.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    message.textContent = 'Экспортировано решений: ' + decisions.length;
  } catch (error) { message.textContent = error.message; }
};
</script></body></html>`;
await fs.writeFile(path.join(root, out, 'report.html'), page);
await fs.writeFile(path.join(root, out, 'mapping.json'), JSON.stringify(rowRoutes.map(({row,group})=>({
  previousKey:row.previousKey, currentKey:group.visualKey, skus:row.skus, status:group.status,
  blocker:group.blocker, counted:outside.has(group.visualKey),
})), null, 2));
console.log({ profiles: rowRoutes.length, countedRows, blocked: outside.size, images: images.size, pending,
  diagnostics: Object.fromEntries(Object.entries(counts).map(([key, rows])=>[key, rows.length])) });
