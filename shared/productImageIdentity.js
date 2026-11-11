const clean = (value) => String(value || '').trim();

const imageBindingName = (value) =>
  clean(value)
    .toUpperCase()
    .replace(/[XХ×]/gu, 'Х')
    .replace(/,/gu, '.')
    .replace(/\s+/gu, '');

export function matchesProductImageBinding(product, entry) {
  if (
    entry.productId != null &&
    product.id != null &&
    String(entry.productId) !== String(product.id)
  )
    return false;
  if (
    entry.primaryCores != null &&
    product.cores != null &&
    Number(entry.primaryCores) !== Number(product.cores)
  )
    return false;
  if (
    entry.section != null &&
    product.crossSection != null &&
    Number(entry.section) !== Number(product.crossSection)
  )
    return false;
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
    return false;
  return true;
}
