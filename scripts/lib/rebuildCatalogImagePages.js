import fs from 'node:fs/promises';
import path from 'node:path';
import { withCatalogImagePolicy } from '../../shared/productImages.js';
import { isGeneratedCableImage } from '../../shared/generatedCableImagePath.js';

const entries = (dir) =>
  fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });

async function containsGeneratedImage(dir) {
  for (const entry of await entries(dir)) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && (await containsGeneratedImage(file)))
      return true;
    if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await fs.readFile(file, 'utf8');
      const images =
        html.match(/(?:\/product-images\/|\/responsive-images\/)[\w./-]+/gu) ||
        [];
      if (images.some(isGeneratedCableImage)) return true;
    }
  }
  return false;
}

// Backups retain their original HTML on disk. Only the staged copy can be published.
export async function rebuildCatalogImagePages({
  projectRoot,
  productsPath,
  publicDir,
  overridesPath,
  policy,
}) {
  const templateDir = path.resolve(projectRoot, process.env.PRERENDER_TEMPLATE_DIR || 'dist');
  const directories = ['product', 'catalog'].map((name) =>
    path.join(publicDir, name)
  );
  const oldPages = (await Promise.all(directories.map(entries))).some(
    (files) => files.length
  );
  if (!oldPages) return;
  const templateAvailable = await fs
    .access(path.join(templateDir, 'index.html'))
    .then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    );
  if (!templateAvailable) {
    if (
      policy ||
      (await Promise.all(directories.map(containsGeneratedImage))).some(Boolean)
    )
      throw new Error(
        'Для восстановления или обновления страниц с генерациями нужна актуальная сборка dist.'
      );
    return;
  }

  const {
    loadTemplate,
    loadProducts,
    prerenderProducts,
    prerenderCatalogRelease,
  } = await import('../prerender.js');
  const template = await loadTemplate({ outputDir: templateDir });
  const products = await loadProducts({ filePath: productsPath });
  const render = async () => {
    await prerenderProducts(template, products, {
      outputDir: publicDir,
      overridesPath,
      log: null,
    });
    await prerenderCatalogRelease(template, products, {
      outputDir: publicDir,
      templateDir,
      overridesPath,
    });
  };
  await withCatalogImagePolicy(policy, render);
}
