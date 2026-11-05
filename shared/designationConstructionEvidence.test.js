import { describe, expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';
import { checkDesignationConstruction } from './designationConstructionEvidence.js';
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import registry from './designationConstructionEvidence.json' with { type: 'json' };
import { enrichPriceDesignations } from './productDesignationBatch.js';

const decode = (sourceName, fields = {}) =>
  buildProductDesignation({
    sourceName,
    mark: sourceName.split(' ')[0],
    ...fields,
  });
describe('R-019 documented construction proof', () => {
  it.each([
    'АВБбШв 3х4',
    'АВБбШв 4х4',
    'ВВГ 999х999',
    'ВВГ 3х2.51',
    'ВВГ 1х2.51',
    'ВВГ 999х2.5',
  ])('leaves %s unconfirmed, without declaring it impossible', (name) => {
    const d = decode(name);
    expect(d.officialComplete).toBe(false);
    expect(d.constructionEvidence).toMatchObject({
      status: 'unconfirmed',
      reason: 'construction-combination-not-confirmed',
    });
    expect(d.warnings.join(' ')).not.toMatch(/невозмож|не производ/iu);
  });
  it.each([
    'ВВГ 3х2.5',
    'ВВГ 3×2,5 0,66 кВ',
    'ВВГ 1х1000 1 кВ',
    'ВВГ 4х400 1 кВ',
    'ВВГ 5х240 1 кВ',
    'АВВГ 3х2.5',
    'АВБбШв 4х50',
    'АВБбШв 2х6 1 кВ',
    'АВБбШв 4х240 1 кВ',
  ])('confirms documented combination %s', (name) => {
    const d = decode(name);
    expect(d.officialComplete).toBe(true);
    expect(d.constructionEvidence.evidence.pages).toContain(170);
    expect(d.constructionEvidence.evidence.documentId).toBe('hka');
  });
  it.each([
    'ВВГ 3х70 0.66 кВ',
    'ВВГ 3х2.5 6 кВ',
    'ВВГ 3х2.5 3 кВ',
    'ВВГ 2х300 1 кВ',
    'ВВГ 5х400 1 кВ',
    'АВВГ 3х1.5',
    'АВБбШв 1х50',
    'АВБбШв 5х50',
    'АВБбШв 4х300',
    'ВВГ 3х2.5 нг(А)-HF',
    'ВВГ 3х2.5 нг(А)-LS-ХЛ',
    'ВВГ-П 3х2.5',
    'ВВГ 3х2.5+1х1.5',
    'ВВГ 3х2.5/1.5',
  ])('does not extend scope to %s', (name) => {
    expect(decode(name).officialComplete).toBe(false);
  });
  it('does not infer a warehouse voltage from a dimension-only designation', () => {
    expect(
      decode('ВВГ 3х2.5').constructionEvidence.configuration
    ).toMatchObject({ voltage: null, documentedVoltages: [0.66, 1] });
  });
  it.each([
    { voltage: 6 },
    { cores: 4 },
    { crossSection: 4 },
    { groupCores: 2 },
    { attributes: ['нг(А)-LS'] },
    { groundSection: 1.5 },
  ])('rejects conflicting or uncovered fields %j', (fields) => {
    expect(decode('ВВГ 3х2.5', fields).officialComplete).toBe(false);
  });
  it('requires exact model and documented construction, not a manufacturer link', () => {
    const d = decode('33HTP2-BP');
    expect(d.officialComplete).toBe(true);
    expect(d.constructionEvidence.configuration).toMatchObject({
      powerPerMetre: 33,
      voltage: 230,
    });
    expect(
      buildProductDesignation({
        brand: 'Belden',
        mark: '9842',
        sourceName: '9842 2pr24',
      }).officialComplete
    ).toBe(true);
    for (const name of [
      'HELUKABEL 2х2х0.75',
      'LAPP KABEL 12х1',
      '34HTP2-BP',
      '33HTP2-BP 115V',
    ])
      expect(decode(name).officialComplete).toBe(false);
  });
  it('fails closed if the retrieved document/hash/page proof is absent or changes', () => {
    const family = knowledge.families.find((f) => f.id === 'family-0001');
    for (const changes of [
      { status: 'missing' },
      { publisherType: 'reference' },
      { sha256: 'changed' },
      { pages: 2 },
    ]) {
      const documents = knowledge.documents.map((d) =>
        d.id === 'hka' ? { ...d, ...changes } : d
      );
      expect(
        checkDesignationConstruction({
          product: {},
          designation: 'ВВГ 3х2.5',
          family,
          documents,
        }).status
      ).toBe('unconfirmed');
    }
  });
  it('has unique rules tied to exact retrieved manufacturer documents and existing physical pages', () => {
    expect(new Set(registry.rules.map((r) => r.id)).size).toBe(
      registry.rules.length
    );
    for (const rule of registry.rules) {
      if (rule.sourcePattern)
        expect(() => new RegExp(rule.sourcePattern, 'iu')).not.toThrow();
      for (const proof of [rule.evidence, ...(rule.supportingEvidence || [])]) {
        const doc = knowledge.documents.find((d) => d.id === proof.documentId);
        expect(doc).toMatchObject({
          publisherType: 'manufacturer',
          status: 'collected',
          sha256: proof.sha256,
        });
        if (proof.format === 'html') expect(proof.locator).toBeTruthy();
        else {
          expect(proof.pages.length).toBeGreaterThan(0);
          expect(
            proof.pages.every(
              (p) => Number.isInteger(p) && p > 0 && p <= doc.pages
            )
          ).toBe(true);
        }
      }
    }
  });
  it('keeps classification review and all commercial fields while recording evidence gaps', () => {
    const input = [
      {
        id: 100,
        sourceName: 'АВБбШв 3х4',
        mark: 'АВБбШв',
        price: 31.7,
        stock: 24,
        unit: 'м',
        classificationReview: { reason: 'purpose' },
        importDisposition: 'active',
      },
    ];
    const { products, report } = enrichPriceDesignations(input);
    const { designationDecoded, ...commercial } = products[0];
    expect(commercial).toEqual(input[0]);
    expect(designationDecoded.officialComplete).toBe(false);
    expect(report.officialPending[0].constructionEvidence.status).toBe(
      'unconfirmed'
    );
  });
});
