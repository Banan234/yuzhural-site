import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  classifyPracticalCableVisualProduct,
  comparePracticalVisualAsset,
  compareApprovedVisualConstruction,
  resolveFamilyVisualRule,
} from './familyVisualRules.js';
import {
  classifyExistingCableAsset,
  planCableVisualAudit,
} from './cableVisualAudit.js';

const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const context = {
  rules: read('data/cableVisualClassificationRules.json'),
  knowledge: read('shared/designationKnowledgeBase.json'),
  colorRules: read('data/cableImageColors.json'),
  familyVisualRules: read('data/familyVisualRules.json'),
};
const product = (name, extra = {}) => ({ name, sku: 'TEST-1', ...extra });
const classify = (name, extra = {}) =>
  classifyPracticalCableVisualProduct(product(name, extra), context);
const legacy = (overrides = {}) => ({
  status: 'approved',
  visualKey: 'vvgnga-ls__3core',
  public_url: '/existing.png',
  visual_descriptor: {
    family: 'ВВГнг(А)-LS',
    cores: 3,
    material: 'copper',
    strand: 'solid',
    shape: 'round',
    jacket: 'black PVC',
    insulation: 'PVC',
    colors: ['brown', 'blue', 'yellow-green'],
    ...overrides,
  },
});

describe('practical centralized catalogue rules', () => {
  it('approves the requested VVG examples without inventing per-SKU PE or construction facts', () => {
    const rows = [1.5, 2.5, 4].map((n) =>
      classify(`ВВГнг(А)-LS 3x${n}`, { hasGroundCore: false })
    );
    expect(rows.every((r) => r.visualClassification === 'AUTO_APPROVED')).toBe(
      true
    );
    expect(new Set(rows.map((r) => r.visualKey)).size).toBe(1);
    expect(rows.map((r) => r.section)).toEqual([1.5, 2.5, 4]);
    expect(rows[0].technicalProfile.conductorConstruction).toBeNull();
    expect(rows[0].technicalProfile.hasPE).toBeNull();
    expect(rows[0].paletteIsCatalogueConvention).toBe(true);
    expect(rows[0].appliedFamilyVisualRule).toBe('vvgng-a-ls');
    expect(rows[0].visualProfile.coreColors).toEqual([
      'brown',
      'blue',
      'yellow-green',
    ]);
  });
  it('does not block a known type for hidden filler, exact polymer detail or exact section', () => {
    const row = classify('ВВГ 3x1.5');
    expect(row.issues).toEqual([]);
    expect(row.nonBlockingIssues.some((i) => i.code === 'unknown_filler')).toBe(
      true
    );
    expect(row.visualProfile).not.toHaveProperty('filler');
    expect(row.visualProfile).not.toHaveProperty('auxiliarySectionKey');
  });
  it('keeps principal construction, total cores, jacket absence and flat geometry distinct', () => {
    const names = [
      'ВВГ 3x1.5',
      'ВВГ 2x1.5',
      'ВВГ-П 3x1.5',
      'ПуГВ 1x1.5',
      'КГ 3x1.5',
      'ВБШв 3x1.5',
      'КВВГ 3x1.5',
      'СИП-4 4x16',
    ];
    const rows = names.map((n) => classify(n));
    expect(rows.every((r) => r.visualClassification === 'AUTO_APPROVED')).toBe(
      true
    );
    expect(new Set(rows.map((r) => r.visualKey)).size).toBe(names.length);
    expect(rows[3].visualProfile.hasOuterJacket).toBe(false);
    expect(rows[4].construction).toBe('stranded');
    expect(rows[5].visualProfile.armor).toBe(true);
    expect(rows[7].visualProfile.geometry).toBe('twisted-bundle');
  });
  it('does not erase explicit PE/color choices or known stranded construction', () => {
    expect(classify('ВВГ 3x1.5 мк').construction).toBe('stranded');
    expect(
      classify('ВВГ 3x1.5', { hasPE: false }).visualProfile.coreColors
    ).toEqual(['brown', 'black', 'grey']);
    expect(classify('ВВГ 3x1.5', { hasPE: false }).visualKey).not.toBe(
      classify('ВВГ 3x1.5').visualKey
    );
    expect(
      classify('ВВГ 3x1.5', {
        hasPE: true,
        coreColors: ['brown', 'black', 'grey'],
      }).visualClassification
    ).toBe('needs_review');
    expect(classify('ПВС 3х1 черн.').visualProfile.outerJacket).toBe('black');
    expect(classify('ПВС 3х1 (черн)').visualProfile.outerJacket).toBe('black');
    expect(classify('ПВС 2x1+1x1').visualClassification).toBe('AUTO_APPROVED');
    expect(classify('КГ 2x1.5+1x1.5').visualClassification).toBe(
      'AUTO_APPROVED'
    );
    expect(classify('КГ 2x1.5+1x1.5').technicalProfile.hasPE).toBeNull();
    expect(
      classify('КГВВ 3x1.5', { wireConstruction: 'однопроволочная' })
        .visualClassification
    ).toBe('needs_review');
  });
  it('retains legitimate per-section construction bands without physical diameter calculations', () => {
    expect(classify('ПВ1 10 синий').construction).toBe('solid');
    expect(classify('ПВ1 16 синий').construction).toBe('stranded');
    expect(classify('ПВ1 10 синий').visualKey).not.toBe(
      classify('ПВ1 16 синий').visualKey
    );
  });
  it('handles common NYM/NYY/PPG defaults and documented protective-conductor indices', () => {
    expect(classify('NYM 2x1.5').visualClassification).toBe('AUTO_APPROVED');
    expect(classify('NYM 3x16-J').construction).toBe('stranded');
    const j = classify('NYM-J 3x1.5'),
      o = classify('NYM-O 3x1.5');
    expect(j.visualClassification).toBe('AUTO_APPROVED');
    expect(o.visualClassification).toBe('AUTO_APPROVED');
    expect(j.visualProfile.coreColors).toContain('yellow-green');
    expect(o.visualProfile.coreColors).not.toContain('yellow-green');
    expect(j.visualKey).not.toBe(o.visualKey);
    expect(classify('NYM 12x1.5-J').visualClassification).toBe('AUTO_APPROVED');
    expect(classify('NYY 12x2.5-J').visualProfile.coreColors).toHaveLength(12);
    expect(classify('NYY 12x2.5-J').visualProfile.coreColors).toContain(
      'yellow-green'
    );
    expect(classify('NYY 4x50 SM').construction).toBe('stranded');
    expect(classify('NYY 4x50 SM').visualProfile.conductorShape).toBe('sector');
    expect(classify('NYM-J 3x1.5', { hasPE: false }).visualClassification).toBe(
      'needs_review'
    );
    expect(classify('АКВВГ 4x2.5').visualProfile.conductorMaterial).toBe(
      'aluminium'
    );
    expect(classify('ППГ 3x1.5 нг(А)HF').visualClassification).toBe(
      'AUTO_APPROVED'
    );
    expect(classify('ППГ 3x1.5 Э нг(А)HF').visualProfile.shield).toBe(true);
    expect(classify('ППГ 3x1.5 Э нг(А)HF').baseFamily).toBe('ППГЭ');
    expect(classify('ППГ 3x1.5 Э нг(А)HF').visualProfile.productType).toBe(
      'power-cable'
    );
  });
  it('keeps screen/armour uncertainty, malformed input and unknown families on review', () => {
    for (const [name, extra] of [
      ['ВВГ 3x1.5 Э', {}],
      ['ВВГ 3x1.5 Б', {}],
      ['ВВГ 3x1.5', { cores: 2 }],
      ['НЕИЗВЕСТНЫЙ 3x1.5', {}],
      ['ТППэп 10x2x0.5', {}],
      ['СИП-2 3x50+1x50', {}],
    ])
      expect(classify(name, extra).visualClassification).toBe('needs_review');
    expect(classify('ВВГ 3x1.5 ос').visualProfile.conductorShape).toBe(
      'sector'
    );
    expect(classify('ВВГ 3x1.5 ос').visualKey).not.toBe(
      classify('ВВГ 3x1.5 ок').visualKey
    );
  });
  it('normalizes the separately written exact KVVGE screen modifier to its known family', () => {
    const row = classify('КВВГ 7x1.5 Э');
    expect(row.baseFamily).toBe('КВВГЭ');
    expect(row.visualProfile.shield).toBe(true);
    expect(row.visualProfile.shieldType).toBe('overall-foil-with-drain');
    expect(row.visualClassification).toBe('AUTO_APPROVED');
    const many = classify('КВВГ 61x1');
    expect(many.visualProfile.coreColors).toHaveLength(61);
    expect(many.visualKey.length).toBeLessThan(220);
  });
  it('accepts recognized LTx variants, retains fire barriers and rejects unknown modifiers', () => {
    const row = classify('ВВГ 3x1.5 нг(А)LS LTx');
    expect(row.visualClassification).toBe('AUTO_APPROVED');
    expect(
      classify('ВВГ 3x1.5 нг(А)FRLS').visualProfile.specialElements
    ).toContain('fire-barrier');
    expect(classify('ВВГ 3x1.5 непонятный').visualClassification).toBe(
      'needs_review'
    );
  });
  it('avoids misleading non-critical review reasons for unsupported families', () => {
    const row = classify('ТППэп 10x2x0.5');
    expect(row.issues.some((i) => i.code === 'unknown_filler')).toBe(false);
    expect(row.nonBlockingIssues.some((i) => i.code === 'unknown_filler')).toBe(
      true
    );
    expect(row.issues.some((i) => i.code === 'special_configuration')).toBe(
      true
    );
  });
});

describe('reuse and dry-run safety', () => {
  it('reuses approved legacy typage without new filler/material metadata requirements', () => {
    const row = classify('ВВГнг(А)-LS 3x1.5'),
      asset = classifyExistingCableAsset(legacy(), context);
    expect(asset.visualProfile.filler).toBeNull();
    expect(comparePracticalVisualAsset(row, asset).compatible).toBe(true);
    for (const change of [
      { cores: 2 },
      { shape: 'flat' },
      { strand: 'stranded' },
      { family: 'КГ' },
      { material: 'aluminium' },
      { jacket: 'white PVC' },
    ])
      expect(
        comparePracticalVisualAsset(
          row,
          classifyExistingCableAsset(legacy(change), context)
        ).compatible
      ).toBe(false);
  });
  it('does not transfer user style approval to unverified/failed assets', () => {
    const row = classify('ВВГнг(А)-LS 3x1.5'),
      asset = classifyExistingCableAsset(legacy(), context);
    expect(
      comparePracticalVisualAsset(row, { ...asset, status: 'needs_review' })
        .compatible
    ).toBe(false);
  });
  it('limits group eligibility to good SKUs when a conflicting record shares its appearance', () => {
    const good = product('ВВГнг(А)-LS 3x1.5'),
      bad = product('ВВГнг(А)-LS 3x2.5', { sku: 'BAD', crossSection: 4 });
    const report = planCableVisualAudit({
      products: [good, bad],
      context,
      assets: [],
    });
    const group = report.groups.find((g) =>
      g.autoApprovedSkus.includes('TEST-1')
    );
    expect(group.autoApprovedSkus).not.toContain('BAD');
    expect(report.needsReview.some((r) => r.sku === 'BAD')).toBe(true);
    expect(report.summary.totalProducts).toBe(
      report.summary.autoApproved + report.summary.needsReview
    );
  });
  it('does not mutate catalogue input and never accesses network in the planner', () => {
    const products = [product('ВВГнг(А)-LS 3x1.5')],
      before = JSON.stringify(products),
      fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('Network forbidden');
      });
    try {
      const report = planCableVisualAudit({ products, context, assets: [] });
      expect(report.generationAllowed).toBe(false);
      expect(report.summary.apiRequests).toBe(0);
      expect(report.summary.bindingsChanged).toBe(0);
      expect(JSON.stringify(products)).toBe(before);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('rejects rule inheritance cycles', () => {
    const local = structuredClone(context);
    local.familyVisualRules.familyVisualRules.vvg = { extends: 'vvg' };
    expect(() =>
      resolveFamilyVisualRule({ familyId: 'vvg', baseFamily: 'ВВГ' }, local)
    ).toThrow('inheritance');
  });
});

it('uses the reviewed 5×70 illustration profile only for its source row', () => {
  const sourceName = 'ВВГ 5х 70 нг(А)LS-Ltx';
  const row = {
    id: 7248,
    sku: 'YU-0007248',
    sourceName,
    name: 'ВВГнг(А)-LS-LTx 5х70',
    cores: 5,
    crossSection: 70,
    attributes: ['нг(А)-LS-LTx'],
  };
  const reviewed = classifyPracticalCableVisualProduct(row, context);
  expect(reviewed.visualProfile).toMatchObject({
    conductorConstruction: 'stranded',
    visualizationType: 'MULTICORE',
    technicalConstruction: { innerSheath: 'low-toxicity PVC' },
  });
  expect(reviewed.technicalProfile.conductorConstruction).toBeNull();
  for (const override of [
    { sku: 'TEST-2' },
    { id: 7249 },
    { crossSection: 25 },
    { voltage: 6 },
    { manufacturer: 'Указан поставщиком' },
    { sourceName: 'ВВГ 5х 70 нг(А)LS-Ltx (ож)' },
  ]) {
    const other = classifyPracticalCableVisualProduct({ ...row, ...override }, context);
    expect(other.visualKey).not.toBe(reviewed.visualKey);
    expect(other.visualProfile.technicalConstruction).toBeUndefined();
  }
});

describe('visual comparison with approved PNG', () => {
  const profile = {
    family: 'source', cores: 4, geometry: 'round', visualizationType: 'MULTICORE',
    conductorShape: 'circular', conductorMaterial: 'copper', conductorConstruction: 'stranded',
    hasOuterJacket: true, shield: false, armor: false, specialElements: [],
    coreColors: ['brown','black','grey','blue'], outerJacket: 'black',
  };
  const layers = { inner: false, fill: false, separator: false };
  const asset = { profile, layers, approval: { APPROVED_FOR_CATALOG: true, visualKey: 'source' } };
  const row = { profile: { ...profile, family: 'other' }, visualKey: 'other', layers, classification: 'AUTO_APPROVED' };
  const check = (change, extra) => compareApprovedVisualConstruction(
    { ...row, profile: { ...row.profile, ...change }, ...extra }, asset
  );
  it('does not use family or visualKey as a construction requirement', () => {
    expect(check({}).status).toBe('COMPATIBLE');
  });
  it.each(['NEEDS_REVIEW', 'REJECTED', 'APPROVED', null])('treats %s as an unknown strategy', value => {
    const result = check({ visualizationType: value });
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.unknown).toContain('visualizationType');
    expect(result.mismatch).toEqual([]);
  });
  it.each([
    ['cores', 3], ['geometry', 'flat'], ['conductorConstruction', 'solid'],
    ['visualizationType', 'SIMPLE'], ['shield', true], ['armor', true],
    ['specialElements', ['fire-barrier']],
  ])('preserves confirmed conflicts in %s despite missing evidence', (field, value) => {
    const result = check({ [field]: value, conductorMaterial: null });
    expect(result.status).toBe('INCOMPATIBLE');
    expect(result.mismatch).toContain(field);
    expect(result.unknown).toContain('conductorMaterial');
  });
  it.each(['shield','armor','conductorConstruction'])('never treats unknown %s as absent or matched', field => {
    expect(check({ [field]: null }).unknown).toContain(field);
    expect(check({}, { disputed: [field] }).status).toBe('NEEDS_REVIEW');
  });
  it('checks layer evidence and explicit colors without guessing absence', () => {
    expect(check({}, { layers: { ...layers, inner: null } }).status).toBe('NEEDS_REVIEW');
    expect(check({}, { layers: { ...layers, fill: true } }).mismatch).toContain('fill');
    expect(check({}, { color: { jacket:'white' } }).mismatch).toContain('outerJacket');
    expect(check({}, { color: { cores:['white'] } }).mismatch).toContain('coreColors');
    expect(compareApprovedVisualConstruction(row, { ...asset, layers:{ ...layers, fill:null } }).status).toBe('NEEDS_REVIEW');
  });
  it.each(['armor', 'shield'])('checks %s type when present on both sides', field => {
    const type = field + 'Type';
    const target = { ...row, profile:{ ...profile, [field]:true, [type]:'foil' } };
    const image = { ...asset, profile:{ ...profile, [field]:true, [type]:'tape' } };
    expect(compareApprovedVisualConstruction(target, image).mismatch).toContain(type);
    target.profile[type] = 'NEEDS_REVIEW';
    expect(compareApprovedVisualConstruction(target, image).status).toBe('NEEDS_REVIEW');
  });
});
