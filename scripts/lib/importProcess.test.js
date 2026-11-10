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

it('keeps the download failure when the watchdog stops the import', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-diagnostic-'));
  const script = path.join(dir, 'hang.cjs');
  try {
    await fs.writeFile(
      script,
      `process.stderr.write('Попытка 2/3 провалена (fetch failed (UND_ERR_CONNECT_TIMEOUT)). Ретрай через 60000 мс.\\n'); setInterval(() => {}, 1000);`
    );
    await expect(
      runImportProcess(script, [], {
        timeoutMs: 500,
        killGraceMs: 50,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    ).rejects.toMatchObject({
      code: 'IMPORT_TIMEOUT',
      diagnostic: expect.stringContaining('UND_ERR_CONNECT_TIMEOUT'),
      startedAt: expect.any(String),
      completedAt: expect.any(String),
      timeoutMs: 500,
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it('retains structured progress across forced termination', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-ipc-'));
  const script = path.join(dir, 'hang.cjs');
  try {
    await fs.writeFile(script, `process.send({type:'import-telemetry',telemetry:{stage:'Скачивание',capturedAt:'2026-11-09T17:46:22.000Z',lastProgressAt:new Date().toISOString(),events:[{type:'http',status:503}]}}); setInterval(() => {}, 1000);`);
    await expect(runImportProcess(script, [], { timeoutMs: 500, killGraceMs: 50, stdio: 'ignore' }))
      .rejects.toMatchObject({code:'IMPORT_TIMEOUT',telemetry:{stage:'Скачивание',capturedAt:'2026-11-09T17:46:22.000Z',idleMs:expect.any(Number),events:[{type:'http',status:503}]}});
  } finally { await fs.rm(dir, { recursive:true, force:true }); }
});
