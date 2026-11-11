import { checkDesignationConstruction } from './designationConstructionEvidence.js';
import { explainLanNotation } from './designationLanNotation.js';
import { findCableSpecification } from '../scripts/lib/cableSpecification.js';
import { selectManufacturerTexts } from './manufacturerTexts.js';
import {
  stripLegacyCableAlias,
  stripLegacyCableAliasAttributes,
} from './productTitle.js';
import {
  PRODUCT_DESIGNATION_FAMILIES,
  DESIGNATION_SOURCES,
  DESIGNATION_KNOWLEDGE_REVISION,
  DESIGNATION_DOCUMENTS,
  DESIGNATION_CROSS_CHECKS,
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
  сине: 'синий',
  голубой: 'голубой',
  красн: 'красный',
  красный: 'красный',
  зел: 'зелёный',
  зелен: 'зелёный',
  зеленый: 'зелёный',
  корич: 'коричневый',
  кор: 'коричневый',
  коричн: 'коричневый',
  коричневый: 'коричневый',
  сер: 'серый',
  серый: 'серый',
  бежевый: 'бежевый',
  желт: 'жёлтый',
  желтый: 'жёлтый',
  жёлт: 'жёлтый',
  жёлтый: 'жёлтый',
  жел: 'жёлтый',
  зелёный: 'зелёный',
  сирень: 'сиреневый',
  сиреневый: 'сиреневый',
  роз: 'розовый',
  бело: 'белый',
  оранж: 'оранжевый',
  оранжевый: 'оранжевый',
  фиол: 'фиолетовый',
  фиолет: 'фиолетовый',
  фиолетовый: 'фиолетовый',
  розов: 'розовый',
  розовый: 'розовый',
  голуб: 'голубой',
  гол: 'голубой',
  чёрн: 'чёрный',
  'ж/з': 'жёлто-зелёный',
};

function sourceColor(value) {
  const key = clean(value)
    .toLowerCase()
    .replace(/^[().]+|[().]+$/gu, '');
  if (COLORS[key]) return COLORS[key];
  const parts = key.split(/[/-]/u);
  if (parts.length === 2 && parts.every((part) => COLORS[part]))
    return parts.map((part) => COLORS[part]).join(' / ');
  return null;
}
const families = [...PRODUCT_DESIGNATION_FAMILIES].sort(
  (a, b) => b.mark.length - a.mark.length
);
const firePattern =
  /^НГ(?:\(([АБВГДСA-D])\))?(?:-?(FR)?-?(LS|HF))?(?:-?LTX)?(?:-?ХЛ)?$/u;
const priceNotation = {
  ВВГ: { 'НГ(А)НД': ['НД', 'Низкое газовыделение'] },
  ПВ1: { НДГ: ['НДГ', 'Пониженное дымо- и газовыделение'] },
};

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

// A manufacturer's constructor is an ordered grammar. An attribute is accepted
// only when every character is consumed; arbitrary letter splitting is unsafe.
function decodeConstructor(value, grammar) {
  if (!grammar) return null;
  let code = normalize(value);
  const tail = grammar.tails?.find((t) => code.endsWith(t.code));
  if (tail) code = code.slice(0, -tail.code.length);
  const walk = (stage, rest, texts) => {
    if (stage === grammar.stages.length) return rest ? null : texts;
    const item = grammar.stages[stage];
    for (const [key, text] of Object.entries(item.values).sort(
      (a, b) => b[0].length - a[0].length
    )) {
      if (!rest.startsWith(key)) continue;
      const result = walk(stage + 1, rest.slice(key.length), [...texts, text]);
      if (result) return result;
    }
    return item.optional ? walk(stage + 1, rest, texts) : null;
  };
  const texts = walk(0, code, []);
  return texts?.length
    ? [...texts, ...(tail ? [tail.text] : [])].join('; ')
    : null;
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
  ]
    .map((value) => normalize(Array.isArray(value) ? value[0] : value))
    .filter(
      (value) =>
        !(
          value === 'НГ' &&
          (product.attributes || []).some((attribute) => {
            const code = normalize(attribute).replace(/-/gu, '');
            return (
              /^НГ\([АA]\)HF$/u.test(code) &&
              /нг\s+\d+\s*[xх×]\s*2\s*[xх×]\s*[\d.,]+\s+\([АA]\)\s*HF/iu.test(
                clean(product.sourceName)
              )
            );
          })
        )
    );
  for (const family of families) {
    if (
      family.requiredSourcePattern &&
      !new RegExp(family.requiredSourcePattern, 'u').test(
        clean(product.sourceName)
      )
    )
      continue;
    if (
      (family.caseSensitiveMark || family.caseSensitiveStem) &&
      ![clean(product.mark), clean(product.sourceName).split(/\s+/u)[0]].some(
        (value) =>
          family.caseSensitiveStem
            ? value.startsWith(family.caseSensitiveStem)
            : value === family.mark ||
              value.startsWith(family.mark + '-') ||
              (value.startsWith(family.mark) &&
                firePattern.test(normalize(value.slice(family.mark.length))))
      )
    )
      continue;
    const variant = family.attributeVariant;
    const variantMatched =
      variant &&
      mark === normalize(variant.base) &&
      (product.attributes || []).some(
        (a) => normalize(a) === variant.attribute
      );
    if (
      family.allowedFirePattern &&
      explicitFireIndexes.some(
        (value) => !new RegExp(family.allowedFirePattern, 'u').test(value)
      )
    )
      continue;
    if (
      family.requiredFirePattern &&
      !explicitFireIndexes.some((value) =>
        new RegExp(family.requiredFirePattern, 'u').test(value)
      )
    )
      continue;
    if (
      family.brand &&
      brand !== normalize(family.brand) &&
      !normalize(product.sourceName).startsWith(normalize(family.brand))
    )
      continue;
    if (
      family.sourceNamePattern &&
      (family.requiredSourcePattern ||
        clean(product.mark).split(/\s+/u)[0] ===
          clean(product.sourceName).split(/\s+/u)[0]) &&
      new RegExp(family.sourceNamePattern, 'u').test(clean(product.sourceName))
    )
      return { family, index: '' };
    const keys = [family.mark, ...(family.aliases || [])].map(normalize);
    if (variantMatched)
      return { family, index: '', consumedAttribute: variant.attribute };
    for (const key of keys)
      for (const candidate of marks) {
        if (candidate === key) {
          // A parser may have separated an unknown suffix from the full mark.
          // Never publish the base construction for that different full type.
          if (candidate === mark && marks.length > 1) continue;
          return { family, index: '' };
        }
        if (candidate.startsWith(key)) {
          const index = candidate.slice(key.length).replace(/^-/u, '');
          if (
            candidate.startsWith(`${key}-`) &&
            /^\d+$/u.test(index) &&
            family.voltageSuffixes?.includes(Number(index))
          )
            return { family, index: '', ratedVoltage: Number(index) };
          if (family.indexes?.[index]) return { family, index };
          for (const modifier of Object.keys(family.indexes || {}).sort(
            (a, b) => b.length - a.length
          )) {
            if (!index.startsWith(modifier)) continue;
            const tail = index.slice(modifier.length).replace(/^-/, '');
            if (
              (firePattern.test(tail) || tail === 'ХЛ') &&
              (!family.allowedFirePattern ||
                new RegExp(family.allowedFirePattern, 'u').test(tail))
            )
              return { family, index: modifier };
          }
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
    const tokens = [[type, shields[type]]];
    const remainder = lexicalMark
      .slice(lan.index + lan[0].length)
      .replace(/^\s*-\s*([3-8](?:[EAЕА])?)(?=$|\s)/u, ' Cat$1')
      .replace(/^\s*([3-8][EAЕА])(?=$|\s)/u, ' Cat$1');
    const notation = explainLanNotation(remainder);
    tokens.push(...notation.tokens.map(({ code, text }) => [code, text]));
    return {
      family: {
        mark: type,
        description:
          'Сетевой кабель витой пары. Конструкция экрана определяется обозначением до и после косой черты.',
        tokens,
        source: 'belden',
        notationSources: notation.sources,
        dimension: 'lan',
      },
      index: '',
      partial: notation.unknown,
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
  if (family?.dimension === 'optical' && family.opticalConfiguration) {
    const config = family.opticalConfiguration;
    const p = new RegExp(family.sourceNamePattern, 'u').exec(
      designation
    )?.groups;
    const fibers = Number(p?.fibers);
    const modules = Number(p?.modules || (config.centralModule ? 1 : 0));
    const perModule = Number(
      p?.perModule || (config.centralModule ? fibers : 0)
    );
    const load = Number(p?.load?.replace(',', '.'));
    const fiberType = config.fiberTypes?.[p?.fiber?.toUpperCase()];
    if (
      !p ||
      !fiberType ||
      !Number.isInteger(fibers) ||
      fibers < 1 ||
      fibers > config.maximumFibers ||
      !Number.isInteger(modules) ||
      modules < 1 ||
      !Number.isInteger(perModule) ||
      perModule < (config.minimumFibersPerModule || 1) ||
      (config.elementsIncludeFillers
        ? fibers > modules * perModule
        : modules * perModule !== fibers) ||
      modules > config.maximumModules ||
      perModule > config.maximumFibersPerModule ||
      (config.centralModule && modules !== 1) ||
      !(config.loads?.includes(load) ||
        (config.loadRange && load >= config.loadRange[0] && load <= config.loadRange[1]))
    )
      return {
        rows: [],
        warnings: [
          'Тип волокна, модульная структура или растягивающая нагрузка не соответствуют подтверждённому заводскому исполнению.',
        ],
      };
    return {
      rows: [
        {
          code: p.fibers + p.fiber,
          text: `${fibers} оптических волокон; ${fiberType}`,
        },
        {
          code: `${modules}×${perModule}`,
          text: config.elementsIncludeFillers
            ? `${modules} элементов в повиве сердечника; ${perModule} волокон в оптическом модуле; часть элементов может быть заполнительными корделями`
            : `${modules} оптических модулей, по ${perModule} волокон; это не количество медных жил и не сечение`,
        },
        {
          code: `${number(load)} кН`,
          text: `Максимально допустимая растягивающая нагрузка ${number(load)} кН`,
        },
      ],
      warnings: [],
    };
  }
  if (family?.dimension === 'heating' && family.heatingConfiguration) {
    const c = family.heatingConfiguration;
    const matches =
      family.sourceNamePattern &&
      new RegExp(family.sourceNamePattern, 'u').test(designation);
    if (
      matches &&
      c.type === 'series-resistance' &&
      c.resistancePerKilometre > 0 &&
      Number.isFinite(c.referenceTemperature) &&
      c.workingVoltages?.length &&
      c.workingVoltages.every((v) => v > 0)
    )
      return {
        rows: [
          {
            code: 'Сопротивление',
            text: `Номинальное сопротивление ${number(c.resistancePerKilometre)} Ом/км при ${number(c.referenceTemperature)} °C`,
          },
          {
            code: 'Напряжение',
            text: `Выпускается для ${c.workingVoltages.map(number).join(' или ')} В переменного тока; схема и длина секции определяются проектом`,
          },
        ],
        warnings: [],
      };
    if (
      !matches ||
      !(c.powerPerMetre > 0) ||
      !(c.voltage > 0) ||
      !Number.isFinite(c.referenceTemperature)
    )
      return {
        rows: [],
        warnings: [
          'Запись не соответствует подтверждённой заводской модели нагревательного кабеля.',
        ],
      };
    return {
      rows: [
        {
          code: 'Мощность',
          text: `Номинальная линейная мощность ${number(c.powerPerMetre)} Вт/м при ${number(c.referenceTemperature)} °C`,
        },
        {
          code: '2',
          text: `Номинальное напряжение ${number(c.voltage)} В переменного тока`,
        },
      ],
      warnings: [],
    };
  }
  if (family?.dimension === 'model' && family.modelConfiguration) {
    const config = family.modelConfiguration;
    const exactModel =
      family.sourceNamePattern &&
      new RegExp(family.sourceNamePattern, 'u').test(designation);
    const suppliedAwg = designation.match(/(?:AWG\s*(\d+)|(\d+)\s*AWG)/iu);
    const conflicting =
      (family.sourceNamePattern && !exactModel) ||
      (/\d+\s*[xх×]\s*\d/iu.test(designation) && !exactModel) ||
      (suppliedAwg &&
        Number(suppliedAwg[1] || suppliedAwg[2]) !== config.awg) ||
      (config.section &&
        product.crossSection != null &&
        Number(product.crossSection) !== config.section);
    const complete =
      (config.pairs > 0 || config.cores > 0) &&
      ((Number.isInteger(config.awg) && config.awg > 0) ||
        (Number.isFinite(config.section) && config.section > 0));
    if (!complete || conflicting)
      return {
        rows: [],
        warnings: [
          'Размерная запись не соответствует документированной конструкции этой заводской модели.',
        ],
      };
    return {
      rows: [
        config.pairs
          ? { code: 'Пары', text: `Количество витых пар: ${config.pairs}` }
          : { code: 'Жилы', text: `Количество жил: ${config.cores}` },
        config.awg
          ? {
              code: 'AWG',
              text: `Калибр каждого проводника ${config.awg} AWG; это не сечение в мм²`,
            }
          : {
              code: 'Сечение',
              text: `Номинальное сечение каждой жилы ${number(config.section)} мм² по заводской таблице`,
            },
      ],
      warnings: [],
    };
  }
  if (family?.dimension === 'coax' && family.coaxConfiguration) {
    const c = family.coaxConfiguration;
    const complete =
      c.impedance > 0 &&
      c.insulationDiameter > 0 &&
      [
        'innerConductor',
        'insulation',
        'outerConductor',
        'sheath',
        'constructionCode',
      ].every((key) => typeof c[key] === 'string' && c[key].trim());
    return complete
      ? {
          rows: [
            {
              code: `${c.impedance} Ом`,
              text: `Номинальное волновое сопротивление ${number(c.impedance)} Ом`,
            },
            {
              code: `${c.insulationDiameter} мм`,
              text: `Диаметр по изоляции ${number(c.insulationDiameter)} мм; это не сечение жилы`,
            },
            {
              code: c.constructionCode,
              text: 'Индекс конкретной конструкции по заводскому техническому листу',
            },
          ],
          warnings: [],
        }
      : {
          rows: [],
          warnings: [
            'Полная конструкция коаксиального исполнения не подтверждена заводским источником.',
          ],
        };
  }
  const compound = family?.compoundSectionPattern
    ? new RegExp(family.compoundSectionPattern, 'u').exec(designation)?.groups
    : null;
  if (compound) {
    const areas = [compound.section1, compound.section2].map((value) =>
      Number(value.replace(',', '.'))
    );
    const amounts = [Number(compound.count1), Number(compound.count2)];
    if (
      (designation.match(/\+/gu) || []).length !== 1 ||
      amounts.some((amount) => !family.compoundCounts.includes(amount)) ||
      (family.compoundEqualCounts && amounts[0] !== amounts[1]) ||
      (family.compoundPairs &&
        !family.compoundPairs.some(
          (pair) => pair[0] === areas[0] && pair[1] === areas[1]
        )) ||
      areas.some((area) => !family.nominalSizes.includes(area))
    )
      return {
        rows: [],
        warnings: [
          'Комбинированная размерная запись не соответствует подтверждённому заводскому ряду.',
        ],
      };
    return {
      rows: areas.map((area, i) => ({
        code: `${amounts[i]}×${i ? compound.section2 : compound.section1}`,
        text: `Группа ${i + 1}: ${amounts[i]} жил; номинальное сечение каждой жилы ${number(area)} мм²`,
      })),
      warnings: [],
    };
  }
  const screened = family?.screenedSizePattern
    ? new RegExp(family.screenedSizePattern, 'u').exec(designation)?.groups
    : null;
  if (screened) {
    const count = Number(screened.cores);
    const section = Number(screened.section.replace(',', '.'));
    const rule = family.screenedConfiguration;
    const maximum = rule?.maximumCountBySection?.[section];
    if (
      !maximum ||
      count < rule.minimumCount ||
      count > maximum ||
      (rule.allowedCounts && !rule.allowedCounts.includes(count))
    )
      return {
        rows: [],
        warnings: [
          'Экранированная конфигурация отсутствует в подтверждённом заводском ряду.',
        ],
      };
    return {
      rows: [
        {
          code: `${count}э×${screened.section}`,
          text: `${count} индивидуально экранированных жил; сечение каждой жилы ${number(section)} мм²`,
        },
      ],
      warnings: [],
    };
  }
  const grouped = family?.groupedSizePattern
    ? new RegExp(family.groupedSizePattern, 'u').exec(designation)?.groups
    : null;
  if (grouped) {
    const area = Number(grouped.section.replace(',', '.'));
    if (
      !(Number(grouped.groups) > 0) ||
      (family.groupLimits?.[grouped.cores] &&
        Number(grouped.groups) > family.groupLimits[grouped.cores]) ||
      (family.groupNominalMaximum?.[grouped.cores] &&
        area > family.groupNominalMaximum[grouped.cores]) ||
      (family.nominalSizes && !family.nominalSizes.includes(area))
    )
      return {
        rows: [],
        warnings: [
          'Сечение группированной конструкции отсутствует в подтверждённом заводском ряду.',
        ],
      };
    return {
      rows: [
        {
          code: `${grouped.groups}×(${grouped.cores}×${grouped.section}${grouped.material || ''})`,
          text: `${grouped.groups} групп по ${grouped.cores} жилы; сечение каждой жилы ${number(area)} мм²${grouped.material === 'м' ? '; «м» — нелужёные медные жилы' : ''}`,
        },
      ],
      warnings: [],
    };
  }
  const profile = family?.sourceNamePattern
    ? new RegExp(family.sourceNamePattern, 'u').exec(designation)?.groups
    : null;
  if (family?.sourceProfile === 'pairs-with-individual-drain') {
    const pairs = Number(profile?.pairs);
    if (!profile || !family.documentedPairCounts.includes(pairs))
      return {
        rows: [],
        warnings: [
          'Запись пар с контактным проводником не соответствует заводской таблице.',
        ],
      };
    return {
      rows: [
        {
          code: `${pairs}×(2+1)×0,5`,
          text: `${pairs} пар; в каждой паре две сигнальные жилы и один контактный проводник экрана; сечение сигнальной жилы 0,5 мм²`,
        },
      ],
      warnings: [],
    };
  }
  if (family?.sourceProfile === 'pairs-with-common-drain') {
    const pairs = Number(profile?.pairs);
    const section = Number(profile?.section?.replace(',', '.'));
    const drain = Number(profile?.drain?.replace(',', '.'));
    const config = family.pairDrainConfiguration;
    if (
      !config?.pairCounts?.includes(pairs) ||
      section !== config.section ||
      drain !== config.drainSection
    )
      return {
        rows: [],
        warnings: [
          'Количество пар, сечение или контактный проводник не соответствуют заводской таблице.',
        ],
      };
    return {
      rows: [
        { code: `${pairs}×2`, text: `${pairs} пар, по 2 жилы в каждой паре` },
        {
          code: 'Сечение',
          text: `Сечение каждой сигнальной жилы ${number(section)} мм²`,
        },
        {
          code: `+${number(drain)}`,
          text: `Общий контактный проводник экрана сечением ${number(drain)} мм²; это не дополнительная сигнальная пара`,
        },
      ],
      warnings: [],
    };
  }
  if (profile && family.sourceProfile === 'fixed-section-pairs') {
    const pairs = Number(profile.pairs);
    const section = family.fixedPairSection;
    if (
      !family.documentedPairCounts?.includes(pairs) ||
      !(section > 0) ||
      (profile.section && Number(profile.section.replace(',', '.')) !== section)
    )
      return {
        rows: [],
        warnings: ['Конфигурация отсутствует в заводской таблице этой марки.'],
      };
    return {
      rows: [
        { code: `${pairs}×2`, text: `${pairs} пар, по 2 жилы в каждой паре` },
        {
          code: 'Сечение',
          text: `Номинальное сечение каждой жилы ${number(section)} мм² по заводской таблице`,
        },
      ],
      warnings: [],
    };
  }
  if (
    profile &&
    family.sourceProfile === 'installation-wire-section-class-voltage'
  ) {
    const section = Number(profile.section.replace(',', '.'));
    const conductorClass =
      profile.leadClass || profile.attachedClass || profile.class;
    const voltage = Number(profile.leadVoltage || profile.voltage);
    if (
      !family.sizesByConductorClass?.[conductorClass]?.includes(section) ||
      ![600, 1000].includes(voltage)
    )
      return {
        rows: [],
        warnings: [
          'Сечение, класс жилы или напряжение отсутствуют в подтверждённом заводском ряду монтажного провода.',
        ],
      };
    return {
      rows: [
        {
          code: profile.section,
          text: `Одна жила; номинальное сечение ${number(section)} мм²`,
        },
        {
          code: `класс ${conductorClass}`,
          text: `Класс токопроводящей жилы ${conductorClass}`,
        },
        {
          code: `${voltage} В`,
          text: `Номинальное переменное напряжение ${voltage} В`,
        },
      ],
      warnings: [],
    };
  }
  if (profile && family.sourceProfile === 'aluminium-steel-sections') {
    return {
      rows: [
        {
          code: `${profile.aluminium}/${profile.steel}`,
          text: `Номинальное сечение алюминиевой части ${number(Number(profile.aluminium.replace(',', '.')))} мм²; стального сердечника ${number(Number(profile.steel.replace(',', '.')))} мм²`,
        },
      ],
      warnings: [],
    };
  }
  if (profile && family.sourceProfile === 'single-conductor-section') {
    const section = Number(profile.section.replace(',', '.'));
    if (
      (profile.cores && Number(profile.cores) !== 1) ||
      (family.nominalSizes && !family.nominalSizes.includes(section))
    )
      return {
        rows: [],
        warnings: [
          'Размер или число жил не соответствует подтверждённому заводскому исполнению этой марки.',
        ],
      };
    return {
      rows: [
        {
          code: profile.section,
          text: `Одна жила; номинальное сечение ${number(section)} мм²`,
        },
      ],
      warnings: [],
    };
  }
  if (profile && family.sourceProfile === 'sip-phase-neutral-auxiliary') {
    const value = (name) => Number(profile[name]?.replace(',', '.'));
    if (
      ![1, 3].includes(value('phases')) ||
      !family.phaseSizes.includes(value('phaseSection')) ||
      !family.neutralSizes.includes(value('neutralSection')) ||
      (profile.auxCount &&
        (![1, 2, 3].includes(value('auxCount')) ||
          !family.auxiliarySizes.includes(value('auxSection'))))
    )
      return {
        rows: [],
        warnings: [
          'Конфигурация СИП отсутствует в подтверждённом заводском ряду.',
        ],
      };
    const rows = [
      {
        code: `${profile.phases}×${profile.phaseSection}`,
        text: `Фазные жилы: ${profile.phases} × ${number(value('phaseSection'))} мм²`,
      },
      {
        code: `+1×${profile.neutralSection}`,
        text: `Изолированная нулевая несущая жила: 1 × ${number(value('neutralSection'))} мм²`,
      },
    ];
    if (profile.auxCount)
      rows.push({
        code: `+${profile.auxCount}×${profile.auxSection}`,
        text: `Дополнительные жилы: ${profile.auxCount} × ${number(value('auxSection'))} мм²`,
      });
    return { rows, warnings: [] };
  }
  if (family?.mark === 'СКАБ 250' && !product.parsingWarnings?.length) {
    const proof = checkDesignationConstruction({
      product,
      designation,
      family,
      documents: DESIGNATION_DOCUMENTS,
    });
    const configuration = proof.configuration;
    if (
      proof.status === 'confirmed' &&
      proof.ruleId === 'scope-family-0531-spec-skab-q52-screen-triple' &&
      configuration.cores === 2 &&
      configuration.group === 3 &&
      configuration.section === 0.75 &&
      configuration.screen &&
      configuration.execution === 'НГ(А)HFХЛ'
    ) {
      return {
        rows: [
          {
            code:
              product.conductorConfiguration ||
              findCableSpecification(designation)?.configuration,
            text: '2 индивидуально экранированные тройки по 3 жилы; сечение каждой жилы 0,75 мм². Всего 6 жил',
          },
        ],
        warnings: [],
      };
    }
  }
  // Only the complete manufacturer-documented Samara configuration is decoded.
  // The construction checker also rejects contradictory structured source fields.
  if (
    /^МКПпА(?:БПШП|БП|ШП)\s+7\s*[хx×]\s*4\s*[хx×]\s*1[.,]05\s*\+\s*5\s*[хx×]\s*2\s*[хx×]\s*0[.,]7\s*\+\s*1\s*[хx×]\s*0[.,]7$/iu.test(
      designation
    ) &&
    checkDesignationConstruction({
      product,
      designation,
      family,
      documents: DESIGNATION_DOCUMENTS,
    }).status === 'confirmed' &&
    !product.parsingWarnings?.length
  ) {
    return {
      rows: [
        {
          code: designation.replace(/^\S+\s+/u, ''),
          text: '7 четвёрок (4 высокочастотные и 3 низкочастотные), диаметр жил 1,05 мм; 5 вспомогательных пар и 1 вспомогательная жила, диаметр 0,7 мм. Всего 39 жил',
        },
      ],
      warnings: [],
    };
  }
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
  if (
    family.nominalSizes &&
    section > 0 &&
    !family.nominalSizes.includes(Number(section))
  ) {
    warnings.push(
      'Размер в исходной позиции отсутствует в подтверждённом ряду этого семейства; единицы и исполнение требуют проверки.'
    );
    return {
      rows: [
        {
          code: spec
            ? designation.slice(spec.index, spec.index + spec.length)
            : String(section),
          text: 'Размерная запись требует сверки с документацией полного исполнения',
        },
      ],
      warnings,
    };
  }
  const group = spec?.groupCores ?? product.groupCores;
  const conductorCount = Number(cores) * Number(group || 1);
  if (
    family.elementCountsByGroupAndSection &&
    !family.elementCountsByGroupAndSection[group || 1]?.[
      Number(section)
    ]?.includes(Number(cores))
  )
    return {
      rows: [],
      warnings: [
        'Число элементов и сечение отсутствуют в подтверждённой заводской таблице.',
      ],
    };
  if (
    conductorCount > 0 &&
    ((family.coreCounts && !family.coreCounts.includes(conductorCount)) ||
      (family.maximumElementCount &&
        Number(cores) > family.maximumElementCount) ||
      (family.nominalCoreCounts?.[Number(section)] &&
        !family.nominalCoreCounts[Number(section)].includes(conductorCount)) ||
      (family.maximumConductorCount &&
        conductorCount > family.maximumConductorCount))
  )
    return {
      rows: [],
      warnings: [
        'Число жил не соответствует подтверждённому заводскому ряду этой марки.',
      ],
    };
  if (
    family.groupSizes &&
    group > 0 &&
    !family.groupSizes.includes(Number(group))
  )
    return {
      rows: [],
      warnings: [
        'Группировка жил не соответствует подтверждённой заводской конструкции этой марки.',
      ],
    };
  if (
    group > 0 &&
    ((family.groupLimits?.[group] && cores > family.groupLimits[group]) ||
      (family.groupNominalMaximum?.[group] &&
        section > family.groupNominalMaximum[group]))
  )
    return {
      rows: [],
      warnings: [
        'Группированная конструкция отсутствует в подтверждённом заводском ряду.',
      ],
    };
  if (
    family.minimumConductorCount &&
    cores > 0 &&
    cores * (group || 1) < family.minimumConductorCount
  ) {
    warnings.push(
      'Число жил в исходной записи меньше подтверждённого для этого семейства; запись жил или пар требует уточнения.'
    );
    return { rows, warnings };
  }
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
    warnings.push(
      'Сложная конфигурация жил разобрана не полностью; единицы и дополнительные элементы требуют сверки с документацией.'
    );
  } else {
    warnings.push('В позиции не распознана размерная запись жил.');
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
  const sourceDesignation = clean(
    product.sourceName ||
      product.fullName ||
      product.title ||
      product.name ||
      product.mark
  );
  const rawMark = clean(product.mark);
  const mark = stripLegacyCableAlias(rawMark);
  const designation = stripLegacyCableAlias(sourceDesignation);
  const sourceAttributes = product.attributes || [];
  const cleanedAttributes = stripLegacyCableAliasAttributes(
    mark,
    sourceAttributes
  );
  if (
    designation !== sourceDesignation ||
    mark !== rawMark ||
    cleanedAttributes.length !== sourceAttributes.length
  ) {
    product = {
      ...product,
      mark,
      sourceName: designation,
      attributes: cleanedAttributes,
    };
  }
  const {
    family: resolvedFamily,
    index,
    partial,
    ratedVoltage,
    consumedAttribute,
  } = resolveFamily(product);
  const rawAttributes = product.attributes || [];
  const ndgExecution = /^\([АA]\)\s*-?\s*НДГ$/iu;
  const splitNdg = rawAttributes.findIndex((value, i) =>
    ndgExecution.test(value + ' ' + (rawAttributes[i + 1] || ''))
  );
  const attributes =
    resolvedFamily?.mark === 'ТППэп' &&
    /(?:^|\s)\([АA]\)\s*-?\s*НДГ(?=\s|$)/iu.test(designation)
      ? rawAttributes.flatMap((value, i) => {
          if (splitNdg >= 0 && i === splitNdg + 1) return [];
          if (
            i === splitNdg ||
            (ndgExecution.test(value) && normalize(value) !== '(А)НДГ')
          )
            return '(А)НДГ';
          return value;
        })
      : rawAttributes;
  const executionCodes = [
    ...attributes,
    index || '',
    ...designation.matchAll(
      /нг\s*(?:\([АБВГДСA-D]\))?(?:-?(?:FR)?-?(?:LS|HF))?(?:-?LTx)?(?:-?ХЛ)?/giu
    ),
  ].map((v) => normalize(Array.isArray(v) ? v[0] : v));
  const execution = resolvedFamily?.executions?.find((e) =>
    executionCodes.some(
      (code) =>
        (e.firePattern && new RegExp(e.firePattern, 'u').test(code)) ||
        e.attributesAny?.includes(code)
    )
  );
  const family = execution
    ? {
        ...resolvedFamily,
        ...execution.overrides,
        indexes: { ...resolvedFamily.indexes, ...execution.overrides.indexes },
      }
    : resolvedFamily;
  const constructionEvidence = checkDesignationConstruction({
    product,
    designation,
    family,
    documents: DESIGNATION_DOCUMENTS,
  });
  const confirmedNycY =
    constructionEvidence.status === 'confirmed' &&
    constructionEvidence.ruleId === 'scope-family-0529-prysmian-lv-q52';
  const source = sourceFor(family);
  const tokens = (family?.tokens || []).map(([code, text]) => ({ code, text }));
  const sources = new Map(source ? [[source.url, source]] : []);
  for (const item of family?.notationSources || []) sources.set(item.url, item);
  const addSource = (item) => {
    if (
      ![...sources.values()].some(
        (existing) => existing.url.split('#')[0] === item.url.split('#')[0]
      )
    )
      sources.set(item.url, item);
  };
  if (confirmedNycY)
    tokens.push(
      { code: 'RE', text: 'Круглые однопроволочные жилы' },
      {
        code: '/6',
        text: 'Сечение концентрического медного проводника — 6 мм²',
      }
    );
  const unknown = [];
  if (!family) unknown.push(clean(product.mark) || designation);
  if (partial) unknown.push(partial);
  const indexes = [
    ...new Set([
      ...attributes,
      ...(index ? [index] : []),
      ...([
        'single-conductor-section',
        'installation-wire-section-class-voltage',
      ].includes(family?.sourceProfile)
        ? (
            new RegExp(family.sourceNamePattern, 'u').exec(designation)?.groups
              ?.tail || ''
          )
            .trim()
            .split(/\s+/u)
            .filter(Boolean)
        : []),
    ]),
  ];
  // Some importers split a terminal Э/з off the mark into attributes. Consume
  // it only when it is literally inside the recovered family and does not
  // occur again after that full first word (where it could mean another screen).
  const originalFirstWord = clean(designation).split(/\s+/u)[0];
  const recoveredTail =
    family && normalize(family.mark).startsWith(normalize(product.mark))
      ? normalize(family.mark).slice(normalize(product.mark).length)
      : '';
  let usesPriceNotation = false;
  for (const attribute of indexes) {
    const priceIndex = indexKey(attribute).replace('(A)', '(А)');
    const note = priceNotation[family?.mark]?.[priceIndex];
    if (note) {
      usesPriceNotation = true;
      tokens.push({ code: note[0], text: note[1] });
      continue;
    }
    if (consumedAttribute === normalize(attribute)) continue;
    if (confirmedNycY && normalize(attribute) === 'RE/6') continue;
    if (
      recoveredTail &&
      /^[ЭЗ]+$/u.test(recoveredTail) &&
      normalize(originalFirstWord).startsWith(normalize(family.mark)) &&
      /^[ЭЗ]$/u.test(normalize(attribute)) &&
      recoveredTail.includes(normalize(attribute)) &&
      !new RegExp(
        `(?:^|[\\s\\d)])${normalize(attribute)}(?=$|\\s|нг)`,
        'iu'
      ).test(designation.slice(originalFirstWord.length))
    )
      continue;
    // Supplier provenance notes are explained as notes, never as a cable type
    // or confirmation of the manufacturer of a warehouse batch.
    if (
      family?.mark === 'АПВ' &&
      /белый\s+с\s+красной\s+полосой\s*$/iu.test(designation) &&
      ['С', 'КРАСНОЙ', 'ПОЛОСОЙ'].includes(normalize(attribute))
    ) {
      if (normalize(attribute) === 'С')
        tokens.push({
          code: 'с красной полосой',
          text: 'В исходном названии указан белый цвет с красной полосой',
        });
      continue;
    }
    const provenance = clean(attribute).match(
      /^(?:(черн))?\(импорт(?:н)?\)$/iu
    );
    if (family && provenance) {
      if (provenance[1])
        tokens.push({
          code: provenance[1],
          text: 'Цвет в исходной записи: чёрный',
        });
      tokens.push({
        code: clean(attribute).replace(/^черн/iu, ''),
        text: 'В прайсе указано импортное происхождение; страна и изготовитель этой пометкой не установлены',
      });
      continue;
    }
    const mvTail =
      /^(?:АПвВ|АПвПуг)$/iu.test(family?.mark || '') &&
      (/^мк\/(\d+)-(6|10|20|35)$/iu.exec(clean(attribute)) ||
        (/^мк\/\d+$/iu.test(clean(attribute)) &&
          /^мк\/(\d+)-(6|10|20|35)$/iu.exec(
            `${clean(attribute)}-${product.voltage}`
          )));
    if (
      mvTail &&
      designation.toLowerCase().includes(`мк/${mvTail[1]}-${mvTail[2]}`) &&
      (product.screenCrossSection == null ||
        Number(product.screenCrossSection) === Number(mvTail[1])) &&
      (product.voltage == null || Number(product.voltage) === Number(mvTail[2]))
    ) {
      tokens.push(
        { code: 'мк', text: 'Многопроволочная круглая токопроводящая жила' },
        {
          code: `/${mvTail[1]}`,
          text: `Сечение металлического экрана ${mvTail[1]} мм²`,
        },
        {
          code: `-${mvTail[2]}`,
          text: `Номинальное напряжение ${mvTail[2]} кВ в исходной маркировке`,
        }
      );
      continue;
    }
    if (
      family?.mark === 'NYY' &&
      /\bRM\s+Class\s+2\s*$/iu.test(designation) &&
      ['CLASS', '2'].includes(normalize(attribute))
    ) {
      if (normalize(attribute) === 'CLASS')
        tokens.push({
          code: 'Class 2',
          text: 'Класс 2: многопроволочная токопроводящая жила',
        });
      continue;
    }
    if (family?.dimension === 'lan') {
      const notation = explainLanNotation(attribute);
      if (!notation.unknown && notation.tokens.length) {
        tokens.push(...notation.tokens);
        for (const item of notation.sources) addSource(item);
        addSource(DESIGNATION_SOURCES['paritet-1']);
        continue;
      }
    }
    // The factory optical grammar accounts for the entire original designation.
    // Ignore only importer fragments that are literally present in that match.
    if (
      family?.dimension === 'optical' &&
      family.opticalConfiguration &&
      new RegExp(family.sourceNamePattern, 'u').test(designation) &&
      indexKey(designation).includes(indexKey(attribute))
    )
      continue;
    const caseAttribute = family?.caseAttributes?.find(
      (item) =>
        normalize(attribute) === item.code &&
        new RegExp(item.sourcePattern, 'u').test(designation)
    );
    if (caseAttribute) {
      tokens.push({ code: clean(attribute), text: caseAttribute.text });
      addSource(sourceFor(caseAttribute));
      continue;
    }
    const voltage = clean(attribute)
      .replace(/\s*кВ$/iu, '')
      .replace(',', '.');
    if (
      /^\d+(?:\.\d+)?$/u.test(voltage) &&
      family?.voltageAttributes?.includes(Number(voltage))
    ) {
      tokens.push({
        code: clean(attribute),
        text: `Номинальное напряжение ${number(Number(voltage))} ${family.voltageAttributeUnit === 'V' ? 'В' : 'кВ'}`,
      });
      continue;
    }
    const canonicalIndex =
      normalize(attribute) === 'ПЛОСКИЙ' &&
      /(?:^|\s)п(?=\s|$)/iu.test(designation)
        ? 'П'
        : normalize(attribute).replace(/^-/u, '');
    const splitVoltageIndex =
      family?.mark === 'ПИРОКОР-ВКВ' &&
      canonicalIndex === 'ГМКЛ' &&
      product.voltage === 1 &&
      /гмкл-1\s*$/iu.test(designation)
        ? family.indexes?.['ГМКЛ-1']
        : null;
    const specific =
      family?.indexes?.[canonicalIndex] ||
      splitVoltageIndex ||
      decodeConstructor(attribute, family?.attributeGrammar);
    if (specific) {
      tokens.push({ code: clean(attribute), text: specific });
      continue;
    }
    const color = sourceColor(attribute);
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
    if (
      tokens.some(
        (token) =>
          indexKey(token.code) === indexKey(match[0]) ||
          (firePattern.test(normalize(token.code)) &&
            indexKey(token.code).replace(/ХЛ$/u, '') === indexKey(match[0]))
      )
    )
      continue;
    const decoded = decodeIndex(match[0]);
    if (decoded) {
      tokens.push({ code: decoded.code, text: decoded.text });
      addSource(decoded.source);
    }
  }
  const nominalSize =
    findCableSpecification(designation)?.crossSection ?? product.crossSection;
  let sizeFamily = family?.dimensionBySize
    ? {
        ...family,
        dimension: family.dimensionBySize[String(nominalSize)] || 'variant',
      }
    : family;
  if (family?.sectionNotationSizes?.includes(Number(nominalSize))) {
    sizeFamily = {
      ...family,
      dimension: 'section',
      nominalSizes: family.sectionNotationSizes,
    };
    addSource(family.sectionNotationSource);
  }
  if (family?.diameterNotationSizes?.includes(Number(nominalSize))) {
    sizeFamily = {
      ...family,
      dimension: 'diameter',
      nominalSizes: family.diameterNotationSizes,
    };
    addSource(family.diameterNotationSource);
  }
  const size = sizeTokens(product, sizeFamily, designation);
  if (
    family?.applicationOnly &&
    !(
      family.mark === 'НУД' &&
      constructionEvidence.status === 'confirmed' &&
      constructionEvidence.ruleId ===
        'scope-family-1032-sst-industry-current-q52'
    )
  )
    size.warnings.push(
      'По заводскому источнику подтверждено назначение семейства; полная конструкция и размерная запись ещё требуют проверки.'
    );
  if (family?.dimensionBySize && sizeFamily.dimension === 'variant')
    size.warnings.push(
      'Размер не входит в подтверждённый ряд диаметров или сечений этого семейства.'
    );
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
    family?.hfSheathUnverified &&
    /HF/iu.test(tokens.map((token) => token.code).join(' '))
  ) {
    description = `Кабель семейства ${family.mark} с изоляцией из сшитого полиэтилена. Материал оболочки исполнения HF требует отдельного подтверждения.`;
    for (const token of tokens) {
      if (/оболоч/iu.test(token.text) && /полиэтилен|ПЭ/iu.test(token.text))
        token.text =
          'Оболочка; материал исполнения HF уточняется по его документации';
    }
    size.warnings.push(
      'Описание полиэтиленовой оболочки базового исполнения не подтверждает материал оболочки исполнения HF.'
    );
  }
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
  const status = !family
    ? 'unresolved'
    : unknown.length || size.warnings.length
      ? 'partial'
      : 'reviewed';
  const officialDocument = DESIGNATION_DOCUMENTS.find(
    (d) =>
      d.id === family?.evidence?.documentId &&
      d.status === 'collected' &&
      d.publisherType === 'manufacturer'
  );
  const officialComplete =
    !usesPriceNotation &&
    constructionEvidence.status === 'confirmed' &&
    status === 'reviewed' &&
    family?.evidence?.kind === 'manufacturer-documentation' &&
    Boolean(officialDocument) &&
    (['section', 'diameter'].includes(sizeFamily?.dimension) ||
      (sizeFamily?.dimension === 'heating' &&
        Boolean(sizeFamily.heatingConfiguration) &&
        size.rows.length === 2) ||
      (sizeFamily?.dimension === 'model' &&
        Boolean(sizeFamily.modelConfiguration) &&
        size.rows.length === 2) ||
      (sizeFamily?.dimension === 'coax' &&
        Boolean(sizeFamily.coaxConfiguration) &&
        size.rows.length >= 3) ||
      (sizeFamily?.dimension === 'optical' &&
        Boolean(sizeFamily.opticalConfiguration) &&
        size.rows.length === 3));
  const crossCheck = DESIGNATION_CROSS_CHECKS.find(
    (check) => check.id === family?.crossCheckId
  );
  return {
    designation,
    knowledgeRevision: DESIGNATION_KNOWLEDGE_REVISION,
    familyRecordId: family?.id || null,
    manufacturerTexts: selectManufacturerTexts(
      family?.id,
      executionCodes,
      DESIGNATION_DOCUMENTS
    ),
    evidence: family?.evidence || null,
    crossCheck: crossCheck
      ? {
          id: crossCheck.id,
          status: crossCheck.status,
          scope: crossCheck.scope,
          checkedAt: crossCheck.checkedAt,
          coversFullDesignation: false,
        }
      : null,
    status,
    officialComplete,
    constructionEvidence,
    family: family?.mark || null,
    description,
    tokens,
    sources: [...sources.values()],
    unknown: [...new Set(unknown)],
    warnings: size.warnings,
    searchUrl: `https://www.google.com/search?q=${encodeURIComponent(designation + ' кабель расшифровка производитель')}`,
  };
}
