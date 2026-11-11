import { CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  planCableStyleBatch,
  imageDisposition,
  runCableStyleBatch,
  recordCableStyleReview,
  prepareApprovedBindingPatch,
  applyApprovedBindingPatch,
  digest,
} from './cableStyleBatch.js';
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const read = async (f) => JSON.parse(await fs.readFile(path.join(project, f)));
const context = {
  rules: await read('data/cableVisualClassificationRules.json'),
  familyVisualRules: await read('data/familyVisualRules.json'),
  knowledge: await read('shared/designationKnowledgeBase.json'),
  colorRules: await read('data/cableImageColors.json'),
};
const products = [
  {
    id: 1,
    sku: 'S1',
    sourceName: 'ВВГ 3x1.5',
    name: 'ВВГ 3x1.5',
    cores: 3,
    crossSection: 1.5,
  },
  {
    id: 2,
    sku: 'S2',
    sourceName: 'ВВГ 3x2.5',
    name: 'ВВГ 3x2.5',
    cores: 3,
    crossSection: 2.5,
  },
];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'style-batch-'));
  for (const dir of [
    'assets',
    'data/catalog-current',
    'data/product-image-metadata',
    'shared',
    'outputs',
    'public/product-images/generated',
  ])
    await fs.mkdir(path.join(root, dir), { recursive: true });
  await fs.cp(
    path.join(project, 'assets/cable-style-reference'),
    path.join(root, 'assets/cable-style-reference'),
    { recursive: true }
  );
  await fs.copyFile(
    path.join(project, 'cable-image-style.json'),
    path.join(root, 'cable-image-style.json')
  );
  await fs.writeFile(
    path.join(root, 'data/catalog-current/products.json'),
    JSON.stringify(products)
  );
  await fs.writeFile(
    path.join(root, 'shared/generatedProductImages.json'),
    JSON.stringify({ bySku: {} })
  );
  return root;
}
const make = async (root) =>
  planCableStyleBatch({
    root,
    products,
    visibleProducts: products,
    bindings: { bySku: {} },
    overrides: {},
    context,
    cacheDir: path.join(root, 'outputs/drafts'),
  });
describe('standard mass workflow boundaries', () => {
  it('groups different sections once and keeps every SKU section', async () => {
    const plan = await make(project);
    expect(plan.summary.expectedPaidRequests).toBe(1);
    expect(plan.groups[0].eligibleSkus).toEqual(['S1', 'S2']);
    expect(plan.groups[0].members.map((r) => r.section)).toEqual([1.5, 2.5]);
    expect(plan.groups[0].request.endpoint).toBe('images/edits');
  });
  it('protects photos, explicit overrides and unknown provenance; permits old generated replacement', () => {
    const p = products[0];
    expect(
      imageDisposition({ ...p, image: '/photo.jpg' }, p, null).protected
    ).toBe(true);
    expect(imageDisposition(p, { image: '/manual.png' }, null).protected).toBe(
      true
    );
    expect(
      imageDisposition(p, p, null, {
        overrides: { [p.name]: { image: '/manual.png' } },
      }).protected
    ).toBe(true);
    expect(
      imageDisposition(
        p,
        { image: '/old.png' },
        { kind: 'generated-illustration', image: '/old.png' }
      ).protected
    ).toBe(false);
  });
  it('excludes unsupported geometry and ambiguous families without changing the standard', async () => {
    const p = [
      { sku: 'flat', name: 'ВВГ-П 3x1.5' },
      { sku: 'unknown', name: 'XXX 3x1.5' },
    ];
    const plan = await planCableStyleBatch({
      root: project,
      products: p,
      visibleProducts: p,
      bindings: { bySku: {} },
      overrides: {},
      context,
    });
    expect(plan.summary.expectedPaidRequests).toBe(0);
    expect(plan.summary.needsReviewProducts).toBe(2);
  });
  it('resumes a saved valid PNG without any second request, and binds only after exact manual review', async () => {
    const root = await fixture();
    try {
      const plan = await make(root),
        cacheDir = path.join(root, 'outputs/drafts'),
        generate = vi.fn(async () => ({
          buffer: await fs.readFile(
            path.join(project, 'assets/cable-style-reference/simple.png')
          ),
          httpStatus: 200,
        }));
      const args = {
        root,
        plan,
        cacheDir,
        providerFactory: () => ({ generate }),
      };
      await runCableStyleBatch(args);
      await runCableStyleBatch(args);
      expect(generate).toHaveBeenCalledTimes(1);
      const draftDir = path.join(cacheDir, plan.groups[0].draftKey);
      const bindingArgs = {
        root,
        draftDir,
        products,
        visibleProducts: products,
        bindings: { bySku: {} },
        overrides: {},
      };
      await expect(prepareApprovedBindingPatch(bindingArgs)).rejects.toThrow();
      const png = await fs.readFile(path.join(draftDir, 'image.png'));
      await expect(
        recordCableStyleReview({
          root,
          draftDir,
          decision: {
            status: 'APPROVED',
            reviewer: 'User',
            sha256: digest(png),
            checks: {},
          },
        })
      ).rejects.toThrow('manual checks');
      await expect(
        recordCableStyleReview({
          root,
          draftDir,
          decision: {
            status: 'APPROVED',
            reviewer: 'User',
            sha256: digest(png),
            checks: Object.fromEntries(
              CABLE_STYLE_REVIEW_CHECKS.filter(
                (k) => k !== 'equalDiameters'
              ).map((k) => [k, true])
            ),
          },
        })
      ).rejects.toThrow('manual checks');
      await recordCableStyleReview({
        root,
        draftDir,
        decision: {
          status: 'APPROVED',
          reviewer: 'User',
          sha256: digest(png),
          checks: Object.fromEntries(
            CABLE_STYLE_REVIEW_CHECKS.map((k) => [k, true])
          ),
        },
      });
      const permissionsRegistry = JSON.parse(await fs.readFile(path.join(root, 'data/cable-approved-results/registry.json')));
      const permissions = Object.values(permissionsRegistry.byVisualKey)[0];
      expect(permissions.APPROVED_FOR_CATALOG).toBe(true);
      expect(permissions.APPROVED_AS_REFERENCE).toBe(false);
      // Approval survives a new process/plan, prompt-cache relocation and cache deletion.
      const replanned = await make(root);
      expect(replanned.groups[0].status).toBe('APPROVED_DRAFT_NOT_PUBLISHED');
      const durableDir = replanned.groups[0].approvedDraftDir;
      expect(durableDir).toContain('data/cable-approved-results');
      const stale = structuredClone(plan);
      stale.groups[0].draftKey = 'a-different-prompt-key';
      stale.groups[0].status = 'READY';
      const resumed = await runCableStyleBatch({ ...args, plan: stale });
      expect(resumed[0].status).toBe('APPROVED_DRAFT_NOT_PUBLISHED');
      expect(generate).toHaveBeenCalledTimes(1);
      const durablePatch = await prepareApprovedBindingPatch({
        ...bindingArgs,
        draftDir: durableDir,
        currentGroup: replanned.groups[0],
      });
      expect(durablePatch.changes).toHaveLength(2);
      const patch = await prepareApprovedBindingPatch(bindingArgs);
      expect(patch.changes).toHaveLength(2);
      await applyApprovedBindingPatch(bindingArgs);
      const bindings = JSON.parse(
        await fs.readFile(path.join(root, 'shared/generatedProductImages.json'))
      );
      expect(bindings.bySku.S1.image).toBe(bindings.bySku.S2.image);
      expect(bindings.bySku.S2.section).toBe(2.5);
      await expect(recordCableStyleReview({
        root,
        draftDir,
        decision: {
          status: 'APPROVED',
          reviewer: 'User',
          sha256: digest(png),
          APPROVED_FOR_CATALOG: false,
          checks: Object.fromEntries(CABLE_STYLE_REVIEW_CHECKS.map(k => [k, true])),
        },
      })).rejects.toThrow('requires a separate catalog migration');
      expect(JSON.parse(await fs.readFile(path.join(draftDir, 'approval.json'))).APPROVED_FOR_CATALOG).toBe(true);
      await fs.rm(cacheDir, { recursive: true, force: true });
      const afterCleanup = await make(root);
      expect(afterCleanup.groups[0].status).toBe(
        'APPROVED_DRAFT_NOT_PUBLISHED'
      );
      await fs.appendFile(path.join(durableDir, 'image.png'), 'corruption');
      await expect(make(root)).rejects.toThrow('integrity');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('blocks old standard plans before provider use', async () => {
    const root = await fixture();
    try {
      const plan = await make(root);
      plan.standardVersion = 'approved-cable-style-1.0.0';
      const providerFactory = vi.fn();
      await expect(
        runCableStyleBatch({
          root,
          plan,
          cacheDir: path.join(root, 'outputs/drafts'),
          providerFactory,
        })
      ).rejects.toThrow('Style version changed');
      expect(providerFactory).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('does not recharge an interrupted request with unknown provider outcome', async () => {
    const root = await fixture();
    try {
      const plan = await make(root),
        cacheDir = path.join(root, 'outputs/drafts'),
        dir = path.join(cacheDir, plan.groups[0].draftKey);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'request.json'), '{}');
      const providerFactory = vi.fn(() => {
        throw Error('must not call');
      });
      const result = await runCableStyleBatch({
        root,
        plan,
        cacheDir,
        providerFactory,
      });
      expect(result[0].status).toBe('REQUEST_OUTCOME_UNKNOWN');
      expect(providerFactory).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
