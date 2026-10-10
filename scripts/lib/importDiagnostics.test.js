// Проверки нормализованных строк и формата диагностик импорта.

import { describe, expect, it } from 'vitest';
import { validateNormalizedProducts } from './importDiagnostics.js';

const product = (overrides = {}) => ({
  sourceRowIndex: 4,
  sourceCategory: 'Кабель силовой',
  name: 'ВВГ 3х1.5',
  mark: 'ВВГ',
  cores: 3,
  crossSection: 1.5,
  manufacturer: null,
  unit: 'м',
  price: 100,
  stock: 10,
  parsingWarnings: [],
  importDisposition: 'publish',
  catalogClassificationSource: 'rule',
  catalogCategorySlug: 'kabel-vvg',
  ...overrides,
});

describe('validateNormalizedProducts', () => {
  it('не сообщает ошибок для валидного товара', () => {
    expect(validateNormalizedProducts([product()])).toMatchObject({
      errors: [],
      warnings: [],
      summary: { errors: 0, warnings: 0, duplicateGroups: 0 },
    });
  });

  it('помечает некорректные обязательные поля как ошибки', () => {
    const result = validateNormalizedProducts([
      product({ name: '', price: 0, stock: -1, unit: 'неизв.' }),
    ]);
    expect(result.errors.map((item) => item.code)).toEqual([
      'missing_name',
      'invalid_price',
      'invalid_stock',
      'invalid_unit',
    ]);
  });

  it('собирает предупреждения разбора, review и fallback', () => {
    const result = validateNormalizedProducts([
      product({
        parsingWarnings: ['unrecognized_specification'],
        importDisposition: 'review',
        catalogClassificationSource: 'fallback',
        catalogCategorySlug: 'prochee',
      }),
    ]);
    expect(result.warnings.map((item) => item.code)).toEqual([
      'parse_warning',
      'disposition_review',
      'fallback_category',
    ]);
  });

  it('информирует об одинаковых stable key, сохраняя позиции отдельно', () => {
    const first = product({ sourceRowIndex: 1 });
    const second = product({ sourceRowIndex: 2 });
    const result = validateNormalizedProducts([first, second]);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].rows).toEqual([1, 2]);
    expect(result.errors).toHaveLength(0);
    expect(
      result.info.some((item) => item.code === 'duplicate_stable_key')
    ).toBe(true);
  });
});
