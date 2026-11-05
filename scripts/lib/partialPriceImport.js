import { buildStableKey } from './productRegistry.js';
import { createPendingProduct } from '../../shared/productAvailability.js';
const nameKey = (value) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
export const sourcePosition = (product) =>
  `${product.sourceRowIndex ?? product.rowIndex}:${product.sourceColumnIndex}`;

// Index before quarantine so removing a bad row cannot reassign a good duplicate's ID.
export function indexSourceIdentities(products, registry) {
  const occurrences = new Map();
  return new Map(
    products.map((product) => {
      const stableKey = buildStableKey(product),
        occurrence = occurrences.get(stableKey) || 0;
      occurrences.set(stableKey, occurrence + 1);
      const identityDiscriminator = occurrence
        ? `row-${product.sourceIdentityRowIndex ?? product.sourceRowIndex ?? 'unknown'}-occurrence-${occurrence}`
        : null;
      const key = identityDiscriminator
        ? `${stableKey}#source:${encodeURIComponent(identityDiscriminator)}`
        : stableKey;
      return [
        sourcePosition(product),
        {
          stableKey,
          occurrence,
          identityDiscriminator,
          knownId: registry.entries[key]?.id,
        },
      ];
    })
  );
}

export function resolveSourcePresence(
  previousProducts,
  observations,
  identities
) {
  const matched = new Map();
  const ambiguous = [];
  const unresolvedIdentity = [];
  for (const row of observations) {
    if (['skip', 'invalid'].includes(row.type) && !nameKey(row.sourceName))
      unresolvedIdentity.push(row);
    const identity = identities.get(sourcePosition(row));
    let candidates = identity?.knownId
      ? previousProducts.filter((p) => p.id === identity.knownId)
      : [];
    if (!candidates.length)
      candidates = previousProducts.filter(
        (p) => nameKey(p.sourceName || p.name) === nameKey(row.sourceName)
      );
    if (!candidates.length && row.normalizedName)
      candidates = previousProducts.filter(
        (p) => !p.sourceName && nameKey(p.name) === nameKey(row.normalizedName)
      );
    // A malformed single-cell tail must not turn an exact known name into a disappearance.
    if (!candidates.length && row.combined && row.type !== 'excluded') {
      candidates = previousProducts.filter((p) => {
        const name = nameKey(p.sourceName || p.name),
          raw = nameKey(row.sourceName);
        return name && raw.startsWith(name + ' ');
      });
      if (candidates.length)
        ambiguous.push({
          rowIndex: row.rowIndex,
          sourceCells: row.sourceCells,
          sourceName: row.sourceName,
          candidateIds: candidates.map((p) => p.id),
          reason:
            'Unparsed tail; possible source identity only, no commercial values reused',
        });
    }
    if (
      candidates.length > 1 &&
      !ambiguous.some(
        (item) =>
          item.rowIndex === row.rowIndex &&
          item.sourceCells?.name === row.sourceCells?.name
      )
    )
      ambiguous.push({
        rowIndex: row.rowIndex,
        sourceCells: row.sourceCells,
        sourceName: row.sourceName,
        candidateIds: candidates.map((p) => p.id),
        reason: 'Multiple known identities; all held without commercial values',
      });
    if (
      !candidates.length &&
      row.type === 'invalid' &&
      !unresolvedIdentity.includes(row)
    )
      unresolvedIdentity.push(row);
    for (const product of candidates) {
      if (!matched.has(product.id)) matched.set(product.id, []);
      matched.get(product.id).push(row);
    }
  }
  return { matched, ambiguous, unresolvedIdentity };
}

export function finishPartialImport(
  previousProducts,
  activeProducts,
  presence
) {
  const activeIds = new Set(activeProducts.map((p) => p.id));
  const pendingProducts = [],
    absentProducts = [],
    excludedProducts = [];
  for (const previous of previousProducts) {
    if (activeIds.has(previous.id)) continue;
    const rows = presence.matched.get(previous.id) || [];
    if (!rows.length && !presence.unresolvedIdentity?.length)
      absentProducts.push(previous);
    else if (!rows.length) pendingProducts.push(createPendingProduct(previous));
    else if (rows.every((row) => row.type === 'excluded'))
      excludedProducts.push(previous);
    else pendingProducts.push(createPendingProduct(previous));
  }
  return {
    products: [...activeProducts, ...pendingProducts],
    pendingProducts,
    absentProducts,
    excludedProducts,
    report: {
      active: activeProducts.length,
      pending: pendingProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        slug: p.slug,
        name: p.name || p.fullName,
        evidence: presence.ambiguous.some((row) =>
          row.candidateIds.includes(p.id)
        )
          ? 'source_identity_ambiguous'
          : presence.matched.has(p.id)
            ? 'observed_source_row'
            : 'source_identity_unresolved',
        sourceRows: (
          presence.matched.get(p.id) ||
          presence.unresolvedIdentity ||
          []
        ).map((row) => ({
          rowIndex: row.rowIndex,
          sourceCells: row.sourceCells,
          sourceSheet: row.sourceSheet,
          type: row.type,
        })),
      })),
      absent: absentProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        slug: p.slug,
        name: p.name || p.fullName,
      })),
      excluded: excludedProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        slug: p.slug,
      })),
      ambiguous: presence.ambiguous,
      unresolvedIdentity: (presence.unresolvedIdentity || []).map((row) => ({
        rowIndex: row.rowIndex,
        sourceCells: row.sourceCells,
        sourceName: row.sourceName,
      })),
    },
  };
}
