import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { checkResponsiveImages } from './checkResponsiveImages.js';

it('rejects missing/corrupt derivatives and stale originals before building', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'responsive-check-'));
  try {
    await fs.mkdir(path.join(root, 'public/responsive-images'), {
      recursive: true,
    });
    await fs.mkdir(path.join(root, 'shared'));
    const original = Buffer.from('synthetic original');
    const derivative = path.join(root, 'public/responsive-images/320.webp');
    await fs.writeFile(path.join(root, 'public/fixture.png'), original);
    await fs.writeFile(
      path.join(root, 'shared/responsiveImageManifest.json'),
      JSON.stringify({
        images: {
          '/fixture.png': {
            sourceSha256: createHash('sha256').update(original).digest('hex'),
            width: 320,
            variants: [{ src: '/responsive-images/320.webp', width: 320 }],
          },
        },
      })
    );
    await expect(checkResponsiveImages(root)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await fs.writeFile(derivative, 'not an image');
    await expect(checkResponsiveImages(root)).rejects.toThrow('Invalid WebP');
    await fs.writeFile(derivative, 'RIFF0000WEBP');
    await expect(checkResponsiveImages(root)).resolves.toEqual({
      images: 1,
      files: 1,
    });
    await fs.writeFile(
      path.join(root, 'public/fixture.png'),
      'changed original'
    );
    await expect(checkResponsiveImages(root)).rejects.toThrow(
      'Stale responsive image'
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
