// Файл хранит общие классификаторы кабельных марок и признаки для серверной и клиентской фильтрации.

// Единый источник правды о классификации кабельных марок.
// Используется и сервером (lib/catalog.js, lib/catalogQuery.js),
// и фронтом (src/lib/catalogFilters.js). При добавлении новой флекс-марки
// правьте FLEXIBLE_MARK_RE здесь — обновятся все три потребителя.

export const FLEXIBLE_MARK_RE = /^(КГ|ПуГ|ПВС|ШВВП|КОГ|ПРГ|ПМГ)/i;

export function getWireConstruction(product) {
  const mark = product?.mark || '';
  return FLEXIBLE_MARK_RE.test(mark) ? 'многопроволочная' : 'однопроволочная';
}

// Строгая версия: смотрит только на расшифрованные жилы.
// На list-items (где cableDecoded обрезан) фронт оборачивает её
// дополнительной проверкой product.isAluminum — см. src/lib/catalogFilters.js.
export function getConductorMaterial(product) {
  if (product?.isAluminum) return 'алюминий';
  if (product?.conductorMaterial) return product.conductorMaterial;

  const decoded = product?.cableDecoded?.decoded;
  if (!Array.isArray(decoded)) return 'медь';
  const isAluminum = decoded.some((item) =>
    String(item).includes('алюминиевые жилы')
  );
  return isAluminum ? 'алюминий' : 'медь';
}

function normalizePositiveNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function getCoreVariantLabel(product) {
  const configuration = String(product?.conductorConfiguration || '').trim();
  if (configuration) return configuration;

  const cores = normalizePositiveNumber(product?.cores);
  const groundCores = normalizePositiveNumber(product?.groundCores);

  if (!cores) return '';
  return groundCores ? `${cores}+${groundCores}` : String(cores);
}
