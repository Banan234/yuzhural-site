// Read-only screening aid for black-core copper cables. Pixel components are
// candidates for visual review, never automatic approval or regeneration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { writeProductionJson } from './lib/cableVisualProduction.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function copperTipRegions(png) {
  const { width: w, height: h, data } = png;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < Math.floor(w * 0.68); x++) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (
        data[i + 3] > 240 &&
        r > 80 &&
        g > 35 &&
        r > g * 1.1 &&
        g > b * 1.12 &&
        r - b > 35
      )
        mask[y * w + x] = 1;
    }
  const components = [];
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const stack = [i];
      let size = 0,
        minX = w,
        maxX = 0,
        minY = h,
        maxY = 0;
      mask[i] = 0;
      while (stack.length) {
        const n = stack.pop(),
          x = n % w,
          y = Math.floor(n / w);
        size++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const z of [n - 1, n + 1, n - w, n + w])
          if (
            z >= 0 &&
            z < mask.length &&
            mask[z] &&
            Math.abs((z % w) - x) <= 1
          ) {
            mask[z] = 0;
            stack.push(z);
          }
      }
      if (
        size > w * h * 0.00002 &&
        maxX - minX > w * 0.012 &&
        maxY - minY > h * 0.004
      )
        components.push({
          pixels: size,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        });
    }
  return components;
}
export async function main() {
  const dir = path.join(root, 'data/product-image-metadata/production-v1');
  const read = async (file) =>
    JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const plan = await read('plan.json'),
    manifest = await read('manifest.json');
  const rows = [];
  for (const g of plan.groups.filter(
    (g) =>
      g.action === 'MISSING' &&
      manifest.groups[g.visualKey]?.bound &&
      g.visualProfile.cores >= 6 &&
      g.visualProfile.coreColors.every((c) => c === 'black') &&
      g.visualProfile.conductorMaterial === 'copper'
  )) {
    const png = PNG.sync.read(
      await fs.readFile(path.join(root, 'public', g.image.slice(1)))
    );
    const regions = copperTipRegions(png);
    rows.push({
      visualKey: g.visualKey,
      image: g.image,
      width: png.width,
      height: png.height,
      expected: g.visualProfile.cores,
      detected: regions.length,
      needsVisualReview: regions.length !== g.visualProfile.cores,
      regions,
    });
  }
  const out = path.join(root, 'outputs/cable-image-production-2026-10-16');
  await writeProductionJson(path.join(out, 'copper-tip-screening.json'), {
    mode: 'read-only-candidates-require-visual-confirmation',
    rows,
  });
  const rejected = JSON.parse(
    await fs.readFile(
      path.join(root, 'shared/rejectedProductImages.json'),
      'utf8'
    )
  ).byVisualKey;
  const reviewed = await read('visual-review-passes.json');
  const pending = rows.filter(
    (r) =>
      r.needsVisualReview &&
      !rejected[r.visualKey] &&
      !reviewed.byVisualKey[r.visualKey]
  );
  const cards = pending
    .map(
      (r) =>
        `<article><h3>${r.visualKey}</h3><p>Требуется ${r.expected}; медных областей ${r.detected}</p><svg viewBox="0 0 ${r.width} ${r.height}"><image href="../../public${r.image}" width="${r.width}" height="${r.height}"/>${r.regions.map((b, i) => `<rect x="${b.x - 4}" y="${b.y - 4}" width="${b.width + 8}" height="${b.height + 8}" fill="none" stroke="red" stroke-width="2"/><text x="${b.x - 30}" y="${b.y + 12}" fill="red" font-size="25">${i + 1}</text>`).join('')}</svg></article>`
    )
    .join('');
  await fs.writeFile(
    path.join(out, 'tip-review.html'),
    `<!doctype html><html lang="ru"><meta charset="utf-8"><style>body{font:14px Arial;background:#eee}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}article{background:white;padding:15px;min-width:0}h3{overflow-wrap:anywhere;font-size:11px}svg{width:100%;background:#fff}</style><h1>Кандидаты для визуальной проверки</h1><p>Эвристика не считает изолированные жилы и не назначает FAILED автоматически. Проверить наложенные области на исходном PNG.</p><main>${cards}</main></html>`
  );
  console.log(
    JSON.stringify({
      screened: rows.length,
      candidates: rows
        .filter((r) => r.needsVisualReview)
        .map(({ regions, ...r }) => r),
    })
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
