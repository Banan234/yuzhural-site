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

  it('учитывает отключение guard', () => {
    const result = evaluatePublishGuard({
      config: { enabled: false },
      products: [],
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
