import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function checkResponsiveImages(projectRoot) {
  const publicDir = path.resolve(projectRoot, 'public');
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(projectRoot, 'shared/responsiveImageManifest.json')
    )
  );
  let files = 0;
  function asset(url) {
    const file = path.resolve(publicDir, '.' + url);
    if (!url.startsWith('/') || !file.startsWith(publicDir + path.sep))
      throw new Error('Invalid image asset path');
    return file;
  }
  for (const [source, record] of Object.entries(manifest.images)) {
    const original = await fs.readFile(asset(source));
    if (
      createHash('sha256').update(original).digest('hex') !==
      record.sourceSha256
    )
      throw new Error(`Stale responsive image: ${source}`);
    const expected = [
      ...new Set(
        [320, 640, 960, record.width].map((n) => Math.min(n, record.width))
      ),
    ].sort((a, b) => a - b);
    if (
      JSON.stringify(record.variants.map((v) => v.width)) !==
      JSON.stringify(expected)
    )
      throw new Error(`Incomplete responsive image: ${source}`);
    for (const variant of record.variants) {
      if (!variant.src.startsWith('/responsive-images/'))
        throw new Error('Invalid derivative path');
      const data = await fs.readFile(asset(variant.src));
      if (
        data.toString('ascii', 0, 4) !== 'RIFF' ||
        data.toString('ascii', 8, 12) !== 'WEBP'
      )
        throw new Error(`Invalid WebP: ${variant.src}`);
      files += 1;
    }
  }
  return { images: Object.keys(manifest.images).length, files };
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  checkResponsiveImages(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  )
    .then((result) => console.log('Responsive images OK:', result))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
