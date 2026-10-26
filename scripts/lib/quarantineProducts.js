// В прайсе в одной строке листа могут находиться два разных товара.
export function quarantineInvalidProducts(products, errors, reviewRows) {
  const quarantined = [];
  const eligible = products.filter((product) => {
    const issues = errors.filter(
      (error) =>
        error.rowIndex === product.sourceRowIndex &&
        error.product === String(product.name || product.sourceName || '')
    );
    if (!issues.length) return true;
    quarantined.push(product);
    reviewRows.push({
      rowIndex: product.sourceRowIndex,
      product: product.name,
      category: product.sourceCategory,
      reason: issues.map((error) => error.message).join('; '),
    });
    return false;
  });
  return { eligible, quarantined };
}
