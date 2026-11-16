import { expect, test } from 'vitest';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { buildCableCompositionContract } from './cableCompositionContract.js';
import { selectCableIllustrationRules } from './cableIllustrationRules.js';
import { compareCableReferenceProfile } from './cableApprovedStyleReference.js';

const standard = {
  family: 'vvgng-a-ls', cores: 3, coreColors: ['brown', 'blue', 'yellow-green'],
  visualizationType: 'LAYERED', productType: 'power-cable',
  geometry: 'round', conductorMaterial: 'copper', conductorConstruction: 'solid',
  conductorShape: 'circular', hasOuterJacket: true, shield: true, armor: false,
  specialElements: [],
};

test('screened VVG applies compact stripping and preserves the independently built screen contract', () => {
  const technical = buildCableTechnicalProfile(standard);
  const composition = buildCableCompositionContract(standard);
  expect(composition.insulationExposure).toBe('SCREENED_COMPACT');
  expect(technical.layers.map(layer => layer.role)).toEqual(['outer-jacket', 'screen', 'individual-insulation']);
  expect(technical.screen.type).toBeNull();
  expect(technical.constructionEvidence.placement).toBe('overall screen under outer jacket');
  const rules = selectCableIllustrationRules(standard, technical).map(rule => rule.id);
  expect(rules).toContain('vvg.screened.strip');
  expect(rules).toContain('multi.layout');
  expect(rules).not.toContain('multi.stripping');
  const ordinary = { ...standard, family: 'vvg', shield: false, visualizationType: 'MULTICORE' };
  expect(compareCableReferenceProfile(standard, ordinary)).toBeNull();
  expect(compareCableReferenceProfile(ordinary, standard)).toBeNull();
});

test('FRLS layer allowlist keeps documented mica and PVC, and fill is never inferred from composition', () => {
  const frls = { ...standard, family: 'vvgng-a-frls', shield: false, cores: 1, coreColors: ['brown'],
    visualizationType: 'LAYERED', specialElements: ['fire-barrier'] };
  const technical = buildCableTechnicalProfile(frls);
  expect(technical.layers.map(layer => layer.role)).toEqual([
    'outer-jacket', 'inner-sheath', 'individual-insulation', 'fire-barrier',
  ]);
  expect(technical.fireBarrierPlacement).toBe('around-each-conductor-under-individual-insulation');
  expect(technical.additionalConductors).toEqual([]);
  expect(buildCableCompositionContract(frls, { editTarget: true }).prohibitedChanges).toContain('layer inventory');
});
