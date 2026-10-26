import fs from 'fs/promises';
import { writeFileAtomic } from './importPublisher.js';

export async function readSourceState(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      console.error(
        `[import-state] Повреждён JSON состояния ${file}; состояние будет восстановлено.`
      );
      return null;
    }
    throw error;
  }
}

export function isUnchangedPrice(state, source) {
  return Boolean(
    state?.sha256 &&
    source?.sha256 &&
    state.sha256 === source.sha256 &&
    state.requestedUrl === source.requestedUrl
  );
}

export async function saveSourceState(file, source) {
  await writeFileAtomic(
    file,
    JSON.stringify(
      {
        sha256: source.sha256,
        requestedUrl: source.requestedUrl,
        publishedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}
