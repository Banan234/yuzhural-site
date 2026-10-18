import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import {
  buildVisualProfilePrompt,
  makeProductionPlan,
  runVisualProduction,
  writeProductionJson,
} from './cableVisualProduction.js';
import { getGeneratedProductImage } from '../../shared/productImages.js';

const profile = {
  family: 'vvg',
  productType: 'power-cable',
  cores: 3,
  coreColors: ['brown', 'blue', 'yellow-green'],
  conductorConstruction: 'solid',
  conductorMaterial: 'copper',
  conductorShape: 'circular',
  geometry: 'round',
  hasOuterJacket: true,
  outerJacket: 'black',
  armor: false,
  shield: false,
  specialElements: [],
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
function png(opaque = false) {
  const p = new PNG({ width: 96, height: 64 });
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 4;
      p.data[i] = 200;
      p.data[i + 3] =
        opaque || (x > 12 && x < 84 && y > 24 && y < 40) ? 255 : 0;
    }
  return PNG.sync.write(p);
}
async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cable-production-test-')
  );
  const config = {
    catalogFile: path.join(root, 'products.json'),
    manifestFile: path.join(root, 'shared/manifest.json'),
    metadataDir: path.join(root, 'metadata'),
    concurrency: 2,
    background: 'transparent',
    size: '1536x1024',
    composition: { rightEdgeCrop: false },
  };
  const products = [1, 2].map((n) => ({
    id: n,
    sku: `TEST-${n}`,
    name: `ВВГ 3х${n}`,
    sourceName: `ВВГ 3х${n}`,
    cores: 3,
    crossSection: n,
  }));
  await fs.writeFile(config.catalogFile, JSON.stringify(products));
  await writeProductionJson(config.manifestFile, {
    schemaVersion: 1,
    bySku: { 'REVIEW-1': { image: '/keep.png' } },
  });
  const group = {
    visualKey: 'vvg__3c__test',
    action: 'MISSING',
    image: '/product-images/generated/pr1_vvg__3c__test.png',
    prompt: buildVisualProfilePrompt(profile),
    visualProfile: profile,
    members: products.map((p) => ({
      sku: p.sku,
      productId: p.id,
      sourceName: p.sourceName,
      productName: p.name,
      primaryCores: 3,
      cores: 3,
      section: p.crossSection,
    })),
  };
  const plan = {
    planId: 'test-plan',
    renderConfig: { model: 'gpt-image-2.5-flare' },
    catalogSha256: sha(await fs.readFile(config.catalogFile)),
    groups: [group],
    reviewSkus: ['REVIEW-1'],
  };
  return {
    root,
    config,
    plan,
    stateDir: path.join(root, 'state'),
    products,
    group,
  };
}

describe('approved production visual queue', () => {
  it('builds different construction prompts without changing count or magnifying the object', () => {
    const cable = buildVisualProfilePrompt(profile);
    expect(cable).toContain('Exactly 3 insulated conductors');
    expect(cable).not.toMatch(
      /macro|close-up|fill the frame|large in frame|80.?90|zoomed in/iu
    );
    const wire = buildVisualProfilePrompt({
      ...profile,
      cores: 1,
      coreColors: ['white'],
      hasOuterJacket: false,
      conductorConstruction: 'stranded',
    });
    expect(wire).toContain('NO additional black sheath');
    expect(wire).toContain('Stranded copper');
    const sip = buildVisualProfilePrompt({
      ...profile,
      cores: 4,
      coreColors: Array(4).fill('black'),
      geometry: 'twisted-bundle',
      hasOuterJacket: false,
      conductorMaterial: 'aluminium',
      conductorConstruction: 'stranded',
    });
    expect(sip).toContain('NO common outer sheath');
    expect(sip).toContain('silvery aluminium');
    const armor = buildVisualProfilePrompt({
      ...profile,
      armor: true,
      armorType: 'steel-tapes',
      shield: true,
      shieldType: 'overall-foil-with-drain',
      specialElements: ['drain-wire', 'fire-barrier'],
    });
    expect(armor).toContain('STEEL TAPES');
    expect(armor).toContain('FOIL');
    expect(armor).toContain('mica');
    expect(
      buildVisualProfilePrompt({ ...profile, geometry: 'flat' })
    ).toContain('genuinely FLAT');
    expect(() => buildVisualProfilePrompt({ ...profile, cores: 4 })).toThrow();
  });
  it('rejects an unapproved queue before any request', () => {
    expect(() =>
      makeProductionPlan({ groups: [], rows: [], needsReview: [] }, [], {})
    ).toThrow('exactly 446');
  });
  it('hides an image rejected for an incorrect visible core count', () => {
    const product = { sku: 'QA-TEST', name: 'КВВГЭ 7х0.75' };
    const manifest = {
      bySku: {
        'QA-TEST': {
          status: 'approved',
          kind: 'generated-illustration',
          productName: product.name,
          image: '/product-images/generated/rejected.png',
          visualKey:
            'kvvgeng-a-ls__7c__solid__round__7core-control-black__p-42c369b1522c96fe',
        },
      },
    };
    expect(getGeneratedProductImage(product, manifest)).toBe('');
  });
  it('generates once for multiple sections, binds only eligible SKUs and resumes with no API call', async () => {
    const f = await fixture();
    let calls = 0;
    const provider = {
      generate: async (job, { onAttempt }) => {
        calls++;
        await onAttempt();
        return {
          buffer: png(),
          httpStatus: 200,
          provider: 'codex-sale',
          model: 'gpt-image-2.5-flare',
        };
      },
    };
    try {
      const result = await runVisualProduction({ ...f, provider });
      expect(result.generated).toEqual({ visualKeys: 1, products: 2 });
      expect(calls).toBe(1);
      const binding = JSON.parse(await fs.readFile(f.config.manifestFile));
      expect(binding.bySku['REVIEW-1']).toEqual({ image: '/keep.png' });
      expect(getGeneratedProductImage(f.products[0], binding)).toBe(
        f.group.image
      );
      expect(getGeneratedProductImage(f.products[1], binding)).toBe(
        f.group.image
      );
      expect(binding.bySku['TEST-1'].section).toBe(1);
      expect(binding.bySku['TEST-2'].section).toBe(2);
      const resumed = await runVisualProduction({ ...f, provider });
      expect(calls).toBe(1);
      expect(resumed.apiRequests).toBe(1);
      expect(resumed.skippedCache).toBe(1);
      expect(resumed.failed).toEqual([]);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
  it('records invalid/opaque PNG once and does not charge or bind it again on resume', async () => {
    const f = await fixture();
    let calls = 0;
    const provider = {
      generate: async (job, { onAttempt }) => {
        calls++;
        await onAttempt();
        return { buffer: png(true), httpStatus: 200 };
      },
    };
    try {
      expect(
        (await runVisualProduction({ ...f, provider })).failed
      ).toHaveLength(1);
      expect(
        (await runVisualProduction({ ...f, provider })).failed
      ).toHaveLength(1);
      expect(calls).toBe(1);
      expect(
        Object.keys(JSON.parse(await fs.readFile(f.config.manifestFile)).bySku)
      ).toEqual(['REVIEW-1']);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
  it('recovers a PNG saved just before interruption without generating again', async () => {
    const f = await fixture();
    let calls = 0;
    try {
      await writeProductionJson(path.join(f.stateDir, 'manifest.json'), {
        planId: f.plan.planId,
        apiRequests: 1,
        groups: {
          [f.group.visualKey]: {
            visualKey: f.group.visualKey,
            action: 'MISSING',
            skuCount: 2,
            status: 'generating',
            attempts: 1,
          },
        },
      });
      const file = path.join(f.root, 'public', f.group.image.slice(1));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, png());
      const result = await runVisualProduction({
        ...f,
        provider: {
          generate: async () => {
            calls++;
            throw Error('must not call');
          },
        },
      });
      expect(result.generated.products).toBe(2);
      expect(result.failed).toEqual([]);
      expect(calls).toBe(0);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
  it('refuses changed catalog data before generation', async () => {
    const f = await fixture();
    let calls = 0;
    try {
      await fs.writeFile(f.config.catalogFile, '[]');
      await expect(
        runVisualProduction({
          ...f,
          provider: {
            generate: async () => {
              calls++;
            },
          },
        })
      ).rejects.toThrow('Catalog changed');
      expect(calls).toBe(0);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
  it('resumes past a verified dead local process lock', async () => {
    const f = await fixture();
    let calls = 0;
    try {
      await writeProductionJson(
        path.join(f.config.metadataDir, '.pipeline.lock'),
        { pid: 2147483647, host: os.hostname() }
      );
      const result = await runVisualProduction({
        ...f,
        provider: {
          generate: async (job, { onAttempt }) => {
            calls++;
            await onAttempt();
            return { buffer: png(), httpStatus: 200 };
          },
        },
      });
      expect(calls).toBe(1);
      expect(result.generated.visualKeys).toBe(1);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
  it('never charges or rebinds a visually rejected saved PNG', async () => {
    const f = await fixture();
    let calls = 0;
    try {
      await writeProductionJson(path.join(f.stateDir, 'manifest.json'), {
        planId: f.plan.planId,
        apiRequests: 1,
        groups: {
          [f.group.visualKey]: {
            visualKey: f.group.visualKey,
            action: 'MISSING',
            skuCount: 2,
            status: 'failed',
            attempts: 1,
            qualityRejected: true,
            error: 'Wrong visible core count',
          },
        },
      });
      const result = await runVisualProduction({
        ...f,
        provider: {
          generate: async () => {
            calls++;
            throw Error('must not call');
          },
        },
      });
      expect(calls).toBe(0);
      expect(result.failed).toHaveLength(1);
      expect(result.generated.visualKeys).toBe(0);
      expect(
        Object.keys(JSON.parse(await fs.readFile(f.config.manifestFile)).bySku)
      ).toEqual(['REVIEW-1']);
    } finally {
      await fs.rm(f.root, { recursive: true, force: true });
    }
  });
});
