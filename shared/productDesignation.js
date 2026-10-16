import { findCableSpecification } from '../scripts/lib/cableSpecification.js';
import {
  PRODUCT_DESIGNATION_FAMILIES,
  DESIGNATION_SOURCES,
  DESIGNATION_KNOWLEDGE_REVISION,
} from './productDesignationReference.js';

const clean = (value) => String(value || '').trim();
const normalize = (value) =>
  clean(value).toUpperCase().replace(/\s+/gu, '').replace(/Ё/gu, 'Е');
const number = (value) => Number(value).toLocaleString('ru-RU');
const indexKey = (value) => normalize(value).replace(/-/gu, '');
const pluralRules = new Intl.PluralRules('ru');
const counted = (value, forms) =>
  `${number(value)} ${forms[pluralRules.select(Number(value))] || forms.many}`;
const COLORS = {
  бел: 'белый',
  белый: 'белый',
  черн: 'чёрный',
  черный: 'чёрный',
  чёрный: 'чёрный',
  син: 'синий',
  синий: 'синий',
  голубой: 'голубой',
  красн: 'красный',
  красный: 'красный',
  зел: 'зелёный',
  зеленый: 'зелёный',
  корич: 'коричневый',
  коричн: 'коричневый',
  коричневый: 'коричневый',
  сер: 'серый',
  серый: 'серый',
  желт: 'жёлтый',
  желтый: 'жёлтый',
  оранж: 'оранжевый',
  оранжевый: 'оранжевый',
  фиол: 'фиолетовый',
  фиолетовый: 'фиолетовый',
  розов: 'розовый',
  розовый: 'розовый',
  'ж/з': 'жёлто-зелёный',
};
const families = [...PRODUCT_DESIGNATION_FAMILIES].sort(
  (a, b) => b.mark.length - a.mark.length
);
const firePattern =
  /^НГ(?:\(([АБВГДСA-D])\))?(?:-?(FR)?-?(LS|HF))?(?:-?LTX)?(?:-?ХЛ)?$/u;

function decodeIndex(value) {
  const code = normalize(value).replace(/^-/u, '');
  const fire = code.match(firePattern);
  if (fire) {
    const text = [
      fire[1]
        ? `Не распространяет горение при групповой прокладке по категории ${fire[1]}`
        : 'Индекс нераспространения горения; категория не указана',
    ];
    if (fire[2]) text.push('огнестойкое исполнение');
    if (fire[3] === 'LS') text.push('пониженное дымо- и газовыделение');
    if (fire[3] === 'HF') text.push('полимерные материалы без галогенов');
    if (code.includes('LTX')) text.push('низкая токсичность продуктов горения');
    if (code.endsWith('ХЛ')) text.push('холодостойкое исполнение');
    return {
      code: clean(value),
      text: text.join('; '),
      source: DESIGNATION_SOURCES.hka,
    };
  }
  const indexes = {
    ХЛ: 'Холодостойкое исполнение; диапазон температур определяется документацией изделия',
    УФ: 'Исполнение, стойкое к ультрафиолетовому излучению',
    ГОСТ: 'Указано изготовление по ГОСТ; номер стандарта в этом индексе отсутствует',
    ТУ: 'Указано изготовление по техническим условиям; нужен номер ТУ',
    J: 'С защитной жилой зелёно-жёлтого цвета',
    O: 'Без защитной жилы зелёно-жёлтого цвета',
    PVC: 'Поливинилхлорид (ПВХ)',
    LSZH: 'Низкое дымовыделение, материалы без галогенов',
    AWG: 'Американская система калибров проводов; число AWG не является сечением в мм²',
  };
  if (indexes[code])
    return {
      code: clean(value),
      text: indexes[code],
      source: ['J', 'O'].includes(code)
        ? DESIGNATION_SOURCES.lappNyy
        : DESIGNATION_SOURCES.hka,
    };
  return null;
}

function resolveFamily(product) {
  let mark = normalize(product.mark);
  // Единственная явная смешанная запись NYМ: последняя буква кириллическая.
  if (mark === 'NYМ') mark = 'NYM';
  const sourceMark = normalize(clean(product.sourceName).split(/\s+/u)[0]);
  // Recover only a longer literal designation written in the original price.
  // Arbitrary matching inside a product title is intentionally excluded.
  const marks =
    sourceMark.startsWith(mark) && sourceMark.length > mark.length
      ? [sourceMark, mark]
      : [mark];
  const brand = normalize(product.catalogBrand || product.brand);
  const explicitFireIndexes = [
    ...(product.attributes || []).filter((value) =>
      firePattern.test(normalize(value))
    ),
    ...clean(product.sourceName).matchAll(
      /нг\s*(?:\([АБВГДСA-D]\))?(?:-?(?:FR)?-?(?:LS|HF))?(?:-?LTx)?(?:-?ХЛ)?/giu
    ),
  ].map((value) => normalize(Array.isArray(value) ? value[0] : value));
  for (const family of families) {
    if (
      family.allowedFirePattern &&
      explicitFireIndexes.some(
        (value) => !new RegExp(family.allowedFirePattern, 'u').test(value)
      )
    )
      continue;
    if (
      family.brand &&
      brand !== normalize(family.brand) &&
      !normalize(product.sourceName).startsWith(normalize(family.brand))
    )
      continue;
    const keys = [family.mark, ...(family.aliases || [])].map(normalize);
    for (const key of keys)
      for (const candidate of marks) {
        if (candidate === key) return { family, index: '' };
        if (candidate.startsWith(key)) {
          const index = candidate.slice(key.length).replace(/^-/u, '');
          if (
            candidate.startsWith(`${key}-`) &&
            /^\d+$/u.test(index) &&
            family.voltageSuffixes?.includes(Number(index))
          )
            return { family, index: '', ratedVoltage: Number(index) };
          if (family.indexes?.[index]) return { family, index };
          const permitted =
            !family.allowedFirePattern ||
            new RegExp(family.allowedFirePattern, 'u').test(index);
          if (permitted && (firePattern.test(index) || index === 'ХЛ'))
            return { family, index };
        }
      }
  }
  const lexicalMark = clean(product.mark)
    .toUpperCase()
    .replace(/\s*\/\s*/gu, '/');
  const lan = lexicalMark.match(
    /(?:^|[\s-])((?:U|F|S|SF)\/(?:UTP|FTP)|UTP|FTP)(?=$|[\s.(\d-])/u
  );
  if (lan) {
    const shields = {
      'U/UTP': 'Общий экран и экраны отдельных пар отсутствуют',
      UTP: 'Неэкранированная витая пара',
      'F/UTP': 'Общий экран из фольги; отдельные пары без экранов',
      FTP: 'Обозначение экранированной витой пары; конструкцию экрана уточняют по паспорту',
      'S/UTP': 'Общий экран в виде оплётки; отдельные пары без экранов',
      'SF/UTP': 'Общий экран из фольги и оплётки; отдельные пары без экранов',
      'S/FTP': 'Общая экранирующая оплётка и фольговые экраны каждой пары',
      'F/FTP': 'Общий фольговый экран и фольговые экраны каждой пары',
      'U/FTP': 'Без общего экрана; каждая пара в фольговом экране',
      'SF/FTP': 'Общий экран из фольги и оплётки; пары в фольговых экранах',
    };
    const type = lan[1];
    const category = mark.match(
      /(?:CAT\.?|КАТ\.?|КАТЕГОРИЯ|UTP-)([3-8](?:[EAЕА])?)/u
    );
    const tokens = [[type, shields[type]]];
    if (category)
      tokens.push([
        category[0],
        `Категория кабеля ${category[1]}; не является числом жил или сечением`,
      ]);
    return {
      family: {
        mark: type,
        description:
          'Сетевой кабель витой пары. Конструкция экрана определяется обозначением до и после косой черты.',
        tokens,
        source: 'belden',
        dimension: 'lan',
      },
      index: '',
      partial: mark !== type ? clean(product.mark) : '',
    };
  }
  const coax = mark.match(/^РК(50|75)-/u);
  if (coax)
    return {
      family: {
        mark: `РК ${coax[1]}`,
        description:
          'Коаксиальный радиочастотный кабель. Цифры после значения сопротивления задают конструктивное исполнение.',
        tokens: [
          ['РК', 'Радиочастотный коаксиальный кабель'],
          [coax[1], `Волновое сопротивление ${coax[1]} Ом`],
        ],
        source: 'podolsk',
        dimension: 'coax',
      },
      index: '',
      partial: clean(product.mark),
    };
  const optical = lexicalMark.match(/^(ДПО|ДПЛ|ДПС|ДПД|ТОС)(?=$|[\s-])/u);
  if (optical) {
    const purposes = {
      ДПО: 'Оптический кабель для прокладки в трубы',
      ДПЛ: 'Оптический кабель с промежуточной оболочкой для кабельной канализации',
      ДПС: 'Оптический кабель для прокладки в грунт',
      ДПД: 'Оптический кабель для прокладки в грунт',
      ТОС: 'Лёгкий оптический кабель для прокладки в грунт',
    };
    return {
      family: {
        mark: optical[1],
        description:
          purposes[optical[1]] +
          '. Параметры волокна, силовых элементов и оболочки задаются полным исполнением.',
        tokens: [[optical[1], purposes[optical[1]]]],
        source:
          optical[1] === 'ДПО' || optical[1] === 'ДПЛ' ? 'incabTypes' : 'incab',
        dimension: 'optical',
      },
      index: '',
      partial: clean(product.mark),
    };
  }
  return { family: null, index: '' };
}

function sourceFor(family) {
  if (!family) return null;
  const source =
    typeof family.source === 'string'
      ? DESIGNATION_SOURCES[family.source]
      : family.source;
  const url = source.url.includes('/1_KHKA_obshchiy_katalog.pdf')
    ? DESIGNATION_SOURCES.hka.url
    : source.url;
  return {
    ...source,
    url: url + (family.page ? `#page=${family.page}` : ''),
  };
}

function sizeTokens(product, family, designation) {
  const spec = findCableSpecification(designation);
  const rows = [];
  const warnings = [];
  if (spec?.warnings.length || product.parsingWarnings?.length) {
    warnings.push(
      'Запись размеров неоднозначна. Числовую конфигурацию необходимо сверить с паспортом изделия.'
    );
    return { rows, warnings };
  }
  if (/AWG/iu.test(designation)) {
    const awg = designation.match(/(\d+)\s*AWG|AWG\s*(\d+)/iu);
    if (awg)
      rows.push({
        code: awg[0],
        text: `Калибр проводника ${awg[1] || awg[2]} AWG; это не сечение в мм²`,
      });
    return { rows, warnings };
  }
  if (!family || !['section', 'diameter'].includes(family.dimension)) {
    if (spec)
      rows.push({
        code: designation.slice(spec.index, spec.index + spec.length),
        text: 'Конфигурация в исходном обозначении; единицы и назначение чисел уточняются по документации этой марки',
      });
    return { rows, warnings };
  }
  const cores = spec?.cores ?? product.cores;
  const section = spec?.crossSection ?? product.crossSection;
  const group = spec?.groupCores ?? product.groupCores;
  const configuration = product.conductorConfiguration;
  const simpleConfiguration =
    !configuration ||
    /^\d+\s*х\s*\(?\d+\s*х\s*\d+(?:[.,]\d+)?\)?$/iu.test(configuration) ||
    /^\d+х\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?$/u.test(configuration);
  if (
    cores > 0 &&
    section > 0 &&
    (simpleConfiguration || (spec && !spec.configuration))
  ) {
    const amount =
      group > 0
        ? `${counted(cores, { one: 'группа', few: 'группы', many: 'групп' })} по ${counted(group, { one: 'жила', few: 'жилы', many: 'жил' })}`
        : counted(cores, { one: 'жила', few: 'жилы', many: 'жил' });
    const measure =
      family.dimension === 'diameter'
        ? `диаметр жилы ${number(section)} мм`
        : `сечение каждой жилы ${number(section)} мм²`;
    rows.push({
      code: spec
        ? designation.slice(spec.index, spec.index + spec.length)
        : configuration || `${number(cores)}×${number(section)}`,
      text: `${amount}; ${measure}`,
    });
    const additionalCores = spec?.groundCores ?? product.groundCores;
    const additionalSection = spec?.groundSection ?? product.groundSection;
    if (additionalCores > 0 && additionalSection > 0)
      rows.push({
        code: `+${number(additionalCores)}×${number(additionalSection)}`,
        text: `Дополнительные жилы: ${number(additionalCores)} × ${number(additionalSection)} мм²; назначение определяется схемой изделия`,
      });
  } else if (
    ['section', 'diameter'].includes(family.dimension) &&
    !cores &&
    section > 0 &&
    !configuration
  ) {
    rows.push({
      code: `${number(section)} ${family.dimension === 'diameter' ? 'мм' : 'мм²'}`,
      text:
        family.dimension === 'diameter'
          ? 'Номинальный диаметр токопроводящей жилы'
          : 'Номинальное сечение токопроводящей жилы',
    });
  } else if (spec || configuration) {
    rows.push({
      code:
        configuration ||
        designation.slice(spec.index, spec.index + spec.length),
      text: 'Конфигурация жил и групп в исходном обозначении; дополнительные элементы требуют сверки с паспортом',
    });
  }
  if (product.screenCrossSection > 0)
    rows.push({
      code: `/${number(product.screenCrossSection)}`,
      text: `Сечение металлического экрана ${number(product.screenCrossSection)} мм²`,
    });
  if (product.concentricConductorCrossSection > 0 && family.concentricConductor)
    rows.push({
      code: `/${number(product.concentricConductorCrossSection)}`,
      text: `Сечение концентрического проводника ${number(product.concentricConductorCrossSection)} мм²; назначение определяется схемой изделия`,
    });
  if (product.voltage)
    rows.push({
      code: `${product.voltage} кВ`,
      text: 'Номинальное напряжение, указанное в обозначении позиции',
    });
  return { rows, warnings };
}

export function buildProductDesignation(product = {}) {
  const designation = clean(
    product.sourceName ||
      product.fullName ||
      product.title ||
      product.name ||
      product.mark
  );
  const { family, index, partial, ratedVoltage } = resolveFamily(product);
  const source = sourceFor(family);
  const tokens = (family?.tokens || []).map(([code, text]) => ({ code, text }));
  const sources = new Map(source ? [[source.url, source]] : []);
  const addSource = (item) => {
    if (
      ![...sources.values()].some(
        (existing) => existing.url.split('#')[0] === item.url.split('#')[0]
      )
    )
      sources.set(item.url, item);
  };
  const unknown = [];
  if (!family) unknown.push(clean(product.mark) || designation);
  if (partial) unknown.push(partial);
  const indexes = [
    ...new Set([...(product.attributes || []), ...(index ? [index] : [])]),
  ];
  for (const attribute of indexes) {
    const specific = family?.indexes?.[normalize(attribute).replace(/^-/u, '')];
    if (specific) {
      tokens.push({ code: clean(attribute), text: specific });
      continue;
    }
    const colorKey = clean(attribute)
      .toLowerCase()
      .replace(/^[()]|[().]$/gu, '');
    const color = COLORS[colorKey];
    if (color) {
      tokens.push({
        code: clean(attribute),
        text: `Цвет в исходной записи: ${color}`,
      });
      continue;
    }
    const decoded = decodeIndex(attribute);
    if (decoded) {
      tokens.push({ code: decoded.code, text: decoded.text });
      addSource(decoded.source);
    } else if (clean(attribute) && clean(attribute) !== '-')
      unknown.push(clean(attribute));
  }
  // Когда карточка приходит без attributes, считываем только ограниченные пожарные индексы.
  for (const match of designation.matchAll(
    /нг\s*(?:\([АБВГДСA-D]\))?(?:-?(?:FR)?-?(?:LS|HF))?(?:-?LTx)?(?:-?ХЛ)?/giu
  )) {
    if (tokens.some((token) => indexKey(token.code) === indexKey(match[0])))
      continue;
    const decoded = decodeIndex(match[0]);
    if (decoded) {
      tokens.push({ code: decoded.code, text: decoded.text });
      addSource(decoded.source);
    }
  }
  const size = sizeTokens(product, family, designation);
  if (ratedVoltage && !product.voltage)
    size.rows.push({
      code: `${ratedVoltage} кВ`,
      text: 'Номинальное напряжение из подтверждённого суффикса марки',
    });
  size.warnings.push(...(family?.warnings || []));
  let description =
    family?.description ||
    'Для этой марки пока не найдена подтверждённая расшифровка. Ниже приведены распознанные элементы исходного обозначения.';
  if (
    family &&
    /HF/iu.test(tokens.map((token) => token.code).join(' ')) &&
    tokens.some((token) => /ПВХ/iu.test(token.text))
  ) {
    if (family.hfMaterialsConfirmed) {
      description = `Монтажный кабель семейства ${family.mark} с изоляцией и оболочкой из полимерных композиций без галогенов.`;
      for (const token of tokens) {
        if (!/ПВХ/iu.test(token.text)) continue;
        token.text =
          /изоляц/iu.test(token.text) && /оболоч|шланг/iu.test(token.text)
            ? 'Изоляция и оболочка из полимерных композиций без галогенов'
            : /оболоч|шланг/iu.test(token.text)
              ? 'Защитная оболочка из полимерной композиции без галогенов'
              : 'Изоляция из полимерной композиции без галогенов';
      }
    } else {
      description = `Семейство ${family.mark}. В позиции указан индекс HF; материалы изоляции и оболочки этого исполнения необходимо сверить по его ГОСТ/ТУ.`;
      for (const token of tokens)
        if (/ПВХ/iu.test(token.text))
          token.text = `В базовом обозначении: ${token.text}. Материал исполнения HF определяется его документацией.`;
      size.warnings.push(
        'Индекс HF изменяет требования к материалам. Базовое описание марки не подтверждает материал этого исполнения.'
      );
    }
  }
  tokens.push(...size.rows);
  return {
    designation,
    knowledgeRevision: DESIGNATION_KNOWLEDGE_REVISION,
    familyRecordId: family?.id || null,
    evidence: family?.evidence || null,
    status: !family
      ? 'unresolved'
      : unknown.length || size.warnings.length
        ? 'partial'
        : 'reviewed',
    family: family?.mark || null,
    description,
    tokens,
    sources: [...sources.values()],
    unknown: [...new Set(unknown)],
    warnings: size.warnings,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent(designation + ' кабель расшифровка производитель')}`,
  };
}
