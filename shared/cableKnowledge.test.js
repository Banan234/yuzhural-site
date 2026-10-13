import { describe, expect, it } from 'vitest';
import {
  decodeCableDesignation,
  getCableComparisons,
  CABLE_KNOWLEDGE,
} from './cableKnowledge';
describe('checked cable designation decoding', () => {
  it('keeps materials and fire indexes distinct', () => {
    const result = decodeCableDesignation('АВВГнг(А)-FRLS 3×2,5');
    expect(result.family.mark).toBe('АВВГ');
    expect(result.size).toBe('3 жил × 2.5 мм²');
    expect(result.unknown).toBe('');
    expect(result.tokens.some((token) => token.code === 'А')).toBe(true);
    expect(result.tokens.some((token) => token.code === 'FRLS')).toBe(true);
    const lowSmoke = decodeCableDesignation('ВВГнг(А)-LS');
    expect(
      lowSmoke.tokens.find((token) => token.code === 'LS').text
    ).not.toContain('Огнестойкое');
  });
  it('reads telephone conductor diameter instead of calling it cross-section', () => {
    const result = decodeCableDesignation('ТППэп 10х2х0,5');
    expect(result.size).toBe('10 пар по 2 жилы, диаметр жилы 0.5 мм');
  });
  it('keeps unknown indexes and rejects automatic analogs for uncertain designations', () => {
    expect(decodeCableDesignation('ВВГ-XYZ').unknown).toBe('-XYZ');
    expect(getCableComparisons('ПВ3-XYZ')).toEqual([]);
    expect(decodeCableDesignation('МYSTERY').family).toBeNull();
    expect(decodeCableDesignation('ТППэпПнг(А)-HF').unknown).toContain('П');
    expect(decodeCableDesignation('ВВГ 3х2,5 нг(А)LS ГОСТ').unknown).toBe('');
    expect(decodeCableDesignation('ВВГ 3х2,5 нг(А)LS ГОСТ').fire).toContain(
      'LS'
    );
  });
  it('chooses the most specific family and does not equate related types', () => {
    expect(decodeCableDesignation('КГВЭВ').family.mark).toBe('КГВЭВ');
    expect(getCableComparisons('ПВ3')[0].marks).toContain('ПуГВ');
    expect(getCableComparisons('КГ')).toEqual([]);
    expect(getCableComparisons('АВВГ')).toEqual([]);
    expect(new Set(CABLE_KNOWLEDGE.map((item) => item.mark)).size).toBe(
      CABLE_KNOWLEDGE.length
    );
  });
});
