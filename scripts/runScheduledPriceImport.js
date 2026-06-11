import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportFile = path.join(projectRoot, 'data', 'import-report.json');
const lockFile = path.join(projectRoot, 'data', '.price-import.lock');

const SCHEDULE_HOUR = 4;
const SCHEDULE_MINUTE = 30;
const STALE_LOCK_MS = 6 * 60 * 60 * 1000;

function formatLocal(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function getScheduledRunForToday(now) {
  const scheduled = new Date(now);
  scheduled.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  return scheduled;
}

async function readLastImportAt() {
  try {
    const raw = await fs.readFile(reportFile, 'utf-8');
    const report = JSON.parse(raw);
    const generatedAt = new Date(report.generatedAt);
    return Number.isNaN(generatedAt.getTime()) ? null : generatedAt;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function removeLockIfStale(now) {
  try {
    const stat = await fs.stat(lockFile);
    if (now - stat.mtimeMs > STALE_LOCK_MS) {
      await fs.unlink(lockFile);
      console.log(`[scheduled-import] Removed stale lock: ${lockFile}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function acquireLock(now) {
  await removeLockIfStale(now);
  const payload = JSON.stringify(
    {
      pid: process.pid,
      startedAt: new Date(now).toISOString(),
    },
    null,
    2
  );
  await fs.writeFile(lockFile, payload, { flag: 'wx' });
}

async function releaseLock() {
  try {
    await fs.unlink(lockFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function runImport() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(projectRoot, 'scripts', 'importPrice.js')],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env,
      }
    );

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Импорт остановлен сигналом ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const now = new Date();
  const scheduledAt = getScheduledRunForToday(now);
  const lastImportAt = await readLastImportAt();

  if (now < scheduledAt) {
    console.log(
      `[scheduled-import] Skip: now ${formatLocal(now)} is earlier than today's 04:30.`
    );
    return;
  }

  if (lastImportAt && lastImportAt >= scheduledAt) {
    console.log(
      `[scheduled-import] Skip: import already completed at ${formatLocal(lastImportAt)}.`
    );
    return;
  }

  try {
    await acquireLock(now.getTime());
  } catch (error) {
    if (error.code === 'EEXIST') {
      console.log(
        '[scheduled-import] Skip: another scheduled import is already running.'
      );
      return;
    }
    throw error;
  }

  try {
    console.log(
      `[scheduled-import] Starting import at ${formatLocal(now)} because today's 04:30 import is missing.`
    );
    const exitCode = await runImport();
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await releaseLock();
  }
}

main().catch((error) => {
  console.error('[scheduled-import] Error:', error.message);
  process.exitCode = 1;
});
