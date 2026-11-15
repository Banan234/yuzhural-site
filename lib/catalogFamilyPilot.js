import { isProductPending } from '../shared/productAvailability.js';

export const commonSpecs = Object.freeze({
  'Материал жилы': 'Алюминий',
  'Материал изоляции': 'ПВХ-пластикат',
  'Материал оболочки': 'ПВХ-пластикат',
  Назначение:
    'Передача и распределение электроэнергии в стационарных установках',
  Бронированный: 'Да',
  'Тип брони': 'Стальные ленты',
});

const fire = {
  'Нераспространение горения': 'При групповой прокладке, категория А',
};
export const executions = {
  base: { name: 'АВБбШв', specs: {} },
  ng: { name: 'АВБбШвнг(А)', specs: fire },
  cold: {
    name: 'АВБбШвнг(А)-ХЛ',
    specs: { ...fire, 'Климатическое исполнение': 'ХЛ (холодостойкое)' },
  },
  six: { name: 'АВБбШв-6', specs: {} },
};

function number(value) {
  return Number(value.replace(',', '.'));
}

export function getAvbbshvExecution(product, decoded) {
  if (
    product.mark?.toUpperCase() !== 'АВББШВ' ||
    product.catalogCategorySlug !== 'silovoy-kabel' ||
    decoded?.familyRecordId !== 'family-0006' ||
    decoded.status !== 'reviewed' ||
    decoded.warnings?.length ||
    decoded.unknown?.length ||
    product.parsingWarnings?.length ||
    isProductPending(product)
  )
    return null;

  const match =
    /^АВББШВ\s+(?<cores>[345])\s*[ХX×]\s*(?<section>\d+(?:[.,]\d+)?)(?:\s*\+\s*1\s*[ХX×]\s*(?<extra>\d+(?:[.,]\d+)?))?(?:\s*(?<suffix>НГ\([АA]\)(?:[\s-]*ХЛ)?|-[\s]*6(?:\s*КВ)?))?$/iu.exec(
      product.sourceName?.trim() || ''
    );
  if (!match) return null;
  const { cores, section, extra, suffix } = match.groups;
  const index = (suffix || '')
    .toUpperCase()
    .replace(/[\s-]/gu, '')
    .replace('(A)', '(А)');
  const id =
    index === 'НГ(А)ХЛ'
      ? 'cold'
      : index === 'НГ(А)'
        ? 'ng'
        : index
          ? 'six'
          : 'base';
  const attributes =
    id === 'cold' ? ['нг(А)-ХЛ'] : id === 'ng' ? ['нг(А)'] : [];
  if (
    product.cores !== number(cores) ||
    product.crossSection !== number(section) ||
    !(product.crossSection > 0) ||
    (product.groupCores != null && product.groupCores !== 1) ||
    (product.voltage ?? null) !== (id === 'six' ? 6 : null) ||
    (id === 'six' && (cores !== '3' || extra)) ||
    (extra && (cores !== '3' || id !== 'base')) ||
    (product.groundCores ?? null) !== (extra ? 1 : null) ||
    (product.groundSection ?? null) !== (extra ? number(extra) : null) ||
    product.screenCrossSection != null ||
    product.concentricConductorCrossSection != null ||
    JSON.stringify(product.attributes || []) !== JSON.stringify(attributes)
  )
    return null;
  return id;
}

export function applyCatalogFamilyPilot(product, decoded) {
  const id = getAvbbshvExecution(product, decoded);
  if (!id) return product;
  const expected = { ...commonSpecs, ...executions[id].specs };
  const conflicts = Object.entries(expected).filter(
    ([key, value]) =>
      product.specs?.[key] != null &&
      String(product.specs[key]).trim() !== value
  );
  if (conflicts.length) return product;

  const content = product.catalogContent;
  const construction =
    id === 'six'
      ? 'Алюминиевые жилы с ПВХ-изоляцией. Сердечник защищён стальной ленточной бронёй и наружным ПВХ-шлангом. Состав экранов и разделительных слоёв сверяйте по документации поставки.'
      : 'Алюминиевые жилы с ПВХ-изоляцией объединены в сердечник. Стальная ленточная броня закрыта наружным защитным ПВХ-шлангом.';
  const selection =
    id === 'six'
      ? 'Подбирайте муфты и концевую арматуру по напряжению, сечению алюминиевых жил и фактической конструкции кабеля.'
      : id === 'cold'
        ? 'Проверьте условия монтажа и эксплуатации для исполнения ХЛ. Для алюминиевых жил и ленточной брони подбирайте совместимые наконечники и вводы.'
        : 'Для алюминиевых жил применяйте совместимую контактную арматуру. Вводы подбирайте с учётом ленточной брони, а способ прокладки — по проекту.';
  const generic =
    'Силовой кабель с ленточной бронёй. Её учитывают при выборе конструкции для участков, где кабель может подвергаться механическим воздействиям.';
  const descriptions = {
    base: 'Алюминиевый силовой кабель со стальной ленточной бронёй для стационарных линий.',
    ng: 'Алюминиевый бронированный кабель для стационарных линий. Индекс нг(А) обозначает нераспространение горения при групповой прокладке по категории А.',
    cold: 'Алюминиевый бронированный кабель для стационарных линий. Исполнение нг(А)-ХЛ сочетает холодостойкость и нераспространение горения при групповой прокладке по категории А.',
    six: 'Алюминиевый бронированный кабель для стационарных линий. В обозначении этой позиции указано напряжение 6 кВ.',
  };
  return {
    ...product,
    specs: {
      ...product.specs,
      ...Object.fromEntries(
        Object.entries(expected).filter(([key]) => product.specs?.[key] == null)
      ),
    },
    catalogContent: {
      ...content,
      ...((content?.text === generic ||
        (!content?.text && !product.description)) && {
        text: descriptions[id],
      }),
      construction,
      application:
        content?.application ||
        'Стационарные питающие и распределительные линии с требованиями к механической защите.',
      selection,
    },
  };
}
