export function getCartQuantityLimit(product) {
  if (product?.manual || product?.stock == null || product.stock === '')
    return Infinity;
  const stock = Number(product.stock);
  return Number.isFinite(stock) ? Math.max(0, stock) : Infinity;
}

export function clampCartQuantity(product, quantity) {
  return Math.min(
    getCartQuantityLimit(product),
    Math.max(0, Number(quantity) || 0)
  );
}
