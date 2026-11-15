import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogStore } from '../lib/catalog.js';
import { digest } from './lib/cableStyleBatch.js';
import { loadCableImageStyle } from './lib/cableImageStyle.js';
import { buildCableGenerationQueue } from './lib/cableGenerationQueue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.slice(2).join(' ') !== '--dry-run')
  throw Error('Use --dry-run to prepare the generation queue');
const read = async file => JSON.parse(await fs.readFile(path.join(root, file)));
const [rules, familyVisualRules, knowledge, colorRules, bindings, overrides,
  registry, historicalPlan, reviewedConstructions] = await Promise.all([
  'data/cableVisualClassificationRules.json', 'data/familyVisualRules.json',
  'shared/designationKnowledgeBase.json', 'data/cableImageColors.json',
  'shared/generatedProductImages.json', 'data/priceOverrides.json',
  'data/cable-approved-results/registry.json', 'data/product-image-metadata/production-v1/plan.json',
  'data/cableGenerationReviewedConstructions.json',
].map(read));
const release = await fs.realpath(path.join(root, 'data/catalog-current'));
const productsFile = path.join(release, 'products.json');
const products = JSON.parse(await fs.readFile(productsFile));
const visibleProducts = await createCatalogStore({ productsFile }).loadCatalogProducts();
const style = await loadCableImageStyle(root);
const pendingKeys = new Set();
for (const folder of await fs.readdir(path.join(root, 'outputs'), { withFileTypes: true })) {
  if (!folder.isDirectory() || !folder.name.startsWith('cable-')) continue;
  const directory = path.join(root, 'outputs', folder.name);
  const subdirectories = (await fs.readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => path.join(directory, entry.name));
  for (const dir of [directory, ...subdirectories]) {
    const optional = file => read(path.join(path.relative(root, dir), file)).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const review = await optional('review.json');
    if (review?.status !== 'NEEDS_REVIEW' ||
        review.standardVersion !== style.version) continue;
    const group = await optional('group.json');
    const request = await optional('request.json');
    const key = group?.visualKey ?? request?.visualKey ?? review.visualKey;
    const sha = review.validation?.sha256 ?? review.sha256;
    if (!key || !sha) continue;
    const png = await fs.readFile(path.join(dir, 'image.png')).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (png && digest(png) === sha) pendingKeys.add(key);
  }
}
const queue = await buildCableGenerationQueue({
  root, products, visibleProducts, bindings, overrides, registry, historicalPlan,
  context: { rules, familyVisualRules, knowledge, colorRules },
  reviewedConstructions, pendingKeys: [...pendingKeys],
});
const out = path.join(root, 'outputs/cable-generation-queue');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'queue.json'), JSON.stringify(queue, null, 2) + '\n');
console.log(JSON.stringify(queue.summary, null, 2));
