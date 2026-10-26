// Общая блокировка ручного и планового запуска импорта прайса.

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    return true;
  }
}

const DEFAULT_STALE_LOCK_MS = 6 * 60 * 60 * 1000;

export async function acquirePriceImportLock(
  lockFile,
  { staleAfterMs = DEFAULT_STALE_LOCK_MS, now = Date.now() } = {}
) {
  await fs.mkdir(path.dirname(lockFile), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    let handle;
    let created = false;
    try {
      handle = await fs.open(lockFile, 'wx', 0o600);
      created = true;
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date(now).toISOString(),
          token,
        })
      );
      await handle.sync();
      await handle.close();
      handle = null;

      return async () => {
        try {
          const current = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
          if (current.token === token) await fs.unlink(lockFile);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (created) await fs.unlink(lockFile).catch(() => {});
      if (error.code !== 'EEXIST') throw error;

      let stat;
      try {
        stat = await fs.stat(lockFile);
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      let owner;
      try {
        owner = JSON.parse(await fs.readFile(lockFile, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        if (!(error instanceof SyntaxError)) throw error;
      }
      const alive = isProcessAlive(owner?.pid);
      // Никогда не отбираем блокировку у живого процесса по возрасту файла.
      if (
        alive === true ||
        (alive === null && now - stat.mtimeMs <= Math.min(staleAfterMs, 30_000))
      )
        return null;
      const currentStat = await fs.stat(lockFile).catch(() => null);
      if (
        !currentStat ||
        currentStat.ino !== stat.ino ||
        currentStat.mtimeMs !== stat.mtimeMs
      )
        continue;
      await fs.unlink(lockFile).catch((unlinkError) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
    }
  }

  return null;
}
