import rule from '../../data/cableStrippingCompositionRules.json' with { type: 'json' };
export const usesScreenedVvgStripping = profile =>
  /^vvg(?:ng|e|[-]|$)/u.test(profile.family) && profile.shield === true &&
  profile.hasOuterJacket === true && profile.cores > 1;

export function deriveStrippingCompositionPreference(profile){
 if(usesScreenedVvgStripping(profile) || profile.hasOuterJacket!==true || !Number.isInteger(profile.cores) || profile.cores<2 || profile.constructionAllowsExtendedStripping===false)return null;
 return {...rule,status:'CONDITIONAL_PREFERENCE_NOT_PIXEL_VERIFIED',pixelVerification:'MANUAL_REQUIRED'};
}
export function strippingCompositionPrompt(r, referencePosition = 1){
 if(!r)return '';
 return `FUTURE COMMON-SHEATH COMPOSITION PREFERENCE ${r.version}: where technically and visually appropriate, expose approximately 20-30% more INDIVIDUALLY INSULATED core length between the common jacket cut and metal ends than in the CURRENT selected APPROVED reference (INPUT ${referencePosition}). This is a conditional preference, not a mechanical transformation for every construction. Remove more common sheath, not more individual insulation. Keep bare metal length unchanged; no proportional metal extension. Keep global scale, pose, tilt, direction and tidy composition. No crowded cores, intersections, extra bends or stretched geometry. Preserve every documented layer and its readable step length. If this cannot be achieved naturally, retain safe construction and flag manual review rather than forcing extension. This is ONE 1.2-1.3 adjustment, replacing the older 1.2-1.25 multicore composition target for this request, NEVER multiplying the two. Do not modify or regenerate existing APPROVED. Rule: ${JSON.stringify(r)}.`;
}
