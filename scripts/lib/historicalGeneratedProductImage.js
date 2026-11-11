import rejectedProductImages from '../../shared/rejectedProductImages.json' with { type: 'json' };
import { matchesProductImageBinding } from '../../shared/productImageIdentity.js';

const clean = (value) => String(value || '').trim();

export function getHistoricalGeneratedProductImage(product, manifest) {
  const entry = manifest.bySku?.[clean(product?.sku)];
  // Legacy rejection concerns the old PNG, not a separately reviewed new-standard image.
  const reviewedNewStandard =
    ['approved-cable-style-1.0.0', 'approved-cable-style-1.1.0'].includes(
      entry?.styleVersion
    ) &&
    entry?.manualReview?.status === 'APPROVED' &&
    entry?.manualReview?.sha256 === entry?.sha256 &&
    (entry?.styleVersion !== 'approved-cable-style-1.1.0' ||
      [
        'metalEndCount',
        'equalDiameters',
        'relativeDiameters',
        'coaxialStripping',
        'geometryConsistency',
        'noExtraCylinders',
      ].every((k) => entry.manualReview.checks?.[k] === true)) &&
    /^[a-f0-9]{64}$/u.test(entry?.sha256 || '');
  if (
    rejectedProductImages.byVisualKey?.[entry?.visualKey] &&
    !reviewedNewStandard
  )
    return '';
  if (
    entry?.status !== 'approved' ||
    entry.kind !== 'generated-illustration' ||
    entry.APPROVED_FOR_CATALOG === false
  )
    return '';
  return matchesProductImageBinding(product, entry) &&
    typeof entry.image === 'string' &&
    /^\/[A-Za-z0-9/_-]+\.png$/u.test(entry.image)
    ? entry.image
    : '';
}
