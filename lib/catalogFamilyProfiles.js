import { buildDescription } from './catalog.js';
import { isProductPending } from '../shared/productAvailability.js';

const power =
  'Передача и распределение электроэнергии в стационарных установках';
const control = 'Неподвижное подключение приборов и аппаратов в цепях контроля';
const flexible = 'Подключение передвижных механизмов к электрической сети';
const pvc = 'ПВХ-пластикат';
const hka =
  'https://elcable.ru/upload/iblock/736/ha0jwhn9l48g4zbglkp9mlxn61juko6o/1_KHKA_obshchiy_katalog.pdf';

const installation = 'Стационарный монтаж электрических цепей';
const connection = 'Подключение электрических приборов и оборудования';

export const profiles = {
  'family-0014': {
    mark: 'ПУВ',
    wire: true,
    purpose: installation,
    source: hka,
  },
  'family-0015': {
    mark: 'ПУГВ',
    wire: true,
    purpose: installation,
    source: hka,
  },
  'family-0016': {
    mark: 'ПВ1',
    wire: true,
    purpose: installation,
    source: hka,
  },
  'family-0017': {
    mark: 'ПВ3',
    wire: true,
    purpose: installation,
    source: hka,
  },
  'family-0013': { mark: 'ПВС', color: true, purpose: connection, source: hka },
  'family-0004': {
    mark: 'ВБбШВ',
    armor: true,
    purpose: power,
    source: hka + '#page=105',
  },
  'family-0005': {
    mark: 'АВБШВ',
    metal: 'Алюминий',
    armor: true,
    purpose: power,
    source: hka + '#page=18',
  },
  'family-0001': {
    mark: 'ВВГ',
    purpose: power,
    extras: ['П', 'Э', 'З'],
    source: hka + '#page=12',
  },
  'family-0002': {
    mark: 'АВВГ',
    metal: 'Алюминий',
    purpose: power,
    extras: ['П', 'З'],
    source: hka + '#page=12',
  },
  'family-0007': {
    mark: 'КВВГ',
    purpose: control,
    extras: ['Э', 'З'],
    source: hka,
  },
  'family-0003': {
    mark: 'ВБШВ',
    armor: true,
    purpose: power,
    source: hka + '#page=18',
  },
  'family-0009': {
    mark: 'КВБбШв',
    armor: true,
    purpose: control,
    extras: ['З'],
    source: hka,
  },
  'family-0010': {
    mark: 'КГ',
    material: 'Резина',
    purpose: flexible,
    source: hka + '#page=241',
  },
  'family-0011': {
    mark: 'КГВВ',
    purpose: 'Подключение промышленного оборудования',
    source: hka,
  },
};

const normalize = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/gu, '')
    .replace('(A)', '(А)');
const number = (value) => Number(value.replace(',', '.'));
const indexes = /^(?:НГ(?:\([АБВГДС]\))?(?:FR)?(?:LS)?(?:LTX)?(?:ХЛ)?|ХЛ)$/u;
const dimension =
  '(?<cores>[1-9]\\d*)[ХX×](?<section>\\d+(?:[,.]\\d+)?)(?:\\+1[ХX×](?<extra>\\d+(?:[,.]\\d+)?))?';

function matchExecution(product, decoded, profile) {
  if (
    isProductPending(product) ||
    decoded.status !== 'reviewed' ||
    decoded.warnings?.length ||
    decoded.unknown?.length ||
    product.parsingWarnings?.length
  )
    return null;

  const mark = normalize(profile.mark);
  const explicitVoltage =
    /(?:-\s*(?<short>1)|(?<long>0[,.]38|0[,.]66|1)\s*кВ)\s*$/iu.exec(
      product.sourceName || ''
    );
  const cleanName =
    explicitVoltage &&
    product.voltage ===
      number(explicitVoltage.groups.short || explicitVoltage.groups.long)
      ? product.sourceName.slice(0, explicitVoltage.index)
      : product.sourceName;
  const source = normalize(cleanName);
  if (!source.startsWith(mark) || normalize(product.mark) !== mark) return null;
  // Explicitly recognize the size separately from its execution suffixes.
  const parsed = new RegExp(
    '^(?<before>[^0-9]*?)' +
      (profile.wire
        ? '(?:(?<cores>1)[ХX×])?(?<section>\\d+(?:[,.]\\d+)?)(?<extra>)'
        : dimension) +
      '(?<after>.*)$',
    'u'
  ).exec(source.slice(mark.length));
  if (!parsed) return null;
  const { cores, section, extra, before, after } = parsed.groups;
  if (
    (profile.wire
      ? product.cores != null && product.cores !== 1
      : Number(cores) !== product.cores) ||
    number(section) !== product.crossSection ||
    !(product.crossSection > 0) ||
    (product.groupCores != null && product.groupCores !== 1) ||
    product.conductorConfiguration ||
    product.concentricConductorCrossSection ||
    product.screenCrossSection ||
    (product.groundCores ?? null) !== (extra ? 1 : null) ||
    (product.groundSection ?? null) !== (extra ? number(extra) : null)
  )
    return null;

  // The source must contain the same indices as the parsed attributes.
  const attributes = (product.attributes || []).map((x) =>
    normalize(x) === 'ПЛОСКИЙ' ? 'П' : normalize(x)
  );
  const colors = new Set(
    (profile.wire || profile.color ? decoded.tokens : [])
      .filter((t) => t.text.startsWith('Цвет в исходной записи:'))
      .map((t) => normalize(t.code))
  );
  if (
    attributes.some(
      (x) => !indexes.test(x) && !profile.extras?.includes(x) && !colors.has(x)
    )
  )
    return null;
  const fire = attributes.filter((x) => indexes.test(x));
  if (
    fire.length > 1 ||
    (profile.material === 'Резина' && fire.some((x) => x !== 'ХЛ'))
  )
    return null;
  const tail = before + after;
  const permutations =
    attributes.length <= 3
      ? (function order(parts) {
          return parts.length
            ? parts.flatMap((p, i) =>
                order(parts.filter((_, j) => i !== j)).map((s) => p + s)
              )
            : [''];
        })(attributes)
      : [];
  if (
    !permutations.includes(tail) ||
    (product.voltage != null && (product.voltage > 1 || !explicitVoltage))
  )
    return null;
  return { attributes, fire: fire[0] || '' };
}

const lsMaterial = 'ПВХ-пластикат пониженной пожарной опасности';
const powerLsDocument =
  'https://www.holdcable.com/catalog/spravochnaya-informatsiya/1395094/';
const lsDocuments = {
  'family-0001': powerLsDocument,
  'family-0002': powerLsDocument,
  'family-0003': powerLsDocument,
  'family-0007': 'https://www.holdcable.com/products/kvvgeng_a_ls/',
  'family-0015': 'https://www.holdcable.com/products/pugvng_a_ls/',
};

export function getCatalogFamilyPlan(product, decoded) {
  const profile = profiles[decoded?.familyRecordId];
  if (!profile) return null;
  const execution = matchExecution(product, decoded, profile);
  if (!execution)
    return {
      profile,
      reason:
        'Маркировка, размер или исполнение выходит за границы проверенного правила. Сохранены прежние сведения.',
    };
  const { attributes, fire } = execution;
  const metal = profile.metal || 'Медь';
  const material = profile.material || pvc;
  const specs = {
    'Материал жилы': metal,
    ...(profile.material === 'Резина' && product.cores === 1
      ? {}
      : { 'Материал изоляции': material }),
    ...(!profile.wire &&
      !(profile.material === 'Резина' && product.cores === 1) && {
        'Материал оболочки': material,
      }),
    Назначение: profile.purpose,
    Бронированный: profile.armor ? 'Да' : 'Нет',
    ...(profile.armor && { 'Тип брони': 'Стальные ленты' }),
  };
  const variant = {};
  if (fire.startsWith('НГ')) {
    const category = /\(([АБВГДС])\)/u.exec(fire)?.[1];
    variant['Нераспространение горения'] = category
      ? 'При групповой прокладке, категория ' + category
      : 'Индекс нг, категория не указана';
  }
  if (fire.includes('FR')) variant['Огнестойкое исполнение'] = 'Да';
  if (fire.includes('LS')) variant['Дымо- и газовыделение'] = 'Пониженное';
  if (fire.includes('LTX'))
    variant['Токсичность продуктов горения'] = 'Пониженная';
  if (fire.endsWith('ХЛ'))
    variant['Климатическое исполнение'] = 'ХЛ (холодостойкое)';
  if (attributes.includes('Э')) variant['Экранированный'] = 'Да';
  if (attributes.includes('З'))
    variant['Заполнение сердечника'] = 'Предусмотрено';
  if (attributes.includes('П')) variant['Форма кабеля'] = 'Плоская';
  const family = decoded.familyRecordId;
  const source = lsDocuments[family];
  const refineLs =
    source &&
    fire === 'НГ(А)LS' &&
    !attributes.includes('З') &&
    (family !== 'family-0007' || attributes.includes('Э'));
  const refinements = refineLs
    ? {
        'Материал изоляции': lsMaterial,
        ...(!profile.wire && { 'Материал оболочки': lsMaterial }),
      }
    : {};
  return {
    profile: refineLs ? { ...profile, source } : profile,
    specs,
    variant,
    execution,
    refinements,
  };
}

export function applyCatalogFamilyProfiles(product, decoded) {
  const plan = getCatalogFamilyPlan(product, decoded);
  if (!plan || plan.reason) return product;
  const { profile, specs, variant, execution, refinements } = plan;
  const expected = { ...specs, ...variant };
  const conflicts = Object.entries(expected).filter(([key, value]) => {
    const existing = product.specs?.[key];
    if (existing == null || existing === value) return false;
    if (
      key.startsWith('Материал ') &&
      value === pvc &&
      /ПВХ-пластикат/u.test(existing)
    )
      return false;
    if (key === 'Назначение') return false; // Existing more specific editorial application wins.
    return true;
  });
  if (conflicts.length) {
    const disputed = new Set(conflicts.map(([field]) => field));
    if (disputed.has('Бронированный') || disputed.has('Тип брони')) {
      disputed.add('Бронированный');
      disputed.add('Тип брони');
    }
    const independent = Object.entries(expected).filter(
      ([field]) => !disputed.has(field) && product.specs?.[field] == null
    );
    return independent.length
      ? {
          ...product,
          specs: { ...product.specs, ...Object.fromEntries(independent) },
        }
      : product;
  }
  const content = product.catalogContent;
  const metal = profile.metal ? 'Алюминиевые' : 'Медные';
  const type = profile.wire
    ? 'установочный провод'
    : profile.color
      ? 'соединительный провод'
      : profile.purpose === control
        ? 'контрольный кабель'
        : profile.material
          ? 'гибкий кабель'
          : 'силовой кабель';
  const construction = [
    metal +
      ' жилы' +
      (specs['Материал изоляции']
        ? ' с ' + (profile.material ? 'резиновой' : 'ПВХ') + ' изоляцией.'
        : '.'),
    ...(variant['Огнестойкое исполнение']
      ? ['Индекс FR указывает на огнестойкое исполнение.']
      : []),
    ...(profile.armor
      ? ['Механическую защиту обеспечивает броня из стальных лент.']
      : []),
    ...(execution.attributes.includes('Э')
      ? ['В конструкции предусмотрен экран.']
      : []),
    profile.wire
      ? ''
      : profile.material && product.cores === 1
        ? 'Жилу защищает резиновый слой.'
        : profile.material
          ? 'Наружная оболочка выполнена из резины.'
          : profile.armor
            ? 'Поверх брони находится защитный шланг из ПВХ.'
            : 'Наружная оболочка выполнена из ПВХ.',
  ].join(' ');
  const selection = [
    profile.purpose === control
      ? 'Выбирайте число жил по схеме контрольных цепей.'
      : profile.material
        ? 'Сечение выбирайте по нагрузке подключаемого механизма.'
        : 'Подбирайте сечение и число жил по проектной нагрузке и схеме.',
    ...(profile.metal
      ? ['Используйте контактную арматуру для алюминиевых жил.']
      : []),
    ...(profile.armor ? ['Учитывайте ленточную броню при выборе вводов.'] : []),
    ...(variant['Огнестойкое исполнение']
      ? [
          'Проверьте требования к огнестойкости всей линии вместе с креплением и соединениями.',
        ]
      : []),
    ...(variant['Климатическое исполнение']
      ? ['Сверьте условия монтажа с документацией исполнения ХЛ.']
      : []),
  ].join(' ');
  const fallback = buildDescription(
    product,
    product.category,
    product.unit,
    product.stock
  );
  const productSpecs = { ...expected, ...product.specs };
  for (const [field, value] of Object.entries(refinements)) {
    if (productSpecs[field] === pvc) productSpecs[field] = value;
  }
  return {
    ...product,
    specs: productSpecs,
    catalogContent: {
      ...(product.description && product.description !== fallback
        ? {}
        : {
            text:
              profile.mark +
              ' — ' +
              type +
              (profile.armor ? ' с ленточной бронёй.' : '.'),
          }),
      construction,
      application: profile.purpose + '.',
      selection,
      ...content,
    },
  };
}
