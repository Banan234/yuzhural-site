// Файл проверяет создание, контроль целостности и безопасное восстановление backup.

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  createBackup,
  listBackups,
  restoreBackup,
  verifyBackup,
} from './backupData.js';

describe('backupData', () => {
  it('создаёт manifest с hash и проверяет его целостность', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    await mkdir(path.join(projectPath, 'data'), { recursive: true });
    await writeFile(path.join(projectPath, 'data', 'products.json'), '[1,2,3]');

    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: path.join(projectPath, 'backups') },
      backupId: 'one',
    });

    expect(result.id).toBe('one');
    expect(result.files).toHaveLength(1);
    expect((await verifyBackup(result.backupPath)).ok).toBe(true);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('находит повреждение backup', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    await mkdir(path.join(projectPath, 'data'), { recursive: true });
    await writeFile(path.join(projectPath, 'data', 'products.json'), '[1,2,3]');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: path.join(projectPath, 'backups') },
      backupId: 'two',
    });
    await writeFile(path.join(result.backupPath, 'products.json'), 'tampered');

    const verification = await verifyBackup(result.backupPath);
    expect(verification.ok).toBe(false);
    expect(verification.errors[0]).toMatch(/products\.json/);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('не восстанавливает файлы без --apply и восстанавливает с ним', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    const backupDir = path.join(projectPath, 'backups');
    const productsPath = path.join(projectPath, 'data', 'products.json');
    await mkdir(path.dirname(productsPath), { recursive: true });
    await writeFile(productsPath, 'original');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: backupDir },
      backupId: 'three',
    });
    await writeFile(productsPath, 'changed');

    await restoreBackup(result.backupPath, { projectPath });
    expect(await readFile(productsPath, 'utf8')).toBe('changed');

    await restoreBackup(result.backupPath, { projectPath, apply: true });
    expect(await readFile(productsPath, 'utf8')).toBe('original');
    expect(
      await listBackups({ projectPath, env: { BACKUP_DIR: backupDir } })
    ).toHaveLength(1);

    await rm(projectPath, { recursive: true, force: true });
  });

  it('не выходит из backup-каталога через путь в manifest', async () => {
    const projectPath = await mkdtemp(
      path.join(os.tmpdir(), 'yuzhural-backup-')
    );
    const backupDir = path.join(projectPath, 'backups');
    const result = await createBackup({
      projectPath,
      env: { BACKUP_DIR: backupDir },
      backupId: 'unsafe',
    });
    const manifestPath = path.join(result.backupPath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files.push({ path: '../outside.txt', bytes: 0, sha256: '' });
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(verifyBackup(result.backupPath)).rejects.toThrow(
      /Опасный путь/
    );
    await rm(projectPath, { recursive: true, force: true });
  });
});
