import { catalogCableSpecs, writeCatalogImageFixture } from './fixtures/cableCatalogFixture.js';
import os from 'node:os';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  loadCableImageStyle,
  prepareCableStyleRequest,
  generateCableStyleDraft,
} from './cableImageStyle.js';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const p = {
  visualizationType: 'SIMPLE',
  family: 'vvg',
  cores: 3,
  coreColors: ['brown', 'blue', 'yellow-green'],
  conductorMaterial: 'copper',
  conductorConstruction: 'solid',
  geometry: 'round',
  conductorShape: 'circular',
  hasOuterJacket: true,
  armor: false,
  shield: false,
  specialElements: [],
};
describe('approved cable style protection', () => {
  it('verifies four immutable refs and selects each image edit input', async () => {
    const s = await loadCableImageStyle(root);
    expect(Object.keys(s.references)).toHaveLength(4);
    for (const type of Object.keys(s.references)) {
      const r = await prepareCableStyleRequest(root, {
        ...p,
        visualizationType: type,
      });
      expect(r.config.imageEndpoint).toBe('edits');
      expect(r.config.referenceImage).toBe(
        path.join(root, s.references[type].path)
      );
      expect(r.model).toBe('gpt-image-2.5-flare');
      expect(r.automaticProductionBinding).toBe(false);
      expect(r.prompt).toContain('EXACTLY 3');
    }
  });
  it('fails closed on reference/config mutation', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-style-'));
    try {
      await fs.cp(
        path.join(root, 'assets/cable-style-reference'),
        path.join(tmp, 'assets/cable-style-reference'),
        { recursive: true }
      );
      await fs.copyFile(
        path.join(root, 'cable-image-style.json'),
        path.join(tmp, 'cable-image-style.json')
      );
      await fs.chmod(
        path.join(tmp, 'assets/cable-style-reference/simple.png'),
        0o644
      );
      await fs.appendFile(
        path.join(tmp, 'assets/cable-style-reference/simple.png'),
        'changed'
      );
      await expect(loadCableImageStyle(tmp)).rejects.toThrow('SHA-256');
      await fs.appendFile(path.join(tmp, 'cable-image-style.json'), ' ');
      await expect(loadCableImageStyle(tmp)).rejects.toThrow('config changed');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
  it('blocks ambiguous/unsupported geometry and contradictory layer types before API', async () => {
    for (const extra of [
      { visualizationType: 'NEEDS_REVIEW' },
      { geometry: 'flat', family: 'unknown-flat-family' },
      { hasOuterJacket: false },
      { cores: 7 },
      { conductorMaterial: null },
      { armor: true, armorType: 'steel-tapes' },
    ])
      await expect(
        prepareCableStyleRequest(root, { ...p, ...extra })
      ).rejects.toThrow('NEEDS_REVIEW');
  });
  it('preserves aluminium and stranded construction instead of copying copper solid reference', async () => {
    const r = await prepareCableStyleRequest(root, {
      ...p,
      conductorMaterial: 'aluminium',
      conductorConstruction: 'stranded',
    });
    expect(r.prompt).toContain('ALUMINIUM');
    expect(r.prompt).toContain('STRANDED');
  });
  it('saves a pending draft and refuses a repeated paid request; mocked provider only', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-claim-test-'));
    const out = path.join(sandbox, 'outputs', 'draft');
    await fs.cp(path.join(root, 'assets'), path.join(sandbox, 'assets'), { recursive: true, filter: file => file === path.join(root, 'assets') || file.startsWith(path.join(root, 'assets/cable-style-reference')) });
    await fs.copyFile(path.join(root, 'cable-image-style.json'), path.join(sandbox, 'cable-image-style.json'));
    const generate = vi.fn(async () => ({
      buffer: await fs.readFile(
        path.join(root, 'assets/cable-style-reference/simple.png')
      ),
      httpStatus: 200,
    }));
    try {
      await writeCatalogImageFixture(sandbox, [{ sku: 'TEST', markFamily: 'ВВГ', cores: 1, specs: catalogCableSpecs }]);
      const args = {
        root: sandbox,
        sku: 'TEST',
        outputDir: out,
        providerFactory: () => ({ generate }),
      };
      const r = await generateCableStyleDraft(args);
      expect(r.status).toBe('NEEDS_REVIEW');
      expect(r.geometryCheck.status).toBe('NEEDS_REVIEW');
      expect(r.geometryCheck.pixelVerification).toBe('NOT_AUTOMATED');
      expect(r.manualChecksRequired).toContain('geometryConsistency');
      expect(r.manualChecksRequired).toContain('metalEndCount');
      expect(r.validation.has_transparency).toBe(true);
      await expect(generateCableStyleDraft({ ...args, outputDir: path.join(sandbox, 'outputs', 'other', 'nested') })).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(sandbox, { recursive: true, force: true });
    }
  });
});
