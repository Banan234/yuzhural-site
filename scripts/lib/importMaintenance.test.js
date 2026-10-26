import { it, expect } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { maintainImportFiles } from './importMaintenance.js';

it('удаляет только старые отчёты и сохраняет очередь, текущие файлы и посторонние данные', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-cleanup-')
  );
  const archive = path.join(projectRoot, 'data/import-reports');
  const outbox = path.join(projectRoot, 'data/import-mail-outbox');
  const old = 'import-2026-08-01T00-00-00-000Z-published';
  const pending = 'import-2026-08-02T00-00-00-000Z-failed';
  const recent = 'import-2026-10-24T00-00-00-000Z-published';
  try {
    await fs.mkdir(archive, { recursive: true });
    await fs.mkdir(outbox);
    for (const name of [old, pending, recent])
      for (const ext of ['html', 'json'])
        await fs.writeFile(path.join(archive, `${name}.${ext}`), 'keep');
    await fs.writeFile(path.join(outbox, `${pending}.json`), '{}');
    await fs.writeFile(path.join(archive, 'other.html'), 'keep');
    await fs.writeFile(
      path.join(projectRoot, 'data/import-report.html'),
      'current'
    );
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(
      (await maintainImportFiles({ projectRoot, now })).removedReports
    ).toBe(2);
    expect(await fs.readdir(archive)).toHaveLength(5);
    expect(
      await fs.readFile(
        path.join(projectRoot, 'data/import-report.html'),
        'utf8'
      )
    ).toBe('current');
    expect((await maintainImportFiles({ projectRoot, now })).skipped).toBe(
      true
    );
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('ротирует лог, сохраняя открытый файл, и ограничивает размер архива', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-cleanup-')
  );
  const log = path.join(projectRoot, 'import.log');
  try {
    await fs.writeFile(log, '0123456789abcdef');
    for (let i = 1; i <= 4; i++) await fs.writeFile(`${log}.${i}`, `old${i}`);
    const handle = await fs.open(log, 'a');
    try {
      await maintainImportFiles({
        projectRoot,
        logFiles: [log],
        maxLogBytes: 10,
      });
      expect(await fs.readFile(`${log}.1`, 'utf8')).toBe('6789abcdef');
      expect(await fs.readFile(`${log}.4`, 'utf8')).toBe('old3');
      await handle.write('new');
      expect(await fs.readFile(log, 'utf8')).toBe('new');
    } finally {
      await handle.close();
    }
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
