import { expect, it } from 'vitest';
import { selectCableGenerationReferences } from './cableApprovedStyleReference.js';
import profiles from './fixtures/cableRequestProfiles.json' with { type: 'json' };

it.each([
  ['YU-0000163', { conductorMaterial: 'aluminium' }],
  ['YU-0004915', { conductorConstruction: 'stranded' }],
  ['YU-0002706', { shield: true }],
  ['YU-0000980', { family: 'vvgng-a-ls' }],
  ['YU-0000838', { family: 'vvgng-a-ls' }],
])('selects a compatible approved reference for %s', async (sku, expected) => {
  const reference = await selectCableGenerationReferences(
    process.cwd(),
    profiles[sku]
  );
  expect(reference.librarySize).toBeGreaterThanOrEqual(11);
  const primary = reference.selected.find(entry => entry.role === 'FAMILY_PRIMARY');
  if (sku === 'YU-0002706' && !primary) {
    expect(reference.selected.every(entry => entry.role === 'GEOMETRY_MATCH')).toBe(true);
  } else {
    expect(primary?.profile).toMatchObject(expected);
  }
});

it('keeps exact four-core geometry above a same-family three-core reference', async () => {
  const { compareCableReferenceProfile } = await import('./cableApprovedStyleReference.js');
  const target = {
    ...profiles['YU-0000838'],
    cores: 4,
    coreColors: ['brown', 'black', 'grey', 'yellow-green'],
    visualizationType: 'MULTICORE',
  };
  expect(compareCableReferenceProfile({ ...target, section: 10 }, target).role).toBe('GEOMETRY_MATCH');
  expect(compareCableReferenceProfile({
    ...target, cores: 3, coreColors: target.coreColors.slice(0, 3),
  }, target).role).toBe('LAYOUT_REFERENCE');
  expect(compareCableReferenceProfile({ ...target, visualizationType: 'SIMPLE' }, target).role).toBe('SHEATH_REFERENCE');
  expect(compareCableReferenceProfile({ ...target, conductorShape: 'sector' }, target).role).toBe('STYLE_ONLY');
  expect(compareCableReferenceProfile({
    ...target,
    technicalConstruction: {
      source: 'fixture', armor: false, screen: false, fireBarrier: false, innerSheath: 'PVC',
    },
  }, target)).toBeNull();
});

it('never treats ordinary VVG and confirmed filled VVGz as interchangeable geometry', async () => {
  const { compareCableReferenceProfile } = await import('./cableApprovedStyleReference.js');
  const { getVvgIllustrationSignature } = await import('./cableVvgIllustration.js');
  const { makeVisualIdentity } = await import('./cableVisualClassification.js');
  const { default: rules } = await import('../../data/cableTechnicalConstructionRules.json', { with: { type: 'json' } });
  const ordinary = { ...profiles['YU-0000838'], family: 'vvgng' };
  const filled = { ...ordinary, technicalConstruction: rules.families.vvgz };
  expect(compareCableReferenceProfile(filled, ordinary)).toBeNull();
  expect(compareCableReferenceProfile(ordinary, filled).role).toBe('LAYOUT_REFERENCE');
  expect(compareCableReferenceProfile(filled, filled).role).toBe('GEOMETRY_MATCH');
  expect(getVvgIllustrationSignature(ordinary)).not.toBe(getVvgIllustrationSignature(filled));
  expect(makeVisualIdentity(ordinary).visualKey).not.toBe(makeVisualIdentity(filled).visualKey);
});

it('matches geometry when an omitted inner sheath is undocumented on one side, but rejects a visible extra sheath', async () => {
  const { compareCableReferenceProfile } = await import('./cableApprovedStyleReference.js');
  const target = profiles['YU-0000838'];
  const construction = { source: 'catalog-construction-1', armor: false, screen: false, fireBarrier: false };
  expect(compareCableReferenceProfile({ ...target, technicalConstruction: { ...construction, innerSheath: false } }, target).role)
    .toBe('GEOMETRY_MATCH');
  expect(compareCableReferenceProfile({ ...target, technicalConstruction: { ...construction, innerSheath: 'PVC' } }, target))
    .toBeNull();
});

it('keeps automatic cross-family references limited to geometry', async () => {
  const target = profiles['YU-0000838'];
  const local = await selectCableGenerationReferences(process.cwd(), target);
  expect(local.selected.length).toBeGreaterThan(0);
  const foreign = await selectCableGenerationReferences(process.cwd(), { ...target, family: 'other-technical-family' });
  expect(foreign.selected.every(reference => reference.role === 'GEOMETRY_MATCH')).toBe(true);
});
