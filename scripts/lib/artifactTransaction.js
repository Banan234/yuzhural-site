// Устанавливает подготовленный набор файлов с восстановлением предыдущих
// версий, если любой шаг замены завершился ошибкой.

import fs from 'fs/promises';
import path from 'path';

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
    if (record.hadOriginal) {
      await fs
        .rm(record.backupPath, { recursive: true, force: true })
        .catch(() => {});
    }
  }
  return { committed: records.length };
}
