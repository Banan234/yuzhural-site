// Buyer-facing search. Numeric constraints are never relaxed by spelling recovery.
import {
  getConductorMaterial,
  getCoreVariantLabel,
} from '../lib/catalogClassifiers.js';

const indexes = new WeakMap();
const documentCache = new WeakMap();
const NUMBER = '\\d+(?:[.,]\\d+)?';
const SIZE = `${NUMBER}(?:\\s*[xх×*]\\s*${NUMBER})+`;
const DIMENSIONS = new RegExp(`${SIZE}(?:\\s*\\+\\s*${SIZE})*`, 'gi');
const AWG_SIZE = /(?:\d+\s*[xх×*]\s*)+awg\s*\d+/gi;
const VOLTAGE = new RegExp(
  `(?<![a-zа-я0-9.])(${NUMBER})(?:\\s*[/]\\s*(${NUMBER}))?\\s*(кв|kv|в|v)(?=$|[^a-zа-я])`,
  'gi'
);
const MODIFIERS = /нг(?:\s*\(\s*[аa]\s*\))?|frls|frhf|lsltx|ls|hf|ltx/gi;
const LATIN_LOOKALIKES = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
};
const TRANSLIT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ь: '',
  ъ: '',
};
const FILLERS = new Set([
  'купить',
  'куплю',
  'нужен',
  'нужна',
  'нужно',
  'нужны',
  'цена',
  'цены',
  'стоимость',
  'найти',
  'ищу',
  'пожалуйста',
  'мне',
  'по',
  'с',
  'на',
  'для',
]);
const GENERIC = new Set([
  'кабель',
  'кабеля',
  'кабели',
  'провод',
  'провода',
  'шнур',
]);
const TERM_ALIASES = new Map([
  ['бел', 'белый'],
  ['белая', 'белый'],
  ['белого', 'белый'],
  ['черн', 'черный'],
  ['черная', 'черный'],
  ['черного', 'черный'],
  ['син', 'синий'],
  ['синяя', 'синий'],
  ['синего', 'синий'],
  ['красн', 'красный'],
  ['красная', 'красный'],
  ['красного', 'красный'],
  ['желт', 'желтый'],
  ['желтая', 'желтый'],
  ['желтого', 'желтый'],
  ['зел', 'зеленый'],
  ['зеленая', 'зеленый'],
  ['зеленого', 'зеленый'],
  ['сер', 'серый'],
  ['серая', 'серый'],
  ['серого', 'серый'],
  ['голубая', 'голубой'],
  ['голубого', 'голубой'],
  ['корич', 'коричневый'],
  ['коричн', 'коричневый'],
  ['коричневая', 'коричневый'],
  ['розов', 'розовый'],
  ['розовая', 'розовый'],
  ['силовые', 'силовой'],
  ['силового', 'силовой'],
  ['силовых', 'силовой'],
  ['контрольные', 'контрольный'],
  ['контрольного', 'контрольный'],
  ['монтажные', 'монтажный'],
  ['монтажного', 'монтажный'],
  ['гибкого', 'гибкий'],
  ['гибкие', 'гибкий'],
  ['бронированного', 'бронированный'],
  ['бронированные', 'бронированный'],
]);

export function normalizeCatalogSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ny[мm]/g, 'nym')
    .replace(/ё/g, 'е')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(
      /(?:фрлс|фрхф|лс|хф|лтх)(?=$|[^a-zа-я])/g,
      (flag) =>
        ({ фрлс: 'frls', фрхф: 'frhf', лс: 'ls', хф: 'hf', лтх: 'ltx' })[flag]
    )
    .replace(
      /(?:cat|кат)\s*[.-]?\s*([35678])\s*([eеaа]?)(?=$|[^a-zа-я0-9])/g,
      (_, n, suffix) => `cat${n}${suffix.replace('е', 'e').replace('а', 'a')}`
    )
    .replace(/(\d+)\s*awg/g, 'awg$1')
    .replace(/(\d+(?:\.\d+)?)\s+на\s+(?=\d)/g, '$1х')
    .replace(/(\d)\s*[xх×*]\s*(?=\d)/gi, '$1х')
    .replace(/[хx]\s*awg/g, 'xawg')
    .replace(/[a-zа-я]+/g, (token) =>
      /[а-я]/.test(token)
        ? token.replace(/[abcehkmoptxy]/g, (c) => LATIN_LOOKALIKES[c])
        : token
    )
    .replace(/\bng(?=\(|-|ls|fr|hf|\s|$)/g, 'нг')
    .replace(/сип\s*-?\s*([234])(?=\s|$)/g, 'сип-$1')
    .replace(/пв\s*-?\s*([134])(?=\s|$)/g, 'пв$1')
    .replace(/(?:ж\s*[/\\-]\s*з|желто[ -]зелен(?:ый|ая|ого))/g, 'желтозеленый')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (value) =>
  normalizeCatalogSearchText(value).replace(/[^a-zа-я0-9]/g, '');
const words = (value) =>
  normalizeCatalogSearchText(value).match(/[a-zа-я0-9]+(?:\.[0-9]+)*/g) || [];
const positive = (value) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return n > 0 && Number.isFinite(n) ? n : null;
};
const transliterate = (value) =>
  [...value].map((c) => TRANSLIT[c] ?? c).join('');

function sizes(value) {
  return [...normalizeCatalogSearchText(value).matchAll(DIMENSIONS)].map(
    (match) => ({
      value: match[0]
        .split(/\s*\+\s*/)
        .map((group) => group.split(/[xх×*]/).map(positive)),
      text: match[0],
      index: match.index,
    })
  );
}

function extractModifiers(text) {
  const flags = new Set();
  const rest = text.replace(MODIFIERS, (flag, offset, original) => {
    // Latin flags occur as complete suffixes, never as fragments of a brand.
    const next = original[offset + flag.length] || '';
    if (
      !flag.startsWith('нг') &&
      /[a-z]/.test(next) &&
      !/^(?:ltx)/.test(original.slice(offset + flag.length))
    )
      return flag;
    const key = flag.startsWith('нг')
      ? flag.includes('(')
        ? 'нг(а)'
        : 'нг'
      : flag.toLowerCase();
    if (key === 'lsltx') {
      flags.add('ls');
      flags.add('ltx');
    } else {
      flags.add(key);
      if (key === 'нг(а)') flags.add('нг');
    }
    return ' ';
  });
  return { flags, rest };
}

function documentFor(product) {
  if (documentCache.has(product)) return documentCache.get(product);
  const title = normalizeCatalogSearchText(
    product.title || product.fullName || product.name || ''
  );
  const mark = normalizeCatalogSearchText(product.mark || '');
  const dimensions = sizes(title);
  const modifierInfo = extractModifiers(
    title.replace(AWG_SIZE, ' ').replace(DIMENSIONS, ' ')
  );
  const searchable = [
    modifierInfo.rest,
    mark,
    product.sku,
    product.catalogBrand,
    product.manufacturer,
    product.catalogCategory,
    product.catalogSubcategory,
    product.catalogApplicationType,
    product.color,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ');
  const tokens = words(searchable).map(
    (token) => TERM_ALIASES.get(token) || token
  );
  const doc = {
    product,
    title,
    mark,
    markKey: compact(mark),
    sku: compact(product.sku),
    tokens,
    tokenSet: new Set(tokens),
    dimensions,
    modifiers: modifierInfo.flags,
    awgSizes: [...title.matchAll(AWG_SIZE)].map((m) =>
      m[0].replace(/[xх×*]/g, 'х').replace(/\s/g, '')
    ),
    awg: [...title.matchAll(/awg\s*(\d+)/g)].map((m) => Number(m[1])),
    pairs: [
      ...new Set([
        ...[
          ...title.matchAll(
            /(?<![a-zа-я0-9])(\d+)\s*(?:pr|p|пар(?:а|ы)?)(?=$|[^a-zа-я])/g
          ),
        ].map((m) => Number(m[1])),
        ...dimensions.flatMap((d) =>
          d.value
            .filter((group) => group.length === 3 && group[1] === 2)
            .map((group) => group[0])
        ),
        ...(Number(product.groupCores) === 2 && positive(product.cores)
          ? [Number(product.cores)]
          : []),
      ]),
    ],
    screens: [...title.matchAll(/([fsu]+)\/(ftp|utp)/g)].map((m) => m[0]),
    material: getConductorMaterial(product),
    cores: positive(getCoreVariantLabel(product)),
    section: positive(product.crossSection),
    // Catalog voltage values are stored in kV; the query plan uses volts.
    voltages: [
      positive(product.voltage) ? positive(product.voltage) * 1000 : null,
      ...[...title.matchAll(VOLTAGE)].flatMap((m) =>
        [m[1], m[2]]
          .filter(Boolean)
          .map((n) => Number(n) * (/^(?:кв|kv)$/.test(m[3]) ? 1000 : 1))
      ),
    ].filter(Boolean),
  };
  documentCache.set(product, doc);
  return doc;
}

export function buildCatalogSearchIndex(items) {
  const documents = items.map(documentFor);
  const marks = [...new Set(documents.map((d) => d.mark).filter(Boolean))];
  const aliases = new Map();
  for (const mark of marks) {
    if (/^[а-я]{2,20}(?:-\d+)?$/.test(mark))
      aliases.set(transliterate(mark), mark);
  }
  const index = {
    documents,
    skus: new Map(),
    titles: new Map(),
    marks,
    correctionWords: [
      ...new Set(
        documents.flatMap((doc) => {
          const root = compact(doc.mark);
          return [
            doc.mark,
            ...words(doc.title).filter(
              (t) => root.length >= 3 && t.startsWith(root)
            ),
          ];
        })
      ),
    ],
    markKeys: new Set(marks.map(compact)),
    aliases,
    aliasKeys: [...aliases.keys()].sort((a, b) => b.length - a.length),
    results: new Map(),
  };
  for (const doc of documents) {
    for (const label of [
      doc.product.title,
      doc.product.fullName,
      doc.product.sourceName,
    ]) {
      if (!label) continue;
      const key = normalizeCatalogSearchText(label);
      if (!index.titles.has(key)) index.titles.set(key, new Set());
      index.titles.get(key).add(doc);
    }
    if (!doc.sku) continue;
    if (!index.skus.has(doc.sku)) index.skus.set(doc.sku, []);
    index.skus.get(doc.sku).push(doc);
  }
  indexes.set(items, index);
  return index;
}

function getIndex(items) {
  return indexes.get(items) || buildCatalogSearchIndex(items);
}

function applyAliases(text, index) {
  return text.replace(/(?<![a-zа-я0-9])[a-z][a-z0-9-]*/g, (token) => {
    if (index.aliases.has(token)) return index.aliases.get(token);
    for (const alias of index.aliasKeys) {
      if (
        token.startsWith(alias) &&
        /^(?:ng|ls|frls|frhf|hf|ltx)/.test(token.slice(alias.length))
      ) {
        return (
          index.aliases.get(alias) +
          token.slice(alias.length).replace(/^ng/, 'нг')
        );
      }
    }
    return token;
  });
}

export function parseCatalogSearch(
  search,
  index = { aliases: new Map(), aliasKeys: [], markKeys: new Set() }
) {
  const raw = typeof search === 'string' ? search.trim() : '';
  let text = applyAliases(normalizeCatalogSearchText(raw), index);
  // A spaced N S after a known mark is a common way to type N×S.
  const markPrefix = index.marks
    ?.filter((mark) => text.startsWith(mark + ' '))
    .sort((a, b) => b.length - a.length)[0];
  if (markPrefix) {
    const tail = text.slice(markPrefix.length).trim();
    if (/^[1-9]\d?\s+\d+(?:\.\d+)?$/.test(tail))
      text = markPrefix + ' ' + tail.replace(/\s+/g, 'х');
  }
  text = text.replace(
    /([a-zа-я]{2,})(\d+(?:\.\d+)?)(?=$|\s)/g,
    (whole, mark, number) =>
      index.markKeys.has(compact(mark)) && !index.markKeys.has(compact(whole))
        ? `${mark} ${number}`
        : whole
  );
  text = text.replace(
    /(одно|двух|трех|четырех|пяти|шести|семи|восьми|десяти)жильн(?:ый|ая|ого)/g,
    (_, count) =>
      `${{ одно: 1, двух: 2, трех: 3, четырех: 4, пяти: 5, шести: 6, семи: 7, восьми: 8, десяти: 10 }[count]} жил`
  );
  const plan = {
    raw,
    text,
    dimensions: [],
    sections: [],
    cores: [],
    voltages: [],
    materials: [],
    terms: [],
    modifiers: [],
    onlyStock: false,
    screens: [],
    awgSizes: [],
    awg: [],
    phrases: [],
    pairs: [],
    invalid: raw.length > 256,
  };
  const sku = /^(?:артикул|арт\.?|sku|код)(?:\s*[:#№]\s*|\s+)(.+)$/.exec(text);
  if (sku) return { ...plan, sku: compact(sku[1]) };
  text = text.replace(/([fsu]+)\/(ftp|utp)/g, (screen) => {
    plan.screens.push(screen);
    return ' ';
  });
  text = text.replace(AWG_SIZE, (size) => {
    plan.awgSizes.push(size.replace(/[xх×*]/g, 'х').replace(/\s/g, ''));
    return ' ';
  });
  text = text.replace(/awg\s*(\d+)/g, (_, n) => {
    plan.awg.push(Number(n));
    return ' ';
  });
  text = text.replace(
    /(?<![a-zа-я0-9])(\d+)\s*(?:pr|p|пар(?:а|ы)?)(?=$|[^a-zа-я])/g,
    (_, n) => {
      plan.pairs.push(Number(n));
      return ' ';
    }
  );
  text = text.replace(/пар(?:а|ы)?\s*(\d+)/g, (_, n) => {
    plan.pairs.push(Number(n));
    return ' ';
  });
  text = text.replace(/(?:class|класс)\s*(\d+)/g, (phrase) => {
    plan.phrases.push(phrase);
    return ' ';
  });
  text = text.replace(DIMENSIONS, (size) => {
    plan.dimensions.push(sizes(size)[0].value);
    return ' ';
  });
  if (plan.dimensions.length)
    text = text.replace(/мм\s*(?:2|\^2)|квадрат(?:а|ов)?/g, ' ');
  text = text.replace(VOLTAGE, (_, a, b, unit) => {
    plan.voltages.push({
      values: [positive(a), ...(b ? [positive(b)] : [])].map(
        (n) => n * (/^(?:кв|kv)$/.test(unit) ? 1000 : 1)
      ),
      text: `${a}${b ? '/' + b : ''}`,
    });
    return ' ';
  });
  text = text.replace(
    /(?:сечени(?:е|я|ем)\s*[:=]?\s*)?(\d+(?:\.\d+)?)\s*(?:мм\s*(?:2|\^2)|квадрат(?:а|ов)?)(?=$|[^0-9а-я])/g,
    (_, n) => {
      plan.sections.push(positive(n));
      return ' ';
    }
  );
  text = text.replace(/сечени(?:е|я|ем)\s*[:=]?\s*(\d+(?:\.\d+)?)/g, (_, n) => {
    plan.sections.push(positive(n));
    return ' ';
  });
  text = text.replace(
    /(\d+)\s*[- ]?\s*жил(?:ы|а|у|ой|ьный|ьная|ьного)?(?=$|[^а-я])/g,
    (_, n) => {
      plan.cores.push(positive(n));
      return ' ';
    }
  );
  text = text.replace(/жил(?:ы|а)?\s*[:=]?\s*(\d+)/g, (_, n) => {
    plan.cores.push(positive(n));
    return ' ';
  });
  text = text.replace(/в наличии/g, () => {
    plan.onlyStock = true;
    return ' ';
  });
  text = text.replace(/[а-я]+/g, (token) => {
    if (/^мед(?:ь|н)/.test(token)) {
      plan.materials.push('медь');
      return ' ';
    }
    if (/^алюмин/.test(token)) {
      plan.materials.push('алюминий');
      return ' ';
    }
    return token;
  });
  // A number that belongs to a known mark (СКАБ 660, AS 70/11) stays in its name.
  const protectedMark =
    index.marks
      ?.filter(
        (mark) =>
          /\d/.test(mark) &&
          text.startsWith(mark) &&
          /^(?:$|\s)/.test(text.slice(mark.length))
      )
      .sort((a, b) => b.length - a.length)[0] || '';
  text = text.replace(
    /(^|\s)((?:0|[1-9]\d*)(?:\.\d+)?)(?=$|\s)/g,
    (whole, before, n, offset) => {
      if (offset < protectedMark.length) return whole;
      plan.sections.push(positive(n));
      return ' ';
    }
  );
  const info = extractModifiers(text);
  plan.modifiers = [...info.flags];
  let terms = words(info.rest)
    .map((t) => TERM_ALIASES.get(t) || t)
    .filter((t) => !FILLERS.has(t));
  if (
    terms.some((t) => !GENERIC.has(t)) ||
    plan.dimensions.length ||
    plan.sections.length ||
    plan.materials.length ||
    plan.cores.length ||
    plan.voltages.length
  )
    terms = terms.filter((t) => !GENERIC.has(t));
  plan.terms = terms;
  if (plan.sections.some((n) => !n) || plan.cores.some((n) => !n))
    plan.invalid = true;
  plan.hasIntent = Boolean(
    plan.pairs.length ||
    plan.awgSizes.length ||
    plan.awg.length ||
    plan.phrases.length ||
    plan.screens.length ||
    terms.length ||
    plan.dimensions.length ||
    plan.sections.length ||
    plan.cores.length ||
    plan.voltages.length ||
    plan.materials.length ||
    plan.modifiers.length ||
    plan.onlyStock
  );
  return plan;
}

function sameSize(a, b) {
  return (
    a.length === b.length &&
    a.every(
      (group, i) =>
        group.length === b[i].length && group.every((n, j) => n === b[i][j])
    )
  );
}

function matchesConstraints(doc, plan) {
  if (plan.sku) return doc.sku === plan.sku;
  if (!plan.pairs.every((n) => doc.pairs.includes(n))) return false;
  if (!plan.awgSizes.every((size) => doc.awgSizes.includes(size))) return false;
  if (!plan.awg.every((n) => doc.awg.includes(n))) return false;
  if (!plan.phrases.every((phrase) => doc.title.includes(phrase))) return false;
  if (!plan.screens.every((screen) => doc.screens.includes(screen)))
    return false;
  if (!plan.sections.every((n) => n === doc.section)) return false;
  if (!plan.cores.every((n) => n === doc.cores)) return false;
  if (!plan.materials.every((m) => m === doc.material)) return false;
  if (plan.onlyStock && !(Number(doc.product.stock) > 0)) return false;
  if (!plan.modifiers.every((m) => doc.modifiers.has(m))) return false;
  if (
    !plan.dimensions.every(
      (size) =>
        doc.dimensions.some((d) => sameSize(d.value, size)) ||
        (!doc.dimensions.length &&
          size.length === 1 &&
          size[0].length === 2 &&
          size[0][0] === positive(doc.product.cores) &&
          size[0][1] === doc.section &&
          !positive(doc.product.groundCores))
    )
  )
    return false;
  if (
    !plan.voltages.every((v) => v.values.every((n) => doc.voltages.includes(n)))
  )
    return false;
  return true;
}

function termMatches(doc, term) {
  return (
    doc.tokenSet.has(term) ||
    doc.tokens.some((t) => t.startsWith(term)) ||
    (term.length >= 3 && doc.sku.startsWith(compact(term)))
  );
}

export function searchCatalogProducts(items, search) {
  if (search == null || search === '') return items;
  if (typeof search !== 'string') return [];
  if (!search.trim()) return items;
  const index = getIndex(items);
  if (index.results.has(search)) return index.results.get(search);
  const plan = parseCatalogSearch(search, index);
  if (plan.invalid) return [];
  const exactSku = index.skus.get(compact(plan.sku || search)) || [];
  // Exact source designations remain findable even when an imported name
  // contains undocumented numeric fields (class, register, optical sizes).
  const exactTitles = plan.sku
    ? []
    : [...(index.titles.get(normalizeCatalogSearchText(search)) || [])];
  let matches;
  if (exactSku.length) matches = exactSku;
  else if (plan.sku || !plan.hasIntent) matches = [];
  else {
    const candidates = index.documents.filter((d) =>
      matchesConstraints(d, plan)
    );
    matches = candidates.filter((d) =>
      plan.terms.every((t) => termMatches(d, t))
    );
    // Preserve useful fragments such as "вг" only when no mark prefix exists.
    // Never relax numeric constraints or use fragments for a complete known mark.
    if (
      !matches.length &&
      plan.terms.length === 1 &&
      plan.terms[0].length === 2 &&
      !index.markKeys.has(compact(plan.terms[0]))
    ) {
      matches = candidates.filter((d) =>
        d.tokens.some((t) => t.includes(plan.terms[0]))
      );
    }
    const score = (d) =>
      (d.title === plan.text ? 100 : 0) +
      (plan.terms.length === 1 && d.markKey === compact(plan.terms[0])
        ? 30
        : 0);
    matches.sort((a, b) => score(b) - score(a));
  }
  const result = (
    exactSku.length ? exactSku : [...new Set([...exactTitles, ...matches])]
  ).map((d) => d.product);
  if (index.results.size >= 100)
    index.results.delete(index.results.keys().next().value);
  index.results.set(search, result);
  return result;
}

function editDistanceOne(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      a.slice(i) === b.slice(i + 1) ||
      a.slice(i + 1) === b.slice(i) ||
      (a[i] === b[i + 1] &&
        a[i + 1] === b[i] &&
        a.slice(i + 2) === b.slice(i + 2))
    );
  }
  return false;
}

export function getCatalogSearchCorrections(items, search, limit = 3) {
  if (
    typeof search !== 'string' ||
    !search.trim() ||
    search.length > 256 ||
    searchCatalogProducts(items, search).length
  )
    return [];
  const index = getIndex(items),
    suggestions = new Map();
  function add(query) {
    const count = searchCatalogProducts(items, query).length;
    if (count && query !== search) suggestions.set(query, { query, count });
  }
  const latin = "qwertyuiop[]asdfghjkl;'zxcvbnm,.",
    russian = 'йцукенгшщзхъфывапролджэячсмитьбю';
  // Only offer a layout change; Enter never silently replaces a requested mark.
  const from = /[а-я]/i.test(search) ? russian : latin,
    to = from === russian ? latin : russian;
  add(
    search.toLowerCase().replace(/[a-zа-я]+/g, (token) => {
      if (/^(?:x|х|ls|frls|frhf|hf|ltx)$/.test(token)) return token;
      return [...token]
        .map((c) => (from.includes(c) ? to[from.indexOf(c)] : c))
        .join('');
    })
  );
  const plan = parseCatalogSearch(search, index);
  for (const term of plan.terms) {
    if (term.length < 4 || /\d/.test(term) || index.markKeys.has(compact(term)))
      continue;
    for (const mark of index.correctionWords) {
      if (!/^[а-яa-z]{4,20}$/.test(mark) || !editDistanceOne(term, mark))
        continue;
      add(normalizeCatalogSearchText(search).replace(term, mark));
    }
  }
  return [...suggestions.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
