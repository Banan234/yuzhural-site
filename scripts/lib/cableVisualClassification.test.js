import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  normalizeCableFamily,
  classifyCableVisualProduct,
  makeVisualIdentity,
  compareVisualAsset,
} from './cableVisualClassification.js';
import {
  classifyExistingCableAsset,
  planCableVisualAudit,
  auditCsv,
} from './cableVisualAudit.js';
import { renderCableVisualReport } from './cableVisualReport.js';

const load = (f) =>
  JSON.parse(fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const context = {
  rules: load('data/cableVisualClassificationRules.json'),
  knowledge: load('shared/designationKnowledgeBase.json'),
  colorRules: load('data/cableImageColors.json'),
};
const product = (name, extra = {}) => ({ sku: 'TEST-1', name, ...extra });
const classify = (name, extra = {}) =>
  classifyCableVisualProduct(product(name, extra), context);
const complete = (section = 1.5, extra = {}) =>
  product(`ВВГнг(А)-LS 3x${section}`, {
    cores: 3,
    crossSection: section,
    visualCharacteristics: {
      conductorConstruction: 'solid',
      conductorShape: 'circular',
      hasPE: true,
      hasN: true,
      outerJacket: 'black',
      filler: 'none',
      coreColors: ['brown', 'blue', 'yellow-green'],
    },
    ...extra,
  });

describe('cable visual normalization and provenance', () => {
  it('normalizes equivalent spelling and preserves the exact original string', () => {
    const names = [
      '  Кабель ВВГнг(А)-LS 3х2,5  ',
      'ВВГнг А LS 3x2.5',
      'ВВГнг(А) LS 3x2.5',
    ];
    expect(
      names.map((name) => normalizeCableFamily(product(name), context).familyId)
    ).toEqual(['vvgng-a-ls', 'vvgng-a-ls', 'vvgng-a-ls']);
    expect(classify(names[0]).originalName).toBe(names[0]);
    expect(classify('ВВГнг-LS 3x2.5').familyId).toBe('vvgng-ls');
  });
  it('uses longest exact family and targeted mixed-script aliases', () => {
    expect(classify('КВВГЭнг(А)-LS 7x1.5').baseFamily).toBe('КВВГЭ');
    expect(classify('КВВГЭнг(А)-LS 7x1.5').visualProfile.shield).toBe(true);
    expect(classify('NYМ 3x1.5').familyId).toBe(classify('NYM 3x1.5').familyId);
    expect(classify('ВВГ-П 3x1.5').geometry).toBe('flat');
    expect(classify('ВВГП 3x1.5').geometry).toBe('flat');
    expect(classify('ВВГ 3x1.5 п нг(А)LS').geometry).toBe('flat');
    expect(classify('ВВГ 3x1.5 п нг(А)LS').familyId).toBe('vvg-png-a-ls');
    expect(
      classify('NYМ 3x1.5', { mark: 'NYМ' }).issues.some(
        (i) => i.code === 'family_conflict'
      )
    ).toBe(false);
  });
  it('does not infer PE, N or a solid conductor from core count or a parser default', () => {
    const row = classify('ВВГнг(А)-LS 3x1.5', {
      cores: 3,
      crossSection: 1.5,
      hasGroundCore: false,
    });
    expect(row.hasPE).toBeNull();
    expect(row.hasN).toBeNull();
    expect(row.construction).toBeNull();
    expect(row.classificationConfidence).toBe('low');
    expect(row.visualClassification).toBe('needs_review');
    expect(row.visualProfile.coreColors).toBeNull();
  });
  it('keeps paired and auxiliary arrangements for manual review, without treating a messenger as PE', () => {
    const sip = classify('СИП-2 3х70+1х54.6');
    expect(sip.cores).toBe(4);
    expect(sip.hasPE).toBeNull();
    expect(sip.auxiliarySection).toBe(54.6);
    expect(sip.issues.some((i) => i.code === 'auxiliary_role_unknown')).toBe(
      true
    );
    const paired = classify('ТППэп 10х2х0.5');
    expect(paired.cores).toBe(20);
    expect(paired.visualClassification).toBe('needs_review');
  });
  it('recognizes a colored bare-of-common-jacket installation wire and source-based section transitions', () => {
    const wire = classify('ПуГВ 1х2.5 ж/з');
    expect(wire.visualClassification).toBe('recognized');
    expect(wire.classificationConfidence).toBe('medium');
    expect(wire.visualProfile.hasOuterJacket).toBe(false);
    expect(wire.construction).toBe('stranded');
    expect(wire.visualProfile.coreColors).toEqual(['yellow-green']);
    const small = classify('ПВ1 10 синий'),
      large = classify('ПВ1 16 синий');
    expect(small.construction).toBe('solid');
    expect(large.construction).toBe('stranded');
    expect(small.visualKey).not.toBe(large.visualKey);
    expect(large.evidence.conductorConstruction.source.url).toContain(
      'podolskkabel.ru'
    );
  });
  it('uses explicit colors without claiming blue necessarily serves N', () => {
    const row = classify('ПуГВ 1х2.5 синий');
    expect(row.visualProfile.coreColors).toEqual(['blue']);
    expect(row.hasN).toBeNull();
    expect(classify('МГШВ 0.12 красный').visualKey).not.toBe(
      classify('МГШВ 0.12 бел').visualKey
    );
    expect(classify('ПуГВ 1х2.5 красн').visualClassification).toBe(
      'recognized'
    );
  });
  it('rejects contradictions, extra colors and unknown suffixes', () => {
    expect(
      classify('ВВГ 3x1.5', { cores: 2 }).issues.some(
        (i) => i.code === 'structured_conflict'
      )
    ).toBe(true);
    expect(
      classify('ВВГ 3x1.5', { coreColors: ['brown', 'blue'] }).issues.some(
        (i) => i.code === 'color_conflict'
      )
    ).toBe(true);
    expect(
      classify('ВВГ 3x1.5 мк ок').issues.some(
        (i) => i.code === 'construction_conflict'
      )
    ).toBe(true);
    expect(
      classify('ВВГ 3x1.5 непонятный').issues.some(
        (i) => i.code === 'unverified_modifier'
      )
    ).toBe(true);
    expect(
      classify('ВВГ 3x1.5', { mark: 'КГ' }).issues.some(
        (i) => i.code === 'family_conflict'
      )
    ).toBe(true);
  });
  it('distinguishes solid round and sector constructions', () => {
    const a = classify('ВВГ 3x25 ок'),
      b = classify('ВВГ 3x25 ос');
    expect(a.visualProfile.conductorShape).toBe('circular');
    expect(b.visualProfile.conductorShape).toBe('sector');
    expect(a.visualKey).not.toBe(b.visualKey);
  });
  it('retains unresolved family suffixes and conflicting structured construction', () => {
    expect(classify('КУИН-ПУГВВ 1x2.5').visualKey).not.toBe(
      classify('КУИН 1x2.5').visualKey
    );
    expect(
      classify('ПуГВ 1x2.5 синий', {
        wireConstruction: 'однопроволочная',
        conductorStrandCount: 7,
      }).issues.some((i) => i.code === 'construction_conflict')
    ).toBe(true);
  });
});

describe('visual profile grouping and existing image safety', () => {
  it('canonicalizes object order in profile identity', () => {
    expect(
      makeVisualIdentity({ family: 'vvg', cores: 3, geometry: 'round' })
        .visualKey
    ).toBe(
      makeVisualIdentity({ geometry: 'round', cores: 3, family: 'vvg' })
        .visualKey
    );
  });
  it('shares profiles across section, SKU, supplier, price and stock while preserving per-SKU section', () => {
    const a = classifyCableVisualProduct(complete(), context),
      b = classifyCableVisualProduct(
        complete(6, {
          sku: 'OTHER',
          price: 999,
          stock: 0,
          supplier: 'someone',
        }),
        context
      );
    expect(a.visualClassification).toBe('recognized');
    expect(a.visualKey).toBe(b.visualKey);
    expect(a.section).toBe(1.5);
    expect(b.section).toBe(6);
  });
  it.each([
    'family',
    'cores',
    'conductorConstruction',
    'geometry',
    'hasPE',
    'coreColors',
    'armor',
    'shield',
    'hasOuterJacket',
    'specialElements',
    'filler',
  ])('includes visible difference %s in identity', (field) => {
    const a = classifyCableVisualProduct(complete(), context).visualProfile;
    const b = {
      ...a,
      [field]:
        field === 'coreColors'
          ? ['brown', 'black', 'grey']
          : field === 'specialElements'
            ? ['drain-wire']
            : typeof a[field] === 'boolean'
              ? !a[field]
              : `${a[field]}-different`,
    };
    expect(makeVisualIdentity(a).visualKey).not.toBe(
      makeVisualIdentity(b).visualKey
    );
  });
  it('allows a configured family section rule without changing every family', () => {
    const local = structuredClone(context);
    local.rules.familyOverrides['vvgng-a-ls'] = {
      sectionAffectsVisual: true,
      visualSectionBands: [
        { maxSection: 2.5, key: 'small' },
        { maxSection: 100, key: 'large' },
      ],
    };
    expect(classifyCableVisualProduct(complete(), local).visualKey).not.toBe(
      classifyCableVisualProduct(complete(6), local).visualKey
    );
  });
  it('never reuses an image from another family, another core count, or with unrecorded construction', () => {
    const row = classifyCableVisualProduct(complete(), context),
      asset = {
        status: 'approved',
        image: '/example.png',
        visualProfile: row.visualProfile,
      };
    expect(compareVisualAsset(row, asset).compatible).toBe(true);
    expect(
      compareVisualAsset(row, {
        ...asset,
        visualProfile: { ...row.visualProfile, cores: 2 },
      }).compatible
    ).toBe(false);
    expect(
      compareVisualAsset(row, {
        ...asset,
        visualProfile: { ...row.visualProfile, family: 'kg' },
      }).compatible
    ).toBe(false);
    expect(
      compareVisualAsset(row, {
        ...asset,
        visualProfile: { ...row.visualProfile, filler: null },
      }).compatible
    ).toBe(false);
    expect(compareVisualAsset(classify('ВВГ 3x1.5'), asset).compatible).toBe(
      false
    );
  });
  it('builds REUSE/MISSING/NEEDS_REVIEW decisions, retains source data and performs no network calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Network forbidden');
    });
    try {
      const p1 = complete(),
        p2 = product('ПуГВ 1х2.5 ж/з', { sku: 'WIRE' }),
        p3 = product('НЕИЗВЕСТНО 3х1.5', { sku: 'UNKNOWN' });
      const products = [p1, p2, p3],
        before = JSON.stringify(products);
      const row = classifyCableVisualProduct(p1, context);
      const asset = {
        status: 'approved',
        image: '/example.png',
        visualProfile: row.visualProfile,
      };
      const report = planCableVisualAudit({
        products,
        context,
        assets: [asset],
      });
      expect(report.rows.map((r) => r.imageStatus)).toEqual([
        'REUSE',
        'MISSING',
        'NEEDS_REVIEW',
      ]);
      expect(report.summary.recognized + report.summary.needsReview).toBe(3);
      expect(report.generationAllowed).toBe(false);
      expect(report.bindingAllowed).toBe(false);
      expect(JSON.stringify(products)).toBe(before);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('migrates legacy descriptors as partial candidates rather than proof of SKU PE/strand', () => {
    const record = {
      visualKey: 'vvgnga-ls__3core',
      family: 'ВВГнг(А)-LS',
      status: 'approved',
      public_url: '/old.png',
      visual_descriptor: {
        family: 'ВВГнг(А)-LS',
        cores: 3,
        material: 'copper',
        strand: 'solid',
        shape: 'round',
        jacket: 'black PVC',
        insulation: 'PVC',
        colors: ['brown', 'blue', 'yellow-green'],
      },
    };
    const asset = classifyExistingCableAsset(record, context);
    expect(asset.legacyVisualKey).toBe(record.visualKey);
    expect(asset.visualProfile.family).toBe('vvgng-a-ls');
    expect(asset.profileCompleteness).toBe('partial');
    expect(asset.visualProfile.filler).toBeNull();
    expect(asset.visualProfile.hasPE).toBe(true);
    expect(asset.visualProfile.hasN).toBeNull();
  });
  it('escapes report JSON and spreadsheet formulas', () => {
    const row = classify('ПуГВ 1х2.5 синий');
    row.originalName = '=danger </script><script>alert(1)</script>';
    const report = planCableVisualAudit({ products: [], context, assets: [] });
    report.rows = [row];
    expect(renderCableVisualReport(report)).not.toContain(
      '</script><script>alert(1)</script>'
    );
    expect(auditCsv([row])).toContain("'=danger");
  });
});
