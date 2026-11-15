import { expect, it } from 'vitest';
import { selectApprovedStyleReference } from './cableApprovedStyleReference.js';
import profiles from './fixtures/cableRequestProfiles.json' with { type: 'json' };

it.each([
  ['YU-0000163', { conductorMaterial: 'aluminium' }],
  ['YU-0004915', { conductorConstruction: 'stranded' }],
  ['YU-0002706', { shield: true }],
  ['YU-0000980', { family: 'vvgng-a-ls' }],
  ['YU-0000838', { family: 'vvgng-a-ls' }],
])('selects a compatible approved reference for %s', async (sku, expected) => {
  const reference = await selectApprovedStyleReference(
    process.cwd(),
    profiles[sku]
  );
  expect(reference.librarySize).toBeGreaterThanOrEqual(11);
  expect(reference.profile).toMatchObject(expected);
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
  }, target).role).toBe('STYLE_ONLY');
  expect(compareCableReferenceProfile({ ...target, visualizationType: 'SIMPLE' }, target).role).toBe('STYLE_ONLY');
  expect(compareCableReferenceProfile({ ...target, conductorShape: 'sector' }, target).role).toBe('STYLE_ONLY');
});
