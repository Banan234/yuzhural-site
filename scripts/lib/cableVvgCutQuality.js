import { cableIllustrationHold } from './cableIllustrationDefects.js';
import policy from '../../data/cableVvgCutQuality.json' with { type: 'json' };
import { getVvgIllustrationSignature } from './cableVvgIllustration.js';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';

export const vvgCutHold = sha256 => Boolean(cableIllustrationHold(sha256));

export const VVG_CUT_REVIEW_LABELS = {
  flushFilling: 'Заполнение видно только между жилами у плоскости среза; выступающего рукава нет',
  compactPack: 'Компактная укладка без чрезмерных пустот по периметру, с целыми и раздельными жилами',
};

export function vvgCutQuality(profile, contract) {
  if (!profile || !/^vvg(?:ng|-|$)/u.test(profile.family) ||
      profile.geometry !== 'round' || profile.cores < 2 || profile.hasOuterJacket !== true ||
      profile.shield || profile.armor || profile.specialElements?.length) return null;
  const { interstitialFilling, innerSheath } = contract ?? buildCableTechnicalProfile(profile);
  if (innerSheath.status === 'present') return null;
  return {
    version: policy.revision,
    mode: interstitialFilling.status === 'present' ? 'flush-filling' : 'compact-pack',
    checks: interstitialFilling.status === 'present' ? ['flushFilling', 'compactPack'] : ['compactPack'],
  };
}

export function vvgCutPrompt(quality) {
  if (!quality) return '';
  const filling = quality.mode === 'flush-filling'
    ? 'The PVC fill must end flush in the same oblique cut plane as the common jacket lip. It is visible only in the pockets BETWEEN insulated cores inside the lip. No fill may extend left of that plane along the cable axis, form a continuous exposed rim, or become a protruding sleeve. Keep the fill; no separate inner sheath. Preserve the number, spatial arrangement and axes of the insulated cores, their wall thickness and stripping length, and the geometry of the outer jacket.'
    : 'Close excess perimeter space by compactly packing the separate insulated cores inside the jacket opening. Keep realistic jacket wall thickness and distinct core boundaries. Do not add filler or a separate sleeve, intersect, merge or deform cores.';
  return ` ${quality.version}: ${filling} Preserve all exposed copper ends, the natural cable shape and the protected scale.`;
}

export function validateVvgCutRevision({ quality, profile, sourceProfile, sourceSha256 }) {
  if (!quality || !vvgCutHold(sourceSha256) || cableIllustrationHold(sourceSha256)?.revisionMode !== quality.mode ||
      !getVvgIllustrationSignature(profile) ||
      getVvgIllustrationSignature(profile) !== getVvgIllustrationSignature(sourceProfile))
    throw Error('VVG correction requires a registered source SHA and equivalent construction');
  return { version: quality.version, mode: quality.mode, sourceSha256 };
}
