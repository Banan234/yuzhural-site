export const DATA_CABLE_CATEGORY_SLUG = 'kabeli-peredachi-dannykh';
export const DATA_CABLE_SOURCE_CATEGORIES = new Set([
  DATA_CABLE_CATEGORY_SLUG,
  'lan-kabeli',
  'kabeli-svyazi',
]);
export const DATA_CABLE_SUBCATEGORIES = {
  universal: 'universalnye-kabeli',
  communication: 'kabeli-svyazi',
  lan: 'lan-kabeli',
  coaxial: 'koaksialnye-kabeli',
  optical: 'optovolokonnye-kabeli',
};

const SOURCES = {
  gerda: 'https://kazkabel.kz/catalog-ru/prod-kabeli-gerda-kv-ru',
  control: 'https://podolskkabel.ru/res/content/docs/f2065_download_0_file.pdf',
  signal:
    'https://www.paritet.su/stati/informatsionnye-pisma/markoobrazovanie-ksvv/',
  fire: 'https://paritet.su/stati/informatsionnye-pisma/rasshifrovka-marok-kabeley-paritet-/',
  optical:
    'https://incab.ru/useful-information/optic-cable-and-fiber/certificates/',
  coaxial: 'https://eletecsystems.ru/files/catalog.pdf',
  lan: 'https://spetskabel.ru/products/?text=%D0%9A%D0%92%D0%9F',
  phone:
    'https://elcable.ru/upload/iblock/736/ha0jwhn9l48g4zbglkp9mlxn61juko6o/1_KHKA_obshchiy_katalog.pdf',
  industrial:
    'https://spetskabel.ru/f/1/global/pricelist/spetskabel-automation.pdf',
  microphone:
    'https://podolskkabel.ru/res/content/docs/f2024_download_0_file.pdf',
  station: 'https://spetskabel.ru/products/7/281/',
  kvsm: 'https://pro-cable.ru/%D0%BA%D0%B2%D1%81%D0%BC/',
  mine: 'https://odeskabel.com/en/products/communication-cables/kabeli-svyazi-shakhtnye/kabel-svyazi-telefonnyj-shakhtnyj-kssh.html',
  structured: 'https://linesv.ru/deksoot/ksvpv.pdf',
  segment: 'https://www.segmentenergo.ru/catalog/detail.php?ID=45570',
  radiation:
    'https://podolskkabel.ru/res/content/docs/f1339_download_0_file.pdf',
  teflon:
    'https://www.elec.ru/files/2019/08/20/%D0%91%D0%BE%D1%80%D1%82%D0%BE%D0%B2%D1%8B%D0%B5_%D0%B8_%D0%BC%D0%BE%D0%BD%D1%82%D0%B0%D0%B6%D0%BD%D1%8B%D0%B5_%D0%BA%D0%B0%D0%B1%D0%B5%D0%BB%D0%B8_%D0%B8_%D0%BF%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D0%B0.pdf',
  shtl: 'https://podolskkabel.ru/catalog/kabeli-svyazi/shtl/',
};

const SIGNAL_FAMILIES = new Set([
  'КСВВ',
  'КСПВ',
  'КСПВВ',
  'КСПВГ',
  'КСПВЭП',
  'КСПЭВ',
  'КСПЭВГ',
  'КСРВ',
  'КСРП',
  'КПКЭВ',
]);

export function getDataCablePlacement(product = {}) {
  const category = product.catalogCategorySlug;
  const mark = String(product.mark || product.markFamily || '')
    .trim()
    .toUpperCase()
    .replaceAll('Ё', 'Е')
    .replace(/\s+/gu, ' ');
  const name = String(
    product.sourceName || product.name || product.fullName || ''
  ).toUpperCase();
  const manufacturer = String(product.manufacturer || '').toUpperCase();
  const placement = (
    subcategorySlug,
    rule,
    categorySlug = DATA_CABLE_CATEGORY_SLUG
  ) => ({
    categorySlug,
    subcategorySlug,
    rule,
    reference: SOURCES[rule] || null,
  });
  // Марка КВК без производителя неоднозначна: у ГЕРДА это универсальный
  // промышленный кабель, у других заводов — комбинированный видеокабель.
  if (
    (DATA_CABLE_SOURCE_CATEGORIES.has(category) ||
      category === 'kontrolnyy-kabel') &&
    ['КВ', 'КВК'].includes(mark) &&
    (manufacturer === 'ГЕРДА' || /^ГЕРДА(?:\s|-)/u.test(name))
  ) {
    return placement(DATA_CABLE_SUBCATEGORIES.universal, 'gerda');
  }
  if (!DATA_CABLE_SOURCE_CATEGORIES.has(category)) return null;

  if (mark === 'КВКБШВ')
    return placement('kontrolnye-kabeli', 'control', 'kontrolnyy-kabel');
  if (/^СБ/u.test(mark))
    return placement('signalno-blokirovochnye', 'blocking', 'kontrolnyy-kabel');
  if (SIGNAL_FAMILIES.has(mark))
    return placement(
      'signalno-blokirovochnye',
      /^КСР/u.test(mark) ? 'fire' : 'signal',
      'kontrolnyy-kabel'
    );

  if (mark === 'КСТПЭП') return placement('', 'radiation', 'montazhnyy-kabel');
  if (mark === 'КТФ' && /^КТФЭ(?:\s|$)/u.test(name))
    return placement('', 'teflon', 'montazhnyy-kabel');
  if (/^КИ485(?:-|$)/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'segment');
  if (/^КВСМВ?$/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'kvsm');
  if (/^КМС-2(?:В|У)?$/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'station');
  if (mark === 'КСШ')
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'mine');
  if (mark === 'КСВПВ')
    return placement(DATA_CABLE_SUBCATEGORIES.lan, 'structured');
  if (/^ШТЛ-(?:2|5)$/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'shtl');
  // Сохраняем уже проверенное по декларации производителя правило импорта.
  if (/^ЭКС-ШВППЭ\/Э/u.test(name))
    return placement(
      DATA_CABLE_SUBCATEGORIES.lan,
      'existing-structured-import-rule'
    );

  if (
    /^(?:ДОЛ(?:\s|-|$)|ДП(?:Д|Л|О|С|Т)|КВО\s|ОК(?:Г|ДН|Л|М|СЛ)|ОМЗК|ОПС\s|ТОЛ-|ТОС(?:-|\s|$)|ЭКБ-ДПО)/u.test(
      mark
    )
  ) {
    return placement(DATA_CABLE_SUBCATEGORIES.optical, 'optical');
  }
  if (/^(?:RG[-\s]*\d|РК\s*\d|SAT\s*\d|CATV-|ККСВ|КВК(?:-|$))/u.test(mark)) {
    return placement(DATA_CABLE_SUBCATEGORIES.coaxial, 'coaxial');
  }
  // LonWorks и RS-485 не становятся Ethernet-кабелями из-за парной скрутки.
  if (/^(?:КАП$|КАЭФ[ВП]$|КИП|КСБ)/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'industrial');
  if (
    /(?:^|\s)(?:[SUF]{1,2}\/)?(?:UTP|FTP|STP|SFTP)(?:\b|-)/u.test(mark) ||
    /^(?:КВП|КССПВ-5|КСП 5|КСВ 5|КСВППЭТ)/u.test(mark)
  ) {
    return placement(DATA_CABLE_SUBCATEGORIES.lan, 'lan');
  }
  if (
    /^(?:ТПП|ТПВ$|ТПСП|ТСВ$|ТЦПВ$|ПРППМ$|ЗКП|ТЗП|КСП(?:ЗП|П|ПЗП)|ПКСВ$|ТРВ$|КЦПП)/u.test(
      mark
    )
  ) {
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'phone');
  }
  if (/^КММ$/u.test(mark))
    return placement(DATA_CABLE_SUBCATEGORIES.communication, 'microphone');

  if (
    category === DATA_CABLE_CATEGORY_SLUG &&
    Object.values(DATA_CABLE_SUBCATEGORIES).includes(
      product.catalogSubcategorySlug
    )
  ) {
    return placement(product.catalogSubcategorySlug, 'explicit-subcategory');
  }
  return null;
}
