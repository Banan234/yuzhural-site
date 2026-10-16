import { createHash } from 'node:crypto';
import { parseProductName } from './priceParser.js';

const letters = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ь: '',
  ъ: '',
};
const canonicalValue = (value) =>
  Array.isArray(value)
    ? value.map(canonicalValue)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonicalValue(value[key])])
        )
      : value;
export const visualHash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[а-яё]/gu, (c) => letters[c])
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
const number = (value) =>
  value != null &&
  value !== '' &&
  Number.isFinite(Number(String(value).replace(',', '.'))) &&
  Number(String(value).replace(',', '.')) > 0
    ? Number(String(value).replace(',', '.'))
    : null;
const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[–—]/gu, '-')
    .replace(/Ё/gu, 'Е')
    .replace(/нг\s*\(?\s*[АA]\s*\)?\s*-?\s*(FRLS|FRHF|LS|HF)/giu, 'нг(А)-$1')
    .replace(/нг\s*\(\s*[АA]\s*\)/giu, 'нг(А)')
    .replace(/нг\s+-?\s*(LS|HF)/giu, 'нг-$1')
    .replace(/^\s*(?:(?:кабель|провод|шнур)\s+)+/iu, '')
    .trim();
const compact = (value) =>
  normalizeText(value).toUpperCase().replace(/\s/gu, '');
const bool = (value) => (typeof value === 'boolean' ? value : undefined);
const first = (object, keys) =>
  keys
    .map((k) => object?.[k])
    .find((v) => v !== undefined && v !== null && v !== '');
const normalizeMaterial = (value) =>
  ({
    медь: 'copper',
    медная: 'copper',
    copper: 'copper',
    алюминий: 'aluminium',
    алюминиевая: 'aluminium',
    aluminum: 'aluminium',
    aluminium: 'aluminium',
  })[String(value).toLowerCase()] || null;
const normalizeConstruction = (value) =>
  ({
    solid: 'solid',
    stranded: 'stranded',
    однопроволочная: 'solid',
    многопроволочная: 'stranded',
  })[String(value).toLowerCase()] || null;
const normalizeGeometry = (value) =>
  ({
    round: 'round',
    круглый: 'round',
    круглая: 'round',
    flat: 'flat',
    плоский: 'flat',
    плоская: 'flat',
    'twisted-bundle': 'twisted-bundle',
  })[String(value).toLowerCase()] || null;
const colorNames = {
  коричневый: 'brown',
  коричневая: 'brown',
  коричн: 'brown',
  корич: 'brown',
  синий: 'blue',
  синяя: 'blue',
  син: 'blue',
  голубой: 'blue',
  голубая: 'blue',
  черный: 'black',
  чёрный: 'black',
  черн: 'black',
  черная: 'black',
  белый: 'white',
  белая: 'white',
  бел: 'white',
  серый: 'grey',
  сер: 'grey',
  серая: 'grey',
  красный: 'red',
  красн: 'red',
  красная: 'red',
  желтый: 'yellow',
  желт: 'yellow',
  зеленый: 'green',
  зел: 'green',
  оранжевый: 'orange',
  оранж: 'orange',
  розовый: 'pink',
  роз: 'pink',
  фиолетовый: 'violet',
  фиол: 'violet',
  'yellow-green': 'yellow-green',
  'ж/з': 'yellow-green',
  'ж/зел': 'yellow-green',
  'жел-зел': 'yellow-green',
  'желто-зеленый': 'yellow-green',
  'желто-зеленая': 'yellow-green',
};
export function normalizeCoreColor(value) {
  const c = String(value).toLowerCase().replace(/ё/gu, 'е').trim();
  return (
    colorNames[c] ||
    ([
      'brown',
      'blue',
      'black',
      'white',
      'grey',
      'red',
      'yellow',
      'green',
      'orange',
      'pink',
      'violet',
    ].includes(c)
      ? c
      : null)
  );
}

/** Normalization never modifies the source record; missing category A is not invented. */
export function normalizeCableFamily(product, { knowledge, rules }) {
  const originalName = String(
    product.sourceName ??
      product.fullName ??
      product.name ??
      product.title ??
      ''
  );
  const normalizedName = normalizeText(originalName),
    parsed = parseProductName(normalizedName);
  const name =
    parsed.manufacturerMatch?.nameWithoutManufacturer || normalizedName;
  const dimension = name.search(/\d+(?:[.,]\d+)?\s*[xх×*]\s*\d/iu);
  let heading = compact(
    dimension >= 0 ? name.slice(0, dimension) : parsed.mark || name
  );
  const aliases = Object.fromEntries(
    Object.entries(rules.aliases || {}).map(([a, b]) => [
      compact(a),
      compact(b),
    ])
  );
  for (const alias of Object.keys(aliases).sort((a, b) => b.length - a.length))
    if (heading.startsWith(alias)) {
      heading = aliases[alias] + heading.slice(alias.length);
      break;
    }
  const records = new Map(
    (knowledge.families || []).map((f) => [
      aliases[compact(f.mark)] || compact(f.mark),
      f,
    ])
  );
  const names = [
    ...new Set([...Object.keys(rules.families), ...records.keys()]),
  ].sort((a, b) => b.length - a.length);
  let base = names.find((k) => {
    if (!heading.startsWith(k)) return false;
    const rest = heading.slice(k.length);
    return !rest || /^(?:-|НГ|Э(?:НГ|$)|FR|LS|HF|ХЛ|\d)/u.test(rest);
  });
  if (base === 'ВВГ' && /^(?:-?П)(?:НГ|-|$)/u.test(heading.slice(base.length)))
    base = 'ВВГ-П';
  if (base === 'АВВГ' && /^(?:-?П)(?:НГ|-|$)/u.test(heading.slice(base.length)))
    base = 'АВВГ-П';
  if (
    ['ВВГ', 'АВВГ'].includes(base) &&
    [...(parsed.attributes || []), ...(product.attributes || [])].some((a) =>
      /^п$/iu.test(a)
    )
  )
    base += '-П';
  base = aliases[base] || base;
  const rawBase =
    base ||
    aliases[compact(parsed.mark || product.markFamily || product.mark)] ||
    compact(parsed.mark || product.markFamily || product.mark) ||
    'UNKNOWN';
  const attributes = [
    ...new Set(
      [...(parsed.attributes || []), ...(product.attributes || [])].map(String)
    ),
  ];
  let suffix = heading.startsWith(rawBase) ? heading.slice(rawBase.length) : '';
  const designation = [suffix, ...attributes].join(' ').toUpperCase();
  const fire = designation.match(
    /НГ\s*(?:\(([АAБВГД])\))?\s*-?\s*(FRLS|FRHF|LSLTX|LS|HF)?/u
  );
  const modification = fire
    ? `ng${fire[1] ? `-${fire[1].replace('А', 'A').toLowerCase()}` : ''}${fire[2] ? `-${fire[2].toLowerCase()}` : ''}`
    : '';
  const toxicity =
    /(?:^|[-\s])LTX(?:$|[-\s])/u.test(designation) &&
    !modification.endsWith('ltx')
      ? '-ltx'
      : '';
  const climate =
    /(?:^|[-\s])ХЛ(?:$|[-\s])/u.test(designation) || suffix.endsWith('ХЛ')
      ? 'hl'
      : '';
  const suffixKey = [modification + toxicity, climate]
    .filter(Boolean)
    .join('-');
  const baseId = slug(rawBase);
  const unresolvedFamilySuffix = suffix
    .replace(/НГ(?:\([АAБВГД]\))?-?(?:FRLS|FRHF|LSLTX|LS|HF)?/gu, '')
    .replace(/ХЛ|LTX/gu, '')
    .replace(/[-\s]/gu, '');
  const familyId = `${baseId}${suffixKey ? `${modification ? '' : '-'}${suffixKey}` : ''}`;
  return {
    originalName,
    normalizedName,
    parsed,
    baseFamily: rawBase,
    familyId,
    modification: modification || null,
    climate: climate || null,
    attributes,
    knowledgeRecord: records.get(rawBase) || null,
    familyRecognized: !!base,
    suffix,
    unresolvedFamilySuffix,
  };
}

/** Every appearance field participates, including unknowns. Section is opt-in only. */
export function makeVisualIdentity(profile) {
  const colorRole = profile.coreColorScheme || 'colors-unknown';
  const key = [
    profile.family,
    `${profile.cores ?? 'unknown'}c`,
    profile.conductorConstruction || 'construction-unknown',
    profile.geometry || 'geometry-unknown',
    colorRole,
    `p-${visualHash(profile).slice(0, 16)}`,
  ]
    .map(slug)
    .join('__');
  return {
    visualProfile: profile,
    visualProfileId: visualHash(profile),
    visualKey: key,
  };
}

const profileFields = [
  'productType',
  'conductorMaterial',
  'conductorConstruction',
  'conductorShape',
  'geometry',
  'hasOuterJacket',
  'outerJacket',
  'outerJacketMaterial',
  'insulation',
  'armor',
  'armorType',
  'shield',
  'shieldType',
  'filler',
  'specialElements',
  'hasPE',
  'hasN',
  'coreColors',
];

export function classifyCableVisualProduct(product, context) {
  const { rules, knowledge, colorRules = { skuOverrides: {} } } = context;
  const family = normalizeCableFamily(product, context),
    { parsed, baseFamily } = family;
  const issues = [],
    notes = [],
    evidence = {};
  const add = (code, message) => issues.push({ code, message });
  const source = family.knowledgeRecord?.source;
  const kbSource =
    typeof source === 'string' ? knowledge.sources?.[source] : source;
  let rule = {
    ...(rules.families[baseFamily] || {}),
    ...(rules.familyOverrides?.[family.familyId] || {}),
  };
  const values = {};
  for (const field of profileFields) values[field] = rule[field] ?? null;
  values.specialElements = [...(rule.specialElements || [])];
  const ruleSource = rules.sources?.[rule.source] || kbSource || null;
  for (const field of profileFields)
    if (values[field] !== null)
      evidence[field] = { basis: 'family-rule', source: ruleSource };
  const description = [
    family.knowledgeRecord?.description,
    ...(family.knowledgeRecord?.tokens || []).map((t) => t[1]),
  ]
    .filter(Boolean)
    .join(' ');
  if (values.productType == null) {
    const group = family.knowledgeRecord?.group || '';
    values.productType = /контроль/iu.test(group)
      ? 'control-cable'
      : /монтаж/iu.test(group)
        ? 'installation-cable'
        : /провод/iu.test(group)
          ? 'wire'
          : /силов/iu.test(group)
            ? 'power-cable'
            : /^СИП/u.test(baseFamily)
              ? 'sip'
              : /телефон/iu.test(description)
                ? 'telephone-cable'
                : null;
  }
  const inferred = {
    conductorMaterial: /алюминиев/iu.test(description)
      ? 'aluminium'
      : /медн/iu.test(description)
        ? 'copper'
        : null,
    geometry: /плоск/iu.test(description) ? 'flat' : null,
    conductorConstruction:
      /многопроволочн/iu.test(description) &&
      !/одно.?\s*или\s*многопроволочн/iu.test(description)
        ? 'stranded'
        : null,
    armor: /без брони/iu.test(description)
      ? false
      : /брон[яё]|бронирован/iu.test(description)
        ? true
        : null,
    shield: /экран/iu.test(description) ? true : null,
    hasOuterJacket: /без (?:общей )?оболочки/iu.test(description)
      ? false
      : null,
  };
  for (const [key, value] of Object.entries(inferred))
    if (values[key] === null && value !== null) {
      values[key] = value;
      evidence[key] = { basis: 'knowledge-family', source: kbSource };
    }
  if (!family.familyRecognized)
    add('unknown_family', `Не подтверждено семейство: ${baseFamily}`);
  const rawStructuredMark = compact(product.markFamily || product.mark || '');
  const structuredMark = rules.aliases[rawStructuredMark] || rawStructuredMark;
  if (
    structuredMark &&
    structuredMark !== baseFamily &&
    structuredMark !== compact(parsed.mark) &&
    !(
      baseFamily === `${structuredMark}-П` ||
      baseFamily === `${structuredMark}Э`
    )
  )
    add(
      'family_conflict',
      `Название и структурированная марка расходятся: ${baseFamily} / ${structuredMark}`
    );
  const checkNumber = (field, sourceField = field) => {
    const a = number(parsed[sourceField]),
      b = number(product[sourceField]);
    if (a && b && a !== b)
      add(
        'structured_conflict',
        `Название и данные расходятся: ${field} (${a} / ${b})`
      );
    return b ?? a;
  };
  const primaryCores = checkNumber('cores'),
    section = checkNumber('section', 'crossSection');
  const auxiliaryCores = checkNumber('auxiliaryCores', 'groundCores') || 0;
  const auxiliarySection = checkNumber('auxiliarySection', 'groundSection');
  const pairs = checkNumber('groupCores') || 1;
  const cores = primaryCores ? primaryCores * pairs + auxiliaryCores : null;
  if (!Number.isInteger(cores) || cores < 1)
    add('missing_cores', 'Не определено точное число проводников');
  if (!section) add('missing_section', 'Не определён размер жилы');
  if (parsed.parsingWarnings?.length || product.parsingWarnings?.length)
    add(
      'parsing_warning',
      [
        ...(parsed.parsingWarnings || []),
        ...(product.parsingWarnings || []),
      ].join('; ')
    );
  if (
    pairs > 1 ||
    parsed.conductorConfiguration ||
    product.conductorConfiguration
  )
    add(
      'special_configuration',
      'Парная/групповая конфигурация требует отдельного правила'
    );
  if (auxiliaryCores)
    add(
      'auxiliary_role_unknown',
      'Дополнительная жила не считается PE автоматически: требуется назначение и материал'
    );
  const constructionTokens = family.attributes.join(' ').toLowerCase();
  const explicitSolid = /(?:^|\s)(?:ок|ож|ос)(?:\s|$)/u.test(
    constructionTokens
  );
  const explicitStranded = /(?:^|\s)(?:мк|мж|мс)(?:\s|$)/u.test(
    constructionTokens
  );
  if (explicitSolid && explicitStranded)
    add(
      'construction_conflict',
      'Одновременно указаны одно- и многопроволочное исполнения'
    );
  const structured = { ...(product.visualCharacteristics || {}) };
  const material = normalizeMaterial(
    first(product, ['conductorMaterial', 'material'])
  );
  const construction = normalizeConstruction(
    first(product, ['conductorConstruction', 'wireConstruction'])
  );
  const geometry = normalizeGeometry(first(product, ['geometry', 'shape']));
  if (material) structured.conductorMaterial = material;
  if (construction) structured.conductorConstruction = construction;
  const strandCount = number(product.conductorStrandCount);
  if (
    strandCount &&
    construction &&
    construction !== (strandCount === 1 ? 'solid' : 'stranded')
  )
    add(
      'construction_conflict',
      'Число проволок и описание конструкции расходятся'
    );
  if (strandCount)
    structured.conductorConstruction = strandCount === 1 ? 'solid' : 'stranded';
  const conductorClass = number(product.conductorClass);
  if (
    conductorClass &&
    structured.conductorConstruction &&
    structured.conductorConstruction !==
      (conductorClass === 1 ? 'solid' : 'stranded')
  )
    add(
      'construction_conflict',
      'Класс жилы и описание конструкции расходятся'
    );
  if (conductorClass)
    structured.conductorConstruction =
      conductorClass === 1 ? 'solid' : 'stranded';
  if (geometry) structured.geometry = geometry;
  for (const [field, keys] of Object.entries({
    hasPE: ['hasPE'],
    hasN: ['hasN'],
    shield: ['hasShield', 'shield'],
    armor: ['hasArmor', 'isArmored', 'armor'],
    hasOuterJacket: ['hasOuterJacket'],
    filler: ['filler', 'hasFiller'],
  })) {
    const v = first(product, keys);
    if (typeof v === 'boolean' || (field === 'filler' && typeof v === 'string'))
      structured[field] = v;
  }
  if (explicitSolid || explicitStranded) {
    const v = explicitStranded ? 'stranded' : 'solid';
    if (
      structured.conductorConstruction &&
      structured.conductorConstruction !== v
    )
      add(
        'construction_conflict',
        'Данные и маркировка исполнения жилы расходятся'
      );
    else structured.conductorConstruction = v;
    structured.conductorShape = /(?:^|\s)[мо]с(?:\s|$)/u.test(
      constructionTokens
    )
      ? 'sector'
      : 'circular';
  }
  if (rule.constructionBands && section) {
    const band = rule.constructionBands.find((b) => section <= b.maxSection);
    if (band) {
      values.conductorConstruction = band.value;
      evidence.conductorConstruction = {
        basis: 'family-section-band',
        source: ruleSource,
      };
    }
  }
  for (const field of profileFields)
    if (structured[field] !== undefined && structured[field] !== null) {
      const v = structured[field];
      if (
        values[field] !== null &&
        JSON.stringify(values[field]) !== JSON.stringify(v) &&
        field !== 'specialElements'
      )
        add(
          'structured_conflict',
          `Правило семейства и структурированные данные расходятся: ${field}`
        );
      values[field] = v;
      evidence[field] = { basis: 'structured-or-explicit-designation' };
    }
  // Former parser's hasGroundCore=false is a parse outcome, never proof of absent PE.
  const explicitColors =
    product.coreColors ||
    product.insulationColors ||
    structured.coreColors ||
    colorRules.skuOverrides?.[product.sku]?.colors;
  if (explicitColors) {
    const colors = Array.isArray(explicitColors)
      ? explicitColors.map(normalizeCoreColor)
      : null;
    if (!colors || colors.some((c) => !c) || colors.length !== cores)
      add(
        'color_conflict',
        'Неизвестные цвета или число цветов не совпадает с числом жил'
      );
    else {
      values.coreColors = colors;
      evidence.coreColors = { basis: 'explicit-core-colors' };
    }
  }
  if (!Array.isArray(values.specialElements)) {
    add('invalid_structured_value', 'specialElements должен быть массивом');
    values.specialElements = ['invalid'];
  }
  const text = family.normalizedName.toLowerCase();
  const declaredColors = [
    ...new Set(family.attributes.map(normalizeCoreColor).filter(Boolean)),
  ];
  if (cores === 1 && values.hasOuterJacket === false && !values.coreColors) {
    const tokens = family.attributes.map(normalizeCoreColor).filter(Boolean);
    if (/ж\s*\/\s*з|желт[оа]-?зелен|желто.?зелен/u.test(text))
      tokens.push('yellow-green');
    const colors = [...new Set(tokens)];
    if (colors.length === 1) {
      values.coreColors = colors;
      evidence.coreColors = { basis: 'designation-color' };
    } else if (colors.length > 1)
      add('color_conflict', 'В названии несколько цветов одиночного провода');
  }
  if (values.coreColors) {
    const pe = values.coreColors.includes('yellow-green'),
      neutral = values.coreColors.includes('blue');
    if (bool(values.hasPE) !== undefined && values.hasPE !== pe)
      add('color_conflict', 'PE и цветовая схема противоречат друг другу');
    values.hasPE = pe;
    // Blue is visible; neutral function is recorded separately, not inferred from color.
    notes.push(
      neutral
        ? 'Синий цвет не доказывает функцию N; источник функции хранится отдельно.'
        : ''
    );
  }
  if (values.hasOuterJacket === true) {
    const jacket =
      first(product, ['outerJacketColor', 'jacketColor']) ||
      structured.outerJacket;
    const match = family.attributes.map(normalizeCoreColor).filter(Boolean);
    if (jacket) {
      values.outerJacket = normalizeCoreColor(jacket) || String(jacket);
      evidence.outerJacket = { basis: 'structured-jacket' };
    } else if (match.length === 1) {
      values.outerJacket = match[0];
      evidence.outerJacket = { basis: 'designation-jacket-color' };
    }
  }
  if (values.hasOuterJacket === false) values.outerJacket = 'none';
  const structural = family.attributes.filter((a) =>
    /^(?:Э|ЭФ|ЭМ|Б)$/iu.test(a)
  );
  for (const a of structural) {
    if (/^Э/iu.test(a)) {
      values.shield = true;
      if (!values.shieldType)
        add('shield_detail_unknown', `Не уточнён тип/расположение экрана ${a}`);
    } else {
      values.armor = true;
      if (!values.armorType)
        add('armor_detail_unknown', 'Не уточнён тип брони');
    }
  }
  const fireBarrier = /FR(?:LS|HF)?/iu.test(
    family.modification || family.attributes.join(' ')
  );
  if (fireBarrier) values.specialElements.push('fire-barrier');
  for (const field of [
    'screenCrossSection',
    'concentricConductorCrossSection',
    'doubleInsulationThickness',
    'opticalFiberCoreDiameter',
    'opticalFiberCladdingDiameter',
  ])
    if (number(product[field])) {
      values.specialElements.push(`${field}:${number(product[field])}`);
      add('special_structure', `Требуется отдельная конструкция: ${field}`);
    }
  const unknownAttrs = family.attributes.filter(
    (a) =>
      !/^(?:нг(?:\([АAБВГД]\))?(?:-?(?:LS|HF|FRLS|FRHF|LSLTx))?(?:-ХЛ)?|ХЛ|LTx|LS|FRLS|FRHF|HF|п|мк|мж|мс|ок|ож|ос|Э|ЭФ|ЭМ|Б|ГОСТ|ТУ|-|черн\.?|черный|чёрный|бел|белый|оранж|ж\/з|синий|син|голубой|коричневый|красный|серый|желтый|зеленый|розовый|фиолетовый)$/iu.test(
        a
      ) && !normalizeCoreColor(a)
  );
  if (unknownAttrs.length)
    add(
      'unverified_modifier',
      `Не разобраны модификаторы: ${unknownAttrs.join(', ')}`
    );
  if (family.unresolvedFamilySuffix)
    add(
      'unverified_family_suffix',
      `Не разобрано исполнение семейства: ${family.unresolvedFamilySuffix}`
    );
  if (/HF/iu.test(family.modification || '')) {
    values.insulation = 'halogen-free-compound';
    notes.push(
      'HF: состав материала требуется уточнять по документу исполнения.'
    );
  }
  if (values.shield === true && !values.shieldType)
    add('shield_detail_unknown', 'Не определён тип экрана');
  if (values.armor === true && !values.armorType)
    add('armor_detail_unknown', 'Не определён тип брони');
  const skuOverride = rules.skuOverrides?.[product.sku];
  if (skuOverride) {
    if (!skuOverride.source || !skuOverride.reason)
      add(
        'override_without_evidence',
        'Ручное правило требует source и reason'
      );
    else
      for (const field of profileFields)
        if (skuOverride[field] !== undefined) {
          values[field] = skuOverride[field];
          evidence[field] = {
            basis: 'reviewed-sku-override',
            source: skuOverride.source,
            reason: skuOverride.reason,
          };
        }
  }
  if (!Array.isArray(values.specialElements)) {
    add('invalid_structured_value', 'specialElements должен быть массивом');
    values.specialElements = ['invalid'];
  }
  values.specialElements = [...new Set(values.specialElements)].sort();
  if (
    values.coreColors !== null &&
    (!Array.isArray(values.coreColors) ||
      values.coreColors.length !== cores ||
      values.coreColors.some((c) => !normalizeCoreColor(c)))
  )
    add('color_conflict', 'Некорректная итоговая цветовая схема');
  if (typeof values.filler === 'boolean')
    values.filler = values.filler ? 'present-unspecified' : 'none';
  if (values.filler === 'present-unspecified')
    add(
      'filler_detail_unknown',
      'Наличие заполнения известно, тип не определён'
    );
  for (const field of ['hasPE', 'hasN', 'armor', 'shield', 'hasOuterJacket'])
    if (values[field] !== null && typeof values[field] !== 'boolean')
      add(
        'invalid_structured_value',
        `Ожидалось логическое значение: ${field}`
      );
  if (
    values.conductorMaterial &&
    ![
      'copper',
      'aluminium',
      'aluminium-alloy',
      'steel',
      'copper-tinned',
      'copper-clad-steel',
    ].includes(values.conductorMaterial)
  )
    add('invalid_structured_value', 'Не подтверждён материал проводника');
  if (
    values.conductorConstruction &&
    !['solid', 'stranded'].includes(values.conductorConstruction)
  )
    add('invalid_structured_value', 'Не подтверждена конструкция проводника');
  if (
    values.geometry &&
    ![
      'round',
      'flat',
      'twisted-bundle',
      'coaxial',
      'optical',
      'bare-conductor',
    ].includes(values.geometry)
  )
    add('invalid_structured_value', 'Не подтверждена геометрия изделия');
  // Unknown roles may be retained when colors are explicit: they do not alter this illustration.
  for (const field of [
    'productType',
    'conductorMaterial',
    'conductorConstruction',
    'conductorShape',
    'geometry',
    'hasOuterJacket',
    'outerJacket',
    'insulation',
    'armor',
    'shield',
    'filler',
    'coreColors',
  ])
    if (values[field] === null)
      add(`unknown_${field}`, `Не определено: ${field}`);
  if (values.hasOuterJacket === true && values.outerJacketMaterial === null)
    add('unknown_outerJacketMaterial', 'Не определён материал общей оболочки');
  const colorScheme = values.coreColors
    ? `${cores}core-${values.coreColors.includes('yellow-green') ? 'pe' : 'no-pe'}-${values.coreColors.map(slug).join('-')}`
    : null;
  let sectionKey = null;
  if (rule.sectionAffectsVisual === true) {
    const band = rule.visualSectionBands?.find((b) => section <= b.maxSection);
    sectionKey = rule.visualSectionBands ? band?.key || null : `s-${section}`;
    if (!sectionKey)
      add('missing_section_band', 'Не задан визуальный диапазон сечения');
  }
  const profile = {
    family: family.familyId,
    cores,
    primaryCores,
    auxiliaryCores,
    pairedGroupSize: pairs > 1 ? pairs : null,
    ...Object.fromEntries(profileFields.map((f) => [f, values[f]])),
    coreColorScheme: colorScheme,
    declaredColors,
    unresolvedModifiers: unknownAttrs.map((a) => compact(a)).sort(),
    unresolvedFamilySuffix: family.unresolvedFamilySuffix || null,
    conductorShape: values.conductorShape,
    sectionKey,
    auxiliarySectionKey: auxiliaryCores ? auxiliarySection : null,
  };
  const uniqueIssues = [
    ...new Map(issues.map((i) => [`${i.code}:${i.message}`, i])).values(),
  ];
  const confidence = uniqueIssues.length
    ? 'low'
    : Object.entries(evidence).some(
          ([, e]) =>
            e.basis.startsWith('family') || e.basis === 'knowledge-family'
        )
      ? 'medium'
      : 'high';
  return {
    sku: product.sku ?? null,
    productId: product.id ?? null,
    slug: product.slug ?? null,
    originalName: family.originalName,
    displayName: product.fullName || product.name || family.originalName,
    baseFamily,
    familyId: family.familyId,
    familyRecognized: family.familyRecognized,
    modification: family.modification,
    cores,
    primaryCores,
    section,
    sectionUnit:
      family.knowledgeRecord?.dimension === 'diameter'
        ? 'diameter-mm'
        : family.knowledgeRecord?.dimension === 'section' || rule.productType
          ? 'mm2'
          : 'unknown',
    auxiliaryCores,
    auxiliarySection,
    construction: values.conductorConstruction,
    geometry: values.geometry,
    hasPE: values.hasPE,
    hasN: values.hasN,
    ...makeVisualIdentity(profile),
    visualClassification: uniqueIssues.length ? 'needs_review' : 'recognized',
    classificationConfidence: confidence,
    issues: uniqueIssues,
    notes: notes.filter(Boolean),
    evidence,
    existingRenderingDefault: values.conductorConstruction
      ? null
      : 'solid (previous illustration policy only; not a classification fact)',
    currentImage: null,
    imageStatus: 'NEEDS_REVIEW',
    candidateImages: [],
  };
}

/** Compare known appearance facts only; ambiguity is never an approval. */
export function compareVisualAsset(row, asset) {
  const p = row.visualProfile,
    a = asset.visualProfile,
    mismatches = [],
    unknown = [];
  for (const key of [
    'family',
    'cores',
    'primaryCores',
    'auxiliaryCores',
    'pairedGroupSize',
    'conductorMaterial',
    'conductorConstruction',
    'conductorShape',
    'geometry',
    'hasOuterJacket',
    'outerJacket',
    'outerJacketMaterial',
    'insulation',
    'armor',
    'armorType',
    'shield',
    'shieldType',
    'filler',
    'coreColors',
    'specialElements',
    'sectionKey',
    'auxiliarySectionKey',
  ]) {
    if (p[key] === null || a[key] === null) {
      if (p[key] !== a[key]) unknown.push(key);
      continue;
    }
    if (JSON.stringify(p[key]) !== JSON.stringify(a[key])) mismatches.push(key);
  }
  return {
    compatible:
      !mismatches.length &&
      !unknown.length &&
      row.visualClassification === 'recognized' &&
      asset.status === 'approved',
    mismatches,
    unknown,
  };
}
