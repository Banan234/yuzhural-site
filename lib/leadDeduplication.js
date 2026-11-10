import { createHash } from 'crypto';

// Retain successful submissions for a day and share an in-flight send between retries.
// This store is scoped to one API process; it does not survive a restart.
export function createLeadDeduplication({
  ttlMs = 86400000,
  maxEntries = 10000,
} = {}) {
  const entries = new Map();
  return async function sendOnce(id, payload, attachments, send) {
    if (!id) return send();
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) {
      throw Object.assign(new Error('Некорректный идентификатор заявки.'), {
        status: 400,
      });
    }
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.completedAt && now - entry.completedAt >= ttlMs)
        entries.delete(key);
    }
    const hash = createHash('sha256').update(JSON.stringify(payload));
    for (const file of attachments) {
      hash.update(file.filename || '');
      hash.update(file.content);
    }
    const fingerprint = hash.digest('hex');
    const previous = entries.get(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw Object.assign(
          new Error('Данные заявки изменились. Отправьте её заново.'),
          { status: 409 }
        );
      }
      return previous.promise;
    }
    if (entries.size >= maxEntries) {
      throw Object.assign(
        new Error('Сервис занят. Повторите отправку позже.'),
        { status: 503 }
      );
    }
    const entry = { fingerprint, completedAt: null };
    entry.promise = Promise.resolve()
      .then(send)
      .then(
        (result) => {
          entry.completedAt = Date.now();
          return result;
        },
        (error) => {
          entries.delete(id);
          throw error;
        }
      );
    entries.set(id, entry);
    return entry.promise;
  };
}
