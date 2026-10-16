// Собирает отображаемое название из марки, подтверждённых суффиксов и сечения.
// Исходное название прайса остаётся в sourceName.
import { findCableSpecification } from '../scripts/lib/cableSpecification.js';

const CONSTRUCTION_SUFFIX = /^(?:эф|эа|эм|ээ|э|зэл|з|хл|уф)$/iu;
const BEFORE_FIRE_SUFFIX = /^(?:эф|эа|эм|ээ|э|зэл|з)$/iu;
const FIRE_SUFFIX = /^нг(?:\([АБВГДСA-D]\))?(?:-|$)/iu;

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
