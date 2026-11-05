import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import { checkOpticalConstruction } from './designationOpticalEvidence.js';
const check = (id, name, fields = {}) =>
  checkOpticalConstruction(
    fields,
    name,
    registry.rules.find((r) => r.id === 'optical-' + id)
  );
describe('manufacturer optical layouts', () => {
  it('does not replace documentary layout proof by valid multiplication', () => {
    expect(
      check('family-1039', 'ДПЛ-П-144У(6х24)-2.7кН').reason
    ).toBeUndefined();
    expect(check('family-1039', 'ДПЛ-П-96У(4х24)-2.7кН').reason).toBeTruthy();
    expect(check('family-1039', 'ДПЛ-П-96У(6х24)-2.7кН').reason).toBeTruthy();
    expect(check('family-1039', 'ДПЛ-П-144У(6х24)-7кН').reason).toBeTruthy();
  });
  it('does not extend the DPO example to a different grouping, fiber or load', () => {
    expect(check('family-1034', 'ДПО-П-08У(2х4)-1,5кН').reason).toBeUndefined();
    for (const s of [
      'ДПО-П-08У(1х8)-1,5кН',
      'ДПО-П-08М(2х4)-1,5кН',
      'ДПО-П-08У(2х4)-2,7кН',
    ])
      expect(check('family-1034', s).reason).toBeTruthy();
  });
  it('confirms one central module only and respects fiber type dimensions', () => {
    const name = 'ТОЛ-П-04М-2,7кН';
    expect(
      check('family-1042', name, {
        opticalFiberCoreDiameter: 50,
        opticalFiberCladdingDiameter: 125,
      }).reason
    ).toBeUndefined();
    expect(
      check('family-1042', name, { opticalFiberCoreDiameter: 62.5 }).reason
    ).toBeTruthy();
    for (const s of [
      'ТОЛ-П-04М(2х2)-2,7кН',
      'ТОЛ-П-25М-2,7кН',
      'ТОЛ-П-04А-2,7кН',
      'ТОЛ-П-04М-7кН',
    ])
      expect(check('family-1042', s).reason).toBeTruthy();
  });
  it('retains exact sheath and rejects copper fields or extra attributes', () => {
    expect(
      check('family-1042', 'ТОЛ-П-04М-2,7кН', { crossSection: 0.5 }).reason
    ).toBeTruthy();
    expect(
      check('family-1042', 'ТОЛ-П-04М-2,7кН', { attributes: ['PUR'] }).reason
    ).toBeTruthy();
    expect(check('family-1042', 'ТОЛ-Н-04М-2,7кН').reason).toBeTruthy();
    expect(check('family-1042', 'ТОЛ-П-04М(1х4-2,7кН').reason).toBeTruthy();
  });
  it('integrates proof without changing optical decoding or commercial fields', () => {
    const d = buildProductDesignation({
      mark: 'ТОЛ-П',
      sourceName: 'ТОЛ-П-04М-2,7кН',
      price: 42,
      stock: 10,
      unit: 'м',
    });
    expect(d.officialComplete).toBe(true);
    expect(d.tokens.some((t) => t.text.includes('50/125'))).toBe(true);
    expect(d.constructionEvidence.evidence.pages).toContain(67);
  });
});
