// Назначение подтверждено документацией семейства. Незнакомые обозначения
// остаются в общем разделе до проверки, без произвольного выбора типа нагрева.
export const HEATING_CABLE_CATEGORY_SLUG = 'kabeli-nagrevatelnye';
export const RESISTIVE_HEATING_SUBCATEGORY_SLUG =
  'greyushchie-rezistivnye-kabeli';
export const SELF_REGULATING_HEATING_SUBCATEGORY_SLUG =
  'samoreguliruyushchiesya-kabeli';

const SOURCES = {
  protectowire:
    'https://www.protectowire.com/wp-content/uploads/2018/09/DS-6592Z-Protectowire-Linear-Heat-Detector.pdf',
  bun: 'https://okb-gamma.ru/upload/iblock/77c/77c36a92c1d13548db8ee64d5345c9be.pdf',
  shtl: 'https://teploluxe.ru/catalog/arkhitekturno-promyshlennyy-obogrev/obogrev_otkrytykh_ploshchadok_i_stupeney_n/',
  snf: 'https://okb-gamma.ru/upload/iblock/8a8/8a87510bd5e56353cbf18b4ebe95ebd2.pdf',
  tctex: 'https://kloepper-therm.de/fileadmin/pdf/KT_Produktuebersicht_RU.pdf',
  engkex:
    'https://www.sokol-electro.ru/promyshlennoe-primenenie/greyushchiy-kabel/engkekh1/',
  devi: 'https://www.devi.com/en/service-and-support/frequently-asked-questions',
  pnsv: 'https://pkfmetiz.ru/articles/instrukciya-po-progrevu-betona-provodom-pnsv/',
  fse: 'https://www.heat-trace.com/products/self-regulating-heating-cables/industrial-self-regulating-heating-cables',
  kstm: 'https://sst.ru/press/news/sst-group-extends-the-warranty-period-for-cables-kstm/',
  sst: 'https://sst.ru/upload/presentations/Heat_catalog_2020.pdf',
  lxtc: 'https://extherm.ru/sales/',
  gr: 'https://ssets.co.kr/?page_id=2161',
  srl: 'https://dn.ru/storage/certificates/nunicho/ss-samoreguliruyushchiesya-nagrevatelnye-kabeli-nunicho-06-03-2027.pdf',
  heatus: 'https://heatus.ru/support/warranty/',
  dph: 'https://www.devi.co.nz/files/Deviheat10v2.pdf',
};

const RULES = [
  ['shtl', /^\d+SHTL(?:-|$)/u, RESISTIVE_HEATING_SUBCATEGORY_SLUG],
  ['snf', /^СНФ(?:\s|$)/u, RESISTIVE_HEATING_SUBCATEGORY_SLUG],
  ['tctex', /^TCTEX-H(?:-|$)/u, RESISTIVE_HEATING_SUBCATEGORY_SLUG],
  ['engkex', /^ЭНГКЕХ-1(?:\s|$)/u, RESISTIVE_HEATING_SUBCATEGORY_SLUG],
  [
    'devi',
    /^DEVIFLEX\s+(?:DSIG|DTIP-18)(?:\s|$)/u,
    RESISTIVE_HEATING_SUBCATEGORY_SLUG,
  ],
  ['pnsv', /^ПНСВ(?:\s|$)/u, RESISTIVE_HEATING_SUBCATEGORY_SLUG],
  ['fse', /^\d+FSEW2(?:-|$)/u, SELF_REGULATING_HEATING_SUBCATEGORY_SLUG],
  ['kstm', /^\d+\s*КСТМ2(?:-|$)/u, SELF_REGULATING_HEATING_SUBCATEGORY_SLUG],
  ['sst', /^\d+(?:HTP|BTC)2(?:-|$)/u, SELF_REGULATING_HEATING_SUBCATEGORY_SLUG],
  [
    'lxtc',
    /^EXTHERM\s+L[XХ]TC\d+-2(?:CR)?(?:\s|$)/u,
    SELF_REGULATING_HEATING_SUBCATEGORY_SLUG,
  ],
  ['gr', /^GR40-2CR(?:\s|$)/u, SELF_REGULATING_HEATING_SUBCATEGORY_SLUG],
  [
    'srl',
    /^SRL-?(?:16|24|30|40)-2(?:CR)?(?:\s|$)/u,
    SELF_REGULATING_HEATING_SUBCATEGORY_SLUG,
  ],
  [
    'heatus',
    /^HEATUS\s+40GSR2(?:-CR)?(?:\s|$)/u,
    SELF_REGULATING_HEATING_SUBCATEGORY_SLUG,
  ],
  [
    'dph',
    // Два исходных DHP-10 V2 с вилкой сопоставлены с DPH-10 V2 по полному
    // набору признаков и мощности 20/40 W. Исходное название не исправляем.
    /^(?:DPH|DHP)-10\s+V2\s+(?:20|40)W\s+С ВИЛКОЙ$/u,
    SELF_REGULATING_HEATING_SUBCATEGORY_SLUG,
  ],
];

export function getHeatingCablePlacement(product = {}) {
  if (product.catalogCategorySlug !== HEATING_CABLE_CATEGORY_SLUG) return null;
  const designation = String(
    product.sourceName || product.name || product.fullName || product.mark || ''
  )
    .trim()
    .toUpperCase()
    .replaceAll('Ё', 'Е')
    .replace(/[–—]/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^(?:ГРЕЮЩИЙ(?: КАБЕЛЬ)?|КАБЕЛЬ ГРЕЮЩИЙ)\s+/u, '');
  const placement = (
    subcategorySlug,
    rule,
    categorySlug = HEATING_CABLE_CATEGORY_SLUG
  ) => ({
    categorySlug,
    subcategorySlug,
    rule,
    reference: SOURCES[rule] || null,
  });
  if (/^(?:ТЕРМОКАБЕЛЬ\s+)?PROTECTOWIRE\s+LINE(?:\s|$)/u.test(designation)) {
    return placement(
      'signalno-blokirovochnye',
      'protectowire',
      'kontrolnyy-kabel'
    );
  }
  if (/^БУН(?:\s|$)/u.test(designation)) {
    return placement('provoda-ustanovochnye', 'bun', 'provoda');
  }
  for (const [rule, pattern, subcategorySlug] of RULES) {
    if (pattern.test(designation)) return placement(subcategorySlug, rule);
  }
  if (
    [
      RESISTIVE_HEATING_SUBCATEGORY_SLUG,
      SELF_REGULATING_HEATING_SUBCATEGORY_SLUG,
    ].includes(product.catalogSubcategorySlug)
  ) {
    return placement(product.catalogSubcategorySlug, 'explicit-subcategory');
  }
  return null;
}
