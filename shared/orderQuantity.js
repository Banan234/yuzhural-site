// Existing order units only; this does not extend the catalog unit contract.
export function usesWholeQuantity(unit = 'м') {
  return ['м', 'кг', 'шт'].includes(
    String(unit || 'м')
      .trim()
      .toLowerCase()
  );
}

export function isValidOrderQuantity(item) {
  const value = Number(item?.quantity);
  return (
    ['number', 'string'].includes(typeof item?.quantity) &&
    Number.isFinite(value) &&
    value > 0 &&
    (!usesWholeQuantity(item?.unit) ||
      Number.isSafeInteger(value) ||
      (!item.manual &&
        Number.isFinite(Number(item.stock)) &&
        value === Number(item.stock)))
  );
}
