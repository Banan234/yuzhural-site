import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deriveOuterSheathGeometry } from './cableOuterSheathGeometry.js';
import { CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
export async function findApprovedGeometryReference(root, profile) {
  if (!profile) return null;
  let data;
  try {
    data = JSON.parse(
      await fs.readFile(path.join(root, 'data/cable-geometry-references.json'))
    );
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const r = data.references.find(
    (r) =>
      r.status === 'APPROVED' &&
      Object.entries(r.scope).every(
        ([k, v]) => JSON.stringify(profile[k]) === JSON.stringify(v)
      )
  );
  if (!r) return null;
  const dir = path.resolve(root, r.draftDir);
  if (
    !dir.startsWith(path.join(root, 'data/cable-approved-results') + path.sep)
  )
    throw Error('Invalid geometry reference location');
  const master = JSON.parse(
    await fs.readFile(
      path.join(root, 'data/cable-approved-results/registry.json')
    )
  ).byVisualKey[r.visualKey];
  if (master?.status !== 'APPROVED' || master.sha256 !== r.sha256)
    throw Error('Approved geometry reference registry mismatch');
  const approval = JSON.parse(
      await fs.readFile(path.join(dir, 'approval.json'))
    ),
    png = await fs.readFile(path.join(dir, 'image.png'));
  if (
    deriveOuterSheathGeometry(profile) !== r.outerSheathGeometry ||
    createHash('sha256').update(png).digest('hex') !== r.sha256 ||
    approval.sha256 !== r.sha256 ||
    approval.status !== 'APPROVED' ||
    !CABLE_STYLE_REVIEW_CHECKS.every((k) => approval.checks?.[k] === true)
  )
    throw Error('Approved geometry reference integrity mismatch');
  return { ...r, imagePath: path.join(dir, 'image.png') };
}
