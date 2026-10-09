// Файл проверяет классификаторы кабельных марок и регрессии по типам продукции.

import { describe, it, expect } from 'vitest';
import {
  FLEXIBLE_MARK_RE,
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
    ['АВВГ 3x2.5', 'однопроволочная'],
    ['ВВГнг 4x4', 'однопроволочная'],
    ['', 'однопроволочная'],
  ])('mark "%s" → %s', (mark, expected) => {
    expect(getWireConstruction({ mark })).toBe(expected);
  });

  it('handles missing product/mark', () => {
    expect(getWireConstruction(null)).toBe('однопроволочная');
    expect(getWireConstruction({})).toBe('однопроволочная');
  });
});

describe('FLEXIBLE_MARK_RE', () => {
  it('lists exactly the canonical flex marks', () => {
    expect(FLEXIBLE_MARK_RE.source).toBe('^(КГ|ПуГ|ПВС|ШВВП|КОГ|ПРГ|ПМГ)');
  });
});

describe('getConductorMaterial', () => {
  it('returns "алюминий" when decoded mentions алюминиевые жилы', () => {
    expect(
      getConductorMaterial({ cableDecoded: { decoded: ['алюминиевые жилы'] } })
    ).toBe('алюминий');
  });

  it('returns "медь" by default', () => {
    expect(
      getConductorMaterial({ cableDecoded: { decoded: ['медные жилы'] } })
    ).toBe('медь');
    expect(getConductorMaterial({})).toBe('медь');
    expect(getConductorMaterial(null)).toBe('медь');
  });
});

describe('getCoreVariantLabel', () => {
  it('formats N when no ground cores', () => {
    expect(getCoreVariantLabel({ cores: 3 })).toBe('3');
  });

  it('formats N+M when ground cores present', () => {
    expect(getCoreVariantLabel({ cores: 4, groundCores: 1 })).toBe('4+1');
  });

  it('uses the full grouped configuration', () => {
    expect(
      getCoreVariantLabel({
        cores: 14,
        groupCores: 2,
        crossSection: 1,
        conductorConfiguration: '14х(2х1)',
      })
    ).toBe('14х(2х1)');
  });

  it('returns empty string when cores invalid', () => {
    expect(getCoreVariantLabel({ cores: 0 })).toBe('');
    expect(getCoreVariantLabel({ cores: -1 })).toBe('');
    expect(getCoreVariantLabel({})).toBe('');
    expect(getCoreVariantLabel(null)).toBe('');
  });
});
