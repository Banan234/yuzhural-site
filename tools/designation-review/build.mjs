import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { loadCatalogProducts } from '../../lib/catalog.js';
import { compactDesignationText } from '../../scripts/syncDesignationManufacturerCorpus.js';
import { reviewProblems } from './problems.mjs';

const here = new URL('./', import.meta.url);
const root = new URL('../../', here);
const out = new URL('outputs/designation-review/index.html', root);
const products = await loadCatalogProducts();
const pending = products.filter(
  (p) => p.designationDecoded?.status === 'partial'
);
const researchedIds = new Set([
  2224, 3365, 3371, 3372, 3373,
  3322, 3806, 3808, 3972, 3973, 4283, 4413, 4830, 4831, 4832, 4833, 4834, 7553,
  5531, 7554, 7555, 7556, 7557, 7558, 7560, 7561,
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
  3361: [
    "Надпись переписана с оболочки целиком. В каталогах подтверждается семейство ДПД, но роль «0,4 М» не установлена: это нельзя автоматически объявить числом волокон, нагрузкой или метражом. Нужен источник на полную запись; остальные цифровые оптические марки разобраны по заводской схеме Оптен.",
  ],
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
const ivkzFrls = 'https://ivkz.ru/products/index?кабель=КПСнг(А)-FRLS';
const sizeComparisons = {
  3806: [
    '«Паритет» маркирует однопроволочный КСРВ диаметром жилы в мм. Запись 0,20 совпадает с сечением в его таблице, где диаметр равен 0,50 мм. У Ивановского кабельного завода размер 1×2×0,20 мм² есть под другой маркой КПС. Единица для исходной надписи КСРВ пока не подтверждена.',
    ivkzFrls,
    'Ивановский кабельный завод — КПСнг(А)-FRLS 1×2×0,20 мм²',
  ],
  3808: [
    '«Паритет» маркирует однопроволочный КСРВ диаметром жилы в мм. Сечению 1,5 мм² соответствует маркировка диаметром 1,38 мм. У Ивановского кабельного завода 1×2×1,5 мм² есть под другой маркой КПС. Единица для исходной надписи КСРВ пока не подтверждена.',
    ivkzFrls,
    'Ивановский кабельный завод — КПСнг(А)-FRLS 1×2×1,5 мм²',
  ],
  3322: [
    '«Паритет» указывает в маркировке однопроволочного КСРЭВ диаметр. Сечению 0,75 мм² соответствует диаметр 0,97 мм. У «СПКБ Техно» размер 0,75 мм² есть в другой экранированной серии КПСЭнг(А)-FRLS. Единица исходной надписи остаётся открытой.',
    'https://spkb.ru/catalog/fire-resistant-cables-firesafety-systems-300v/kpseng-a-frls/',
    'СПКБ Техно — КПСЭнг(А)-FRLS',
  ],
  4205: [
    '«Кубсвязькабель» выпускает ВСЭК на пять экранированных пар по ТУ16.К18-013-91. Указано сечение жилы 0,35 мм². Значение 0,5 из прайса этот каталог не подтверждает.',
    'https://www.kske.ru/catalog/vsek',
    'Кубсвязькабель — ВСЭК на 5 и 10 пар',
  ],
  3569: [
    'У Ивановского кабельного завода есть КПСнг(А)-FRLS 1×2×0,75 мм². «СегментЭНЕРГО» указывает точную запись 1×2×0,78, но для экранированной бронированной марки КОПСЭГКнг(А)-FRLS. Для КПС размер 0,78 остаётся открытым.',
    'https://segmentenergo.ru/catalog/detail.php?ID=56281',
    'СегментЭНЕРГО — КОПСЭГКнг(А)-FRLS 1×2×0,78',
    [{ title: 'Ивановский кабельный завод — КПСнг(А)-FRLS', url: ivkzFrls }],
  ],
  3607: [
    '«СПКБ Техно» выпускает КПСВВнг(А)-LS и задаёт последний размер как сечение жилы. В заводском ряду есть 0,50 и 0,75 мм². Запись 0,8 в строке прайса требует сверки по единице измерения.',
    'https://spkb.ru/catalog/Cables-communication-300V/kpsvvng-a-ls/',
    'СПКБ Техно — КПСВВнг(А)-LS',
  ],
  7131: [
    'У «Спецресурса» есть КПСВЭВнг(А)-LSLTx 1×2×1,5 мм², артикул 4599. «СПКБ Техно» также указывает размер в мм². Число 1,38 может быть диаметром жилы, соответствующим номиналу 1,5 мм². Проверьте единицу на бирке.',
    'https://spkb.ru/catalog/Cables-communication-300V/kpsvevng-a-lsltx/',
    'СПКБ Техно — КПСВЭВнг(А)-LSLTx',
    [
      {
        title: 'Спецресурс — КПСВЭВнг(А)-LSLTx',
        url: 'https://resurscable.com/catalog/kpsvevng-a-lsltx/',
      },
    ],
  ],
  4283: [
    '«Спецресурс» выпускает КСВВнг(А)-LS и приводит парные типоразмеры, в том числе 1×2×0,5. Точной строки 1×2×1 в его каталоге нет. У «Паритета» сечению 1,0 мм² соответствует диаметр 1,13 мм, а его карточка 1×2×1,0 мм² относится к гибкой марке КСВВГ.',
    'https://resurscable.com/catalog/ksvvng-a-ls/',
    'Спецресурс — КСВВнг(А)-LS',
    [
      {
        title: 'Паритет — гибкий КСВВГнг(А)-LS 1×2×1,0 мм²',
        url: 'https://paritet.su/catalog/gibkie_ksvvg_ksvevgng_a_ls/ksvvgng_a_ls_1kh2kh1_00_mm_kv/?printElement=Y',
      },
    ],
  ],
  4695: [
    'В каталоге «Интеркабель» близкий алюминиевый установочный провод АПВ 4 мм² одножильный. Для записи ПАВ 2×4 нужно уточнить, что означает «2» и правильно ли указана марка.',
    'https://interkabel.ua/wp-content/uploads/01_Ustanovochnye_provoda-1.pdf',
    'Интеркабель — установочные провода, АПВ 4 мм²',
  ],
  4830: [
    'ПАЛ 35 подтверждён по отраслевому каталогу «Уралкабеля» для ТУ 16-505.656-74. Число 35 в обозначении — сечение жилы в мм². Наружный диаметр провода приведён в отдельной колонке.',
    'https://files.stroyinf.ru/Data2/1/4293833/4293833116.pdf',
    'КПО 05.01.12-07, раздел 5.1.4 — Уралкабель, ПАЛ 35',
  ],
  5531: [
    'У «Сентека» есть двухжильный ПТВ с жилами ХА и ПВХ-изоляцией. В таблице 6 ХКА для однопроволочной жилы 1,13 мм — диаметр, а номинальное сечение — 1 мм². Нужна заводская привязка этой единицы к надписи ПТВ-ХА 2×1,13.',
    'https://sentek.ru/catalog/termoelektrodnye_i_kompensatsionnye_provoda_i_kabeli/ptv',
    'Сентек — двухжильный ПТВ, исполнение ХА',
    [
      {
        title: 'ХКА — термоэлектродные провода, таблица 6',
        url: 'https://www.holdcable.com/catalog/spravochnaya-informatsiya/1394887/',
      },
    ],
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
function comment(p, problems) {
  const d = p.designationDecoded;
  const unknown = d.unknown;
  if (p.id === 5531 && d.status === 'reviewed')
    return 'Для ПТВ-ХА 2×1,13 число 1,13 разобрано как диаметр однопроволочной жилы в мм по таблице 6 ХКА. В таблице этому диаметру соответствует номинальное сечение 1 мм².';
  if ([3322, 3806, 3808, 4283].includes(p.id) && d.status === 'reviewed')
    return 'Единица определена по заводской таблице и пояснению «Паритета» о записи диаметра и сечения на бирке и оболочке. Число в исходной маркировке сохранено.';
  if (p.id === 4413 && d.status === 'reviewed')
    return 'Запись «(А) ндг» разобрана как единое заводское исполнение ТППэп(А)-НДГ. «Сарансккабель» указывает безгалогенную оболочку и размер 10 пар с диаметром жилы 0,5 мм.';
  if (p.mark === 'ПБВВ' && d.status === 'reviewed')
    return 'ПБВВ и этот типоразмер подтверждены заводскими документами. При разборе применяется основное обозначение ПБВВ. Исходная пометка из прайса сохранена в строке.';
  if (custom[p.id]) return custom[p.id][0];
  if (p.mark.toUpperCase() === 'КГВБШВ')
    return d.status === 'reviewed'
      ? 'Подтверждено по разделу «Кабели силовые гибкие бронированные, без экрана» каталога «Электротехмаша». Раздел описывает исполнение ХЛ, а таблицы содержат указанный типоразмер.'
      : 'Сверьте размер и исполнение с таблицей «Электротехмаша» и документацией завода для конкретной марки.';
  if (problems.some((problem) => problem.url)) return '';
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
    execution:
      p.mark === 'ПБВВ'
        ? p.mark
        : mask.replaceAll('◊', '').replace(/\s+/gu, ' ').trim(),
    rows: [],
  };
  const extra = custom[p.id];
  const comparison = d.status === 'reviewed' ? null : sizeComparisons[p.id];
  const problems = reviewProblems(p, name);
  entry.rows.push({
    id: p.id,
    sku: p.sku,
    name,
    dimensions: name.match(sizes) || [],
    unknown: d.unknown,
    warnings: d.warnings,
    problems,
    tokens: d.tokens,
    description: d.description,
    sources: [
      ...d.sources,
      ...(extra?.[1] ? [{ title: extra[2], url: extra[1] }] : []),
      ...(comparison
        ? [
            { title: comparison[2], url: comparison[1] },
            ...(comparison[3] || []),
          ]
        : []),
    ],
    comment: [comparison?.[0], comment(p, problems)].filter(Boolean).join(' '),
    resolved: d.status === 'reviewed',
  });
  grouped.set(key, entry);
}
for (const group of grouped.values()) {
  group.candidates = candidates(group.title);
  group.resolved = group.rows.every((row) => row.resolved);
  const problems = new Map();
  for (const row of group.rows) {
    for (const problem of row.problems) {
      const entry = problems.get(problem.id) || { ...problem, rowIds: [] };
      if (!entry.rowIds.includes(row.id)) entry.rowIds.push(row.id);
      problems.set(problem.id, entry);
    }
  }
  group.problems = [...problems.values()];
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
