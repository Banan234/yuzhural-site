import { describe, expect, it } from 'vitest';
import { buildProductDesignation as decode } from './productDesignation.js';

describe('factory manuals and constructor additions, November 10', () => {
  it.each([
    ['FireLine 750', 'FireLine 750 19х1', []],
    ['ПГВВп', 'ПГВВп 3х2.5 бел', ['бел']],
    ['ВП', 'ВП 1х0.8', []],
    ['ВСЭК', 'ВСЭК 5х2х0.35', []],
    ['ШТЛ-2', 'ШТЛ-2', []],
    ['ШТЛ-5', 'ШТЛ-5', []],
    ['КУПЭКШВ', 'КУПЭКШВ 7х(3х1)э нг(А)LS', ['Э', 'нг(А)-LS']],
    ['ТПП', 'ТППнг 10х2х0.5 (А)HF', ['нг(А)-HF']],
    ['ПТВТ-ХК', 'ПТВТ-ХК 2х2.5', []],
    ['ПТВэВТ-ха', 'ПТВэВТ-ха 2х1.5', []],
    ['ПБВВ', 'ПБВВ 3х2.5 (ПУГНП)', ['(ПУГНП)']],
  ])(
    'explains %s from an obtained factory source',
    (mark, sourceName, attributes) => {
      const result = decode({ mark, sourceName, attributes });
      expect(result.status).toBe('reviewed');
      expect(result.unknown).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.manufacturerTexts.length).toBeGreaterThan(0);
      expect(result.officialComplete).toBe(false);
    }
  );
  it.each([
    ['FireLine 750', 'FireLine 750 19х4', []],
    ['ВСЭК', 'ВСЭК 5х2х0.5', []],
    ['ВП', 'ВП 2х0.8', []],
    ['ШТЛ-2', 'ШТЛ-2 2х2.5', []],
    ['КУПЭКШВ', 'КУПЭКШВ 61х35 нг(А)LS', ['нг(А)-LS']],
    ['КУПЭКШВ', 'КУПЭКШВ 37х3х1 нг(А)LS', ['нг(А)-LS']],
    ['КУПЭКШВ', 'КУПЭКШВ 2х1.5 нг(А)HF', ['нг(А)-HF']],
    ['ТПП', 'ТППнг 10х2х0.5 HF', ['нг-HF']],
    ['ПБВВ', 'ПБВВ 3х2.5 (ДРУГОЙ)', ['(ДРУГОЙ)']],
  ])(
    'keeps conflicting or unconfirmed variants incomplete: %s',
    (mark, sourceName, attributes) => {
      expect(decode({ mark, sourceName, attributes }).status).not.toBe(
        'reviewed'
      );
    }
  );
  it('does not substitute an AWG gauge for a factory section in a fixed cord', () => {
    const result = decode({
      mark: 'ШТЛ-2',
      sourceName: 'ШТЛ-2',
      crossSection: 2.5,
    });
    expect(result.status).not.toBe('reviewed');
  });
});
