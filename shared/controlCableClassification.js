export const CONTROL_CABLE_CATEGORY_SLUG = 'kontrolnyy-kabel';
export const CONTROL_SUBCATEGORY_SLUG = 'kontrolnye-kabeli';
export const CONTROL_SIGNAL_SUBCATEGORY_SLUG = 'signalno-blokirovochnye';
export const LEGACY_FIRE_CATEGORY_SLUG = 'kabeli-pozharnoy-signalizacii';
export const CONTROL_CATEGORY_ALIASES = {
  [LEGACY_FIRE_CATEGORY_SLUG]: CONTROL_SIGNAL_SUBCATEGORY_SLUG,
  'kontrolnyy-kabel-alyuminievyy': CONTROL_SUBCATEGORY_SLUG,
  'kontrolnyy-kabel-mednyy': CONTROL_SUBCATEGORY_SLUG,
};

export const CONTROL_CABLE_SOURCE_CATEGORIES = new Set([
  CONTROL_CABLE_CATEGORY_SLUG,
  CONTROL_SIGNAL_SUBCATEGORY_SLUG,
  LEGACY_FIRE_CATEGORY_SLUG,
]);

const SOURCES = {
  aluminum: 'https://kabel-s.ru/catalog/kabel-kontrol-nyy-alyuminievyy/',
  copper: 'https://kabel-s.ru/catalog/kabel-kontrol-nyy-mednyy/',
  control: 'https://kabel-s.ru/catalog/kabel-upravleniya/',
  signal: 'https://kabel-s.ru/catalog/kabeli_upravleniya_i_kontrolya/',
  gerda: 'https://www.gerda.ru/upload/cabel-system.pdf',
  kruin: 'https://npo-pzsk.ru/catalog/?catalog=7',
  metrolan: 'https://metromatika.ru/',
  kuptex: 'https://kuptex.ru/decoding/',
  instrumentation: 'https://www.kske.ru/catalog/kdvvg',
  interface: 'https://spetskabel.ru/products/kipvev/',
  mounting: 'https://rkz.ru/certificates/',
  lowtox: 'https://r-kabel.com/certificates/',
  sobbit: 'https://sobbit.ru/catalog/',
  fireIndustrial:
    'https://spkb.ru/upload/marketing-materials/catalog-okl-spkb-techno.pdf',
  kgv: 'https://energoprom.net.ua/ru/production/catalog/silovie/pvh/kgv/',
  gerdaMounting:
    'https://gerda.ru/upload/iblock/722/12fa9yd86x1da3bpa9ruugr7q1ynnhgu/Sert.-TR-TS-004_2011-_KVEV-po-TU-014_-s-06.04.2022-po-03.04.27.pdf',
};

function normalizeMark(value) {
  return String(value || '')
    .toUpperCase()
    .replaceAll('Ё', 'Е')
    .replace(/\s+/gu, '');
}

const ALUMINUM_FAMILIES = new Set(['АКВВГ', 'АКВББШВ']);
const COPPER_FAMILIES = new Set([
  'КВКБШВ',
  'КВББШВ',
  'КВБВ',
  'КВББШ',
  'КВБШ',
  'КВБШВ',
  'КВВБ',
  'КВВБГ',
  'КВВБШ',
  'КВВБШВ',
  'КВЭББШВ',
  'КВЭБШВ',
  'КВЭКБШВ',
  'КВВГ',
  'КВВГЦ',
  'КВГ',
  'КППГ',
  'КГВББШВ',
  'КГВБШВ',
  'ZC-KVVP2-22',
]);

// Эти межприборные и универсальные монтажные серии используются в цепях
// измерений, контроля и промышленной автоматики. Основная группа в этой
// структуре каталога — «Кабель управления»; материал жил не меняет назначение.
const INSTRUMENT_FAMILIES = new Set([
  'КВВ',
  'КВЭВБМ',
  'КВЭВ',
  'КВЭВЭБ',
  'КВВМ',
  'КВВЭБ',
  'КВВЭБМ',
  'КМЭВ',
  'КМЭКВ',
  'КСКВЭВ-ВП',
  'КГВШ',
  'КПВЛ',
]);

function placement(
  subcategorySlug,
  rule,
  reference,
  categorySlug = CONTROL_CABLE_CATEGORY_SLUG
) {
  return { categorySlug, subcategorySlug, rule, reference };
}

export function getControlCablePlacement(product = {}) {
  if (!CONTROL_CABLE_SOURCE_CATEGORIES.has(product.catalogCategorySlug))
    return null;
  const mark = normalizeMark(product.mark || product.markFamily);
  const name = String(
    product.name || product.fullName || product.sourceName || ''
  ).toUpperCase();
  const manufacturer = String(product.manufacturer || '').toUpperCase();

  if (
    product.catalogCategorySlug === CONTROL_SIGNAL_SUBCATEGORY_SLUG ||
    product.catalogCategorySlug === LEGACY_FIRE_CATEGORY_SLUG
  ) {
    return placement(
      CONTROL_SIGNAL_SUBCATEGORY_SLUG,
      'signal-purpose',
      SOURCES.signal
    );
  }

  if (/^(?:КПС|КОПС|КСРЭВ|КГОС|КПКЭП|СБ)/u.test(mark) || /^КУНРС/u.test(mark)) {
    return placement(
      CONTROL_SIGNAL_SUBCATEGORY_SLUG,
      'signal-family',
      SOURCES.signal
    );
  }
  if (/^КПВСВ/u.test(mark)) {
    return placement(
      CONTROL_SIGNAL_SUBCATEGORY_SLUG,
      'industrial-fire-system',
      SOURCES.fireIndustrial
    );
  }
  if (/^ЛОУТОКС(?:\s|-)/u.test(name) || manufacturer === 'ЛОУТОКС') {
    return placement(CONTROL_SIGNAL_SUBCATEGORY_SLUG, 'lowtox', SOURCES.lowtox);
  }

  if (ALUMINUM_FAMILIES.has(mark)) {
    return placement(
      CONTROL_SUBCATEGORY_SLUG,
      'aluminum-control',
      SOURCES.aluminum
    );
  }
  if (COPPER_FAMILIES.has(mark)) {
    return placement(
      CONTROL_SUBCATEGORY_SLUG,
      'copper-control',
      SOURCES.copper
    );
  }

  if (mark === 'КУИН-ПУГВВ') {
    return placement(
      'provoda-ustanovochnye',
      'kuin-installation-wire',
      'https://kazkabel.kz/wp-content/uploads/kek/2025/03/tablica-diametrov-i-mass-na-kabel-kuin-pu-ku.pdf',
      'provoda'
    );
  }
  if (mark === 'КГВ') {
    return placement(
      'silovoy-kabel-pvh',
      'kgv-power',
      SOURCES.kgv,
      'silovoy-kabel'
    );
  }

  if (/^КУ(?:В|П|Г|М|Э|ИН)/u.test(mark)) {
    return placement('kabel-upravleniya', 'control-family', SOURCES.control);
  }
  if (/^К(?:ДВВГ|ДВЭВГ)/u.test(mark)) {
    return placement(
      'kabel-upravleniya',
      'instrumentation',
      SOURCES.instrumentation
    );
  }
  if (mark === 'КПЭТИ') {
    return placement('kabel-upravleniya', 'nuclear-control', SOURCES.control);
  }
  if (mark === 'КВИП') {
    return placement('kabel-upravleniya', 'gerda-interface', SOURCES.gerda);
  }
  if (/^КИПВ/u.test(mark)) {
    return placement(
      'kabel-upravleniya',
      'industrial-interface',
      SOURCES.interface
    );
  }
  if (/^КИС-/u.test(mark)) {
    return placement(
      'kabel-upravleniya',
      'industrial-interface',
      'https://paritet.su/catalog/kis_v/kis_v_1kh2kh0_60/?printElement=Y'
    );
  }
  if (/^СКАБ/u.test(mark)) {
    return placement(
      'kabel-upravleniya',
      'instrument-control',
      'https://spetskabel.ru/f/1/global/pricelist/spetskabel-skab.pdf'
    );
  }
  if (mark === 'СК-ЭПЭПК') {
    return placement('kabel-upravleniya', 'source-instrument-control', null);
  }
  for (const [brand, reference] of [
    ['ГЕРДА', SOURCES.gerda],
    ['СОББИТ', SOURCES.sobbit],
    ['КРУИН', SOURCES.kruin],
    ['МЕТРОЛАН', SOURCES.metrolan],
    ['КУПТЕКС', SOURCES.kuptex],
  ]) {
    if (
      manufacturer === brand ||
      name.startsWith(`${brand} `) ||
      name.startsWith(`${brand}-`) ||
      (brand === 'КРУИН' && name.startsWith('КРУИНВ-'))
    ) {
      return placement(
        'kabel-upravleniya',
        `instrument-brand-${brand}`,
        reference
      );
    }
  }
  if (INSTRUMENT_FAMILIES.has(mark)) {
    const reference =
      {
        КГВШ: 'https://www.holdcable.com/catalog/spravochnaya-informatsiya/1395042/',
        КПВЛ: SOURCES.control,
        'КСКВЭВ-ВП': 'https://spkb.ru/warehouse/',
        КМЭВ: SOURCES.mounting,
        КМЭКВ: SOURCES.mounting,
      }[mark] || SOURCES.gerdaMounting;
    return placement(
      'kabel-upravleniya',
      'inter-instrument-control',
      reference
    );
  }

  // Явная подкатегория импортёра применяется и к новым проверенным сериям.
  const subcategorySlug =
    CONTROL_CATEGORY_ALIASES[product.catalogSubcategorySlug] ||
    product.catalogSubcategorySlug;
  if (
    [
      CONTROL_SUBCATEGORY_SLUG,
      'kabel-upravleniya',
      CONTROL_SIGNAL_SUBCATEGORY_SLUG,
    ].includes(subcategorySlug)
  ) {
    return placement(subcategorySlug, 'explicit-subcategory', null);
  }
  return null;
}
