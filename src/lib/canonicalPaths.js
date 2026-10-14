// Файл хранит canonical-стратегию URL сайта, чтобы sitemap, prerender и meta tags не расходились.

const TRAILING_SLASH_CANONICAL_PATHS = new Set([
  '/specification',
  '/how-to-order',
  '/quality',
  '/services/application',
  '/calculator/section',
  '/about',
  '/catalog',
  '/calculator/weight',
  '/services',
  '/services/marking',
  '/services/reference',
  '/services/analogs',
  '/services/drum',
  '/services/shipping',
  '/services/manufacturers',
  '/contacts',
  '/delivery',
  '/payment',
]);

function splitPathSuffix(path) {
  const match = String(path || '/').match(/^([^?#]*)(.*)$/);
  return {
    pathname: match?.[1] || '/',
    suffix: match?.[2] || '',
  };
}

export function normalizeSitePath(path = '/') {
  const { pathname, suffix } = splitPathSuffix(path);
  const trimmed = String(pathname || '').trim();

  if (!trimmed || trimmed === '/') {
    return `/${suffix}`;
  }

  const normalized = `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return `${normalized}${suffix}`;
}

export function toCanonicalSitePath(path = '/') {
  const { pathname, suffix } = splitPathSuffix(path);
  const normalizedPath = normalizeSitePath(pathname);

  if (normalizedPath === '/') {
    return `/${suffix}`;
  }

  const canonicalPath = TRAILING_SLASH_CANONICAL_PATHS.has(normalizedPath)
    ? `${normalizedPath}/`
    : normalizedPath;

  return `${canonicalPath}${suffix}`;
}

export const ABOUT_CANONICAL_PATH = toCanonicalSitePath('/about');
export const CATALOG_CANONICAL_PATH = toCanonicalSitePath('/catalog');
export const CABLE_WEIGHT_CANONICAL_PATH =
  toCanonicalSitePath('/calculator/weight');
export const CONTACTS_CANONICAL_PATH = toCanonicalSitePath('/contacts');
export const DELIVERY_CANONICAL_PATH = toCanonicalSitePath('/delivery');
export const PAYMENT_CANONICAL_PATH = toCanonicalSitePath('/payment');
