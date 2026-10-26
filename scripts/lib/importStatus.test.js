import { it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { updateImportStatus } from './importStatus.js';

it('разделяет проверку источника, публикацию и неудачные попытки', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-status-'));
  const file = path.join(dir, 'status.json');
  const source = { sha256: 'abc' };
  try {
    await updateImportStatus(file, 'checking', { at: '2026-10-24T10:00:00Z' });
    await updateImportStatus(file, 'checked', {
      at: '2026-10-24T10:01:00Z',
      source,
    });
    await updateImportStatus(file, 'published', { at: '2026-10-24T10:02:00Z' });
    const unchanged = await updateImportStatus(file, 'unchanged', {
      at: '2026-10-24T10:30:00Z',
      source,
    });
    expect(unchanged.lastCheckedAt).toBe('2026-10-24T10:30:00Z');
    expect(unchanged.lastPublishedAt).toBe('2026-10-24T10:02:00Z');
    await updateImportStatus(file, 'checking', { at: '2026-10-24T11:00:00Z' });
    const failed = await updateImportStatus(file, 'failed', {
      at: '2026-10-24T11:03:00Z',
      message: 'timeout',
    });
    expect(failed.lastAttemptAt).toBe('2026-10-24T11:00:00Z');
    expect(failed.lastCheckedAt).toBe(unchanged.lastCheckedAt);
    expect(failed.lastPublishedAt).toBe(unchanged.lastPublishedAt);
    expect(failed.message).toBe('timeout');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
