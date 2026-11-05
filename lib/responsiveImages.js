import manifest from '../shared/responsiveImageManifest.json' with { type: 'json' };

// Server/build only: browsers receive variants of one selected image, not the register.
export function getImageVariants(image) {
  return manifest.images[image]?.variants || [];
}
