const generatedPath =
  /^\/(?:product-images\/(?:generated|previews)|responsive-images)(?:\/|$)/iu;

// Generated images and derived variants cannot be canonical photo overrides.
export function isGeneratedCableImage(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value, 'https://catalog.invalid/');
    const pathname = decodeURIComponent(url.pathname).replaceAll('\\', '/');
    return generatedPath.test(
      new URL(pathname, 'https://catalog.invalid/').pathname
    );
  } catch {
    return generatedPath.test(value);
  }
}
