import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { createCatalogStore } from '../lib/catalog.js';
import {
  loadCableImageConfig,
  loadCableImageProducts,
  planCableImages,
} from './lib/cableImagePipeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const HELP = `Legacy cable catalogue dry-run report — one image per visual group

node scripts/generateCableImages.js --dry-run --json > outputs/cable-image-plan.json
node scripts/generateCableImages.js --sku YU-0000815 --dry-run --json > outputs/pilot-plan.json

--config PATH       Configuration JSON, relative to project root
--catalog PATH      Product JSON; defaults to CATALOG_PRODUCTS_FILE or config
--sku SKU           Select groups containing these SKUs; includes ALL group members
--limit N           Maximum visual GROUPS, applied after full-catalog grouping
--sort stock        Order groups by maximum member stock; not sales popularity
--missing-only      Default: preserve existing images and completed/pending groups
--force             Include existing images in the historical report
--all               Include all eligible groups
--dry-run           Full catalog by default. No API calls, no locks, no writes
--json              Retained for existing dry-run commands (JSON is the default)
`;

export async function main(args = process.argv.slice(2)) {
  const [command, ...flags] = args;
  if (['ingest', 'approve', 'approve-batch'].includes(command))
    throw new Error('Legacy generation/ingest/approval disabled by CABLE_IMAGE_STYLE.md; use the protected style draft workflow.');
  const { values } = parseArgs({
    args: command === 'generate' ? flags : args,
    strict: true,
    options: {
      help: { type: 'boolean' },
      config: { type: 'string' },
      catalog: { type: 'string' },
      sku: { type: 'string', multiple: true },
      limit: { type: 'string' },
      sort: { type: 'string' },
      'missing-only': { type: 'boolean' },
      force: { type: 'boolean' },
      all: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (!values['dry-run'])
    throw new Error(
      'Legacy generation/ingest/approval disabled by CABLE_IMAGE_STYLE.md; use the protected style draft workflow.'
    );
  if (values.force && values['missing-only'])
    throw new Error('--force and --missing-only are mutually exclusive');
  if (
    values.limit !== undefined &&
    (!/^[1-9]\d*$/u.test(values.limit) ||
      !Number.isSafeInteger(Number(values.limit)))
  )
    throw new Error('--limit must be a positive integer');
  if (values.sort && !['stock', 'catalog'].includes(values.sort))
    throw new Error('--sort must be stock or catalog');
  const skus = values.sku?.flatMap((v) =>
    v
      .split(',')
      .map((sku) => sku.trim())
      .filter(Boolean)
  );
  if (values.sku && !skus.length) throw new Error('--sku must not be empty');
  const loaded = await loadCableImageConfig(root, values.config);
  const { config } = loaded;
  config.catalogFile = path.resolve(
    root,
    values.catalog || process.env.CATALOG_PRODUCTS_FILE || config.catalogFile
  );
  const products = await loadCableImageProducts(config.catalogFile);
  // Resolve storefront overrides against the same in-memory catalog snapshot;
  // loadCableImageProducts also accepts exported {items: []} catalogs.
  const catalogSnapshot = JSON.stringify(products);
  const visibleProducts = await createCatalogStore({
    productsFile: config.catalogFile,
    fs: {
      stat: fs.stat,
      readFile: (file, ...args) =>
        path.resolve(file) === config.catalogFile
          ? Promise.resolve(catalogSnapshot)
          : fs.readFile(file, ...args),
    },
  }).loadCatalogProducts();
  const existingImages = Object.fromEntries(
    visibleProducts.map((p) => [p.sku, p.image])
  );
  const context = { root, products, ...loaded };
  const report = await planCableImages({
    ...context,
    options: {
      skus,
      limit: values.limit ? Number(values.limit) : undefined,
      sort: values.sort,
      force: values.force,
      all: values.all,
      existingImages,
    },
  });
  console.log(JSON.stringify({ catalog: config.catalogFile, ...report }, null, 2));
  if (report.summary.failed) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
