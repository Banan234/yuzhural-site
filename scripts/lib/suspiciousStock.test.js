import { describe, it, expect } from 'vitest';
import { extractProducts } from './priceCatalogPreparation.js';
import { buildReportHtml } from './importReport.js';

describe('suspicious stock in source price', () => {
  it('reports zero/negative stock with row context, excludes it from products and leaves positive stock eligible', () => {
    const result = extractProducts([
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
      ['ВВГ 3х2.5', 'м', 100, 0],
      ['ВВГ 3х4', 'м', 200, -2],
      ['ВВГ 3х6', 'м', 300, 15],
    ]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].stock).toBe(15);
    expect(result.suspiciousStockRows).toHaveLength(2);
    expect(result.suspiciousStockRows).toEqual([
      expect.objectContaining({
        code: 'non_positive_stock',
        suspicious: true,
        rowIndex: 1,
        stock: 0,
        price: 100,
      }),
      expect.objectContaining({
        code: 'non_positive_stock',
        suspicious: true,
        rowIndex: 2,
        stock: -2,
        price: 200,
      }),
    ]);
    expect(result.skippedRows).toEqual(result.suspiciousStockRows);
    const html = buildReportHtml({
      summary: {},
      skippedRows: result.skippedRows,
      skipsByReason: {},
      productsByCategory: {},
      diagnostics: {},
    });
    expect(html).toContain(
      'Подозрительная строка: нулевой или отрицательный остаток'
    );
    expect(html).toContain('ВВГ 3х2.5');
    expect(html).toContain('ВВГ 3х4');
  });

  it('does not treat headers or category rows as suspicious zero-stock products', () => {
    const result = extractProducts([
      ['Наименование', 'Ед.изм', 'Цена', 'Остаток'],
      ['Силовой кабель', '', '', ''],
      ['ВВГ 3х2.5', 'м', 100, 10],
    ]);
    expect(result.suspiciousStockRows).toEqual([]);
    expect(result.products).toHaveLength(1);
  });
});
