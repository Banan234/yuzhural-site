// Алфавитный указатель строится из марок позиций текущего каталога.

const markCollator = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

export function getMarkLetter(mark) {
  const first = String(mark || '')
    .trim()
    .charAt(0)
    .toLocaleUpperCase('ru-RU');
  return /^[А-ЯЁ]$/u.test(first) || /^[A-Z]$/u.test(first)
    ? first
    : /^[0-9]$/u.test(first)
      ? '0–9'
      : '#';
}

export function getMarkLetterId(letter) {
  return letter === '0–9'
    ? 'letter-digits'
    : letter === '#'
      ? 'letter-other'
      : `letter-${letter.codePointAt(0).toString(16)}`;
}

export function normalizeMarkKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
}

export function buildMarkIndex(products) {
  const marks = new Map();
  for (const product of products || []) {
    const mark = String(product?.mark || '')
      .trim()
      .replace(/\s+/gu, ' ');
    if (!mark) continue;
    const key = normalizeMarkKey(mark);
    const entry = marks.get(key);
    if (entry) entry.count += 1;
    else marks.set(key, { mark, count: 1 });
  }

  const groups = new Map();
  for (const entry of marks.values()) {
    const letter = getMarkLetter(entry.mark);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(entry);
  }

  const sortedLetters = [...groups.keys()].sort((left, right) => {
    const rank = (letter) =>
      /^[А-ЯЁ]$/u.test(letter) ? 0 : /^[A-Z]$/u.test(letter) ? 1 : 2;
    return rank(left) - rank(right) || markCollator.compare(left, right);
  });

  return sortedLetters.map((letter) => ({
    letter,
    id: getMarkLetterId(letter),
    marks: groups
      .get(letter)
      .sort((left, right) => markCollator.compare(left.mark, right.mark)),
  }));
}
