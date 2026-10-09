// Файл парсит строки XLS-прайса, извлекает марки, характеристики, единицы измерения и цены.
import { findCableSpecification } from './cableSpecification.js';

const UNIT_ALIASES = ['км', 'м', 'шт', 'штука', 'бухта', 'упак', 'упаковка'];

// Торговые марки заводов-производителей, предшествующие обозначению кабеля через дефис
const MANUFACTURER_PREFIXES = new Set([
  // Российские производители
  'ПИРОКОР',
  'КИВИ',
  'ГЕРДА',
  'СОББИТ',
  'МЕТРОЛАН',
  'ТРАНСКАБ',
  'ЛОУТОКС',
  'КРУИНВЭЛК',
  'КРУИН',
  'АРМОФЛЕКС',
  'КУПТЕКС',
  'VIKAB',
  'ВИКАБ',
  // Иностранные производители
  'LAPPKABEL',
  'HELUKABEL',
  'BELDEN',
  'HOLDCAB',
  'PRYSMIAN',
  'SIEMENS',
]);

const FAMILY_CATEGORY_ALIASES = {
  NYM: 'Кабель NYY, NUM',
  NYY: 'Кабель NYY, NUM',
  NUM: 'Кабель NYY, NUM',
  АВВГ: 'Кабель АВВГ',
  ВВГ: 'Кабель ВВГ',
  АКВВГ: 'Кабель АКВВГ',
  КВВГ: 'Кабель КВВГ',
  КГ: 'Кабель КГ',
};

export function createEmptyImportResult() {
  return {
    products: [],
    skippedRows: [],
  };
}

export function normalizeImportedProduct(product) {
  const sourceName = String(product.sourceName ?? product.name ?? '').trim();
  const fullName =
    product.parseCable === false
      ? normalizeText(sourceName)
      : normalizeProductName(sourceName);
  const parsedName =
    product.parseCable === false
      ? {
          ...createEmptyNameParts(),
          mark: fullName,
          markFamily: normalizeMarkFamily(fullName),
        }
      : parseProductName(fullName);
  const normalizedName = buildNormalizedProductName(fullName, parsedName);
  const normalizedUnit = normalizeUnit(product.unit);
  const normalizedPrice = normalizeNumber(product.price);
  const normalizedStock = normalizeNumber(product.stock);
  const inferredUnit = inferMissingUnit({
    unit: normalizedUnit,
    price: normalizedPrice,
    stock: normalizedStock,
    parsedName,
  });
  const normalizedCommercial = normalizeCommercialFields({
    unit: inferredUnit,
    price: normalizedPrice,
    stock: normalizedStock,
  });

  return {
    sourceName,
    name: normalizedName,
    fullName: normalizedName,
    mark: parsedName.mark,
    markFamily: parsedName.markFamily,
    manufacturer: parsedName.manufacturer,
    cores: parsedName.cores,
    crossSection: parsedName.crossSection,
    groupCores: parsedName.groupCores,
    conductorConfiguration: parsedName.conductorConfiguration,
    parsingWarnings: parsedName.parsingWarnings || [],
    hasGroundCore: parsedName.hasGroundCore,
    groundCores: parsedName.groundCores,
    groundSection: parsedName.groundSection,
    voltage: parsedName.voltage,
    attributes: parsedName.attributes,
    unit: normalizedCommercial.unit,
    price: normalizedCommercial.price,
    stock: normalizedCommercial.stock,
    sourceCategory: normalizeCategory(
      product.sourceCategory || product.category
    ),
    category: normalizeCategory(product.category),
  };
}

export function parseCombinedCell(value) {
  const source = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return null;
  }

  // Требуем, чтобы строка ЗАКАНЧИВАЛАСЬ на (опциональная единица) + цена + остаток.
  // Иначе это не строка товара, а заголовок раздела (напр. «Провод медный ПВ1,ПВ3,...»)
  const tailPattern = new RegExp(
    `\\s+((?:${UNIT_ALIASES.join('|')}))?\\s*(\\d[\\d\\s.,]*)\\s+(\\d[\\d\\s.,]*)$`,
    'i'
  );
  const tailMatch = source.match(tailPattern);

  if (!tailMatch) {
    return null;
  }

  const unit = (tailMatch[1] || '').trim().toLowerCase();
  const price = normalizeNumber(tailMatch[2]);
  const stock = normalizeNumber(tailMatch[3]);
  const name = source.slice(0, tailMatch.index).trim();

  if (!name) {
    return null;
  }

  return {
    name,
    unit,
    price,
    stock,
  };
}

function normalizeUnit(unit) {
  const value = normalizeText(unit).toLowerCase();

  if (!value) {
    return '';
  }

  if (value === 'штука') {
    return 'шт';
  }

  if (value === 'упаковка') {
    return 'упак';
  }

  return value;
}

// Если единица измерения в прайсе отсутствует, но позиция выглядит как кабель
// (есть спецификация жил/сечения), цена высокая, а остаток дробный — это
// почти наверняка километры. Такое встречается у КМТВэВ и других «редких»
// марок, где поставщик не заполнил колонку «ед. изм.».
function inferMissingUnit({ unit, price, stock, parsedName }) {
  if (unit) {
    return unit;
  }

  const looksLikeCable = Boolean(
    (parsedName?.cores && parsedName?.crossSection) ||
    parsedName?.conductorConfiguration
  );
  if (!looksLikeCable) {
    return unit;
  }

  // Цена > 5000 за «штуку» для кабеля с сечением и дробный остаток (< 10)
  // — надёжный признак, что цена указана за км, а остаток в км.
  const fractionalStock = stock > 0 && stock < 10;
  if (price >= 5000 && fractionalStock) {
    return 'км';
  }

  return unit;
}

function normalizeCommercialFields({ unit, price, stock }) {
  if (unit !== 'км') {
    return { unit, price, stock };
  }

  return {
    unit: 'м',
    price: roundTo(price / 1000, 3),
    stock: roundTo(stock * 1000, 3),
  };
}

function stripManufacturerPrefix(value) {
  const match = value.match(/^([А-ЯЁA-Z]{4,})[-\s](.+)$/i);
  if (!match) return { name: value, manufacturer: null };
  const upper = match[1].toUpperCase();
  if (MANUFACTURER_PREFIXES.has(upper)) {
    return { name: match[2].trim(), manufacturer: upper };
  }
  return { name: value, manufacturer: null };
}

export function parseProductName(value) {
  const { name: stripped, manufacturer } = stripManufacturerPrefix(
    normalizeProductName(value)
  );
  const source = stripped;

  if (!source) {
    return createEmptyNameParts();
  }

  const voltagePattern =
    /(?<![\d.,/])(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*[кk]\s*[вv](?![а-яa-z])/iu;
  const voltageMatch = source.match(voltagePattern);
  let specification = findCableSpecification(source);
  if (!specification) {
    // В прайсе разделитель после полного пожарного суффикса бывает пропущен.
    const joined =
      /нг(?:\s*\([АБВГДСA-D]\))?[-\s]*(?:FRLS|FRHF|LS|HF|FR)(?:[-\s]*LTx)?(?=\d)/giu;
    const end = [...source.matchAll(joined)][0];
    if (end) {
      const offset = end.index + end[0].length;
      const candidate = findCableSpecification(source.slice(offset));
      if (candidate?.index === 0)
        specification = { ...candidate, index: offset };
    }
  }
  if (!specification) {
    const awg = source.match(/\d+\s*[хx×]\s*\d+\s*[хx×]\s*AWG\s*\d+/iu);
    if (awg) {
      const candidate = findCableSpecification(source.slice(awg.index));
      if (candidate?.index === 0)
        specification = { ...candidate, index: awg.index };
    }
  }
  const parsingWarnings = specification?.warnings || [];
  if (
    specification?.warnings.includes('missing_operand') &&
    /^\s*\p{L}/u.test(source.slice(specification.index + specification.length))
  ) {
    specification = null;
  }

  let mark = source;
  let markFamily = source;
  let cores = null;
  let crossSection = null;
  let groupCores = null;
  let conductorConfiguration = null;
  let groundCores = null;
  let groundSection = null;
  let attributes = [];
  let isImplicitSingleCore = false;

  if (specification) {
    const specIndex = specification.index;
    const markEnd = source[specIndex - 1] === '(' ? specIndex - 1 : specIndex;
    mark = source
      .slice(0, markEnd)
      .replace(voltagePattern, '')
      .replace(/[\s-]+$/u, '')
      .trim();
    const extracted = extractMarkAttributes(mark);
    mark = extracted.mark;
    attributes = extracted.attributes;
    // Если перед спецификацией нет марки (напр. "SIEMENS 1Х2Х0.32" после
    // отсечения префикса-производителя), используем производителя как марку.
    if (!mark && manufacturer) {
      mark = manufacturer;
    }
    markFamily = normalizeMarkFamily(mark);
    ({ cores, groupCores, crossSection, groundCores, groundSection } =
      specification);
    conductorConfiguration = specification.configuration;

    const tailResult = extractLeadingConstructionAttributes(
      normalizeText(
        source
          .slice(specIndex + specification.length)
          .replace(voltagePattern, '')
      )
    );
    attributes = [
      ...attributes,
      ...(specification.attributes || []),
      ...tailResult.attributes,
      ...splitAttributes(tailResult.tail).filter(
        (token) => !/^(\d+(?:[.,]\d+)?)\s*[кkК]\s*[вvВV]$/.test(token)
      ),
    ];
  } else {
    const plainSectionMatch = source.match(
      /^(.*?)\s+(\d+(?:[.,]\d+)?)(?:\s+([^\d].*))?$/
    );

    if (
      plainSectionMatch &&
      isSingleCoreMark(plainSectionMatch[1]) &&
      isLikelySingleCoreSection(plainSectionMatch[2])
    ) {
      mark = normalizeText(plainSectionMatch[1]);
      const extracted = extractMarkAttributes(mark);
      mark = extracted.mark;
      attributes = extracted.attributes;
      markFamily = normalizeMarkFamily(mark);
      cores = 1;
      crossSection = Number(plainSectionMatch[2].replace(',', '.'));
      attributes = [
        ...attributes,
        ...splitAttributes(plainSectionMatch[3] || ''),
      ];
      isImplicitSingleCore = true;
    } else {
      const extracted = extractMarkAttributes(source);
      mark = extracted.mark;
      attributes = extracted.attributes;
      markFamily = normalizeMarkFamily(mark);
    }
  }

  attributes = consolidateNgAttributes(attributes);
  if (voltageMatch?.[2])
    attributes.push(`${voltageMatch[1]}/${voltageMatch[2]} кВ`);
  if (
    !specification &&
    !isImplicitSingleCore &&
    /\d\s*[хx×]\s*(?:\d|AWG)/iu.test(source) &&
    !isOpticalCableMark(mark)
  ) {
    parsingWarnings.push('unrecognized_specification');
  }

  return {
    mark,
    markFamily,
    manufacturer,
    cores,
    crossSection,
    groupCores,
    conductorConfiguration,
    parsingWarnings,
    hasGroundCore: Boolean(groundCores && groundSection),
    groundCores,
    groundSection,
    voltage: voltageMatch
      ? Number((voltageMatch[2] || voltageMatch[1]).replace(',', '.'))
      : null,
    attributes,
    isImplicitSingleCore,
  };
}

export function resolveCategory(product, categoryByFamily = new Map()) {
  const sourceCategory = normalizeCategory(product.sourceCategory);
  const family = normalizeMarkFamily(
    product.markFamily || product.mark || product.name
  );
  const displayFamily = normalizeText(
    product.mark || product.markFamily || product.name
  );

  if (
    isSpecificSourceCategory(sourceCategory) &&
    isCategoryCompatible(sourceCategory, family)
  ) {
    return sourceCategory;
  }

  if (family && categoryByFamily.has(family)) {
    return categoryByFamily.get(family);
  }

  if (family) {
    return (
      FAMILY_CATEGORY_ALIASES[family] || `Кабель ${displayFamily || family}`
    );
  }

  if (isSpecificSourceCategory(sourceCategory)) {
    return sourceCategory;
  }

  return 'Без категории';
}

export function buildCategoryMap(products) {
  const counts = new Map();

  for (const product of products) {
    const sourceCategory = normalizeCategory(product.sourceCategory);
    const family = normalizeMarkFamily(
      product.markFamily || product.mark || product.name
    );

    if (!family || !isSpecificSourceCategory(sourceCategory)) {
      continue;
    }

    if (!isCategoryCompatible(sourceCategory, family)) {
      continue;
    }

    if (!counts.has(family)) {
      counts.set(family, new Map());
    }

    const familyCounts = counts.get(family);
    familyCounts.set(
      sourceCategory,
      (familyCounts.get(sourceCategory) || 0) + 1
    );
  }

  const resolved = new Map();

  for (const [family, familyCounts] of counts.entries()) {
    const bestCategory = [...familyCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    if (bestCategory) {
      resolved.set(family, bestCategory);
    }
  }

  return resolved;
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value || '')
    .replace(/\s+/g, '')
    .trim();

  if (!raw) {
    return 0;
  }

  let normalized = raw;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    const parts = normalized.split(',');

    if (parts.length === 2 && parts[1].length !== 3) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = parts.join('');
    }
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo(value, precision) {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Приводим пожаробезопасные модификации к единому виду во всём названии,
// независимо от того, стоят они до или после спецификации жил и сечения.
function normalizeProductName(value) {
  let source = normalizeNgModificationsInText(normalizeText(value));
  const spec = findCableSpecification(source);
  if (spec) {
    const raw = source.slice(spec.index, spec.index + spec.length);
    const normalized = raw.replace(
      /(\d|\))\s*[×xXхХ]\s*(?=\d|\(\s*\d|AWG)/giu,
      '$1х'
    );
    const repaired = spec.recoveredClosingGroup ? `${normalized})` : normalized;
    source =
      source.slice(0, spec.index) +
      repaired +
      source.slice(spec.index + spec.length);
  }
  return normalizeScreenBeforeNg(source);
}

// Обозначение экрана «Э» относится к марке, но перед пожаробезопасной
// модификацией пишется слитно: КВВГЭнг(А)-LS, а не КВВГЭ нг(А)-LS.
function normalizeScreenBeforeNg(value) {
  const source = String(value);
  const specIndex = findCableSpecification(source)?.index ?? source.length;
  return source.replace(
    /-?(эф|эа|эм|ээ|э)\s+(?=нг(?:[(-]|\s|$))/giu,
    (match, token, offset) => (offset < specIndex ? token.toUpperCase() : match)
  );
}

function normalizeCategory(value) {
  const category = normalizeText(value);

  return category || 'Без категории';
}

function normalizeMarkFamily(value) {
  return normalizeText(value)
    .replace(/^[^A-Za-zА-Яа-я0-9]+/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,;:+]+$/g, '')
    .toUpperCase();
}

function createEmptyNameParts() {
  return {
    mark: '',
    markFamily: '',
    manufacturer: null,
    cores: null,
    crossSection: null,
    groupCores: null,
    conductorConfiguration: null,
    parsingWarnings: [],
    hasGroundCore: false,
    groundCores: null,
    groundSection: null,
    voltage: null,
    attributes: [],
    isImplicitSingleCore: false,
  };
}

function buildNormalizedProductName(source, parsedName) {
  if (
    !parsedName.isImplicitSingleCore ||
    !parsedName.mark ||
    !parsedName.crossSection
  ) {
    return source;
  }

  // Вставляем число жил в исходное название, сохраняя производителя и суффиксы.
  return source.replace(/\s+(\d+(?:[.,]\d+)?)(?=\s+[^\d].*$|$)/u, ' 1х$1');
}

function splitAttributes(value) {
  const normalized = normalizeText(value).replace(/^\-+/, '').trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .flatMap((token) => {
      const screen = token.match(/^(эф|эа|эм|ээ|э)(?=нг(?:\(|-|$))/iu);
      const parts = screen
        ? [screen[1], token.slice(screen[0].length)]
        : [token];
      return parts.flatMap(splitNgAttributeToken);
    })
    .map(normalizeNgModification)
    .map(normalizeConstructionAttribute);
}

const CONSTRUCTION_ATTRIBUTE_TOKENS = new Map([
  ['эф', 'ЭФ'],
  ['эа', 'ЭА'],
  ['эм', 'ЭМ'],
  ['ээ', 'ЭЭ'],
  ['э', 'Э'],
  ['зэл', 'ЗЭЛ'],
  ['з', 'З'],
  ['хл', 'ХЛ'],
  ['уф', 'УФ'],
]);

// Подтверждённые в исходном прайсе окончания марок, которые внешне похожи
// на конструктивный суффикс. Например, ИнСил-ОЭ — цельная марка, а не
// ИнСил-О с отдельным экраном Э.
const PROTECTED_MARK_TERMINALS = new Set(['инсил-оэ']);

function normalizeConstructionAttribute(token) {
  const normalized = String(token || '')
    .trim()
    .toLowerCase();
  return CONSTRUCTION_ATTRIBUTE_TOKENS.get(normalized) || token;
}

// нгLS → нг-LS, нг(А)LSLtx → нг(А)-LS-LTx, нгхл → нг-ХЛ
function normalizeNgModification(token) {
  const match = token.match(/^нг(\([АБВГДСA-D]\))?-?(.*)$/iu);
  if (!match) return token;
  if (match[2].startsWith('(')) return token;

  const cls = normalizeNgClass(match[1]);
  const suffix = match[2] || '';
  if (!suffix) return `нг${cls}`;

  return `нг${cls}-${normalizeNgSuffix(suffix)}`;
}

const NG_SUFFIX_IN_TEXT_SOURCE =
  'FRLS|FRHF|FR|LS|HF|LTx|хк\\([^)]*\\)вэ|хл|нд|t/h|т/н';
const NG_CLASS_IN_TEXT_SOURCE = '\\([АБВГДСA-D]\\)';
const NG_MODIFICATION_IN_TEXT_RE = new RegExp(
  `нг(?:\\s*(${NG_CLASS_IN_TEXT_SOURCE}))?((?:[\\s-]*(?:${NG_SUFFIX_IN_TEXT_SOURCE}))+)?`,
  'gi'
);
const NG_ATTRIBUTE_START_RE = new RegExp(
  `нг(?:\\s*(${NG_CLASS_IN_TEXT_SOURCE}))?`,
  'gi'
);
const NG_SUFFIX_PREFIX_RE = new RegExp(
  `^(?:[\\s-]*(?:${NG_SUFFIX_IN_TEXT_SOURCE}))+(?=$|[^A-Za-zА-Яа-яЁё])`,
  'i'
);

function normalizeNgModificationsInText(value) {
  return value.replace(
    NG_MODIFICATION_IN_TEXT_RE,
    (match, rawClass, rawSuffix, offset, source) => {
      const nextCharacter = source[offset + match.length] || '';

      // Не исправляем случайное «нг» внутри обычного слова или неизвестного
      // обозначения. После распознанной последовательности должна быть граница.
      if (/[A-Za-zА-Яа-яЁё]/.test(nextCharacter)) {
        return match;
      }

      if (!rawClass && !rawSuffix) {
        return match;
      }

      const cls = normalizeNgClass(rawClass);
      const suffix = String(rawSuffix || '').trim();
      if (!suffix) {
        return `нг${cls}`;
      }

      return `нг${cls}-${normalizeNgSuffix(suffix)}`;
    }
  );
}

function normalizeNgClass(value) {
  return value ? String(value).toUpperCase() : '';
}

function splitNgAttributeToken(token) {
  const source = String(token || '').trim();
  const match = source.match(/^нг(\([АБВГДСA-D]\))?/iu);
  if (!match) return [source];

  const rawAfter = source.slice(match[0].length);
  if (!match[1] && rawAfter.startsWith('(')) return [source];
  const suffix = rawAfter.match(NG_SUFFIX_PREFIX_RE)?.[0] || '';
  const modifier = suffix
    ? `нг${normalizeNgClass(match[1])}-${normalizeNgSuffix(suffix)}`
    : `нг${normalizeNgClass(match[1])}`;
  const tail = rawAfter
    .slice(suffix.length)
    .replace(/^[\s-]+/u, '')
    .trim();
  return tail ? [modifier, tail] : [modifier];
}

function isOpticalCableMark(value) {
  return /^ок[\p{L}\p{N}-]*/iu.test(String(value || '').trim());
}

function extractMarkAttributes(value) {
  const embedded = extractEmbeddedNgAttributes(value);
  const standalone = extractStandaloneFireSuffix(embedded.mark);
  return {
    mark: standalone.mark,
    attributes: [...embedded.attributes, ...standalone.attributes],
  };
}

function extractStandaloneFireSuffix(value) {
  const source = String(value || '').trim();
  const match = source.match(
    /^(.*?)\s+((?:FRLS|FRHF|FR|LS|HF)(?:[-\s]+(?:FRLS|FRHF|FR|LS|HF|LTx|T\/H|Т\/Н|ХЛ|НД))+)$/iu
  );
  if (!match || !match[1].trim()) return { mark: source, attributes: [] };

  return {
    mark: match[1].trim(),
    attributes: [normalizeNgSuffix(match[2])],
  };
}

function extractEmbeddedNgAttributes(mark) {
  for (const match of mark.matchAll(NG_ATTRIBUTE_START_RE)) {
    const nextCharacter = mark[match.index + match[0].length] || '';
    const before = mark.slice(0, match.index).trim();
    const construction = extractTrailingConstructionAttributes(before, {
      includeFill: true,
    });
    const baseBefore = construction.mark.replace(/[\s-]+$/, '');
    const rawAfter = mark.slice(match.index + match[0].length);
    const suffixMatch = rawAfter.match(NG_SUFFIX_PREFIX_RE);
    const rawClass = match[1];
    const isStandaloneBareNg =
      !rawClass && match.index > 0 && /\s/.test(mark[match.index - 1]);
    const isJoinedLowercaseBareNg =
      !rawClass && match[0] === 'нг' && !rawAfter.trim();

    if (
      !baseBefore ||
      (!rawClass &&
        !suffixMatch &&
        !isStandaloneBareNg &&
        !isJoinedLowercaseBareNg) ||
      (!rawClass && !suffixMatch && /[A-Za-zА-Яа-яЁё]/.test(nextCharacter))
    ) {
      continue;
    }

    const suffix = suffixMatch?.[0] || '';
    const modifier = suffix
      ? `нг${normalizeNgClass(rawClass)}-${normalizeNgSuffix(suffix)}`
      : `нг${normalizeNgClass(rawClass)}`;
    const after = rawAfter
      .slice(suffix.length)
      .replace(/^[\s-]+/, '')
      .trim();
    const attributes = [...construction.attributes, modifier];

    if (after) {
      attributes.push(...splitAttributes(after));
    }

    return {
      mark: baseBefore,
      attributes,
    };
  }

  const standalone =
    mark.match(/^(.*?)((?:[\s-]+(?:эф|эа|эм|ээ|э|зэл|з|хл|уф))+)[\s-]*$/iu) ||
    mark.match(/^(.+?)(хл|уф)$/iu);
  const construction = extractTrailingConstructionAttributes(
    standalone ? standalone[1] : mark
  );
  return {
    mark: construction.mark,
    attributes: [
      ...construction.attributes,
      ...(standalone ? splitAttributes(standalone[2].replace(/-/g, ' ')) : []),
    ],
  };
}

function extractTrailingConstructionAttributes(
  mark,
  { includeFill = false } = {}
) {
  const source = String(mark || '').trim();

  // Не отделяем конструктивный индекс после неизвестного нг(12): вся эта
  // последовательность может быть частью марки, а не пожарным суффиксом.
  if (/нг\s*\([^АБВГДСA-D][^)]*\)/iu.test(source)) {
    return { mark: source, attributes: [] };
  }

  let rest = source;
  const attributes = [];
  // Конструктивные признаки могут быть слитными с маркой прямо перед нг:
  // РУТЕКзнг(А), КВВГЭнг(А), ...ЭФЗнг(А). Отделяем их справа налево,
  // чтобы не ломать внутренние буквы марки.
  while (rest) {
    if (PROTECTED_MARK_TERMINALS.has(rest.toLocaleLowerCase('ru'))) break;

    const suffixes = includeFill ? 'эф|эа|эм|ээ|зэл|э|з' : 'эф|эа|эм|ээ|э';
    const match = rest.match(new RegExp(`^(.+?)(?:-?(${suffixes}))$`, 'iu'));
    if (!match || !match[1].trim()) break;
    rest = match[1].trim();
    attributes.unshift(normalizeConstructionAttribute(match[2]));
  }

  return {
    mark: rest,
    attributes,
  };
}

function extractLeadingConstructionAttributes(value) {
  let tail = normalizeText(value);
  const attributes = [];

  while (tail) {
    tail = tail.replace(/^[-\s]+/, '').trim();

    const wrapper = tail.match(/^\)+/);
    if (wrapper) {
      tail = tail.slice(wrapper[0].length).trim();
      continue;
    }

    const match = tail.match(
      /^(эф|эа|эм|ээ|э|зэл|з)(?=нг(?:\(|-|$)|$|[\s)\-])/iu
    );
    if (!match) break;

    attributes.push(normalizeConstructionAttribute(match[1]));
    tail = tail.slice(match[0].length).trim();
  }

  return {
    tail,
    attributes: [...new Set(attributes)],
  };
}

function consolidateNgAttributes(attributes) {
  const result = [...attributes];

  for (let index = 0; index < result.length; index += 1) {
    const ngMatch = String(result[index]).match(/^нг(\([^)]*\))?$/i);
    if (!ngMatch) {
      continue;
    }

    for (
      let continuationIndex = index + 1;
      continuationIndex < result.length;
      continuationIndex += 1
    ) {
      const continuation = parseNgContinuation(result[continuationIndex]);
      if (!continuation) {
        continue;
      }

      const cls = continuation.cls || normalizeNgClass(ngMatch[1]);
      result[index] = continuation.suffix
        ? `нг${cls}-${continuation.suffix}`
        : `нг${cls}`;
      result.splice(continuationIndex, 1);
      break;
    }
  }

  return [...new Set(result)];
}

function parseNgContinuation(value) {
  const source = String(value || '').trim();
  const match = source.match(/^(\([АБВГДСA-D]\))?[-\s]*(.*)$/iu);
  if (!match) {
    return null;
  }

  const cls = normalizeNgClass(match[1]);
  const rawSuffix = match[2] || '';
  if (!cls && !rawSuffix) {
    return null;
  }

  const suffixPattern = new RegExp(
    `^(?:(?:${NG_SUFFIX_IN_TEXT_SOURCE})(?:[\\s-]*|$))+$`,
    'i'
  );
  if (rawSuffix && !suffixPattern.test(rawSuffix)) {
    return null;
  }

  return {
    cls,
    suffix: rawSuffix ? normalizeNgSuffix(rawSuffix) : '',
  };
}

const NG_SUFFIX_TOKENS = [
  [/^FRLS/i, 'FRLS'],
  [/^FRHF/i, 'FRHF'],
  [/^FR/i, 'FR'],
  [/^LS/i, 'LS'],
  [/^HF/i, 'HF'],
  [/^LTx/i, 'LTx'],
  [/^хк\([^)]*\)вэ/i, 'ХК(LX)ВЭ'],
  [/^хл/i, 'ХЛ'],
  [/^нд/i, 'НД'],
  [/^t\/h/i, 'T/H'],
  [/^т\/н/i, 'Т/Н'],
];

function normalizeNgSuffix(suffix) {
  const parts = [];
  let rest = suffix;

  while (rest) {
    const separator = rest.match(/^[\s-]+/);
    if (separator) {
      rest = rest.slice(separator[0].length);
      continue;
    }

    let matched = false;
    for (const [pattern, normalized] of NG_SUFFIX_TOKENS) {
      const m = rest.match(pattern);
      if (m) {
        parts.push(normalized);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      parts.push(rest);
      break;
    }
  }

  return parts.join('-');
}

function isLikelySingleCoreSection(value) {
  const normalized = Number(String(value).replace(',', '.'));

  if (!normalized) {
    return false;
  }

  // Filters out article-like numeric tails while keeping realistic cable sections.
  return normalized > 0 && normalized <= 1000;
}

// Без NхS число может быть артикулом, категорией LAN или мощностью нагревателя.
// Неявную одну жилу допускаем только у известных семейств проводов.
function isSingleCoreMark(value) {
  const { mark } = extractEmbeddedNgAttributes(normalizeText(value));
  if (/^ПуГ?П$/iu.test(mark)) return true;
  return /^(?:А|АПВ|АПР|АПУВ|БИН|БПВЛМ?|БПВП|БПДО|БФС|МЛП|ПВЛТТ|ПТЛ-\d+|КИМЭП-К|ЛПГРС|ПГРО|ППСРВМ|ПР|РКГМ|ПАЛ|ПВ[134]|ПВАМ?|ПВВ|ПВЖ|ПВКВ|ПУВ|ПГВА|ПУГВ|МГШВ|МГТФ|НВ[134]?|ПСШ|ПВКФ|НВМ|П|ПРКА|ПВПО|ПРТО|ПМСВ|МГ|ТЭСА-ХК|ФТЭХ|H0[57][A-Z\d-]+|HABIA Cable E\d+|МП \d+-\d+|ПЭТВ?-\d+)(?:Э)?$/iu.test(
    mark
  );
}

function isSpecificSourceCategory(value) {
  const category = normalizeCategory(value);

  if (!category || category === 'Без категории') {
    return false;
  }

  if (category === 'К А Б Е Л Ь Н А Я П Р О Д У К Ц И Я') {
    return false;
  }

  return true;
}

function isCategoryCompatible(category, family) {
  const categoryKey = toComparisonKey(category);
  const familyKey = toComparisonKey(family);

  if (!familyKey) {
    return false;
  }

  if (getCategoryFamilyKeys(category).includes(familyKey)) {
    return true;
  }

  const aliasCategory = FAMILY_CATEGORY_ALIASES[family];

  if (aliasCategory && toComparisonKey(aliasCategory) === categoryKey) {
    return true;
  }

  if (family === 'NYM' && categoryKey.includes('NUM')) {
    return true;
  }

  return false;
}

function getCategoryFamilyKeys(category) {
  const categoryName = normalizeText(category).replace(/^Кабель\s+/i, '');

  return categoryName
    .split(/[,;/]+/)
    .map((part) => toComparisonKey(part))
    .filter(Boolean);
}

function toComparisonKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[Ё]/g, 'Е')
    .replace(/[.,;:()\-\/+\s]/g, '')
    .replace(/[АA]/g, 'A')
    .replace(/[ВB]/g, 'B')
    .replace(/[ЕE]/g, 'E')
    .replace(/[КK]/g, 'K')
    .replace(/[МM]/g, 'M')
    .replace(/[НH]/g, 'H')
    .replace(/[ОO]/g, 'O')
    .replace(/[РP]/g, 'P')
    .replace(/[СC]/g, 'C')
    .replace(/[ТT]/g, 'T')
    .replace(/[УY]/g, 'Y')
    .replace(/[ХX]/g, 'X');
}
