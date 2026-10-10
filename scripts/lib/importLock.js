// Общая блокировка ручного и планового запуска импорта прайса.

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

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
      if (now - stat.mtimeMs <= staleAfterMs) return null;
      await fs.unlink(lockFile).catch((unlinkError) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
    }
  }

  return null;
}
