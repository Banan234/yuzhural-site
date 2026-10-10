// Проверки безопасной замены набора артефактов импорта.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { commitArtifactBatch } from './artifactTransaction.js';

const tempDirs = [];

async function createTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'price-artifact-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe('commitArtifactBatch', () => {
  it('заменяет, добавляет и удаляет артефакты после подготовки', async () => {
    const root = await createTempDir();
    const target = path.join(root, 'products.json');
    const stale = path.join(root, 'stale.xml');
    const staged = path.join(root, 'stage-products.json');
    await fs.writeFile(target, 'old');
    await fs.writeFile(stale, 'stale');
    await fs.writeFile(staged, 'new');

    await expect(
      commitArtifactBatch([
        { stagedPath: staged, targetPath: target },
        { targetPath: stale },
      ])
    ).resolves.toEqual({ committed: 2 });
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('new');
    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('откатывает уже заменённый файл, если последующая замена невозможна', async () => {
    const root = await createTempDir();
    const target = path.join(root, 'products.json');
    const staged = path.join(root, 'stage-products.json');
    const invalidParent = path.join(root, 'not-a-directory');
    await fs.writeFile(target, 'original');
    await fs.writeFile(staged, 'replacement');
    await fs.writeFile(invalidParent, 'file');

    await expect(
      commitArtifactBatch([
        { stagedPath: staged, targetPath: target },
        {
          stagedPath: staged,
          targetPath: path.join(invalidParent, 'artifact.json'),
        },
      ])
    ).rejects.toThrow();
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('original');
  });

  it('заменяет целую директорию prerender, не оставляя старые карточки', async () => {
    const root = await createTempDir();
    const targetDir = path.join(root, 'product');
    const stagedDir = path.join(root, 'stage-product');
    await fs.mkdir(targetDir);
    await fs.mkdir(stagedDir);
    await fs.writeFile(path.join(targetDir, 'old.html'), 'old');
    await fs.writeFile(path.join(stagedDir, 'new.html'), 'new');

    await commitArtifactBatch([
      { stagedPath: stagedDir, targetPath: targetDir },
    ]);
    await expect(
      fs.readFile(path.join(targetDir, 'new.html'), 'utf8')
    ).resolves.toBe('new');
    await expect(
      fs.access(path.join(targetDir, 'old.html'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('проверяет наличие всех staged файлов до замены', async () => {
    const root = await createTempDir();
    const target = path.join(root, 'products.json');
    await fs.writeFile(target, 'original');

    await expect(
      commitArtifactBatch([
        { stagedPath: path.join(root, 'missing.json'), targetPath: target },
      ])
    ).rejects.toThrow(/Не найден подготовленный файл/);
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('original');
  });
});
