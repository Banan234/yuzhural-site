import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import { enrichPriceDesignations } from './productDesignationBatch.js';
import { buildProductDesignationHtml } from './productDesignationHtml.js';

const decode = (mark, sourceName, attributes = []) =>
  buildProductDesignation({ mark, sourceName, attributes });
const wording = (d) =>
  [d.description, ...d.tokens.map((t) => t.text)].join(' ');

describe('additional manufacturer constructions and import boundaries', () => {
  it('decodes literal coaxial codes with impedance and insulation diameter, preserving their construction code', () => {
    const d = decode('РК 50-2-13', 'РК 50-2-13');
    expect(d.officialComplete).toBe(true);
    expect(wording(d)).toContain('50 Ом');
    expect(wording(d)).toContain('2,2 мм');
    expect(wording(d)).not.toContain('мм²');
    expect(decode('РК 50-2-999', 'РК 50-2-999').officialComplete).toBe(false);
    expect(
      decode('РК 50-2-13', 'РК 50-2-13 нг(А)HF', ['нг(А)-HF']).officialComplete
    ).toBe(false);
  });

  it('validates wire section, conductor class and voltage as one factory configuration', () => {
    const valid = decode('НВМ 0.2-1 600В бел', 'НВМ 0.2-1 600В бел');
    expect(valid.officialComplete).toBe(true);
    expect(wording(valid)).toContain('600');
    for (const name of ['НВМ 0.2-5 600В бел', 'НВМ 0.2-1 900В бел']) {
      expect(decode(name, name).officialComplete).toBe(false);
    }
  });

  it('accepts only the screened core counts and sections in the factory table', () => {
    expect(decode('КУПВ', 'КУПВ 27эх0.5').officialComplete).toBe(true);
    expect(decode('КУПВ', 'КУПВ 8эх0.5').officialComplete).toBe(false);
    expect(decode('КУПВ', 'КУПВ 27эх0.75').officialComplete).toBe(false);
  });

  it('scopes the newly confirmed 1 mm² control cable to its documented core counts', () => {
    expect(
      decode('КВБШв', 'КВБШв 4х1 нг(А)LS', ['нг(А)-LS']).officialComplete
    ).toBe(true);
    expect(
      decode('КВБШв', 'КВБШв 2х1 нг(А)LS', ['нг(А)-LS']).officialComplete
    ).toBe(false);
    expect(
      decode('КВБШв', 'КВБШв 4х0.75 нг(А)LS', ['нг(А)-LS']).officialComplete
    ).toBe(false);
  });

  it('does not extend the new import cable tables to unsupported dimensions or fire executions', () => {
    expect(decode('H05BQ-F', 'H05BQ-F 3х0.75').officialComplete).toBe(true);
    expect(decode('H05BQ-F', 'H05BQ-F 3х2.5').officialComplete).toBe(false);
    expect(decode('PAAR-CY-OZ', 'PAAR-CY-OZ 20х2х1').officialComplete).toBe(
      true
    );
    expect(decode('PAAR-CY-OZ', 'PAAR-CY-OZ 20х2х0.75').officialComplete).toBe(
      false
    );
    expect(
      decode('HABIA Cable E2419', 'HABIA Cable E2419 1х0.24 желт', ['желт'])
        .officialComplete
    ).toBe(true);
    expect(
      decode('HABIA Cable E2419', 'HABIA Cable E2419 0.35').officialComplete
    ).toBe(false);
  });

  it('reuses descriptions for future positions and static cards while preserving original price fields', () => {
    const input = {
      sku: 'future-01',
      slug: 'future-01',
      mark: 'OZ-BL-CY',
      sourceName: 'HELUKABEL OZ-BL-CY 2х0.75',
      attributes: [],
      price: 123,
      stock: 7,
    };
    const {
      products: [product],
    } = enrichPriceDesignations([input]);
    const { designationDecoded, ...unchanged } = product;
    expect(unchanged).toEqual(input);
    expect(designationDecoded.officialComplete).toBe(true);
    expect(
      designationDecoded.manufacturerTexts.some(
        (t) => t.manufacturer === 'HELUKABEL'
      )
    ).toBe(true);
    const html = buildProductDesignationHtml(product);
    expect(html).toContain('HELUKABEL');
    expect(html).toContain(designationDecoded.manufacturerTexts[0].text);
    expect(decode('HELUKABEL', 'HELUKABEL 2х0.75').officialComplete).toBe(
      false
    );
  });
});
