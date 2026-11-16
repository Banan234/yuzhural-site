import { createHash } from 'node:crypto';

// Manual decisions are stored alongside approvals in the existing registry.
export const catalogDecisions = ['APPROVED', 'WITH_NOTES', 'NEEDS_CORRECTION', 'REJECTED', 'UNDECIDED'];
export const referenceDecisions = ['PRIMARY', 'ADDITIONAL', 'DENIED', 'UNDECIDED'];
export const cableReviewHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function blocksCableReuse(status) {
  return status === 'REJECTED' || status === 'NEEDS_CORRECTION';
}

export function cableRegistryReview(registry, sha256) {
  const event = registry.reviewBySha256?.[sha256]?.at(-1);
  if (!event) return null;
  const { hash, ...data } = event;
  if (data.sha256 !== sha256 || hash !== cableReviewHash(data))
    throw Error('Manual cable review integrity mismatch: ' + sha256);
  return event.after;
}

export function blocksCableCatalogAssignment(registry, entry) {
  const status = cableRegistryReview(registry, entry.sha256)?.catalog;
  return blocksCableReuse(status) || status === 'UNDECIDED' ||
    (entry.manualGallery === true && !['APPROVED', 'WITH_NOTES'].includes(status));
}

export function blocksFromLegacyReview(registry, decision) {
  const denied = decision.status === 'REJECTED' || decision.disposition === 'NEEDS_CORRECTION';
  return denied && cableRegistryReview(registry, decision.sha256)?.supersedes !== cableReviewHash(decision);
}

export function cableReferencePermission(registry, entry, approval) {
  if (approval.acceptedCatalogChecks?.some(check => approval.checks?.[check] !== true)) return null;
  const review = cableRegistryReview(registry, entry.sha256);
  if (blocksCableReuse(review?.catalog) || review?.catalog === 'UNDECIDED') return null;
  if (review && review.reference !== null) {
    if (!['PRIMARY', 'ADDITIONAL'].includes(review.reference) ||
        review.referenceScope?.APPROVED_AS_REFERENCE !== true ||
        review.referenceScope.visualKey !== entry.visualKey ||
        review.referenceScope.profileHash !== entry.profileHash) return null;
    const events = registry.reviewBySha256[entry.sha256];
    // Catalog approval used to imply ADDITIONAL. Require evidence of a
    // reference decision even if that old approval populated both flags.
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      const { hash, ...data } = event;
      if (data.sha256 !== entry.sha256 || hash !== cableReviewHash(data)) return null;
      if (event.undoOf) { index--; continue; }
      if (event.referenceExplicit === true) return review.reference;
      if (event.before.reference === event.after.reference &&
          cableReviewHash(event.before.referenceScope) === cableReviewHash(event.after.referenceScope)) continue;
      const implicit = event.before.reference === null && event.after.reference === 'ADDITIONAL' &&
        event.after.catalog === 'APPROVED' && event.before.catalog !== 'APPROVED' &&
        !event.after.referenceScope?.preferredRole;
      // These older decisions recorded the user's separate consent in the
      // same note in both the hashed journal and the archived approval.
      const explicitLegacyConsent = event.note === approval.note &&
        event.note === 'Пользователь утвердил PNG для каталога и разрешил использование как дополнительного референса.';
      return !implicit || explicitLegacyConsent ? review.reference : null;
    }
    return null;
  }
  return entry.APPROVED_AS_REFERENCE === true && approval.APPROVED_AS_REFERENCE === true ? 'ADDITIONAL' : null;
}
