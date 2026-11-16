import { expect, test } from 'vitest';
import { buildCableCompositionContract } from './cableCompositionContract.js';
import { deriveMulticoreComposition } from './cableMulticoreComposition.js';

test.each([
  [{ cores: 3 }, false],
  [{ cores: 4 }, true],
  [{ cores: 4, coreLayout: { primaryCores: 3, auxiliaryCores: 1 } }, false],
  [{ cores: 4, pairedGroupSize: 2 }, false],
  [{ cores: 4, geometry: 'flat' }, false],
  [{ cores: 4, conductorShape: 'sector' }, false],
  [{ cores: 5 }, false],
])('only equal round four-core profiles receive the two-pair layout (%j)', (fields, four) => {
  const profile = { visualizationType: 'MULTICORE + LAYERED', family: 'vbshvng-a-hl', geometry: 'round',
    conductorShape: 'circular', ...fields };
  expect(buildCableCompositionContract(profile).layout.includes('two staggered pairs')).toBe(four);
  expect(deriveMulticoreComposition(profile).bundle.includes('all four metal faces')).toBe(four);
});
