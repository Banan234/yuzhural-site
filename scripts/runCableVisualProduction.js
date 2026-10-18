import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { loadCableImageConfig } from './lib/cableImagePipeline.js';
import {
  makeProductionPlan,
  writeProductionJson,
  runVisualProduction,
} from './lib/cableVisualProduction.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, 'data/product-image-metadata/production-v1');
const reportDir = path.join(root, 'outputs/cable-image-production-2026-10-16');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      prepare: { type: 'boolean' },
      run: { type: 'boolean' },
      status: { type: 'boolean' },
    },
  });
  if ([values.prepare, values.run, values.status].filter(Boolean).length !== 1)
    throw new Error('Choose --prepare, --run or --status');
  const planFile = path.join(stateDir, 'plan.json');
  if (values.status) {
    const manifest = await read(path.join(stateDir, 'manifest.json'));
    const { productionSummary } =
      await import('./lib/cableVisualProduction.js');
    console.log(
      JSON.stringify(
        productionSummary(
          await read(planFile),
          manifest,
          (await read(path.join(root, 'shared/rejectedProductImages.json')))
            .byVisualKey
        ),
        null,
        2
      )
    );
    return;
  }
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
  const { config } = await loadCableImageConfig(root);
  if (
    config.provider !== 'codex-sale' ||
    config.apiBaseUrl.replace(/\/$/u, '') !== 'https://codex.sale/v1' ||
    config.apiKeyEnv !== 'IMAGE_API_KEY' ||
    config.model !== 'gpt-image-2.5-flare' ||
    config.imageEndpoint !== 'generations'
  )
    throw new Error(
      'Production requires the approved separate codex.sale Images API configuration'
    );
  if (!process.env.IMAGE_API_KEY)
    throw new Error('Separate IMAGE_API_KEY is missing');
  // Advisory canvas dimensions; no normalization or object enlargement. The provider adapter is unchanged.
  config.concurrency = 2;
  config.composition = { ...config.composition, rightEdgeCrop: false };
  const renderConfig = {
    provider: config.provider,
    apiBaseUrl: config.apiBaseUrl,
    endpoint: '/images/generations',
    model: config.model,
    size: config.size,
    quality: config.quality,
    background: config.background,
    format: config.format,
    style: 'approved-compact-catalogue',
    templateVersion: 'visual-profile-production-v1',
    concurrency: config.concurrency,
    retries: config.retries,
    timeoutMs: config.timeoutMs,
    referenceSha256: config.styleReferenceHash,
  };
  if (values.prepare) {
    const audit = await read(
      path.join(root, 'outputs/cable-visual-practical-2026-10-16/audit.json')
    );
    for (const [file, expected] of Object.entries(audit.integrity.after))
      if (sha(await fs.readFile(path.join(root, file))) !== expected)
        throw new Error(
          `Approved dry-run input or existing image changed: ${file}`
        );
    const plan = makeProductionPlan(
      audit,
      await read(config.catalogFile),
      renderConfig
    );
    try {
      const old = await read(planFile);
      if (old.planId !== plan.planId)
        throw new Error('Another production plan already exists');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await writeProductionJson(planFile, plan);
    await writeProductionJson(path.join(reportDir, 'preflight.json'), {
      planId: plan.planId,
      counts: plan.counts,
      renderConfig,
      separateKeyConfigured: true,
      protectedFilesVerified: Object.keys(audit.integrity.after).length,
      apiRequests: 0,
    });
    console.log(
      JSON.stringify(
        {
          prepared: true,
          planId: plan.planId,
          counts: plan.counts,
          renderConfig,
        },
        null,
        2
      )
    );
    return;
  }
  const plan = await read(planFile);
  if (JSON.stringify(plan.renderConfig) !== JSON.stringify(renderConfig))
    throw new Error('Render configuration changed after preparation');
  const report = await runVisualProduction({
    root,
    plan,
    config,
    stateDir,
    onProgress: (event) => {
      const { summary, ...details } = event;
      console.log(
        JSON.stringify({
          ...details,
          done: summary
            ? summary.reuseExisting.visualKeys + summary.generated.visualKeys
            : undefined,
          generated: summary?.generated.visualKeys,
          failed: summary?.failed.length,
          apiRequests: summary?.apiRequests,
        })
      );
    },
  });
  await writeProductionJson(path.join(reportDir, 'summary.json'), report);
  console.log(JSON.stringify(report, null, 2));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
