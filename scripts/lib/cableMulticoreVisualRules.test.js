import { it, expect } from 'vitest';
import {
  deriveMulticoreStrippingRule as derive,
  multicoreStrippingPrompt,
} from './cableMulticoreVisualRules.js';
it('extends only insulated length for both multicore types', () => {
  for (const visualizationType of ['MULTICORE', 'MULTICORE + LAYERED']) {
    const r = derive({ visualizationType });
    expect(r.insulatedCoreExposedLengthRatio).toEqual({ min: 1.2, max: 1.25 });
    expect(r.bareMetalLengthRatio).toBe(1);
    expect(r.overallScaleRatio).toBe(1);
    expect(multicoreStrippingPrompt(r)).toContain(
      'Keep bare metallic conductor extensions EXACTLY the same length'
    );
    expect(r.constructionSafety).toContain('armor, screen, barrier');
  }
});
it('does not alter SIMPLE or LAYERED and fails closed on explicit construction conflict', () => {
  for (const visualizationType of ['SIMPLE', 'LAYERED']) {
    expect(derive({ visualizationType })).toBeNull();
    expect(multicoreStrippingPrompt(null)).toBe('');
  }
  expect(() =>
    derive({
      visualizationType: 'MULTICORE + LAYERED',
      constructionAllowsExtendedStripping: false,
    })
  ).toThrow('NEEDS_REVIEW');
});
