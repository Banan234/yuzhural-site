// Файл проверяет классификаторы кабельных марок и регрессии по типам продукции.

import { describe, it, expect } from 'vitest';
import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from './catalogClassifiers.js';

describe('getWireConstruction', () => {
  it.each([
    ['КГ 4x4', 'многопроволочная'],
    ['ПуГ 1x16', 'многопроволочная'],
    ['ПВС 3x1.5', 'многопроволочная'],
    ['ШВВП 2x0.75', 'многопроволочная'],
    ['КОГ 1x35', 'многопроволочная'],
    ['ПРГ 1x6', 'многопроволочная'],
    ['ПМГ 1x10', 'многопроволочная'],
    ['АВВГ 3x2.5', 'не определено'],
    ['ВВГнг 4x4', 'не определено'],
    ['ПВ3 1x16', 'многопроволочная'],
    ['КИПВэПБП 2х2х0.78', 'многопроволочная'],
    ['ПВАМ 1х1.5', 'многопроволочная'],
    ['ПАВ 1х2.5', 'однопроволочная'],
    ['ОМЗКГЦ 10-01-0.22-8', 'не применимо'],
    ['', 'не определено'],
  ])('mark "%s" → %s', (mark, expected) => {
    expect(getWireConstruction({ mark })).toBe(expected);
  });

  it('handles missing product/mark', () => {
    expect(getWireConstruction(null)).toBe('не определено');
    expect(getWireConstruction({})).toBe('не определено');
  });
});

describe('getConductorMaterial', () => {
  it('returns "алюминий" when decoded mentions алюминиевые жилы', () => {
    expect(
      getConductorMaterial({ cableDecoded: { decoded: ['алюминиевые жилы'] } })
    ).toBe('алюминий');
  });

  it('не подменяет неизвестный материал медью', () => {
    expect(
      getConductorMaterial({ cableDecoded: { decoded: ['медные жилы'] } })
    ).toBe('медь');
    expect(getConductorMaterial({})).toBe('не определено');
    expect(getConductorMaterial(null)).toBe('не определено');
    expect(
      getConductorMaterial({
        mark: 'КАЭФВ',
        cableDecoded: { decoded: ['алюминиевые жилы'] },
      })
    ).toBe('медь');
    expect(
      getConductorMaterial({
        mark: 'ПВАМ',
        cableDecoded: { decoded: ['алюминиевые жилы'] },
      })
    ).toBe('медь');
    expect(getConductorMaterial({ mark: 'ПАВ' })).toBe('алюминий');
    expect(
      getConductorMaterial({
        mark: 'ВВГ',
        catalogCategorySlug: 'silovoy-kabel',
      })
    ).toBe('медь');
    expect(getConductorMaterial({ mark: 'ОМЗКГЦ 10-01' })).toBe('не применимо');
  });
});

describe('getCoreVariantLabel', () => {
  it('formats N when no ground cores', () => {
    expect(getCoreVariantLabel({ cores: 3 })).toBe('3');
  });

  it('counts ground cores in the total', () => {
    expect(getCoreVariantLabel({ cores: 4, groundCores: 1 })).toBe('5');
  });

  it('returns the total number of conductors for grouped configuration', () => {
    expect(
      getCoreVariantLabel({
        cores: 14,
        groupCores: 2,
        crossSection: 1,
        conductorConfiguration: '14х(2х1)',
      })
    ).toBe('28');
  });

  it('returns empty string when cores invalid', () => {
    expect(getCoreVariantLabel({ cores: 0 })).toBe('');
    expect(getCoreVariantLabel({ cores: -1 })).toBe('');
    expect(getCoreVariantLabel({})).toBe('');
    expect(getCoreVariantLabel(null)).toBe('');
  });
});
