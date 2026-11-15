// Переключаем только реально существующие исполнения с одинаковой остальной маркировкой.
function dimensions(product) {
  if (['optical', 'awg', 'mixed-section', 'pairs'].includes(product.displayDimensions?.kind))
    return null;
  const title = String(product.title || product.fullName || product.name || '');
  const usesDiameter = product.conductorDiameter != null;
  const match = title.match(
    usesDiameter &&
      (product.displayDimensions?.pairs || !product.displayDimensions)
      ? /(\d+)\s*[xх×]\s*2\s*[xх×]\s*(\d+(?:[.,]\d+)?)/i
      : /(\d+)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/i
  );
  if (!match) return null;
  const cores = Number(match[1]);
  const section = Number(match[2].replace(',', '.'));
  if (
    cores !== Number(product.cores) ||
    section !== Number(product.conductorDiameter ?? product.crossSection)
  )
    return null;
  return {
    cores,
    section,
    signature: title
      .replace(match[0], '{size}')
      .replace(/\s+/g, '')
      .toLowerCase(),
  };
}

export function getProductVariantOptions(product, products) {
  const current = dimensions(product);
  if (!current || !product.mark) return { sections: [], cores: [] };
  const matching = [product, ...products].filter((item) => {
    const candidate = dimensions(item);
    return (
      item.slug &&
      item.mark === product.mark &&
      (item.conductorDiameter != null) ===
        (product.conductorDiameter != null) &&
      candidate?.signature === current.signature
    );
  });
  function options(field, other) {
    const unique = new Map();
    for (const item of matching) {
      const candidate = dimensions(item);
      if (candidate[other] !== current[other]) continue;
      const value = candidate[field];
      if (!unique.has(value) || item.slug === product.slug)
        unique.set(value, item);
    }
    return [...unique]
      .sort(([a], [b]) => a - b)
      .map(([value, item]) => ({ value, slug: item.slug, title: item.title }));
  }
  return {
    sections: options('section', 'cores'),
    cores: options('cores', 'section'),
  };
}
