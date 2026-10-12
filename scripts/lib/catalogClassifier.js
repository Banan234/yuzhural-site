// Файл классифицирует товары из прайса по правилам, источникам, брендам и fallback-эвристикам.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { normalizeCatalogHierarchy } from '../../shared/catalogCategoryHierarchy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Загрузка данных при старте
// ---------------------------------------------------------------------------

const catalogCategoriesRaw = readJson('../../shared/catalogCategories.json');
const catalogRulesRaw = readJson('../../data/catalogRules.json');
const sourceCategoryMapRaw = readJson('../../data/catalogSourceMap.json');
const brandMapRaw = readJson('../../data/catalogBrandMap.json');
const cableLetters = readJson('../../data/cableLetters.json');
const importedCableSubcategoryRules = readJson(
  '../../shared/importedCableSubcategories.json'
);

export function validateClassificationMaps({
  sections = [],
  rules = [],
  sourceEntries = [],
  importedFamilies = [],
  importedProducts = [],
} = {}) {
  const check = (entries, keyField, destination, label) => {
    const seen = new Map();
    for (const entry of entries) {
      const key = normalize(entry[keyField]);
      if (!key) throw new Error(`Пустой ключ в справочнике ${label}.`);
      const target = destination(entry);
      if (seen.has(key) && seen.get(key) !== target) {
        throw new Error(
          `Противоречивый ключ «${entry[keyField]}» в справочнике ${label}.`
        );
      }
      seen.set(key, target);
    }
  };
  check(
    sourceEntries,
    'sourceCategory',
    (entry) =>
      [entry.sectionSlug, entry.categorySlug, entry.subcategorySlug].join('/'),
    'исходных категорий'
  );
  check(
    importedFamilies,
    'markFamily',
    (entry) => entry.subcategorySlug,
    'импортных семейств'
  );
  check(
    importedProducts,
    'name',
    (entry) => entry.subcategorySlug,
    'импортных товаров'
  );

  if (sections.length > 0) {
    const findCategory = (sectionSlug, categorySlug) =>
      sections
        .find((section) => section.slug === sectionSlug)
        ?.categories?.find((category) => category.slug === categorySlug);
    for (const entry of [...rules, ...sourceEntries]) {
      const sectionSlug = entry.catalogSectionSlug || entry.sectionSlug;
      if (!['kabel-i-provod', 'specialnye-kabeli'].includes(sectionSlug))
        continue;
      const categorySlug = entry.catalogCategorySlug || entry.categorySlug;
      const category = findCategory(sectionSlug, categorySlug);
      if (!category) {
        throw new Error(
          `Неизвестная категория «${sectionSlug}/${categorySlug}» в справочнике.`
        );
      }
      const subcategorySlug =
        entry.catalogSubcategorySlug || entry.subcategorySlug;
      if (
        subcategorySlug &&
        !category.subcategories?.some((item) => item.slug === subcategorySlug)
      ) {
        throw new Error(
          `Неизвестная подкатегория «${subcategorySlug}» в справочнике.`
        );
      }
    }
    const importedCategory = sections
      .flatMap((section) => section.categories)
      .find((category) => category.slug === 'importnye-kabeli');
    for (const entry of [...importedFamilies, ...importedProducts]) {
      if (
        !importedCategory?.subcategories?.some(
          (item) => item.slug === entry.subcategorySlug
        )
      ) {
        throw new Error(
          `Неизвестная импортная подкатегория «${entry.subcategorySlug}».`
        );
      }
    }
  }
}

validateClassificationMaps({
  sections: catalogCategoriesRaw.sections,
  rules: catalogRulesRaw,
  sourceEntries: sourceCategoryMapRaw,
  importedFamilies: importedCableSubcategoryRules.families,
  importedProducts: importedCableSubcategoryRules.products,
});

const importedFamilySubcategories = new Map(
  (importedCableSubcategoryRules.families ?? []).map((entry) => [
    normalize(entry.markFamily),
    entry,
  ])
);
const importedProductSubcategories = new Map(
  (importedCableSubcategoryRules.products ?? []).map((entry) => [
    normalize(entry.name),
    entry,
  ])
);
const importedApplicationBySubcategory = new Map([
  ['importnye-silovye-kabeli', 'Силовой'],
  ['importnye-kontrolnye-kabeli', 'Контрольный'],
  ['importnye-kabeli-svyazi', 'Связь'],
  ['importnye-lan-kabeli', 'Связь'],
  ['importnye-montazhnye-kabeli', 'Монтажный'],
  ['importnye-provoda', 'Провода'],
  ['importnye-gibkie-kabeli', 'Гибкий'],
  ['importnye-kabeli-signalizacii', 'Пожарная'],
  ['importnye-kabeli-sudovye', 'Судовой'],
]);

// ---------------------------------------------------------------------------
// 1. Явные правила (catalogRules.json)
//    Сортируем по убыванию priority, паттерны нормализуем сразу.
// ---------------------------------------------------------------------------

const rules = [...catalogRulesRaw]
  .filter((r) => r.catalogSection && r.catalogCategory)
  .sort((a, b) => b.priority - a.priority)
  .map((rule) => ({
    ...rule,
    normalizedExactNames: (rule.exactNames ?? []).map(normalize),
    normalizedPatterns: (rule.patterns ?? []).map((pattern) => ({
      raw: pattern,
      normalized: normalize(pattern),
      requireNextBoundary: /\s$/u.test(pattern),
    })),
    normalizedManufacturer: normalize(rule.manufacturerEquals),
    normalizedFamilyPrefixes: (rule.familyPrefixes ?? []).map(normalize),
    normalizedOriginalNamePrefixes: (rule.originalNamePrefixes ?? []).map(
      normalize
    ),
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

export function getSourceCategoryCandidate(sourceCategory) {
  const entry = sourceCategoryMap.get(normalize(sourceCategory));
  return entry && !entry.generic
    ? {
        sectionSlug: entry.sectionSlug,
        categorySlug: entry.categorySlug,
        subcategorySlug: entry.subcategorySlug || '',
      }
    : null;
}

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
          requireNextBoundary: /\s$/u.test(kw),
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
            requireNextBoundary: /\s$/u.test(kw),
            section: section.name,
            sectionSlug: section.slug,
            category: cat.name,
            categorySlug: cat.slug,
            subcategory: subcat.name,
            subcategorySlug: subcat.slug,
          });
        }
      }
    }
  }
}

categoryKeywords.sort((a, b) => b.keyword.length - a.keyword.length);
const keywordTargets = new Map();
for (const entry of categoryKeywords) {
  const target = [
    entry.sectionSlug,
    entry.categorySlug,
    entry.subcategorySlug || '',
  ].join('/');
  if (!keywordTargets.has(entry.keyword))
    keywordTargets.set(entry.keyword, new Set());
  keywordTargets.get(entry.keyword).add(target);
}
const ambiguousKeywords = new Set(
  [...keywordTargets]
    .filter(([, targets]) => targets.size > 1)
    .map(([keyword]) => keyword)
);

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
  const result = classifyProductBase(product);
  if (result.catalogCategorySlug !== 'importnye-kabeli') return result;

  const exactProductRule = importedProductSubcategories.get(
    normalize(product?.name)
  );
  const familyRule = importedFamilySubcategories.get(
    normalize(product?.markFamily ?? product?.mark)
  );
  const rule = exactProductRule ?? familyRule;
  if (!rule) return withImportedApplication(result);

  // Явную подкатегорию из правил/источника сохраняем; карта используется как
  // точное уточнение общего родителя «Импортные кабели».
  if (
    result.catalogSubcategorySlug &&
    result.catalogSubcategorySlug !== 'importnye-drugie-kabeli'
  ) {
    return withImportedApplication(result);
  }

  const subcategory = catalogCategoriesRaw.sections
    .flatMap((section) => section.categories)
    .find((category) => category.slug === 'importnye-kabeli')
    ?.subcategories?.find((entry) => entry.slug === rule.subcategorySlug);
  if (!subcategory) return withImportedApplication(result);

  return withImportedApplication({
    ...result,
    catalogSubcategory: subcategory.name,
    catalogSubcategorySlug: subcategory.slug,
  });
}

function withImportedApplication(result) {
  const application = importedApplicationBySubcategory.get(
    result.catalogSubcategorySlug
  );
  return application
    ? { ...result, catalogApplicationType: application }
    : result;
}

function classifyProductBase(product) {
  const mark = product.mark ?? '';
  const markFamily = product.markFamily ?? product.mark ?? '';
  const name = product.name ?? '';

  // Производитель уже извлечён парсером из исходного названия. Здесь поле
  // только читается, чтобы классификация не меняла результат разбора.
  const manufacturer = product.manufacturer ?? null;
  const displayBrand =
    manufacturer ?? (/^инсил(?:-|$)/iu.test(markFamily) ? 'ИнСил' : null);
  const effectiveMarkFamily = markFamily;

  // Поля сравниваются по границе обозначения. Вхождение внутри марки (например,
  // КПС в МКПС) не доказывает принадлежность к семейству.
  const searchStr = normalize(
    [manufacturer, mark, markFamily, ...(product.attributes ?? [])]
      .filter(Boolean)
      .join(' ')
  );
  const normalizedName = normalize(name);
  const normalizedManufacturer = normalize(manufacturer);
  const normalizedFamily = normalize(markFamily);

  // --- 1. Явные правила ---
  for (const rule of rules) {
    if (
      rule.normalizedExactNames.includes(normalizedName) ||
      (rule.normalizedManufacturer &&
        rule.normalizedManufacturer === normalizedManufacturer &&
        rule.normalizedFamilyPrefixes.some((prefix) =>
          normalizedFamily.startsWith(prefix)
        )) ||
      rule.normalizedOriginalNamePrefixes.some((prefix) =>
        normalizedName.startsWith(prefix)
      )
    ) {
      return toCatalogResult({
        section: rule.catalogSection,
        sectionSlug: rule.catalogSectionSlug,
        category: rule.catalogCategory,
        categorySlug: rule.catalogCategorySlug,
        subcategory: rule.catalogSubcategory ?? null,
        subcategorySlug: rule.catalogSubcategorySlug ?? null,
        type: rule.type,
        applicationType: rule.applicationType ?? null,
        brand: rule.manufacturer ?? displayBrand,
        source: 'rule',
        match: rule.type ?? name,
      });
    }
    for (const pattern of rule.normalizedPatterns) {
      if (matchesAtTokenStart(searchStr, pattern)) {
        return toCatalogResult({
          section: rule.catalogSection,
          sectionSlug: rule.catalogSectionSlug,
          category: rule.catalogCategory,
          categorySlug: rule.catalogCategorySlug,
          subcategory: rule.catalogSubcategory ?? null,
          subcategorySlug: rule.catalogSubcategorySlug ?? null,
          type: rule.type,
          applicationType: rule.applicationType ?? null,
          brand: rule.manufacturer ?? displayBrand,
          source: 'rule',
          match: pattern.raw,
        });
      }
    }
  }

  // --- 2. Карта sourceCategory ---
  if (product.sourceCategory) {
    const match = sourceCategoryMap.get(normalize(product.sourceCategory));
    if (match && !match.generic) {
      return toCatalogResult({
        section: match.section,
        sectionSlug: match.sectionSlug,
        category: match.category,
        categorySlug: match.categorySlug,
        subcategory: match.subcategory ?? null,
        subcategorySlug: match.subcategorySlug ?? null,
        brand: displayBrand,
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
      (entry) => matchesKeywordPrefix(familyNorm, entry),
      displayBrand
    );
    if (prefixMatch) return prefixMatch;

    // markFamily может склеить марку и размер (АС 16/2.7 → АС16/2.7).
    // Для ключей с требуемым пробелом сверяем также исходную mark.
    const markNorm = normalize(mark);
    if (markNorm !== familyNorm) {
      const markMatch = findByKeyword(
        markNorm,
        (entry) => matchesKeywordPrefix(markNorm, entry),
        displayBrand
      );
      if (markMatch) return markMatch;
    }

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
          (entry) => matchesKeywordPrefix(remainder, entry),
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
        subcategory: brandEntry.subcategory ?? null,
        subcategorySlug: brandEntry.subcategorySlug ?? null,
        brand: detectedBrand,
        source: 'brandDefault',
        match: brandEntry.brand,
      });
    }

    // --- 5. Поиск только с начала компонента марки после дефиса ---
    if (familyNorm.includes('-')) {
      const subMatch = findByKeyword(
        familyNorm,
        (entry) =>
          familyNorm
            .split('-')
            .slice(1)
            .some((part) => matchesKeywordPrefix(part, entry)),
        displayBrand
      );
      if (subMatch) return subMatch;
    }
  }

  return {
    ...FALLBACK,
    catalogApplicationType: null,
    catalogBrand: displayBrand,
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
    if (ambiguousKeywords.has(entry.keyword)) continue;
    if (predicate(entry)) {
      return toCatalogResult({
        section: entry.section,
        sectionSlug: entry.sectionSlug,
        category: entry.category,
        categorySlug: entry.categorySlug,
        subcategory: entry.subcategory ?? null,
        subcategorySlug: entry.subcategorySlug ?? null,
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

// Разделы, относящиеся к кабельной продукции. Импортёр использует этот же
// критерий как allow-list: всё, что не является кабелем или проводом, не
// публикуется в каталог.
const CABLE_SECTIONS = new Set(['Кабель и провод', 'Специальные кабели']);

export function isCableCatalogProduct(product) {
  return CABLE_SECTIONS.has(String(product?.catalogSection || '').trim());
}

function toCatalogResult({
  section,
  sectionSlug,
  category,
  categorySlug,
  subcategory = null,
  subcategorySlug = null,
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
      catalogClassificationSource: source,
      catalogClassificationMatch: match,
    };
  }
  const hierarchy = normalizeCatalogHierarchy({
    catalogCategory: category,
    catalogCategorySlug: categorySlug,
    catalogSubcategory: subcategory,
    catalogSubcategorySlug: subcategorySlug,
  });

  return {
    catalogSection: section,
    catalogSectionSlug: sectionSlug,
    ...hierarchy,
    catalogType: type,
    catalogApplicationType: applicationType,
    catalogBrand: brand,
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

function matchesAtTokenStart(haystack, pattern) {
  const needle = pattern.normalized;
  if (!needle) return false;
  let start = haystack.indexOf(needle);
  while (start !== -1) {
    const beforeIsBoundary =
      start === 0 || !/[\p{L}\p{N}]/u.test(haystack[start - 1]);
    const after = haystack[start + needle.length];
    const afterIsBoundary = !after || !/[\p{L}\p{N}]/u.test(after);
    if (beforeIsBoundary && (!pattern.requireNextBoundary || afterIsBoundary)) {
      return true;
    }
    start = haystack.indexOf(needle, start + 1);
  }
  return false;
}

function matchesKeywordPrefix(value, entry) {
  if (!value.startsWith(entry.keyword)) return false;
  const after = value[entry.keyword.length];
  return !entry.requireNextBoundary || !after || !/[\p{L}\p{N}]/u.test(after);
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
