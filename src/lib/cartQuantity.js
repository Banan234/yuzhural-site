import { usesWholeQuantity } from '../../shared/orderQuantity.js';

export function getCartQuantityLimit(product) {
  if (product?.manual || product?.stock == null || product.stock === '')
    return Infinity;
  const stock = Number(product.stock);
  if (!Number.isFinite(stock)) return Infinity;
  return Math.max(0, stock);
}

export function clampCartQuantity(product, quantity) {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(
    getCartQuantityLimit(product),
    usesWholeQuantity(product?.unit) ? Math.ceil(value) : value
  );
}
