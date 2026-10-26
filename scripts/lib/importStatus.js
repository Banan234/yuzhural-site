import { readSourceState } from './importSourceState.js';
import { writeFileAtomic } from './importPublisher.js';

export async function updateImportStatus(
  file,
  event,
  { at = new Date().toISOString(), source, message = null } = {}
) {
  const previous = (await readSourceState(file)) || {};
  const next = {
    lastAttemptAt: null,
    lastCheckedAt: null,
    lastPublishedAt: null,
    lastCheckedSource: null,
    ...previous,
    status: event,
    updatedAt: at,
    message,
  };
  if (event === 'checking') next.lastAttemptAt = at;
  if (event === 'checked' || event === 'unchanged') {
    next.lastCheckedAt = at;
    next.lastCheckedSource = source || null;
  }
  if (event === 'published') next.lastPublishedAt = at;
  await writeFileAtomic(file, JSON.stringify(next, null, 2));
  return next;
}
