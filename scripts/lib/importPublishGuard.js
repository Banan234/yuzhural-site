// Файл решает, можно ли публиковать результат импорта прайса без ручного подтверждения.

const DEFAULT_PUBLISH_GUARD = Object.freeze({
  enabled: true,
  minProducts: 100,
  maxRemovedPercent: 5,
  maxSkippedPercent: 5,
  maxSuspiciousPercent: 1,
  maxFallbackPercent: 10,
  maxPriceAlerts: 100,
  maxCategoryChangedPercent: 10,
});

function parseNonNegativeNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = parseNonNegativeNumber(value, fallback);
  return Math.floor(parsed);
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function normalizePublishGuardConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};

  return {
    enabled: parseBoolean(source.enabled, DEFAULT_PUBLISH_GUARD.enabled),
    minProducts: parseNonNegativeInteger(
      source.minProducts,
      DEFAULT_PUBLISH_GUARD.minProducts
    ),
    maxRemovedPercent: parseNonNegativeNumber(
      source.maxRemovedPercent,
      DEFAULT_PUBLISH_GUARD.maxRemovedPercent
    ),
    maxSkippedPercent: parseNonNegativeNumber(
      source.maxSkippedPercent,
      DEFAULT_PUBLISH_GUARD.maxSkippedPercent
    ),
    maxSuspiciousPercent: parseNonNegativeNumber(
      source.maxSuspiciousPercent,
      DEFAULT_PUBLISH_GUARD.maxSuspiciousPercent
    ),
    maxFallbackPercent: parseNonNegativeNumber(
      source.maxFallbackPercent,
      DEFAULT_PUBLISH_GUARD.maxFallbackPercent
    ),
    maxPriceAlerts: parseNonNegativeInteger(
      source.maxPriceAlerts,
      DEFAULT_PUBLISH_GUARD.maxPriceAlerts
    ),
    maxCategoryChangedPercent: parseNonNegativeNumber(
      source.maxCategoryChangedPercent,
      DEFAULT_PUBLISH_GUARD.maxCategoryChangedPercent
    ),
  };
}

function percentage(part, whole) {
  const numerator = Number(part) || 0;
  const denominator = Number(whole) || 0;
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function createIssue({ key, actual, limit, message }) {
  return {
    key,
    actual: rounded(actual),
    limit,
    message,
  };
}

export function evaluatePublishGuard({
  config,
  previousProducts = [],
  products = [],
  diff = {},
  suspicious = [],
  skippedRows = [],
  totalRows = 0,
  fallbackToOther = 0,
} = {}) {
  const normalizedConfig = normalizePublishGuardConfig(config);
  const metrics = {
    products: products.length,
    previousProducts: previousProducts.length,
    removed: Array.isArray(diff.removed) ? diff.removed.length : 0,
    skipped: Array.isArray(skippedRows) ? skippedRows.length : 0,
    totalRows: Number(totalRows) || 0,
    suspicious: Array.isArray(suspicious) ? suspicious.length : 0,
    fallbackToOther: Number(fallbackToOther) || 0,
    priceAlerts: Array.isArray(diff.priceAlerts) ? diff.priceAlerts.length : 0,
    categoryChanged: Array.isArray(diff.categoryChanged)
      ? diff.categoryChanged.length
      : 0,
  };

  metrics.removedPercent = rounded(
    percentage(metrics.removed, metrics.previousProducts)
  );
  metrics.skippedPercent = rounded(
    percentage(metrics.skipped, metrics.totalRows)
  );
  metrics.suspiciousPercent = rounded(
    percentage(metrics.suspicious, metrics.products)
  );
  metrics.fallbackPercent = rounded(
    percentage(metrics.fallbackToOther, metrics.products)
  );
  metrics.categoryChangedPercent = rounded(
    percentage(metrics.categoryChanged, metrics.products)
  );

  if (!normalizedConfig.enabled) {
    return {
      ok: true,
      enabled: false,
      config: normalizedConfig,
      metrics,
      issues: [],
    };
  }

  const issues = [];

  if (metrics.products < normalizedConfig.minProducts) {
    issues.push(
      createIssue({
        key: 'minProducts',
        actual: metrics.products,
        limit: normalizedConfig.minProducts,
        message: `Импортировано ${metrics.products} товаров, минимум ${normalizedConfig.minProducts}.`,
      })
    );
  }

  if (metrics.removedPercent > normalizedConfig.maxRemovedPercent) {
    issues.push(
      createIssue({
        key: 'maxRemovedPercent',
        actual: metrics.removedPercent,
        limit: normalizedConfig.maxRemovedPercent,
        message: `Удалено ${metrics.removedPercent}% каталога, допустимо не более ${normalizedConfig.maxRemovedPercent}%.`,
      })
    );
  }

  if (metrics.skippedPercent > normalizedConfig.maxSkippedPercent) {
    issues.push(
      createIssue({
        key: 'maxSkippedPercent',
        actual: metrics.skippedPercent,
        limit: normalizedConfig.maxSkippedPercent,
        message: `Пропущено ${metrics.skippedPercent}% строк прайса, допустимо не более ${normalizedConfig.maxSkippedPercent}%.`,
      })
    );
  }

  if (metrics.suspiciousPercent > normalizedConfig.maxSuspiciousPercent) {
    issues.push(
      createIssue({
        key: 'maxSuspiciousPercent',
        actual: metrics.suspiciousPercent,
        limit: normalizedConfig.maxSuspiciousPercent,
        message: `Подозрительные позиции составляют ${metrics.suspiciousPercent}% каталога, допустимо не более ${normalizedConfig.maxSuspiciousPercent}%.`,
      })
    );
  }

  if (metrics.fallbackPercent > normalizedConfig.maxFallbackPercent) {
    issues.push(
      createIssue({
        key: 'maxFallbackPercent',
        actual: metrics.fallbackPercent,
        limit: normalizedConfig.maxFallbackPercent,
        message: `В fallback «Прочее» попало ${metrics.fallbackPercent}% каталога, допустимо не более ${normalizedConfig.maxFallbackPercent}%.`,
      })
    );
  }

  if (metrics.priceAlerts > normalizedConfig.maxPriceAlerts) {
    issues.push(
      createIssue({
        key: 'maxPriceAlerts',
        actual: metrics.priceAlerts,
        limit: normalizedConfig.maxPriceAlerts,
        message: `Резких изменений цен: ${metrics.priceAlerts}, допустимо не более ${normalizedConfig.maxPriceAlerts}.`,
      })
    );
  }

  if (
    metrics.categoryChangedPercent > normalizedConfig.maxCategoryChangedPercent
  ) {
    issues.push(
      createIssue({
        key: 'maxCategoryChangedPercent',
        actual: metrics.categoryChangedPercent,
        limit: normalizedConfig.maxCategoryChangedPercent,
        message: `Категория изменилась у ${metrics.categoryChangedPercent}% каталога, допустимо не более ${normalizedConfig.maxCategoryChangedPercent}%.`,
      })
    );
  }

  return {
    ok: issues.length === 0,
    enabled: true,
    config: normalizedConfig,
    metrics,
    issues,
  };
}

export function formatPublishGuardFailure(result) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  if (issues.length === 0) {
    return 'Проверка публикации прайса не пройдена.';
  }

  return [
    'Публикация прайса остановлена защитным контролем:',
    ...issues.map((issue) => `- ${issue.message}`),
    'Проверь импорт и повтори запуск. Для осознанного ручного обхода используй --override-publish-guard.',
  ].join('\n');
}

export const DEFAULT_PUBLISH_GUARD_CONFIG = DEFAULT_PUBLISH_GUARD;
