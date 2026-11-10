import { it, expect } from 'vitest';
import { prepareCableStyleRequest } from './cableImageStyle.js';
import { withCableStyleSandbox } from './fixtures/cableStyleSandbox.js';
it('allows only the three explicitly authorized consistent current profiles and never copies the common sheath', () =>
  withCableStyleSandbox(async ({ root, classify }) => {
    for (const sku of ['YU-0005011', 'YU-0005219', 'YU-0004818']) {
      const c = classify(sku);
      expect(
        (await prepareCableStyleRequest(root, c.visualProfile))
          .geometryReference.status
      ).toBe('APPROVED');
      const r = await prepareCableStyleRequest(root, c.visualProfile, {
        geometryPilotSku: sku,
      });
      expect(r.geometryPilot.status).toBe('NEEDS_REVIEW');
      expect(r.reference.path).toBe('assets/cable-style-reference/simple.png');
      expect(r.technicalProfile.insulatedCoreCount).toBe(c.visualProfile.cores);
      expect(
        r.technicalProfile.layers.some((l) => l.role === 'outer-jacket')
      ).toBe(c.visualProfile.hasOuterJacket);
      expect(r.technicalProfile.armor.present).toBe(false);
      expect(r.technicalProfile.screen.present).toBe(false);
      expect(r.prompt).toContain('NOT the geometry of the target');
      if (sku === 'YU-0005219') expect(r.prompt).toContain('FLAT');
      if (sku === 'YU-0004818')
        expect(r.prompt).toContain('no SIP-2 construction');
    }
  }));
it('blocks unapproved pilot SKUs and profile tampering', () =>
  withCableStyleSandbox(async ({ root, classify }) => {
    const c = classify('YU-0005011');
    await expect(
      prepareCableStyleRequest(root, c.visualProfile, {
        geometryPilotSku: 'YU-0000689',
      })
    ).rejects.toThrow('NEEDS_REVIEW');
    await expect(
      prepareCableStyleRequest(
        root,
        { ...c.visualProfile, conductorMaterial: 'aluminium' },
        { geometryPilotSku: 'YU-0005011' }
      )
    ).rejects.toThrow('NEEDS_REVIEW');
  }));
