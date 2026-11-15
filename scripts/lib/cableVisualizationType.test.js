import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  classifyCableVisualization,
  withCableVisualization,
} from './cableVisualizationType.js';
import { makeVisualIdentity } from './cableVisualClassification.js';
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';

const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url)));
const context = {
  rules: read('data/cableVisualClassificationRules.json'),
  familyVisualRules: read('data/familyVisualRules.json'),
  knowledge: read('shared/designationKnowledgeBase.json'),
  colorRules: read('data/cableImageColors.json'),
};
const classify = (name) =>
  classifyPracticalCableVisualProduct({ sku: 'TEST', name }, context);
const row = (extra) => ({
  familyRecognized: true,
  visualProfile: {
    family: 'control',
    productType: 'control-cable',
    cores: 7,
    geometry: 'round',
    hasOuterJacket: true,
    armor: false,
    shield: false,
    specialElements: [],
    ...extra,
  },
  issues: [],
});

describe('visualization strategy from construction, independent of image publication', () => {
  it.each([
    ['ВВГнг(А)-LS 3x1.5', 'SIMPLE'],
    ['ПУГВ 1x1.5', 'SIMPLE'],
    ['КГ 3x1.5', 'SIMPLE'],
    ['ВВГ-П 3x1.5', 'SIMPLE'],
    ['СИП-4 4x16', 'SIMPLE'],
    ['КВВГ 7x1.5', 'MULTICORE'],
    ['КВВГ 27x1.5', 'MULTICORE'],
    ['ВБШв 3x1.5', 'LAYERED'],
    ['КВВГЭ 4x1.5', 'LAYERED'],
    ['ВВГнг(А)-FRLS 3x1.5', 'LAYERED'],
    ['КВВГЭ 7x1.5', 'MULTICORE + LAYERED'],
    ['КВББШв 7x1.5', 'MULTICORE + LAYERED'],
    ['ТППэп 10x2x0.5', 'NEEDS_REVIEW'],
    ['СИП-2 3x70+1x54.6', 'NEEDS_REVIEW'],
    ['UNKNOWN 7x1.5', 'NEEDS_REVIEW'],
  ])('%s → %s', (name, type) => {
    const actual = classify(name);
    expect(actual.visualProfile.visualizationType).toBe(type === 'NEEDS_REVIEW' ? null : type);
    expect(actual.visualization.visualizationType).toBe(type);
  });
  it('never treats strands as insulated cores or reduces seven-core armour to plain MULTICORE', () => {
    expect(classify('ПУГВ 1x1.5').visualProfile.conductorConstruction).toBe(
      'stranded'
    );
    expect(classify('ПУГВ 1x1.5').visualProfile.visualizationType).toBe(
      'SIMPLE'
    );
    expect(
      classifyCableVisualization(
        row({ cores: 3, armor: true, armorType: 'steel-tapes' })
      ).visualizationType
    ).toBe('LAYERED');
    expect(
      classifyCableVisualization(row({ armor: true, armorType: 'steel-tapes' }))
        .visualizationType
    ).toBe('MULTICORE + LAYERED');
    expect(
      classifyCableVisualization(row({ armor: true })).visualizationType
    ).toBe('NEEDS_REVIEW');
    expect(
      classifyCableVisualization(row({ cores: 20, geometry: 'optical' }))
        .visualizationType
    ).toBe('NEEDS_REVIEW');
  });
  it('requires geometry and structural facts, not just an integer core count', () => {
    for (const extra of [
      { geometry: null },
      { armor: null },
      { shield: null },
      { pairedGroupSize: 2 },
      { hasOuterJacket: false },
      { specialElements: ['unverified-screen'] },
    ])
      expect(classifyCableVisualization(row(extra)).visualizationType).toBe(
        'NEEDS_REVIEW'
      );
    const conflict = row({});
    conflict.issues = [{ code: 'family_conflict', message: 'conflict' }];
    expect(classifyCableVisualization(conflict).visualizationType).toBe(
      'NEEDS_REVIEW'
    );
  });
  it('counts visible envelopes without inventing a physical manufacturing layer count', () => {
    const r = row({
      cores: 3,
      armor: true,
      armorType: 'steel-tapes',
      shield: true,
      shieldType: 'overall-foil-with-drain',
      specialElements: ['drain-wire', 'fire-barrier'],
    });
    r.technicalProfile = { filler: 'inner-sheath' };
    const v = classifyCableVisualization(r);
    expect(v.visualizationType).toBe('LAYERED');
    expect(v.visibleLayerCount).toBe(6);
    expect(v.knownVisibleLayers.map((l) => l.kind)).not.toContain('drain-wire');
    expect(v.physicalLayerCount).toBeNull();
    r.technicalProfile.filler = null;
    expect(classifyCableVisualization(r).visibleLayerCount).toBe(5);
  });
  it('keeps visualization assessment separate from generation approval and cross-section', () => {
    const r = row({});
    r.visualClassification = 'needs_review';
    r.issues = [{ code: 'unknown_coreColors', message: 'palette missing' }];
    const result = withCableVisualization(r);
    expect(result.visualProfile.visualizationType).toBe('MULTICORE');
    expect(result.visualClassification).toBe('needs_review');
    const examples = [1.5, 2.5, 4, 6].map((s) =>
      classify(`ВВГнг(А)-LS 3x${s}`)
    );
    expect(
      new Set(examples.map((r) => r.visualProfile.visualizationType))
    ).toEqual(new Set(['SIMPLE']));
    expect(new Set(examples.map((r) => r.visualKey)).size).toBe(1);
  });
  it('preserves the existing identity hash/key when adding or changing a derived strategy', () => {
    const p = row({}).visualProfile;
    const base = makeVisualIdentity(p);
    for (const visualizationType of [
      'SIMPLE',
      'MULTICORE',
      'MULTICORE + LAYERED',
      'NEEDS_REVIEW',
    ]) {
      const result = makeVisualIdentity({ ...p, visualizationType });
      expect(result.visualKey).toBe(base.visualKey);
      expect(result.visualProfileId).toBe(base.visualProfileId);
    }
    expect(withCableVisualization({ ...row({}), ...base }).visualKey).toBe(
      base.visualKey
    );
  });
});
