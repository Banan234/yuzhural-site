// Сравнение каталога и статистика истории цен для контроля импорта.

export const PRICE_JUMP_ALERT_PERCENT = 50;

export function parsePreviousProducts(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Некорректный JSON предыдущего products.json: ${error.message}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      'Предыдущий products.json должен содержать массив товаров.'
    );
  }
  return parsed;
}

export function productKey(product) {
  return String(product?.fullName || product?.name || '')
    .trim()
    .toLowerCase();
}

export function buildDiff(previous, current) {
  const identityKey = (product) =>
    product.id != null ? `id:${product.id}` : productKey(product);
  const prevMap = new Map();
  for (const product of previous) {
    const key = identityKey(product);
    if (key) prevMap.set(key, product);
  }

  const currMap = new Map();
  for (const product of current) {
    const key = identityKey(product);
    if (key) currMap.set(key, product);
  }

  const added = [];
  const removed = [];
  const priceChanged = [];
  const priceAlerts = [];
  const stockChanged = [];
  const categoryChanged = [];

  for (const [key, product] of currMap) {
    const prev = prevMap.get(key);
    if (!prev) {
      added.push({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
      });
      continue;
    }

    if (Number(prev.price) !== Number(product.price)) {
      const deltaPercent = prev.price
        ? Number((((product.price - prev.price) / prev.price) * 100).toFixed(2))
        : null;

      const entry = {
        name: product.name,
        category: product.category,
        priceBefore: prev.price,
        priceAfter: product.price,
        deltaPercent,
      };

      priceChanged.push(entry);

      if (
        deltaPercent !== null &&
        Math.abs(deltaPercent) >= PRICE_JUMP_ALERT_PERCENT
      ) {
        priceAlerts.push(entry);
      }
    }

    if (Number(prev.stock) !== Number(product.stock)) {
      stockChanged.push({
        name: product.name,
        category: product.category,
        stockBefore: prev.stock,
        stockAfter: product.stock,
      });
    }

    // category may be a generated "Кабель <mark>" label. Publication checks
    // must compare actual navigation categories when classification is present.
    const categoryBefore = prev.catalogCategory || prev.category || '';
    const categoryAfter = product.catalogCategory || product.category || '';
    if (categoryBefore !== categoryAfter) {
      categoryChanged.push({
        name: product.name,
        categoryBefore,
        categoryAfter,
      });
    }
  }

  for (const [key, product] of prevMap) {
    if (!currMap.has(key)) {
      removed.push({
        name: product.name,
        category: product.category,
        price: product.price,
        stock: product.stock,
      });
    }
  }

  // Сортируем алерты по убыванию модуля изменения
  priceAlerts.sort(
    (a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
  );

  return {
    added,
    removed,
    priceChanged,
    priceAlerts,
    stockChanged,
    categoryChanged,
  };
}

export function normalizeImportHistory(history) {
  return {
    version: 1,
    imports: Array.isArray(history.imports)
      ? history.imports.filter((entry) => entry && typeof entry === 'object')
      : [],
  };
}

export function parseImportHistory(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Некорректный JSON истории импортов: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('История импортов должна содержать JSON-объект.');
  }
  if (parsed.imports != null && !Array.isArray(parsed.imports)) {
    throw new Error('Поле imports в истории импортов должно быть массивом.');
  }
  return normalizeImportHistory(parsed);
}

export function buildHistorySnapshot(
  products,
  { generatedAt, sourceFile, sourceUrl = null, source = null }
) {
  const unitPrices = {};

  for (const product of products) {
    const unit = String(product.unit || '').trim();
    const price = Number(product.price);

    if (!unit || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    if (!unitPrices[unit]) {
      unitPrices[unit] = [];
    }

    unitPrices[unit].push(Math.round(price * 1000) / 1000);
  }

  for (const prices of Object.values(unitPrices)) {
    prices.sort((a, b) => a - b);
  }

  return {
    generatedAt,
    sourceFile,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(source ? { source } : {}),
    productsImported: products.length,
    unitPrices,
  };
}

export function getHistoricalSnapshots(history, previousProducts, sourceFile) {
  if (history.imports.length > 0) {
    return history.imports;
  }

  if (previousProducts.length === 0) {
    return [];
  }

  return [
    buildHistorySnapshot(previousProducts, {
      generatedAt: null,
      sourceFile,
    }),
  ];
}

export function buildNextImportHistory(config, history, snapshot, generatedAt) {
  const historyLimit = Math.max(
    1,
    Number(config.suspiciousPriceStats.historyLimit) || 1
  );
  return {
    version: 1,
    generatedAt,
    imports: [...history.imports, snapshot].slice(-historyLimit),
  };
}

export function buildSuspiciousPriceStats(
  config,
  historySnapshots,
  { historyFile = null } = {}
) {
  const statsConfig = config.suspiciousPriceStats;
  const configuredThresholds = config.suspiciousPriceThresholds;
  const pricesByUnit = new Map();
  const maxImportSamplesByUnit = new Map();

  for (const snapshot of historySnapshots) {
    const unitPrices = snapshot.unitPrices || {};
    for (const [unit, prices] of Object.entries(unitPrices)) {
      if (!Array.isArray(prices)) {
        continue;
      }

      if (!pricesByUnit.has(unit)) {
        pricesByUnit.set(unit, []);
      }

      const target = pricesByUnit.get(unit);
      let validPricesInImport = 0;
      for (const price of prices) {
        const value = Number(price);
        if (Number.isFinite(value) && value > 0) {
          target.push(value);
          validPricesInImport += 1;
        }
      }

      maxImportSamplesByUnit.set(
        unit,
        Math.max(maxImportSamplesByUnit.get(unit) || 0, validPricesInImport)
      );
    }
  }

  const units = new Set([
    ...Object.keys(configuredThresholds),
    ...pricesByUnit.keys(),
  ]);
  const byUnit = {};
  const minimumSamples = Number(statsConfig.minimumSamples) || 0;
  const thresholdPercentile = Number(statsConfig.thresholdPercentile) || 0.99;
  const thresholdMultiplier = Number(statsConfig.thresholdMultiplier) || 1;

  for (const unit of [...units].sort()) {
    const prices = pricesByUnit.get(unit) || [];
    prices.sort((a, b) => a - b);

    const p95 = roundNullable(percentile(prices, 0.95), 3);
    const p99 = roundNullable(percentile(prices, 0.99), 3);
    const configuredFallback = toPositiveNumber(configuredThresholds[unit]);
    const thresholdBase = percentile(prices, thresholdPercentile);
    const maxImportSamples = maxImportSamplesByUnit.get(unit) || 0;
    const hasEnoughHistory =
      maxImportSamples >= minimumSamples && Number.isFinite(thresholdBase);
    const threshold = hasEnoughHistory
      ? roundNullable(thresholdBase * thresholdMultiplier, 3)
      : configuredFallback;

    byUnit[unit] = {
      count: prices.length,
      maxImportSamples,
      p95,
      p99,
      threshold,
      source: hasEnoughHistory ? 'history' : 'config',
      thresholdPercentile,
      thresholdMultiplier,
      configuredFallback,
    };
  }

  return {
    historyImports: historySnapshots.length,
    historyFile,
    minimumSamples,
    thresholdPercentile,
    thresholdMultiplier,
    byUnit,
  };
}

export function percentile(sortedValues, percentileValue) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return null;
  }

  const p = Math.min(1, Math.max(0, Number(percentileValue)));
  const index = (sortedValues.length - 1) * p;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (index - lowerIndex);
}

export function roundNullable(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function detectSuspicious(products, priceStats) {
  const issues = [];

  for (const product of products) {
    const reasons = [];

    if (!product.unit) {
      reasons.push('Не определена единица измерения');
    }

    if (product.price <= 0) {
      reasons.push('Отсутствует цена');
    }

    const unitStats = priceStats.byUnit?.[product.unit];
    const threshold = unitStats?.threshold;
    if (threshold && product.price > threshold) {
      reasons.push(
        `Цена ${product.price} ₽ за «${product.unit}» превышает порог ${threshold} (${formatThresholdSource(unitStats)})`
      );
    }

    if (product.price >= 1_000_000 && product.price % 100_000 === 0) {
      reasons.push('Подозрительно круглая сумма (возможна ошибка ввода)');
    }

    if (reasons.length > 0) {
      issues.push({
        name: product.name,
        category: product.category,
        unit: product.unit,
        price: product.price,
        stock: product.stock,
        reasons,
      });
    }
  }

  return issues;
}

export function formatThresholdSource(unitStats) {
  if (unitStats.source === 'history') {
    const percentileLabel = Math.round(unitStats.thresholdPercentile * 100);
    return `p${percentileLabel} × ${unitStats.thresholdMultiplier} по истории`;
  }

  return 'importConfig.json';
}

export function summarizeSkips(skippedRows) {
  const byReason = new Map();
  for (const row of skippedRows) {
    const reason = row.reason || 'Без причины';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  return Object.fromEntries(byReason);
}

export function summarizeByCategory(products) {
  const counts = new Map();
  for (const product of products) {
    const key = product.category || 'Без категории';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}
