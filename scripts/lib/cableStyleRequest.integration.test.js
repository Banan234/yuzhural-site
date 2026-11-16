import { exportCableReferenceGroups, importCableReferenceGroups } from './cableReferenceTransfer.js';
import { cableReferenceGroupId, saveCableGroupReferences } from './cableGroupReferences.js';
import { catalogCableSpecs, writeCatalogImageFixture } from './fixtures/cableCatalogFixture.js';
import { assertCableIllustrationPrompt, selectCableIllustrationRules } from './cableIllustrationRules.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import {
  generateCableStyleDraft,
  prepareCableStyleRequest,
} from './cableImageStyle.js';
import { createImageProvider } from './cableImageProvider.js';
import { withCableStyleSandbox } from './fixtures/cableStyleSandbox.js';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const rootFromTest = root;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const base = {
  family: 'vvg',
  visualizationType: 'SIMPLE',
  cores: 3,
  coreColors: ['brown', 'blue', 'yellow-green'],
  conductorMaterial: 'copper',
  conductorConstruction: 'solid',
  conductorShape: 'circular',
  geometry: 'round',
  hasOuterJacket: true,
  armor: false,
  shield: false,
  specialElements: [],
};
it('sends all four exact protected PNGs and complete standards to actual multipart adapter, with mocked HTTP', async () => {
  const project = root;
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-multipart-'));
  await fs.mkdir(path.join(sandbox, 'outputs'), { recursive: true });
  await fs.mkdir(path.join(sandbox, 'assets'), { recursive: true });
  await fs.cp(
    path.join(project, 'assets/cable-style-reference'),
    path.join(sandbox, 'assets/cable-style-reference'),
    { recursive: true }
  );
  await fs.copyFile(
    path.join(project, 'cable-image-style.json'),
    path.join(sandbox, 'cable-image-style.json')
  );
  const cases = [
    base,
    {
      ...base,
      visualizationType: 'MULTICORE',
      cores: 10,
      coreColors: Array(10).fill('black'),
      family: 'akvvg',
      conductorMaterial: 'aluminium',
    },
    {
      ...base,
      visualizationType: 'LAYERED',
      family: 'vvgng-a-frls',
      specialElements: ['fire-barrier'],
    },
    {
      ...base,
      visualizationType: 'MULTICORE + LAYERED',
      family: 'kvvgeng-a-frls',
      cores: 7,
      coreColors: Array(7).fill('black'),
      shield: true,
      shieldType: 'overall-foil-with-drain',
      specialElements: ['fire-barrier'],
    },
  ];
  try {
    for (const profile of cases) {
      const root = sandbox;
      const key = 'test-' + profile.visualizationType;
      const archive = path.join(root, 'data/cable-approved-results');
      const referenceDir = path.join(archive, key);
      await fs.mkdir(referenceDir, { recursive: true });
      const approvedPng = await fs.readFile(path.join(root, 'assets/cable-style-reference/' + (profile.visualizationType === 'SIMPLE' ? 'layered.png' : 'simple.png')));
      const approval = { status: 'APPROVED', visualKey: key, sha256: sha(approvedPng), APPROVED_AS_REFERENCE: true };
      await fs.writeFile(path.join(referenceDir, 'image.png'), approvedPng);
      await fs.writeFile(path.join(referenceDir, 'approval.json'), JSON.stringify(approval));
      await fs.writeFile(path.join(referenceDir, 'group.json'), JSON.stringify({ profile, visualKey: key }));
      await fs.writeFile(path.join(archive, 'registry.json'), JSON.stringify({
        byVisualKey: { [key]: { ...approval, profileHash: sha(JSON.stringify(profile)), draftDir: path.relative(root, referenceDir) } },
      }));
      const request = await prepareCableStyleRequest(root, profile),
        dir = await fs.mkdtemp(path.join(root, 'outputs/request-integration-'));
      const fetchImpl = vi.fn(async (url, options) => {
        expect(String(url)).toBe('https://codex.sale/v1/images/edits');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer fake-test-key');
        const f = options.body;
        expect(f).toBeInstanceOf(FormData);
        expect(f.get('model')).toBe('gpt-image-2.5-flare');
        expect(f.get('background')).toBe('transparent');
        expect(f.get('n')).toBe('1');
        expect(sha(Buffer.from(await f.get('image[]').arrayBuffer()))).toBe(
          request.reference.sha256
        );
        const images = f.getAll('image[]');
        expect(images).toHaveLength(2);
        expect(sha(Buffer.from(await images[1].arrayBuffer()))).toBe(approval.sha256);
        expect(request.referenceStatus).toBe('FAMILY_PRIMARY');
        const prompt = f.get('prompt');
        expect(prompt).toContain('INPUT 2 (FAMILY_PRIMARY): use only family appearance');
        expect(prompt).toBe(request.prompt);
        const rules = selectCableIllustrationRules(profile, request.technicalProfile);
        expect(request.ruleTrace.ids).toEqual(rules.map(rule => rule.id));
        for (const rule of rules.filter(rule => rule.marker)) {
          expect(() => assertCableIllustrationPrompt(rules, prompt.replaceAll(rule.marker, '')))
            .toThrow(rule.id);
        }
        expect(prompt).toContain('approved-cable-style-1.1.0');
        expect(prompt).toContain('MANDATORY CORE GEOMETRY');
        expect(prompt).toContain(`EXACTLY ${profile.cores}`);
        expect(prompt).toContain('SAME-diameter');
        if (profile.visualizationType.startsWith('MULTICORE')) {
          expect(request.multicoreComposition.version).toBe('multicore-composition-1.0.0');
          expect(prompt).toContain('descending diagonal staircase');
          expect(prompt).toContain('projected sheath axis');
          expect(prompt).toContain('comparable-axial-stripping');
        } else {
          expect(request.multicoreComposition).toBeNull();
        }

        expect(prompt).toContain('Do not depict filling or assert empty cavities');
        expect(request.technicalProfile.interstitialFilling.status).toBe('unknown');
        expect(request.technicalProfile.layers.map(layer => layer.role))
          .not.toContain('interstitial-filling');
        expect(request.strippingComposition.version).toBe(
          'common-sheath-stripping-composition-1.0.0'
        );
        expect(request.strippingComposition.bareMetalLengthRatio).toBe(1);
        expect(
          request.strippingComposition.insulatedCoreExposedLengthRatio
        ).toEqual({ min: 1.2, max: 1.3 });
        expect(prompt).toContain('FUTURE COMMON-SHEATH COMPOSITION PREFERENCE');
        expect(prompt).not.toContain('MANDATORY MULTICORE STRIPPING');

        if (profile.specialElements.includes('fire-barrier'))
          expect(prompt).toContain('MANDATORY VISIBLE MICA STRIPPING STEP');
        if (profile.shield) {
          expect(prompt).toContain('universal-screen-1.0.0');
          expect(prompt).toContain('CROSSHATCH MESH');
          expect(prompt).toContain('ABSOLUTELY NO ARMOR');
          expect(
            request.technicalProfile.screenVisualStandard.materialClaim
          ).toBe(false);
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            data: [
              {
                b64_json: (
                  await fs.readFile(path.join(root, request.reference.path))
                ).toString('base64'),
              },
            ],
          }),
        };
      });
      try {
        const r = await createImageProvider(request.config, { env: { IMAGE_API_KEY: 'fake-test-key' }, fetchImpl })
          .generate({ prompt: request.prompt });
        expect(Buffer.isBuffer(r.buffer)).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        await fs.writeFile(path.join(referenceDir, 'approval.json'), JSON.stringify({
          ...approval, APPROVED_AS_REFERENCE: false,
        }));
        await expect(createImageProvider(request.config, {
          env: { IMAGE_API_KEY: 'fake-test-key' }, fetchImpl,
        }).generate({ prompt: request.prompt })).rejects.toThrow('permission changed');
        await fs.writeFile(path.join(referenceDir, 'approval.json'), JSON.stringify(approval));
        await fs.writeFile(path.join(referenceDir, 'group.json'), JSON.stringify({
          profile: { ...profile, family: 'changed' }, visualKey: key,
        }));
        await expect(createImageProvider(request.config, {
          env: { IMAGE_API_KEY: 'fake-test-key' }, fetchImpl,
        }).generate({ prompt: request.prompt })).rejects.toThrow('profile changed');
        await fs.writeFile(path.join(referenceDir, 'image.png'), Buffer.from('changed'));
        await expect(createImageProvider(request.config, {
          env: { IMAGE_API_KEY: 'fake-test-key' }, fetchImpl,
        }).generate({ prompt: request.prompt })).rejects.toThrow('SHA-256 mismatch');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});
it('fails before HTTP if reference bytes changed or image edit input is missing', async () => {
  const req = await prepareCableStyleRequest(root, base),
    fetchImpl = vi.fn();
  const c = { ...req.config, requiredReferenceSha256: '0'.repeat(64) };
  await expect(
    createImageProvider(c, {
      env: { IMAGE_API_KEY: 'fake' },
      fetchImpl,
    }).generate({ prompt: req.prompt })
  ).rejects.toThrow('reference');
  await expect(
    createImageProvider(
      { ...c, referenceImage: null },
      { env: { IMAGE_API_KEY: 'fake' }, fetchImpl }
    ).generate({ prompt: req.prompt })
  ).rejects.toThrow('reference');
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('blocks a historical correction canvas before upload', () =>
  withCableStyleSandbox(async ({ root, editTarget }) => {
    const profile = {
      ...base,
      family: 'kvvgng-a-ls',
      visualizationType: 'MULTICORE',
      cores: 7,
      coreColors: Array(7).fill('black'),
    };
    const r = await prepareCableStyleRequest(root, profile, {
      editTarget,
      strippingCorrection: { min: 1.25, max: 1.3 },
    });
    expect(r.multicoreStripping.insulatedCoreExposedLengthRatio).toEqual({
      min: 1.25,
      max: 1.3,
    });
    expect(r.prompt).toContain(
      'Move the black common jacket cut/opening to the RIGHT'
    );
    const providerFactory = vi.fn();
    await expect(generateCableStyleDraft({
      root, sku: 'TEST-1', outputDir: path.join(root, 'outputs/blocked-edit'),
      requestOptions: { editTarget, vvgReviewRevision: true }, providerFactory,
    })).rejects.toThrow('legacy generation modes are disabled');
    expect(providerFactory).not.toHaveBeenCalled();
    const fetchImpl = vi.fn();
    await expect(createImageProvider(r.config, {
      env: { IMAGE_API_KEY: 'test-only' }, fetchImpl,
    }).generate({ prompt: r.prompt })).rejects.toThrow('Supplemental reference permission required');
    expect(fetchImpl).not.toHaveBeenCalled();
  }));

it('uses the protected style for verified round multicore without a secondary PNG', () =>
  withCableStyleSandbox(async ({ root }) => {
    await fs.unlink(path.join(root, 'data/cable-approved-results'));
    const profile = { ...base, family: 'unrecognized-family', visualizationType: 'MULTICORE',
      cores: 5, coreColors: ['black', 'brown', 'grey', 'blue', 'yellow-green'] };
    const request = await prepareCableStyleRequest(root, profile);
    expect(request.referenceStatus).toBe('PROTECTED_STYLE_ONLY');
    expect(request.prompt).toContain('target construction and composition contracts for target layout');
    expect(request.technicalProfile.insulatedCoreCount).toBe(profile.cores);
    expect(request.config.additionalReferenceImages.some(ref => ref.role === 'GEOMETRY_MATCH')).toBe(false);
    expect(request.coreArrangement.mode).toBe('EXPLICIT_SCHEME');
    expect(request.coreArrangement.id).toBe('target-layout');
    const kvvg = await prepareCableStyleRequest(root, { ...profile, family: 'kvvgng-a-ls' });
    expect(kvvg.coreArrangement.id).toBe('five-perimeter');
    expect(kvvg.prompt).toContain('Leave the centre of the ring free of any core');
    expect(kvvg.prompt).toContain('including the black one, must visibly emerge from inside');
    await expect(prepareCableStyleRequest(root, { ...profile, geometry: 'flat' }))
      .rejects.toThrow(/unsupported layout.*FLAT/);
  }));

it.each([1, 2])('detects staircase, clipping and anatomy mismatches at scale %i', async scale => {
  const { PNG } = await import('pngjs');
  const { inspectMulticoreComposition } = await import('./cableMulticoreComposition.js');
  const { validateCableImagePng } = await import('./cableImagePng.js');
  const { buildCableTechnicalProfile } = await import('./cableTechnicalProfile.js');
  const profile = { ...base, cores: 4, coreColors: ['brown', 'black', 'grey', 'yellow-green'], visualizationType: 'MULTICORE' };
  const png = new PNG({ width: 200 * scale, height: 100 * scale });
  for (let x = 0; x < png.width; x++)
    for (let y = 30 * scale; y < 70 * scale; y++)
      png.data[(y * png.width + x) * 4 + 3] = 255;
  const validation = validateCableImagePng(PNG.sync.write(png), { background: 'transparent', composition: { rightEdgeCrop: true } });
  const contract = buildCableTechnicalProfile(profile);
  const geometry = inspectMulticoreComposition(png, validation, profile, contract, {
    sha256: validation.sha256,
    ends: [[20,32],[28,43],[36,55],[44,67]].map(([x,y]) => ({ x:x*scale, y:y*scale, complete:true })),
    insulatedCoreCount: 5,
    layerRoles: ['armor'],
  });
  expect(geometry.findings).toEqual(expect.arrayContaining([
    'possible-clipped-tips', 'excessive-tip-spread', 'diagonal-tip-staircase',
    'profile-mismatch-insulatedCoreCount', 'unexpected-layer-armor', 'layer-not-visible-individual-insulation',
  ]));
  expect(geometry.missing).toContain('conductorMaterial');
  expect(geometry.status).toBe('NEEDS_REVIEW');
  const wrongSha = inspectMulticoreComposition(png, validation, profile, contract, { sha256: 'wrong', ends: [] });
  expect(wrongSha.missing).toContain('annotated-metal-end-centers');
  expect(wrongSha.findings).not.toContain('wrong-metal-end-count');
});

it('sends only the useful references in their recorded order', async () => {
  const request = await prepareCableStyleRequest(root, {
    ...base, productType: 'power-cable', outerJacket: 'black',
  });
  expect(request.referenceInputs.map(ref => ref.position)).toEqual([1, 2, 3]);
  expect(request.referenceInputs.slice(1).map(ref => ref.role)).toEqual(['FAMILY_PRIMARY', 'GEOMETRY_MATCH']);
  expect(new Set(request.referenceInputs.map(ref => ref.sha256)).size).toBe(3);
  const fetchImpl = vi.fn(async (_url, { body }) => {
    const hashes = await Promise.all(body.getAll('image[]').map(async image =>
      sha(Buffer.from(await image.arrayBuffer()))));
    expect(hashes).toEqual(request.referenceInputs.map(ref => ref.sha256));
    for (const { position, role, allowedUse } of request.referenceInputs.slice(1)) {
      expect(body.get('prompt')).toContain(`INPUT ${position} (${role}): use only ${allowedUse}.`);
    }
    expect(body.get('prompt')).toContain('positions of the insulated cores only');
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({
      data: [{ b64_json: (await fs.readFile(request.config.referenceImage)).toString('base64') }],
    }) };
  });
  await createImageProvider(request.config, {
    env: { IMAGE_API_KEY: 'test-only' }, fetchImpl,
  }).generate({ prompt: request.prompt });
  const [ref] = request.config.additionalReferenceImages;
  await expect(createImageProvider({
    ...request.config, additionalReferenceImages: [ref, ref],
  }, { env: { IMAGE_API_KEY: 'test-only' }, fetchImpl }).generate({ prompt: request.prompt }))
    .rejects.toThrow('Duplicate');
  await expect(createImageProvider({
    ...request.config, additionalReferenceImages: Array(3).fill(ref),
  }, { env: { IMAGE_API_KEY: 'test-only' }, fetchImpl }).generate({ prompt: request.prompt }))
    .rejects.toThrow('up to two');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('uses saved group references as actual multipart inputs, and checks changes and deletion', () =>
  withCableStyleSandbox(async ({root}) => {
    const profile = {...base, family:'kvvgng-a-ls', productType:'control-cable', cores:5,
      coreColors:['black','brown','grey','blue','yellow-green'], outerJacket:'black'};
    const directory = path.join(root,'data/cable-approved-results');
    const real = await fs.realpath(directory);
    await fs.unlink(directory);
    await fs.mkdir(directory);
    const registry = JSON.parse(await fs.readFile(path.join(real,'registry.json')));
    const selected = Object.fromEntries(Object.entries(registry.byVisualKey).filter(([,entry])=>
      ['5af20cca','4ab76c84'].includes(entry.sha256.slice(0,8))));
    for (const entry of Object.values(selected)) await fs.cp(path.join(rootFromTest,entry.draftDir),path.join(root,entry.draftDir),{recursive:true});
    const alternatePng = await fs.readFile(path.join(root,'assets/cable-style-reference/layered.png'));
    const alternateKey = 'test-kvvg-group-alternate';
    const alternateDir = path.join(directory,alternateKey);
    const alternate = {sha256:sha(alternatePng),visualKey:alternateKey,status:'APPROVED',APPROVED_AS_REFERENCE:true};
    await fs.mkdir(alternateDir);
    await Promise.all([
      fs.writeFile(path.join(alternateDir,'image.png'),alternatePng),
      fs.writeFile(path.join(alternateDir,'group.json'),JSON.stringify({profile,visualKey:alternateKey})),
      fs.writeFile(path.join(alternateDir,'approval.json'),JSON.stringify(alternate)),
    ]);
    selected[alternateKey] = {...alternate,profileHash:sha(JSON.stringify(profile)),draftDir:path.relative(root,alternateDir)};
    await fs.writeFile(path.join(directory,'registry.json'),JSON.stringify({byVisualKey:selected}));
    const before = await prepareCableStyleRequest(root,profile);
    const defaultPrimary = before.referenceInputs.find(input=>input.role==='FAMILY_PRIMARY').sha256;
    const geometry = before.referenceInputs.find(input=>input.role==='GEOMETRY_MATCH').sha256;
    const primary = alternate.sha256;
    expect(defaultPrimary).not.toBe(primary);
    const id = cableReferenceGroupId(profile);
    const product = {sku:'YU-TEST-KVVG',name:'КВВГнг(А)-LS 5×0,75'};
    const products = JSON.parse(await fs.readFile(path.join(root,'data/catalog-current/products.json')));
    const library = {root, catalog:new Map([[product.sku,{product,profile,visualKey:'kvvg-test',issues:[]}]]),
      listed:new Set([product.sku]),referenceCatalogHash:sha(JSON.stringify(products))};
    const empty = {primary:'',geometry:''};
    const validate = referenceChoices => prepareCableStyleRequest(root,profile,{referenceChoices});
    await saveCableGroupReferences(root,id,{primary,geometry},empty,validate);
    await expect(saveCableGroupReferences(root,id,empty,empty,validate)).rejects.toThrow(/изменилось/);
    const request = await prepareCableStyleRequest(root,profile);
    const fetchImpl = vi.fn(async (url,{body})=>{
      expect(String(url)).toMatch(/\/images\/edits$/u);
      expect(await Promise.all(body.getAll('image[]').map(async image=>sha(Buffer.from(await image.arrayBuffer())))))
        .toEqual([request.reference.sha256,primary,geometry]);
      expect(body.get('prompt')).toContain('INPUT 3 (GEOMETRY_MATCH): use only positions of the insulated cores only');
      return { ok:true,status:200,headers:new Headers(),json:async()=>({data:[{
        b64_json:(await fs.readFile(path.join(root,'assets/cable-style-reference/simple.png'))).toString('base64'),
      }]}) };
    });
    await createImageProvider(request.config,{env:{IMAGE_API_KEY:'test-only'},fetchImpl}).generate({prompt:request.prompt});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const snapshot = await exportCableReferenceGroups(library,{family:'kvvg',assignedOnly:true});
    expect(snapshot.groups).toMatchObject([{family:'kvvg',groupId:id,skus:[product.sku],
      primary:{sha256:primary,role:'FAMILY_PRIMARY'},geometry:{sha256:geometry,role:'GEOMETRY_MATCH'}}]);
    expect(Number.isFinite(Date.parse(snapshot.groups[0].updatedAt))).toBe(true);
    expect((await exportCableReferenceGroups(library,{since:snapshot.exportedAt},{preview:true})).groups).toBe(0);
    expect((await importCableReferenceGroups(library,snapshot,{apply:true})).skipped).toHaveLength(1);
    const wrongSku = structuredClone(snapshot);
    wrongSku.groups[0].skus = ['OTHER'];
    expect((await importCableReferenceGroups(library,wrongSku)).errors).toHaveLength(1);
    const geometric = request.config.additionalReferenceImages[1];
    const missingPath = geometric.path+'.test-missing';
    await fs.rename(geometric.path,missingPath);
    await expect(prepareCableStyleRequest(root,profile)).rejects.toThrow(/Файл назначенного референса/);
    await expect(createImageProvider(request.config,{env:{IMAGE_API_KEY:'test-only'},fetchImpl})
      .generate({prompt:request.prompt})).rejects.toThrow(/Файл референса отсутствует/);
    await fs.rename(missingPath,geometric.path);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await saveCableGroupReferences(root,id,{primary:defaultPrimary,geometry},{primary,geometry},validate);
    expect((await prepareCableStyleRequest(root,profile)).referenceInputs[1].sha256).toBe(defaultPrimary);
    expect((await importCableReferenceGroups(library,snapshot,{apply:true})).conflicts)
      .toMatchObject([{id,current:{primary:defaultPrimary},incoming:{primary}}]);
    await saveCableGroupReferences(root,id,empty,{primary:defaultPrimary,geometry},validate);
    const file = path.join(root,'data/cable-approved-results/group-references.json');
    expect((await importCableReferenceGroups(library,snapshot)).wouldImport).toEqual([id]);
    expect(JSON.parse(await fs.readFile(file))).toEqual({groups:{}});
    expect((await importCableReferenceGroups(library,snapshot,{apply:true})).imported).toEqual([id]);
    expect((await prepareCableStyleRequest(root,profile)).referenceInputs[1].sha256).toBe(primary);
    await expect(saveCableGroupReferences(root,id,{primary,geometry:primary},{primary,geometry},validate))
      .rejects.toThrow(/Геометрический референс/);
    await fs.writeFile(path.join(alternateDir,'group.json'),JSON.stringify({profile,visualKey:alternateKey,
      manualReview:{observations:{coreLayout:'five-perimeter'}}}));
    await saveCableGroupReferences(root,id,{primary,geometry:primary},{primary,geometry},validate);
    const shared = await prepareCableStyleRequest(root,profile);
    expect(shared.referenceInputs.slice(1).map(({position,role})=>[position,role])).toEqual([
      [2,'FAMILY_PRIMARY'],[2,'GEOMETRY_MATCH'],
    ]);
    expect(shared.prompt).toContain('INPUT 2 (FAMILY_PRIMARY)');
    expect(shared.prompt).toContain('INPUT 2 (GEOMETRY_MATCH)');
    const sharedFetch = vi.fn(async (_,{body})=>{
      expect(await Promise.all(body.getAll('image[]').map(async image=>sha(Buffer.from(await image.arrayBuffer())))))
        .toEqual([shared.reference.sha256,primary]);
      return {ok:true,status:200,headers:new Headers(),json:async()=>({data:[{b64_json:alternatePng.toString('base64')}]})};
    });
    await createImageProvider(shared.config,{env:{IMAGE_API_KEY:'test-only'},fetchImpl:sharedFetch}).generate({prompt:shared.prompt});
    expect(sharedFetch).toHaveBeenCalledTimes(1);
  }));
