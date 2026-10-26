import { it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { runImportProcess } from './importProcess.js';
import { acquirePriceImportLock } from './importLock.js';

it('kills a real hung child, then allows immediate lock recovery', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-watchdog-'));
  const script = path.join(dir, 'hang.cjs');
  const lock = path.join(dir, 'lock.json');
  await fs.writeFile(
    script,
    `const fs = require('fs'); fs.writeFileSync(process.argv[2], JSON.stringify({pid: process.pid})); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`
  );
  try {
    await expect(
      runImportProcess(script, [lock], {
        timeoutMs: 500,
        killGraceMs: 50,
        stdio: 'ignore',
      })
    ).rejects.toMatchObject({ code: 'IMPORT_TIMEOUT' });
    const release = await acquirePriceImportLock(lock);
    expect(typeof release).toBe('function');
    await release();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it('preserves normal child exit status', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-watchdog-'));
  const script = path.join(dir, 'exit.cjs');
  try {
    await fs.writeFile(script, 'process.exit(7)');
    expect(
      await runImportProcess(script, [], { timeoutMs: 1000, stdio: 'ignore' })
    ).toBe(7);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
