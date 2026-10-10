// Файл импортирует прайс XLS, нормализует товары, категории, SEO-данные и публичные файлы каталога.

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  normalizeImportedProduct,
  parseProductName,
} from './lib/priceParser.js';
import {
  loadTemplate as loadPrerenderTemplate,
  prerenderProducts,
  validatePrerenderProducts,
} from './prerender.js';
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
  saveProductRegistry,
} from './lib/productRegistry.js';
import { assertProductPrerenderCoverage } from './lib/productPrerenderAudit.js';
import { writeSeoArtifacts } from './lib/siteSeo.js';
import {
  DEFAULT_PUBLISH_GUARD_CONFIG,
  evaluatePublishGuard,
  formatPublishGuardFailure,
  normalizePublishGuardConfig,
} from './lib/importPublishGuard.js';
import { createBackup } from './backupData.js';
import { validateNormalizedProducts } from './lib/importDiagnostics.js';
import { commitArtifactBatch } from './lib/artifactTransaction.js';
import { acquirePriceImportLock } from './lib/importLock.js';
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
import {
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
const outputFile = path.join(projectRoot, 'data', 'products.json');
const reportFile = path.join(projectRoot, 'data', 'import-report.json');
const reportHtmlFile = path.join(projectRoot, 'data', 'import-report.html');
const overridesFile = path.join(projectRoot, 'data', 'priceOverrides.json');
const importConfigFile = path.join(projectRoot, 'data', 'importConfig.json');
const registryFile = path.join(projectRoot, 'data', 'productRegistry.json');
const importLockFile = path.join(projectRoot, 'data', '.price-import.lock');
const publicDir = path.resolve(
  projectRoot,
  process.env.PUBLIC_ARTIFACTS_DIR || 'public'
);
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

async function writeFileAtomic(filePath, data, { mode } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(tmpPath, 'wx', mode ?? 0o666);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmpPath, filePath);
    if (mode != null) {
      await fs.chmod(filePath, mode);
    }
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function getStagedPath(stageRoot, targetPath) {
  const relativePath = path.relative(projectRoot, path.resolve(targetPath));
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Артефакт импорта должен находиться внутри проекта: ${targetPath}`
    );
  }
  return path.join(stageRoot, relativePath);
}

async function listFilesRecursively(rootDir) {
  const files = [];
  async function visit(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  await visit(rootDir);
  return files;
}

function isPathInside(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

async function countHtmlFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.endsWith('.html')).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function writeRuntimeProductPrerender(
  products,
  seoSummary = null,
  outputDir = publicDir
) {
  if (!process.env.PUBLIC_ARTIFACTS_DIR) return null;
  if (!seoSummary) {
    throw new Error(
      'Runtime product-prerender требует свежий sitemap из writeSeoArtifacts.'
    );
  }

  let template;
  try {
    template = await loadPrerenderTemplate({
      outputDir: runtimePrerenderTemplateDir,
    });
  } catch (error) {
    throw new Error(
      `Не удалось прочитать шаблон runtime-prerender карточек товара: ${error.message}`
    );
  }

  validatePrerenderProducts(products, { source: outputFile });
  await prerenderProducts(template, products, {
    outputDir,
    log: null,
    validate: false,
  });
  const productDir = path.join(outputDir, 'product');
  const writtenCount = await countHtmlFiles(productDir);
  const coverage = await assertProductPrerenderCoverage({
    publicDir: outputDir,
    productDir,
    products,
    productSitemapPaths: seoSummary?.productSitemapPaths || [],
  });
  if (writtenCount !== coverage.htmlCount) {
    throw new Error(
      `Runtime prerender записал ${writtenCount} HTML, но product sitemap содержит ${coverage.htmlCount} URL.`
    );
  }
  return writtenCount;
}

// Slug может попасть в URL только через [a-z0-9-], всё остальное транслит/чистка
// в slugify. На всякий случай отбрасываем записи с подозрительными символами:
// этот файл исполняется nginx из immutable web-образа, поэтому не даём
// протащить директивы через runtime/import data.
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

export function buildRedirectsNginxConf(redirects) {
  const lines = [
    '# Сгенерировано scripts/importPrice.js — не редактируй вручную.',
    '# Подключается из nginx.conf через include.',
  ];
  const entries = Object.entries(redirects || {})
    .filter(
      ([oldSlug, newSlug]) =>
        SAFE_SLUG_RE.test(oldSlug) && SAFE_SLUG_RE.test(newSlug)
    )
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [oldSlug, newSlug] of entries) {
    lines.push(
      `location = /product/${oldSlug} { return 301 /product/${newSlug}; }`
    );
  }
  return lines.join('\n') + '\n';
}

async function loadPreviousProducts() {
  let raw;
  try {
    raw = await fs.readFile(outputFile, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error(
      `Не удалось прочитать предыдущий products.json: ${error.message}`
    );
  }
  return parsePreviousProducts(raw);
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
  await writeFileAtomic(reportHtmlFile, buildReportHtml(report));
}

const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 3,
});

const reportDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return numberFormatter.format(number);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return `${formatNumber(value)} ₽`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return `${number > 0 ? '+' : ''}${numberFormatter.format(number)}%`;
}

function formatReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return reportDateFormatter.format(date);
}

function deltaClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return '';
  }

  return number > 0 ? 'positive' : 'negative';
}

function renderTable(rows, columns, emptyMessage, rowClass = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const className = rowClass ? rowClass(row) : '';
              const classAttribute = className
                ? ` class="${escapeHtml(className)}"`
                : '';

              return `
                <tr${classAttribute}>
                  ${columns
                    .map((column) => {
                      const value = column.render
                        ? column.render(row)
                        : escapeHtml(row[column.key]);

                      return `<td data-label="${escapeHtml(column.label)}">${value}</td>`;
                    })
                    .join('')}
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return '—';
  }

  return reasons.map((reason) => escapeHtml(reason)).join('<br>');
}

function renderExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return '—';
  }

  return examples
    .slice(0, 3)
    .map((example) => escapeHtml(example.name))
    .join('<br>');
}

function renderReportTabs(report, alertPercent) {
  const diff = report.diff || {};
  const summary = report.summary || {};
  const fallbackToOther = report.classification?.fallbackToOther || {};
  const priceRows = [...(diff.priceChanged || [])].sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );
  const priceAlertRows = (
    diff.priceAlerts?.length
      ? [...diff.priceAlerts]
      : priceRows.filter(
          (row) => Math.abs(Number(row.deltaPercent) || 0) >= alertPercent
        )
  ).sort(
    (a, b) =>
      Math.abs(Number(b.deltaPercent) || 0) -
      Math.abs(Number(a.deltaPercent) || 0)
  );

  const productColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Цена', render: (row) => formatMoney(row.price) },
    { label: 'Остаток', render: (row) => formatNumber(row.stock) },
  ];
  const priceColumns = [
    { key: 'name', label: 'Наименование' },
    { key: 'category', label: 'Категория' },
    { label: 'Было', render: (row) => formatMoney(row.priceBefore) },
    { label: 'Стало', render: (row) => formatMoney(row.priceAfter) },
    {
      label: 'Изменение',
      render: (row) =>
        `<span class="delta ${deltaClass(row.deltaPercent)}">${formatPercent(row.deltaPercent)}</span>`,
    },
  ];
  const tabs = [
    {
      id: 'added',
      label: 'Добавлено',
      count: summary.added ?? diff.added?.length ?? 0,
      content: renderTable(diff.added, productColumns, 'Новых позиций нет.'),
    },
    {
      id: 'removed',
      label: 'Удалено',
      count: summary.removed ?? diff.removed?.length ?? 0,
      content: renderTable(
        diff.removed,
        productColumns,
        'Удалённых позиций нет.'
      ),
    },
    {
      id: 'prices',
      label: `Цены ±${alertPercent}%`,
      count: summary.priceAlerts ?? priceAlertRows.length,
      content: `
        <p class="panel-note">
          Порог резкого изменения: ${formatNumber(alertPercent)}%.
          Всего изменённых цен: ${formatNumber(summary.priceChanged ?? priceRows.length)}.
        </p>
        ${renderTable(priceAlertRows, priceColumns, `Изменений цен на ±${alertPercent}% и больше нет.`)}
        ${
          priceRows.length > priceAlertRows.length
            ? `<details class="details-block">
                <summary>Все изменения цен (${formatNumber(priceRows.length)})</summary>
                ${renderTable(priceRows, priceColumns, 'Изменённых цен нет.')}
              </details>`
            : ''
        }
      `,
    },
    {
      id: 'suspicious',
      label: 'Подозрительные',
      count: summary.suspicious ?? report.suspicious?.length ?? 0,
      content: renderTable(
        report.suspicious,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { key: 'unit', label: 'Ед.' },
          { label: 'Цена', render: (row) => formatMoney(row.price) },
          { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          { label: 'Причина', render: (row) => renderReasons(row.reasons) },
        ],
        'Подозрительных цен нет.'
      ),
    },
    {
      id: 'categories',
      label: 'Смена категорий',
      count: summary.categoryChanged ?? diff.categoryChanged?.length ?? 0,
      content: renderTable(
        diff.categoryChanged,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'categoryBefore', label: 'Было' },
          { key: 'categoryAfter', label: 'Стало' },
        ],
        'Смен категорий нет.'
      ),
    },
    {
      id: 'unclassified',
      label: 'Прочее',
      count: fallbackToOther.count ?? 0,
      content: `
        <p class="panel-note">
          Позиции, которые не подошли ни под одно правило и ушли в fallback «Прочее».
          ${
            fallbackToOther.truncated
              ? `Показаны первые ${formatNumber(fallbackToOther.productLimit)}, скрыто ${formatNumber(fallbackToOther.truncated)}.`
              : ''
          }
        </p>
        <h2>Частые нераспознанные префиксы</h2>
        ${renderTable(
          fallbackToOther.topPrefixes,
          [
            { key: 'prefix', label: 'Префикс' },
            { label: 'Позиций', render: (row) => formatNumber(row.count) },
            { label: 'Примеры', render: (row) => renderExamples(row.examples) },
          ],
          'Нераспознанных префиксов нет.'
        )}
        <h2 class="section-subtitle">Позиции в fallback</h2>
        ${renderTable(
          fallbackToOther.products,
          [
            { key: 'name', label: 'Наименование' },
            { key: 'prefix', label: 'Префикс' },
            { key: 'markFamily', label: 'Марка' },
            { key: 'sourceCategory', label: 'Исходная категория' },
            { key: 'unit', label: 'Ед.' },
            { label: 'Цена', render: (row) => formatMoney(row.price) },
            { label: 'Остаток', render: (row) => formatNumber(row.stock) },
          ],
          'Позиции в fallback «Прочее» не найдены.'
        )}
      `,
    },
  ];

  return `
    <div class="tabs" role="tablist">
      ${tabs
        .map(
          (tab, index) => `
            <button class="tab-button${index === 0 ? ' active' : ''}" type="button" data-tab="${tab.id}">
              <span>${escapeHtml(tab.label)}</span>
              <strong>${formatNumber(tab.count)}</strong>
            </button>
          `
        )
        .join('')}
    </div>
    <div class="panels">
      ${tabs
        .map(
          (tab, index) => `
            <section class="tab-panel${index === 0 ? ' active' : ''}" data-panel="${tab.id}">
              ${tab.content}
            </section>
          `
        )
        .join('')}
    </div>
  `;
}

function renderStockChanges(report) {
  const rows = report.diff?.stockChanged || [];

  return `
    <details class="details-block">
      <summary>Изменения остатков (${formatNumber(rows.length)})</summary>
      ${renderTable(
        rows,
        [
          { key: 'name', label: 'Наименование' },
          { key: 'category', label: 'Категория' },
          { label: 'Было', render: (row) => formatNumber(row.stockBefore) },
          { label: 'Стало', render: (row) => formatNumber(row.stockAfter) },
        ],
        'Изменений остатков нет.'
      )}
    </details>
  `;
}

function renderSuspiciousPriceStats(report) {
  const rows = Object.entries(report.suspiciousPriceStats?.byUnit || {}).map(
    ([unit, stats]) => ({
      unit,
      ...stats,
    })
  );

  return renderTable(
    rows,
    [
      { key: 'unit', label: 'Ед.' },
      { label: 'Цен в истории', render: (row) => formatNumber(row.count) },
      {
        label: 'Макс. в импорте',
        render: (row) => formatNumber(row.maxImportSamples),
      },
      { label: 'p95', render: (row) => formatMoney(row.p95) },
      { label: 'p99', render: (row) => formatMoney(row.p99) },
      { label: 'Порог', render: (row) => formatMoney(row.threshold) },
      {
        label: 'Источник',
        render: (row) =>
          row.source === 'history'
            ? `История (${formatThresholdSource(row)})`
            : 'importConfig.json',
      },
    ],
    'Статистика цен пока не накоплена.'
  );
}

function buildReportHtml(report) {
  const summary = report.summary || {};
  const alertPercent = Number(
    report.priceAlertPercent || PRICE_JUMP_ALERT_PERCENT
  );
  const sourceFileName = path.basename(report.sourceFile || inputFile);
  const sourceMetadata = report.source || {};
  const sourceReference =
    sourceMetadata.downloadUrl ||
    sourceMetadata.requestedUrl ||
    report.sourceUrl ||
    report.sourceFile ||
    inputFile;
  const sourceSize = Number.isFinite(Number(sourceMetadata.sizeBytes))
    ? `${formatNumber(sourceMetadata.sizeBytes)} байт`
    : 'неизвестен';
  const sourceFingerprint = sourceMetadata.sha256 || 'не рассчитана';
  const categoryRows = Object.entries(report.productsByCategory || {}).map(
    ([category, count]) => ({ category, count })
  );
  const skipRows = Object.entries(report.skipsByReason || {}).map(
    ([reason, count]) => ({
      reason,
      count,
    })
  );
  const skippedRows = Array.isArray(report.skippedRows)
    ? report.skippedRows
    : [];
  const reviewRows = Array.isArray(report.reviewRows) ? report.reviewRows : [];
  const diagnostics = report.diagnostics || {};
  const diagnosticRows = [
    ...(diagnostics.errors || []),
    ...(diagnostics.warnings || []),
    ...(diagnostics.info || []),
  ];
  const manufacturerRows = Array.isArray(report.manufacturers?.top)
    ? report.manufacturers.top
    : [];
  const statCards = [
    ['Импортировано', summary.productsImported],
    ['Было ранее', summary.productsPrevious],
    ['Категорий найдено', summary.categoriesDetected],
    ['На проверке', summary.reviewRows],
    ['Ошибки проверки', summary.validationErrors],
    ['Предупреждения', summary.validationWarnings],
    ['Строк пропущено', summary.skippedRows],
    ['Изменений цен', summary.priceChanged],
    ['Изменений остатков', summary.stockChanged],
    ['Прочее fallback', summary.fallbackToOther],
  ];

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Отчёт импорта прайса</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --paper: #fbfdff;
      --ink: #0a1628;
      --muted: #5a6f87;
      --line: #d7e3ef;
      --accent: linear-gradient(180deg, #ffd35a 0%, #f2b705 100%);
      font-family: Inter, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    main { max-width: 1240px; margin: 0 auto; padding: 34px 22px 48px; }
    .hero, .panel, .stat {
      background: var(--paper);
      border: 1px solid #e2eaf4;
      border-radius: 24px;
      box-shadow: 0 14px 34px rgba(17, 53, 95, 0.06);
    }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow {
      display: inline-flex; margin-bottom: 12px; padding: 7px 12px;
      border-radius: 999px; border: 1px solid #cad8e5; background: #e8f0f7;
      color: #35556d; font-size: 13px; font-weight: 800; text-transform: uppercase;
    }
    h1 { margin: 0 0 10px; font-size: clamp(30px, 4vw, 46px); line-height: 1.04; font-weight: 900; }
    .meta { margin: 0; color: var(--muted); line-height: 1.6; }
    .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 18px 0; }
    .stat { padding: 18px; }
    .stat span { display: block; color: var(--muted); font-size: 13px; font-weight: 700; }
      .stat strong { display: block; margin-top: 8px; font-size: 26px; line-height: 1; }
      .panel { padding: 18px; margin-top: 18px; }
      .section-subtitle { margin-top: 22px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .tab-button {
      display: inline-flex; gap: 9px; align-items: center; border: 1px solid var(--line);
      border-radius: 999px; padding: 10px 14px; background: #fff; color: #102238;
      font: inherit; font-weight: 800; cursor: pointer;
    }
    .tab-button strong { min-width: 28px; padding: 3px 8px; border-radius: 999px; background: #e8f0f7; }
    .tab-button.active { border-color: #e0ad00; background: var(--accent); }
    .tab-button.active strong { background: rgba(255, 255, 255, 0.62); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .panel-note { margin: 0 0 14px; color: var(--muted); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 18px; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; background: #fff; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #e7eef6; text-align: left; vertical-align: top; }
    th { background: #eef4fa; color: #35556d; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .delta { font-weight: 900; }
    .delta.positive { color: #b42318; }
    .delta.negative { color: #0f7a3f; }
    .empty-state { padding: 30px; border: 1px dashed var(--line); border-radius: 18px; color: var(--muted); background: #fff; }
    .details-block { margin-top: 14px; }
    .details-block summary { cursor: pointer; color: #35556d; font-weight: 800; }
    .secondary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    @media (max-width: 920px) {
      .stats, .secondary-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      main { padding: 18px 12px 34px; }
      .hero, .panel { border-radius: 18px; padding: 18px; }
      .stats, .secondary-grid { grid-template-columns: 1fr; }
      .tab-button { width: 100%; justify-content: space-between; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Импорт прайса</span>
      <h1>Отчёт импорта</h1>
      <p class="meta">
        Сформирован: ${formatReportDate(report.generatedAt)} ·
        Источник: <span title="${escapeHtml(report.sourceFile)}">${escapeHtml(sourceFileName)}</span> ·
        JSON: ${escapeHtml(path.relative(projectRoot, reportFile))}
      </p>
      <p class="panel-note">
        Файл источника: ${escapeHtml(sourceReference)} · Размер: ${escapeHtml(sourceSize)} · SHA-256: <code>${escapeHtml(sourceFingerprint)}</code>
      </p>
    </section>

    <section class="stats">
      ${statCards
        .map(
          ([label, value]) => `
            <article class="stat">
              <span>${escapeHtml(label)}</span>
              <strong>${formatNumber(value)}</strong>
            </article>
          `
        )
        .join('')}
    </section>

    <section class="panel">
      ${renderReportTabs(report, alertPercent)}
      ${renderStockChanges(report)}
      <details class="details-block">
        <summary>Производители (${formatNumber(report.manufacturers?.uniqueCount || 0)} уникальных)</summary>
        <p class="panel-note">Производитель берётся из исходного названия строки. Неопознанных строк: ${formatNumber(report.manufacturers?.withoutManufacturer || 0)}.</p>
        ${renderTable(
          manufacturerRows,
          [
            { key: 'manufacturer', label: 'Производитель' },
            { key: 'count', label: 'Строк' },
          ],
          'Производители не выделены.'
        )}
      </details>
    </section>

    <section class="secondary-grid">
      <article class="panel">
        <h2>Распределение по категориям</h2>
        ${renderTable(
          categoryRows,
          [
            { key: 'category', label: 'Категория' },
            { label: 'Товаров', render: (row) => formatNumber(row.count) },
          ],
          'Категории не найдены.'
        )}
      </article>
      <article class="panel">
        <h2>Пропущенные строки</h2>
        ${renderTable(
          skipRows,
          [
            { key: 'reason', label: 'Причина' },
            { label: 'Строк', render: (row) => formatNumber(row.count) },
          ],
          'Пропущенных строк нет.'
        )}
        <details class="details-block">
          <summary>Подробности (${formatNumber(skippedRows.length)})</summary>
          ${renderTable(
            skippedRows,
            [
              {
                label: 'Строка',
                render: (row) =>
                  Number.isInteger(row.rowIndex)
                    ? formatNumber(row.rowIndex + 1)
                    : '—',
              },
              { key: 'product', label: 'Позиция' },
              { key: 'category', label: 'Категория' },
              { key: 'reason', label: 'Причина' },
              { label: 'Цена', render: (row) => formatMoney(row.price) },
              { label: 'Остаток', render: (row) => formatNumber(row.stock) },
            ],
            'Деталей по пропущенным строкам нет.'
          )}
        </details>
      </article>
      <article class="panel">
        <h2>Строки на проверке</h2>
        <p class="panel-note">Эти позиции не удалены: они импортированы, но исходная категория не подтверждает кабельный раздел.</p>
        ${renderTable(
          reviewRows,
          [
            {
              label: 'Строка',
              render: (row) =>
                Number.isInteger(row.rowIndex)
                  ? formatNumber(row.rowIndex + 1)
                  : '—',
            },
            { key: 'product', label: 'Позиция' },
            { key: 'category', label: 'Категория источника' },
            { key: 'reason', label: 'Причина' },
          ],
          'Строк на проверке нет.'
        )}
      </article>
      <article class="panel">
        <h2>Диагностика товара</h2>
        <p class="panel-note">Ошибки блокируют публикацию; предупреждения и информация сохраняются для разбора.</p>
        ${renderTable(
          diagnosticRows,
          [
            { key: 'severity', label: 'Уровень' },
            {
              label: 'Строка',
              render: (row) =>
                Number.isInteger(row.rowIndex)
                  ? formatNumber(row.rowIndex + 1)
                  : Array.isArray(row.rows)
                    ? row.rows
                        .map((index) => formatNumber(index + 1))
                        .join(', ')
                    : '—',
            },
            { key: 'product', label: 'Позиция' },
            { key: 'message', label: 'Сообщение' },
          ],
          'Диагностических замечаний нет.'
        )}
      </article>
      <article class="panel">
        <h2>Пороги подозрительных цен</h2>
        <p class="panel-note">
          Импортов в расчёте: ${formatNumber(report.suspiciousPriceStats?.historyImports || 0)} ·
          файл: ${escapeHtml(report.suspiciousPriceStats?.historyFile || '')}
        </p>
        ${renderSuspiciousPriceStats(report)}
      </article>
    </section>
  </main>
  <script>
    const buttons = document.querySelectorAll('[data-tab]');
    const panels = document.querySelectorAll('[data-panel]');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
      });
    });
  </script>
</body>
</html>`;
}

async function main() {
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
  const registry = await loadProductRegistry(registryFile);
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
    const dataStageRoot = await fs.mkdtemp(
      path.join(projectRoot, '.price-import-stage-data-')
    );
    let stagedPublicDir;
    try {
      await fs.mkdir(path.dirname(publicDir), { recursive: true });
      stagedPublicDir = await fs.mkdtemp(
        path.join(
          path.dirname(publicDir),
          `.${path.basename(publicDir)}.price-import-stage-`
        )
      );
    } catch (error) {
      await fs
        .rm(dataStageRoot, { recursive: true, force: true })
        .catch(() => {});
      throw error;
    }
    try {
      const stagedProductsFile = getStagedPath(dataStageRoot, outputFile);
      const stagedRegistryFile = getStagedPath(dataStageRoot, registryFile);
      const stagedReportFile = getStagedPath(dataStageRoot, reportFile);
      const stagedReportHtmlFile = getStagedPath(dataStageRoot, reportHtmlFile);
      const stagedHistoryFile = getStagedPath(
        dataStageRoot,
        getImportHistoryFile(importConfig)
      );

      await writeFileAtomic(
        stagedProductsFile,
        JSON.stringify(products, null, 2)
      );
      await saveProductRegistry(stagedRegistryFile, registry);
      await writeFileAtomic(
        path.join(stagedPublicDir, path.basename(publicPriceFile)),
        sourcePriceBuffer
      );
      if (downloadedPriceBuffer) {
        await writeFileAtomic(
          getStagedPath(dataStageRoot, inputFile),
          downloadedPriceBuffer
        );
      }
      await writeFileAtomic(
        path.join(stagedPublicDir, path.basename(redirectsFile)),
        JSON.stringify(slugRedirects, null, 2)
      );
      await writeFileAtomic(
        path.join(stagedPublicDir, path.basename(redirectsNginxFile)),
        buildRedirectsNginxConf(slugRedirects),
        { mode: 0o444 }
      );

      const categoriesRaw = await fs.readFile(catalogCategoriesFile, 'utf-8');
      const categoriesData = JSON.parse(categoriesRaw);
      seoSummary = await writeSeoArtifacts({
        outputDir: stagedPublicDir,
        siteUrl: process.env.SITE_URL || process.env.VITE_SITE_URL,
        products,
        categoriesData,
      });
      runtimeProductPrerenderCount = await writeRuntimeProductPrerender(
        products,
        seoSummary,
        stagedPublicDir
      );
      report.seo = seoSummary.counts;
      report.runtimeProductPrerenderCount = runtimeProductPrerenderCount;
      await writeFileAtomic(stagedReportFile, JSON.stringify(report, null, 2));
      await writeFileAtomic(stagedReportHtmlFile, buildReportHtml(report));
      const nextHistory = buildNextImportHistory(
        importConfig,
        importHistory,
        buildHistorySnapshot(products, {
          generatedAt,
          sourceFile: inputFile,
          sourceUrl: priceSource.metadata.requestedUrl,
          source: priceSource.metadata,
        }),
        generatedAt
      );
      await writeFileAtomic(
        stagedHistoryFile,
        JSON.stringify(nextHistory, null, 2)
      );

      const stagedDataFiles = await listFilesRecursively(dataStageRoot);
      const stagedPublicFiles = (
        await listFilesRecursively(stagedPublicDir)
      ).filter(
        (filePath) =>
          !isPathInside(path.join(stagedPublicDir, 'product'), filePath)
      );
      const artifacts = [
        ...stagedDataFiles.map((stagedPath) => ({
          stagedPath,
          targetPath: path.join(
            projectRoot,
            path.relative(dataStageRoot, stagedPath)
          ),
        })),
        ...stagedPublicFiles.map((stagedPath) => ({
          stagedPath,
          targetPath: path.join(
            publicDir,
            path.relative(stagedPublicDir, stagedPath)
          ),
          ...(path.basename(stagedPath) === 'redirects.nginx.conf'
            ? { mode: 0o444 }
            : {}),
        })),
      ];
      const publicProductDir = path.join(stagedPublicDir, 'product');
      try {
        if ((await fs.stat(publicProductDir)).isDirectory()) {
          artifacts.push({
            stagedPath: publicProductDir,
            targetPath: path.join(publicDir, 'product'),
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      const stagedPublicNames = new Set(
        artifacts
          .filter((artifact) =>
            artifact.targetPath.startsWith(`${publicDir}${path.sep}`)
          )
          .map((artifact) => path.basename(artifact.targetPath))
      );
      try {
        const existingPublicFiles = await fs.readdir(publicDir);
        for (const filename of existingPublicFiles) {
          if (
            /^sitemap-products(?:-\d+)?\.xml$/u.test(filename) &&
            !stagedPublicNames.has(filename)
          ) {
            artifacts.push({ targetPath: path.join(publicDir, filename) });
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      await commitArtifactBatch(artifacts);
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
    } finally {
      await Promise.all([
        fs.rm(dataStageRoot, { recursive: true, force: true }),
        fs.rm(stagedPublicDir, { recursive: true, force: true }),
      ]).catch(() => {});
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
