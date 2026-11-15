import { expect, it } from 'vitest';
import { generationEvidenceIssues, rankGenerationQueue, refineGenerationEvidence } from './cableGenerationQueue.js';

const profile = {
  cores: 4, conductorMaterial: 'copper', conductorConstruction: 'stranded',
  conductorShape: 'circular', geometry: 'round', hasOuterJacket: true,
  outerJacket: 'black', armor: false, shield: false, specialElements: [],
  coreColors: ['brown', 'black', 'grey', 'yellow-green'],
};
const classified = {
  visualClassification: 'AUTO_APPROVED',
  visualProfile: profile,
  technicalProfile: { ...profile, outerJacketMaterial: 'rubber' },
};
const technical = {
  innerSheath: { status: 'absent' },
  outerSheath: { status: 'present' },
  interstitialFilling: { status: 'absent' },
};

it('does not treat illustration defaults as verified construction', () => {
  expect(generationEvidenceIssues(classified, technical)).toEqual([]);
  const defaulted = {
    ...classified,
    technicalProfile: { ...classified.technicalProfile, conductorConstruction: null, coreColors: null },
  };
  expect(generationEvidenceIssues(defaulted, technical)).toEqual([
    'unconfirmed-conductorConstruction', 'unconfirmed-core-colors',
  ]);
  expect(generationEvidenceIssues({
    ...classified, evidence: { conductorConstruction: { basis: 'family-section-band' } },
  }, technical)).toContain('unverified-conductor-section-band');
});

it('blocks unknown filling and inner sheath independently', () => {
  expect(generationEvidenceIssues(classified, {
    ...technical, interstitialFilling: { status: 'unknown' },
  })).toEqual(['unconfirmed-interstitial-filling']);
  expect(generationEvidenceIssues(classified, {
    ...technical, innerSheath: { status: 'unknown' },
  })).toEqual(['unconfirmed-inner-sheath']);
});

it('ranks only ready fresh groups by extra coverage, then complexity', () => {
  const group = (visualKey, count, cores, overrides = {}) => ({
    visualKey, additionalSkus: Array.from({ length: count }, (_, index) => 'S' + index),
    profile: { ...profile, cores }, status: 'READY_FOR_GENERATION', ...overrides,
  });
  const queue = rankGenerationQueue([
    group('complex', 5, 10), group('best', 6, 7), group('simple', 5, 3),
    group('pending', 10, 4, { pendingDraft: true }),
    group('covered', 10, 4, { status: 'ALREADY_COVERED' }),
    group('blocked', 10, 4, { status: 'NEEDS_TECHNICAL_REVIEW' }),
  ]);
  expect(queue.map(item => item.visualKey)).toEqual(['best', 'simple', 'complex']);
});

it('recovers only structural fields explicitly sourced for the same execution', () => {
  const row = {
    ...classified,
    familyId: 'specific-execution',
    technicalProfile: { ...classified.technicalProfile, conductorConstruction: null, coreColors: null },
    illustrationDefaults: [
      { field: 'conductorConstruction', value: 'stranded', basis: 'documented-family-structure' },
      { field: 'coreColors', value: profile.coreColors, basis: 'family-catalogue-palette' },
    ],
  };
  const source = { url: 'https://manufacturer.example/datasheet' };
  const rule = { source, structure: { conductorConstruction: 'stranded' } };
  const context = { familyVisualRules: { familyVisualRules: { 'specific-execution': rule } } };
  const refined = refineGenerationEvidence(row, technical, context);
  expect(generationEvidenceIssues(refined.row, refined.technical)).toEqual(['unconfirmed-core-colors']);
  expect(refined.refinements).toHaveLength(1);
  expect(refineGenerationEvidence({ ...row, familyId: 'other' }, technical, context).refinements).toEqual([]);
  expect(refineGenerationEvidence(row, technical, {
    familyVisualRules: { familyVisualRules: { 'specific-execution': { extends: 'base', source } } },
  }).refinements).toEqual([]);
});

it('uses documented direct contact only for its single-core interface', () => {
  const unknown = { ...technical, innerSheath: { status: 'unknown' } };
  const row = { ...classified, visualProfile: { ...profile, family: 'kgvvng-a-ls', cores: 1 } };
  expect(refineGenerationEvidence(row, unknown, {}).technical.innerSheath.status).toBe('absent');
  expect(refineGenerationEvidence({
    ...row, technicalProfile: { ...row.technicalProfile, filler: 'present-unspecified' },
  }, unknown, {}).technical.innerSheath.status).toBe('unknown');
});
