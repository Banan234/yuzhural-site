import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProduction } from './buildProduction.js';
import { resolveCatalogSnapshot } from './lib/catalogSnapshot.js';

describe('production build catalog isolation', () => {
  it('holds the import lock through steps, releases on failure and rejects concurrent builds', async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'build-catalog-')
    );
    try {
      const steps = [];
      await expect(
        buildProduction({
          projectRoot,
          run: async (step) => {
            steps.push(step);
            expect(
              JSON.parse(
                await fs.readFile(
                  path.join(projectRoot, 'data/.price-import.lock'),
                  'utf8'
                )
              ).pid
            ).toBe(process.pid);
            await expect(
              buildProduction({ projectRoot, run: async () => {} })
            ).rejects.toThrow(/уже выполняется/);
            if (step === 'prerender')
              throw new Error('synthetic preparation failure');
          },
        })
      ).rejects.toThrow(/synthetic/);
      expect(steps).toEqual(['build', 'prerender']);
      await expect(
        fs.access(path.join(projectRoot, 'data/.price-import.lock'))
      ).rejects.toMatchObject({ code: 'ENOENT' });
      const success = [];
      await buildProduction({
        projectRoot,
        run: async (step) => success.push(step),
      });
      expect(success).toEqual([
        'build',
        'prerender',
        'sync:runtime-artifacts',
        'precompress',
      ]);
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });
  it('prefers a pinned active release and fails closed on a broken active pointer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snapshot-catalog-'));
    try {
      await fs.mkdir(path.join(root, 'data/release/public'), {
        recursive: true,
      });
      expect((await resolveCatalogSnapshot(root)).productsPath).toBe(
        path.join(root, 'data/products.json')
      );
      await fs.symlink('release', path.join(root, 'data/catalog-current'));
      const snapshot = await resolveCatalogSnapshot(root);
      expect(snapshot.productsPath).toBe(
        path.join(await fs.realpath(root), 'data/release/products.json')
      );
      expect(snapshot.priceSource).toBe(
        path.join(await fs.realpath(root), 'data/release/public/price.xls')
      );
      await fs.rm(path.join(root, 'data/release'), { recursive: true });
      await expect(resolveCatalogSnapshot(root)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
