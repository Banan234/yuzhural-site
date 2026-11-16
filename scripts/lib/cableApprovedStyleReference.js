import { cableSharedVisualKey } from './cableReferenceCompatibility.js';
import compositionRules from '../../data/cableMulticoreCompositionRules.json' with { type: 'json' };
import { cableFamilyScope } from './cableVisualClassification.js';
import { blocksFromLegacyReview, cableReferencePermission, cableRegistryReview } from './cableReviewPolicy.js';
import { cableIllustrationHold } from './cableIllustrationDefects.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { vvgCutHold } from './cableVvgCutQuality.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isCableReferenceCompatible } from './cableReferenceCompatibility.js';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const match = (a, b, fields) => fields.every(field => equal(a[field], b[field]));

const referenceUses = {
  GEOMETRY_MATCH: 'compatible spatial arrangement, axial stripping and spacing of the contract-listed layer steps',
  LAYOUT_REFERENCE: 'packing in depth, separation of visible tips and alignment with the sheath axis',
  SHEATH_REFERENCE: 'outer sheath silhouette and cut-edge appearance',
  STYLE_ONLY: 'local material rendering and texture only; the protected first input governs style',
};

function layers(profile) {
  const contract = buildCableTechnicalProfile(profile);
  return {
    innerSheath: contract.innerSheath,
    outerSheath: contract.outerSheath.status,
    filling: contract.interstitialFilling,
    separator: contract.separator ?? profile.technicalConstruction?.separator ?? null,
    roles: contract.layers.map(layer => layer.role),
    materials: contract.layers.map(layer => [layer.role,
      layer.material ?? (layer.role === 'outer-jacket'
        ? profile.technicalConstruction?.outerSheathMaterial ?? profile.outerJacketMaterial ?? null : null),
      layer.placement ?? null]),
    armorType: contract.armor.type,
    screenVisualVersion: contract.screenVisualStandard?.version ?? null,
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
  // Geometry permissions depend on visible layers and their placement.
  const conflicts = referenceLayers.materials.some(([role, material, placement]) =>
    targetLayers.materials.some(([targetRole, targetMaterial, targetPlacement]) => targetRole === role &&
      ((!['outer-jacket', 'inner-sheath', 'interstitial-filling', 'individual-insulation'].includes(role) &&
          material != null && targetMaterial != null && material !== targetMaterial) ||
        (placement != null && targetPlacement != null && placement !== targetPlacement &&
          !(role === 'screen' && referenceLayers.screenVisualVersion &&
            referenceLayers.screenVisualVersion === targetLayers.screenVisualVersion)))));
  if (conflicts) return null;
  const sameConstruction = match(reference, target, [
    'productType', 'conductorShape', 'geometry', 'conductorMaterial', 'conductorConstruction', 'conductorFinish',
  ]);
  const sameLayout = match(reference, target, ['cores', 'coreLayout', 'pairedGroupSize']);
  const absentFromImage = layer => layer.status !== 'present';
  const sameVisibleLayer = (a, b) => (absentFromImage(a) && absentFromImage(b)) ||
    (a.status === b.status && equal(a.placement, b.placement));
  const sameSheaths = referenceLayers.outerSheath === targetLayers.outerSheath &&
    sameVisibleLayer(referenceLayers.innerSheath, targetLayers.innerSheath) &&
    sameVisibleLayer(referenceLayers.filling, targetLayers.filling) &&
    equal(referenceLayers.separator, targetLayers.separator);
  const sameLayers = match(referenceLayers, targetLayers, ['roles', 'armorType', 'screenVisualVersion', 'drain']) &&
    equal([...(reference.specialElements || [])].sort(), [...(target.specialElements || [])].sort());
  if (referenceLayers.roles.some(role => !targetLayers.roles.includes(role))) return null;
  const sameComposition = reference.visualizationType === target.visualizationType;
  const role = sameConstruction && sameLayout && sameSheaths && sameLayers && sameComposition
    ? 'GEOMETRY_MATCH'
    : sameConstruction && sameComposition &&
        referenceLayers.innerSheath.status !== 'present' &&
        referenceLayers.drain === targetLayers.drain &&
        reference.cores > 1 && target.cores > 1 &&
        !reference.coreLayout && !target.coreLayout &&
        equal(reference.pairedGroupSize, target.pairedGroupSize)
      ? 'LAYOUT_REFERENCE'
      : sameSheaths && sameLayers && reference.hasOuterJacket && sameConstruction
        ? 'SHEATH_REFERENCE'
        : 'STYLE_ONLY';
  return {
    role,
    allowedUse: referenceUses[role],
    usefulStyle: sameLayers && sameComposition &&
      Boolean(target.outerJacket) && reference.outerJacket === target.outerJacket &&
      equal(reference.coreColors, target.coreColors),
    rank: [
      Number(sameConstruction), Number(sameLayout), Number(sameSheaths), Number(sameLayers),
      Number(sameComposition), -Math.abs(reference.cores - target.cores),
      Number(reference.family === target.family),
      Number(equal(reference.coreColors, target.coreColors)),
    ],
  };
}

export async function loadApprovedStyleReferences(root) {
  const archive = path.join(root, 'data/cable-approved-results');
  const registry = JSON.parse(await fs.readFile(path.join(archive, 'registry.json')));
  const archivePath = await fs.realpath(archive);
  const denied = new Set((await loadCableReviewDecisions(root))
    .filter(({ decision }) => blocksFromLegacyReview(registry, decision))
    .map(({ decision }) => decision.sha256));
  const library = [];
  for (const entry of [...Object.values(registry.byVisualKey), ...Object.values(registry.alternativesBySha256 ?? {})]) {
    if (denied.has(entry.sha256) || cableIllustrationHold(entry.sha256) || vvgCutHold(entry.sha256) || entry.status !== 'APPROVED') continue;
    const pending = cableRegistryReview(registry, entry.sha256);
    if (!pending?.reference && entry.APPROVED_AS_REFERENCE !== true) continue;
    const dir = await fs.realpath(path.resolve(root, entry.draftDir));
    if (!dir.startsWith(archivePath + path.sep)) throw Error('Invalid approved path');
    const [image, approval, group] = await Promise.all([
      fs.readFile(path.join(dir, 'image.png')),
      fs.readFile(path.join(dir, 'approval.json')).then(JSON.parse),
      fs.readFile(path.join(dir, 'group.json')).then(JSON.parse),
    ]);
    const permission = cableReferencePermission(registry, entry, approval);
    if (!permission) continue;
    if (hash(image) !== entry.sha256 || approval.status !== 'APPROVED' ||
        approval.sha256 !== entry.sha256 || approval.visualKey !== entry.visualKey ||
        group.visualKey !== entry.visualKey ||
        hash(Buffer.from(JSON.stringify(group.profile))) !== entry.profileHash)
      throw Error('Approved reference integrity mismatch');
    library.push({ path: path.join(dir, 'image.png'), sha256: entry.sha256, visualKey: entry.visualKey, profile: group.profile, familyAnchor: group.familyAnchor === true, reviewedCoreLayout: group.manualReview?.observations?.coreLayout ?? compositionRules.reviewedGeometryBySha256?.[entry.sha256] ?? null, archiveOnly: entry.archiveOnly === true, approvalStatus: approval.status, permission,
      preferredRole:pending?.referenceScope?.preferredRole, preferenceAt:registry.reviewBySha256?.[entry.sha256]?.at(-1)?.at });
  }
  return library;
}

/** Select the two independent image roles for a new cable illustration. */
export async function selectCableGenerationReferences(root, target, { excludeSha256, layout, preferred } = {}) {
  const library = await loadApprovedStyleReferences(root);
  const scope = cableFamilyScope(target.family);
  const available = library.filter(entry => entry.sha256 !== excludeSha256 && !entry.profile.schematicAssumptions);
  const preference = (role, a, b) => {
    const first = a.preferredRole === role, second = b.preferredRole === role;
    return Number(second)-Number(first) || (first && second ?
      String(b.preferenceAt).localeCompare(String(a.preferenceAt)) : 0);
  };
  const local = available.filter(entry => scope && cableFamilyScope(entry.profile.family) === scope)
    .flatMap(entry => {
      const comparison = compareCableReferenceProfile(entry.profile, target);
      return comparison ? [{ ...entry, ...comparison }] : [];
    })
    .sort((a, b) => preference('FAMILY_PRIMARY',a,b) || Number(b.familyAnchor) - Number(a.familyAnchor) ||
      Number(b.permission === 'PRIMARY') - Number(a.permission === 'PRIMARY') ||
      Number(b.role === 'GEOMETRY_MATCH') - Number(a.role === 'GEOMETRY_MATCH') ||
      Math.abs(a.profile.cores - target.cores) -
      Math.abs(b.profile.cores - target.cores) || a.visualKey.localeCompare(b.visualKey));
  const shared = cableSharedVisualKey(target);
  const outside = available.filter(entry => cableFamilyScope(entry.profile.family) !== scope &&
    (compareCableReferenceProfile(entry.profile, target)?.role === 'GEOMETRY_MATCH' ||
      (shared && shared === cableSharedVisualKey(entry.profile))));
  const primary = preferred?.primary ? [...local,...outside].find(row => row.sha256 === preferred.primary) :
    local.find(row => row.sha256 !== preferred?.geometry);
  if (preferred?.primary && !primary) throw Error('Основной референс недоступен или конструктивно несовместим.');
  const geometryOptions = available.filter(entry =>
      match(entry.profile, target, ['cores', 'geometry', 'hasOuterJacket', 'pairedGroupSize', 'coreLayout', 'conductorShape']) &&
      (!(layout?.requiresReviewedLayout || entry.reviewedCoreLayout) || entry.reviewedCoreLayout === layout?.id))
    .sort((a, b) => preference('GEOMETRY_MATCH',a,b) || Number(cableFamilyScope(b.profile.family) === scope) -
      Number(cableFamilyScope(a.profile.family) === scope) ||
      Number(b.permission === 'ADDITIONAL') - Number(a.permission === 'ADDITIONAL') ||
      a.visualKey.localeCompare(b.visualKey));
  const geometryCandidates = geometryOptions.filter(row => row.sha256 !== primary?.sha256);
  const geometric = preferred?.geometry ? geometryOptions.find(row => row.sha256 === preferred.geometry) : geometryCandidates[0];
  if (preferred?.geometry && !geometric) throw Error('Геометрический референс недоступен или имеет другую компоновку.');
  const role = (entry, name, allowedUse, prohibitedTransfer) => ({
    ...entry, role: name, allowedUse, evidence: {
      technicalFamily: entry.profile.family, approvalStatus: entry.approvalStatus, prohibitedTransfer,
    },
  });
  const selected = [
    ...(primary ? [role(primary, 'FAMILY_PRIMARY',
      'family appearance, surface finish, jacket appearance, lighting and stripping proportions where consistent with the target contract',
      ['core count or arrangement', 'any layer, colour or material that differs from the target contract'])] : []),
    ...(geometric ? [role(geometric, 'GEOMETRY_MATCH', 'positions of the insulated cores only',
      ['colours', 'metal', 'stripping lengths', 'materials', 'screens', 'armor', 'fillers and other layers', 'style'])] : []),
  ];
  return { selected, librarySize: library.length, compatibleReferenceCount: selected.length,
    choices: { primary:local.map(row => row.sha256), geometry:geometryCandidates.map(row => row.sha256) },
    groupChoices: { primary:[...local,...outside].map(row => row.sha256), geometry:geometryOptions.map(row => row.sha256) },
    ranking: selected.map(({ visualKey, role }) => ({ visualKey, role })) };
}
