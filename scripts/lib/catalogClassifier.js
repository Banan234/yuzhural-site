// Файл классифицирует товары из прайса по правилам, источникам, брендам и fallback-эвристикам.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Загрузка данных при старте
// ---------------------------------------------------------------------------

const catalogCategoriesRaw = readJson('../../shared/catalogCategories.json');
const catalogRulesRaw = readJson('../../data/catalogRules.json');
const sourceCategoryMapRaw = readJson('../../data/catalogSourceMap.json');
const brandMapRaw = readJson('../../data/catalogBrandMap.json');
const manufacturersRaw = readJson('../../data/catalogManufacturers.json');
const cableLetters = readJson('../../data/cableLetters.json');

// ---------------------------------------------------------------------------
// 1. Явные правила (catalogRules.json)
//    Сортируем по убыванию priority, паттерны нормализуем сразу.
// ---------------------------------------------------------------------------

const rules = [...catalogRulesRaw]
  .filter((r) => r.catalogSection && r.catalogCategory)
  .sort((a, b) => b.priority - a.priority)
  .map((rule) => ({
    ...rule,
    normalizedPatterns: rule.patterns.map((pattern) => ({
      raw: pattern,
      normalized: normalize(pattern),
    })),
  }));

// ---------------------------------------------------------------------------
// 2. Карта sourceCategory → каталог
//    КЛЮЧ: нормализованная строка (Cyrillic lookalikes → Latin).
//    Именно это исправляет баг: раньше ключи хранились как сырая кириллица,
//    а lookup делался по нормализованной строке — они никогда не совпадали.
// ---------------------------------------------------------------------------

const sourceCategoryMap = new Map(
  sourceCategoryMapRaw.map((entry) => [normalize(entry.sourceCategory), entry])
);

// ---------------------------------------------------------------------------
// 3. Индекс ключевых слов из catalogCategories.json
//    Сортируем по убыванию длины: более специфичные (длинные) ключи побеждают.
// ---------------------------------------------------------------------------

const categoryKeywords = [];

for (const section of catalogCategoriesRaw.sections) {
  for (const cat of section.categories) {
    for (const kw of cat.keywords ?? []) {
      const normalized = normalize(kw);
      if (normalized) {
        categoryKeywords.push({
          keyword: normalized,
          rawKeyword: kw,
          section: section.name,
          sectionSlug: section.slug,
          category: cat.name,
          categorySlug: cat.slug,
        });
      }
    }
    for (const subcat of cat.subcategories ?? []) {
      for (const kw of subcat.keywords ?? []) {
        const normalized = normalize(kw);
        if (normalized) {
          categoryKeywords.push({
            keyword: normalized,
            rawKeyword: kw,
            section: section.name,
            sectionSlug: section.slug,
            category: subcat.name,
            categorySlug: subcat.slug,
          });
        }
      }
    }
  }
}

categoryKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

// ---------------------------------------------------------------------------
// 4. Карта брендовых префиксов (catalogBrandMap.json)
//    Сортируем по убыванию длины нормализованного бренда: более длинные
//    бренды проверяются первыми, чтобы "HELUKABEL" обрабатывался раньше "LAPP".
// ---------------------------------------------------------------------------

const brandPrefixes = [...brandMapRaw]
  .filter((b) => b.brand && b.section && b.category)
  .map((b) => ({
    ...b,
    normalizedBrand: normalize(b.brand),
    compactBrand: compactForPrefix(b.brand),
  }))
  .sort((a, b) => b.normalizedBrand.length - a.normalizedBrand.length);

// Производители — только для извлечения названия, не влияют на категорию
const manufacturerPrefixes = [...manufacturersRaw]
  .map((m) => ({
    name: m,
    normalized: normalize(m),
    compact: compactForPrefix(m),
    tokenPattern: createManufacturerTokenPattern(m),
  }))
  .sort((a, b) => b.normalized.length - a.normalized.length);

// ---------------------------------------------------------------------------
// Порядок токенов для декодировщика марки
// ---------------------------------------------------------------------------

const COMPOUND_TOKENS = [
  'нг-LS-HF',
  'нгLS-HF',
  'нг-HF',
  'нг-LS',
  'нгLS',
  'нгHF',
  'нгХЛ',
  'нг',
  'LS-HF',
  'LS',
  'HF',
  'ХЛ',
];

// ---------------------------------------------------------------------------
// Fallback-классификация
// ---------------------------------------------------------------------------

const FALLBACK = {
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  catalogCategory: 'Прочее',
  catalogCategorySlug: 'prochee',
  catalogType: null,
};

// ---------------------------------------------------------------------------
// classifyProduct — главная функция классификации
// ---------------------------------------------------------------------------

/**
 * Определяет каталожную категорию для одного товара.
 *
 * Порядок проверок:
 *  1. Явные правила (catalogRules.json) — наивысший приоритет
 *  2. Карта sourceCategory (catalogSourceMap.json) — надёжный сигнал из прайса
 *  3. Prefix-matching по ключевым словам каталога (startsWith)
 *  4. Стриппинг брендового префикса + повторный prefix-matching
 *     → Если keyword найден — используем его
 *     → Иначе используем дефолтную категорию бренда
 *  5. Substring-matching для маркировок с дефисом (ИНСИЛ-КВВГ и т.п.)
 *  6. Fallback → "Прочее"
 */
export function classifyProduct(product) {
  const mark = product.mark ?? '';
  const markFamily = product.markFamily ?? product.mark ?? '';
  const name = product.name ?? '';

  // Извлекаем производителя из prefixа наименования (catalogManufacturers.json)
  let manufacturer = product.manufacturer ?? null;
  let effectiveMarkFamily = markFamily;
  if (!manufacturer) {
    const detected = detectManufacturer(product);
    if (detected) {
      manufacturer = detected.name;
      effectiveMarkFamily = detected.markFamily;
    }
  }

  // Строка для явных правил — марка, семейство + производитель (если известен).
  // Имя производителя нужно, чтобы правила могли целиться в бренд
  // (HELUKABEL, Герда, КРУИН и т.п.): priceParser отрезает его от mark/markFamily,
  // но бренд-специфичные правила должны продолжать срабатывать.
  const searchStr = normalize(
    [manufacturer, mark, markFamily, ...(product.attributes ?? [])]
      .filter(Boolean)
      .join(' ')
  );

  // --- 1. Явные правила ---
  for (const rule of rules) {
    for (const pattern of rule.normalizedPatterns) {
      if (searchStr.includes(pattern.normalized)) {
        return toCatalogResult({
          section: rule.catalogSection,
          sectionSlug: rule.catalogSectionSlug,
          category: rule.catalogCategory,
          categorySlug: rule.catalogCategorySlug,
          type: rule.type,
          applicationType: rule.applicationType ?? null,
          brand: rule.manufacturer ?? manufacturer,
          source: 'rule',
          match: pattern.raw,
        });
      }
    }
  }

  // --- 2. Карта sourceCategory ---
  if (product.sourceCategory) {
    const match = sourceCategoryMap.get(normalize(product.sourceCategory));
    if (match) {
      return toCatalogResult({
        section: match.section,
        sectionSlug: match.sectionSlug,
        category: match.category,
        categorySlug: match.categorySlug,
        brand: manufacturer,
        source: 'sourceCategory',
        match: product.sourceCategory,
      });
    }
  }

  // Дальнейшие шаги работают с нормализованным markFamily (без префикса производителя)
  const familyNorm = normalize(effectiveMarkFamily);

  if (familyNorm) {
    // --- 3. Prefix-matching: markFamily.startsWith(keyword) ---
    const prefixMatch = findByKeyword(
      familyNorm,
      (kw) => familyNorm.startsWith(kw),
      manufacturer
    );
    if (prefixMatch) return prefixMatch;

    // --- 4. Стриппинг брендового префикса ---
    for (const brandEntry of brandPrefixes) {
      const familyCompact = compactForPrefix(familyNorm);
      if (
        !familyNorm.startsWith(brandEntry.normalizedBrand) &&
        !familyCompact.startsWith(brandEntry.compactBrand)
      ) {
        continue;
      }

      const detectedBrand = manufacturer ?? brandEntry.brand;

      // Отрезаем бренд + возможный разделитель
      const remainder = familyNorm
        .slice(brandEntry.normalizedBrand.length)
        .replace(/^[-\s]+/, '');

      if (remainder) {
        // Пробуем классифицировать по остатку марки
        const remMatch = findByKeyword(
          remainder,
          (kw) => remainder.startsWith(kw),
          detectedBrand
        );
        if (remMatch) return remMatch;
      }

      // Keyword для остатка не найден — используем категорию бренда по умолчанию
      return toCatalogResult({
        section: brandEntry.section,
        sectionSlug: brandEntry.sectionSlug,
        category: brandEntry.category,
        categorySlug: brandEntry.categorySlug,
        brand: detectedBrand,
        source: 'brandDefault',
        match: brandEntry.brand,
      });
    }

    // --- 5. Substring-matching для марок с дефисом (ИНСИЛ-КВВЭ, ГЕРДА-КВ) ---
    if (familyNorm.includes('-')) {
      const subMatch = findByKeyword(
        familyNorm,
        (kw) => familyNorm.includes(kw),
        manufacturer
      );
      if (subMatch) return subMatch;
    }
  }

  return {
    ...FALLBACK,
    catalogApplicationType: null,
    catalogBrand: manufacturer,
    manufacturer,
    catalogClassificationSource: 'fallback',
    catalogClassificationMatch: null,
  };
}

// ---------------------------------------------------------------------------
// decodeCable — расшифровка буквенного обозначения марки кабеля
// ---------------------------------------------------------------------------

export function decodeCable(mark) {
  if (!mark) return null;

  const tokens = tokenizeMark(String(mark).trim());
  const decoded = tokens
    .map((token) => cableLetters[token] ?? null)
    .filter(Boolean);

  if (decoded.length === 0) return null;

  return { mark: String(mark).trim(), tokens, decoded };
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function findByKeyword(value, predicate, brand = null) {
  for (const entry of categoryKeywords) {
    if (predicate(entry.keyword)) {
      return toCatalogResult({
        section: entry.section,
        sectionSlug: entry.sectionSlug,
        category: entry.category,
        categorySlug: entry.categorySlug,
        brand,
        source: value.startsWith(entry.keyword)
          ? 'keywordPrefix'
          : 'keywordSubstring',
        match: entry.rawKeyword,
      });
    }
  }
  return null;
}

function detectManufacturer(product) {
  const markFamily = product.markFamily ?? product.mark ?? '';
  const familyNormForMfr = normalize(markFamily);
  const familyCompact = compactForPrefix(markFamily);

  for (const mfr of manufacturerPrefixes) {
    if (
      familyNormForMfr.startsWith(mfr.normalized) ||
      familyCompact.startsWith(mfr.compact)
    ) {
      return {
        name: mfr.name,
        markFamily: stripManufacturerFromStart(markFamily, mfr),
      };
    }
  }

  const searchable = normalize(
    [product.name, product.fullName, product.mark, product.markFamily]
      .filter(Boolean)
      .join(' ')
  );

  for (const mfr of manufacturerPrefixes) {
    if (mfr.tokenPattern.test(searchable)) {
      return {
        name: mfr.name,
        markFamily,
      };
    }
  }

  return null;
}

function stripManufacturerFromStart(value, mfr) {
  const source = String(value ?? '');
  if (!source) return source;

  const normalized = normalize(source);
  if (normalized.startsWith(mfr.normalized)) {
    return source.slice(mfr.name.length).replace(/^[-\s]+/, '');
  }

  return source.replace(/^[^-_\s]+[-\s]*/, '');
}

// Разделы, относящиеся к кабельной продукции. Всё остальное (электрооборудование,
// кабельная арматура, расходники, прочие товары) схлопывается в единую категорию
// «Некабельная продукция» — по требованию бизнеса её не разбиваем по типам.
const CABLE_SECTIONS = new Set(['Кабель и провод', 'Специальные кабели']);

function toCatalogResult({
  section,
  sectionSlug,
  category,
  categorySlug,
  type = null,
  applicationType = null,
  brand = null,
  source = null,
  match = null,
}) {
  if (!CABLE_SECTIONS.has(section)) {
    return {
      catalogSection: 'Некабельная продукция',
      catalogSectionSlug: 'nekabelnaya-produkciya',
      catalogCategory: 'Некабельная продукция',
      catalogCategorySlug: 'nekabelnaya-produkciya',
      catalogType: type,
      catalogApplicationType: applicationType,
      catalogBrand: brand,
      manufacturer: brand,
      catalogClassificationSource: source,
      catalogClassificationMatch: match,
    };
  }
  return {
    catalogSection: section,
    catalogSectionSlug: sectionSlug,
    catalogCategory: category,
    catalogCategorySlug: categorySlug,
    catalogType: type,
    catalogApplicationType: applicationType,
    catalogBrand: brand,
    manufacturer: brand,
    catalogClassificationSource: source,
    catalogClassificationMatch: match,
  };
}

/**
 * Нормализация строки для классификации.
 *
 * Переводит в нижний регистр и заменяет кириллические буквы-омонимы
 * на их латинские визуальные аналоги — это позволяет единообразно
 * сравнивать смешанные (кирилл.+лат.) обозначения кабелей.
 *
 * ВАЖНО: функция применяется ОДИНАКОВО к обеим сторонам сравнения
 * (ключам и искомым строкам), поэтому взаимное соответствие сохраняется.
 */
function normalize(value) {
  return (
    String(value ?? '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      // Кириллические буквы, идентичные латинским по начертанию:
      .replace(/а/g, 'a')
      .replace(/е/g, 'e')
      .replace(/о/g, 'o')
      .replace(/р/g, 'p')
      .replace(/с/g, 'c')
      .replace(/у/g, 'y')
      .replace(/х/g, 'x')
      .replace(/м/g, 'm')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function compactForPrefix(value) {
  return normalize(value).replace(/[^a-zа-яё0-9]+/giu, '');
}

function createManufacturerTokenPattern(value) {
  const escaped = escapeRegExp(normalize(value));
  return new RegExp(`(^|[^a-zа-яё0-9])${escaped}([^a-zа-яё0-9]|$)`, 'iu');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeMark(mark) {
  const tokens = [];
  let s = mark;

  while (s.length > 0) {
    let matched = false;

    for (const compound of COMPOUND_TOKENS) {
      if (s.startsWith(compound)) {
        tokens.push(compound);
        s = s.slice(compound.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const char = s[0];
      if (/[А-ЯЁ]/.test(char)) {
        tokens.push(char);
      }
      s = s.slice(1);
    }
  }

  return tokens;
}

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, relativePath), 'utf-8')
  );
}
