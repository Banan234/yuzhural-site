import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  deriveCableCoreGeometry,
  coreGeometryPrompt,
  CORE_GEOMETRY_REVIEW_CHECKS,
  CABLE_STYLE_REVIEW_CHECKS,
  CABLE_STYLE_REVIEW_LABELS,
} from './cableCoreGeometry.js';
import {
  prepareCableStyleRequest,
  loadCableImageStyle,
} from './cableImageStyle.js';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const profile = {
  visualizationType: 'SIMPLE',
  family: 'avvgng-a-ls',
  cores: 4,
  coreColors: ['brown', 'black', 'grey', 'yellow-green'],
  geometry: 'round',
  conductorShape: 'circular',
  conductorMaterial: 'aluminium',
  conductorConstruction: 'solid',
  hasOuterJacket: true,
  armor: false,
  shield: false,
  specialElements: [],
};
describe('permanent 1.1 core geometry contract', () => {
  it.each([
    [3, 1.5],
    [4, 4],
    [5, 2.5],
    [7, 1.5],
    [27, 1],
  ])(
    '%i×%s uses one common diameter without global scale changes',
    (cores, section) => {
      const result = deriveCableCoreGeometry(
        { ...profile, cores },
        { section }
      );
      expect(result.mode).toBe('UNIFORM');
      expect(result.metalDiameterGroups).toEqual([
        { count: cores, relativeDiameter: 1 },
      ]);
      expect(result.expectedMetalEndCount).toBe(cores);
      expect(result.expectedInsulatedCoreCount).toBe(cores);
      expect(result.globalScale).toBe('UNCHANGED_REFERENCE_SCALE');
      expect(result.automaticApproval).toBe(false);
      expect(result.pixelVerification).toBe('NOT_AUTOMATED');
    }
  );
  it.each([
    [3, 95, 1, 50],
    [3, 240, 1, 120],
    [4, 185, 1, 95],
  ])(
    'mixed %i×%s + %i×%s uses diameter sqrt(section ratio)',
    (main, section, aux, auxSection) => {
      const result = deriveCableCoreGeometry(
        { ...profile, cores: main + aux },
        {
          sectionGroups: [
            { count: main, section },
            { count: aux, section: auxSection },
          ],
        }
      );
      expect(result.mode).toBe('MIXED');
      expect(result.metalDiameterGroups).toEqual([
        { count: main, relativeDiameter: 1 },
        { count: aux, relativeDiameter: Math.sqrt(auxSection / section) },
      ]);
      expect(result.metalDiameterGroups[1].relativeDiameter).not.toBe(
        auxSection / section
      );
      expect(coreGeometryPrompt(result)).toContain('DIAMETERS');
      expect(result.insulationOuterDiameterRule).toContain('Do not infer');
    }
  );
  it('50/95 is approximately 72.5 percent and a common scaling of all sections changes nothing', () => {
    const a = deriveCableCoreGeometry(profile, {
        sectionGroups: [
          { count: 3, section: 95 },
          { count: 1, section: 50 },
        ],
      }),
      b = deriveCableCoreGeometry(profile, {
        sectionGroups: [
          { count: 3, section: 190 },
          { count: 1, section: 100 },
        ],
      });
    expect(a.metalDiameterGroups[1].relativeDiameter).toBeCloseTo(0.725476, 6);
    expect(b.metalDiameterGroups).toEqual(a.metalDiameterGroups);
  });
  it('equal sizes in multiple technical groups still use equal diameters', () => {
    const r = deriveCableCoreGeometry(profile, {
      sectionGroups: [
        { count: 3, section: 4 },
        { count: 1, section: 4 },
      ],
    });
    expect(r.mode).toBe('UNIFORM');
    expect(r.metalDiameterGroups.every((g) => g.relativeDiameter === 1)).toBe(
      true
    );
  });
  it('does not assume a missing mixed section, negative area, sector geometry or different construction', () => {
    for (const groups of [
      [{ count: 3, section: 95 }, { count: 1 }],
      [
        { count: 3, section: 95 },
        { count: 1, section: 0 },
      ],
      [
        { count: 3, section: 95 },
        { count: 1, section: -1 },
      ],
      [
        { count: 3, section: 95 },
        { count: 1, section: Infinity },
      ],
      [
        { count: 3, section: 95 },
        { count: 2, section: 50 },
      ],
      [
        { count: 3, section: 95 },
        { count: 1, section: 50, conductorShape: 'sector' },
      ],
      [
        { count: 3, section: 95 },
        { count: 1, section: 50, conductorConstruction: 'stranded' },
      ],
    ])
      expect(
        deriveCableCoreGeometry(profile, { sectionGroups: groups }).status
      ).toBe('NEEDS_REVIEW');
    expect(
      deriveCableCoreGeometry({
        ...profile,
        coreLayout: { auxiliarySize: 'reduced' },
      }).status
    ).toBe('NEEDS_REVIEW');
  });
  it('preserves stranded structure and never interprets individual strands as cores', () => {
    const r = deriveCableCoreGeometry({
      ...profile,
      conductorConstruction: 'stranded',
    });
    expect(r.expectedInsulatedCoreCount).toBe(4);
    expect(r.conductorConstruction).toBe('stranded');
    expect(coreGeometryPrompt(r)).toContain('Keep stranded construction');
  });
  it('injects equal diameter and centred cylindrical metal constraints into every request', async () => {
    const r = await prepareCableStyleRequest(root, profile);
    expect(r.standardVersion).toBe('approved-cable-style-1.1.0');
    expect(r.geometryRequirements.expectedMetalEndCount).toBe(4);
    expect(r.prompt).toContain('SAME-diameter');
    expect(r.prompt).toContain('CENTRE');
    expect(r.prompt).toContain('no swelling');
    expect(r.model).toBe('gpt-image-2.5-flare');
    expect(r.endpoint).toBe('images/edits');
    expect(r.config.background).toBe('transparent');
    expect(r.qualityStatus).toBe('NEEDS_REVIEW');
  });
  it('does not unlock unreviewed mixed profiles just because a ratio is calculable', async () => {
    await expect(
      prepareCableStyleRequest(root, {
        ...profile,
        coreLayout: {
          primaryCores: 3,
          auxiliaryCores: 1,
          auxiliarySize: 'reduced',
        },
      })
    ).rejects.toThrow('NEEDS_REVIEW');
    await expect(
      prepareCableStyleRequest(root, profile, {
        geometryInput: {
          sectionGroups: [
            { count: 3, section: 95 },
            { count: 1, section: 50 },
          ],
        },
      })
    ).rejects.toThrow('NEEDS_REVIEW');
  });
  it('requires explicit geometry review and preserves all four PNGs and the previous composition rules', async () => {
    const s = await loadCableImageStyle(root),
      old = JSON.parse(
        await fs.readFile(
          path.join(
            root,
            'assets/cable-style-reference/history/approved-cable-style-1.0.0.json'
          )
        )
      );
    expect(s.references).toEqual(old.references);
    for (const k of [
      'model',
      'provider',
      'baseUrl',
      'endpoint',
      'composition',
      'postprocessing',
      'constraints',
      'allowedChanges',
    ])
      expect(s[k]).toEqual(old[k]);
    expect(s.geometry.mixedSections.formula).toBe('d2 / d1 = sqrt(S2 / S1)');
    expect(s.qualityGate.requiredGeometryChecks).toEqual(
      CORE_GEOMETRY_REVIEW_CHECKS
    );
    expect(CABLE_STYLE_REVIEW_CHECKS.length).toBe(
      CABLE_STYLE_REVIEW_LABELS.length
    );
    expect(CABLE_STYLE_REVIEW_CHECKS).toContain('metalEndCount');
  });
});
