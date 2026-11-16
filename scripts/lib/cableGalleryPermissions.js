import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest } from './cableStyleBatch.js';
import { cableIllustrationHold } from './cableIllustrationDefects.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';

export async function setCableGalleryReferencePermission({ root, sha, visualKey, enabled, reviewer }) {
  const base = path.join(root, 'data/cable-approved-results');
  const filename = path.join(base, 'registry.json');
  const lockPath = path.join(base, '.registry.lock');
  const lock = await fs.open(lockPath, 'wx');
  const write = async (file, value) => {
    const stage = file + '.' + randomUUID();
    await fs.writeFile(stage, JSON.stringify(value, null, 2) + '\n');
    await fs.rename(stage, file);
  };
  try {
    const registry = JSON.parse(await fs.readFile(filename));
    const entry = [registry.byVisualKey[visualKey], registry.alternativesBySha256?.[sha]]
      .find(record => record?.sha256 === sha && record.visualKey === visualKey && record.status === 'APPROVED');
    if (!entry) throw Error('Разрешение референса требует действующего ручного утверждения.');
    const dir = await fs.realpath(path.resolve(root, entry.draftDir));
    if (!dir.startsWith(await fs.realpath(base) + path.sep)) throw Error('Invalid approved image path');
    const approvalPath = path.join(dir, 'approval.json');
    const [png, approval, group] = await Promise.all([
      fs.readFile(path.join(dir, 'image.png')),
      fs.readFile(approvalPath).then(JSON.parse),
      fs.readFile(path.join(dir, 'group.json')).then(JSON.parse),
    ]);
    if (digest(png) !== sha || approval.sha256 !== sha || approval.status !== 'APPROVED' ||
        approval.visualKey !== visualKey || group.visualKey !== visualKey || digest(group.profile) !== entry.profileHash)
      throw Error('SHA или профиль в архиве расходится с утверждением.');
    if (enabled) {
      const durable = (await loadCableReviewDecisions(root)).find(row => row.decision.sha256 === sha)?.decision;
      if (cableIllustrationHold(sha) || durable?.status === 'REJECTED' || durable?.disposition === 'NEEDS_CORRECTION')
        throw Error('Для этого PNG действует удержание или отклонение.');
    }
    if (entry.APPROVED_AS_REFERENCE === enabled && approval.APPROVED_AS_REFERENCE === enabled) return;
    const event = { sha256: sha, visualKey, enabled, reviewer, at: new Date().toISOString() };
    approval.APPROVED_AS_REFERENCE = enabled;
    approval.referencePermissionHistory = [...(approval.referencePermissionHistory ?? []), event];
    entry.APPROVED_AS_REFERENCE = enabled;
    await write(approvalPath, approval);
    await write(filename, registry);
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
