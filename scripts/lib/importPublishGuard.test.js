// Файл проверяет защитный контроль перед публикацией импорта прайса.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLISH_GUARD_CONFIG,
  evaluatePublishGuard,
  formatPublishGuardFailure,
  normalizePublishGuardConfig,
} from './importPublishGuard.js';

describe('normalizePublishGuardConfig', () => {
  it('применяет дефолты и нормализует числовые значения', () => {
    expect(
      normalizePublishGuardConfig({
        minProducts: '12.8',
        maxRemovedPercent: '4.5',
        enabled: 'false',
      })
    ).toMatchObject({
      minProducts: 12,
      maxRemovedPercent: 4.5,
      enabled: false,
      maxFallbackPercent: DEFAULT_PUBLISH_GUARD_CONFIG.maxFallbackPercent,
    });
  });

  it('возвращает безопасные дефолты для невалидных значений', () => {
    expect(normalizePublishGuardConfig({ minProducts: -1 })).toMatchObject(
      DEFAULT_PUBLISH_GUARD_CONFIG
    );
  });
});

describe('evaluatePublishGuard', () => {
  it('пропускает нормальный импорт', () => {
    const result = evaluatePublishGuard({
      previousProducts: Array.from({ length: 100 }, () => ({})),
      products: Array.from({ length: 100 }, () => ({})),
      totalRows: 100,
      skippedRows: [{}, {}],
      errors: [],
      suspicious: [{}],
      fallbackToOther: 3,
      diff: {
        removed: [{}],
        priceAlerts: [{}, {}],
        categoryChanged: [{}],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.metrics.removedPercent).toBe(1);
  });

  it('останавливает публикацию при резком уменьшении каталога', () => {
    const result = evaluatePublishGuard({
      previousProducts: Array.from({ length: 100 }, () => ({})),
      products: Array.from({ length: 40 }, () => ({})),
      totalRows: 100,
      diff: { removed: Array.from({ length: 61 }, () => ({})) },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.key)).toContain(
      'maxRemovedPercent'
    );
  });

  it('изолированные ошибки нормализации не останавливают корректные строки', () => {
    const result = evaluatePublishGuard({
      products: Array.from({ length: 100 }, () => ({})),
      errors: [{}],
      totalRows: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.key)).toContain('maxErrors');
  });

  it('предупреждает о спорной строке и доле Прочего', () => {
    const result = evaluatePublishGuard({
      products: Array.from({ length: 100 }, () => ({})),
      reviewRows: [{}],
      newReviewRows: [{}],
      otherProducts: 11,
      totalRows: 100,
    });
    expect(result.warnings.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(['maxOtherPercent'])
    );
  });

  it('предупреждает о новых review и сменах категорий', () => {
    const result = evaluatePublishGuard({
      products: Array.from({ length: 100 }, () => ({})),
      reviewRows: [{}, {}, {}],
      totalRows: 100,
      diff: { categoryChanged: Array.from({ length: 80 }, () => ({})) },
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.warnings.map((item) => item.key)).toEqual([
      'maxNewReviewRows',
      'maxCategoryChangedPercent',
    ]);
  });

  it('сообщает о массовых review без блокировки корректных строк', () => {
    const result = evaluatePublishGuard({
      products: Array.from({ length: 100 }, () => ({})),
      reviewRows: Array.from({ length: 10 }, () => ({})),
      totalRows: 100,
    });
    expect(result.warnings.map((item) => item.key)).toContain(
      'maxReviewPercent'
    );
  });

  it('учитывает отключение guard', () => {
    const result = evaluatePublishGuard({
      config: { enabled: false },
      products: [{}],
      diff: { removed: Array.from({ length: 100 }, () => ({})) },
    });

    expect(result).toMatchObject({ ok: true, enabled: false, issues: [] });
  });
});

describe('formatPublishGuardFailure', () => {
  it('формирует понятное сообщение с ручным override', () => {
    const message = formatPublishGuardFailure({
      issues: [{ message: 'Каталог слишком маленький.' }],
    });

    expect(message).toContain('Каталог слишком маленький.');
    expect(message).toContain('--override-publish-guard');
  });
});

describe('blocking threshold boundaries', () => {
  const baseConfig = {
    minProducts: 0,
    maxErrors: 1000,
    maxRemovedPercent: 100,
    maxSkippedPercent: 100,
    maxSuspiciousPercent: 100,
    maxFallbackPercent: 100,
    maxOtherPercent: 100,
    maxNewReviewRows: 1000,
    maxPriceAlerts: 1000,
    maxCategoryChangedPercent: 100,
  };
  const rows = (n) => Array.from({ length: n }, () => ({}));
  const cases = [
    ['maxErrors', 2, (n) => ({ errors: rows(n) }), 1, 2, 3, 'maxErrors'],
    [
      'maxNewReviewRows',
      2,
      (n) => ({ newReviewRows: rows(n) }),
      1,
      2,
      3,
      'maxNewReviewRows',
    ],
    [
      'maxPriceAlerts',
      100,
      (n) => ({ diff: { priceAlerts: rows(n) } }),
      99,
      100,
      101,
      'maxPriceAlerts',
    ],
    [
      'maxRemovedPercent',
      5,
      (n) => ({ diff: { removed: rows(n) } }),
      49,
      50,
      51,
      'maxRemovedPercent',
    ],
    [
      'maxSkippedPercent',
      5,
      (n) => ({ skippedRows: rows(n) }),
      49,
      50,
      51,
      'maxSkippedPercent',
    ],
    [
      'maxSkippedPercent',
      5,
      (n) => ({ reviewRows: rows(n), newReviewRows: [] }),
      49,
      50,
      51,
      'maxReviewPercent',
    ],
    [
      'maxSuspiciousPercent',
      1,
      (n) => ({ suspicious: rows(n) }),
      9,
      10,
      11,
      'maxSuspiciousPercent',
    ],
    [
      'maxFallbackPercent',
      10,
      (n) => ({ fallbackToOther: n }),
      99,
      100,
      101,
      'maxFallbackPercent',
    ],
    [
      'maxOtherPercent',
      10,
      (n) => ({ otherProducts: n }),
      99,
      100,
      101,
      'maxOtherPercent',
    ],
    [
      'maxCategoryChangedPercent',
      10,
      (n) => ({ diff: { categoryChanged: rows(n) } }),
      99,
      100,
      101,
      'maxCategoryChangedPercent',
    ],
  ];
  it.each(cases)(
    '%s applies its documented scope at boundaries (%s)',
    (key, limit, input, below, at, above, issueKey) => {
      for (const count of [below, at, above]) {
        const result = evaluatePublishGuard({
          config: { ...baseConfig, [key]: limit },
          products: rows(1000),
          previousProducts: rows(1000),
          totalRows: 1000,
          ...input(count),
        });
        const blocking = key === 'maxRemovedPercent';
        expect(result.ok).toBe(!blocking || count <= at);
        expect(
          (blocking ? result.issues : result.warnings).map((p) => p.key)
        ).toEqual(count > at ? [issueKey] : []);
        expect(blocking ? result.warnings : result.issues).toEqual([]);
      }
    }
  );
  it('enforces minProducts at its exact boundary', () => {
    for (const n of [99, 100, 101])
      expect(
        evaluatePublishGuard({
          config: { ...baseConfig, minProducts: 100 },
          products: rows(n),
        }).ok
      ).toBe(n >= 100);
  });
  it('does not round a slightly exceeded percentage down to its limit', () => {
    expect(
      evaluatePublishGuard({
        config: { ...baseConfig, maxSkippedPercent: 5 },
        products: rows(100),
        totalRows: 100000,
        skippedRows: rows(5001),
      }).warnings[0].actual
    ).toBeGreaterThan(5);
    const result = evaluatePublishGuard({
      config: { ...baseConfig, maxOtherPercent: 33.3333331 },
      products: rows(3),
      otherProducts: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings[0].actual).toBeGreaterThan(33.3333331);
  });
});
