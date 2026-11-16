import { cableVisibleConstructionKey } from './cableReferenceCompatibility.js';
import { cableReferenceGroupId } from './cableGroupReferences.js';
import { expect, test } from 'vitest';

const circular = {
  family: 'test', visualizationType: 'SIMPLE', geometry: 'round', cores: 2,
  hasOuterJacket: true, conductorMaterial: 'copper', conductorConstruction: 'solid',
  conductorShape: 'circular', coreColors: ['brown', 'blue'], armor: false, shield: false,
  specialElements: [],
};
test('groups polymer variants across marks while preserving conductor colors', () => {
  const profile = outerMaterial => ({ ...circular, technicalConstruction: {
    source: 'catalog-construction-1', screen: false, armor: false, fireBarrier: false, outerMaterial,
  } });
  const pvc = profile('PVC');
  expect(cableReferenceGroupId(pvc)).toBe(cableReferenceGroupId(profile('PE')));
  expect(cableReferenceGroupId(pvc)).toBe(cableReferenceGroupId({ ...pvc, family: 'other' }));
  expect(cableReferenceGroupId(pvc)).not.toBe(cableReferenceGroupId({ ...pvc, coreColors: ['black', 'blue'] }));
});

test('distinguishes a common screen from shielding around pairs', () => {
  const common = { ...circular, shield: true, visualizationType: 'LAYERED', family: 'kvvg',
    technicalConstruction: { source: 'catalog-construction-1', screen: true, armor: false, fireBarrier: false,
      screenPlacement: 'under-outer-jacket' } };
  const pairs = { ...common, pairedGroupSize: 2,
    technicalConstruction: { ...common.technicalConstruction, screenPlacement: 'each-pair' } };
  expect(cableReferenceGroupId(common)).not.toBe(cableReferenceGroupId(pairs));
});

test('groups ordinary, ng, ng(A), LS and cold-resistant markings while preserving visible differences', () => {
  const profiles = ['kvvg','kvvgng','kvvgng-a','kvvgng-a-ls','kvvgng-a-hl'];
  const compatibleFive = profiles.map(family=>({...circular,family,cores:5,coreColors:Array(5).fill('black')}));
  expect(new Set(compatibleFive.map(cableReferenceGroupId)).size).toBe(1);
  expect(cableReferenceGroupId({...compatibleFive[0],shield:true,visualizationType:'MULTICORE + LAYERED'}))
    .not.toBe(cableReferenceGroupId(compatibleFive[0]));
  const ordinary = compatibleFive[0];
  const fire = { ...ordinary, family:'kvvgng-a-frls', specialElements:['fire-barrier'],
    technicalConstruction:{source:'catalog-construction-1', screen:false, armor:false, fireBarrier:true,
      fireBarrierMaterial:'mica-containing-tapes', fireBarrierPlacement:'around-each-conductor-under-individual-insulation'} };
  expect(cableReferenceGroupId(ordinary)).not.toBe(cableReferenceGroupId(fire));
});

test('uses one anatomy for gallery and queue across rendering types, preserving the original technical profiles', () => {
  const plain = {...circular,family:'kvvg',cores:4,coreColors:Array(4).fill('black')};
  const ls = {...plain,family:'kvvgng-a-ls',visualizationType:'MULTICORE'};
  expect(cableVisibleConstructionKey(ls)).toBe(cableVisibleConstructionKey(plain));
  expect(cableReferenceGroupId(ls)).toBe(cableReferenceGroupId(plain));
  expect(cableVisibleConstructionKey({...ls,family:'vvgng-a-ls'})).not.toBe(cableVisibleConstructionKey(plain));
});

test('ignores execution, nominal size, voltage and maker while preserving visible anatomy', () => {
  const family = ['kvvg','kvvgng-b-hf-uhl','kvvgng-c-ls-ltx-hl','КВВГнг(В)-HF-УХЛ','КВВГ-УХЛ4'];
  const variants = family.map((name,index)=>({...circular,family:name,sectionKey:'section-'+index,
    crossSection:index+1,voltage:100*index,manufacturer:'maker-'+index}));
  expect(new Set(variants.map(cableReferenceGroupId)).size).toBe(1);
  const reference = cableReferenceGroupId(variants[0]);
  for (const difference of [
    {geometry:'flat'}, {conductorConstruction:'stranded'}, {shield:true,visualizationType:'LAYERED'},
    {cores:3,coreColors:['brown','blue','black']}, {family:'avvg',conductorMaterial:'aluminium'},
  ]) expect(cableReferenceGroupId({...variants[0],...difference})).not.toBe(reference);
});

test('cross-brand sharing requires known anatomy and preserves physical screen distinctions', () => {
  const plain = {...circular, family:'vvg'};
  const branded = {...plain,family:'nyy'};
  const shielded = {...plain,shield:true,visualizationType:'LAYERED',shieldType:'foil'};
  expect(cableReferenceGroupId(plain)).toBe(cableReferenceGroupId(branded));
  expect(cableReferenceGroupId({...branded,schematicAssumptions:{cores:'estimated'}}))
    .not.toBe(cableReferenceGroupId(plain));
  expect(cableReferenceGroupId({...branded,coreColors:['neutral grey','neutral grey']}))
    .not.toBe(cableReferenceGroupId(plain));
  expect(cableReferenceGroupId({...shielded,family:'nyy',shieldType:'braid'}))
    .not.toBe(cableReferenceGroupId(shielded));
});

test('keeps explicit VVGz filling distinct from ordinary VVG and rejects unrelated unresolved modifiers', async () => {
  const { getVvgProductIllustrationProfile, getVvgIllustrationSignature } =
    await import('./cableVvgIllustration.js');
  const { buildCableTechnicalProfile } = await import('./cableTechnicalProfile.js');
  const visualProfile = {
    ...circular, cores: 4, coreColors: ['brown', 'black', 'grey', 'yellow-green'], family: 'vvg', productType: 'power-cable',
    conductorConstruction: 'solid', unresolvedModifiers: ['З'],
  };
  const row = {
    baseFamily: 'ВВГ', visualProfile, technicalProfile: {},
    issues: [{ code: 'unverified_modifier' }],
    visualClassification: 'needs_review',
  };
  const product = { crossSection: 6 };
  const filled = getVvgProductIllustrationProfile(product, row);
  const ordinary = { ...visualProfile, unresolvedModifiers: [], visualizationType: 'SIMPLE' };
  expect(buildCableTechnicalProfile(filled).layers.map(layer => layer.role))
    .toEqual(['outer-jacket', 'interstitial-filling', 'individual-insulation']);
  expect(getVvgIllustrationSignature(filled)).not.toBe(getVvgIllustrationSignature(ordinary));
  expect(getVvgProductIllustrationProfile(product, { ...row, visualProfile: {
    ...visualProfile, unresolvedModifiers: ['З', 'FR'],
  } })).toBeNull();
  const spacedProduct = { ...product, markFamily: 'ВВГ', name: 'ВВГз 3х25',
    sourceName: 'ВВГ з  3х 25', crossSection: 25 };
  const spaced = { ...row, visualProfile: { ...visualProfile, unresolvedFamilySuffix: 'З' },
    issues: [...row.issues, { code: 'unknown_family' }, { code: 'unverified_family_suffix' }] };
  expect(getVvgIllustrationSignature(getVvgProductIllustrationProfile(spacedProduct, spaced)))
    .toBe(getVvgIllustrationSignature(filled));
  expect(getVvgProductIllustrationProfile({ ...spacedProduct, name: 'ВВГ 3х25' }, spaced)).toBeNull();
  expect(getVvgProductIllustrationProfile({ crossSection: 70 }, row)).toBeNull();
});
