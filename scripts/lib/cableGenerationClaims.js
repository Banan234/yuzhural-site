import { cableExecutionFamilyName, cableFamilyScope } from './cableVisualClassification.js';
import { cableSharedVisualKey, cableVisibleConstructionKey } from './cableReferenceCompatibility.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { cableIllustrationHold } from './cableIllustrationDefects.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateCableImagePng } from './cableImagePng.js';
import { getVvgIllustrationSignature } from './cableVvgIllustration.js';

const claimsDirectory = root => path.join(root, 'data/product-image-metadata/generation-claims');
const historyFile = root => path.join(root, 'data/product-image-metadata/historical-generation-claims.json');
const indexedDrafts = new WeakMap();
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const optional = async file => read(file).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
};

export function cableGenerationClaimKey(profile, revision = null) {
  const equivalent = getVvgIllustrationSignature(profile);
  return createHash('sha256').update(JSON.stringify(revision ? [equivalent ?? canonical(profile), revision] : equivalent ?? canonical(profile))).digest('hex');
}

export function cableGenerationReservationKey(profile, revision) {
  const shared = !revision && cableSharedVisualKey(profile);
  return shared ? createHash('sha256').update(JSON.stringify(['shared',shared])).digest('hex')
    : cableGenerationClaimKey(profile, revision);
}

export function findCableGenerationClaim(claims, profile, revision, key = cableGenerationReservationKey(profile, revision)) {
  return claims.get(key) ?? claims.get(cableGenerationClaimKey(profile, revision));
}

async function* requestFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === 'request.json') yield file;
    if (entry.isDirectory() &&
        !['node_modules', 'dist', '.git', '.catalog-current-releases'].includes(entry.name)) yield* requestFiles(file);
  }
}

export async function readCableGenerationClaims(root, onlyKey) {
  return readClaims(root, onlyKey, false);
}

async function readClaims(root, onlyKey, legacyOnly) {
  const records = new Map();
  const durable = legacyOnly ? [] : await loadCableReviewDecisions(root);
  const decisionsByDraft = new Map();
  for (const { decision, decisionDir, claimKey, originalDraft } of durable) {
    if (!claimKey) continue;
    const status = decision.status === 'NEEDS_REVIEW'
      ? cableIllustrationHold(decision.sha256) || decision.disposition === 'NEEDS_CORRECTION'
        ? 'HELD_DEFECT' : 'PENDING_REVIEW'
      : decision.status;
    const record = { key: claimKey, draftDir: decisionDir, status, authoritative: true };
    if (originalDraft) decisionsByDraft.set(path.resolve(root, originalDraft), record);
    if (!onlyKey || claimKey === onlyKey) records.set(claimKey, record);
  }
  const claims = claimsDirectory(root);
  const global = legacyOnly ? [] : (await fs.readdir(claims).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })).filter(name => name.endsWith('.json')).map(name => path.join(claims, name));
  const history = legacyOnly ? null : await optional(historyFile(root));
  if (!legacyOnly && history === null &&
      await optional(path.join(root, 'data/product-image-metadata/production-v1/manifest.json')))
    throw Error('Historical cable claims index is missing; restore or index it before continuing');
  if (history !== null && (history.version !== 1 || !Array.isArray(history.claims)))
    throw Error('Invalid historical cable claims index');
  const archiveByDirectory = new Map((history?.claims ?? []).map(claim =>
    [path.resolve(root, claim.outputDir), claim]));
  const historical = legacyOnly ? requestFiles(path.join(root, 'outputs')) : [];
  for (const [files, legacy] of [[global, false], [historical, true]]) {
    for await (const file of files) {
      const request = await read(file).catch(error => {
        if (legacy && error instanceof SyntaxError) return null;
        throw error;
      });
      if (!request) continue;
      if (legacy && (!request.profile || !request.standardVersion?.startsWith('approved-cable-style-') ||
          request.status === 'PREPARED_NOT_SENT')) continue;
      const key = legacy ? cableGenerationClaimKey(request.profile, request.cutRevision) : request.key;
      if (onlyKey && key !== onlyKey) continue;
      const draftDir = legacy ? path.dirname(file) : path.resolve(root, request.outputDir);
      if (records.get(key)?.authoritative) continue;
      const archived = !legacy && archiveByDirectory.get(draftDir);
      if (archived) {
        const reviewed = decisionsByDraft.get(draftDir);
        const claim = { key, draftDir: reviewed?.draftDir ?? draftDir,
          status: reviewed?.status ?? archived.status, authoritative: true };
        indexedDrafts.set(claim, archived.draft);
        records.set(key, claim);
        continue;
      }
      const review = await optional(path.join(draftDir, 'review.json'));
      if (legacy && request.status == null && !review &&
          !(await fs.stat(path.join(draftDir, 'image.png')).catch(error => {
            if (error.code !== 'ENOENT') throw error;
          }))) continue;
      let status = review?.status === 'FAILED' ? 'FAILED' : 'REQUEST_OUTCOME_UNKNOWN';
      if (status !== 'FAILED') {
        try {
          const png = await fs.readFile(path.join(draftDir, 'image.png'));
          const sha256 = createHash('sha256').update(png).digest('hex');
          if (review?.validation?.sha256 !== sha256)
            validateCableImagePng(png, { background: 'transparent' });
          const decision = await optional(path.join(draftDir, 'approval.json'));
          status = cableIllustrationHold(sha256) ? 'HELD_DEFECT'
            : decision?.status === 'REJECTED' && decision.sha256 === sha256
              ? 'REJECTED' : 'PENDING_REVIEW';
        } catch (error) {
          if (error.code !== 'ENOENT') status = 'FAILED';
        }
      }
      // Prefer a recoverable historical PNG over a historical claim with no PNG.
      // The global reservation remains authoritative when it exists.
      const previous = records.get(key);
      if (!previous || status === 'PENDING_REVIEW') {
        const claim = { key, draftDir, status, authoritative: !legacy };
        if (request.draft) indexedDrafts.set(claim, request.draft);
        records.set(key, claim);
      }
    }
  }
  for (const { key, outputDir, status, draft } of history?.claims ?? []) {
    const draftDir = path.resolve(root, outputDir);
    if (!/^[a-f0-9]{64}$/u.test(key) || !draftDir.startsWith(path.resolve(root, 'outputs') + path.sep) ||
        !['FAILED', 'REQUEST_OUTCOME_UNKNOWN', 'REJECTED', 'HELD_DEFECT', 'PENDING_REVIEW'].includes(status))
      throw Error('Invalid entry in historical cable claims index');
    if ((onlyKey && key !== onlyKey) || records.has(key)) continue;
    const claim = { key, draftDir, status, authoritative: false };
    indexedDrafts.set(claim, draft);
    records.set(key, claim);
  }
  return records;
}

async function readClaimDraft(claim) {
  if (indexedDrafts.has(claim)) return indexedDrafts.get(claim);
  return await optional(path.join(claim.draftDir, 'group.json')) ??
    await optional(path.join(claim.draftDir, 'request.json'));
}

export async function indexHistoricalCableClaims(root, { apply = false } = {}) {
  const records = await readClaims(root, undefined, true);
  const claims = await Promise.all([...records.values()].map(async ({ key, draftDir, status }) => {
    const draft = await readClaimDraft({ draftDir });
    return {
      key, outputDir: path.relative(root, draftDir), status,
      draft: draft && {
        profile: draft.profile,
        members: draft.members?.map(({ sku }) => ({ sku })),
        catalogSource: draft.catalogSource && { sku: draft.catalogSource.sku },
      },
    };
  }));
  if (apply) {
    const destination = historyFile(root);
    const temporary = destination + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ version: 1, claims }, null, 2) + '\n', { flag: 'wx' });
    try {
      await fs.link(temporary, destination);
    } finally {
      await fs.unlink(temporary);
    }
  }
  return claims;
}

export async function reserveCableGeneration({ root, profile, sku, outputDir, visualKey, revision }) {
  const key = cableGenerationReservationKey(profile, revision);
  const originalKey = cableGenerationClaimKey(profile, revision);
  const records = await readCableGenerationClaims(root, key === originalKey ? key : undefined);
  const existing = findCableGenerationClaim(records, profile, revision, key);
  if (existing) return existing;
  const dir = claimsDirectory(root);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, key + '.json');
  const temp = path.join(dir, randomUUID() + '.pending');
  await fs.writeFile(temp, JSON.stringify({
    key, visualKey, outputDir: path.relative(root, outputDir), reservedAt: new Date().toISOString(),
    draft: { profile, ...(sku && { catalogSource: { sku } }) },
  }), { flag: 'wx' });
  try {
    await fs.link(temp, target);
    return null;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const claim = await read(target);
    return { key, draftDir: path.resolve(root, claim.outputDir), status: 'REQUEST_OUTCOME_UNKNOWN' };
  } finally {
    await fs.unlink(temp);
  }
}

/** Historical anatomy can hold a new request, but cannot supply data or grant reuse. */
export function historicalCableOverlap(draft, sku, profile, sameSharedConstruction) {
  if (profile.schematicAssumptions && (draft?.members?.some(member => member.sku === sku) ||
      draft?.catalogSource?.sku === sku)) return true;
  const old = draft?.profile;
  if (!old) return false;
  if (sameSharedConstruction === true) return true;
  if (sameSharedConstruction === undefined && old.cores === profile.cores && old.geometry === profile.geometry) {
    const shared = cableSharedVisualKey(profile);
    if (shared && shared === cableSharedVisualKey(old)) return true;
  }
  if (old.family !== profile.family &&
      (cableExecutionFamilyName(old.family) !== old.family || cableExecutionFamilyName(profile.family) !== profile.family) &&
      cableFamilyScope(old.family) === cableFamilyScope(profile.family) &&
      cableExecutionFamilyName(old.family)?.toLowerCase() === cableExecutionFamilyName(profile.family)?.toLowerCase()) {
    const signature = cableVisibleConstructionKey(profile);
    if (signature && cableVisibleConstructionKey(old) === signature) return true;
  }
  if (old.technicalConstruction?.source === 'catalog-construction-1') {
    // Older catalog keys retained the physical screen type. Reserve their
    // outcome during the transition to the symbolic screen visual identity.
    if (!old.shield || (!old.shieldType && !old.technicalConstruction.screenType)) return false;
    const normalize = candidate => canonical({
      ...candidate, shieldType: null,
      technicalConstruction: { ...candidate.technicalConstruction, screenType: null },
    });
    return JSON.stringify(normalize(old)) === JSON.stringify(normalize(profile));
  }
  if (draft.members?.some(member => member.sku === sku) || draft.catalogSource?.sku === sku) return true;
  return profile.family.startsWith('vvg-') && old.family.startsWith('vvg') &&
    ['cores', 'geometry', 'conductorMaterial', 'conductorConstruction', 'conductorShape', 'shield', 'armor']
      .every(field => profile[field] === old[field]) &&
    Boolean(profile.specialElements?.includes('fire-barrier')) === Boolean(old.specialElements?.includes('fire-barrier')) &&
    (profile.technicalConstruction?.interstitialFilling?.status === 'present') ===
      (old.technicalConstruction?.interstitialFilling?.status === 'present');
}

const historicalDrafts = new WeakMap();

export async function findHistoricalCatalogClaim(sku, profile, claims) {
  if (!historicalDrafts.has(claims)) {
    historicalDrafts.set(claims, Promise.all([...claims.values()].map(async claim => {
      const draft = await readClaimDraft(claim);
      return { claim, draft, shared: cableSharedVisualKey(draft?.profile) };
    })));
  }
  const records = await historicalDrafts.get(claims);
  const current = cableGenerationClaimKey(profile);
  const shared = cableSharedVisualKey(profile);
  const reserved = shared && cableGenerationReservationKey(profile);
  for (const record of records) {
    if (record.claim.key === current || record.claim.key === reserved) continue;
    if (historicalCableOverlap(record.draft, sku, profile, Boolean(shared && shared === record.shared))) return record.claim;
  }
  return null;
}
