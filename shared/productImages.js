// Файл определяет правила выбора изображений товаров и fallback-ассетов для карточек каталога.
import generatedProductImages from './generatedProductImages.json' with { type: 'json' };
import rejectedProductImages from './rejectedProductImages.json' with { type: 'json' };

import {
  PRODUCT_IMAGE_FALLBACKS,
  isGenericProductImage,
  getProductImageFallback,
} from './productImageFallbacks.js';
export { PRODUCT_IMAGE_FALLBACKS } from './productImageFallbacks.js';
const clean = (value) => String(value || '').trim();

const imageBindingName = (value) =>
  clean(value)
    .toUpperCase()
    .replace(/[XХ×]/gu, 'Х')
    .replace(/,/gu, '.')
    .replace(/\s+/gu, '');

export function getGeneratedProductImage(
  product,
  manifest = generatedProductImages
) {
  const entry = manifest.bySku?.[clean(product?.sku)];
  if (rejectedProductImages.byVisualKey?.[entry?.visualKey]) return '';
  if (entry?.status !== 'approved' || entry.kind !== 'generated-illustration')
    return '';
  if (
    entry.productId != null &&
    product.id != null &&
    String(entry.productId) !== String(product.id)
  )
    return '';
  if (
    entry.primaryCores != null &&
    product.cores != null &&
    Number(entry.primaryCores) !== Number(product.cores)
  )
    return '';
  if (
    entry.section != null &&
    product.crossSection != null &&
    Number(entry.section) !== Number(product.crossSection)
  )
    return '';
  const names = [
    product.sourceName,
    product.name,
    product.fullName,
    product.title,
  ]
    .filter(Boolean)
    .map(imageBindingName);
  if (
    ![entry.sourceName, entry.productName]
      .filter(Boolean)
      .some((name) => names.includes(imageBindingName(name)))
  )
    return '';
  return typeof entry.image === 'string' &&
    /^\/[A-Za-z0-9/_-]+\.png$/u.test(entry.image)
    ? entry.image
    : '';
}

export function getProductImage(product, manifest = generatedProductImages) {
  const image = clean(product?.image);
  if (!isGenericProductImage(image)) return image;

  return (
    getGeneratedProductImage(product, manifest) ||
    getProductImageFallback(product)
  );
}

export function getProductImageAlt(product) {
  const title = clean(
    product?.title || product?.fullName || product?.name || product?.mark
  );
  const category =
    clean(
      product?.catalogCategory || product?.category || product?.catalogSection
    ) || 'категория товара';

  if (title) {
    const image = getGeneratedProductImage(product);
    const illustrated = image && getProductImage(product) === image;
    return illustrated
      ? `${title} — иллюстрация конструкции кабеля`
      : `${title} — ${category}`;
  }
  return `Изображение товара: ${category}`;
}
