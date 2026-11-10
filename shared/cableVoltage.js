import { findCableSpecification } from '../scripts/lib/cableSpecification.js';

// A bare voltage suffix is meaningful only for these power cable families.
// Optical force ratings, telephone construction lengths and model numbers
// must never be interpreted as kV merely because they follow a dash.
const POWER_FAMILIES = new Set(
  [
    'АВБШВ',
    'АВбШв',
    'АВБбШв',
    'АВВГ',
    'АПвзБбШп',
    'АПвКаПг',
    'АПвКВ',
    'АПвП',
    'АПвПг',
    'АПвПу',
    'АПвПу2Г',
    'АПвПу2Гж',
    'АПвПуГ',
    'АПвЭАСПУ2Г',
    'АПвЭБВ',
    'КА9СПвП',
    'АПвБбШв',
    'АПвБВ',
    'АПвБП',
    'АПвБШв',
    'АПвВ',
    'АПвВГ',
    'ВБбШ',
    'ВБбШВ',
    'ВБВ',
    'ВБШВ',
    'ВКВ',
    'ВВГ',
    'КГВВ',
    'ПВВ',
    'ПвП',
    'АСБ2л',
    'КГ',
  ].map((mark) => mark.toLocaleLowerCase('ru'))
);
function hasPowerVoltageSuffix(value) {
  const mark = value
    .trim()
    .split(/\s/u)[0]
    .replace(/-?нг.*$/iu, '')
    .replace(/[-]?(?:э)?[-]?хл$/iu, '')
    .replace(/^КГэ$/iu, 'КГ');
  return POWER_FAMILIES.has(mark.toLocaleLowerCase('ru'));
}
const NOMINAL_KV = new Set([0.4, 0.66, 1, 3, 3.3, 6, 10, 15, 20, 35]);
const number = (value) => Number(value.replace(',', '.'));
const display = (value) => value.replace('.', ',');

export function normalizeCableVoltageName(value) {
  if (typeof value !== 'string') return value;
  const spec = findCableSpecification(value);
  if (!spec || spec.warnings.length) return value;
  const end = spec.index + spec.length;
  const prefix = value.slice(0, end);
  let tail = value.slice(end);
  let voltage = null;
  // An explicit unit is sufficient evidence, regardless of cable family.
  tail = tail.replace(
    /\s*[-–—]?\s*(?<![\d.,/])(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*[кk]\s*[вv](?![\p{L}])/giu,
    (_, first, second) => {
      voltage = `${display(first)}${second ? `/${display(second)}` : ''}кВ`;
      return ' ';
    }
  );
  if (hasPowerVoltageSuffix(value)) {
    tail = tail.replace(
      /\s*[-–—]\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?(?=$|\s|[-–—](?=нг|ХЛ))/giu,
      (match, first, second) => {
        if (
          !NOMINAL_KV.has(number(first)) ||
          (second &&
            (!NOMINAL_KV.has(number(second)) || number(first) > number(second)))
        )
          return match;
        voltage = `${display(first)}${second ? `/${display(second)}` : ''}кВ`;
        return ' ';
      }
    );
  }
  return voltage
    ? `${prefix}${tail}`.replace(/\s+/gu, ' ').trimEnd() + ` ${voltage}`
    : value;
}
