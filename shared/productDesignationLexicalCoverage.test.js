import { describe, expect, it } from 'vitest';
import { buildProductDesignation as decode } from './productDesignation.js';
import { enrichPriceDesignations } from './productDesignationBatch.js';

describe('lexical coverage without expanding construction confirmation', () => {
  it.each([
    ['JE-Y(ST)Y-FR', 'JE-Y(ST)Y-FR 2х2х0.8', 'диаметр'],
    ['JE-LIYCY-FR', 'JE-LIYCY-FR 2х2х0.5', 'сечение'],
    ['FQLQ PURE', 'FQLQ PURE 5х2.5', 'сечение'],
    ['ПАЛ', 'ПАЛ 1.5', 'сечение'],
    ['RE-2X(ST)H', 'RE-2X(ST)H 2х1.5', 'сечение'],
  ])(
    'keeps manufacturer units for %s and does not grant strict confirmation',
    (mark, sourceName, unit) => {
      const d = decode({
        mark,
        sourceName,
        ...(mark === 'ПАЛ' ? { cores: 1, crossSection: 1.5 } : {}),
      });
      expect(d.status).toBe('reviewed');
      expect(d.officialComplete).toBe(false);
      expect(d.tokens.some((t) => t.text.includes(unit))).toBe(true);
      expect(d.manufacturerTexts.length).toBeGreaterThan(0);
    }
  );
  it('preserves unsupported sizes, suffixes and ambiguous drain syntax', () => {
    for (const p of [
      { mark: 'ПАЛ', sourceName: 'ПАЛ 35' },
      { mark: 'KJAAM-HF', sourceName: 'KJAAM-HF 2х(2х1)х0.5' },
      { mark: 'KJAAM-HF', sourceName: 'KJAAM-HF 48х(2+1)х0.5' },
      {
        mark: 'NYY',
        sourceName: 'NYY 3х16 RM Class 3',
        attributes: ['RM', 'Class', '3'],
      },
      { mark: 'ИнСил-ИЭз', sourceName: 'ИнСил-ИЭз 2х2х1 Э', attributes: ['Э'] },
    ])
      expect(decode(p).status).not.toBe('reviewed');
  });
  it('keeps conflicting structured screen and voltage fields unresolved', () => {
    const p = {
      mark: 'АПвВ',
      sourceName: 'АПвВ 1х240мк/50-10',
      attributes: ['мк/50-10'],
    };
    expect(decode(p).unknown).toEqual([]);
    expect(decode({ ...p, screenCrossSection: 70 }).unknown).toContain(
      'мк/50-10'
    );
    expect(decode({ ...p, voltage: 6 }).unknown).toContain('мк/50-10');
  });
  it('automatically applies the new rules to a future price position without changing its commercial fields', () => {
    const input = {
      id: 'future',
      mark: 'FQLQ PURE',
      sourceName: 'FQLQ PURE 7х2.5',
      price: 123,
      stock: 50,
    };
    const { products } = enrichPriceDesignations([input]);
    const { designationDecoded, ...unchanged } = products[0];
    expect(unchanged).toEqual(input);
    expect(designationDecoded.status).toBe('reviewed');
    expect(designationDecoded.manufacturerTexts.length).toBeGreaterThan(0);
    expect(designationDecoded.officialComplete).toBe(false);
  });
  it('retains alternative manufacturer texts on the same family', () => {
    const d = decode({ mark: 'RE-2X(ST)H', sourceName: 'RE-2X(ST)H 2х1.5' });
    expect(d.manufacturerTexts.map((t) => t.documentId)).toEqual(
      expect.arrayContaining(['2m-re2xh', 'specialcavi-re2xh'])
    );
  });
  it('counts contact wires separately from the two signal wires in each pair', () => {
    const d = decode({ mark: 'KJAAM-HF', sourceName: 'KJAAM-HF 4х(2+1)х0.5' });
    expect(d.status).toBe('reviewed');
    expect(
      d.tokens.some((t) =>
        t.text.includes('две сигнальные жилы и один контактный')
      )
    ).toBe(true);
    expect(d.officialComplete).toBe(false);
  });
});
