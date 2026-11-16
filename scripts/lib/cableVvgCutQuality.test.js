import { expect, it } from 'vitest';
import rules from '../../data/cableTechnicalConstructionRules.json' with { type: 'json' };
import { cableIllustrationDefects } from './cableIllustrationDefects.js';
import { vvgCutHold, vvgCutPrompt, vvgCutQuality, validateVvgCutRevision } from './cableVvgCutQuality.js';
import { cableGenerationClaimKey } from './cableGenerationClaims.js';

const ordinary = {
  family: 'vvg', cores: 4, coreColors: ['brown','black','grey','yellow-green'],
  productType: 'power-cable', conductorMaterial: 'copper', conductorConstruction: 'solid',
  conductorShape: 'circular', geometry: 'round', hasOuterJacket: true, armor: false,
  shield: false, specialElements: [], visualizationType: 'SIMPLE',
};
const filled = { ...ordinary, technicalConstruction: rules.families.vvgz };

it('separates flush filling from compact packing without adding an inner sheath', () => {
  expect(vvgCutQuality(ordinary).checks).toEqual(['compactPack']);
  expect(vvgCutPrompt(vvgCutQuality(ordinary))).toContain('Do not add filler');
  expect(vvgCutQuality(filled).checks).toEqual(['flushFilling', 'compactPack']);
  expect(vvgCutPrompt(vvgCutQuality(filled))).toContain('same oblique cut plane');
  expect(vvgCutQuality({ ...ordinary, shield: true })).toBeNull();
});

it('keys one targeted retry to the exact held source and rejects a different construction', () => {
  const sourceSha256=cableIllustrationDefects.find(defect=>defect.id==='DEF-VVGZ-001').hold[0].sha256;
  const input={ quality:vvgCutQuality(filled), profile:filled, sourceProfile:filled, sourceSha256 };
  const revision=validateVvgCutRevision(input);
  expect(vvgCutHold(sourceSha256)).toBe(true);
  expect(cableGenerationClaimKey(filled,revision)).not.toBe(cableGenerationClaimKey(filled));
  expect(() => validateVvgCutRevision({ ...input, sourceProfile:ordinary })).toThrow('equivalent construction');
  expect(() => validateVvgCutRevision({ ...input, sourceSha256:'unregistered' })).toThrow('registered source');
});
