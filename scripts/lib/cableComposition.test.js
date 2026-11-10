import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { it, expect, vi } from 'vitest';
import { validateCableImagePng } from './cableImagePng.js';
import {
  generateCableStyleDraft,
  prepareCableStyleRequest,
} from './cableImageStyle.js';
import {
  CABLE_REVIEW_IMAGE_CSS,
  comparisonImageWidth,
} from './cableReviewImages.js';
const root = path.resolve(import.meta.dirname, '../..');
function image({ gap = 0, aa = false, noise = false, left = 12 } = {}) {
  const p = new PNG({ width: 200, height: 100 });
  for (let y = 20; y < 65; y++)
    for (let x = left; x < 200 - gap; x++) {
      const i = (y * 200 + x) * 4;
      p.data[i] = 20;
      p.data[i + 1] = 20;
      p.data[i + 2] = 20;
      p.data[i + 3] = aa && x === 199 ? 64 : 255;
    }
  if (noise) for (const y of [4, 38, 90]) p.data[(y * 200 + 199) * 4 + 3] = 255;
  return PNG.sync.write(p);
}
const config = {
  background: 'transparent',
  composition: { rightEdgeCrop: true },
};
it('checks actual alpha edge, accepts antialiasing, and ignores isolated edge noise', () => {
  for (const aa of [false, true]) {
    const v = validateCableImagePng(image({ aa }), config);
    expect(v.compositionCheck.rightEdge.status).toBe('EDGE_EVIDENCE_PRESENT');
    expect(v.warnings).not.toContain(
      'Intact jacket does not reach the right edge; visual review required'
    );
  }
  for (const noise of [false, true]) {
    const v = validateCableImagePng(image({ gap: 20, noise }), config);
    expect(v.compositionCheck.rightEdge.status).toBe('NEEDS_REVIEW');
    expect(v.compositionCheck.automaticRegeneration).toBe(false);
  }
});
it('flags left clipping, accepts a preserved margin and never changes source bytes', () => {
  const bytes = image(),
    before = Buffer.from(bytes);
  expect(
    validateCableImagePng(bytes, config).compositionCheck.leftTips.status
  ).toBe('LEFT_MARGIN_PRESENT');
  expect(bytes.equals(before)).toBe(true);
  expect(
    validateCableImagePng(image({ left: 0 }), config).compositionCheck.leftTips
      .status
  ).toBe('NEEDS_REVIEW');
});
const profile = {
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
it('main generator records a real PNG composition warning with one stubbed call, no retries or pixel changes', async () => {
  const request = await prepareCableStyleRequest(root, profile);
  expect(request.prompt).toContain(
    'Intact body on RIGHT continues beyond right canvas edge'
  );
  expect(request.prompt).toContain(
    'bare conductor extensions on LEFT fully visible'
  );
  expect(request.prompt).toContain('Preserve reference global scale');
  expect(request.config.composition.rightEdgeCrop).toBe(true);
  const out = await fs.mkdtemp(path.join(root, 'outputs/composition-test-'));
  const bytes = image({ gap: 20 }),
    generate = vi.fn(async () => ({ buffer: bytes, httpStatus: 200 }));
  try {
    const args = {
      root,
      profile,
      outputDir: out,
      providerFactory: () => ({ generate }),
    };
    const result = await generateCableStyleDraft(args);
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.compositionCheck.rightEdge.status).toBe('NEEDS_REVIEW');
    expect(result.automaticProductionBinding).toBe(false);
    expect((await fs.readFile(path.join(out, 'image.png'))).equals(bytes)).toBe(
      true
    );
    expect(
      JSON.parse(await fs.readFile(path.join(out, 'review.json')))
        .compositionCheck
    ).toEqual(result.compositionCheck);
    await expect(generateCableStyleDraft(args)).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});
it('report images use natural proportions; comparison widths preserve the same pixel scale', async () => {
  expect(CABLE_REVIEW_IMAGE_CSS).toContain('height:auto;max-height:none');
  expect(comparisonImageWidth(1774, 1774)).toBe('100%');
  expect(comparisonImageWidth(887, 1774)).toBe('50%');
  expect(() => comparisonImageWidth(200, 100)).toThrow();
  const renderer = await fs.readFile(
    path.join(root, 'scripts/renderCableStyleReviews.js'),
    'utf8'
  );
  expect(renderer).toContain('${CABLE_REVIEW_IMAGE_CSS}');
  expect(renderer).not.toContain('max-height:450px');
  // CSS is not a validator input: a different container cannot turn edge evidence into a PNG failure.
  expect(
    validateCableImagePng(image(), config).compositionCheck.rightEdge.status
  ).toBe('EDGE_EVIDENCE_PRESENT');
});
