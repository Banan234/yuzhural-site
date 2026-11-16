import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { generateCableStyleDraft, loadCableImageStyle } from './cableImageStyle.js';
import { imageDisposition } from './cableSkuImageFacts.js';
import { catalogCableSpecs } from './fixtures/cableCatalogFixture.js';
import { createServer } from 'node:http';
import { createImageProvider } from './cableImageProvider.js';
import { CABLE_FRAME_REVIEW_CHECKS, CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  recordCableStyleReview,
  prepareApprovedBindingPatch,
  applyApprovedBindingPatch,
  digest,
} from './cableStyleBatch.js';
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const products = [
  {
    id: 1,
    sku: 'S1',
    sourceName: 'ВВГ 2x1.5',
    name: 'ВВГ 2x1.5',
    cores: 2,
    markFamily: 'ВВГ',
    specs: catalogCableSpecs,
    crossSection: 1.5,
  },
  {
    id: 2,
    sku: 'S2',
    sourceName: 'ВВГ 2x2.5',
    name: 'ВВГ 2x2.5',
    cores: 2,
    markFamily: 'ВВГ',
    specs: catalogCableSpecs,
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
function catalogGroup(items, standardVersion) {
  const { profile, visualKey } = readCableCatalogProfile(items[0]);
  return {
    profile, visualKey, standardVersion,
    eligibleSkus: items.map(({ sku }) => sku),
    members: items.map(product => ({
      sku: product.sku, productHash: digest(product), oldBinding: null,
    })),
  };
}
describe('protected cable review and placement', () => {
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
  it('resumes a saved valid PNG without any second request, and binds only after exact manual review', async () => {
    const root = await fixture();
    const captured = [];
    const pngFixture = await fs.readFile(path.join(project, 'assets/cable-style-reference/simple.png'));
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      captured.push({ path: request.url, type: request.headers['content-type'], bytes: Buffer.concat(chunks) });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ b64_json: pngFixture.toString('base64') }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const cacheDir = path.join(root, 'outputs/drafts');
      const generate = vi.fn(config => createImageProvider({
        ...config, apiBaseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
      }, { env: { IMAGE_API_KEY: 'local-fixture' } }));
      const draftDir = path.join(cacheDir, 'first');
      const args = { root, sku: 'S1', outputDir: draftDir, providerFactory: generate };
      const firstResult = await generateCableStyleDraft(args);
      expect(firstResult.status).toBe('NEEDS_REVIEW');
      const duplicate = await generateCableStyleDraft({ ...args, outputDir: path.join(cacheDir, 'another') });
      expect(duplicate.status).toBe('PENDING_REVIEW');
      expect(generate).toHaveBeenCalledTimes(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].path).toBe('/v1/images/edits');
      await fs.writeFile(path.join(root, 'multipart.raw'), captured[0].bytes);
      const multipart = await new Request('http://127.0.0.1', {
        method: 'POST', headers: { 'content-type': captured[0].type }, body: captured[0].bytes,
      }).formData();
      expect(multipart.get('prompt')).toContain('TECHNICAL_CONTRACT');
      expect(multipart.get('prompt')).toContain('VISUAL_COMPOSITION_CONTRACT');
      const [first] = multipart.getAll('image[]');
      expect(digest(Buffer.from(await first.arrayBuffer()))).toBe(firstResult.referenceSha256);
      const bindingArgs = {
        root,
        draftDir,
        products,
        visibleProducts: products,
        bindings: { bySku: {} },
        overrides: {},
        currentGroup: catalogGroup(products, firstResult.standardVersion),
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
      const groupFile = path.join(draftDir, 'group.json');
      const draft = JSON.parse(await fs.readFile(groupFile, 'utf8'));
      // Exercise the archived draft format still accepted by the publication transaction.
      await fs.writeFile(groupFile, JSON.stringify({ ...draft, draftKey: digest(png) }));
      const requestFile = path.join(draftDir, 'request.json');
      const originalRequest = await fs.readFile(requestFile, 'utf8');
      const mutatedRequest = JSON.parse(originalRequest);
      mutatedRequest.prompt = mutatedRequest.prompt.replaceAll('smallest practical clear left margin', '');
      await fs.writeFile(requestFile, JSON.stringify(mutatedRequest));
      await expect(recordCableStyleReview({
        root, draftDir, decision: {
          status: 'APPROVED', reviewer: 'Test', sha256: digest(png),
          checks: Object.fromEntries([...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS, 'compactPack']
            .map(key => [key, true])),
        },
      })).rejects.toThrow('frame.horizontal');
      await fs.writeFile(requestFile, originalRequest);
      await recordCableStyleReview({
        root,
        draftDir,
        decision: {
          status: 'APPROVED',
          reviewer: 'User',
          sha256: digest(png),
          checks: Object.fromEntries(
            [...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS, 'compactPack'].map((k) => [k, true])
          ),
        },
      });
      const permissionsRegistry = JSON.parse(await fs.readFile(path.join(root, 'data/cable-approved-results/registry.json')));
      const permissions = Object.values(permissionsRegistry.byVisualKey)[0];
      expect(permissions.APPROVED_FOR_CATALOG).toBe(true);
      expect(permissions.APPROVED_AS_REFERENCE).toBe(false);
      const reused = await generateCableStyleDraft({ ...args, outputDir: path.join(cacheDir, 'different') });
      expect(reused.status).toBe('APPROVED_DRAFT_NOT_PUBLISHED');
      const durableDir = reused.approvedDraftDir;
      expect(durableDir).toContain('data/cable-approved-results');
      expect(generate).toHaveBeenCalledTimes(1);
      const durablePatch = await prepareApprovedBindingPatch({ ...bindingArgs, draftDir: durableDir });
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
          checks: Object.fromEntries([...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS, 'compactPack'].map(k => [k, true])),
        },
      })).rejects.toThrow('requires a separate catalog migration');
      expect(JSON.parse(await fs.readFile(path.join(draftDir, 'approval.json'))).APPROVED_FOR_CATALOG).toBe(true);
      await fs.rm(cacheDir, { recursive: true, force: true });
      const afterCleanup = await generateCableStyleDraft({ root, sku: 'S1', dryRun: true, providerFactory: generate });
      expect(afterCleanup.status).toBe('EXISTING_STANDARD_APPROVED');
      await fs.appendFile(path.join(durableDir, 'image.png'), 'corruption');
      await expect(generateCableStyleDraft({ root, sku: 'S1', dryRun: true })).rejects.toThrow('integrity');
    } finally {
      await new Promise(resolve => server.close(resolve));
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('requires multicore observations even when the group lost its composition metadata', async () => {
    const root = await fixture();
    try {
      const draftDir = path.join(root, 'outputs', 'missing-composition');
      await fs.mkdir(draftDir, { recursive: true });
      const png = await fs.readFile(path.join(project, 'assets/cable-style-reference/multicore.png'));
      const multicore = products.map(product => ({ ...product, cores: 3 }));
      await fs.writeFile(path.join(root, 'data/catalog-current/products.json'), JSON.stringify(multicore));
      const style = await loadCableImageStyle(root);
      const group = catalogGroup(multicore, style.version);
      await fs.writeFile(path.join(draftDir, 'group.json'), JSON.stringify(group));
      await fs.writeFile(path.join(draftDir, 'image.png'), png);
      const { deriveMulticoreComposition, multicoreCompositionReviewChecks } = await import('./cableMulticoreComposition.js');
      const checks = [...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS, 'compactPack',
        ...multicoreCompositionReviewChecks(deriveMulticoreComposition(group.profile))];
      await expect(recordCableStyleReview({
        root, draftDir, decision: {
          status: 'APPROVED', reviewer: 'Test', sha256: digest(png),
          checks: Object.fromEntries(checks.map(key => [key, true])),
        },
      })).rejects.toThrow('Multicore verification incomplete');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps rejection after the working draft is removed and archives approved alternatives separately', async () => {
    const root = await fixture();
    try {
      const { loadCableReviewDecisions } = await import('./cableReviewDecisions.js');
      const { readCableGenerationClaims, cableGenerationClaimKey } = await import('./cableGenerationClaims.js');
      const style = await loadCableImageStyle(root);
      const group = catalogGroup(products, style.version);
      const writeDraft = async (name, png, profile=group.profile) => {
        const dir = path.join(root, 'outputs', name);
        await fs.mkdir(dir, { recursive:true });
        await fs.writeFile(path.join(dir,'image.png'),png);
        await fs.writeFile(path.join(dir,'group.json'),JSON.stringify({
          ...group,profile,
        }));
        return dir;
      };
      const png = await fs.readFile(path.join(project,'assets/cable-style-reference/simple.png'));
      const other = await fs.readFile(path.join(project,'assets/cable-style-reference/layered.png'));
      const original = await writeDraft('approved',png);
      const checks = Object.fromEntries([...CABLE_STYLE_REVIEW_CHECKS,...CABLE_FRAME_REVIEW_CHECKS,'compactPack'].map(key=>[key,true]));
      await recordCableStyleReview({root,draftDir:original,decision:{status:'APPROVED',reviewer:'Test',sha256:digest(png),checks}});
      const alternate = await writeDraft('alternative',other);
      await recordCableStyleReview({root,draftDir:alternate,decision:{status:'APPROVED',archiveOnly:true,reviewer:'Test',sha256:digest(other),checks}});
      const registry = JSON.parse(await fs.readFile(path.join(root,'data/cable-approved-results/registry.json')));
      expect(registry.byVisualKey[group.visualKey].sha256).toBe(digest(png));
      expect(registry.alternativesBySha256[digest(other)]).toMatchObject({ APPROVED_FOR_CATALOG:false, APPROVED_AS_REFERENCE:false });
      const rep = group.profile;
      const rejectedPng = await fs.readFile(path.join(project,'assets/cable-style-reference/multicore.png'));
      const rejectedProfile = {...rep,family:'rejected-test'};
      const rejected = await writeDraft('rejected',rejectedPng,rejectedProfile);
      await recordCableStyleReview({root,draftDir:rejected,decision:{status:'REJECTED',reviewer:'Test',sha256:digest(rejectedPng)}});
      await fs.rm(path.join(root,'outputs'),{recursive:true});
      const entries = await loadCableReviewDecisions(root);
      expect(entries).toHaveLength(3);
      expect((await readCableGenerationClaims(root)).get(cableGenerationClaimKey(rejectedProfile)).status).toBe('REJECTED');
      const approvedArchive = path.resolve(root,registry.byVisualKey[group.visualKey].draftDir);
      await expect(recordCableStyleReview({root,draftDir:approvedArchive,decision:{status:'REJECTED',reviewer:'Test',sha256:digest(png)}}))
        .rejects.toThrow('Review must target a draft');
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
  });

  it('preserves an interrupted provider outcome without a second request', async () => {
    const root = await fixture();
    try {
      const providerFactory = vi.fn(() => ({
        generate: async () => { throw Error('connection lost'); },
      }));
      const args = { root, sku: 'S1', providerFactory };
      await expect(generateCableStyleDraft({ ...args, outputDir: path.join(root, 'outputs/first') }))
        .rejects.toThrow('connection lost');
      const result = await generateCableStyleDraft({ ...args, outputDir: path.join(root, 'outputs/second') });
      expect(result.status).toBe('REQUEST_OUTCOME_UNKNOWN');
      expect(providerFactory).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
