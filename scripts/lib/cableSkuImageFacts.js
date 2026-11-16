import {
  getCatalogPhoto,
  getGeneratedProductImage,
} from '../../shared/productImages.js';

export function indexCableSkuCards(cards) {
  return new Map(
    cards.flatMap((card) =>
      (card.offers?.length ? card.offers : [card]).map((offer) => [
        offer.sku,
        card,
      ])
    )
  );
}

const normalized = (s) =>
  String(s || '')
    .replace(/\s+/gu, ' ')
    .trim();
/** A known generated binding is replaceable; unknown/manual provenance is protected. */
export function imageDisposition(product, visible, binding, overrides = {}) {
  const names = [
    product.name,
    product.sourceName,
    product.fullName,
    visible?.title,
    visible?.name,
  ].map(normalized);
  const explicit =
    Object.entries(overrides.overrides || {}).some(
      ([name, value]) =>
        getCatalogPhoto(value?.image) && names.includes(normalized(name))
    ) ||
    (overrides.matchers || []).some(
      (m) =>
        getCatalogPhoto(m.image) &&
        normalized(m.mark).replaceAll(' ', '').toUpperCase() ===
          normalized(product.mark).replaceAll(' ', '').toUpperCase()
    );
  if (explicit || getCatalogPhoto(product.image))
    return { protected: true, reason: 'manual/raw image override' };
  if (binding && binding.kind !== 'generated-illustration')
    return {
      protected: true,
      reason: 'binding provenance is not generated illustration',
    };
  const image = visible?.image || product.image || '';
  if (
    getCatalogPhoto(image) &&
    !(binding?.kind === 'generated-illustration' && binding.image === image)
  )
    return {
      protected: true,
      reason: 'visible image has manual/unknown provenance',
    };
  return {
    protected: false,
    image: image || null,
    oldGenerated: binding?.kind === 'generated-illustration' ? binding : null,
  };
}

export function readCableSkuImageFacts(
  product,
  card,
  bindings,
  registry,
  overrides
) {
  const binding = bindings.bySku?.[product.sku] ?? null;
  return {
    binding,
    hasPhoto: Boolean(
      getCatalogPhoto(product.image) || getCatalogPhoto(card?.image)
    ),
    get generatedImage() {
      return getGeneratedProductImage(product, bindings, registry);
    },
    get protected() {
      return imageDisposition(product, card, binding, overrides).protected;
    },
  };
}
