// Файл импортирует прайс XLS, нормализует товары, категории, SEO-данные и публичные файлы каталога.

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  normalizeImportedProduct,
  parseProductName,
} from './lib/priceParser.js';
import {
  classifyProduct,
  isCableCatalogProduct,
} from './lib/catalogClassifier.js';
import {
  assignStableIdentity,
  buildOrphanSpecIndex,
  buildSlugRedirects,
  buildStableKey,
  loadProductRegistry,
  migrateStableIdentityKeys,
} from './lib/productRegistry.js';
import {
  DEFAULT_PUBLISH_GUARD_CONFIG,
  evaluatePublishGuard,
  formatPublishGuardFailure,
  normalizePublishGuardConfig,
} from './lib/importPublishGuard.js';
import { createBackup } from './backupData.js';
import { validateNormalizedProducts } from './lib/importDiagnostics.js';
import { acquirePriceImportLock } from './lib/importLock.js';
import {
  publishImportArtifacts,
  writeFileAtomic,
} from './lib/importPublisher.js';
import {
  acquirePriceSource,
  readLocalPriceFile,
  resolvePriceSourceSelection,
} from './lib/priceSource.js';
import {
  classifyEligibleProducts,
  detectSchema,
  extractProducts,
} from './lib/priceCatalogPreparation.js';
import { buildReportHtml } from './lib/importReport.js';
export { buildReportHtml } from './lib/importReport.js';
export { buildRedirectsNginxConf } from './lib/importPublisher.js';
import {
  PRICE_JUMP_ALERT_PERCENT,
  buildDiff,
  buildHistorySnapshot,
  buildNextImportHistory,
  buildSuspiciousPriceStats,
  detectSuspicious,
  getHistoricalSnapshots,
  normalizeImportHistory,
  parseImportHistory,
  parsePreviousProducts,
  summarizeByCategory,
  summarizeSkips,
} from './lib/priceImportComparison.js';
export {
  PRICE_JUMP_ALERT_PERCENT,
  buildDiff,
  buildHistorySnapshot,
  buildNextImportHistory,
  buildSuspiciousPriceStats,
  detectSuspicious,
  formatThresholdSource,
  getHistoricalSnapshots,
  normalizeImportHistory,
  parseImportHistory,
  parsePreviousProducts,
  percentile,
  productKey,
  roundNullable,
  summarizeByCategory,
  summarizeSkips,
  toPositiveNumber,
} from './lib/priceImportComparison.js';
export {
  buildBookReadingOrder,
  classifyEligibleProducts,
  createProductRecord,
  detectSchema,
  extractProducts,
  isCategoryRow,
  isHeaderRow,
  isServiceRow,
  looksLikeCategoryHeading,
  parsePageRow,
  pickPageCells,
  splitRowsIntoBlocks,
} from './lib/priceCatalogPreparation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const cliArgs = process.argv.slice(2);
const cliFlags = new Set(cliArgs.filter((arg) => arg.startsWith('--')));
const positionalArgs = cliArgs.filter((arg) => !arg.startsWith('--'));
const isDryRun = cliFlags.has('--dry-run');
const isPublishGuardOverride = cliFlags.has('--override-publish-guard');

const { remoteSourceUrl, inputFile } = resolvePriceSourceSelection({
  positionalSource: positionalArgs[0] || '',
  env: process.env,
  defaultPath: path.join(projectRoot, 'data', 'price.xls'),
});
const catalogDir = path.join(projectRoot, 'data', 'catalog-current');
const legacyOutputFile = path.join(projectRoot, 'data', 'products.json');
const outputFile = path.join(catalogDir, 'products.json');
const reportFile = path.join(projectRoot, 'data', 'import-report.json');
const reportHtmlFile = path.join(projectRoot, 'data', 'import-report.html');
const overridesFile = path.join(projectRoot, 'data', 'priceOverrides.json');
const importConfigFile = path.join(projectRoot, 'data', 'importConfig.json');
const legacyRegistryFile = path.join(
  projectRoot,
  'data',
  'productRegistry.json'
);
const registryFile = path.join(catalogDir, 'productRegistry.json');
const importLockFile = path.join(projectRoot, 'data', '.price-import.lock');
const publicDir = path.join(catalogDir, 'public');
const redirectsFile = path.join(publicDir, 'redirects.json');
const redirectsNginxFile = path.join(publicDir, 'redirects.nginx.conf');
const publicPriceFile = path.join(publicDir, 'price.xls');
const runtimePrerenderTemplateDir = path.resolve(
  projectRoot,
  process.env.PRERENDER_TEMPLATE_DIR || 'dist'
);
const catalogCategoriesFile = path.join(
  projectRoot,
  'shared',
  'catalogCategories.json'
);

const DEFAULT_IMPORT_CONFIG = {
  suspiciousPriceThresholds: {},
  suspiciousPriceStats: {
    historyFile: 'data/import-history.json',
    historyLimit: 8,
    minimumSamples: 30,
    thresholdPercentile: 0.99,
    thresholdMultiplier: 3,
  },
  classificationReport: {
    productLimit: 500,
    topPrefixLimit: 20,
  },
  publishGuard: DEFAULT_PUBLISH_GUARD_CONFIG,
};

let priceOverrides = null;
let priceMatchers = null;

export function parsePriceOverrides(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Некорректный JSON priceOverrides.json: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('priceOverrides.json должен содержать JSON-объект.');
  }

  const overrides = parsed.overrides ?? {};
  const matchers = parsed.matchers ?? [];
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error(
      'Поле overrides в priceOverrides.json должно быть объектом.'
    );
  }
  if (!Array.isArray(matchers)) {
    throw new Error(
      'Поле matchers в priceOverrides.json должно быть массивом.'
    );
  }

  return { overrides, matchers };
}

async function loadPriceOverrides() {
  if (priceOverrides) return priceOverrides;
  let raw;
  try {
    raw = await fs.readFile(overridesFile, 'utf-8');
  } catch (error) {
    // Отсутствующий файл допустим, но прочие ошибки не должны отключать
    // ручные корректировки незаметно.
    if (error.code !== 'ENOENT') {
      throw new Error(
        `Не удалось прочитать priceOverrides.json: ${error.message}`
      );
    }
    priceOverrides = {};
    priceMatchers = [];
    return priceOverrides;
  }
  ({ overrides: priceOverrides, matchers: priceMatchers } =
    parsePriceOverrides(raw));
  return priceOverrides;
}

export function normalizeMarkKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function findMatcherOverride(product) {
  if (!Array.isArray(priceMatchers) || priceMatchers.length === 0) return null;
  const productMark = normalizeMarkKey(product.mark);
  if (!productMark) return null;
  return (
    priceMatchers.find((matcher) => {
      if (!matcher || typeof matcher !== 'object') return false;
      if (normalizeMarkKey(matcher.mark) !== productMark) return false;
      if (
        matcher.cores != null &&
        Number(matcher.cores) !== Number(product.cores)
      ) {
        return false;
      }
      if (
        matcher.crossSection != null &&
        Number(matcher.crossSection) !== Number(product.crossSection)
      ) {
        return false;
      }
      if (
        matcher.voltage != null &&
        Number(matcher.voltage) !== Number(product.voltage)
      ) {
        return false;
      }
      if (
        Array.isArray(matcher.attributes) &&
        !matcher.attributes.every(
          (attribute) =>
            Array.isArray(product.attributes) &&
            product.attributes.includes(attribute)
        )
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

function applyPriceOverride(product) {
  if (!priceOverrides) return product;
  const override =
    priceOverrides[product.name] ||
    priceOverrides[product.fullName] ||
    findMatcherOverride(product);
  if (!override) return product;
  let newPrice = product.price;
  if (typeof override.price === 'number') {
    newPrice = override.price;
  } else if (
    typeof override.priceDivide === 'number' &&
    override.priceDivide > 0
  ) {
    newPrice = product.price / override.priceDivide;
  } else if (
    typeof override.priceMultiply === 'number' &&
    override.priceMultiply > 0
  ) {
    newPrice = product.price * override.priceMultiply;
  }
  return { ...product, price: Math.round(newPrice * 1000) / 1000 };
}

async function loadImportConfig() {
  try {
    const raw = await fs.readFile(importConfigFile, 'utf-8');
    const parsed = JSON.parse(raw);

    return mergeImportConfig(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Не удалось прочитать importConfig.json:', error.message);
    }

    return mergeImportConfig({});
  }
}

export function mergeImportConfig(config) {
  return {
    suspiciousPriceThresholds: {
      ...DEFAULT_IMPORT_CONFIG.suspiciousPriceThresholds,
      ...(config.suspiciousPriceThresholds || {}),
    },
    suspiciousPriceStats: {
      ...DEFAULT_IMPORT_CONFIG.suspiciousPriceStats,
      ...(config.suspiciousPriceStats || {}),
    },
    classificationReport: {
      ...DEFAULT_IMPORT_CONFIG.classificationReport,
      ...(config.classificationReport || {}),
    },
    publishGuard: normalizePublishGuardConfig(config.publishGuard),
  };
}

function resolveProjectPath(value) {
  if (!value) {
    return projectRoot;
  }

  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

function getImportHistoryFile(config) {
  return resolveProjectPath(config.suspiciousPriceStats.historyFile);
}
export const MAX_PRICE_WORKSHEET_ROWS = 100_000;

export function assertWorksheetWithinRowLimit(
  worksheet,
  xlsx,
  maxRows = MAX_PRICE_WORKSHEET_ROWS
) {
  if (!worksheet?.['!fullref']) return;
  const fullRange = xlsx.utils.decode_range(worksheet['!fullref']);
  if (fullRange.e.r + 1 > maxRows) {
    throw new Error(
      `В листе прайса больше ${maxRows} строк; импорт остановлен по лимиту безопасности.`
    );
  }
}

async function loadWorkbookRows({ sourceBuffer = null } = {}) {
  try {
    const workbookBuffer =
      sourceBuffer || (await readLocalPriceFile(inputFile));
    const xlsx = await import('@e965/xlsx');
    const workbook = xlsx.read(workbookBuffer, {
      type: 'buffer',
      cellDates: false,
      sheetRows: MAX_PRICE_WORKSHEET_ROWS + 1,
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error('В Excel-файле нет листов');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    assertWorksheetWithinRowLimit(worksheet, xlsx);

    return xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'Пакет "@e965/xlsx" не установлен. Выполни: npm install @e965/xlsx'
      );
    }

    throw error;
  }
}

export function summarizeManufacturers(products = []) {
  const counts = new Map();
  const positions = new Map();
  const confidence = new Map();
  let recognized = 0;

  for (const product of products) {
    const manufacturer = String(product?.manufacturer || '').trim();
    if (!manufacturer) continue;
    recognized += 1;
    counts.set(manufacturer, (counts.get(manufacturer) || 0) + 1);
    const position = product?.manufacturerMatch?.position || 'unknown';
    positions.set(position, (positions.get(position) || 0) + 1);
    const confidenceLevel = product?.manufacturerMatch?.confidence || 'unknown';
    confidence.set(confidenceLevel, (confidence.get(confidenceLevel) || 0) + 1);
  }

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([manufacturer, count]) => ({ manufacturer, count }));

  return {
    total: products.length,
    recognized,
    withoutManufacturer: products.length - recognized,
    uniqueCount: counts.size,
    top,
    positions: Object.fromEntries(positions),
    confidence: Object.fromEntries(confidence),
  };
}

async function loadPreviousProducts() {
  let raw;
  try {
    raw = await fs.readFile(outputFile, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        raw = await fs.readFile(legacyOutputFile, 'utf-8');
      } catch (legacyError) {
        if (legacyError.code === 'ENOENT') return [];
        throw new Error(
          `Не удалось прочитать предыдущий products.json: ${legacyError.message}`
        );
      }
    } else {
      throw new Error(
        `Не удалось прочитать предыдущий products.json: ${error.message}`
      );
    }
  }
  return parsePreviousProducts(raw);
}

async function loadCurrentProductRegistry() {
  try {
    await fs.access(registryFile);
    return loadProductRegistry(registryFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return loadProductRegistry(legacyRegistryFile);
  }
}

export function buildRegistryKeyMigrations(
  previousProducts,
  currentStableKeys,
  currentProducts = []
) {
  const candidatesByNewKey = new Map();

  const bySource = new Map();
  const sourceKey = (name) =>
    String(name || '')
      .toLowerCase()
      .replace(/[\s-]+/gu, '')
      .replace(/(\d)[x×х](?=\d|\()/gu, '$1х');
  for (const product of currentProducts) {
    const names = [product.sourceName || product.fullName || product.name];
    const legacyName = buildLegacyImplicitName(
      product.fullName || product.name
    );
    if (legacyName) names.push(legacyName);
    for (const name of names) {
      const key = sourceKey(name);
      if (!bySource.has(key)) bySource.set(key, new Set());
      bySource.get(key).add(buildStableKey(product));
    }
  }

  for (const previousProduct of previousProducts) {
    const oldStableKey = buildStableKey(previousProduct);
    const reparsed = normalizeImportedProduct({
      ...previousProduct,
      name:
        previousProduct.sourceName ||
        previousProduct.fullName ||
        previousProduct.name,
      // Старый реестр уже содержит выделенного производителя. Передаём его
      // явно, чтобы повторный разбор не менял стабильный ключ.
      manufacturer: previousProduct.manufacturer,
      parseCable:
        previousProduct.catalogSectionSlug !== 'nekabelnaya-produkciya',
    });
    const classified = classifyProduct(reparsed);
    let newStableKey = buildStableKey({
      ...previousProduct,
      ...reparsed,
      manufacturer: classified.manufacturer || reparsed.manufacturer,
    });

    if (!currentStableKeys.has(newStableKey)) {
      const name =
        previousProduct.sourceName ||
        previousProduct.fullName ||
        previousProduct.name;
      const direct = bySource.get(sourceKey(name));
      // Старые версии добавляли «1х» даже к артикулам. Восстанавливаем связь
      // только при единственном полном совпадении с исходной строкой прайса.
      const implicit =
        !previousProduct.sourceName && previousProduct.cores === 1
          ? bySource.get(
              sourceKey(String(name).replace(/\s+1[хx×](?=\d)/iu, ' '))
            )
          : null;
      const candidates = direct || implicit;
      if (candidates?.size === 1) newStableKey = [...candidates][0];
    }

    if (
      oldStableKey === newStableKey ||
      currentStableKeys.has(oldStableKey) ||
      !currentStableKeys.has(newStableKey)
    ) {
      continue;
    }

    if (!candidatesByNewKey.has(newStableKey)) {
      candidatesByNewKey.set(newStableKey, new Set());
    }
    candidatesByNewKey.get(newStableKey).add(oldStableKey);
  }

  const migrations = new Map();
  let ambiguous = 0;
  const destinations = new Map();
  for (const [newKey, oldKeys] of candidatesByNewKey) {
    for (const oldKey of oldKeys) {
      if (!destinations.has(oldKey)) destinations.set(oldKey, new Set());
      destinations.get(oldKey).add(newKey);
    }
  }

  for (const [newStableKey, oldStableKeys] of candidatesByNewKey) {
    if (
      oldStableKeys.size !== 1 ||
      destinations.get([...oldStableKeys][0]).size !== 1
    ) {
      ambiguous += 1;
      continue;
    }

    migrations.set([...oldStableKeys][0], newStableKey);
  }

  return { migrations, ambiguous };
}

// Только для миграции старых данных: воспроизводит прежнее ошибочное добавление
// «1х» к числам в артикулах. Новый импорт эту эвристику не использует.
function buildLegacyImplicitName(name) {
  const parsed = parseProductName(name);
  if (parsed.cores && !parsed.isImplicitSingleCore) return null;
  let source = String(name || '');
  if (parsed.manufacturer) source = source.replace(/^[А-ЯЁA-Z]{4,}[-\s]/iu, '');
  const match = source.match(/^(.*?)(\d+(?:[.,]\d+)?)(?:\s+([^\d].*))?$/u);
  if (!match) return null;
  const number = Number(match[2].replace(',', '.'));
  if (!(number > 0 && number <= 1000)) return null;
  const prefix = parseProductName(match[1].trim());
  const attrs = [...prefix.attributes, match[3] || '']
    .filter(Boolean)
    .join(' ');
  return `${prefix.mark} 1х${Number(number.toFixed(3))}${attrs ? ` ${attrs}` : ''}`;
}

async function loadImportHistory(config) {
  const historyFile = getImportHistoryFile(config);

  let raw;
  try {
    raw = await fs.readFile(historyFile, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeImportHistory({});
    throw new Error(`Не удалось прочитать историю импортов: ${error.message}`);
  }
  return parseImportHistory(raw);
}

function buildClassificationReport(products, config) {
  const reportConfig = config.classificationReport;
  const topPrefixLimit = Math.max(1, Number(reportConfig.topPrefixLimit) || 20);
  const productLimit = Math.max(1, Number(reportConfig.productLimit) || 500);
  const fallbackProducts = products.filter(isFallbackToOther);
  const prefixMap = new Map();

  for (const product of fallbackProducts) {
    const prefix = extractUnrecognizedPrefix(product);
    if (!prefixMap.has(prefix)) {
      prefixMap.set(prefix, {
        prefix,
        count: 0,
        examples: [],
      });
    }

    const entry = prefixMap.get(prefix);
    entry.count += 1;

    if (entry.examples.length < 5) {
      entry.examples.push({
        name: product.name,
        markFamily: product.markFamily || '',
        sourceCategory: product.sourceCategory || '',
      });
    }
  }

  const topPrefixes = [...prefixMap.values()]
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix, 'ru'))
    .slice(0, topPrefixLimit);

  return {
    fallbackToOther: {
      count: fallbackProducts.length,
      productLimit,
      topPrefixLimit,
      truncated: Math.max(0, fallbackProducts.length - productLimit),
      topPrefixes,
      products: fallbackProducts.slice(0, productLimit).map((product) => ({
        name: product.name,
        mark: product.mark || '',
        markFamily: product.markFamily || '',
        sourceCategory: product.sourceCategory || '',
        unit: product.unit,
        price: product.price,
        stock: product.stock,
        prefix: extractUnrecognizedPrefix(product),
      })),
    },
  };
}

function stripClassificationDiagnostics(product) {
  const {
    catalogClassificationSource,
    catalogClassificationMatch,
    manufacturerMatch,
    sourceRowIndex,
    importDisposition,
    dispositionReason,
    dispositionEvidence,
    ...publicProduct
  } = product;

  return publicProduct;
}

function isFallbackToOther(product) {
  return (
    product.catalogClassificationSource === 'fallback' &&
    product.catalogCategorySlug === 'prochee'
  );
}

function extractUnrecognizedPrefix(product) {
  const source = String(
    product.markFamily || product.mark || product.name || ''
  ).trim();

  if (!source) {
    return 'Без марки';
  }

  const manufacturer = String(product.manufacturer || '').trim();
  const withoutManufacturer =
    manufacturer && source.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? source.slice(manufacturer.length).replace(/^[-\s]+/, '')
      : source;
  const compact = withoutManufacturer.replace(/\s+/g, ' ').trim();
  const withoutSpec = compact
    .replace(/\s+\d+\s*[xх×].*$/i, '')
    .replace(/\s+\d+(?:[.,]\d+)?\s*[кkК]\s*[вvВV].*$/i, '')
    .trim();
  const tokenMatch = withoutSpec.match(
    /^[A-Za-zА-Яа-яЁё0-9]+(?:[-/][A-Za-zА-Яа-яЁё0-9]+)?/
  );
  const token = (tokenMatch?.[0] || withoutSpec.split(/\s+/)[0] || compact)
    .replace(/[.,;:()]+$/g, '')
    .trim();

  return token || 'Без марки';
}

async function saveReport(report) {
  await writeFileAtomic(reportFile, JSON.stringify(report, null, 2));
}

async function saveHtmlReport(report) {
  await writeFileAtomic(
    reportHtmlFile,
    buildReportHtml(report, {
      fallbackSourceFile: inputFile,
      jsonReportPath: path.relative(projectRoot, reportFile),
    })
  );
}

async function main() {
  if (
    process.env.CATALOG_PRODUCTS_FILE &&
    path.resolve(projectRoot, process.env.CATALOG_PRODUCTS_FILE) !== outputFile
  ) {
    throw new Error(
      `CATALOG_PRODUCTS_FILE должен указывать внутрь общего выпуска: ${outputFile}`
    );
  }
  if (
    process.env.PUBLIC_ARTIFACTS_DIR &&
    path.resolve(projectRoot, process.env.PUBLIC_ARTIFACTS_DIR) !== publicDir
  ) {
    throw new Error(
      `PUBLIC_ARTIFACTS_DIR должен указывать внутрь общего выпуска: ${publicDir}`
    );
  }

  const priceSource = await acquirePriceSource({
    remoteUrl: remoteSourceUrl,
    filePath: inputFile,
  });
  const sourcePriceBuffer = priceSource.buffer;
  const downloadedPriceBuffer = remoteSourceUrl ? sourcePriceBuffer : null;
  console.log(
    `Чтение прайса: ${priceSource.metadata.downloadUrl || inputFile}`
  );
  console.log(
    `Источник проверен: ${priceSource.metadata.kind}, ${priceSource.metadata.sizeBytes} байт, SHA-256 ${priceSource.metadata.sha256}`
  );
  if (isDryRun) {
    console.log('Режим: --dry-run (файлы не записываются)');
  }
  const generatedAt = new Date().toISOString();
  const importConfig = await loadImportConfig();
  const previousProducts = await loadPreviousProducts();
  const importHistory = await loadImportHistory(importConfig);
  const registry = await loadCurrentProductRegistry();
  await loadPriceOverrides();

  const rows = await loadWorkbookRows({ sourceBuffer: sourcePriceBuffer });
  const schema = detectSchema(rows);

  if (schema.headerRowsFound === 0) {
    throw new Error(
      'Не найден ни один заголовок таблицы (наименование/ед.изм/цена/остаток). Возможно, изменилась структура прайса.'
    );
  }

  if (schema.missingHeaders.length > 0) {
    throw new Error(
      `В заголовках прайса не найдены обязательные колонки: ${schema.missingHeaders.join(', ')}. Проверь структуру файла.`
    );
  }

  const importResult = extractProducts(rows, { applyPriceOverride });
  const manufacturerSummary = summarizeManufacturers(importResult.products);
  const classifiedProducts = classifyEligibleProducts(importResult.products);
  const diagnostics = validateNormalizedProducts(classifiedProducts, {
    excludedNonCable: importResult.excludedNonCable,
    reviewRows: importResult.reviewRows,
  });
  const previousCableProducts = previousProducts.filter(isCableCatalogProduct);

  // Pre-pass: считаем стабильные ключи всех текущих позиций, чтобы
  // отличить осиротевшие записи (исчезли из импорта) от просто новых.
  // Только осиротевшие — кандидаты на rename по spec-ключу.
  const currentStableKeys = new Set(
    classifiedProducts.map((product) => buildStableKey(product))
  );
  const keyMigrationPlan = buildRegistryKeyMigrations(
    previousProducts,
    currentStableKeys,
    classifiedProducts
  );
  const keyMigration = migrateStableIdentityKeys(
    registry,
    keyMigrationPlan.migrations
  );
  const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);

  const stableKeyCounts = new Map();
  for (const product of classifiedProducts) {
    const stableKey = buildStableKey(product);
    stableKeyCounts.set(stableKey, (stableKeyCounts.get(stableKey) || 0) + 1);
  }
  const stableKeyOccurrences = new Map();

  const productsWithIdentity = classifiedProducts.map((product) => {
    const stableKey = buildStableKey(product);
    const occurrence = stableKeyOccurrences.get(stableKey) || 0;
    stableKeyOccurrences.set(stableKey, occurrence + 1);
    const identity = assignStableIdentity(registry, product, generatedAt, {
      ...(occurrence === 0 ? { orphanIndex } : {}),
      ...(stableKeyCounts.get(stableKey) > 1 && occurrence > 0
        ? {
            identityDiscriminator: `row-${product.sourceRowIndex ?? 'unknown'}-occurrence-${occurrence}`,
          }
        : {}),
    });
    return {
      id: identity.id,
      slug: identity.slug,
      sku: identity.sku,
      ...product,
    };
  });

  const slugRedirects = buildSlugRedirects(registry);

  const products = productsWithIdentity.map(stripClassificationDiagnostics);

  const diff = buildDiff(previousProducts, products);
  const skipsByReason = summarizeSkips(importResult.skippedRows);
  const byCategory = summarizeByCategory(products);
  const historicalSnapshots = getHistoricalSnapshots(
    importHistory,
    previousProducts,
    inputFile
  );
  const suspiciousPriceStats = buildSuspiciousPriceStats(
    importConfig,
    historicalSnapshots,
    {
      historyFile: path.relative(
        projectRoot,
        getImportHistoryFile(importConfig)
      ),
    }
  );
  const suspicious = detectSuspicious(products, suspiciousPriceStats);
  const classification = buildClassificationReport(
    classifiedProducts,
    importConfig
  );

  // Исключение некабельных позиций — ожидаемая бизнес-операция, а не
  // аварийное удаление каталога. Поэтому guard сравнивает только кабельную
  // часть предыдущего каталога; полный diff всё равно сохраняется в отчёте.
  const publishGuard = evaluatePublishGuard({
    config: importConfig.publishGuard,
    previousProducts: previousCableProducts,
    products,
    diff: buildDiff(previousCableProducts, products),
    suspicious,
    skippedRows: importResult.skippedRows,
    reviewRows: importResult.reviewRows,
    errors: diagnostics.errors,
    totalRows: importResult.totalRows,
    fallbackToOther: classification.fallbackToOther.count,
  });
  let backup = null;

  const report = {
    generatedAt,
    sourceFile: inputFile,
    source: priceSource.metadata,
    ...(priceSource.metadata.requestedUrl
      ? { sourceUrl: priceSource.metadata.requestedUrl }
      : {}),
    dryRun: isDryRun,
    schema,
    registryFile: path.relative(projectRoot, registryFile),
    registryEntries: Object.keys(registry.entries).length,
    registryNextId: registry.nextId,
    registryKeyMigration: {
      ...keyMigration,
      ambiguous: keyMigrationPlan.ambiguous,
    },
    importConfigFile: path.relative(projectRoot, importConfigFile),
    priceAlertPercent: PRICE_JUMP_ALERT_PERCENT,
    summary: {
      totalRowsInSheet: importResult.totalRows,
      categoriesDetected: importResult.categoriesSeen.size,
      productsImported: products.length,
      productsPrevious: previousProducts.length,
      excludedNonCable: importResult.excludedNonCable,
      reviewRows: importResult.reviewRows.length,
      validationErrors: diagnostics.summary.errors,
      validationWarnings: diagnostics.summary.warnings,
      duplicateGroups: diagnostics.summary.duplicateGroups,
      manufacturers: manufacturerSummary,
      skippedRows: importResult.skippedRows.length,
      suspicious: suspicious.length,
      added: diff.added.length,
      removed: diff.removed.length,
      priceChanged: diff.priceChanged.length,
      priceAlerts: diff.priceAlerts.length,
      stockChanged: diff.stockChanged.length,
      categoryChanged: diff.categoryChanged.length,
      fallbackToOther: classification.fallbackToOther.count,
    },
    skipsByReason,
    manufacturers: manufacturerSummary,
    productsByCategory: byCategory,
    skippedRows: importResult.skippedRows,
    reviewRows: importResult.reviewRows,
    diagnostics,
    suspicious,
    suspiciousPriceStats,
    classification,
    diff,
    publishGuard: {
      ...publishGuard,
      overridden: isPublishGuardOverride,
    },
    backup: backup
      ? {
          id: backup.id,
          path: path.relative(projectRoot, backup.backupPath),
          files: backup.files.length,
        }
      : null,
  };

  if (!publishGuard.ok && !isPublishGuardOverride) {
    const validationDetails = diagnostics.errors.length
      ? [
          `Ошибки диагностики (${diagnostics.errors.length}):`,
          ...diagnostics.errors.slice(0, 8).map((item) => {
            const row = Number.isInteger(item.rowIndex)
              ? `строка ${item.rowIndex + 1}: `
              : Array.isArray(item.rows) && item.rows.length > 0
                ? `строки ${item.rows.map((index) => index + 1).join(', ')}: `
                : '';
            const subject = Array.isArray(item.products)
              ? `${item.products.join(' / ')} — `
              : item.product
                ? `${item.product} — `
                : '';
            return `- ${row}${subject}${item.message}`;
          }),
          ...(diagnostics.errors.length > 8
            ? [
                `… ещё ${diagnostics.errors.length - 8}; подробности в import-report.json при обычном запуске.`,
              ]
            : []),
        ].join('\n')
      : '';
    const message = [formatPublishGuardFailure(publishGuard), validationDetails]
      .filter(Boolean)
      .join('\n');
    if (!isDryRun) {
      report.blocked = true;
      report.message = message;
      await saveReport(report);
      await saveHtmlReport(report);
    }
    throw new Error(message);
  }

  if (
    !isDryRun &&
    String(process.env.BACKUP_ENABLED || 'true')
      .trim()
      .toLowerCase() !== 'false'
  ) {
    backup = await createBackup();
    report.backup = {
      id: backup.id,
      path: path.relative(projectRoot, backup.backupPath),
      files: backup.files.length,
    };
  }

  let seoSummary = null;
  let runtimeProductPrerenderCount = null;

  if (!isDryRun) {
    try {
      const published = await publishImportArtifacts({
        projectRoot,
        catalogDir,
        publicDir,
        outputFile,
        registryFile,
        reportFile,
        reportHtmlFile,
        historyFile: getImportHistoryFile(importConfig),
        publicPriceFile,
        redirectsFile,
        redirectsNginxFile,
        inputFile,
        categoriesFile: catalogCategoriesFile,
        runtimePrerenderTemplateDir,
        runtimePrerenderEnabled: Boolean(process.env.PUBLIC_ARTIFACTS_DIR),
        siteUrl: process.env.SITE_URL || process.env.VITE_SITE_URL,
        products,
        registry,
        report,
        sourcePriceBuffer,
        downloadedPriceBuffer,
        slugRedirects,
        importConfig,
        importHistory,
        generatedAt,
        source: priceSource.metadata,
      });
      seoSummary = published.seoSummary;
      runtimeProductPrerenderCount = published.runtimeProductPrerenderCount;
      for (const warning of published.compatibilityWarnings || []) {
        console.warn(`[price-import] ${warning}`);
      }
    } catch (error) {
      report.blocked = true;
      report.message = `Транзакция публикации прервана; старые артефакты восстановлены, если замена уже началась. Причина: ${error.message}`;
      await Promise.all([saveReport(report), saveHtmlReport(report)]).catch(
        (reportError) => {
          console.error(
            `Не удалось сохранить отчёт об ошибке публикации: ${reportError.message}`
          );
        }
      );
      throw error;
    }
  }

  console.log('');
  console.log('=== Импорт завершён ===');
  console.log(`  Товаров импортировано: ${products.length}`);
  console.log(`  Исключено некабельных:  ${importResult.excludedNonCable}`);
  console.log(
    `  Производители: ${manufacturerSummary.uniqueCount} уникальных, ` +
      `${manufacturerSummary.recognized} строк распознано, ` +
      `${manufacturerSummary.withoutManufacturer} без производителя`
  );
  console.log(`  Было ранее:            ${previousProducts.length}`);
  console.log(`  Категорий:             ${importResult.categoriesSeen.size}`);
  console.log(`  Пропущено строк:       ${importResult.skippedRows.length}`);
  console.log(`  На ручной проверке:    ${importResult.reviewRows.length}`);
  console.log(`  Ошибки нормализации:   ${diagnostics.summary.errors}`);
  console.log(`  Предупреждения:        ${diagnostics.summary.warnings}`);
  console.log(
    `  Группы дублей:         ${diagnostics.summary.duplicateGroups}`
  );
  if (Object.keys(skipsByReason).length > 0) {
    for (const [reason, count] of Object.entries(skipsByReason)) {
      console.log(`    - ${reason}: ${count}`);
    }
  }
  if (suspicious.length > 0) {
    console.log('');
    console.log(`⚠  Подозрительных цен: ${suspicious.length}`);
    for (const item of suspicious.slice(0, 5)) {
      console.log(
        `    - ${item.name} (${item.price} ₽/${item.unit || '?'}): ${item.reasons.join('; ')}`
      );
    }
    if (suspicious.length > 5) {
      console.log(`    … ещё ${suspicious.length - 5} (см. отчёт)`);
    }
  }
  console.log('');
  console.log('=== Изменения относительно предыдущего импорта ===');
  console.log(`  Добавлено:       ${diff.added.length}`);
  console.log(`  Удалено:         ${diff.removed.length}`);
  console.log(`  Изменена цена:   ${diff.priceChanged.length}`);
  console.log(`  Изменён остаток: ${diff.stockChanged.length}`);
  console.log(`  Сменили категорию: ${diff.categoryChanged.length}`);
  console.log(`  Fallback «Прочее»: ${classification.fallbackToOther.count}`);

  if (classification.fallbackToOther.topPrefixes.length > 0) {
    console.log('');
    console.log('=== Нераспознанные префиксы в «Прочее» ===');
    for (const item of classification.fallbackToOther.topPrefixes.slice(0, 5)) {
      console.log(`  ${item.prefix}: ${item.count}`);
    }
  }

  if (diff.priceAlerts.length > 0) {
    console.log('');
    console.log(
      `⚠  Резкие изменения цен (≥${PRICE_JUMP_ALERT_PERCENT}%): ${diff.priceAlerts.length}`
    );
    for (const item of diff.priceAlerts.slice(0, 5)) {
      const arrow = item.deltaPercent > 0 ? '↑' : '↓';
      console.log(
        `    ${arrow} ${item.name}: ${item.priceBefore} → ${item.priceAfter} (${item.deltaPercent > 0 ? '+' : ''}${item.deltaPercent}%)`
      );
    }
    if (diff.priceAlerts.length > 5) {
      console.log(
        `    … ещё ${diff.priceAlerts.length - 5} (см. diff.priceAlerts в отчёте)`
      );
    }
  }

  console.log('');
  console.log(
    `Защита публикации: ${publishGuard.ok ? 'PASS' : 'BLOCKED'}${
      isPublishGuardOverride ? ' (ручной override)' : ''
    }`
  );
  if (!publishGuard.ok) {
    for (const issue of publishGuard.issues) {
      console.log(`    - ${issue.message}`);
    }
  }

  console.log('');
  console.log(
    `Реестр товаров: ${path.relative(projectRoot, registryFile)} · записей: ${Object.keys(registry.entries).length} · nextId: ${registry.nextId}`
  );
  console.log(
    `Миграция ключей: перенесено=${keyMigration.migrated}, пропущено=${keyMigration.skipped}, неоднозначно=${keyMigrationPlan.ambiguous}`
  );
  const redirectsCount = Object.keys(slugRedirects).length;
  if (redirectsCount > 0) {
    console.log(
      `Slug-редиректы: ${path.relative(projectRoot, redirectsFile)} · ${redirectsCount} переименований`
    );
  }
  if (seoSummary) {
    const indexRel = path.relative(projectRoot, seoSummary.indexPath);
    const robotsRel = path.relative(projectRoot, seoSummary.robotsPath);
    const {
      pages,
      categories,
      products: prodCount,
      total,
      productSitemaps,
    } = seoSummary.counts;
    const productSitemapInfo =
      productSitemaps > 1 ? `, productSitemaps:${productSitemaps}` : '';
    console.log(
      `SEO: ${indexRel} (index → pages:${pages}, categories:${categories}, products:${prodCount}${productSitemapInfo}, total:${total} URL) · ${robotsRel}`
    );
  }
  if (runtimeProductPrerenderCount != null) {
    console.log(
      `Runtime prerender: product HTML=${runtimeProductPrerenderCount}`
    );
  }
  console.log(
    `Схема прайса: заголовков=${schema.headerRowsFound}, найдено=${schema.detectedHeaders.join(',')}`
  );
  if (isDryRun) {
    console.log('');
    console.log(
      '--- DRY RUN: products.json / productRegistry.json / отчёты не записаны ---'
    );
  } else {
    console.log(`JSON-отчёт: ${path.relative(projectRoot, reportFile)}`);
    console.log(`HTML-отчёт: ${path.relative(projectRoot, reportHtmlFile)}`);
    console.log(`Открыть: ${pathToFileURL(reportHtmlFile).href}`);
  }
}

const isMainModule =
  import.meta.url === pathToFileURL(process.argv[1] || '').href;

if (isMainModule) {
  const run = async () => {
    if (process.env.PRICE_IMPORT_LOCK_HELD_BY_SCHEDULER === '1') {
      return main();
    }
    const releaseLock = await acquirePriceImportLock(importLockFile);
    if (!releaseLock) {
      throw new Error('Импорт прайса уже выполняется в другом процессе.');
    }
    try {
      return await main();
    } finally {
      await releaseLock();
    }
  };

  run().catch((error) => {
    console.error('Ошибка импорта прайса:', error.message);
    process.exitCode = 1;
  });
}
