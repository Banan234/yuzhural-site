import fs from 'fs/promises';
import path from 'path';
import { readSourceState } from './importSourceState.js';
import { writeFileAtomic } from './importPublisher.js';
import { acquirePriceImportLock } from './importLock.js';

const DAY = 86400000;
const MAX_LOG_BYTES = 10 * 1024 * 1024;
async function files(directory) {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
async function regularStat(file) {
  try {
    const stat = await fs.lstat(file);
    return stat.isFile() ? stat : null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function maintainImportFiles({
  projectRoot,
  logFiles = [],
  now = Date.now(),
  maxLogBytes = MAX_LOG_BYTES,
} = {}) {
  const stateFile = path.join(projectRoot, 'data', '.import-maintenance.json');
  const release = await acquirePriceImportLock(`${stateFile}.lock`);
  if (!release) return { skipped: true };
  try {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Yekaterinburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now));
    if ((await readSourceState(stateFile))?.day === today)
      return { skipped: true };
    const archive = path.join(projectRoot, 'data', 'import-reports');
    const pending = new Set(
      (await files(path.join(projectRoot, 'data', 'import-mail-outbox'))).map(
        (name) => name.replace(/\.json$/, '')
      )
    );
    let removedReports = 0;
    let rotatedLogs = 0;
    for (const name of await files(archive)) {
      const match =
        /^import-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(published|failed)\.(html|json)$/.exec(
          name
        );
      if (!match || pending.has(name.replace(/\.(html|json)$/, ''))) continue;
      const at = Date.parse(
        `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`
      );
      const file = path.join(archive, name);
      if (now - at > 30 * DAY && (await regularStat(file))) {
        await fs.unlink(file);
        removedReports++;
      }
    }
    for (const log of logFiles) {
      // Active file + four archives. Copy/truncate preserves launchd's open file descriptor.
      for (let index = 1; index <= 4; index++) {
        const file = `${log}.${index}`;
        const stat = await regularStat(file);
        if (stat && now - stat.mtimeMs > 30 * DAY) await fs.unlink(file);
      }
      const stat = await regularStat(log);
      if (!stat || stat.size < maxLogBytes) continue;
      if (await regularStat(`${log}.4`)) await fs.unlink(`${log}.4`);
      for (let index = 3; index >= 1; index--) {
        if (await regularStat(`${log}.${index}`))
          await fs.rename(`${log}.${index}`, `${log}.${index + 1}`);
      }
      const handle = await fs.open(log, 'r+');
      try {
        const size = (await handle.stat()).size;
        const buffer = Buffer.alloc(Math.min(size, maxLogBytes));
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          Math.max(0, size - buffer.length)
        );
        await fs.writeFile(`${log}.1`, buffer.subarray(0, bytesRead), {
          flag: 'wx',
        });
        await handle.truncate(0);
      } finally {
        await handle.close();
      }
      rotatedLogs++;
    }
    await writeFileAtomic(
      stateFile,
      JSON.stringify({
        day: today,
        completedAt: new Date(now).toISOString(),
        removedReports,
        rotatedLogs,
      })
    );
    return { removedReports, rotatedLogs };
  } finally {
    await release();
  }
}
