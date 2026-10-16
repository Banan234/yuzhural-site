import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  runCableImageModelComparison,
  IMAGE_MODEL_TESTS,
  CABLE_MODEL_TEST_PROMPT,
} from './testCableImageModels.js';
import { ImageProviderError } from './lib/cableImageProvider.js';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cable-model-comparison-')
  );
  directories.push(root);
  const png = new PNG({ width: 32, height: 16 });
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 28; x++)
      png.data.set([200, 0, 0, 255], (y * 32 + x) * 4);
  const generate = vi.fn(async () => ({
    buffer: PNG.sync.write(png),
    httpStatus: 200,
    requestId: 'fixture-request',
  }));
  const providerFactory = vi.fn(() => ({ generate }));
  return {
    config: {
      provider: 'codex-sale',
      apiBaseUrl: 'https://example.test/v1',
      apiKeyEnv: 'IMAGE_API_KEY',
      model: 'gpt-image-2.5-flare',
      size: '1536x1024',
      quality: 'high',
      retries: 4,
      referenceImage: '/must-not-use.png',
    },
    outputDir: path.join(root, 'results'),
    env: { IMAGE_API_KEY: 'fixture-comparison-secret' },
    providerFactory,
    generate,
  };
}

describe('four-model comparison budget and isolation', () => {
  it('defaults to a no-write no-request plan with exactly four fixed model/file pairs', async () => {
    const f = await fixture();
    const report = await runCableImageModelComparison({ ...f, dryRun: true });
    expect(report.results).toEqual(
      IMAGE_MODEL_TESTS.map((test) => ({ ...test, status: 'pending' }))
    );
    expect(f.providerFactory).not.toHaveBeenCalled();
    await expect(fs.stat(f.outputDir)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('sends identical prompts once per model, saves raw dimensions and never repeats a claimed slot', async () => {
    const f = await fixture();
    const report = await runCableImageModelComparison(f);
    expect(f.generate).toHaveBeenCalledTimes(4);
    expect(
      f.generate.mock.calls.every(
        ([job]) => job.prompt === CABLE_MODEL_TEST_PROMPT
      )
    ).toBe(true);
    expect(f.providerFactory.mock.calls.map(([c]) => c.model)).toEqual(
      IMAGE_MODEL_TESTS.map((test) => test.model)
    );
    expect(
      f.providerFactory.mock.calls.every(
        ([c]) =>
          c.retries === 0 &&
          c.referenceImage === null &&
          c.imageEndpoint === 'generations'
      )
    ).toBe(true);
    expect(
      report.results.every(
        (row) =>
          row.status === 'success' &&
          row.httpStatus === 200 &&
          row.width === 32 &&
          row.height === 16 &&
          row.hasTransparency
      )
    ).toBe(true);
    for (const test of IMAGE_MODEL_TESTS)
      await fs.access(path.join(f.outputDir, test.filename));
    expect(
      await fs.readFile(path.join(f.outputDir, 'report.json'), 'utf8')
    ).not.toContain('fixture-comparison-secret');
    await runCableImageModelComparison(f);
    expect(f.generate).toHaveBeenCalledTimes(4);
    expect(await fs.readdir(path.dirname(f.outputDir))).toEqual(['results']);
  });
  it('records an HTTP failure without retries and preserves the four-request ceiling on rerun', async () => {
    const f = await fixture();
    f.generate.mockRejectedValueOnce(
      new ImageProviderError('Image API returned HTTP 500', true, 500)
    );
    const report = await runCableImageModelComparison(f);
    expect(report.results[0]).toMatchObject({
      status: 'failed',
      httpStatus: 500,
      attempts: 1,
    });
    expect(report.results.filter((r) => r.status === 'success')).toHaveLength(
      3
    );
    await runCableImageModelComparison(f);
    expect(f.generate).toHaveBeenCalledTimes(4);
  });
  it('never retries an interrupted request whose outcome is unknown', async () => {
    const f = await fixture();
    await runCableImageModelComparison(f);
    const file = path.join(f.outputDir, 'report.json');
    const report = JSON.parse(await fs.readFile(file, 'utf8'));
    report.results[0].status = 'requesting';
    await fs.writeFile(file, JSON.stringify(report));
    await runCableImageModelComparison(f);
    expect(f.generate).toHaveBeenCalledTimes(4);
  });
});
