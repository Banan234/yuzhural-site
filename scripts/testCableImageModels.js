import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadCableImageConfig } from './lib/cableImagePipeline.js';
import { createImageProvider } from './lib/cableImageProvider.js';
import { validateCableImagePng } from './lib/cableImagePng.js';
import { hashImageData } from './lib/cableImageSpec.js';

export const IMAGE_MODEL_TESTS = [
  { model: 'gpt-image-2.5-sunburst', filename: 'test-sunburst.png' },
  { model: 'gpt-image-2.5-flare', filename: 'test-flare.png' },
  { model: 'gpt-image-2', filename: 'test-image-2.png' },
  { model: 'gpt-image-1.5', filename: 'test-image-1.5.png' },
];

export const CABLE_MODEL_TEST_PROMPT = `Create a realistic professional product render of an electrical power cable, with realistic materials and soft studio lighting.

The cable has EXACTLY THREE insulated conductors. Exactly 3 insulated conductors. Exactly three. No fourth conductor. No additional wires.

The intact cable body enters the frame from the RIGHT side. The black outer jacket extends toward the RIGHT edge of the image. The stripped end and the three separated insulated conductors extend toward the LEFT side. Exposed copper tips are on the LEFT ends of the conductors. Never reverse or mirror this orientation. Do not place the intact body on the left. Do not direct the conductors toward the right.

Show precisely these three insulated conductors, one of each:
1. One yellow-and-green striped conductor (one wire, not two).
2. One blue conductor.
3. One brown conductor.

The black outer jacket ends near the center-right of the composition. Three distinct insulated conductors emerge naturally from it toward the left, each with one neat exposed copper tip on its left end. Exactly three conductors and exactly three copper tips.

Predominantly horizontal, slightly diagonal shallow three-quarter view. Consistent catalogue scale and centered composition. The entire short cable segment, including its intact rear end on the right and all three tips on the left, fits inside the image. Nothing cropped. Leave transparent margins around the entire object, including at the right edge.

Genuinely transparent background with real alpha. No floor, no scenery, no background shadows. No text, no logos, no markings, no labels, no watermark, no dimensions, no hands, no additional objects.`;

/** Standalone comparison: no catalog reads, metadata writes, bindings or automatic winner. */
export async function runCableImageModelComparison({
  config,
  outputDir,
  env = process.env,
  providerFactory = createImageProvider,
  dryRun = false,
  onProgress = () => {},
}) {
  const settings = {
    provider: config.provider,
    apiBaseUrl: config.apiBaseUrl,
    prompt: CABLE_MODEL_TEST_PROMPT,
    promptHash: hashImageData(CABLE_MODEL_TEST_PROMPT),
    size: config.size,
    quality: config.quality,
    format: 'png',
    background: 'transparent',
    endpoint: '/images/generations',
    retries: 0,
    maximumGenerationRequests: 4,
  };
  const initial = {
    schemaVersion: 1,
    ...settings,
    createdAt: new Date().toISOString(),
    results: IMAGE_MODEL_TESTS.map((test) => ({ ...test, status: 'pending' })),
  };
  if (dryRun) return initial;
  if (!env.IMAGE_API_KEY)
    throw new Error('Set the separate IMAGE_API_KEY before model comparison');
  const resolvedOutput = path.resolve(outputDir);
  if (
    resolvedOutput.includes(`${path.sep}public${path.sep}`) ||
    resolvedOutput.endsWith(`${path.sep}public`) ||
    resolvedOutput.includes(`${path.sep}data${path.sep}`)
  )
    throw new Error(
      'Model comparison must be outside public/ and catalog data directories'
    );
  await fs.mkdir(resolvedOutput, { recursive: true });
  const lockFile = path.join(resolvedOutput, '.comparison.lock');
  const lock = await fs.open(lockFile, 'wx');
  const reportFile = path.join(resolvedOutput, 'report.json');
  const persist = async (report) => {
    const temp = `${reportFile}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(report, null, 2)}\n`);
    await fs.rename(temp, reportFile);
  };
  try {
    let report;
    try {
      report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      report = initial;
    }
    for (const key of Object.keys(settings))
      if (JSON.stringify(report[key]) !== JSON.stringify(settings[key]))
        throw new Error(
          'Comparison settings changed; do not reuse the output directory'
        );
    if (
      JSON.stringify(
        report.results.map(({ model, filename }) => ({ model, filename }))
      ) !== JSON.stringify(IMAGE_MODEL_TESTS)
    )
      throw new Error('Unexpected model comparison ledger');
    for (const row of report.results) {
      if (!['pending', 'requesting', 'success', 'failed'].includes(row.status))
        throw new Error('Invalid comparison status');
      if (row.status === 'pending') {
        try {
          await fs.access(path.join(resolvedOutput, row.filename));
          throw new Error(
            `Output exists without a completed ledger: ${row.filename}`
          );
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
    }
    await fs.writeFile(
      path.join(resolvedOutput, 'prompt.txt'),
      `${CABLE_MODEL_TEST_PROMPT}\n`
    );
    await persist(report);
    for (const row of report.results) {
      // A claimed slot is never retried, even after interruption or HTTP failure.
      if (row.status !== 'pending') continue;
      row.status = 'requesting';
      row.startedAt = new Date().toISOString();
      row.attempts = 1;
      await persist(report);
      onProgress({ model: row.model, status: row.status });
      try {
        const testConfig = {
          ...config,
          model: row.model,
          apiKeyEnv: 'IMAGE_API_KEY',
          referenceImage: null,
          imageEndpoint: 'generations',
          retries: 0,
          background: 'transparent',
          format: 'png',
        };
        const provider = providerFactory(testConfig, { env });
        const result = await provider.generate({
          prompt: CABLE_MODEL_TEST_PROMPT,
        });
        // Save raw model output. Missing alpha is reported rather than triggering another request.
        const validation = validateCableImagePng(result.buffer, {
          ...testConfig,
          background: 'opaque',
        });
        await fs.writeFile(
          path.join(resolvedOutput, row.filename),
          result.buffer,
          { flag: 'wx' }
        );
        Object.assign(row, {
          status: 'success',
          httpStatus: result.httpStatus,
          width: validation.width,
          height: validation.height,
          bytes: result.buffer.length,
          hasAlphaChannel: validation.has_alpha_channel,
          hasTransparency: validation.has_transparency,
          transparentRatio: validation.transparent_ratio,
          nonOpaqueRatio: validation.non_opaque_ratio,
          sha256: validation.sha256,
          warnings: validation.warnings,
          requestId: result.requestId,
          usage: result.usage,
        });
      } catch (error) {
        row.status = 'failed';
        row.httpStatus = error.httpStatus ?? null;
        row.error =
          error.name === 'ImageProviderError' ||
          /PNG|EEXIST/u.test(error.message)
            ? error.message
            : 'Comparison failed; no retry was attempted';
      }
      row.finishedAt = new Date().toISOString();
      await persist(report);
      onProgress({
        model: row.model,
        status: row.status,
        httpStatus: row.httpStatus,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        hasTransparency: row.hasTransparency,
      });
    }
    return report;
  } finally {
    await lock.close();
    await fs.rm(lockFile, { force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      run: { type: 'boolean' },
      out: { type: 'string' },
      config: { type: 'string' },
    },
    strict: true,
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
  const { config } = await loadCableImageConfig(root, values.config);
  const outputDir = path.resolve(
    root,
    values.out ||
      `outputs/codex-sale-image-models-${new Date().toISOString().slice(0, 10)}`
  );
  const report = await runCableImageModelComparison({
    config,
    outputDir,
    dryRun: !values.run,
    onProgress: (event) => console.error(JSON.stringify(event)),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.results.some((r) => r.status === 'failed')) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
