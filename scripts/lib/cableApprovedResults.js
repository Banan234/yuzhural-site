import { cableFamilyScope } from './cableVisualClassification.js';
import { cableVisibleConstructionKey, cableSharedVisualKey, CABLE_SHARED_VISUAL_REUSE, CABLE_VISUAL_GROUP_REUSE } from './cableReferenceCompatibility.js';
import { cableReviewCheckAccepted } from './cableIllustrationDefects.js';
import { getGeneratedProductImage, matchesApprovedCableConstruction } from '../../shared/productImages.js';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { blocksCableCatalogAssignment, blocksFromLegacyReview } from './cableReviewPolicy.js';
import { historicalCableOverlap } from './cableGenerationClaims.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { vvgCutHold } from './cableVvgCutQuality.js';
import { CATALOG_CABLE_VERSION } from './cableCatalogProfile.js';
import { getVvgIllustrationSignature, VVG_TYPICAL_ILLUSTRATION } from './cableVvgIllustration.js';
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
  stagedRegistry,
}) {
  if (approval.status !== 'APPROVED') return;
  const png = await fs.readFile(path.join(draftDir, 'image.png'));
  if (
    hash(png) !== approval.sha256 ||
    approval.visualKey !== group.visualKey ||
    !CABLE_STYLE_REVIEW_CHECKS.every(k => cableReviewCheckAccepted(approval, k))
  )
    throw Error('Invalid approval archive');
  const base = location(root);
  await fs.mkdir(base, { recursive: true });
  const lock = stagedRegistry ? null : await fs.open(path.join(base, '.registry.lock'), 'wx');
  try {
    const registry = stagedRegistry || (await optional(path.join(base, 'registry.json'))) || {
      schemaVersion: 1,
      byVisualKey: {},
    };
    const previous = registry.byVisualKey[group.visualKey];
    if (!approval.archiveOnly && approval.preserveExistingApproval && previous &&
        previous.sha256 !== approval.sha256)
      throw Error('Existing approval is preserved; approve as an archive-only alternative');
    if (!approval.archiveOnly && previous?.APPROVED_FOR_CATALOG === true &&
      (previous.sha256 !== approval.sha256 || approval.APPROVED_FOR_CATALOG === false)) {
      const mapping = await optional(path.join(root, 'shared/generatedProductImages.json'));
      const published = Object.values(mapping?.bySku || {}).some(binding =>
        binding.visualKey === previous.visualKey && binding.sha256 === previous.sha256
      );
      if (published) throw Error('Published APPROVED requires a separate catalog migration before replacement or revocation');
    }
    const gallerySuffix = stagedRegistry ? '-' + randomUUID() : '';
    const dir = path.join(base, hash(group.visualKey) + '-' + approval.sha256 + gallerySuffix);
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
    const entry = {
      status: 'APPROVED',
      ...(approval.manualGallery && { manualGallery: true }),
      APPROVED_FOR_CATALOG: approval.APPROVED_FOR_CATALOG !== false,
      APPROVED_AS_REFERENCE: approval.APPROVED_AS_REFERENCE === true,
      visualKey: group.visualKey,
      sha256: approval.sha256,
      standardVersion: group.standardVersion,
      profileHash: hash(group.profile),
      technicalSourceVersion: group.profile.technicalConstruction?.source === 'catalog-construction-1' ? 'catalog-construction-1' : undefined,
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
    if (approval.archiveOnly) {
      registry.alternativesBySha256 ??= {};
      registry.alternativesBySha256[entry.sha256] = {
        ...entry, APPROVED_FOR_CATALOG: false, APPROVED_AS_REFERENCE: false, archiveOnly: true,
      };
    } else registry.byVisualKey[group.visualKey] = entry;
    if (lock) await atomic(path.join(base, 'registry.json'), registry);
    return entry;
  } finally {
    if (lock) {
      await lock.close();
      await fs.unlink(path.join(base, '.registry.lock'));
    }
  }
}
/** An approval depends on the protected standard and anatomy, not today's
 * supplemental-reference availability or ability to prepare a new request. */
export function approvedCableVerificationContext(style, profile) {
  return {
    standardVersion: style.version,
    reference: style.references[profile.visualizationType],
    technicalProfile: buildCableTechnicalProfile(profile),
  };
}

export async function findExistingCatalogCable({ root, catalog, style, bindings, registry }) {
  bindings ??= await optional(path.join(root, 'shared/generatedProductImages.json'));
  registry ??= await optional(path.join(location(root), 'registry.json'));
  if (!bindings || !registry || !getGeneratedProductImage(catalog.product, bindings, registry)) return null;
  const { visualKey, sha256 } = bindings.bySku[catalog.product.sku];
  if (vvgCutHold(sha256)) throw Error('NEEDS_REVIEW: current catalog PNG is held for a correction');
  if (catalog.issues.some(reason => reason.startsWith('catalog-conflict:') || reason.startsWith('catalog-unsupported:')))
    throw Error('NEEDS_REVIEW: current catalog evidence requires reconciliation');
  const entry = registry.byVisualKey[visualKey];
  const dir = path.resolve(root, entry.draftDir);
  if (!dir.startsWith(location(root) + path.sep)) throw Error('Invalid approved result path');
  const { profile } = await read(path.join(dir, 'group.json'));
  const request = approvedCableVerificationContext(style, profile);
  const technical = request.technicalProfile;
  const present = status => status === 'unknown' ? null : status === 'present';
  const archived = {
    ...profile, filling: present(technical.interstitialFilling.status),
    innerSheath: present(technical.innerSheath.status), fireBarrier: technical.fireBarrier,
    drainWire: technical.additionalConductors.length > 0,
    separator: technical.separator == null ? null : Boolean(technical.separator),
  };
  for (const [field, current] of Object.entries(catalog.known)) {
    if (current != null && archived[field] != null && current !== archived[field])
      throw Error('NEEDS_REVIEW: current catalog construction conflicts with approved PNG: ' + field);
  }
  return findApprovedCableResult({root,visualKey,profile,request});
}

export async function findApprovedCableResult({
  root,
  visualKey,
  profile,
  request,
}) {
  const registry = await optional(path.join(location(root), 'registry.json'));
  return verifyApprovedCableResult(root, registry, visualKey, profile, request);
}

async function verifyApprovedCableResult(root, registry, visualKey, profile, request) {
  if (!registry) return null;
  const e = visualKey
    ? registry.byVisualKey[visualKey]
    : Object.values(registry.byVisualKey).find(
        (e) => e.profileHash === hash(profile)
      );
  if (!e || e.status !== 'APPROVED') return null;
  if (blocksCableCatalogAssignment(registry, e))
    throw Error('NEEDS_REVIEW: manual catalog review blocks reuse and automatic regeneration');
  if ((await loadCableReviewDecisions(root)).some(({ decision }) => decision.sha256 === e.sha256 &&
      blocksFromLegacyReview(registry, decision)))
    throw Error('NEEDS_REVIEW: existing approval conflicts with durable review; no automatic regeneration');
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
    group.visualKey !== e.visualKey || hash(group.profile) !== e.profileHash ||
    approval.standardVersion !== e.standardVersion ||
    approval.status !== 'APPROVED' ||
    !approval.reviewer ||
    !CABLE_STYLE_REVIEW_CHECKS.every(k => cableReviewCheckAccepted(approval, k))
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


export async function findReusableCableResult(args) {
  return (await selectReusableCableResults(args)).selected;
}

export async function selectReusableCableResults({
  root, visualKey, profile, request, family = profile.family, catalog, includeAlternatives = false,
}) {
  const registry = await optional(path.join(location(root), 'registry.json'));
  const exact = await verifyApprovedCableResult(root, registry, visualKey, profile, request);
  const current = exact && !vvgCutHold(exact.sha256) ? exact : null;
  const shared = cableSharedVisualKey(profile);
  if (catalog && current?.APPROVED_FOR_CATALOG === true &&
      !matchesApprovedCableConstruction(catalog.product, current, undefined, catalog))
    throw Error('NEEDS_REVIEW: existing approval is incompatible with the current SKU');
  if (!shared && current?.APPROVED_FOR_CATALOG === true && !includeAlternatives)
    return { selected: current, alternatives: [] };
  const matches = !shared && current?.APPROVED_FOR_CATALOG === true ? [current] : [];
  const familyFallbacks = [];
  const signature = profile.technicalConstruction?.source === CATALOG_CABLE_VERSION
    ? null : getVvgIllustrationSignature(profile);
  const schematic = cableVisibleConstructionKey(profile);
  let style;
  const profileHash = hash(profile);
  let heldMatch = Boolean(exact && vvgCutHold(exact.sha256));
  let blockedMatch;
  const candidates = Object.values(registry?.byVisualKey ?? {}).sort((a, b) =>
    (shared ? 0 : Number(b.profileHash === profileHash) - Number(a.profileHash === profileHash)) ||
    a.visualKey.localeCompare(b.visualKey, 'en'));
  for (const entry of candidates) {
    if (entry.visualKey === exact?.visualKey) {
      if (shared && current?.APPROVED_FOR_CATALOG === true) {
        if (!includeAlternatives) return { selected: current, alternatives: [] };
        matches.push(current);
      }
      continue;
    }
    if (entry.status !== 'APPROVED' || entry.APPROVED_FOR_CATALOG !== true) continue;
    const equivalent = entry.profileHash !== profileHash || entry.visualKey !== visualKey;
    if (equivalent && !schematic && (!signature || !entry.visualKey.startsWith('vvg'))) continue;
    let group;
    try {
      const dir = path.resolve(root, entry.draftDir);
      if (!dir.startsWith(location(root) + path.sep)) throw Error('Invalid approved result path');
      group = await read(path.join(dir, 'group.json'));
    } catch (error) {
      blockedMatch ??= error;
      continue;
    }
    const sameFamily = cableFamilyScope(group.profile.family) === cableFamilyScope(family);
    const candidateShared = cableSharedVisualKey(group.profile);
    const matchesShared = shared && shared === candidateShared;
    if (!sameFamily && !matchesShared) continue;
    const matchesVvg = sameFamily && signature && entry.visualKey.startsWith('vvg') &&
      getVvgIllustrationSignature(group.profile) === signature;
    const matchesSchematic = matchesShared || (sameFamily && (!shared || !candidateShared) && schematic && cableVisibleConstructionKey(group.profile) === schematic);
    if (equivalent && !matchesVvg && !matchesSchematic) continue;
    let candidateRequest = request;
    if (entry.referenceSha256 !== request.reference.sha256) {
      if (!matchesSchematic) continue;
      style ??= await (await import('./cableImageStyle.js')).loadCableImageStyle(root);
      candidateRequest = approvedCableVerificationContext(style,group.profile);
      if (entry.referenceSha256 !== candidateRequest.reference.sha256) continue;
    }
    if (vvgCutHold(entry.sha256)) {
      heldMatch = true;
      continue;
    }
    const approved = await findApprovedCableResult({
      root, visualKey: entry.visualKey, profile: group.profile, request:candidateRequest,
    }).catch(error => {
      blockedMatch ??= error;
      return null;
    });
    if (!approved) continue;
    const match = { ...approved, profile: group.profile, equivalent,
      reusePolicy: equivalent && matchesSchematic ? (matchesShared ? CABLE_SHARED_VISUAL_REUSE : CABLE_VISUAL_GROUP_REUSE) : undefined };
    if (catalog && !matchesApprovedCableConstruction(catalog.product, match, equivalent
      ? { policy: match.reusePolicy ?? VVG_TYPICAL_ILLUSTRATION, profile: match.profile } : undefined, catalog)) {
      blockedMatch ??= Error('NEEDS_REVIEW: existing approval is incompatible with the current SKU');
      continue;
    }
    if (shared && !matchesShared) {
      familyFallbacks.push(match);
      continue;
    }
    if (!includeAlternatives) return { selected: match, alternatives: [] };
    matches.push(match);
  }
  const available = new Set();
  const options = [...matches, ...familyFallbacks].filter(({ sha256 }) => {
    if (available.has(sha256)) return false;
    available.add(sha256);
    return true;
  });
  const [selected = current, ...alternatives] = options;
  if (selected?.APPROVED_FOR_CATALOG !== true && blockedMatch) throw blockedMatch;
  if (!selected && heldMatch)
    throw Error('Approved VVG source requires a targeted correction before new reuse');
  return { selected, alternatives };
}

export async function findHistoricalCatalogApproval(root, sku, profile) {
  const registry = await optional(path.join(location(root), 'registry.json'));
  for (const entry of Object.values(registry?.byVisualKey ?? {})) {
    if (entry.status !== 'APPROVED') continue;
    const dir = path.resolve(root, entry.draftDir);
    if (!dir.startsWith(location(root) + path.sep)) throw Error('Invalid approved result path');
    const group = await read(path.join(dir, 'group.json'));
    if (historicalCableOverlap(group, sku, profile)) return entry;
  }
  return null;
}
