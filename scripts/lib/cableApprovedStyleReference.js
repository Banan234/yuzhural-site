import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isCableReferenceCompatible } from './cableReferenceCompatibility.js';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const match = (a, b, fields) => fields.every(field => equal(a[field], b[field]));

function layers(profile) {
  const contract = buildCableTechnicalProfile(profile);
  return {
    innerSheath: contract.innerSheath,
    outerSheath: contract.outerSheath.status,
    outerSheathMaterial: profile.technicalConstruction?.outerSheathMaterial ?? profile.outerJacketMaterial ?? null,
    filling: contract.interstitialFilling,
    separator: contract.separator ?? profile.technicalConstruction?.separator ?? null,
    roles: contract.layers.map(layer => layer.role),
    armorType: contract.armor.type,
    screenType: contract.screen.type,
    drain: contract.additionalConductors.length,
  };
}

/** Lexicographic priorities keep family preference from outweighing real geometry. */
export function compareCableReferenceProfile(reference, target) {
  if (!isCableReferenceCompatible(reference, target)) return null;
  let referenceLayers;
  try {
    referenceLayers = layers(reference);
  } catch {
    // An older permission is preserved, but incomplete anatomy cannot guide a new request.
    return null;
  }
  const targetLayers = layers(target);
  const sameConstruction = match(reference, target, [
    'productType', 'conductorShape', 'geometry', 'conductorMaterial', 'conductorConstruction',
  ]);
  const sameLayout = match(reference, target, ['cores', 'coreLayout', 'pairedGroupSize']);
  const sameSheaths = match(referenceLayers, targetLayers, ['innerSheath', 'outerSheath', 'outerSheathMaterial', 'filling', 'separator']);
  const sameLayers = match(referenceLayers, targetLayers, ['roles', 'armorType', 'screenType', 'drain']) &&
    equal([...(reference.specialElements || [])].sort(), [...(target.specialElements || [])].sort());
  const sameComposition = reference.visualizationType === target.visualizationType;
  return {
    role: sameConstruction && sameLayout && sameSheaths && sameLayers && sameComposition
      ? 'GEOMETRY_MATCH' : 'STYLE_ONLY',
    rank: [
      Number(sameConstruction), Number(sameLayout), Number(sameSheaths), Number(sameLayers),
      Number(sameComposition), Number(reference.family === target.family),
      Number(equal(reference.coreColors, target.coreColors)),
      -Math.abs(reference.cores - target.cores),
    ],
  };
}

function compareCandidates(a, b) {
  if (a.role !== b.role) return a.role === 'GEOMETRY_MATCH' ? -1 : 1;
  for (const [index, value] of a.rank.entries()) {
    if (value !== b.rank[index]) return b.rank[index] - value;
  }
  return a.visualKey.localeCompare(b.visualKey);
}

export async function loadApprovedStyleReferences(root) {
  const archive = path.join(root, 'data/cable-approved-results');
  const registry = JSON.parse(await fs.readFile(path.join(archive, 'registry.json')));
  const archivePath = await fs.realpath(archive);
  const library = [];
  for (const entry of Object.values(registry.byVisualKey)) {
    if (entry.status !== 'APPROVED' || entry.APPROVED_AS_REFERENCE !== true) continue;
    const dir = await fs.realpath(path.resolve(root, entry.draftDir));
    if (!dir.startsWith(archivePath + path.sep)) throw Error('Invalid approved path');
    const [image, approval, group] = await Promise.all([
      fs.readFile(path.join(dir, 'image.png')),
      fs.readFile(path.join(dir, 'approval.json')).then(JSON.parse),
      fs.readFile(path.join(dir, 'group.json')).then(JSON.parse),
    ]);
    if (approval.APPROVED_AS_REFERENCE !== true) continue;
    if (hash(image) !== entry.sha256 || approval.status !== 'APPROVED' ||
        approval.sha256 !== entry.sha256 || approval.visualKey !== entry.visualKey)
      throw Error('Approved reference integrity mismatch');
    library.push({ path: path.join(dir, 'image.png'), sha256: entry.sha256, visualKey: entry.visualKey, profile: group.profile });
  }
  return library;
}

/** Select a permitted supplemental image. Protected style input remains separate. */
export async function selectApprovedStyleReference(root, target) {
  const library = await loadApprovedStyleReferences(root);
  const candidates = [];
  for (const entry of library) {
    const comparison = compareCableReferenceProfile(entry.profile, target);
    if (comparison) candidates.push({ ...entry, ...comparison });
  }
  candidates.sort(compareCandidates);
  if (!candidates.length) throw Error('No compatible manually APPROVED reference');
  return {
    ...candidates[0],
    librarySize: library.length,
    compatibleReferenceCount: candidates.length,
    ranking: candidates.map(({ visualKey, role, rank }) => ({ visualKey, role, rank })),
  };
}
