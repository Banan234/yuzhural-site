// Решает, должна ли строка прайса попасть в каталог до разбора марки и
// каталожной классификации. Производитель не влияет на это решение.

import { readFileSync } from 'fs';

const sourceCategoryMap = new Map(
  JSON.parse(
    readFileSync(
      new URL('../../data/catalogSourceMap.json', import.meta.url),
      'utf8'
    )
  ).map((entry) => [normalizeSourceCategory(entry.sourceCategory), entry])
);

const CABLE_SECTIONS = new Set(['Кабель и провод', 'Специальные кабели']);

const NON_CABLE_NAME_RE =
  /^(?:ртз[-\s]?51(?:[.,]\d+)?(?=\s|$)|колодк|колпачок\s|прокладк|шкал[а-яё]*\s|металлорукав(?=\s|$)|зажим(?:\s|$)|клемм(?:а|ник)(?:\s|$)|коробк|щит\s|свет(?:\.|ильник)|изолент|труб(?:а|ка)|угол\s|розет|выключ|выкл\.?|након|гильз|контактор|контакт|катушк|автомат|пускател|предохран|блок\s|муфта\s|таймер|кнопк|шина\s|клипс|ламп|реле\s|сальник|счетч|счётч|звонок\s|знак\s|жилет\s|строп\s|а[еп](?:\s|$)|ва(?:\s|[-\d])|диф\.?\s*авт|узо(?:\s|$)|пмл?\s|патрон(?:\s|$)|перекл|рамка(?:\s|$)|диммер(?:\s|$)|микропереключатель(?:\s|$)|опв(?:\s|$)|разъем(?:\s|$)|соединитель(?:\s|$)|рубильник(?:\s|$)|опв(?:-|\s|$))/iu;

// Для неизвестной исходной категории не пытаемся «угадать» кабель по
// производителю: нужен явный след кабельного изделия в названии. Всё остальное
// уходит в review, но не теряется: строка сохраняется, а неопределённость
// фиксируется в отчёте для последующей проверки классификации.
const CABLE_NAME_RE =
  /(?:кабел\w*|провод\w*|шнур\w*|жгут\w*|оптическ\w*|волокон\w*|ввг\w*|аввг\w*|акввг\w*|кввг\w*|кг\w*|мкэш\w*|мгтф\w*|мгшв\w*|пв[1234]?\w*|пугв\w*|пув\w*|пва\w*|пвам\w*|пвкв\w*|пгва\w*|пгро\w*|^пмтк\w*|ппсрвм\w*|псрвм\w*|нв[мэ]?\w*|ркгм\w*|рк\s*\d|(?<![\p{L}\p{N}])ок[а-яa-z]*\w*|дп[а-яa-z-]*\w*|rg[-\s]?\d+|utp\w*|ftp\w*|s\/ftp|f\/utp|sf\/utp)/iu;

function normalizeSourceCategory(value) {
  return String(value ?? '')
    .replace(/ё/giu, 'е')
    .replace(/а/giu, 'a')
    .replace(/е/giu, 'e')
    .replace(/о/giu, 'o')
    .replace(/р/giu, 'p')
    .replace(/с/giu, 'c')
    .replace(/у/giu, 'y')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function getSourceCategory(value) {
  return sourceCategoryMap.get(normalizeSourceCategory(value)) || null;
}

function normalizeDispositionUnit(value) {
  const unit = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ');

  if (['м', 'км', 'метр', 'метра', 'метров'].includes(unit)) return 'м';
  if (['шт', 'шт.', 'штука', 'штуки', 'штук'].includes(unit)) return 'шт';
  return unit;
}

export function resolveProductDisposition({ name, sourceCategory, unit } = {}) {
  const sourceName = String(name ?? '').trim();
  const source = String(sourceCategory ?? '').trim();
  const normalizedUnit = normalizeDispositionUnit(unit);

  const explicitNonCable = sourceName.match(NON_CABLE_NAME_RE);
  if (explicitNonCable) {
    return {
      status: 'exclude',
      reason: 'explicit_non_cable_name',
      evidence: explicitNonCable[0],
    };
  }

  const sourceCategoryEntry = getSourceCategory(source);
  if (sourceCategoryEntry && !CABLE_SECTIONS.has(sourceCategoryEntry.section)) {
    return {
      status: 'exclude',
      reason: 'source_category_non_cable',
      evidence: sourceCategoryEntry.sourceCategory || source,
    };
  }

  if (
    sourceCategoryEntry &&
    !sourceCategoryEntry.generic &&
    CABLE_SECTIONS.has(sourceCategoryEntry.section)
  ) {
    return {
      status: 'publish',
      reason: 'source_category_cable',
      evidence: sourceCategoryEntry.sourceCategory || source,
    };
  }

  const cableEvidence = sourceName.match(CABLE_NAME_RE);
  if (cableEvidence) {
    return {
      status: 'publish',
      reason: 'cable_name_evidence',
      evidence: cableEvidence[0],
    };
  }

  // Единица измерения и размерность не подтверждают, что это кабель.
  // Неопределённую строку сохраняем для review, а последующий классификатор
  // сможет подтвердить её по конкретной марке.
  if (normalizedUnit === 'м') {
    return {
      status: 'review',
      reason: 'unit_meter_requires_classification',
      evidence: normalizedUnit,
    };
  }

  if (normalizedUnit === 'шт') {
    return {
      status: 'exclude',
      reason: 'unit_piece_fallback',
      evidence: normalizedUnit,
    };
  }

  return {
    status: 'review',
    reason: 'insufficient_cable_evidence',
    evidence: sourceCategory || sourceName,
  };
}

export function isLikelyCableName(value) {
  return CABLE_NAME_RE.test(String(value ?? '').trim());
}
