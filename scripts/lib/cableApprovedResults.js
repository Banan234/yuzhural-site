import { deriveOuterSheathGeometry } from './cableOuterSheathGeometry.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateCableImagePng } from './cableImagePng.js';
import { CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
const hash = (v) =>
  createHash('sha256')
    .update(Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const read = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
const optional = async (f) => {
  try {
    return await read(f);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};
const atomic = async (f, v) => {
  const t = f + '.' + randomUUID() + '.tmp';
  await fs.writeFile(t, JSON.stringify(v, null, 2) + '\n');
  await fs.rename(t, f);
};
const location = (root) => path.join(root, 'data/cable-approved-results');
/** Durable approval archive: no public files, bindings or production manifest. */
export async function archiveApprovedCableResult({
  root,
  draftDir,
  group,
  approval,
}) {
  if (approval.status !== 'APPROVED') return;
  const png = await fs.readFile(path.join(draftDir, 'image.png'));
  if (
    hash(png) !== approval.sha256 ||
    approval.visualKey !== group.visualKey ||
    !CABLE_STYLE_REVIEW_CHECKS.every((k) => approval.checks?.[k] === true)
  )
    throw Error('Invalid approval archive');
  const base = location(root);
  await fs.mkdir(base, { recursive: true });
  const lock = await fs.open(path.join(base, '.registry.lock'), 'wx');
  try {
    const dir = path.join(base, hash(group.visualKey) + '-' + approval.sha256);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(path.join(dir, 'image.png'), png, { flag: 'wx' });
    } catch (e) {
      if (
        e.code !== 'EEXIST' ||
        hash(await fs.readFile(path.join(dir, 'image.png'))) !== approval.sha256
      )
        throw e;
    }
    const request = await optional(path.join(draftDir, 'request.json'));
    for (const name of ['request.json', 'review.json']) {
      const v = await optional(path.join(draftDir, name));
      if (v) await atomic(path.join(dir, name), v);
    }
    await atomic(path.join(dir, 'group.json'), {
      ...group,
      status: 'APPROVED',
      manualReview: approval,
      automaticProductionBinding: false,
    });
    await atomic(path.join(dir, 'approval.json'), approval);
    const registry = (await optional(path.join(base, 'registry.json'))) || {
      schemaVersion: 1,
      byVisualKey: {},
    };
    const previous = registry.byVisualKey[group.visualKey];
    const entry = {
      status: 'APPROVED',
      APPROVED_FOR_CATALOG: approval.APPROVED_FOR_CATALOG !== false,
      APPROVED_AS_REFERENCE: approval.APPROVED_AS_REFERENCE === true,
      visualKey: group.visualKey,
      sha256: approval.sha256,
      standardVersion: group.standardVersion,
      profileHash: hash(group.profile),
      outerSheathGeometry: deriveOuterSheathGeometry(group.profile),
      referenceSha256: request?.reference?.sha256 || group.referenceSha256,
      screenVisualVersion:
        request?.technicalProfile?.screenVisualStandard?.version || null,
      draftKey: group.draftKey,
      draftDir: path.relative(root, dir),
      reviewedAt: approval.reviewedAt,
      previousApprovedResults:
        previous && previous.sha256 !== approval.sha256
          ? [...(previous.previousApprovedResults || []), previous]
          : previous?.previousApprovedResults || [],
    };
    registry.byVisualKey[group.visualKey] = entry;
    await atomic(path.join(base, 'registry.json'), registry);
    return entry;
  } finally {
    await lock.close();
    await fs.unlink(path.join(base, '.registry.lock'));
  }
}
export async function findApprovedCableResult({
  root,
  visualKey,
  profile,
  request,
}) {
  const registry = await optional(path.join(location(root), 'registry.json'));
  if (!registry) return null;
  const e = visualKey
    ? registry.byVisualKey[visualKey]
    : Object.values(registry.byVisualKey).find(
        (e) => e.profileHash === hash(profile)
      );
  if (!e || e.status !== 'APPROVED') return null;
  if (
    e.profileHash !== hash(profile) ||
    e.standardVersion !== request.standardVersion ||
    e.referenceSha256 !== request.reference.sha256 ||
    (profile.shield &&
      e.screenVisualVersion !==
        request.technicalProfile.screenVisualStandard?.version)
  )
    throw Error(
      'NEEDS_REVIEW: approved result exists but construction/standard changed; no automatic regeneration'
    );
  const dir = path.resolve(root, e.draftDir);
  if (!dir.startsWith(location(root) + path.sep))
    throw Error('Invalid approved result path');
  const png = await fs.readFile(path.join(dir, 'image.png')),
    approval = await read(path.join(dir, 'approval.json')),
    group = await read(path.join(dir, 'group.json'));
  if (
    hash(png) !== e.sha256 ||
    approval.sha256 !== e.sha256 ||
    approval.visualKey !== e.visualKey ||
    group.visualKey !== e.visualKey ||
    approval.standardVersion !== e.standardVersion ||
    approval.status !== 'APPROVED' ||
    !approval.reviewer ||
    !CABLE_STYLE_REVIEW_CHECKS.every((k) => approval.checks?.[k] === true)
  )
    throw Error('Approved result integrity failed; no regeneration');
  if (
    deriveOuterSheathGeometry(profile) === 'UNKNOWN' ||
    deriveOuterSheathGeometry(profile) !==
      deriveOuterSheathGeometry(group.profile)
  )
    throw Error('NEEDS_TECHNICAL_REVIEW: approved sheath geometry mismatch');
  const validation = validateCableImagePng(png, {
    background: 'transparent',
    composition: { rightEdgeCrop: false },
  });
  return { ...e, absoluteDraftDir: dir, validation };
}
