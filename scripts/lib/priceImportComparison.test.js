import { describe, expect, it } from 'vitest';
import { buildNextImportHistory } from './priceImportComparison.js';

describe('buildNextImportHistory', () => {
  it('сохраняет единое время импорта в истории и снимке', () => {
    const generatedAt = '2026-10-10T09:15:30.000Z';
    const snapshot = {
      generatedAt,
      sourceFile: 'data/price.xls',
      unitPrices: {},
    };

    const history = buildNextImportHistory(
      { suspiciousPriceStats: { historyLimit: 8 } },
      { imports: [] },
      snapshot,
      generatedAt
    );

    expect(history.generatedAt).toBe(generatedAt);
    expect(history.imports[0].generatedAt).toBe(generatedAt);
  });
});
