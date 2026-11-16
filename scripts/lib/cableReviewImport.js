import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, recordCableStyleReview } from './cableStyleBatch.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';

export const cableReviewExportVersion = 'cable-review-decisions-1';
const statuses = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  NEEDS_CORRECTION: 'NEEDS_REVIEW',
  KEEP_PENDING: 'NEEDS_REVIEW',
};

export async function importCableReviewDecisions({ root, payload, apply = false }) {
  if (payload?.version !== cableReviewExportVersion || !Array.isArray(payload.decisions) ||
      typeof payload.reviewer !== 'string' || !payload.reviewer.trim())
    throw Error('Invalid cable review export or missing reviewer');
  const previous = new Map((await loadCableReviewDecisions(root)).map(row => [row.decision.sha256, row]));
  const seen = new Set();
  const verified = [];
  for (const row of payload.decisions) {
    if (!row || !Object.hasOwn(statuses, row.action) || !/^[a-f0-9]{64}$/u.test(row.sha256) ||
        typeof row.draftDir !== 'string' || typeof row.visualKey !== 'string' ||
        typeof row.note !== 'string' || seen.has(row.sha256))
      throw Error('Invalid or duplicate cable review decision');
    seen.add(row.sha256);
    const active = previous.get(row.sha256);
    const draftDir = await fs.realpath(active?.decisionDir ?? path.resolve(root, row.draftDir));
    const actualRoot = await fs.realpath(root);
    if (!active && !draftDir.startsWith(path.join(actualRoot, 'outputs') + path.sep))
      throw Error('Review source is outside project drafts');
    const group = JSON.parse(await fs.readFile(path.join(draftDir, 'group.json')));
    if (group.visualKey !== row.visualKey) throw Error('Review visualKey differs from source');
    if ((active ? digest(active.decision) : null) !== row.previous)
      throw Error('Review export is stale for ' + row.sha256);
    if (active?.decision.status === 'APPROVED' || group.status === 'APPROVED')
      throw Error('Approved decisions require the separate withdrawal procedure');
    if (row.action === 'APPROVE' &&
        (active?.decision.status === 'REJECTED' || group.status === 'REJECTED') &&
        row.reopen !== true)
      throw Error('Explicit reopening is required before approving a rejected image');
    if (['REJECT', 'NEEDS_CORRECTION'].includes(row.action) && !row.note.trim())
      throw Error('Specify the defect for rejection or correction');
    const decision = {
      sha256: row.sha256, status: statuses[row.action], disposition: row.action,
      reviewer: payload.reviewer.trim(), note: row.note.trim(),
      checks: row.checks, observations: row.observations,
      // New catalog permissions never publish or replace a binding on import.
      APPROVED_FOR_CATALOG: row.catalog === true, APPROVED_AS_REFERENCE: false,
      archiveOnly: row.action === 'APPROVE' && row.catalog !== true,
      preserveExistingApproval: true,
    };
    verified.push({ draftDir, decision, preview: await recordCableStyleReview({ root, draftDir, decision, verifyOnly: true }) });
  }
  if (!apply) return verified.map(row => row.preview);
  const committed = [];
  for (const { draftDir, decision } of verified)
    committed.push(await recordCableStyleReview({ root, draftDir, decision }));
  return committed;
}
