import { cableFamilyScope } from './cableVisualClassification.js';
import { createHash } from 'node:crypto';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { deriveLayerContactRule } from './cableLayerContact.js';

export const CABLE_VISUAL_GROUP_REUSE = 'cable-visible-construction-1';
export const CABLE_SCHEMATIC_REUSE = 'cable-schematic-1';
const polymerRoles = new Set(['outer-jacket', 'individual-insulation', 'inner-sheath', 'interstitial-filling']);

export function cableSchematicSignature(profile, options) {
  return cableSchematicConstruction(profile, options)?.signature ?? null;
}

function cableSchematicConstruction(profile, { planning = false, visualGroup = false } = {}) {
  if ((!planning && profile?.schematicAssumptions) || !profile?.visualizationType || !profile.conductorShape || profile.unresolvedModifiers?.length ||
      profile.unresolvedFamilySuffix || (profile.coreLayout && !profile.coreLayout.sectionGroups) || (!visualGroup && profile.sectionKey != null))
    return null;
  try {
    const contract = buildCableTechnicalProfile(profile);
    if (contract.outerSheathGeometry === 'UNKNOWN') return null;
    const signature = JSON.stringify([
      ...(visualGroup ? [] : [profile.visualizationType]), contract.outerSheathGeometry, profile.geometry, profile.cores,
      ...(profile.coaxial ? ['coaxial'] : []),
      profile.conductorMaterial, profile.conductorConstruction, profile.conductorShape,
      ...(profile.conductorFinish ? [profile.conductorFinish] : []),
      ...(profile.pairedGroupSize || profile.coreLayout ? [profile.pairedGroupSize ?? null, (visualGroup && !profile.coreLayout?.qualitative && profile.coreLayout?.sectionGroups &&
        profile.conductorShape === 'circular' && profile.coreLayout.sectionGroups.every(group =>
          (!group.conductorShape || group.conductorShape === 'circular') &&
          (!group.conductorConstruction || group.conductorConstruction === profile.conductorConstruction))
        ? profile.coreLayout.sectionGroups.map(({section,...group})=>({ ...group,
          ratio:Number((Number(section)/Math.max(...profile.coreLayout.sectionGroups.map(row=>Number(row.section)))).toPrecision(8)) }))
        : profile.coreLayout ?? null)] : []),
      profile.outerJacket ?? null, profile.coreColors, [...profile.specialElements].sort(),
      contract.armor.type, contract.screenVisualStandard?.version ?? null, contract.additionalConductors,
      contract.fireBarrierMaterial, contract.fireBarrierPlacement,
      contract.layers.map(({ role, scope, type, material, placement, appearance, connectedTo }) => [
        role, scope, polymerRoles.has(role) ? null : material ?? null,
        role === 'screen' || role === 'individual-screen' ? null : type ?? null,
        (planning || visualGroup) && role === 'screen' && scope === 'overall' &&
          ['under-outer-jacket', contract.screenVisualStandard?.placement].includes(placement)
          ? 'under-outer-jacket' : placement ?? null, role === 'separator' ? appearance : null, ...(connectedTo ? [connectedTo] : []),
      ]),
      deriveLayerContactRule(profile, contract).mode,
    ]);
    return { signature, contract };
  } catch {
    return null;
  }
}


/** Exact reuse keeps the persisted visual identity and complete profile. */
export function isExactCableImageReuseCompatible(classification, approval) {
  return classification.visualClassification === 'AUTO_APPROVED' &&
    classification.visualKey === approval.visualKey &&
    createHash('sha256').update(JSON.stringify(classification.visualProfile)).digest('hex') ===
      approval.profileHash;
}

/** Reference eligibility allows different multi-core counts. It grants no SKU binding. */
export function isCableReferenceCompatible(reference, target) {
  return !reference.schematicAssumptions && (reference.cores === 1) === (target.cores === 1) &&
    ['geometry', 'hasOuterJacket', 'conductorMaterial', 'conductorConstruction',
      'shield', 'armor'].every(key => reference[key] === target[key]) &&
    Boolean(reference.specialElements?.includes('fire-barrier')) ===
      Boolean(target.specialElements?.includes('fire-barrier'));
}

export function cableReferenceLayoutId(profile) {
  return cableFamilyScope(profile.family) === 'kvvg' && profile.cores === 5 &&
    profile.shield === false && profile.armor === false && !profile.specialElements?.length &&
    profile.geometry === 'round' && profile.hasOuterJacket === true &&
    profile.conductorShape === 'circular' && !profile.coreLayout && !profile.pairedGroupSize
    ? 'five-perimeter' : 'target-layout';
}

export function cableVisibleConstructionKey(profile, { planning = false } = {}) {
  const family = cableFamilyScope(profile?.family);
  if (!family) return null;
  const signature = cableSchematicSignature(profile,{planning,visualGroup:true});
  return signature ? JSON.stringify([family,signature,cableReferenceLayoutId(profile)]) : null;
}

// Cross-brand sharing requires a confirmed visible profile. Keep the former key
// for family-local grouping and for bindings already published under version 1.
export const CABLE_SHARED_VISUAL_REUSE = 'cable-shared-visible-construction-1';

export function cableSharedVisualKey(profile) {
  const construction = cableSchematicConstruction(profile, { visualGroup: true });
  if (!construction || !['round','flat'].includes(profile.geometry) ||
      !['copper','aluminium'].includes(profile.conductorMaterial) ||
      !['solid','stranded'].includes(profile.conductorConstruction) ||
      [profile.hasOuterJacket,profile.shield,profile.armor].some(value=>typeof value!=='boolean') ||
      profile.coreColors?.length!==profile.cores ||
      profile.coreColors.some(color=>!color || /neutral|unknown|неизвест/iu.test(color))) return null;
  const { signature, contract } = construction;
  if (profile.shield && !contract.screen.type) return null;
  return JSON.stringify([signature,cableReferenceLayoutId(profile), contract.screen.type,
    contract.innerSheath.status,contract.interstitialFilling.status,
    profile.technicalConstruction?.fireBarrierStatus ?? null]);
}

export function cableReusableConstructionKey(profile) {
  const shared = cableSharedVisualKey(profile);
  return shared ? JSON.stringify(['shared',shared]) : cableVisibleConstructionKey(profile);
}
