// Собирает отображаемое название из марки, подтверждённых суффиксов и сечения.
// Исходное название прайса остаётся в sourceName.
import { findCableSpecification } from '../scripts/lib/cableSpecification.js';

const CONSTRUCTION_SUFFIX = /^(?:эф|эа|эм|ээ|э|зэл|з|хл|уф)$/iu;
const BEFORE_FIRE_SUFFIX = /^(?:эф|эа|эм|ээ|э|зэл|з)$/iu;
const FIRE_SUFFIX = /^нг(?:\([АБВГДСA-D]\))?(?:-|$)/iu;

const CABLE_COLORS = [
  ['белый', ['бел', 'белый']],
  ['красный', ['красн', 'красный']],
  ['чёрный', ['черн', 'чёрн', 'черный', 'чёрный']],
  ['жёлтый', ['жел', 'желт', 'жёлт', 'желтый', 'жёлтый']],
  ['зелёный', ['зел', 'зелен', 'зелён', 'зеленый', 'зелёный']],
  ['жёлто-зелёный', ['ж/з', 'жел/зел', 'желто-зеленый', 'жёлто-зелёный']],
  ['голубой', ['гол', 'голуб', 'голубой']],
  ['синий', ['син', 'синий']],
  ['коричневый', ['кор', 'корич', 'коричн', 'коричневый']],
  ['оранжевый', ['оранж', 'оранжевый']],
  ['фиолетовый', ['фиол', 'фиолет', 'фиолетовый']],
  ['серый', ['сер', 'серый']],
  ['розовый', ['роз', 'розов', 'розовый']],
  ['бежевый', ['беж', 'бежевый']],
  ['сиреневый', ['сирень', 'сиреневый']],
  ['бело-жёлтый', ['бело/желт', 'бело-желтый', 'бело-жёлтый']],
  ['бело-синий', ['бел/син', 'бело/син', 'бело-синий']],
  ['бело-фиолетовый', ['бело/фиол', 'бело-фиолетовый']],
  ['бело-красный', ['бел/красн', 'бело-красный']],
  ['бело-зелёный', ['бел/зел', 'бело-зеленый', 'бело-зелёный']],
  ['чёрно-белый', ['черн-бел', 'черно-белый', 'чёрно-белый']],
  ['сине-чёрный', ['сине/черн', 'сине-черный', 'сине-чёрный']],
];
const CABLE_COLOR_ALIASES = new Map(
  CABLE_COLORS.flatMap(([color, aliases]) =>
    aliases.map((alias) => [alias, color])
  )
);

function normalizeCableColorText(value) {
  // Скобки раскрываем только для целого обозначения цвета, а не примечаний.
  const text = value.replace(/\(([^()]+)\)/gu, (match, token) => {
    const color = CABLE_COLOR_ALIASES.get(
      token.trim().replace(/\.$/u, '').toLocaleLowerCase('ru')
    );
    return color ? `(${color})` : match;
  });
  return text.replace(
    /(^|\s)([\p{L}]+(?:[-/][\p{L}]+)*)(\.)?(?=$|\s|\()/gu,
    (match, separator, token) => {
      const color = CABLE_COLOR_ALIASES.get(token.toLocaleLowerCase('ru'));
      return color ? `${separator}${color}` : match;
    }
  );
}

export function formatCableProductAttributes(product) {
  const attributes = Array.isArray(product?.attributes)
    ? product.attributes
    : [];
  return attributes.map((attribute) =>
    normalizeCableColorText(String(attribute))
  );
}

function normalizeCableColors(title, product) {
  const specification = findCableSpecification(title);
  if (!specification || specification.warnings.length) return title;
  const tailIndex = specification.index + specification.length;
  // Только целые обозначения цвета после сечения. Примечания и суффиксы
  // сохраняются, attributes остаются исходными для стабильного ключа импорта.
  let tail = normalizeCableColorText(title.slice(tailIndex));
  const colorThenSuffix = tail.match(/^\s*(\S+)\s+(.+)$/u);
  if (colorThenSuffix && CABLE_COLOR_ALIASES.has(colorThenSuffix[1])) {
    const after = consumeSuffixes(
      colorThenSuffix[2],
      movableAttributes(product)
    );
    if (after.suffixes.length && !after.rest.trim()) {
      tail = ` ${after.suffixes.join(' ')} ${colorThenSuffix[1]}`;
    }
  }
  return title.slice(0, tailIndex) + tail;
}

function movableAttributes(product) {
  return (Array.isArray(product?.attributes) ? product.attributes : [])
    .map((attribute) => String(attribute || '').trim())
    .filter(
      (attribute) =>
        CONSTRUCTION_SUFFIX.test(attribute) || FIRE_SUFFIX.test(attribute)
    )
    .flatMap((attribute) => {
      // Парсер может объединить разнесённые в прайсе «нг(А) ... хл».
      const weather = attribute.match(/^(нг.*?)-ХЛ$/iu);
      return weather ? [attribute, weather[1], 'ХЛ'] : [attribute];
    })
    .sort((a, b) => b.length - a.length);
}

function consumeSuffixes(value, attributes, { fromTail = false } = {}) {
  let rest = value;
  const suffixes = [];
  while (rest && attributes.length) {
    const separator = rest.match(/^\s*/u)?.[0] || '';
    rest = rest.slice(separator.length);
    const match = attributes.find((attribute) => {
      if (
        rest.slice(0, attribute.length).toLocaleLowerCase('ru') !==
        attribute.toLocaleLowerCase('ru')
      )
        return false;
      const next = rest.slice(attribute.length);
      return (
        !next ||
        /^\s/u.test(next) ||
        attributes.some((candidate) =>
          next
            .toLocaleLowerCase('ru')
            .startsWith(candidate.toLocaleLowerCase('ru'))
        )
      );
    });
    if (!match) return { suffixes, rest: `${separator}${rest}` };
    suffixes.push(
      fromTail && CONSTRUCTION_SUFFIX.test(match)
        ? match.toLocaleLowerCase('ru')
        : rest.slice(0, match.length)
    );
    rest = rest.slice(match.length);
    attributes.splice(attributes.indexOf(match), 1);
  }
  return { suffixes, rest };
}

export function formatCableProductTitle(title, product) {
  if (typeof title !== 'string') return title;
  return formatCableTitleSuffixes(
    normalizeCableColors(title, product),
    product
  );
}

function formatCableTitleSuffixes(title, product) {
  const mark = String(product?.mark || '').trim();
  if (!mark || typeof title !== 'string') return title;

  const specification = findCableSpecification(title);
  if (!specification || specification.index <= mark.length) return title;

  const prefix = title.slice(0, specification.index).trim();
  const markIndex = prefix.lastIndexOf(mark);
  if (markIndex < 0) return title;
  const leading = prefix.slice(0, markIndex);
  if (leading.trim()) {
    const manufacturerNames = [
      product?.manufacturer,
      product?.manufacturerMatch?.matchedAlias,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLocaleLowerCase('ru'));
    if (
      !manufacturerNames.includes(leading.trim().toLocaleLowerCase('ru')) ||
      !/\s$/u.test(leading)
    )
      return title;
  }
  const attributes = movableAttributes(product);
  if (!attributes.length) return title;

  const before = consumeSuffixes(
    prefix.slice(markIndex + mark.length),
    attributes
  );
  if (before.rest.trim()) return title;
  const after = consumeSuffixes(
    title.slice(specification.index + specification.length),
    attributes,
    { fromTail: true }
  );
  const suffixes = [...before.suffixes, ...after.suffixes];
  if (!suffixes.length) return title;
  const screenSuffixes = suffixes.filter((suffix) =>
    BEFORE_FIRE_SUFFIX.test(suffix)
  );
  const fireSuffixes = suffixes.filter((suffix) => FIRE_SUFFIX.test(suffix));
  const otherSuffixes = suffixes.filter(
    (suffix) => !BEFORE_FIRE_SUFFIX.test(suffix) && !FIRE_SUFFIX.test(suffix)
  );
  const markSuffix =
    screenSuffixes.join('') +
    fireSuffixes.join('') +
    otherSuffixes
      .map((suffix) =>
        fireSuffixes.length && /^хл$/iu.test(suffix) ? '-ХЛ' : suffix
      )
      .join('');

  const configuration = title.slice(
    specification.index,
    specification.index + specification.length
  );
  return `${leading}${mark}${markSuffix} ${configuration}${after.rest}`.trim();
}
