import { it, expect } from 'vitest';
import { quarantineInvalidProducts } from './quarantineProducts.js';
it('не откладывает соседний корректный товар в той же строке листа', () => {
  const left = { sourceRowIndex: 42, name: 'ВВГ 3х2.5' };
  const right = { sourceRowIndex: 42, name: 'ПВ3 1х6' };
  const review = [];
  const result = quarantineInvalidProducts(
    [left, right],
    [{ rowIndex: 42, product: left.name, message: 'Ошибка левого товара' }],
    review
  );
  expect(result.eligible).toEqual([right]);
  expect(result.quarantined).toEqual([left]);
  expect(review).toEqual([expect.objectContaining({ product: left.name })]);
});
