// Prepare the exact detail presentation once on API/SSR, not a full reference book per browser.
import {
  getProductImage,
  getProductImageAlt,
} from '../shared/productImages.js';
import { buildProductDesignation } from '../shared/productDesignation.js';
import { getImageVariants } from './responsiveImages.js';
export function prepareProductDetail(product, image = getProductImage(product)) {
  return {
    ...product,
    image,
    imageVariants: getImageVariants(image),
    imageAlt: getProductImageAlt(product, image),
    designationDecoded: buildProductDesignation(product),
  };
}
