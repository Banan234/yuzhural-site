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

// Restore can move the active release back while a newer source-state survives.
export async function isPublishedPriceUnchanged(state, source, publishedFile) {
  if (!isUnchangedPrice(state, source.metadata)) return false;

  try {
    const published = await fs.readFile(publishedFile);
    return published.equals(source.buffer);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function saveSourceState(file, source) {
  await writeFileAtomic(
    file,
    JSON.stringify(
      {
        sha256: source.sha256,
        requestedUrl: source.requestedUrl,
        publishedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}
