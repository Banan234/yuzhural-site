import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkImportFreshness } from './importFreshness.js';
it('uses successful unchanged verification rather than old publication time', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freshness-'));
  try {
    await fs.mkdir(path.join(root, 'data'));
    const file = path.join(root, 'data/.price-source-state.json');
    await fs.writeFile(
      file,
      JSON.stringify({
        publishedAt: '2026-01-01T00:00:00Z',
        verifiedAt: '2026-11-07T12:00:00Z',
      })
    );
    const calls = [];
    const opts = {
      projectRoot: root,
      now: Date.parse('2026-11-07T13:00:00Z'),
      notify: async (r) => calls.push(r),
    };
    expect(await checkImportFreshness(opts)).toEqual({ stale: false });
    expect(calls).toHaveLength(0);
    expect(
      await checkImportFreshness({
        ...opts,
        now: Date.parse('2026-11-09T13:00:00Z'),
      })
    ).toEqual({ stale: true });
    expect(calls[0].errorCode).toBe('STALE_CATALOG');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
