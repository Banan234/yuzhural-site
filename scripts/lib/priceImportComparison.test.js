import { describe, expect, it } from 'vitest';
import {
  buildNextImportHistory,
  findNewReviewRows,
} from './priceImportComparison.js';

describe('findNewReviewRows', () => {
  it('recognizes a reviewed source row after its display name changes', () => {
    const previousProducts = [
      {
        sourceName: 'ВВГ  1х2.5 нг(А)LSLtx',
        name: 'ВВГ 1х2.5 нг(А)-LS-LTx',
      },
    ];
    const reviewRows = [
      {
        sourceName: 'ВВГ  1х2.5 нг(А)LSLtx',
        product: 'ВВГнг(А)-LS-LTx 1х2.5',
      },
      { sourceName: 'Новая марка', product: 'Новая марка' },
      {
        sourceName: 'ВВГ 1х2.5 нг(А)-LS-LTx другой завод',
        product: 'ВВГнг(А)-LS-LTx 1х2.5',
      },
    ];

    expect(findNewReviewRows(previousProducts, reviewRows)).toEqual([
      reviewRows[1],
      reviewRows[2],
    ]);
  });
});

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
