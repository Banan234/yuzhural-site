// Редакционная подборка типовых исполнений; не рейтинг по статистике продаж.
export const DEFAULT_FEATURED_PRODUCTS_LIMIT = 15;

const PREFERRED_VARIANTS = [
  ['ВВГНГ(А)-LS', '3X2.5'],
  ['ВВГНГ(А)-LS', '3X1.5'],
  ['ПВС', '3X2.5'],
  ['ПУГВ', '1X2.5'],
  ['ВВГНГ(А)-LS', '5X6'],
  ['ПВС', '3X1.5'],
  ['ПУГВ', '1X6'],
  ['ВВГНГ(А)-LS', '5X2.5'],
  ['КГ', '3X2.5'],
  ['ШВВП', '2X0.75'],
  ['ВВГНГ(А)-LS', '4X2.5'],
  ['ПВС', '4X2.5'],
  ['ПУГВ', '1X1.5'],
  ['ПВС', '5X2.5'],
  ['ВВГНГ(А)-LS', '3X4'],
  ['ПУГВ', '1X4'],
  ['ПВС', '2X1.5'],
  ['ВВГНГ(А)-LS', '5X4'],
  ['ПВС', '3X4'],
  ['ПУГВ', '1X10'],
  ['ВВГНГ(А)-LS', '3X6'],
  ['ПВС', '2X2.5'],
];

function normalizedName(product) {
  return String(product.name || product.title || product.sourceName || '')
    .toUpperCase()
    .replace(/A/g, 'А')
    .replace(/,/g, '.')
    .replace(/\s*[Х×X]\s*/g, 'X')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFeaturedProducts(
  products,
  limit = DEFAULT_FEATURED_PRODUCTS_LIMIT
) {
  const available = products
    .filter((product) => Number(product.stock) > 0 && Number(product.price) > 0)
    .sort((a, b) => Number(b.stock) - Number(a.stock));
  const selected = [];
  const seen = new Set();
  function add(product) {
    if (!product || selected.length >= limit) return;
    const identity = String(
      product.id ?? product.sku ?? product.slug ?? normalizedName(product)
    );
    if (seen.has(identity)) return;
    seen.add(identity);
    selected.push(product);
  }

  available.filter((product) => product.promoted).forEach(add);
  for (const [mark, size] of PREFERRED_VARIANTS) {
    const prefix = `${mark} ${size}`;
    // Исключаем малые остатки и дополнительные жилы вроде 3x1.5+1x1.5.
    add(
      available.find((product) => {
        const name = normalizedName(product);
        return (
          Number(product.stock) >= 100 &&
          (name === prefix || name.startsWith(`${prefix} `))
        );
      })
    );
  }
  available.forEach(add);
  return selected;
}
