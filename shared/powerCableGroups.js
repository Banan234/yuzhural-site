import { getPowerCableSubcategorySlug } from './powerCableClassification.js';

const POWER_GROUP_BY_SUBCATEGORY = {
  'silovoy-kabel-bronirovannyy': 'Бронированный кабель',
  'silovoy-kabel-rezinovaya-izolyaciya': 'Резиновая изоляция',
  'silovoy-kabel-polimernye-kompozicii': 'Полимерные композиции',
  'silovoy-kabel-bumazhnaya-izolyaciya': 'Бумажная изоляция',
  'silovoy-kabel-spe': 'Сшитый полиэтилен (XLPE)',
  'silovoy-kabel-pvh': 'ПВХ изоляция',
};

export const POWER_CABLE_GROUPS = Object.values(POWER_GROUP_BY_SUBCATEGORY);

function normalizeSpaces(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePowerCableBaseMark(value) {
  return normalizeSpaces(value)
    .replace(/нг.*$/iu, '')
    .replace(/\s*\(г\)\s*$/iu, '')
    .replace(/\s+з$/iu, '')
    .replace(/\s*-\s*\d+(?:[.,]\d+)?\s*$/u, '')
    .trim();
}

export function getPowerCableGroup(productOrMark) {
  const product =
    typeof productOrMark === 'string'
      ? { mark: normalizePowerCableBaseMark(productOrMark) }
      : productOrMark || {};
  const slug =
    product.catalogSubcategorySlug ||
    getPowerCableSubcategorySlug({
      ...product,
      mark: normalizePowerCableBaseMark(product.mark || product.markFamily),
    });
  return POWER_GROUP_BY_SUBCATEGORY[slug] || null;
}

export function matchesPowerCableGroup(product, selectedGroups) {
  const group = getPowerCableGroup(product);
  return (
    selectedGroups.includes(group) ||
    (selectedGroups.includes('ВВГ / бронированные') &&
      ['ПВХ изоляция', 'Бронированный кабель'].includes(group))
  );
}
