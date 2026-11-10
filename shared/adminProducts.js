export function applyAdminProducts(products, state) {
  const overrides = state?.products || {};
  return [...products, ...Object.values(state?.customProducts || {})]
    .map((product) => ({
      ...product,
      ...(overrides[String(product.id)] || {}),
    }))
    .filter((product) => !product.hidden);
}
