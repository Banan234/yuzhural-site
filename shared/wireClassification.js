// Проверенные семейства проводов текущего каталога. Новые марки без правила
// остаются без подкатегории до проверки, а не попадают в случайную группу.
export const WIRE_CATEGORY_SLUG = 'provoda';

export const WIRE_SUBCATEGORY_SOURCES = {
  'provoda-ustanovochnye': 'https://kabel-s.ru/catalog/provoda-ustanovochnye/',
  'provoda-soedinitelnye': 'https://kabel-s.ru/catalog/provoda-soedinitel-nye/',
  'provoda-montazhnye': 'https://podolskkabel.ru/res/content/docs/f2024_download_0_file.pdf',
  'provoda-avtomobilnye': 'https://kabel-s.ru/catalog/provoda-avtomobil-nye/',
  'provoda-vyvodnye': 'https://kabel-s.ru/catalog/provoda-vyvodnye/',
  'provoda-neizolirovannye':
    'https://kabel-s.ru/catalog/provoda-neizolirovannye/',
  'provoda-obmotochnye': 'https://kabel-s.ru/catalog/provoda-obmotochnye/',
  'provoda-termostoykie': 'https://kabel-s.ru/catalog/provoda_termostoykie/',
  'provoda-podvizhnogo-sostava':
    'https://kabel-s.ru/catalog/provoda-dlya-podvizhnogo-sostava/',
  'provoda-svyazi': 'https://kabel-s.ru/catalog/provoda/',
  'provoda-progrevochnye': 'https://kabel-s.ru/catalog/provoda_progrevochnye/',
  'provoda-termoelektrodnye':
    'https://kabel-s.ru/catalog/provoda_termoelektrodnye/',
};

const MARKS_BY_SUBCATEGORY = {
  'provoda-ustanovochnye': [
    'АПВ',
    'АППВ',
    'АПР',
    'АПУВ',
    'АПУНП',
    'ПАВ',
    'ПБВВ',
    'ПБВВГ',
    'ПВ1',
    'ПВ3',
    'ПВ4',
    'ПВВП',
    'ППВ',
    'ПРГН',
    'ПУВ',
    'ПУВП',
    'ПУГВ',
    'ПУГВВ',
    'ПУГВВ-П',
    'ПУГВП',
    'ПУГНП',
    'ПУГСП',
    'ПУНП',
    'ПУСП',
    'ПУВВ',
    'ПГВВП',
    'ПУГП',
    'ПУБП',
  ],
  'provoda-soedinitelnye': [
    'ПВС',
    'ПВС-Т',
    'ПВСН',
    'ПВСУ',
    'ПРС',
    'ШВВП',
    'ШВП-2',
  ],
  'provoda-montazhnye': [
    'МПО',
    'НВ',
    'НВ1',
    'НВ3',
    'НВ4',
    'НВМ',
    'НВМ-4',
    'НВЭ-3',
    'НВЭВ',
  ],
  'provoda-avtomobilnye': ['ПГВА', 'ПВА', 'ПВАМ', 'ПВВ'],
  'provoda-vyvodnye': ['ВПП', 'ВППЗ', 'ПВКВ', 'ПВПО'],
  'provoda-neizolirovannye': ['А', 'АС', 'МГ'],
  'provoda-obmotochnye': ['ПЭТВ-2', 'ПЭТ'],
  'provoda-termostoykie': ['ПАЛ', 'ПГРО', 'ПВКФ', 'ПРКА', 'ПРКС'],
  'provoda-podvizhnogo-sostava': ['ППСРВМ'],
  'provoda-svyazi': ['ПВЖ', 'ПМПЭВ', 'ТРП'],
  'provoda-progrevochnye': ['ПМСВ', 'ПМСП'],
  'provoda-termoelektrodnye': ['ПТГВ-М'],
};

// Позиции с явно иным назначением. Они исправляются на уровне иерархии,
// чтобы ошибка исходной рубрики не повторилась при следующем импорте.
const CATEGORY_BY_MARK = {
  'АВКТ-4': 'prochee',
  'KVM-OY': 'importnye-kabeli',
  'KVM-CY': 'importnye-kabeli',
  АПВЗББШП: 'silovoy-kabel',
  АПВКАПГ: 'silovoy-kabel',
  АПВКВ: 'silovoy-kabel',
  ПВБШП: 'silovoy-kabel',
  ПВЗББШП: 'silovoy-kabel',
  ПВП: 'silovoy-kabel',
};

function normalizeWireMark(value) {
  const mark = String(value || '')
    .trim()
    .toUpperCase()
    .replaceAll('Ё', 'Е');
  if (/^АС\s+\d/u.test(mark)) return 'АС';
  if (/^ПАВ\s+\d/u.test(mark)) return 'ПАВ';
  if (/^ПАВ\d/u.test(mark)) return 'ПАВ';
  if (/^МПО\s+\d/u.test(mark)) return 'МПО';
  if (/^НВМ(?:\s|-)\d/u.test(mark)) return 'НВМ';
  if (/^НВ\s+\d/u.test(mark)) return 'НВ';
  if (/^ПЭТ\s+\d/u.test(mark)) return 'ПЭТ';
  return mark.replaceAll('СY', 'CY');
}

const subcategoryByMark = new Map(
  Object.entries(MARKS_BY_SUBCATEGORY).flatMap(([slug, marks]) =>
    marks.map((mark) => [mark, slug])
  )
);

export function getWireCatalogPlacement(product = {}) {
  const mark = normalizeWireMark(product.mark || product.markFamily);
  if (
    mark === 'ПБП' &&
    /^ПБПНГ/u.test(String(product.name || product.fullName || '').toUpperCase())
  ) {
    return { categorySlug: 'silovoy-kabel', subcategorySlug: '' };
  }
  const categorySlug = CATEGORY_BY_MARK[mark];
  if (categorySlug) return { categorySlug, subcategorySlug: '' };
  const subcategorySlug = subcategoryByMark.get(mark);
  return subcategorySlug
    ? { categorySlug: WIRE_CATEGORY_SLUG, subcategorySlug }
    : null;
}
