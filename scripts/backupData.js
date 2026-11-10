// Файл создаёт и проверяет резервные копии runtime-данных каталога и чата.

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { commitArtifactBatch } from './lib/artifactTransaction.js';
import { acquirePriceImportLock } from './lib/importLock.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const DEFAULT_BACKUP_RELATIVE_DIR = path.join('data', 'backups');
const DEFAULT_RETENTION = 14;

export const BACKUP_FILES = Object.freeze([
  'price.xls',
  'products.json',
  'productRegistry.json',
  'import-history.json',
  'import-report.json',
  'import-report.html',
  'chat-store.json',
  'forms-outbox',
  'form-receipts',
  'admin',
  '.price-source-state.json',
  '.import-notification-state.json',
  'import-mail-outbox',
  'priceOverrides.json',
  'public',
]);

export const BACKUP_PUBLIC_ARTIFACTS = 'public';

function parseRetention(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), 365)
    : DEFAULT_RETENTION;
}

function resolvePath(projectPath, value, fallback) {
  const candidate = value || fallback;
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

function isSafeRelativePath(value) {
  const normalized = path.normalize(String(value || ''));
  return Boolean(
    normalized &&
    !path.isAbsolute(normalized) &&
    normalized !== '..' &&
    !normalized.startsWith(`..${path.sep}`)
  );
}

async function exists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function hashFile(filePath) {
  const contents = await fs.readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

async function collectFiles(source, relative = '') {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
    throw new Error(`Недопустимый тип файла backup: ${source}`);
  }
  if (stat.isFile()) {
    return [{ source, relative }];
  }

  const entries = await fs.readdir(source, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = relative
      ? path.join(relative, entry.name)
      : entry.name;
    files.push(
      ...(await collectFiles(path.join(source, entry.name), childRelative))
    );
  }
  return files;
}

async function copyEntry(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
    throw new Error(`Недопустимый тип файла backup: ${source}`);
  }
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyEntry(
        path.join(source, entry.name),
        path.join(target, entry.name)
      );
    }
    return;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function getBackupConfig({
  env = process.env,
  projectPath = projectRoot,
} = {}) {
  return {
    projectPath,
    backupDir: resolvePath(
      projectPath,
      String(env.BACKUP_DIR || '').trim(),
      DEFAULT_BACKUP_RELATIVE_DIR
    ),
    retention: parseRetention(env.BACKUP_RETENTION),
    includePublicArtifacts:
      String(env.BACKUP_INCLUDE_PUBLIC || '')
        .trim()
        .toLowerCase() === 'true',
  };
}

export async function createBackup(options = {}) {
  const projectPath = options.projectPath || projectRoot;
  const release = options.lockAlreadyHeld
    ? null
    : await acquirePriceImportLock(
        path.join(projectPath, 'data', '.price-import.lock')
      );
  if (!options.lockAlreadyHeld && !release)
    throw new Error('Импорт/backup/restore уже выполняется.');
  try {
    return await createBackupUnlocked(options);
  } finally {
    if (release) await release();
  }
}

async function createBackupUnlocked({
  env = process.env,
  projectPath = projectRoot,
  now = new Date(),
  backupId,
} = {}) {
  const config = getBackupConfig({ env, projectPath });
  const id =
    backupId ||
    `${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, '')}-${process.pid}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Некорректный id backup.');
  const backupPath = path.join(config.backupDir, id);
  if (await exists(backupPath)) {
    throw new Error(`Резервная копия уже существует: ${backupPath}`);
  }

  const manifest = {
    version: 2,
    id,
    createdAt: now.toISOString(),
    files: [],
    missing: [],
  };

  await fs.mkdir(backupPath, { recursive: true, mode: 0o700 });
  try {
    const filesToBackup = config.includePublicArtifacts
      ? BACKUP_FILES
      : BACKUP_FILES.filter((relative) => relative !== BACKUP_PUBLIC_ARTIFACTS);

    const sources = filesToBackup.map((relative) => ({
      relative,
      source: path.join(projectPath, 'data', relative),
    }));
    const active = path.join(projectPath, 'data', 'catalog-current');
    const activeStat = await fs.lstat(active).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (activeStat) {
      // Resolve once: the release is immutable and protected against importer pruning by the shared lock.
      sources.push({
        relative: 'catalog-release',
        source: await fs.realpath(active),
      });
      manifest.catalogRelease = 'catalog-release';
    }
    for (const { relative, source } of sources) {
      if (!(await exists(source))) {
        manifest.missing.push(relative);
        continue;
      }

      const entries = await collectFiles(source, relative);
      for (const entry of entries) {
        const target = path.join(backupPath, entry.relative);
        await copyEntry(entry.source, target);
        manifest.files.push({
          path: entry.relative,
          bytes: (await fs.stat(target)).size,
          sha256: await hashFile(target),
        });
      }
    }

    manifest.files.sort((left, right) => left.path.localeCompare(right.path));
    manifest.missing.sort();
    await writeJson(path.join(backupPath, 'manifest.json'), manifest);
    const verification = await verifyBackup(backupPath);
    if (!verification.ok) throw new Error(verification.errors.join('\n'));
    await pruneBackups(config.backupDir, config.retention, { keep: id });
    return { ...manifest, backupPath };
  } catch (error) {
    await fs.rm(backupPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function readBackupManifest(backupPath) {
  const raw = await fs.readFile(path.join(backupPath, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  if (
    !manifest ||
    ![1, 2].includes(manifest.version) ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error(`Некорректный manifest резервной копии: ${backupPath}`);
  }
  const seen = new Set();
  if (
    manifest.catalogRelease != null &&
    (manifest.version !== 2 || manifest.catalogRelease !== 'catalog-release')
  )
    throw new Error('Некорректный catalogRelease.');
  for (const entry of manifest.files) {
    const root = String(entry?.path || '').split(path.sep)[0];
    if (
      !entry ||
      !isSafeRelativePath(entry.path) ||
      path.normalize(entry.path) !== entry.path ||
      entry.path.split(path.sep).includes('..') ||
      seen.has(entry.path) ||
      !(
        BACKUP_FILES.includes(root) ||
        (root === 'catalog-release' && manifest.catalogRelease)
      )
    ) {
      throw new Error(`Опасный путь в manifest резервной копии: ${backupPath}`);
    }
    seen.add(entry.path);
  }
  if (manifest.catalogRelease && !seen.has('catalog-release/products.json'))
    throw new Error('В backup отсутствует products.json активного выпуска.');
  return manifest;
}

export async function verifyBackup(backupPath) {
  const manifest = await readBackupManifest(backupPath);
  const errors = [];
  for (const entry of manifest.files) {
    const filePath = path.join(backupPath, entry.path);
    try {
      const real = await fs.realpath(filePath);
      const root = await fs.realpath(backupPath);
      if (!real.startsWith(root + path.sep)) throw new Error('Путь вне backup');
      const stat = await fs.lstat(filePath);
      if (!stat.isFile()) throw new Error('Необычный файл');
      if (stat.size !== entry.bytes) {
        errors.push(`${entry.path}: размер изменился`);
        continue;
      }
      const actualHash = await hashFile(filePath);
      if (actualHash !== entry.sha256) {
        errors.push(`${entry.path}: SHA-256 не совпадает`);
      }
    } catch {
      errors.push(`${entry.path}: файл отсутствует`);
    }
  }

  if (manifest.catalogRelease && errors.length === 0) {
    try {
      if (
        !Array.isArray(
          JSON.parse(
            await fs.readFile(
              path.join(backupPath, 'catalog-release/products.json'),
              'utf8'
            )
          )
        )
      )
        throw new Error();
    } catch {
      errors.push('catalog-release/products.json: требуется JSON-массив');
    }
  }
  return {
    ok: errors.length === 0,
    backupPath,
    id: manifest.id,
    files: manifest.files.length,
    errors,
  };
}

export async function restoreBackup(
  backupPath,
  { projectPath = projectRoot, apply = false } = {}
) {
  const data = path.join(projectPath, 'data');
  const release = apply
    ? await acquirePriceImportLock(path.join(data, '.price-import.lock'))
    : null;
  if (apply && !release)
    throw new Error('Импорт/backup/restore уже выполняется.');
  let stage;
  try {
    const verification = await verifyBackup(backupPath);
    if (!verification.ok)
      throw new Error(
        `Резервная копия повреждена:\n${verification.errors.join('\n')}`
      );
    const manifest = await readBackupManifest(backupPath);
    const active = path.join(data, 'catalog-current');
    const current = await fs.lstat(active).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current && !manifest.catalogRelease)
      throw new Error(
        'Legacy backup не содержит активный выпуск: restore запрещён.'
      );
    if (manifest.catalogRelease && current && !current.isSymbolicLink())
      throw new Error(
        'catalog-current должен отсутствовать или быть symlink; остановите сервис и перенесите прежний каталог вручную.'
      );
    if (!apply) return { ...verification, applied: false };
    stage = await fs.mkdtemp(path.join(data, '.restore-'));
    // Only listed, verified files are copied; no unlisted payload is installed.
    for (const entry of manifest.files) {
      const target = path.join(stage, entry.path);
      await copyEntry(path.join(backupPath, entry.path), target);
      if (
        (await fs.stat(target)).size !== entry.bytes ||
        (await hashFile(target)) !== entry.sha256
      )
        throw new Error(`Backup изменился: ${entry.path}`);
    }
    if (manifest.catalogRelease) {
      for (const [source, target] of [
        ['products.json', 'products.json'],
        ['productRegistry.json', 'productRegistry.json'],
        ['public/price.xls', 'price.xls'],
      ]) {
        const from = path.join(stage, 'catalog-release', source);
        if (await exists(from)) {
          await fs.rm(path.join(stage, target), { force: true });
          await copyEntry(from, path.join(stage, target));
        }
      }
    }
    const roots = (await fs.readdir(stage)).filter(
      (name) => name !== 'catalog-release'
    );
    const artifacts = roots.map((name) => ({
      stagedPath: path.join(stage, name),
      targetPath: path.join(data, name),
    }));
    if (manifest.catalogRelease)
      artifacts.push({
        stagedPath: path.join(stage, 'catalog-release'),
        targetPath: active,
        atomicDirectory: true,
      });
    await commitArtifactBatch(artifacts);
    return {
      ...verification,
      applied: true,
      catalogRestored: Boolean(manifest.catalogRelease),
      restored: manifest.files.map((entry) => entry.path),
    };
  } finally {
    try {
      if (stage) await fs.rm(stage, { recursive: true, force: true });
    } finally {
      if (release) await release();
    }
  }
}

export async function listBackups({
  env = process.env,
  projectPath = projectRoot,
} = {}) {
  const { backupDir } = getBackupConfig({ env, projectPath });
  if (!(await exists(backupDir))) return [];
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupPath = path.join(backupDir, entry.name);
    try {
      const manifest = await readBackupManifest(backupPath);
      result.push({ ...manifest, backupPath });
    } catch {
      // Игнорируем незавершённые/чужие директории — verify явно покажет проблему.
    }
  }
  return result.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

async function pruneBackups(backupDir, retention, { keep } = {}) {
  if (!(await exists(backupDir))) return;
  const backups = await listBackups({ env: { BACKUP_DIR: backupDir } });
  for (const backup of backups.slice(retention)) {
    if (backup.id === keep) continue;
    await fs.rm(backup.backupPath, { recursive: true, force: true });
  }
}

function usage() {
  return [
    'Usage: node scripts/backupData.js <create|list|verify|restore> [backup-id] [--apply]',
    '',
    'Environment: BACKUP_DIR, BACKUP_RETENTION (default 14)',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const [command, id] = argv.filter((arg) => !arg.startsWith('--'));
  const apply = argv.includes('--apply');
  const config = getBackupConfig();

  if (command === 'create') {
    const result = await createBackup();
    console.log(`Резервная копия создана: ${result.backupPath}`);
    console.log(
      `Файлов: ${result.files.length}, отсутствуют: ${result.missing.length}`
    );
    return;
  }

  if (command === 'list') {
    for (const backup of await listBackups()) {
      console.log(
        `${backup.id}\t${backup.files.length} файлов\t${backup.backupPath}`
      );
    }
    return;
  }

  if (command === 'verify' || command === 'restore') {
    if (!id) throw new Error('Укажи id резервной копии.');
    const backupPath = path.join(config.backupDir, id);
    const result =
      command === 'verify'
        ? await verifyBackup(backupPath)
        : await restoreBackup(backupPath, { apply });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  console.log(usage());
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`Ошибка резервного копирования: ${error.message}`);
    process.exitCode = 1;
  });
}
