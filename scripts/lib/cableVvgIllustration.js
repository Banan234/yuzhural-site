import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { deriveLayerContactRule } from './cableLayerContact.js';

import constructionRules from '../../data/cableTechnicalConstructionRules.json' with { type: 'json' };

export const VVG_TYPICAL_ILLUSTRATION = 'vvg-typical-1';

export function getVvgIllustrationSignature(profile) {
  if (profile?.schematicAssumptions || !/^vvg(?:-|ng|$)/u.test(profile?.family ?? '') ||
      profile.conductorMaterial !== 'copper' || profile.productType !== 'power-cable' ||
      profile.hasOuterJacket !== true || profile.conductorShape !== 'circular' ||
      !profile.visualizationType || profile.coreLayout || profile.pairedGroupSize ||
      profile.unresolvedModifiers?.length || profile.unresolvedFamilySuffix) return null;
  try {
    const technical = buildCableTechnicalProfile(profile);
    const contact = deriveLayerContactRule(profile, technical);
    return JSON.stringify([
      technical.outerSheathGeometry, profile.cores, profile.conductorConstruction,
      profile.conductorShape, profile.visualizationType, profile.coreColors,
      profile.specialElements, technical.additionalConductors, technical.layers,
      contact.mode,
    ]);
  } catch {
    return null;
  }
}

export function getVvgProductIllustrationProfile(product, classification) {
  const profile = classification.visualProfile;
  const section = Number(product.crossSection);
  const filler = classification.technicalProfile?.filler;
  if (classification.baseFamily !== 'ВВГ' ||
      !Number.isFinite(section) || section <= 0 ||
      (!profile.shield && (Number(product.voltage) >= 6 ||
        (!profile.armor && Number(product.voltage) >= 3))) ||
      (profile.conductorConstruction === 'solid' && section > 50)) return null;
  if (classification.visualClassification === 'AUTO_APPROVED')
    return filler && filler !== 'none' && !profile.technicalConstruction ? null : profile;

  // The explicit З execution has polymer between cores, with no extra sleeve.
  // Keep the exception scoped to the resolved VVG family and documented dimensions.
  const filled = constructionRules.families.vvgz;
  // A spaced З in the source heading can be emitted both as a modifier and as
  // an unresolved suffix. Require the exact catalogue designation for this case.
  const spacedFilling = profile.family === 'vvg' && profile.unresolvedFamilySuffix === 'З' &&
    product.markFamily === 'ВВГ' && /^ВВГз\s+\d+\s*[хx×]/iu.test(product.name ?? '') &&
    /^\s*ВВГ\s+з\s+\d+\s*[хx×]/iu.test(product.sourceName ?? '');
  const knownIssues = spacedFilling
    ? ['unverified_modifier', 'unverified_family_suffix', 'unknown_family']
    : ['unverified_modifier'];
  if (filled && ['vvg', 'vvgng', 'vvgng-a'].includes(profile.family) && section <= filled.maxSection &&
      profile.geometry === 'round' && profile.shield === false && profile.armor === false &&
      !profile.coreLayout && !profile.specialElements.length && profile.cores >= 2 && profile.cores <= 5 &&
      profile.unresolvedModifiers?.length === 1 && profile.unresolvedModifiers[0] === 'З' &&
      (!profile.unresolvedFamilySuffix || spacedFilling) &&
      classification.issues.every(issue => knownIssues.includes(issue.code))) {
    return {
      ...profile, unresolvedModifiers: [], unresolvedFamilySuffix: null, visualizationType: 'SIMPLE',
      technicalConstruction: filled,
    };
  }

  // An explicit screen in the parsed designation takes precedence over the
  // unshielded base-family default. Its material is deliberately unspecified.
  if (classification.technicalProfile?.shield === true &&
      profile.shield === true && profile.armor === false &&
      profile.geometry === 'round' && profile.cores >= 2 && profile.cores <= 5 &&
      !profile.specialElements.length &&
      classification.issues.every(issue =>
        issue.code === 'shield_detail_unknown' ||
        (issue.code === 'family_structure_conflict' && issue.message.endsWith(': shield')))) {
    return { ...profile, visualizationType: 'LAYERED' };
  }
  return null;
}

export function getVvgProductIllustrationSignature(product, classification) {
  return getVvgIllustrationSignature(getVvgProductIllustrationProfile(product, classification));
}
