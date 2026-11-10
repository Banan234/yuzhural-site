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
        const prompt = f.get('prompt');
        expect(prompt).toBe(request.prompt);
        expect(prompt).toContain('approved-cable-style-1.1.0');
        expect(prompt).toContain('MANDATORY CORE GEOMETRY');
        expect(prompt).toContain(`EXACTLY ${profile.cores}`);
        expect(prompt).toContain('SAME-diameter');
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
        const r = await generateCableStyleDraft({
          root,
          profile,
          outputDir: dir,
          env: { IMAGE_API_KEY: 'fake-test-key' },
          providerFactory: (c, o) =>
            createImageProvider(c, { ...o, fetchImpl }),
        });
        expect(r.status).toBe('NEEDS_REVIEW');
        expect(r.geometryCheck.pixelVerification).toBe('NOT_AUTOMATED');
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
it('uploads exact previous generation as second image for targeted jacket-cut correction', () =>
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
    const fetchImpl = vi.fn(async (url, o) => {
      const imgs = o.body.getAll('image[]');
      expect(imgs).toHaveLength(2);
      expect(sha(Buffer.from(await imgs[0].arrayBuffer()))).toBe(
        r.reference.sha256
      );
      expect(sha(Buffer.from(await imgs[1].arrayBuffer()))).toBe(
        r.editTarget.sha256
      );
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: [
            {
              b64_json: (
                await fs.readFile(path.join(root, editTarget))
              ).toString('base64'),
            },
          ],
        }),
      };
    });
    await createImageProvider(r.config, {
      env: { IMAGE_API_KEY: 'test-only' },
      fetchImpl,
    }).generate({ prompt: r.prompt });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  }));
