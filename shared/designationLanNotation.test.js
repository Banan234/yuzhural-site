import { describe, expect, it } from 'vitest';
import { explainLanNotation } from './designationLanNotation.js';

describe('source-backed LAN lexical notation', () => {
  it('explains mixed category, pairs and AWG without turning AWG into mm²', () => {
    const d = explainLanNotation('cat.5е 4pr FRNC AWG 24/1');
    expect(d.unknown).toBe('');
    expect(d.tokens.map((t) => t.text).join(' ')).toContain(
      'Категория кабеля 5E'
    );
    expect(d.tokens.map((t) => t.text).join(' ')).toContain(
      'число проволок в жиле: 1'
    );
    expect(d.tokens.map((t) => t.text).join(' ')).toContain('не сечение в мм²');
    expect(d.tokens.find((t) => t.code === 'FRNC').text).toContain(
      'не означает сохранение работоспособности'
    );
    expect(d.sources.length).toBeGreaterThan(0);
  });
  it('retains arbitrary models, numbers and unknown Cyrillic words', () => {
    for (const value of [
      'NEOMAX NM',
      '500',
      'ZHM',
      'БЕЛЫЙНЕИЗВЕСТНО',
      'НЕИЗВЕСТНОPVC',
      'PARLANXYZ',
    ]) {
      expect(explainLanNotation(value).unknown).toBe(value);
    }
    expect(explainLanNotation('cat.5e UNKNOWN 24AWG').unknown).toBe('UNKNOWN');
  });
  it('explains NVP as a stated ratio and FT4 as flame testing', () => {
    const d = explainLanNotation('SOLID NVP 0.67 FT4');
    expect(d.unknown).toBe('');
    expect(
      d.tokens.some((t) => t.text.includes('0,67 от скорости света'))
    ).toBe(true);
    expect(
      d.tokens.some((t) =>
        t.text.includes('не означает сохранение работоспособности')
      )
    ).toBe(true);
    expect(explainLanNotation('NVP 1.7').unknown).toBe('NVP 1.7');
    expect(explainLanNotation('FT40').unknown).toBe('FT40');
  });
});
