import { describe, expect, it } from 'vitest';
import {
  calculateQuote,
  formatQuoteMoney,
  formatQuoteUnitPrice,
  getQuoteTotalDisplay,
  quoteMoneyPayload,
} from './quoteMoney.js';
const item = (price, quantity, rest = {}) => ({ price, quantity, ...rest });
describe('quote monetary contract', () => {
  it.each([
    [0.1, 0.05, 1],
    [99.99, 0.5, 5000],
    [1.005, 1, 101],
    [1.004999, 1, 100],
    [1.005001, 1, 101],
    [12.345, 0.2, 247],
    [0.001, 0.01, 0],
    [1e-5, 500, 1],
    [1.335, 3, 401],
  ])(
    'rounds decimal %s × %s once per row to %s kopecks',
    (price, quantity, expected) => {
      const q = calculateQuote([item(price, quantity)]);
      expect(q.totalKopecks).toBe(expected);
      expect(q.complete).toBe(true);
    }
  );
  it('sums displayed row kopecks for mixed length and mass without rounding unit prices', () => {
    const q = calculateQuote([
      item(0.1, 0.05, { unit: 'м' }),
      item(0.1, 0.05, { unit: 'м' }),
      item(99.99, 0.5, { unit: 'кг' }),
      item(12.345, 0.2),
    ]);
    expect(q.rows.map((r) => r.lineKopecks)).toEqual([1, 1, 5000, 247]);
    expect(q.totalKopecks).toBe(5249);
    expect(formatQuoteMoney(q.totalKopecks)).toBe('52,49 ₽');
    expect(formatQuoteUnitPrice(12.345)).toBe('12,345 ₽');
  });
  it('represents partial and wholly unknown totals without a fake zero/full total', () => {
    const mixed = calculateQuote([item(99.99, 0.5), item(null, 2)]);
    expect(quoteMoneyPayload(mixed)).toMatchObject({
      totalPrice: null,
      totalKopecks: null,
      knownSubtotalKopecks: 5000,
      unknownPriceCount: 1,
      totalComplete: false,
    });
    expect(getQuoteTotalDisplay(mixed)).toEqual({
      label: 'Известная часть',
      value: '50,00 ₽',
      detail: 'Ещё 1 поз. — по запросу. Полная сумма после расчёта.',
    });
    const unknown = calculateQuote([item(0, 2), item('', 0.25)]);
    expect(getQuoteTotalDisplay(unknown).value).toBe(
      'Итог будет рассчитан в КП'
    );
    expect(unknown.invalid).toBe(false);
  });
  it('does not confuse an assessed zero-kopeck rounded line with unknown price', () => {
    const q = calculateQuote([item(0.001, 0.01), item(null, 2)]);
    expect(q.unknownPriceCount).toBe(1);
    expect(getQuoteTotalDisplay(q).value).toBe('0,00 ₽');
  });
  it('excludes pending by state or current catalog identity, retaining classification review', () => {
    const q = calculateQuote(
      [
        item(999, 10, { dataStatus: 'pending' }),
        item(888, 20, { id: 58 }),
        item(99.99, 0.5, { classificationReview: {} }),
      ],
      { pendingIds: new Set([58]) }
    );
    expect(q.excludedPendingCount).toBe(2);
    expect(q.itemCount).toBe(1);
    expect(q.totalKopecks).toBe(5000);
  });
  it.each([
    [-1, 1],
    ['bad', 1],
    ['Infinity', 1],
    [true, 1],
    [[100], 1],
    [100, 0],
    [100, -1],
    [100, Infinity],
    [100, true],
    [1e308, 1],
  ])('flags invalid money/quantity %s × %s', (price, quantity) => {
    const q = calculateQuote([item(price, quantity)]);
    expect(q.invalid).toBe(true);
    expect(q.totalPrice).toBeNull();
  });
  it('rejects unsafe accumulation, keeps exact currency formatting at the integer bound', () => {
    const q = calculateQuote([
      item(45035996273704, 1),
      item(45035996273704, 1),
      item(100, 1),
    ]);
    expect(q.invalid).toBe(true);
    expect(
      formatQuoteMoney(Number.MAX_SAFE_INTEGER).replace(/[\s\u00a0]/g, '')
    ).toBe('90071992547409,91₽');
  });
});
