// Resolve the immutable active release once; legacy files are only a bootstrap fallback.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolveCatalogSnapshot(projectRoot) {
  const data = path.join(projectRoot, 'data');
  const active = path.join(data, 'catalog-current');
  const stat = await fs.lstat(active).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  // A broken active pointer must fail instead of silently using stale legacy data.
  const catalogDir = stat ? await fs.realpath(active) : data;
  const publicDir = path.join(catalogDir, 'public');
  return {
    catalogDir,
    publicDir,
    productsPath: path.join(catalogDir, 'products.json'),
    priceSource: path.join(stat ? publicDir : data, 'price.xls'),
  };
}
