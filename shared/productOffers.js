import { formatCableProductTitle } from './productTitle.js';
import { isProductPending } from './productAvailability.js';

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Price, balance and source identity describe an offer, not a different cable.
// Keep unknown and known technical values distinct; do not infer equivalence.
const identityFields = [
  'unit',
  'manufacturer',
  'catalogBrand',
  'cores',
  'groupCores',
  'crossSection',
  'conductorConfiguration',
  'screenCrossSection',
  'concentricConductorCrossSection',
  'doubleInsulationThickness',
  'opticalFiberCoreDiameter',
  'opticalFiberCladdingDiameter',
  'conductorStrandCount',
  'groundCores',
  'groundSection',
  'voltage',
  'catalogSectionSlug',
  'catalogCategorySlug',
  'catalogSubcategorySlug',
];

export function getProductOfferKey(product) {
  const title = formatCableProductTitle(
    product.title || product.fullName || product.name || '',
    product
  );
  if (!title || isProductPending(product)) return null;
  return JSON.stringify([
    normalize(title),
    ...identityFields.map((field) => normalize(product[field])),
    Boolean(product.hasGroundCore),
  ]);
}

function compareIdentity(a, b) {
  return (
    Number(a.id) - Number(b.id) || String(a.slug).localeCompare(String(b.slug))
  );
}

function toOffer(product) {
  return Object.fromEntries(
    [
      'id',
      'slug',
      'sku',
      'title',
      'sourceName',
      'price',
      'stock',
      'unit',
      'inStock',
      'leadTime',
    ]
      .filter((key) => product[key] !== undefined)
      .map((key) => [key, product[key]])
  );
}

export function groupProductOffers(products) {
  const groups = new Map();
  for (const product of products) {
    const key = getProductOfferKey(product) ?? Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    // Stable representative regardless of price and workbook row order.
    const sorted = [...group].sort(compareIdentity);
    const representative = sorted[0];
    const offers = sorted.flatMap((p) => p.offers || [toOffer(p)]);
    offers.sort(
      (a, b) =>
        (Number(a.price) > 0 ? Number(a.price) : Infinity) -
          (Number(b.price) > 0 ? Number(b.price) : Infinity) ||
        compareIdentity(a, b)
    );
    const prices = offers.map((p) => Number(p.price)).filter((p) => p > 0);
    const stock = offers.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const unit = representative.unit || '';
    const balance =
      `${stock.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} ${unit}`.trim();
    return {
      ...representative,
      price: prices.length ? Math.min(...prices) : 0,
      stock,
      inStock: stock > 0,
      ...(sorted.some((p) => p.promoted) ? { promoted: true } : {}),
      offers,
      priceVaries: new Set(offers.map((p) => Number(p.price) || 0)).size > 1,
      ...(representative.specs
        ? {
            specs: {
              ...representative.specs,
              ...(representative.specs['Остаток'] != null
                ? { Остаток: balance }
                : {}),
            },
          }
        : {}),
      ...(representative.description
        ? {
            description: representative.description.replace(
              /Текущий остаток: [^.]*\./,
              `Текущий остаток: ${balance}.`
            ),
          }
        : {}),
    };
  });
}

// Always use a source offer's id, price and balance for cart/quote operations.
export function getProductPurchaseItem(product, offerId) {
  if (!product?.offers?.length) return product;
  const offer =
    product.offers.find((item) => item.id === offerId) || product.offers[0];
  const { offers, priceVaries, selectedOfferId, ...base } = product;
  return { ...base, ...offer };
}

export function expandProductOffers(products) {
  return products.flatMap((product) =>
    product.offers?.length
      ? product.offers.map((offer) => getProductPurchaseItem(product, offer.id))
      : [product]
  );
}
