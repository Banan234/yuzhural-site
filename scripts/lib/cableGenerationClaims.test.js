import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  cableGenerationClaimKey,
  cableGenerationReservationKey,
  findHistoricalCatalogClaim,
  indexHistoricalCableClaims,
  readCableGenerationClaims,
  reserveCableGeneration,
} from './cableGenerationClaims.js';

it('prevents parallel reservations across batch folders and preserves unknown and confirmed failures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-claims-'));
  try {
    const profile = { family: 'test', cores: 3 };
    const requests = ['a', 'b'].map(batch => ({
      root, profile, outputDir: path.join(root, 'outputs', batch, 'nested'),
    }));
    const reservations = await Promise.all(requests.map(reserveCableGeneration));
    expect(reservations.filter(result => result === null)).toHaveLength(1);
    expect(reservations.find(Boolean).status).toBe('REQUEST_OUTCOME_UNKNOWN');
    const winner = requests[reservations.indexOf(null)];
    await fs.mkdir(winner.outputDir, { recursive: true });
    await fs.writeFile(path.join(winner.outputDir, 'review.json'), JSON.stringify({ status: 'FAILED' }));
    expect(await reserveCableGeneration({ ...winner, outputDir: requests[1].outputDir }))
      .toMatchObject({ status: 'FAILED', draftDir: winner.outputDir });

    const historical = path.join(root, 'outputs', 'archived', 'deep', 'nested', 'draft');
    await fs.mkdir(historical, { recursive: true });
    const previous = { cores: 4, family: 'test' };
    await fs.writeFile(path.join(historical, 'request.json'), JSON.stringify({
      profile: previous, standardVersion: 'approved-cable-style-1.1.0', status: 'requesting',
    }));
    expect((await readCableGenerationClaims(root)).size).toBe(1);
    await indexHistoricalCableClaims(root, { apply: true });
    expect(await reserveCableGeneration({ ...winner, profile: { family: 'test', cores: 4 } }))
      .toMatchObject({ status: 'REQUEST_OUTCOME_UNKNOWN', draftDir: historical });
    expect((await readCableGenerationClaims(root)).size).toBe(2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('keeps old payment holds and SKU evidence after the archived files leave outputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-history-'));
  try {
    const draftDir = path.join(root, 'outputs', 'old-release', 'draft');
    await fs.mkdir(draftDir, { recursive: true });
    await fs.mkdir(path.join(root, 'data/product-image-metadata'), { recursive: true });
    const profile = { family: 'test', cores: 2 };
    await fs.writeFile(path.join(draftDir, 'request.json'), JSON.stringify({
      profile, standardVersion: 'approved-cable-style-1.1.0',
      status: 'requesting', catalogSource: { sku: 'TEST-1' },
    }));
    expect((await readCableGenerationClaims(root)).size).toBe(0);
    await indexHistoricalCableClaims(root, { apply: true });
    const before = await readCableGenerationClaims(root);
    expect(before.size).toBe(1);
    await fs.rename(path.join(root, 'outputs', 'old-release'), path.join(root, 'offline-archive'));

    const after = await readCableGenerationClaims(root);
    expect([...after]).toEqual([...before]);
    await expect(findHistoricalCatalogClaim('TEST-1', { ...profile, cores: 3 }, after))
      .resolves.toMatchObject({ draftDir, status: 'REQUEST_OUTCOME_UNKNOWN' });
    await expect(reserveCableGeneration({ root, profile, outputDir: path.join(root, 'outputs', 'new') }))
      .resolves.toMatchObject({ draftDir, status: 'REQUEST_OUTCOME_UNKNOWN' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('retains an archived payment hold across brands with the same confirmed construction', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-shared-claim-'));
  try {
    const draftDir = path.join(root, 'outputs', 'archive');
    await fs.mkdir(draftDir, { recursive: true });
    const profile = {
      family: 'vvg', visualizationType: 'SIMPLE', geometry: 'round', cores: 2,
      conductorMaterial: 'copper', conductorConstruction: 'solid', conductorShape: 'circular',
      hasOuterJacket: true, coreColors: ['brown', 'blue'], shield: false, armor: false,
      specialElements: [],
    };
    await fs.writeFile(path.join(draftDir, 'request.json'), JSON.stringify({
      profile, standardVersion: 'approved-cable-style-1.1.0', status: 'requesting',
    }));
    await fs.mkdir(path.join(root, 'data/product-image-metadata'), { recursive: true });
    await indexHistoricalCableClaims(root, { apply: true });
    const claims = await readCableGenerationClaims(root);
    const branded = { ...profile, family: 'nyy' };
    await expect(findHistoricalCatalogClaim('OTHER-SKU', branded, claims))
      .resolves.toMatchObject({ draftDir, status: 'REQUEST_OUTCOME_UNKNOWN' });
    await expect(findHistoricalCatalogClaim('OTHER-SKU', { ...branded, coreColors: ['black', 'blue'] }, claims))
      .resolves.toBeNull();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('holds requests when an existing installation loses the historical payment index', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-missing-index-'));
  try {
    const folder = path.join(root, 'data/product-image-metadata/production-v1');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'manifest.json'), '{}');
    await expect(reserveCableGeneration({
      root, profile: { family: 'test', cores: 2 }, outputDir: path.join(root, 'outputs/new'),
    })).rejects.toThrow('Historical cable claims index is missing');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('uses a permanent decision for an indexed draft without reading the archived output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-archived-decision-'));
  try {
    const profile = {
      family: 'vvg', visualizationType: 'SIMPLE', geometry: 'round', cores: 2,
      conductorMaterial: 'copper', conductorConstruction: 'solid', conductorShape: 'circular',
      hasOuterJacket: true, coreColors: ['brown', 'blue'], shield: false, armor: false,
      specialElements: [],
    };
    const oldKey = cableGenerationClaimKey(profile);
    const reservedKey = cableGenerationReservationKey(profile);
    expect(reservedKey).not.toBe(oldKey);
    const outputDir = 'outputs/offline';
    const metadata = path.join(root, 'data/product-image-metadata');
    const sha256 = 'f'.repeat(64);
    const decisionDir = path.join(metadata, 'review-decisions', sha256);
    await reserveCableGeneration({ root, profile, outputDir: path.join(root, outputDir) });
    await fs.writeFile(path.join(metadata, 'historical-generation-claims.json'), JSON.stringify({
      version: 1, claims: [{ key: oldKey, outputDir, status: 'PENDING_REVIEW', draft: { profile } }],
    }));
    await fs.mkdir(decisionDir, { recursive: true });
    await fs.writeFile(path.join(decisionDir, 'decision.json'), JSON.stringify({
      decision: { sha256, status: 'REJECTED' }, claimKey: oldKey, originalDraft: outputDir,
    }));
    expect((await readCableGenerationClaims(root)).get(reservedKey))
      .toMatchObject({ status: 'REJECTED', draftDir: decisionDir });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
