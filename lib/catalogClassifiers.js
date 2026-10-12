// Файл хранит общие классификаторы кабельных марок и признаки для серверной и клиентской фильтрации.

// Единый источник правды о классификации кабельных марок.
// Используется и сервером (lib/catalog.js, lib/catalogQuery.js),
// и фронтом (src/lib/catalogFilters.js). При добавлении новой флекс-марки
// правьте FLEXIBLE_MARK_RE здесь — обновятся все три потребителя.

export const FLEXIBLE_MARK_RE = /^(КГ|ПуГ|ПВС|ШВВП|КОГ|ПРГ|ПМГ)/i;

const OPTICAL_MARK_RE = /^(?:ОК[А-ЯЁA-Z]|ОМЗКГЦ)/iu;
const KNOWN_STRANDED_MARK_RE =
  /^(?:ПВ3(?:$|[^\p{L}])|КИП(?:ВЭ|Э)ПБП|ПВАМ?|СИП|АС(?:\s|$))/iu;
const KNOWN_SOLID_MARK_RE =
  /^(?:КАЭФВ|ПВ1(?:$|[^\p{L}])|ПУВ(?:$|[^\p{L}])|ПАВ)/iu;
const STANDARD_ELECTRICAL_CATEGORIES = new Set([
  'silovoy-kabel',
  'kontrolnyy-kabel',
  'gibkiy-kabel',
  'provoda',
  'montazhnyy-kabel',
]);

export function getWireConstruction(product) {
  if (product?.wireConstruction) return product.wireConstruction;
  const mark = String(product?.mark || '');
  if (OPTICAL_MARK_RE.test(mark)) return 'не применимо';
  if (KNOWN_SOLID_MARK_RE.test(mark)) return 'однопроволочная';
  if (FLEXIBLE_MARK_RE.test(mark) || KNOWN_STRANDED_MARK_RE.test(mark)) {
    return 'многопроволочная';
  }
  return 'не определено';
}

// Строгая версия: смотрит только на расшифрованные жилы.
// На list-items (где cableDecoded обрезан) фронт оборачивает её
// дополнительной проверкой product.isAluminum — см. src/lib/catalogFilters.js.
export function getConductorMaterial(product) {
  if (product?.conductorMaterial) return product.conductorMaterial;
  const mark = String(product?.mark || '');
  if (OPTICAL_MARK_RE.test(mark)) return 'не применимо';
  // В этих сериях внутренняя А означает не алюминий: побуквенная расшифровка
  // марки давала ложный положительный результат.
  if (/^(?:КАЭФВ|КИП(?:ВЭ|Э)ПБП|ПВАМ?)/iu.test(mark)) return 'медь';
  if (product?.isAluminum) return 'алюминий';
  if (
    /^А/iu.test(mark) &&
    product?.cableDecoded?.decoded?.some((item) =>
      String(item).includes('алюминиевые жилы')
    )
  ) {
    return 'алюминий';
  }

  if (/^(?:СИП|ПАВ|ЦА)/iu.test(mark)) return 'алюминий';
  if (STANDARD_ELECTRICAL_CATEGORIES.has(product?.catalogCategorySlug)) {
    if (/^А/iu.test(mark)) return 'алюминий';
    // Для стандартных отечественных электрических марок без А в обозначении
    // жила медная; для специальных/импортных марок это правило не применяется.
    if (/^[Б-ЯЁ]/iu.test(mark) && !/А/iu.test(mark)) return 'медь';
  }

  const decoded = product?.cableDecoded?.decoded;
  if (!Array.isArray(decoded)) return 'не определено';
  const isAluminum = decoded.some((item) =>
    String(item).includes('алюминиевые жилы')
  );
  if (isAluminum && !mark) return 'алюминий';
  const isCopper = decoded.some((item) => String(item).includes('медные жилы'));
  return isCopper ? 'медь' : 'не определено';
}

function normalizePositiveNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function getCoreVariantLabel(product) {
  const cores = normalizePositiveNumber(product?.cores);
  const groupCores = normalizePositiveNumber(product?.groupCores);
  const groundCores = normalizePositiveNumber(product?.groundCores);

  if (!cores) return '';

  const totalCores = cores * (groupCores || 1) + (groundCores || 0);
  return String(totalCores);
}
