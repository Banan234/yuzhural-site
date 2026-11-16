import { expect, it } from 'vitest';
import { cableIllustrationRules } from './cableIllustrationRules.js';
import { cableIllustrationDefects, cableIllustrationHold } from './cableIllustrationDefects.js';
import { runCableImageModelComparison } from '../testCableImageModels.js';
import { main as historicalCableReport } from '../generateCableImages.js';

it('keeps unique permanent rule and defect IDs and refuses duplicate blocked PNGs', () => {
  const ruleIds = new Set(cableIllustrationRules.rules.map(rule => rule.id));
  expect(ruleIds.size).toBe(cableIllustrationRules.rules.length);
  const defectIds = new Set();
  const shas = new Set();
  for (const defect of cableIllustrationDefects) {
    expect(defectIds.has(defect.id)).toBe(false);
    defectIds.add(defect.id);
    expect(ruleIds.has(defect.ruleId)).toBe(true);
    expect(Boolean(defect.fixedAt)).toBe(defect.status === 'FIXED_CODE');
    for (const entry of defect.hold ?? []) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(shas.has(entry.sha256)).toBe(false);
      shas.add(entry.sha256);
      expect(cableIllustrationHold(entry.sha256)?.defectId).toBe(defect.id);
    }
  }
});

it('blocks default paid providers in the remaining legacy helper entry points', async () => {
  await expect(runCableImageModelComparison({ config: {}, outputDir: '/unused' }))
    .rejects.toThrow('Legacy live model comparisons are disabled');
  await expect(historicalCableReport(['--all']))
    .rejects.toThrow('Legacy generation/ingest/approval disabled');
});
