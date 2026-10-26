// Editorial policy: retain branded series and incomplete designations.
// Only independently identifiable standard types can omit the manufacturer.
const GENERIC_TYPE =
  /^(?:МК\s+|(?:[USF]\/)?(?:UTP|FTP|STP)\b|H0[579]V(?:V)?-?[KUF]\b|N2AXS\(F\)2Y\b|NYM\b|ВВГ|АВВГ|ПВС\b|ШВВП\b|РВСБПМ\b)/iu;

export function formatManufacturerTitle(title, product = {}) {
  if (typeof title !== 'string') return title;
  const manufacturer =
    product.manufacturer || product.brand || product.catalogBrand;
  if (!manufacturer) return title;
  const aliases = [manufacturer, product.manufacturerMatch?.matchedAlias];
  if (manufacturer.toUpperCase() === 'LAPP KABEL')
    aliases.push('LAPP GROUP', 'LAPPKABEL');
  let candidate = title;
  for (const alias of aliases.filter(Boolean)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    candidate = candidate
      .replace(new RegExp(`^${escaped}(?:\\s+|[-–]\\s*)`, 'iu'), '')
      .replace(new RegExp(`\\s*\\(\\s*${escaped}\\s*\\)$`, 'iu'), '')
      .replace(new RegExp(`\\s+${escaped}$`, 'iu'), '')
      .trim();
  }
  return candidate && GENERIC_TYPE.test(candidate) ? candidate : title;
}
