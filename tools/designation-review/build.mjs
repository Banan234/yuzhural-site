import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { loadCatalogProducts } from '../../lib/catalog.js';
import { compactDesignationText } from '../../scripts/syncDesignationManufacturerCorpus.js';

const here = new URL('./', import.meta.url);
const root = new URL('../../', here);
const out = new URL('outputs/designation-review/index.html', root);
const products = await loadCatalogProducts();
const pending = products.filter(
  (p) => p.designationDecoded?.status === 'partial'
);
const researchedIds = new Set([
  3972, 3973, 7553, 7554, 7555, 7556, 7557, 7558, 7560, 7561,
]);
const resolved = products.filter(
  (p) => researchedIds.has(p.id) && p.designationDecoded?.status === 'reviewed'
);
const normalize = (s) =>
  s.toUpperCase().replace(/\s+/gu, '').replaceAll('Ё', 'Е');
const sizes =
  /\d+\s*[xх×]\s*\d+(?:[.,]\d+)?(?:\s*[xх×]\s*\d+(?:[.,]\d+)?)*(?![\d.,])/giu;

const paritet =
  'https://www.paritet.su/stati/informatsionnye-pisma/markoobrazovanie-ksrv-i-ksrp-/';
const custom = {
  70: [
    'В записи RM/16RE два разных исполнения жил. Проверьте заводскую таблицу на три жилы 25 мм² и отдельную жилу 16 мм² и её назначение.',
  ],
  975: [
    'Нужна схема 3×95 + 1×50 на 1 кВ и подтверждение смысла «С» именно в этой записи. Запишите роли основной и дополнительной жил отдельно.',
  ],
  3806: [
    'У «Паритета» размер 0,20 мм² соответствует номинальному диаметру 0,50 мм. Вероятно, в прайсе записано сечение, но нужна сверка с биркой или паспортом этой позиции.',
    paritet,
    'Таблица диаметра и сечения «Паритет»',
  ],
  3808: [
    'У «Паритета» размер 1,50 мм² соответствует диаметру 1,38 мм. В каталоге есть КСРВнг(А)-FRLS 1×2×1,38. Проверьте, что 1,5 в прайсе указано в мм².',
    'https://paritet.su/catalog/ksrvng_a_frls/ksrvng_a_frls_1kh2kh1_38_mm_1_5_mm_kv_/?printElement=Y',
    'Заводская карточка КСРВ',
  ],
  3322: [
    'Проверьте, не записано ли сечение 0,75 мм² вместо диаметра 0,97 мм. Нужна таблица именно экранированного КСРЭВ на две пары.',
    paritet,
    'Таблица маркообразования «Паритет»',
  ],
  4088: [
    'Лист ЭКЗ содержит 3×16+1×10 и варианты с тремя дополнительными жилами. Запись с одной жилой 6 мм² и напряжением 6 кВ требует отдельного паспорта.',
    'https://ekz.nt-rt.ru/images/manuals/KGESH.pdf',
    'Лист ЭКЗ, копия',
  ],
  7733: [
    'В исходном названии открыта скобка. Сначала сверьте полную запись с биркой, затем разбирайте «мкл2» и группировку.',
  ],
  4214: [
    'В базе для КСВВ подтверждены от двух жил. По записи 1×0,5 нельзя решить, одна это жила или сокращение записи одной пары.',
  ],
  2495: [
    'В каталоге ХКА для КВБбШвз указан заполнитель из ПВХ. Сверьте по бирке, что «з» относится к конструкции и что ТУ подтверждает исполнение нг(А).',
    'https://ekz.nt-rt.ru/images/manuals/KVVG.pdf',
    'Технический лист ЭКЗ, копия',
  ],
};
const db = new DatabaseSync(
  fileURLToPath(
    new URL('data/designation-manufacturer-corpus/corpus.sqlite', root)
  ),
  { readOnly: true }
);
const lookup =
  db.prepare(`SELECT d.id, d.title, d.url, d.format, p.page FROM pages p
  JOIN documents d ON d.id = p.document_id
  WHERE d.publisher_type = 'manufacturer' AND instr(p.compact_text, ?) > 0
  GROUP BY d.id, d.title, d.url, d.format, p.page ORDER BY p.page LIMIT 40`);
const cache = new Map();
function candidates(mark) {
  const query = compactDesignationText(mark);
  if (query.length < 5) return [];
  if (!cache.has(query)) {
    const found = lookup.all(query);
    cache.set(
      query,
      [
        ...new Map(
          found.reverse().map((d) => [
            d.id,
            {
              title: d.title,
              url:
                d.url.split('#')[0] +
                (d.format === 'pdf' ? '#page=' + d.page : ''),
              page: d.page,
            },
          ])
        ).values(),
      ]
        .reverse()
        .slice(0, 4)
    );
  }
  return cache.get(query);
}
function comment(p) {
  const d = p.designationDecoded;
  const unknown = d.unknown;
  if (custom[p.id]) return custom[p.id][0];
  if (p.mark.toUpperCase() === 'КГВБШВ')
    return d.status === 'reviewed'
      ? 'Подтверждено по разделу «Кабели силовые гибкие бронированные, без экрана» каталога «Электротехмаша». Раздел описывает исполнение ХЛ, а таблицы содержат указанный типоразмер.'
      : 'Сверьте размер и исполнение с таблицей «Электротехмаша» и документацией завода для конкретной марки.';
  if (unknown.includes('Э'))
    return 'Уточните, относится ли отдельная «Э» к общему экрану, экрану группы или повторяет экран, уже зашитый в марке. Сверьте позицию буквы в схеме маркировки этого завода.';
  if (unknown.includes('(ПУГНП)'))
    return 'Сверьте надпись на бирке. Запись в скобках может быть пометкой из прайса, а не заводским синонимом ПБВВ. Особенно важно проверить исполнение жил.';
  if (/^РК\s/iu.test(p.mark))
    return 'Нужно подтвердить весь номер исполнения, включая конечные буквы. Сверьте диаметр изоляции, центральную жилу, экран и оболочку по таблице именно этого РК.';
  if (/^ДП[ДОС]/iu.test(p.mark))
    return 'Найдите заводскую схему буквенно-цифрового кода целиком. Количество волокон, тип волокна и механические параметры могут зависеть от изготовителя.';
  if (
    d.warnings.some(
      (w) =>
        w.includes('индекс HF') ||
        w.includes('Индекс HF') ||
        w.includes('исполнения HF')
    )
  )
    return 'Сверьте маркировку с биркой и найдите лист на точное HF-исполнение. Нужны материалы изоляции и оболочки, а для FRHF также конструкция огнестойкого барьера.';
  if (d.warnings.some((w) => w.includes('Сложная конфигурация')))
    return 'Разбейте размерную запись на группы вокруг «+». Для каждой группы проверьте по схеме количество, сечение или диаметр и назначение жил. Сохраните исходную запись рядом.';
  if (
    d.warnings.some(
      (w) => w.includes('размер') || w.includes('Размер') || w.includes('жил')
    )
  )
    return 'Сверьте число жил или пар и единицы последнего числа по заводской таблице для этого исполнения. При расхождении проверьте маркировку на кабеле.';
  if (unknown.length)
    return (
      'Найдите в заводской схеме значение ' +
      unknown.map((s) => '«' + s + '»').join(', ') +
      '. Уточните, входит ли это в марку или добавлено в прайс как примечание. В правке укажите страницу и подтверждённое значение.'
    );
  return 'Заводской источник подтверждает назначение. Нужны схема конструкции и таблица типоразмеров для этого обозначения.';
}
const grouped = new Map();
for (const p of [...pending, ...resolved]) {
  const d = p.designationDecoded;
  const name = p.sourceName || p.name;
  const mask = name.replace(sizes, '◊');
  const key = [
    d.familyRecordId || d.family,
    normalize(p.mark),
    normalize(mask),
    (p.attributes || []).map(normalize).sort().join('|'),
  ].join('::');
  const entry = grouped.get(key) || {
    id: key,
    title: d.family || p.mark,
    execution: mask.replaceAll('◊', '').replace(/\s+/gu, ' ').trim(),
    rows: [],
  };
  const extra = custom[p.id];
  entry.rows.push({
    id: p.id,
    sku: p.sku,
    name,
    dimensions: name.match(sizes) || [],
    unknown: d.unknown,
    warnings: d.warnings,
    tokens: d.tokens,
    description: d.description,
    sources: [
      ...d.sources,
      ...(extra?.[1] ? [{ title: extra[2], url: extra[1] }] : []),
    ],
    comment: comment(p),
    resolved: d.status === 'reviewed',
  });
  grouped.set(key, entry);
}
for (const group of grouped.values()) {
  group.candidates = candidates(group.title);
  group.resolved = group.rows.every((row) => row.resolved);
}
db.close();
const groups = [...grouped.values()].sort(
  (a, b) =>
    b.rows.length - a.rows.length || a.title.localeCompare(b.title, 'ru')
);
const template = await fs.readFile(
  new URL('index.template.html', here),
  'utf8'
);
await fs.mkdir(new URL('./', out), { recursive: true });
await fs.writeFile(
  out,
  template.replace('/*__DATA__*/', () =>
    JSON.stringify({
      groups,
      total: pending.length,
      resolvedCount: resolved.length,
      revision: pending[0]?.designationDecoded.knowledgeRevision,
    }).replaceAll('<', '\\u003c')
  )
);
console.log(
  `${pending.length} карточек, ${groups.length} групп: ${fileURLToPath(out)}`
);
