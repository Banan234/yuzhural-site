import { describe, expect, it } from 'vitest';
import { buildProductDesignation as decode } from './productDesignation.js';

describe('manufacturer montage constructors and catalogue extensions', () => {
  it.each([
    [
      'МКЭфШВ',
      'МКЭфШВз нг(А)LS 6х(2х1)э',
      ['З', 'нг(А)-LS', 'Э'],
      'фольгированной',
    ],
    ['МКЭлШВ', 'МКЭлШВз нг(А)LS 8х1', ['З', 'нг(А)-LS'], 'лужёных'],
    [
      'МКЭШВв',
      'МКЭШВв знг(А) 2х2х1.5л',
      ['З', 'нг(А)', 'л'],
      'Водоблокирующий',
    ],
    ['МКЭКШВв', 'МКЭКШВвз нг(А)LS 4х2х1.5', ['З', 'нг(А)-LS'], 'броня'],
  ])(
    'explains the complete documented modifiers for %s',
    (mark, sourceName, attributes, text) => {
      const d = decode({ mark, sourceName, attributes });
      expect(d.status).toBe('reviewed');
      expect(d.unknown).toEqual([]);
      expect(d.tokens.some((t) => t.text.includes(text))).toBe(true);
      expect(
        d.manufacturerTexts.some((t) => t.documentId.startsWith('mkm-'))
      ).toBe(true);
      expect(d.officialComplete).toBe(false);
    }
  );
  it('keeps out-of-range counts, unsupported materials and unknown modifiers incomplete', () => {
    for (const sourceName of [
      'МКЭфШВз 62х1 нг(А)LS',
      'МКЭфШВз 28х3х1 нг(А)LS',
      'МКЭфШВз 2х2х10 нг(А)LS',
      'МКЭфШВз 2х2х1 нг(А)HF',
    ]) {
      expect(
        decode({
          mark: sourceName.split(' ')[0],
          sourceName,
          attributes: [sourceName.split(' ').at(-1)],
        }).status
      ).not.toBe('reviewed');
    }
    expect(
      decode({ mark: 'МКЭфШВзXYZ', sourceName: 'МКЭфШВзXYZ 2х2х1' }).status
    ).not.toBe('reviewed');
  });
  it('uses the second factory table for 32 pairs and explains SIMATIC separately', () => {
    const d = decode({
      mark: 'JE-Y(ST)Y',
      sourceName: 'JE-Y(ST)Y 32х2х0.8 Bd SI',
      attributes: ['Bd', 'SI'],
    });
    expect(d.status).toBe('reviewed');
    expect(d.tokens.some((t) => t.text.includes('диаметр жилы 0,8 мм'))).toBe(
      true
    );
    expect(d.tokens.some((t) => t.text.includes('SIMATIC'))).toBe(true);
    expect(d.sources.some((t) => t.url.includes('eupen.com'))).toBe(true);
    expect(d.officialComplete).toBe(false);
  });
  it('limits single-letter color codes to the documented wire syntax', () => {
    const d = decode({
      mark: 'МГШВ',
      sourceName: 'МГШВэ 1.5 С',
      attributes: ['Э', 'С'],
    });
    expect(d.unknown).not.toContain('С');
    expect(d.tokens.some((t) => t.text.includes('синего / голубого'))).toBe(
      true
    );
    expect(
      decode({ mark: 'ВВГ', sourceName: 'ВВГ 3х1.5 С', attributes: ['С'] })
        .unknown
    ).toContain('С');
  });
  it('keeps brand-only names and unverified manufacturer families unresolved', () => {
    for (const [mark, sourceName] of [
      ['LAPP KABEL', 'LAPP KABEL 12х1'],
      ['HELUKABEL', 'HELUKABEL 2х2х0.75'],
      ['КУМВэаВ', 'КУМВэаВ нг(А)LS 10х2х1'],
      ['ВЭОВКВ-ВП', 'ВЭОВКВ-ВП нг(А)LS 12х2х1.5'],
    ])
      expect(decode({ mark, sourceName }).status).not.toBe('reviewed');
  });
  it('preserves alloy and copper construction differences', () => {
    const alloy = decode({
      mark: 'АсКГ',
      sourceName: 'АсКГ 4х70 ХЛ',
      attributes: ['ХЛ'],
    });
    const armored = decode({
      mark: 'КА9РВСБВ',
      sourceName: 'КА9РВСБВнг(А)LS 4х150',
      attributes: ['нг(А)-LS'],
    });
    expect(alloy.status).toBe('reviewed');
    expect(
      alloy.tokens.some((t) => t.text.includes('алюминиевого сплава'))
    ).toBe(true);
    expect(armored.status).toBe('reviewed');
    expect(
      armored.tokens.some((t) =>
        t.text.includes('двух стальных оцинкованных лент')
      )
    ).toBe(true);
    expect(alloy.officialComplete).toBe(false);
    expect(armored.officialComplete).toBe(false);
  });
  it('uses the factory AПуВ size range without assuming a copper conductor', () => {
    const input = {
      mark: 'АПУВ',
      sourceName: 'АПУВ 2.5 бел',
      cores: 1,
      crossSection: 2.5,
      attributes: ['бел'],
    };
    const d = decode(input);
    expect(d.status).toBe('reviewed');
    expect(d.tokens.some((t) => t.text.includes('Алюминиевая'))).toBe(true);
    expect(d.officialComplete).toBe(false);
    expect(
      decode({ ...input, sourceName: 'АПУВ 1.5 бел', crossSection: 1.5 }).status
    ).not.toBe('reviewed');
    expect(
      decode({ ...input, sourceName: 'АПУВ 70 бел', crossSection: 70 }).status
    ).not.toBe('reviewed');
  });
});
