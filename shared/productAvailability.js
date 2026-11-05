// Pending source data is a distinct state, never a zero-price/zero-stock offer.
export function isProductPending(product) {
  return product?.dataStatus === 'pending';
}
export function createPendingProduct(previous) {
  const keys = [
    'id',
    'sku',
    'slug',
    'name',
    'fullName',
    'title',
    'sourceName',
    'mark',
    'markFamily',
    'manufacturer',
    'attributes',
    'cores',
    'crossSection',
    'groundCores',
    'groundSection',
    'neutralCores',
    'neutralSection',
    'groupCores',
    'voltage',
    'conductorConfiguration',
    'catalogSection',
    'catalogSectionSlug',
    'catalogCategory',
    'catalogCategorySlug',
    'catalogSubcategory',
    'catalogSubcategorySlug',
    'category',
    'image',
  ];
  return {
    ...Object.fromEntries(
      keys
        .filter((key) => previous[key] !== undefined)
        .map((key) => [key, previous[key]])
    ),
    dataStatus: 'pending',
    price: null,
    stock: null,
    unit: null,
    inStock: false,
    description: 'Данные уточняются',
  };
}
