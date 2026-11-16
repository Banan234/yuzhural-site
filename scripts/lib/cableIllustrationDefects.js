import registry from '../../data/cableIllustrationDefects.json' with { type: 'json' };

export const cableIllustrationDefects = registry.defects;
const holds = new Map(registry.defects.flatMap(defect =>
  (defect.hold ?? []).map(source => [source.sha256, { ...source, defectId: defect.id }])));

export const cableIllustrationHold = sha256 => holds.get(sha256);

const catalogAcceptances = new Map(registry.defects.flatMap(defect =>
  (defect.catalogAcceptances ?? []).map(source => [source.sha256, source.checks])));

export function cableReviewCheckAccepted(approval, check) {
  return approval.checks?.[check] === true ||
    (approval.APPROVED_FOR_CATALOG === true && approval.APPROVED_AS_REFERENCE !== true &&
      Array.isArray(approval.acceptedCatalogChecks) && approval.acceptedCatalogChecks.includes(check) &&
      catalogAcceptances.get(approval.sha256)?.includes(check));
}
