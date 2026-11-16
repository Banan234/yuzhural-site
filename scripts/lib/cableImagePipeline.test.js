import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { PNG } from 'pngjs';
import {
  loadCableImageConfig,
  loadCableImageProducts,
  planCableImages,
} from './cableImagePipeline.js';
import {
  buildCableImageJob,
  parseCableImageProduct,
  CABLE_IMAGE_ORIENTATION,
  hashImageData,
} from './cableImageSpec.js';
import {
  validateCableImagePng,
  prepareCableImagePng,
} from './cableImagePng.js';
import { createImageProvider } from './cableImageProvider.js';

const defaults = JSON.parse(
  await fs.readFile(
    new URL('../../data/cableImageConfig.json', import.meta.url),
    'utf8'
  )
);
const colors = JSON.parse(
  await fs.readFile(
    new URL('../../data/cableImageColors.json', import.meta.url),
    'utf8'
  )
);
const product = (section = 1.5, cores = 3, sku = 'TEST-1') => ({
  id: Number(sku.replace(/\D/gu, '')) || 1,
  sku,
  name: `ВВГнг(А)-LS ${cores}x${section}`,
  cores,
  crossSection: section,
  stock: 10,
});
const review = {
  cores: 3,
  colors: ['brown', 'blue', 'yellow-green'],
  orientation: 'right-to-left',
  uncropped: true,
  rightEdgeCropped: true,
  leftUncropped: true,
  topBottomClear: true,
  conductorConstruction: 'solid',
  noText: true,
  styleMatches: true,
  reviewer: 'test-review',
};
const dirs = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => fs.rm(p, { recursive: true, force: true }))
  );
});

function image({ opaque = false, cropped = false, empty = false } = {}) {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const offset = (y * 64 + x) * 4;
      const visible =
        !empty && x >= (cropped ? 0 : 10) && x < 54 && y >= 20 && y < 44;
      png.data.set([40, 70, 80, opaque || visible ? 255 : 0], offset);
    }
  return PNG.sync.write(png);
}

async function fixture(products = [product()]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-images-'));
  dirs.push(root);
  await fs.mkdir(path.join(root, 'data'));
  await fs.writeFile(
    path.join(root, 'data/cableImageColors.json'),
    JSON.stringify(colors)
  );
  await fs.writeFile(
    path.join(root, 'data/cableImageConfig.json'),
    JSON.stringify({
      ...defaults,
      size: '64x64',
      referenceImage: null,
      catalogFile: 'data/products.json',
      concurrency: 2,
    })
  );
  await fs.writeFile(
    path.join(root, 'data/products.json'),
    JSON.stringify(products)
  );
  const loaded = await loadCableImageConfig(root, undefined, { env: {} });
  return { root, products, ...loaded, options: { limit: 10 } };
}

describe('cable image specification and prompt', () => {
  it.each(['3x1.5', '3х1,5', '3×1.5', '3Х1,5'])(
    'reads %s from designation without treating opaque SKU as dimensions',
    (suffix) => {
      const p = parseCableImageProduct(
        { ...product(), name: `ВВГнг(А)-LS ${suffix}` },
        defaults,
        colors
      );
      expect(p).toMatchObject({
        sku: 'TEST-1',
        family: 'ВВГ',
        cores: 3,
        section: 1.5,
        colors: review.colors,
      });
    }
  );
  it('keeps each section in metadata but shares visual geometry, prompt and visual cache key', () => {
    const jobs = [1.5, 2.5, 4, 6].map((s, i) =>
      buildCableImageJob(
        product(s, 3, `TEST-${i + 1}`),
        defaults,
        colors,
        'reference'
      )
    );
    expect(jobs.map((j) => j.parameters.section)).toEqual([1.5, 2.5, 4, 6]);
    expect(new Set(jobs.map((j) => j.visual_key)).size).toBe(1);
    expect(new Set(jobs.map((j) => j.product_fingerprint)).size).toBe(4);
    expect(jobs[0].prompt).toContain(CABLE_IMAGE_ORIENTATION);
    expect(jobs[0].prompt).toContain(
      'exactly 3 conductors, no more and no fewer'
    );
  });
  it('separates visual identity from render settings and splits count or colors', () => {
    const a = buildCableImageJob(product(), defaults, colors, 'one');
    expect(
      buildCableImageJob(product(1.5, 5), defaults, colors, 'one').visual_key
    ).not.toBe(a.visual_key);
    expect(
      buildCableImageJob(product(), defaults, colors, 'two').visual_key
    ).toBe(a.visual_key);
    expect(
      buildCableImageJob(product(), defaults, colors, 'two').render_fingerprint
    ).not.toBe(a.render_fingerprint);
    const rules = structuredClone(colors);
    rules.skuOverrides['TEST-1'] = {
      colors: ['brown', 'black', 'grey'],
      source: 'verified supplier record',
    };
    expect(
      buildCableImageJob(product(), defaults, rules, 'one').visual_key
    ).not.toBe(a.visual_key);
  });
  it('can enable qualitative section bands through configuration', () => {
    const config = structuredClone(defaults);
    config.visualRules.families['ВВГнг(А)-LS'] = { sectionAffectsVisual: true };
    config.geometry = {
      sectionMode: 'bands',
      defaultThickness: 'standard',
      sectionBands: [
        { maxSection: 2.5, label: 'compact' },
        { maxSection: 1000, label: 'thicker' },
      ],
    };
    expect(
      parseCableImageProduct(product(1.5), config, colors).thicknessLabel
    ).toBe('compact');
    expect(
      buildCableImageJob(product(4), config, colors, null).visual_key
    ).not.toBe(
      buildCableImageJob(product(1.5), config, colors, null).visual_key
    );
  });
  it('counts auxiliary cores and preserves their section separately', () => {
    expect(
      parseCableImageProduct(
        { sku: 'KG-1', name: 'КГ 2х1.5+1х1' },
        defaults,
        colors
      )
    ).toMatchObject({
      primaryCores: 2,
      cores: 3,
      section: 1.5,
      groundCores: 1,
      groundSection: 1,
    });
  });
  it.each([
    [{ name: 'ВВГ 3х1.5' }, /SKU/],
    [{ sku: '../bad', name: 'ВВГ 3х1.5' }, /SKU/],
    [{ ...product(), cores: 4 }, /disagree/],
    [{ ...product(), crossSection: 4 }, /disagree/],
    [{ sku: 'PAIR-1', name: 'МКЭШВ 2х2х0.75' }, /Grouped/],
    [{ sku: 'BAD-1', name: 'ВВГ 3х(2х1' }, /Ambiguous/],
    [{ sku: 'NO-1', name: 'Belden 9842' }, /cores/],
    [{ sku: 'UNKNOWN-1', name: 'XYZ 3х1.5' }, /Unsupported/],
    [{ sku: 'FIRE-1', name: 'ВВГнг(А)-FRLS 3х1.5' }, /barrier/],
    [{ sku: 'CONTROL-1', name: 'КВВГ 19х1.5' }, /color rule/],
  ])('rejects unverified/ambiguous constructions: %j', (p, message) =>
    expect(() => parseCableImageProduct(p, defaults, colors)).toThrow(message)
  );
  it('keeps aluminium tips silver and recognizes flat variants', () => {
    const aluminium = buildCableImageJob(
      { sku: 'AL-1', name: 'АВВГ 3х2.5' },
      defaults,
      colors,
      null
    );
    expect(aluminium.prompt).toContain(
      'Exposed silvery aluminium conductor tips'
    );
    expect(aluminium.prompt).not.toContain('copper');
    expect(
      parseCableImageProduct(
        { sku: 'FLAT-1', name: 'ВВГнг(А)-LS 3х1.5 п ГОСТ' },
        defaults,
        colors
      ).shape
    ).toBe('flat');
    expect(
      parseCableImageProduct(
        { sku: 'PVS-1', name: 'ПВС 3х1 черн.' },
        defaults,
        colors
      ).jacket
    ).toBe('black PVC');
  });
});

describe('PNG validation', () => {
  const config = { ...defaults, size: '64x64' };
  it('decodes real alpha, accepts actual dimensions and reports visual defects without API errors', () => {
    expect(
      validateCableImagePng(image(), config).transparent_ratio
    ).toBeGreaterThan(0.5);
    expect(() => validateCableImagePng(Buffer.from('not PNG'), config)).toThrow(
      'PNG'
    );
    expect(
      validateCableImagePng(image(), { ...config, size: '128x128' })
    ).toMatchObject({ width: 64, height: 64, has_alpha_channel: true });
    expect(
      validateCableImagePng(image({ opaque: true }), config)
    ).toMatchObject({
      has_alpha_channel: true,
      has_transparency: false,
      warnings: expect.arrayContaining([
        expect.stringContaining('transparency'),
      ]),
    });
    expect(
      validateCableImagePng(image({ cropped: true }), config).warnings
    ).toContain('PNG subject touches the frame margin; review cropping');
    expect(
      validateCableImagePng(image({ empty: true }), config).warnings
    ).toEqual([expect.stringContaining('empty')]);
    const truncated = image().subarray(0, 100);
    expect(() => validateCableImagePng(truncated, config)).toThrow('decode');
  });
});

describe('approved final cable style', () => {
  it('uses the solid-core standard and intentional right crop consistently for every group', () => {
    for (const cores of [1, 2, 3, 4, 5]) {
      const job = buildCableImageJob(
        product(1.5, cores),
        defaults,
        colors,
        null
      );
      for (const phrase of [
        'solid-core copper conductors',
        'single solid round copper conductor inside each insulated core',
        'not stranded copper',
        'not a bundle of thin copper strands',
        'The intact black outer cable jacket extends all the way to and beyond the RIGHT edge',
        'The cable enters the image directly through the RIGHT frame boundary.',
        'The right end of the cable is intentionally cropped',
        'No visible end cap',
        'No empty transparent space',
        'gentle 8-degree diagonal',
        'Never crop the left tips, top or bottom',
      ])
        expect(job.prompt).toContain(phrase);
      expect(job.prompt).toContain(`Exactly ${cores} insulated conductors`);
      expect(job.prompt).not.toContain(
        'including its intact rear end on the right, must fit'
      );
      expect(job.parameters.strand).toBe('solid');
    }
  });
  it('keeps known stranded families/designations distinct and defaults unknown construction to solid', () => {
    for (const name of ['КГ 3х1.5', 'ПВС 3х1.5', 'ВВГ 3х1.5 мж']) {
      const job = buildCableImageJob(
        { sku: 'EXCEPTION', name },
        defaults,
        colors,
        null
      );
      expect(job.parameters.strand).toBe('stranded');
      expect(job.prompt).toContain('Verified construction exception');
      expect(job.prompt).not.toContain('not stranded copper');
    }
    const config = structuredClone(defaults);
    delete config.families['ВВГ'].strand;
    expect(
      parseCableImageProduct(
        { sku: 'DEFAULT', name: 'ВВГ 3х2.5' },
        config,
        colors
      ).strand
    ).toBe('solid');
    expect(() =>
      parseCableImageProduct(
        { sku: 'BAD', name: 'ВВГ 3х1.5 мж ож' },
        defaults,
        colors
      )
    ).toThrow('Conflicting');
  });
  it('permits right-edge foreground while reporting a gap and still protecting the left/top/bottom', () => {
    const decoded = PNG.sync.read(image());
    for (let y = 20; y < 44; y++)
      for (let x = 54; x < 64; x++)
        decoded.data.set([20, 20, 20, 255], (y * 64 + x) * 4);
    const validation = validateCableImagePng(PNG.sync.write(decoded), defaults);
    expect(validation.touches_right_edge).toBe(true);
    expect(validation.warnings).toEqual([]);
    expect(validateCableImagePng(image(), defaults).warnings).toContain(
      'Intact jacket does not reach the right edge; visual review required'
    );
  });
});

describe('codex.sale settings and optional canvas', () => {
  it('loads model/base from the environment without storing or falling back to any session key', async () => {
    const f = await fixture();
    const loaded = await loadCableImageConfig(f.root, undefined, {
      env: {
        IMAGE_API_BASE_URL: 'https://example.test/v1',
        IMAGE_MODEL: 'other-image',
        IMAGE_API_KEY: 'separate-fixture-secret',
        OPENAI_API_KEY: 'must-not-be-used',
      },
    });
    expect(loaded.config).toMatchObject({
      apiBaseUrl: 'https://example.test/v1',
      model: 'other-image',
      apiKeyEnv: 'IMAGE_API_KEY',
      imageEndpoint: 'generations',
    });
    expect(JSON.stringify(loaded)).not.toContain('separate-fixture-secret');
    expect(() =>
      createImageProvider(loaded.config, {
        env: { OPENAI_API_KEY: 'must-not-be-used' },
      })
    ).toThrow('IMAGE_API_KEY');
    expect(() =>
      createImageProvider(
        { ...loaded.config, apiKeyEnv: 'OPENAI_API_KEY' },
        { env: { OPENAI_API_KEY: 'must-not-be-used' } }
      )
    ).toThrow('separate IMAGE_API_KEY');
    expect(loaded.referenceHash).toBeNull();
  });
  it('requires actual alpha for transparent PNG and accepts non-requested dimensions', () => {
    const decoded = PNG.sync.read(image({ opaque: true }));
    const rgb = PNG.sync.write(decoded, { colorType: 2, inputColorType: 6 });
    expect(() => validateCableImagePng(rgb, defaults)).toThrow('alpha channel');
    const result = validateCableImagePng(image(), {
      ...defaults,
      size: '1536x1024',
    });
    expect(result).toMatchObject({
      width: 64,
      height: 64,
      requested_size: '1536x1024',
      has_alpha_channel: true,
      has_transparency: true,
    });
  });
  it('contains the image on a transparent canvas without changing subject proportions', () => {
    const processed = prepareCableImagePng(image(), {
      ...defaults,
      normalization: { enabled: true, width: 128, height: 64 },
      composition: undefined,
    });
    expect(processed.source_validation).toMatchObject({
      width: 64,
      height: 64,
    });
    expect(processed.validation).toMatchObject({
      width: 128,
      height: 64,
      bounds: { minX: 42, maxX: 85, minY: 20, maxY: 43 },
      has_transparency: true,
    });
    expect(processed.normalization).toMatchObject({
      method: 'contain',
      targetWidth: 64,
      targetHeight: 64,
      left: 32,
      top: 0,
    });
    const pixels = PNG.sync.read(processed.buffer);
    expect(pixels.data[(32 * 128 + 50) * 4 + 3]).toBe(255);
    expect(pixels.data[(32 * 128 + 10) * 4 + 3]).toBe(0);
  });
  it('always posts JSON generations for codex.sale even when a local style reference exists', async () => {
    const f = await fixture();
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ b64_json: image().toString('base64') }] }),
          { status: 200 }
        )
      );
    const result = await createImageProvider(
      {
        ...f.config,
        referenceImage: '/this-file-must-not-be-read.png',
        imageEndpoint: 'generations',
      },
      {
        env: {
          IMAGE_API_KEY: 'only-this-fixture-key',
          OPENAI_API_KEY: 'wrong',
        },
        fetchImpl: transport,
      }
    ).generate({ prompt: 'one test' });
    expect(transport.mock.calls[0][0].pathname).toBe('/v1/images/generations');
    expect(transport.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer only-this-fixture-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({
      n: 1,
      model: f.config.model,
    });
    expect(result.httpStatus).toBe(200);
  });
});

describe('generation state, persistence and publication', () => {
  it('dry-run requires no key and performs no writes or provider calls', async () => {
    const f = await fixture();
    const before = await fs.readdir(f.root);
    const result = await planCableImages({
      ...f,
      options: { limit: 1, dryRun: true },
    });
    expect(result.jobs[0]).toMatchObject({ sku: 'TEST-1', action: 'generate' });
    expect(await fs.readdir(f.root)).toEqual(before);
    await expect(fs.stat(f.config.metadataDir)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('ignores generation journals when reading historical per-SKU metadata', async () => {
    const f = await fixture();
    await fs.mkdir(f.config.metadataDir, { recursive: true });
    for (const file of ['generation-state.json', 'historical-generation-claims.json'])
      await fs.writeFile(path.join(f.config.metadataDir, file), '{}');
    const report = await planCableImages(f);
    expect(report.jobs[0]).toMatchObject({ sku: 'TEST-1', action: 'generate' });
  });
  it('preserves existing storefront overrides even when absent from raw catalog rows', async () => {
    const f = await fixture();
    const report = await planCableImages({
      ...f,
      options: {
        limit: 1,
        existingImages: { 'TEST-1': '/supplier-photo.webp' },
      },
    });
    expect(report.jobs).toHaveLength(0);
    expect(report.skipped[0].reason).toBe('existing_product_image');
  });
  it('limits visual groups and validates duplicate SKU data', async () => {
    const f = await fixture([product(), product(2.5, 3, 'TEST-2')]);
    expect(
      (await planCableImages({ ...f, options: { dryRun: true, limit: 1 } })).jobs
    ).toHaveLength(1);
    await fs.writeFile(
      f.config.catalogFile,
      JSON.stringify([product(), product()])
    );
    await expect(loadCableImageProducts(f.config.catalogFile)).rejects.toThrow(
      'Duplicate SKU'
    );
  });
});

describe('historical visual group planning', () => {
  it('plans one visual group for five sections', async () => {
    const products = [1.5, 2.5, 4, 6, 10].map((s, i) =>
      product(s, 3, `TEST-${i + 1}`)
    );
    const f = await fixture(products);
    const plan = await planCableImages({
      ...f,
      options: { dryRun: true },
    });
    expect(plan.summary).toMatchObject({
      total_skus: 5,
      skus_without_images: 5,
      unique_visual_groups: 1,
      new_images_required: 1,
      api_requests_planned: 1,
      api_requests_executed: 0,
    });
    expect(plan.groups[0]).toMatchObject({
      visualKey: 'vvgnga-ls__3core',
      family: 'ВВГнг(А)-LS',
      cores: 3,
      sectionAffectsVisual: false,
      image: 'vvgnga-ls__3core.png',
    });
    expect(plan.groups[0].products.map((p) => p.section)).toEqual([
      1.5, 2.5, 4, 6, 10,
    ]);
  });

  it('applies SKU selection and limits to complete groups, never to member rows', async () => {
    const f = await fixture([
      product(),
      product(2.5, 3, 'TEST-2'),
      product(4, 4, 'TEST-3'),
    ]);
    const plan = await planCableImages({
      ...f,
      options: { skus: ['TEST-2'], limit: 1 },
    });
    expect(plan.summary).toMatchObject({
      total_skus: 3,
      unique_visual_groups: 2,
      selected_visual_groups: 1,
      selected_skus: 2,
      api_requests_planned: 1,
    });
    expect(plan.groups[0].products.map((p) => p.sku)).toEqual([
      'TEST-1',
      'TEST-2',
    ]);
    const limited = await planCableImages({ ...f, options: { limit: 1 } });
    expect(limited.groups[0].products).toHaveLength(2);
  });

  it('preserves deterministic keys and plans across input order and commercial changes', async () => {
    const products = [product(), product(2.5, 3, 'TEST-2')];
    const f = await fixture(products);
    const before = await planCableImages(f);
    const after = await planCableImages({
      ...f,
      products: [...products].reverse().map((p) => ({
        ...p,
        price: 999,
        stock: 7,
        length: 200,
        article: 'other',
      })),
    });
    expect(after.planId).toBe(before.planId);
    expect(after.groups[0].visualKey).toBe(before.groups[0].visualKey);
  });

  it('never merges distinct family, flat construction, jacket color, strand or core count', async () => {
    const names = [
      'ВВГ 3x1.5',
      'ВВГнг(А)-LS 3x1.5',
      'АВВГ 3x1.5',
      'КГ 3x1.5',
      'ВВГнг(А)-LS 3x1.5 п',
      'ВВГнг(А)-LS 4x1.5',
      'ПВС 3x1.5',
      'ПВС 3x1.5 черн.',
      'ВВГнг(А)-LS 3x1.5 мж',
      'КГВВнг(А)-LS 3x1.5',
    ];
    const f = await fixture(
      names.map((name, i) => ({ sku: `TEST-${i}`, name }))
    );
    const plan = await planCableImages(f);
    expect(plan.groups).toHaveLength(9);
    expect(plan.summary.unsupported_skus).toBe(1);
    expect(plan.skipped.find((p) => p.sku === 'TEST-9').reason).toContain(
      'Unsupported family'
    );
    const keys = plan.groups.map((g) => g.visualKey);
    expect(keys).toContain('vvgnga-ls__3core');
    expect(keys).toContain('vvg-pnga-ls__3core');
    expect(keys).toContain('pvs__3core__jacket-black-pvc');
    expect(keys).toContain('vvgnga-ls__3core__strand-stranded');
    const white = buildCableImageJob(
      { sku: 'WHITE-1', name: 'ВВГ 3х1.5 п белый' },
      f.config,
      colors,
      null
    );
    expect(white.parameters.jacket).toBe('white PVC');
    expect(white.visualKey).toBe('vvg-p__3core__jacket-white-pvc');
    const orange = buildCableImageJob(
      { sku: 'ORANGE-1', name: 'ПВС 3х1 оранж' },
      f.config,
      colors,
      null
    );
    expect(orange.visualKey).toBe('pvs__3core__jacket-orange-pvc');
  });

  it('splits reviewed color exceptions but rejects unknown construction modifiers', async () => {
    const f = await fixture([
      product(),
      product(4, 3, 'TEST-2'),
      { sku: 'TEST-3', name: 'КГ 3х1.5 тп' },
    ]);
    const colorRules = structuredClone(colors);
    colorRules.skuOverrides['TEST-2'] = {
      colors: ['brown', 'black', 'grey'],
      source: 'supplier',
    };
    const plan = await planCableImages({ ...f, colorRules });
    expect(plan.groups).toHaveLength(2);
    expect(plan.summary.unsupported_skus).toBe(1);
    expect(plan.skipped[0].reason).toContain('Unverified visual modifier');
  });

  it('enables section grouping only for the configured family and keeps other families unified', async () => {
    const names = [
      'ВВГнг(А)-LS 3x1.5',
      'ВВГнг(А)-LS 3x4',
      'ПВС 3x1.5',
      'ПВС 3x4',
    ];
    const f = await fixture(
      names.map((name, i) => ({ sku: `TEST-${i}`, name }))
    );
    f.config.visualRules.families['ВВГнг(А)-LS'] = {
      sectionAffectsVisual: true,
    };
    const plan = await planCableImages(f);
    expect(plan.groups).toHaveLength(3);
    expect(plan.groups.find((g) => g.family === 'ПВС').products).toHaveLength(
      2
    );
    expect(
      plan.groups
        .filter((g) => g.family === 'ВВГнг(А)-LS')
        .map((g) => g.visualKey)
        .sort()
    ).toEqual(['vvgnga-ls__3core__s1p5', 'vvgnga-ls__3core__s4']);
  });

  it('adopts only the matching legacy pilot without dry-run mutation or new generation', async () => {
    const f = await fixture([
      product(),
      product(2.5, 3, 'TEST-2'),
      { sku: 'TEST-3', name: 'ВВГ 3х4' },
    ]);
    const job = buildCableImageJob(
      f.products[0],
      f.config,
      f.colorRules,
      f.referenceHash
    );
    const legacyPrompt = job.prompt.replace(
      'Cable family: ВВГнг(А)-LS.',
      'Cable family: ВВГ.'
    );
    const oldFile = 'public/product-images/generated/TEST-1-legacy.png';
    const legacy = {
      ...job,
      schemaVersion: undefined,
      visualKey: undefined,
      visual_key: job.legacy_render_fingerprint,
      prompt: legacyPrompt,
      prompt_hash: hashImageData(legacyPrompt),
      status: 'approved',
      output_filename: oldFile,
      public_url: '/product-images/generated/TEST-1-legacy.png',
      validation: validateCableImagePng(image(), f.config),
      visual_review: review,
      model: 'tool-managed',
      provider: 'codex-imagegen',
      created_at: '2026-10-15T00:00:00.000Z',
    };
    await fs.mkdir(f.config.outputDir, { recursive: true });
    await fs.mkdir(f.config.metadataDir, { recursive: true });
    await fs.writeFile(path.join(f.root, oldFile), image());
    const oldMetadataFile = path.join(f.config.metadataDir, 'TEST-1.json');
    await fs.writeFile(oldMetadataFile, JSON.stringify(legacy));
    const before = await fs.readFile(oldMetadataFile);
    const plan = await planCableImages({
      ...f,
      options: { dryRun: true, skus: ['TEST-2'] },
    });
    expect(plan.summary).toMatchObject({
      existing_group_images: 1,
      new_images_required: 0,
      reuse: 1,
    });
    expect(await fs.readFile(oldMetadataFile)).toEqual(before);
    await expect(fs.stat(f.config.groupMetadataDir)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('API adapter', () => {
  const config = { ...defaults, referenceImage: null, retryDelayMs: 0 };
  const key = { IMAGE_API_KEY: 'fixture-token' };
  const success = () =>
    new Response(
      JSON.stringify({ data: [{ b64_json: image().toString('base64') }] }),
      { headers: { 'x-request-id': 'test-request' } }
    );
  it('round-trips native fetch JSON and multipart against a local API server', async () => {
    const received = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      received.push({
        url: request.url,
        type: request.headers['content-type'],
        auth: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      });
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({ data: [{ b64_json: image().toString('base64') }] })
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const f = await fixture();
      const ref = path.join(f.root, 'reference.png');
      await fs.writeFile(ref, image());
      const local = {
        ...config,
        apiBaseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        retries: 0,
      };
      await createImageProvider(local, { env: key }).generate({
        prompt: 'native JSON',
      });
      await createImageProvider(
        { ...local, referenceImage: ref, imageEndpoint: 'edits' },
        { env: key }
      ).generate({ prompt: 'native multipart' });
      expect(received.map((r) => r.url)).toEqual([
        '/v1/images/generations',
        '/v1/images/edits',
      ]);
      expect(JSON.parse(received[0].body).prompt).toBe('native JSON');
      expect(received[1].type).toContain('multipart/form-data; boundary=');
      expect(received[1].body).toContain(
        'name="image[]"; filename="style-reference.png"'
      );
      expect(received[1].body).toContain('native multipart');
      expect(received.every((r) => r.auth === 'Bearer fixture-token')).toBe(
        true
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  it('retries transient HTTP errors, sends PNG/alpha/model settings and never retries a permanent 400', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(success());
    const provider = createImageProvider(config, {
      env: key,
      fetchImpl: transport,
      sleep: vi.fn(),
    });
    const attempts = vi.fn();
    const result = await provider.generate(
      { prompt: 'strict prompt' },
      { onAttempt: attempts }
    );
    expect(result.attempts).toBe(3);
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({
      model: 'gpt-image-2.5-flare',
      background: 'transparent',
      output_format: 'png',
      n: 1,
    });
    expect(transport.mock.calls[0][0].pathname).toBe('/v1/images/generations');
    expect(attempts.mock.calls.map(([n]) => n)).toEqual([1, 2, 3]);
    const permanent = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 400 }));
    await expect(
      createImageProvider(config, { env: key, fetchImpl: permanent }).generate({
        prompt: 'x',
      })
    ).rejects.toThrow('HTTP 400');
    expect(permanent).toHaveBeenCalledTimes(1);
  });
  it('includes the reference as multipart input and handles network failures with bounded retries', async () => {
    const f = await fixture();
    const ref = path.join(f.root, 'ref.png');
    await fs.writeFile(ref, image());
    const transport = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(success());
    await createImageProvider(
      { ...config, referenceImage: ref, imageEndpoint: 'edits' },
      { env: key, fetchImpl: transport, sleep: vi.fn() }
    ).generate({ prompt: 'same camera' });
    const [url, request] = transport.mock.calls[1];
    expect(url.pathname).toBe('/v1/images/edits');
    expect(request.body.get('image[]')).toBeInstanceOf(Blob);
    expect(request.body.get('background')).toBe('transparent');
    const failed = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      createImageProvider(config, {
        env: key,
        fetchImpl: failed,
        sleep: vi.fn(),
      }).generate({ prompt: 'x' })
    ).rejects.toThrow('network');
    expect(failed).toHaveBeenCalledTimes(3);
  });
  it('rejects missing credentials and malformed successful responses', async () => {
    expect(() => createImageProvider(config, { env: {} })).toThrow(
      'IMAGE_API_KEY'
    );
    const transport = vi.fn().mockResolvedValue(new Response('{"data":[] }'));
    await expect(
      createImageProvider(config, { env: key, fetchImpl: transport }).generate({
        prompt: 'x',
      })
    ).rejects.toThrow('base64');
  });
});
