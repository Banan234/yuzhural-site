import { describe, it, expect } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import { buildProductDesignationHtml } from './productDesignationHtml.js';
const decode = (sourceName, extra = {}) =>
  buildProductDesignation({ sourceName, ...extra });
describe('approved manufacturer-proven remaining decoders', () => {
  it('removes only the obsolete NUD warning when its complete construction is proven', () => {
    const d = decode('НУД 3х1.5', { cores: 3, crossSection: 1.5 });
    expect(d.officialComplete).toBe(true);
    expect(d.warnings).toEqual([]);
    expect(d.tokens.find((t) => t.code === '3х1.5').text).toBe(
      '3 жилы; сечение каждой жилы 1,5 мм²'
    );
    for (const source of ['НУД 3х0.75', 'НУД 3х1.5 неизвестный'])
      expect(decode(source).officialComplete).toBe(false);
    expect(decode('НУД 3х1.5', { crossSection: 2.5 }).officialComplete).toBe(
      false
    );
  });
  it('explains the literal NYCY RE/6 without guessing a screen or PE function', () => {
    const p = {
      sourceName: 'NYCY 24х1.5 RE/6',
      cores: 24,
      crossSection: 1.5,
      attributes: ['RE/6'],
    };
    const d = buildProductDesignation(p);
    expect(d.officialComplete).toBe(true);
    expect(d.unknown).toEqual([]);
    expect(d.tokens).toContainEqual({
      code: 'RE',
      text: 'Круглые однопроволочные жилы',
    });
    expect(d.tokens).toContainEqual({
      code: '/6',
      text: 'Сечение концентрического медного проводника — 6 мм²',
    });
    expect(buildProductDesignationHtml(p, { decoded: d })).toContain(
      'Концентрический медный проводник'
    );
    for (const source of [
      'NYCY 24х1.5 RM/6',
      'NYCY 24х1.5 RE/16',
      'NYCY 23х1.5 RE/6',
    ])
      expect(decode(source).officialComplete).toBe(false);
    expect(
      decode(p.sourceName, { ...p, screenCrossSection: 6 }).officialComplete
    ).toBe(false);
    expect(
      decode(p.sourceName, { ...p, concentricConductorCrossSection: 16 })
        .officialComplete
    ).toBe(false);
  });
  it('decodes only the approved screened SKAB triple with required tinning and execution', () => {
    const source = 'СКАБ 250 нг(А)HF хл 2х3эх0.75л';
    const d = decode(source, {
      mark: 'СКАБ 250',
      cores: 2,
      groupCores: 3,
      crossSection: 0.75,
      conductorConfiguration: '2х3эх0.75',
      attributes: ['нг(А)HFхл', 'л'],
    });
    expect(d.officialComplete).toBe(true);
    expect(d.warnings).toEqual([]);
    expect(d.tokens.some((t) => t.code === '2х3эх0.75')).toBe(true);
    expect(
      d.tokens.some(
        (t) =>
          t.text ===
          '2 индивидуально экранированные тройки по 3 жилы; сечение каждой жилы 0,75 мм². Всего 6 жил'
      )
    ).toBe(true);
    expect(d.tokens.some((t) => t.text === 'Медные лужёные жилы')).toBe(true);
    for (const source of [
      'СКАБ 250 нг(А)HF хл 2х3эх0.75',
      'СКАБ 250 нг(Б)HF хл 2х3эх0.75л',
      'СКАБ 250 нг(А)HF хл 2х3эх0.8л',
    ])
      expect(decode(source, { mark: 'СКАБ 250' }).officialComplete).toBe(false);
    expect(
      decode(source, { mark: 'СКАБ 250', cores: 6 }).officialComplete
    ).toBe(false);
  });
});
