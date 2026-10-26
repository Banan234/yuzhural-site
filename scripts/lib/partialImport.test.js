import { describe, it, expect } from 'vitest';
import {
  classifyEligibleProducts,
  createProductRecord,
} from './priceCatalogPreparation.js';

describe('частичный импорт', () => {
  it('откладывает неопределённую строку и продолжает импорт кабеля', () => {
    const cable = createProductRecord(
      { name: 'ВВГ 3х2.5', unit: 'м', price: 100, stock: 10 },
      'Без категории',
      null,
      1
    );
    const unknown = createProductRecord(
      { name: 'Неизвестное изделие 123', unit: 'м', price: 100, stock: 10 },
      'Без категории',
      null,
      2
    );
    const reviewRows = [unknown.review];
    const result = classifyEligibleProducts([cable.value, unknown.value], {
      reviewRows,
    });
    expect(result.map((item) => item.sourceRowIndex)).toEqual([1]);
    expect(reviewRows[0].reason).toContain('отложено');
  });
  it('исключает некабельную строку, пропущенную предварительным фильтром', () => {
    const skippedRows = [];
    const result = classifyEligibleProducts(
      [
        {
          name: 'Мет.рук.в ПВХ d=32мм',
          sourceName: 'Мет.рук.в ПВХ d=32мм',
          mark: 'Мет.рук.',
          unit: 'м',
          price: 10,
          stock: 1,
        },
      ],
      { skippedRows }
    );
    expect(result).toEqual([]);
    expect(skippedRows[0]).toMatchObject({ expectedExclusion: true });
  });
});

it('не импортирует кабель-канал как кабель из-за слова «кабель»', () => {
  expect(
    createProductRecord(
      {
        name: 'Кабель-канал 80х40 (DKC 01781)',
        unit: 'м',
        price: 100,
        stock: 10,
      },
      'Без категории'
    )
  ).toEqual({ type: 'excluded' });
});
