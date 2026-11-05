import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import { buildProductDesignationHtml } from './productDesignationHtml.js';

const configuration = '7х4х1.05+5х2х0.7+1х0.7';
const text =
  '7 четвёрок (4 высокочастотные и 3 низкочастотные), диаметр жил 1,05 мм; 5 вспомогательных пар и 1 вспомогательная жила, диаметр 0,7 мм. Всего 39 жил';
const product = (mark, size = configuration, extra = {}) => ({
  sourceName: `${mark} ${size}`,
  mark,
  conductorConfiguration: size,
  cores: 7,
  group: 4,
  crossSection: 1.05,
  ...extra,
});

describe('approved exact Samara compound decoding', () => {
  for (const mark of ['МКПпАБП', 'МКПпАБПШП', 'МКПпАШП']) {
    it(`decodes all 39 conductors for ${mark} with manufacturer proof`, () => {
      const input = product(mark);
      const decoded = buildProductDesignation(input);
      expect(decoded.officialComplete).toBe(true);
      expect(decoded.warnings).toEqual([]);
      expect(decoded.tokens.some((token) => token.text === text)).toBe(true);
      expect(JSON.stringify(decoded)).not.toContain('Сложная конфигурация');
      expect(
        buildProductDesignationHtml({ ...input, designationDecoded: decoded })
      ).toContain('Всего 39 жил');
    });
  }
  for (const size of [
    configuration.replace('5х2', '4х2'),
    configuration.replace('1.05', '1.2'),
    configuration.replace('1х0.7', '1х0.9'),
    '7х4х1.05',
  ]) {
    it(`does not borrow the approved explanation for ${size}`, () => {
      const decoded = buildProductDesignation(product('МКПпАБП', size));
      expect(decoded.tokens.some((token) => token.text === text)).toBe(false);
      if (size.includes('+')) expect(decoded.officialComplete).toBe(false);
    });
  }
  it('does not conceal contradictory source fields or parsing warnings', () => {
    for (const extra of [
      { conductorConfiguration: '7х4х1.05' },
      { parsingWarnings: ['ambiguous'] },
    ]) {
      expect(
        buildProductDesignation(product('МКПпАБП', configuration, extra))
          .officialComplete
      ).toBe(false);
    }
  });
});
