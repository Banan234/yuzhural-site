// Browser rendering consumes the selected image and exact accessible name from API/SSR.
import {
  isGenericProductImage,
  getProductImageFallback,
  getFallbackProductImageAlt,
} from './productImageFallbacks.js';
export function getProductImage(product) {
  const image = String(product?.image || '').trim();
  return isGenericProductImage(image)
    ? getProductImageFallback(product)
    : image;
}
export function getProductImageAlt(product) {
  return typeof product?.imageAlt === 'string'
    ? product.imageAlt
    : getFallbackProductImageAlt(product);
}
