import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { expect, test, vi } from 'vitest';
import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { generateCableStyleDraft, prepareCableStyleRequest } from './cableImageStyle.js';
import { createImageProvider } from './cableImageProvider.js';
import { archiveApprovedCableResult } from './cableApprovedResults.js';
import { CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
import { catalogCableSpecs, writeCatalogImageFixture } from './fixtures/cableCatalogFixture.js';
import { digest } from './cableStyleBatch.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const targets = ['YU-0000919', 'YU-0000920', 'YU-0000879', 'YU-0000757'];
const release = JSON.parse(await fs.readFile(path.join(root, 'data/catalog-current/products.json')));
const actual = targets.map(sku => release.find(product => product.sku === sku));

test('real SKU without complete fields uses checked visual profiles while preserving layers and archived holds', async () => {
  const checked = actual.map(readCableCatalogProfile);
  expect(checked.every(row => row.profile && row.issues.length === 0)).toBe(true);
  expect(new Set(checked.map(row => row.visualKey)).size).toBe(4);
  expect(checked.map(row => row.source.fields.cores)).toEqual([3, 3, 2, 1]);
  expect(checked[1].source.fields['Заполнение сердечника']).toBe('Предусмотрено');
  expect(checked[2].source.fields['Экранированный']).toBe('Да');
  expect(checked[3].profile.specialElements).toContain('fire-barrier');
  expect(checked[3].source.unspecifiedCardFields).toContain('catalog-missing-or-ambiguous: Огнестойкий барьер');
  const providerFactory = vi.fn();
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw Error('Catalog preflight must remain offline');
  });
  try {
    for (const sku of targets.slice(1)) {
      const result = await generateCableStyleDraft({
        root, sku, outputDir: path.join(root, 'outputs', 'not-generated', sku), providerFactory,
      });
      expect(['HELD_DEFECT','REJECTED','HISTORICAL_PROFILE_REVIEW_REQUIRED']).toContain(result.status);
    }
    expect(providerFactory).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});

test('real SKU identities in an isolated completed release drive the actual multipart contract; inputs and names cannot override catalog anatomy', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-cable-contract-'));
  const styleDir = path.join(root, 'assets/cable-style-reference');
  await fs.mkdir(path.join(sandbox, 'assets'));
  await fs.cp(styleDir, path.join(sandbox, 'assets/cable-style-reference'), { recursive: true });
  await fs.copyFile(path.join(root, 'cable-image-style.json'), path.join(sandbox, 'cable-image-style.json'));
  const png = await fs.readFile(path.join(styleDir, 'simple.png'));
  const refPng = await fs.readFile(path.join(styleDir, 'layered.png'));
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    await fs.writeFile(path.join(sandbox, 'multipart-' + requests.length), raw);
    const body = await new Request('http://127.0.0.1', {
      method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: raw,
    }).formData();
    requests.push({ url: req.url, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const extra = [
      {},
      { 'Заполнение сердечника': 'Предусмотрено', 'Материал заполнения': 'ПВХ', 'Расположение заполнения': 'Между изолированными жилами' },
      { 'Экранированный': 'Да', 'Расположение экрана': 'Под наружной оболочкой', 'Тип экрана': 'Медная лента' },
      { 'Огнестойкий барьер': 'Да', 'Внутренняя оболочка': 'Да', 'Материал внутренней оболочки': 'ПВХ',
        'Материал огнестойкого барьера': 'Слюдосодержащие ленты',
        'Расположение огнестойкого барьера': 'Под индивидуальной изоляцией каждой жилы' },
    ];
    const completed = actual.map((product, index) => {
      const observed = readCableCatalogProfile(product).source.fields;
      const specs = { ...catalogCableSpecs, ...Object.fromEntries(Object.entries(observed).filter(([key]) => key !== 'cores')),
        ...extra[index] };
      return { ...product, specs };
    });
    await writeCatalogImageFixture(sandbox, completed);
    const profiles = completed.map(readCableCatalogProfile);
    expect(profiles.map(row => row.issues)).toEqual([[], [], [], []]);
    expect(readCableCatalogProfile({ ...completed[0], name: 'любое название' }).visualKey).toBe(profiles[0].visualKey);
    expect(readCableCatalogProfile({ ...completed[2], attributes: ['Э'], specs: {
      ...completed[2].specs, 'Экранированный': 'Нет',
    } }).issues.some(issue => issue.startsWith('catalog-conflict'))).toBe(true);
    expect(new Set(profiles.map(row => row.visualKey)).size).toBe(4);
    const providerFactory = vi.fn(config => createImageProvider({
      ...config, apiBaseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
    }, { env: { IMAGE_API_KEY: 'loopback-test' }, fetchImpl: (url, options) => {
      expect(new URL(url).hostname).toBe('127.0.0.1');
      return fetch(url, options);
    } }));
    await expect(generateCableStyleDraft({
      root: sandbox, sku: targets[0], profile: { ...profiles[0].profile, cores: 2 }, providerFactory,
    })).rejects.toThrow('differs from the catalog');
    expect(providerFactory).not.toHaveBeenCalled();
    const expectedLayers = [
      ['outer-jacket', 'individual-insulation'],
      ['outer-jacket', 'interstitial-filling', 'individual-insulation'],
      ['outer-jacket', 'screen', 'individual-insulation'],
      ['outer-jacket', 'inner-sheath', 'individual-insulation', 'fire-barrier'],
    ];
    for (const [index, catalog] of profiles.entries()) {
      const profile = catalog.profile;
      if (profile.visualizationType.startsWith('MULTICORE')) {
        const dir = path.join(sandbox, 'outputs', 'reference-' + index);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'image.png'), refPng);
        const visualKey = 'fixture-ref-' + index;
        await archiveApprovedCableResult({ root: sandbox, draftDir: dir,
          group: { profile: { ...profile, family: 'fixture-reference' }, visualKey, standardVersion: 'approved-cable-style-1.1.0' },
          approval: { visualKey, status: 'APPROVED', sha256: digest(refPng),
            checks: Object.fromEntries(CABLE_STYLE_REVIEW_CHECKS.map(key => [key, true])),
            APPROVED_AS_REFERENCE: true, APPROVED_FOR_CATALOG: false },
        });
      }
      const outputDir = path.join(sandbox, 'outputs', 'draft-' + index);
      const args = { root: sandbox, sku: targets[index], outputDir, providerFactory };
      const result = await generateCableStyleDraft(args);
      expect(result.status).toBe('NEEDS_REVIEW');
      const saved = JSON.parse(await fs.readFile(path.join(outputDir, 'request.json')));
      expect(saved.catalogSource.sku).toBe(targets[index]);
      expect(saved.technicalProfile.layers.map(layer => layer.role)).toEqual(expectedLayers[index]);
      expect(saved.technicalProfile.layers.at(-1).material ?? saved.technicalProfile.fireBarrierMaterial).toBe(index === 3 ? 'mica-containing-tapes' : completed[index].specs['Материал изоляции']);
      const { body, url } = requests.at(-1);
      const prompt = body.get('prompt');
      expect(url).toBe('/v1/images/edits');
      expect(prompt).toContain('Do not research or consult outside technical documentation');
      expect(prompt).not.toMatch(/https?:\/\//);
      expect(prompt).toContain(JSON.stringify(saved.technicalProfile));
      expect(prompt).toContain(JSON.stringify(saved.visualCompositionContract));
      const parts = body.getAll('image[]');
      expect(await Promise.all(parts.map(async part => digest(Buffer.from(await part.arrayBuffer())))))
        .toEqual(saved.referenceInputs.map(input => input.sha256));
      if (index === 2) expect(prompt).toContain('SCREENED VVG COMPACT STRIPPING');
      const restarted = await generateCableStyleDraft({ ...args, outputDir: path.join(sandbox, 'outputs', 'resume-' + index) });
      expect(restarted.status).toBe('PENDING_REVIEW');
    }
    expect(requests).toHaveLength(4);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(sandbox, { recursive: true, force: true });
  }
}, 25000);

test('a previous paid request under a legacy visualKey holds the new key without contributing anatomy', async () => {
  const rootFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-cable-historical-'));
  try {
    await fs.mkdir(path.join(rootFixture, 'assets'));
    await fs.cp(path.join(root, 'assets/cable-style-reference'), path.join(rootFixture, 'assets/cable-style-reference'), { recursive: true });
    await fs.copyFile(path.join(root, 'cable-image-style.json'), path.join(rootFixture, 'cable-image-style.json'));
    const sku = 'HISTORIC';
    const product = { sku, markFamily: 'ВВГ', cores: 1, specs: catalogCableSpecs };
    await writeCatalogImageFixture(rootFixture, [product]);
    const current = readCableCatalogProfile(product);
    const dir = path.join(rootFixture, 'outputs', 'historical');
    await fs.mkdir(dir, { recursive: true });
    const old = { ...current.profile, family: 'vvg', technicalConstruction: undefined };
    await fs.writeFile(path.join(dir, 'request.json'), JSON.stringify({
      profile: old, status: 'requesting', standardVersion: 'approved-cable-style-1.1.0',
    }));
    const providerFactory = vi.fn();
    await expect(generateCableStyleDraft({ root: rootFixture, sku,
      outputDir: path.join(rootFixture, 'outputs', 'new'), providerFactory,
    })).resolves.toMatchObject({
      status: 'HISTORICAL_PROFILE_REVIEW_REQUIRED', originalStatus: 'REQUEST_OUTCOME_UNKNOWN',
    });
    expect(providerFactory).not.toHaveBeenCalled();
  } finally {
    await fs.rm(rootFixture, { recursive: true, force: true });
  }
});

test('real approved SKU bypasses the new-draft gate, while a flat card keeps its stated geometry', async () => {
  const providerFactory = vi.fn();
  const accepted = await generateCableStyleDraft({root,sku:'YU-0000919',providerFactory});
  expect(accepted.status).toBe('EXISTING_STANDARD_APPROVED');
  expect(accepted.sha256).toMatch(/^[a-f0-9]{64}$/u);
  const flat=release.find(row=>row.sku==='YU-0000890');
  const catalog=readCableCatalogProfile(flat);
  expect(catalog.known.geometry).toBe('flat');
  expect(catalog.issues).not.toContain('catalog-missing-or-ambiguous: Форма кабеля');
  const request = await prepareCableStyleRequest(root, catalog.profile);
  expect(request.technicalProfile.outerSheathGeometry).toBe('FLAT');
  expect(request.technicalProfile.insulatedCoreCount).toBe(2);
  expect(providerFactory).not.toHaveBeenCalled();
});

test('resolved KG thermoplastic modifier uses the known multi-core profile and preserves the stated materials', () => {
  const actual = release.find(product => product.sku === 'YU-0003902');
  const resolved = readCableCatalogProfile(actual);
  expect(resolved.issues).toEqual([]);
  expect(resolved.profile).toMatchObject({ cores: 2, geometry: 'round', conductorConstruction: 'stranded',
    hasOuterJacket: true, armor: false, shield: false });
  expect(resolved.profile.technicalConstruction.insulationMaterial).toBe('термоэластопласт');
  const unknown = { ...actual, designationDecoded: { ...actual.designationDecoded,
    tokens: actual.designationDecoded.tokens.filter(token => token.code !== 'тп') } };
  expect(readCableCatalogProfile(unknown).profile.schematicAssumptions).toBeDefined();
  expect(readCableCatalogProfile(release.find(product => product.sku === 'YU-0003894')).profile)
    .toMatchObject({ conductorConstruction: 'stranded', technicalConstruction: { outerMaterial: 'термоэластопласт' } });
});

test('reviewed mounting templates supply missing anatomy without changing grouped core counts', async () => {
  const product = release.find(row => row.sku === 'YU-0001677');
  const resolved = readCableCatalogProfile(product);
  expect(resolved.source.renderingBasis).toBe('scope-family-0076-hka');
  expect(resolved.profile).toMatchObject({ conductorConstruction: 'stranded', geometry: 'round', shield: false, armor: false });
  const request = await prepareCableStyleRequest(root, resolved.profile);
  expect(request.technicalProfile.insulatedCoreCount).toBe(product.cores * (product.groupCores ?? 1));
  const conflict = readCableCatalogProfile({ ...product, specs: { ...product.specs, 'Экранированный': 'Да' } });
  expect(conflict.profile).toBeNull();
  expect(conflict.issues.join(' ')).toMatch(/Экранированный/);
  expect(readCableCatalogProfile({ ...product, designationDecoded: { ...product.designationDecoded,
    constructionEvidence: { status: 'unconfirmed' } } }).source.renderingBasis).toBeUndefined();
});

test('assumed screen placement is marked and tinned copper stays distinct from aluminium', () => {
  const screened = readCableCatalogProfile(release.find(row => row.sku === 'YU-0001786'));
  expect(screened.known).toMatchObject({ cores: 2, shield: true, geometry: 'round' });
  expect(screened.profile.schematicAssumptions['Расположение экрана'].status).toBe('UNCONFIRMED');
  const tinned = readCableCatalogProfile(release.find(row => row.sku === 'YU-0001639'));
  expect(tinned.profile).toMatchObject({ conductorMaterial: 'copper', conductorFinish: 'tinned' });
});

test('documented control cable uses its inner sheath and filling as one extrusion', async () => {
  const product = release.find(row => row.sku === 'YU-0003111');
  const resolved = readCableCatalogProfile(product);
  expect(resolved.issues).toEqual([]);
  const request = await prepareCableStyleRequest(root, resolved.profile);
  expect(request.technicalProfile.layers.map(layer => layer.role)).toEqual([
    'outer-jacket', 'inner-sheath', 'interstitial-filling', 'individual-insulation',
  ]);
  expect(request.technicalProfile.armor.present).toBe(false);
  expect(request.technicalProfile.screen.present).toBe(false);
  expect(request.prompt).toContain('fills the interstices as one continuous extrusion');
});

test('reviewed signal cable separates the common shield and drain from grouped conductors', async () => {
  const product = release.find(row => row.sku === 'YU-0003621');
  const resolved = readCableCatalogProfile(product);
  const request = await prepareCableStyleRequest(root, resolved.profile);
  expect(request.technicalProfile.layers.map(layer => layer.role)).toEqual([
    'outer-jacket', 'screen', 'individual-insulation',
  ]);
  expect(request.technicalProfile.armor.present).toBe(false);
  expect(request.technicalProfile.groups.coresPerGroup).toBe(2);
  expect(request.technicalProfile.additionalConductors).toEqual([{ role: 'screen-drain', count: 1, insulated: false }]);
});
