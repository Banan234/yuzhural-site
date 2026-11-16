import { it, expect } from 'vitest';
import path from 'node:path';
import { withCableStyleSandbox } from './fixtures/cableStyleSandbox.js';
import {
  deriveOuterSheathGeometry as derive,
  outerSheathGeometryPrompt,
} from './cableOuterSheathGeometry.js';
import { makeVisualIdentity } from './cableVisualClassification.js';
import { comparePracticalVisualAsset } from './familyVisualRules.js';
import {
  prepareCableStyleRequest,
  generateCableStyleDraft,
} from './cableImageStyle.js';
const base = {
  family: 'example',
  cores: 2,
  hasOuterJacket: true,
  geometry: 'round',
  conductorMaterial: 'copper',
  conductorConstruction: 'stranded',
  coreColors: ['brown', 'blue'],
  coreColorScheme: '2core-brown-blue',
};
it('never infers outer shape from two cores, title, or sheath absence', () => {
  expect(derive(base)).toBe('ROUND');
  expect(derive({ ...base, geometry: 'flat' })).toBe('FLAT');
  expect(derive({ ...base, hasOuterJacket: false })).toBe('NO_COMMON_SHEATH');
  expect(
    derive({ ...base, geometry: null, name: 'плоский кабель 2x0.75' })
  ).toBe('UNKNOWN');
  expect(() => outerSheathGeometryPrompt({ ...base, geometry: null })).toThrow(
    'NEEDS_TECHNICAL_REVIEW'
  );
  expect(() => derive({ ...base, outerSheathGeometry: 'FLAT' })).toThrow(
    'conflicts'
  );
});
it('separates flat/round/no-sheath identity and asset reuse without resetting established keys', () => {
  const round = makeVisualIdentity(base).visualKey,
    flat = makeVisualIdentity({ ...base, geometry: 'flat' }).visualKey,
    none = makeVisualIdentity({ ...base, hasOuterJacket: false }).visualKey;
  expect(new Set([round, flat, none]).size).toBe(3);
  expect(
    makeVisualIdentity({ ...base, outerSheathGeometry: 'ROUND' }).visualKey
  ).toBe(round);
  expect(
    comparePracticalVisualAsset(
      { visualProfile: base, visualClassification: 'AUTO_APPROVED' },
      { visualProfile: { ...base, geometry: 'flat' }, status: 'approved' }
    ).compatible
  ).toBe(false);
});
it('reuses the verified historical PUGV geometry without invoking the provider', () =>
  withCableStyleSandbox(async ({ root, classify }) => {
    const { visualProfile: profile, visualKey } = classify('YU-0005011');
    const r = await prepareCableStyleRequest(root, profile);
    expect(r.outerSheathGeometry).toBe('NO_COMMON_SHEATH');
    expect(r.geometryReference.status).toBe('APPROVED');
    let calls = 0;
    await expect(generateCableStyleDraft({
      root,
      profile,
      visualKey,
      sku: 'YU-0005011',
      outputDir: path.join(root, 'outputs/should-not-generate-pugv'),
      providerFactory: () => {
        calls++;
        throw Error('MUST NOT CALL');
      },
    })).resolves.toMatchObject({status: 'APPROVED_DRAFT_NOT_PUBLISHED'});
    expect(calls).toBe(0);
  }));
it('prepares two exact geometry revisions with previous-image input and no geometry transfer', () =>
  withCableStyleSandbox(async ({ root, classify, editTarget }) => {
    for (const [sku, geometryRevision] of [
      ['YU-0005219', 'tight-flat-sheath'],
      ['YU-0004818', 'compact-sip-ends'],
    ]) {
      const r = await prepareCableStyleRequest(
        root,
        classify(sku).visualProfile,
        {
          geometryPilotSku: sku,
          geometryRevision,
          editTarget,
        }
      );
      expect(r.config.additionalReferenceImages).toHaveLength(1);
      expect(r.geometryRevision).toBe(geometryRevision);
      expect(r.outerSheathGeometry).toBe(
        sku === 'YU-0005219' ? 'FLAT' : 'NO_COMMON_SHEATH'
      );
      expect(r.prompt).toContain('Image 2 is the exact PREVIOUS GENERATION');
    }
  }));
