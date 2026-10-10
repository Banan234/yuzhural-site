// Устанавливает подготовленный набор файлов с восстановлением предыдущих
// версий, если любой шаг замены завершился ошибкой.

import fs from 'fs/promises';
import path from 'path';

async function installAtomicDirectory(stagedPath, targetPath, transactionId) {
  const releaseRoot = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}-releases`
  );
  const releasePath = path.join(
    releaseRoot,
    `release-${Date.now()}-${transactionId}`
  );
  const temporaryLink = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.next-${transactionId}`
  );

  await fs.mkdir(releaseRoot, { recursive: true });
  await fs.rename(stagedPath, releasePath);
  await fs.symlink(
    path.relative(path.dirname(targetPath), releasePath),
    temporaryLink
  );
  try {
    await fs.rename(temporaryLink, targetPath);
  } catch (error) {
    await fs.rm(temporaryLink, { force: true }).catch(() => {});
    throw error;
  }
  return { releasePath };
}

async function restoreAtomicDirectory(targetPath, previousLink, installed) {
  if (!installed) return;
  if (previousLink == null) {
    await fs.rm(targetPath, { force: true });
    return;
  }

  const temporaryLink = `${targetPath}.rollback-${process.pid}-${Date.now()}`;
  await fs.symlink(previousLink, temporaryLink);
  await fs.rename(temporaryLink, targetPath);
}

async function pruneAtomicDirectoryReleases(targetPath, keep = 3) {
  const releaseRoot = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}-releases`
  );
  const entries = await fs.readdir(releaseRoot, { withFileTypes: true });
  const releases = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('release-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const activeRelease = path.basename(await fs.readlink(targetPath));
  const retained = new Set([activeRelease, ...releases.slice(0, keep)]);
  for (const name of releases) {
    if (!retained.has(name)) {
      await fs.rm(path.join(releaseRoot, name), {
        recursive: true,
        force: true,
      });
    }
  }
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function installStagedPath(stagedPath, targetPath, mode) {
  if (mode != null) await fs.chmod(stagedPath, mode);
  try {
    await fs.rename(stagedPath, targetPath);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    const incomingPath = `${targetPath}.import-incoming-${process.pid}-${Date.now()}`;
    const stagedStat = await fs.lstat(stagedPath);
    try {
      if (stagedStat.isDirectory()) {
        await fs.cp(stagedPath, incomingPath, {
          recursive: true,
          force: false,
        });
      } else {
        await fs.copyFile(stagedPath, incomingPath);
      }
      if (mode != null) await fs.chmod(incomingPath, mode);
      await fs.rename(incomingPath, targetPath);
    } catch (copyError) {
      await fs
        .rm(incomingPath, { recursive: true, force: true })
        .catch(() => {});
      throw copyError;
    }
  }
}

export async function commitArtifactBatch(artifacts = []) {
  const transactionId = `${process.pid}-${Date.now()}`;
  const records = [];

  for (const artifact of artifacts) {
    if (!artifact?.targetPath)
      throw new Error('В транзакции не указан targetPath.');
    if (artifact.stagedPath && !(await exists(artifact.stagedPath))) {
      throw new Error(`Не найден подготовленный файл: ${artifact.stagedPath}`);
    }
  }

  try {
    for (const [index, artifact] of artifacts.entries()) {
      const targetPath = path.resolve(artifact.targetPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      if (artifact.atomicDirectory) {
        const existing = await fs.lstat(targetPath).catch((error) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        if (existing && !existing.isSymbolicLink()) {
          throw new Error(
            `Атомарная публикация требует, чтобы ${targetPath} отсутствовал или был symlink.`
          );
        }
        const previousLink = existing ? await fs.readlink(targetPath) : null;
        const record = {
          targetPath,
          atomicDirectory: true,
          previousLink,
          installed: false,
        };
        records.push(record);
        const installed = await installAtomicDirectory(
          artifact.stagedPath,
          targetPath,
          `${transactionId}-${index}`
        );
        record.installed = true;
        record.releasePath = installed.releasePath;
        continue;
      }
      const backupPath = `${targetPath}.import-rollback-${transactionId}-${index}`;
      const record = {
        targetPath,
        backupPath,
        hadOriginal: false,
        installed: false,
      };
      records.push(record);

      if (await exists(targetPath)) {
        await fs.rename(targetPath, backupPath);
        record.hadOriginal = true;
      }

      if (artifact.stagedPath) {
        await installStagedPath(artifact.stagedPath, targetPath, artifact.mode);
        record.installed = true;
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const record of records.reverse()) {
      try {
        if (record.atomicDirectory) {
          await restoreAtomicDirectory(
            record.targetPath,
            record.previousLink,
            record.installed
          );
          continue;
        }
        if (record.installed) {
          await fs.rm(record.targetPath, { recursive: true, force: true });
        }
        if (record.hadOriginal) {
          await fs.rename(record.backupPath, record.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Публикация не завершена (${error.message}); не удалось полностью откатить: ${rollbackErrors.join('; ')}`
      );
    }
    throw error;
  }

  for (const record of records) {
    if (record.atomicDirectory) {
      await pruneAtomicDirectoryReleases(record.targetPath).catch(() => {});
      continue;
    }
    if (record.hadOriginal) {
      await fs
        .rm(record.backupPath, { recursive: true, force: true })
        .catch(() => {});
    }
  }
  return { committed: records.length };
}
