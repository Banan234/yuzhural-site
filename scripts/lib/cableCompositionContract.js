import { hasFourEqualRoundCores } from './cableMulticoreComposition.js';
import { usesScreenedVvgStripping } from './cableStrippingComposition.js';
import { cableIllustrationRules, cableIllustrationRulesHash } from './cableIllustrationRules.js';

export function buildCableCompositionContract(profile, { editTarget, multicoreComposition, strippingComposition, multicoreStripping } = {}) {
  const screened = usesScreenedVvgStripping(profile);
  return {
    version: cableIllustrationRules.version,
    rulesSha256: cableIllustrationRulesHash,
    framing: 'horizontal with protected slight tilt, all tips intact, roughly 80–90% width where practical, intact cable continuing right',
    layout: hasFourEqualRoundCores(profile) ? 'compact in depth; four equal circular cores in two staggered pairs'
      : 'preserve target cross-section and core arrangement; keep the visible ends compact',
    cutPlane: 'match documented interfaces; interstitial fill must stay within the jacket cut plane',
    insulationExposure: screened ? 'SCREENED_COMPACT' :
      editTarget ? 'EXPLICIT_EDIT_ONLY' : strippingComposition || multicoreStripping || 'PROTECTED_BASELINE',
    multicoreComposition,
    prohibitedChanges: ['core count', 'core geometry', 'materials', 'layer inventory', 'layer order'],
  };
}
