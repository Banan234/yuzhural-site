import profiles from './fixtures/cableRequestProfiles.json' with { type: 'json' };
import { it, expect } from 'vitest';
import { deriveStrippingCompositionPreference } from './cableStrippingComposition.js';
import { prepareCableStyleRequest } from './cableImageStyle.js';
it('is conditional on a confirmed common sheath and safe multi-core anatomy', () => {
  for (const p of [
    { cores: 3, hasOuterJacket: false },
    { cores: 1, hasOuterJacket: true },
    { cores: 3 },
    {
      cores: 3,
      hasOuterJacket: true,
      constructionAllowsExtendedStripping: false,
    },
  ])
    expect(deriveStrippingCompositionPreference(p)).toBeNull();
  expect(
    deriveStrippingCompositionPreference({ cores: 3, hasOuterJacket: true })
      .insulatedCoreExposedLengthRatio
  ).toEqual({ min: 1.2, max: 1.3 });
});
it('passes the preference into real SIMPLE and MULTICORE requests without stacking amendments', async () => {
  for (const type of ['SIMPLE', 'MULTICORE']) {
    const r = await prepareCableStyleRequest(process.cwd(), profiles[type]);
    expect(r.prompt).toContain('FUTURE COMMON-SHEATH COMPOSITION PREFERENCE');
    expect(r.prompt).toContain('Keep bare metal length unchanged');
    expect(r.prompt).not.toContain('PERMANENT MULTICORE STRIPPING AMENDMENT');
    expect(r.strippingComposition.overallScaleRatio).toBe(1);
  }
});
