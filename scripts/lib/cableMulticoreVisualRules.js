import fs from 'node:fs';
const rule = JSON.parse(
  fs.readFileSync(
    new URL('../../data/cableMulticoreVisualRules.json', import.meta.url)
  )
);
export function deriveMulticoreStrippingRule(profile) {
  if (!rule.appliesTo.includes(profile.visualizationType)) return null;
  if (profile.constructionAllowsExtendedStripping === false)
    throw Error(
      'NEEDS_REVIEW: multicore stripping extension conflicts with confirmed construction'
    );
  return {
    ...rule,
    status: 'REQUIREMENTS_DEFINED_NOT_PIXEL_VERIFIED',
    pixelVerification: 'MANUAL_REQUIRED',
  };
}
export function multicoreStrippingPrompt(r) {
  if (!r) return '';
  return `PERMANENT MULTICORE STRIPPING AMENDMENT ${r.version}: this is the ONLY authorized exception to the original reference insulated-core stripping length. Increase ONLY the visible insulated-core length between the jacket cut and the bare metal by approximately ${Math.round((r.insulatedCoreExposedLengthRatio.min - 1) * 100)}-${Math.round((r.insulatedCoreExposedLengthRatio.max - 1) * 100)}% (ratio ${r.insulatedCoreExposedLengthRatio.min}-${r.insulatedCoreExposedLengthRatio.max}) compared with the current baseline. Remove a little more common outer jacket to expose more natural insulated-core length. Keep bare metallic conductor extensions EXACTLY the same length; do NOT lengthen bare copper. Keep core count, core diameters, colors, jacket wall thickness, global cable scale, camera, tilt, right-to-left direction, position and overall composition unchanged. Compact three-dimensional bundle, no long flat fan or unnatural stretching. ${r.constructionSafety} Do not change SIMPLE or LAYERED without MULTICORE. Previous APPROVED results are grandfathered without modification. Rule metadata: ${JSON.stringify(r)}.`;
}
