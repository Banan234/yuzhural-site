// Проверки общей блокировки ручного и планового импорта.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { acquirePriceImportLock } from './importLock.js';

const tempDirs = [];

async function createLockPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'price-import-lock-'));
  tempDirs.push(dir);
  return path.join(dir, 'data', '.price-import.lock');
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  );
});

describe('acquirePriceImportLock', () => {
  it('allows one owner and blocks a concurrent import until release', async () => {
    const lockFile = await createLockPath();
    const release = await acquirePriceImportLock(lockFile);

    expect(typeof release).toBe('function');
    await expect(acquirePriceImportLock(lockFile)).resolves.toBeNull();

    await release();
    await expect(acquirePriceImportLock(lockFile)).resolves.toBeInstanceOf(
      Function
    );
  });

  it('reclaims a stale lock before acquiring it', async () => {
    const lockFile = await createLockPath();
    await fs.mkdir(path.dirname(lockFile), { recursive: true });
    await fs.writeFile(lockFile, '{"pid":2147483647}');
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await fs.utimes(lockFile, old, old);

    const release = await acquirePriceImportLock(lockFile);
    expect(typeof release).toBe('function');
    await release();
  });

  it('does not delete a lock that has been replaced by another owner', async () => {
    const lockFile = await createLockPath();
    const release = await acquirePriceImportLock(lockFile);
    await fs.writeFile(lockFile, JSON.stringify({ token: 'new-owner' }));

    await release();
    await expect(fs.readFile(lockFile, 'utf-8')).resolves.toContain(
      'new-owner'
    );
  });
});

it('reclaims a fresh lock immediately when its owner is dead', async () => {
  const lockFile = await createLockPath();
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  await fs.writeFile(
    lockFile,
    JSON.stringify({ pid: 2147483647, token: 'dead' })
  );
  const release = await acquirePriceImportLock(lockFile);
  expect(typeof release).toBe('function');
  await release();
});

it('keeps an old lock while its owner is alive', async () => {
  const lockFile = await createLockPath();
  const release = await acquirePriceImportLock(lockFile);
  const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
  await fs.utimes(lockFile, old, old);
  expect(await acquirePriceImportLock(lockFile)).toBeNull();
  await release();
});

it('recovers an interrupted empty lock after a short initialisation grace period', async () => {
  const lockFile = await createLockPath();
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  await fs.writeFile(lockFile, '');
  expect(await acquirePriceImportLock(lockFile)).toBeNull();
  const old = new Date(Date.now() - 31_000);
  await fs.utimes(lockFile, old, old);
  const release = await acquirePriceImportLock(lockFile);
  expect(typeof release).toBe('function');
  await release();
});
