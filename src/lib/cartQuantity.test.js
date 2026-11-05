import { it, expect } from 'vitest';
import { clampCartQuantity, getCartQuantityLimit } from './cartQuantity.js';
it.each(['м', 'кг', 'шт'])(
  'ceil input, allow full fractional stock, never change catalog stock (%s)',
  (unit) => {
    const p = { unit, stock: 5.7 };
    expect(getCartQuantityLimit(p)).toBe(5.7);
    for (const [input, expected] of [
      [0.5, 1],
      [1.2, 2],
      [2, 2],
      [5.1, 5.7],
      [99, 5.7],
      [0, 0],
      [-1, 0],
      [NaN, 0],
      [Infinity, 0],
    ])
      expect(clampCartQuantity(p, input)).toBe(expected);
    expect(p.stock).toBe(5.7);
  }
);

it('can order the complete balance smaller than one, without inflating stock', () => {
  expect(clampCartQuantity({ unit: 'кг', stock: 0.4 }, 1)).toBe(0.4);
});
