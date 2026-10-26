import { describe, expect, test } from 'vitest';
import {
  hasProductTitleIdentity,
  auditProductTitles,
} from './productTitleAudit.js';
import { validateNormalizedProducts } from '../scripts/lib/importDiagnostics.js';
import { evaluatePublishGuard } from '../scripts/lib/importPublishGuard.js';

describe('защита от названий без марки', () => {
  test.each([
    '2х2х0.75',
    '1x2xAWG24+1x2xAWG22',
    '24×2×0,20',
    '1х0.5 серый',
    'Кабель 3х2.5 мм²',
    '0.75',
    '',
  ])('отклоняет %s', (title) => {
    expect(hasProductTitleIdentity(title)).toBe(false);
  });
  test.each([
    'HELUKABEL 2х2х0.75',
    'Герда КВ 4х2х1',
    'Belden 9842 2pr24',
    'FTP cat.5 2PR',
    'МК ВБВ 7х1',
    'H07V-K 1х2.5',
    '275 МТ',
    'КГ 3х2.5',
  ])('сохраняет идентичность %s', (title) => {
    expect(hasProductTitleIdentity(title)).toBe(true);
  });
  test('не позволяет спрятать проблему заполненным полем manufacturer', () => {
    const product = {
      name: '2х2х0.75',
      manufacturer: 'HELUKABEL',
      sourceName: 'HELUKABEL 2х2х0.75',
      sourceRowIndex: 42,
      sku: 'SKU-42',
      unit: 'м',
      price: 100,
      stock: 20,
    };
    expect(auditProductTitles([product])).toMatchObject([
      { code: 'title_missing_identity', sku: 'SKU-42', rowIndex: 42 },
    ]);
    expect(validateNormalizedProducts([product]).errors).toMatchObject([
      { code: 'title_missing_identity', rowIndex: 42 },
    ]);
    const guard = evaluatePublishGuard({
      config: { minProducts: 0 },
      products: [product],
      errors: validateNormalizedProducts([product]).errors,
    });
    expect(guard.ok).toBe(false);
    expect(guard.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'maxErrors' })])
    );
  });
});
