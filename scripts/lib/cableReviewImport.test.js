import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { cableReviewExportVersion, importCableReviewDecisions } from './cableReviewImport.js';
import { cableStyleReviewRequirements, digest } from './cableStyleBatch.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { cableGenerationClaimKey, readCableGenerationClaims } from './cableGenerationClaims.js';

const source = fileURLToPath(new URL('../..', import.meta.url));
let root;
afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-review-'));
  for (const name of ['assets/cable-style-reference', 'cable-image-style.json']) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.cp(path.join(source, name), path.join(root, name), { recursive: true });
  }
  const draftDir = 'outputs/test';
  const dir = path.join(root, draftDir);
  await fs.mkdir(dir, { recursive: true });
  const profile = {
    family: 'vvg', productType: 'power-cable', visualizationType: 'SIMPLE',
    geometry: 'round', conductorShape: 'circular', cores: 1,
    conductorMaterial: 'copper', conductorConstruction: 'solid',
    coreColors: ['brown'], hasOuterJacket: true, outerJacket: 'black',
    armor: false, shield: false, specialElements: [],
  };
  const group = { status: 'NEEDS_REVIEW', standardVersion: 'approved-cable-style-1.1.0',
    visualKey: 'test-key', profile };
  const png = new PNG({ width: 40, height: 40 });
  for (let y = 12; y < 28; y++) for (let x = 5; x < 40; x++) png.data[(y * 40 + x) * 4 + 3] = 255;
  const image = PNG.sync.write(png);
  await fs.writeFile(path.join(dir, 'image.png'), image);
  await fs.writeFile(path.join(dir, 'group.json'), JSON.stringify(group));
  const row = { draftDir, visualKey: group.visualKey, sha256: digest(image), previous: null,
    action: 'KEEP_PENDING', note: '' };
  const payload = { version: cableReviewExportVersion, reviewer: 'Offline reviewer', decisions: [row] };
  return { row, payload, group, dir, key: cableGenerationClaimKey(profile) };
}

test('JSON preview does not write; correction and rejection survive deletion and refuse stale decisions', async () => {
  const { row, payload, dir, key } = await fixture();
  expect(await importCableReviewDecisions({ root, payload })).toHaveLength(1);
  expect(await loadCableReviewDecisions(root)).toEqual([]);
  await importCableReviewDecisions({ root, payload, apply: true });
  const [first] = await loadCableReviewDecisions(root);
  expect((await readCableGenerationClaims(root, key)).get(key).status).toBe('PENDING_REVIEW');
  row.action = 'NEEDS_CORRECTION';
  row.note = 'Loose conductors';
  await expect(importCableReviewDecisions({ root, payload })).rejects.toThrow('stale');
  row.previous = digest(first.decision);
  await importCableReviewDecisions({ root, payload, apply: true });
  await fs.rm(dir, { recursive: true });
  const [second] = await loadCableReviewDecisions(root);
  expect(second.previous[0].disposition).toBe('KEEP_PENDING');
  expect((await readCableGenerationClaims(root, key)).get(key).status).toBe('HELD_DEFECT');
  Object.assign(row, { action: 'REJECT', previous: digest(second.decision) });
  await importCableReviewDecisions({ root, payload, apply: true });
  const [last] = await loadCableReviewDecisions(root);
  expect(last.previous.map(entry => entry.disposition)).toEqual(['KEEP_PENDING', 'NEEDS_CORRECTION']);
  expect((await readCableGenerationClaims(root, key)).get(key).status).toBe('REJECTED');
  Object.assign(row, { action: 'APPROVE', previous: digest(last.decision) });
  await expect(importCableReviewDecisions({ root, payload })).rejects.toThrow('Explicit reopening');
});

test('approval requires the existing checks and archives the exact PNG without catalog rights by default', async () => {
  const { row, payload, group } = await fixture();
  row.action = 'APPROVE';
  await expect(importCableReviewDecisions({ root, payload })).rejects.toThrow('All manual checks');
  row.checks = Object.fromEntries(cableStyleReviewRequirements(group).required.map(key => [key, true]));
  const [record] = await importCableReviewDecisions({ root, payload, apply: true });
  expect(record.APPROVED_FOR_CATALOG).toBe(false);
  expect(record.APPROVED_AS_REFERENCE).toBe(false);
  const registry = JSON.parse(await fs.readFile(path.join(root, 'data/cable-approved-results/registry.json')));
  expect(registry.byVisualKey).toEqual({});
  expect(registry.alternativesBySha256[row.sha256].status).toBe('APPROVED');
  const [saved] = await loadCableReviewDecisions(root);
  expect(saved.decision.sha256).toBe(row.sha256);
});
