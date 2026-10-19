import { describe, expect, it } from 'vitest';
import { russianCountNoun } from './russianCount.js';

describe('russianCountNoun', () => {
  it.each([
    [0, 'позиций'],
    [1, 'позиция'],
    [2, 'позиции'],
    [5, 'позиций'],
    [11, 'позиций'],
    [21, 'позиция'],
    [1299, 'позиций'],
  ])('uses the correct form for %i', (count, expected) => {
    expect(
      russianCountNoun(count, {
        one: 'позиция',
        few: 'позиции',
        many: 'позиций',
      })
    ).toBe(expected);
  });
});
