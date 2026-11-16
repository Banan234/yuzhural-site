const byId = id => document.getElementById(id);
const grid = byId('review-grid');
const filter = byId('decision-filter');
const search = byId('search');
const exportButton = byId('export-redo');
const status = byId('status');
const keys = sha => 'yuzhural.cable-reference-review.v1.' + sha;
const roleNames = { FAMILY_PRIMARY:'Основной по семейству', GEOMETRY_MATCH:'По геометрии' };
const defaultReview = { decision:null, notes:'' };
let cards = [];

function textElement(tag, value, className = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  element.className = className;
  return element;
}

function showCards() {
  const query = search.value.trim().toLocaleLowerCase('ru');
  let shown = 0;
  let kept = 0;
  let redo = 0;
  for (const { article, review, searchText } of cards) {
    article.hidden = !searchText.includes(query) || Boolean(filter.value && filter.value !== (review.decision ?? 'pending'));
    if (!article.hidden) shown++;
    if (review.decision === 'keep') kept++;
    if (review.decision === 'redo') redo++;
  }
  byId('counts').textContent = `Показано ${shown} из ${cards.length} · Без решения ${cards.length - kept - redo} · Оставить ${kept} · Переделать ${redo}`;
  byId('empty').hidden = shown > 0;
  exportButton.disabled = redo === 0;
}

function setPreview(link, img, sha256, name) {
  link.href = img.src = '/png/' + sha256;
  link.setAttribute('aria-label', 'Открыть PNG в новой вкладке · ' + name);
  img.alt = name;
}

function createCard(row) {
  const { sha256, sources, bindings } = row;
  const article = byId('reference-card').content.firstElementChild.cloneNode(true);
  const name = sources[0].name ?? 'Название отсутствует в архиве';
  setPreview(article.querySelector('a'), article.querySelector('img'), sha256, name);
  const facts = article.querySelector('.review-facts');
  for (const source of sources) {
    facts.append(
      textElement('h2', source.name ?? 'Название отсутствует в архиве'),
      textElement('p', `${source.sku ?? 'SKU отсутствует'}${source.groupRepresentative ? ' · представитель исходной группы' : ''} · ${source.type ?? 'Тип отсутствует'}`, 'metadata'),
    );
    const permission = source.permission === 'PRIMARY' ? 'Приоритетный допуск' : 'Дополнительный допуск';
    const preferred = roleNames[source.preferredRole];
    facts.append(textElement('p', preferred ? `${permission} · Приоритет роли «${preferred}»` : permission));
    if (source.schematic) {
      facts.append(textElement('p', 'Схематический профиль исключён из подбора для запроса.', 'metadata'));
    } else {
      const roles = document.createElement('ul');
      roles.className = 'review-permissions';
      roles.setAttribute('aria-label', 'Роли референса при совпадении профиля');
      roles.append(...Object.values(roleNames).map(role => textElement('li', role)));
      facts.append(textElement('small', 'Роли при совместимости с целевым профилем'), roles);
    }
  }
  article.querySelector('.coverage').textContent = `Используют PNG · ${bindings} SKU`;

  const notes = article.querySelector('textarea');
  notes.setAttribute('aria-label', 'Замечания · ' + name);
  const buttons = [...article.querySelectorAll('[data-decision]')];
  const feedback = article.querySelector('.review-status');
  const card = {
    article, row, review:defaultReview,
    searchText:[sha256, ...sources.flatMap(({ name, sku }) => [name, sku])].join(' ').toLocaleLowerCase('ru'),
  };
  try {
    const saved = localStorage.getItem(keys(sha256));
    if (saved) card.review = JSON.parse(saved);
    notes.value = card.review.notes;
  } catch {
    feedback.textContent = 'Не удалось прочитать сохранённые отметки.';
  }

  function updateButtons() {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.decision === card.review.decision));
    }
  }

  function save(decision) {
    const review = { decision, notes:notes.value };
    try {
      localStorage.setItem(keys(sha256), JSON.stringify(review));
    } catch {
      feedback.textContent = 'Не удалось сохранить. Проверьте настройки хранилища браузера.';
      return;
    }
    card.review = review;
    updateButtons();
    feedback.textContent = 'Сохранено в браузере.';
    showCards();
    if (article.hidden && article.contains(document.activeElement)) filter.focus();
  }

  updateButtons();
  notes.addEventListener('input', () => save(card.review.decision));
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const { decision } = button.dataset;
      save(card.review.decision === decision ? null : decision);
    });
  }
  return card;
}

async function readJson(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Ошибка загрузки');
  return result;
}

async function load(refresh = false) {
  const refreshButton = byId('refresh');
  refreshButton.disabled = true;
  status.textContent = 'Загружаю референсы…';
  try {
    if (refresh) await readJson('/api/rescan', {
      method:'POST',
      headers:{ 'x-gallery-token':document.querySelector('meta[name="write-token"]').content },
    });
    const data = await readJson('/api/reference-review');
    cards = data.references.map(createCard);
    grid.replaceChildren(...cards.map(card => card.article));
    byId('protected-label').textContent = `Защищённые эталоны стиля · ${data.protected.length}`;
    byId('protected-grid').replaceChildren(...data.protected.map(({ type, sha256 }) => {
      const article = document.createElement('article');
      article.className = 'card';
      const link = document.createElement('a');
      link.className = 'image checker';
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.loading = 'lazy';
      setPreview(link, img, sha256, type);
      link.append(img);
      article.append(link, textElement('h2', type), textElement('small', 'Защищённый эталон · базовый стиль'));
      return article;
    }));
    byId('protected').hidden = false;
    status.textContent = '';
    showCards();
  } catch (error) {
    status.textContent = 'Не удалось загрузить референсы. ' + error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

search.addEventListener('input', showCards);
filter.addEventListener('change', showCards);
byId('refresh').addEventListener('click', () => load(true));
exportButton.addEventListener('click', () => {
  const references = cards.filter(({ review }) => review.decision === 'redo')
    .map(({ row, review }) => ({ ...row, ...review }));
  const file = new Blob([JSON.stringify({ version:1, references }, null, 2) + '\n'], { type:'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cable-reference-rework.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
load();
