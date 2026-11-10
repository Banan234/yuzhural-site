import { it, expect } from 'vitest';
import {
  buildCableTechnicalProfile as build,
  technicalProfilePrompt,
} from './cableTechnicalProfile.js';
const base = {
  family: 'kvvgeng-a-frls',
  cores: 7,
  coreColors: Array(7).fill('black'),
  conductorMaterial: 'copper',
  conductorConstruction: 'solid',
  armor: false,
  shield: true,
  shieldType: 'overall-foil-with-drain',
  specialElements: ['fire-barrier'],
};
it('separates documented copper screen and per-core mica from armor', () => {
  const t = build(base);
  expect(t.armor.present).toBe(false);
  expect(t.layers.some((x) => x.role === 'armor')).toBe(false);
  expect(t.layers.find((x) => x.role === 'fire-barrier').scope).toBe(
    'each-core-under-individual-insulation'
  );
  expect(t.additionalConductors).toHaveLength(0);
  expect(t.screenType).toBe('copper-foil');
  expect(t.fireBarrierMaterial).toBe('mica-containing-tapes');
  expect(t.fireBarrierPlacement).toBe(
    'around-each-conductor-under-individual-insulation'
  );
  expect(t.cores).toHaveLength(7);
  expect(t.verification.status).toBe('NEEDS_REVIEW');
  expect(technicalProfilePrompt(t)).toContain('ABSOLUTELY NO ARMOR');
});
it('maps exactly ten aluminum cores to ten ends, never eleven', () => {
  const t = build({
    ...base,
    family: 'akvvg',
    cores: 10,
    coreColors: Array(10).fill('black'),
    conductorMaterial: 'aluminium',
    shield: false,
    shieldType: null,
    specialElements: [],
  });
  expect(t.coreMetalEndCount).toBe(10);
  expect(new Set(t.cores.map((c) => c.metalEndId)).size).toBe(10);
  expect(t.cores.every((c) => c.relativeDiameter === 1)).toBe(true);
});
it('maps five armored cores without copying reference count', () => {
  const t = build({
    ...base,
    family: 'vbshvng-a-ls',
    cores: 5,
    coreColors: ['brown', 'black', 'grey', 'blue', 'yellow-green'],
    armor: true,
    armorType: 'steel-tapes',
    shield: false,
    shieldType: null,
    specialElements: [],
  });
  expect(t.coreMetalEndCount).toBe(5);
  expect(t.layers.filter((x) => x.role === 'armor')).toHaveLength(1);
});
it('blocks unknown or conflicting construction before request', () => {
  for (const extra of [
    { armorType: 'steel-tapes' },
    { specialElements: ['unknown'] },
    { family: 'unknown' },
    { cores: 8 },
  ])
    expect(() => build({ ...base, ...extra })).toThrow('NEEDS_REVIEW');
});

it('requires visibly exposed mica tape and blocks undocumented FRLS', () => {
  const t = build(base);
  expect(technicalProfilePrompt(t)).toContain(
    'not merely a flat pale end ring'
  );
  expect(() => build({ ...base, family: 'other-frls' })).toThrow(
    'NEEDS_REVIEW'
  );
});
it('allows five manufacturer-confirmed screen constructions without forcing a mesh', () => {
  for (const screenType of [
    'copper-wire-braid',
    'copper-tape',
    'copper-foil',
    'aluminium-foil',
    'alumoflex',
  ]) {
    const t = build({
      ...base,
      family: 'documented-other',
      specialElements: [],
      technicalConstruction: {
        fireBarrier: false,
        screen: true,
        screenType,
        armor: false,
        source: 'https://manufacturer.example/datasheet',
        drainWire: false,
      },
    });
    expect(t.screenType).toBe(screenType);
    expect(t.screenVisualStandard.visualType).toBe('silver-mesh-foil');
    expect(t.screenRendering).toBe(build(base).screenRendering);
    expect(t.layers.some((l) => l.role === 'armor')).toBe(false);
  }
});

it('distinguishes electromagnetic foil from mechanical armor and rejects a cylinder', () => {
  const t = build(base);
  expect(t.screenFunction).toBe('electromagnetic-screening');
  expect(t.armorFunction).toBe(null);
  expect(t.screenRendering).toContain('silver-metallic');
  expect(t.screenVisualStandard.materialClaim).toBe(false);
  expect(technicalProfilePrompt(t)).toContain('Never infer screen or armor');
});

it('keeps screen and armor separate without changing cores or mica', () => {
  const t = build({
    ...base,
    armor: true,
    armorType: 'steel-tapes',
    technicalConstruction: {
      fireBarrier: true,
      fireBarrierMaterial: 'mica-containing-tapes',
      fireBarrierPlacement: 'around-each-conductor-under-individual-insulation',
      screen: true,
      screenType: 'copper-tape',
      armor: true,
      source: 'https://manufacturer.example/datasheet',
    },
  });
  expect(t.layers.filter((l) => l.role === 'screen')).toHaveLength(1);
  expect(t.layers.filter((l) => l.role === 'armor')).toHaveLength(1);
  expect(t.layers.find((l) => l.role === 'screen').visualType).toBe(
    'silver-mesh-foil'
  );
  expect(t.layers.find((l) => l.role === 'armor').appearance).toContain(
    'steel armor'
  );
  expect(t.conductorMaterial).toBe('copper');
  expect(t.fireBarrier).toBe(true);
  expect(t.cores).toHaveLength(7);
});
it('allows known screen presence without inventing unknown actual screen type', () => {
  const t = build({
    ...base,
    family: 'other-screened',
    shieldType: null,
    specialElements: [],
  });
  expect(t.screenType).toBe(null);
  expect(t.screen.present).toBe(true);
  expect(t.screenVisualStandard.mode).toBe('symbolic-catalog-illustration');
  const no = build({
    ...base,
    family: 'akvvg',
    shield: false,
    shieldType: null,
    specialElements: [],
  });
  expect(no.screenVisualStandard).toBe(null);
  expect(no.layers.some((l) => l.role === 'screen')).toBe(false);
});

it('preserves catalogue-confirmed drain wire when no manufacturer override exists', () => {
  const t = build({
    ...base,
    family: 'kvvgeng-a-ls',
    specialElements: ['drain-wire'],
  });
  expect(t.additionalConductors).toEqual([
    { role: 'screen-drain', count: 1, insulated: false },
  ]);
  expect(t.coreMetalEndCount).toBe(7);
  expect(technicalProfilePrompt(t)).toContain(
    'Exactly ONE documented thin bare screen drain'
  );
});
