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
