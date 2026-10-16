import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { createCatalogStore } from '../lib/catalog.js';
import {
  loadCableImageConfig,
  loadCableImageProducts,
  runCableImages,
  approveCableImage,
  approveCableImageGroups,
} from './lib/cableImagePipeline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const HELP = `Cable catalogue image pipeline — one image per visual group

node scripts/generateCableImages.js --dry-run --json > outputs/cable-image-plan.json
node scripts/generateCableImages.js --sku YU-0000815 --dry-run --json > outputs/pilot-plan.json
node scripts/generateCableImages.js --sku YU-0000815 --plan outputs/pilot-plan.json
node scripts/generateCableImages.js approve --sku YU-0000815 --review review.json
node scripts/generateCableImages.js approve-batch --review batch-reviews.json

--config PATH       Configuration JSON, relative to project root
--catalog PATH      Product JSON; defaults to CATALOG_PRODUCTS_FILE or config
--sku SKU           Select groups containing these SKUs; includes ALL group members
--limit N           Maximum visual GROUPS, applied after full-catalog grouping
--sort stock        Order groups by maximum member stock; not sales popularity
--missing-only      Default: preserve existing images and completed/pending groups
--force             Intentional regeneration, versioned file, old images preserved
--all               Explicitly allow all eligible groups for a later run
--dry-run           Full catalog by default. No API calls, no locks, no writes
--plan PATH         Matching saved dry-run required for generation/ingest/binding
--json              Full report: totals, groups, all member SKUs/sections, paths/prompts

Ingest: ingest --sku SKU --plan PATH --image PATH --source-provider NAME --source-model NAME
Generation requires the configured API key. Review is per group; approval binds
all eligible members. See docs/cable-image-pipeline.md.
`;

export async function main(args = process.argv.slice(2)) {
  const command =
    args[0] && !args[0].startsWith('-') ? args.shift() : 'generate';
  if (!['generate', 'ingest', 'approve', 'approve-batch'].includes(command))
    throw new Error(`Unknown command: ${command}`);
  const { values } = parseArgs({
    args,
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
      image: { type: 'string' },
      review: { type: 'string' },
      plan: { type: 'string' },
      'source-provider': { type: 'string' },
      'source-model': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
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
  if (
    ['ingest', 'approve'].includes(command) &&
    (skus?.length !== 1 || values['dry-run'] || values.all || values.limit)
  )
    throw new Error(
      `${command} requires exactly one --sku and does not accept --dry-run, --all or --limit`
    );
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
  if (command === 'approve-batch') {
    if (
      !values.review ||
      values.sku ||
      values.all ||
      values.limit ||
      values['dry-run']
    )
      throw new Error(
        'approve-batch requires only --review JSON with {reviews: [...]}'
      );
    const input = JSON.parse(
      await fs.readFile(path.resolve(values.review), 'utf8')
    );
    const result = await approveCableImageGroups({
      ...context,
      existingImages,
      reviews: input.reviews,
      onProgress: (event) => console.error(JSON.stringify(event)),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
    return;
  }
  if (command === 'approve') {
    if (!values.review) throw new Error('approve requires --review JSON');
    const review = JSON.parse(
      await fs.readFile(path.resolve(values.review), 'utf8')
    );
    const result = await approveCableImage({
      ...context,
      sku: skus[0],
      review,
      existingImages,
    });
    console.log(
      JSON.stringify(
        {
          sku: result.sku,
          status: result.status,
          image: result.public_url,
          visualKey: result.visualKey,
          products: result.products.length,
          metadata: path.join(
            config.groupMetadataDir,
            `${result.visualKey}.json`
          ),
        },
        null,
        2
      )
    );
    return;
  }
  let ingest;
  if (command === 'ingest') {
    if (!values.image || !values['source-provider'] || !values['source-model'])
      throw new Error(
        'ingest requires --image, --source-provider and --source-model (actual provenance)'
      );
    ingest = {
      file: path.resolve(values.image),
      provider: values['source-provider'],
      model: values['source-model'],
    };
  }
  const savedPlan = values.plan
    ? JSON.parse(await fs.readFile(path.resolve(values.plan), 'utf8'))
    : null;
  const report = await runCableImages({
    ...context,
    options: {
      skus,
      limit: values.limit ? Number(values.limit) : undefined,
      sort: values.sort,
      force: values.force,
      dryRun: values['dry-run'],
      all: values.all,
      existingImages,
      planId: savedPlan?.schemaVersion === 2 ? savedPlan.planId : undefined,
    },
    ingest,
    onProgress: (event) => console.error(JSON.stringify(event)),
  });
  if (values.json || values['dry-run'])
    console.log(
      JSON.stringify({ catalog: config.catalogFile, ...report }, null, 2)
    );
  else
    console.log(
      JSON.stringify(
        {
          summary: report.summary,
          images: report.results.map((r) => ({
            visualKey: r.visualKey,
            products: r.products.length,
            status: r.status,
            output: r.output_filename,
            error: r.error,
          })),
          skipped: report.skipped,
        },
        null,
        2
      )
    );
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
