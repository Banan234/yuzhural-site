// Prepare the exact detail presentation once on API/SSR, not a full reference book per browser.
import {
  getProductImage,
  getProductImageAlt,
} from '../shared/productImages.js';
import { buildProductDesignation } from '../shared/productDesignation.js';
import { getImageVariants } from './responsiveImages.js';
import {
  enrichProductDetail,
  usesOriginalDesignationForSpecs,
} from './catalogEnrichment.js';
import { applyExplicitSpecs } from './catalogExplicitSpecs.js';
import { applyCatalogAdditionalProfiles } from './catalogFamilyAdditional.js';
import { applyCatalogFamilyProfiles } from './catalogFamilyProfiles.js';
import { applyCatalogFamilyPilot } from './catalogFamilyPilot.js';
import { buildDescription, buildShortDescription, buildSpecs } from './catalog.js';
import { getCatalogDisplayDimensions } from './catalogDisplayDimensions.js';
export function prepareProductDetail(
  product,
  image = getProductImage(product),
  { designationDecoded = buildProductDesignation(product) } = {}
) {
  const current = { ...product, designationDecoded };
  if (!current.specs) {
    // Prerender receives raw import records, whose stored decoder may predate
    // the current knowledge base. Derive specs from the same decoder as the API.
    const dimensions = getCatalogDisplayDimensions(current);
    current.specs = buildSpecs(current);
    current.shortDescription ||= buildShortDescription(current);
    if (dimensions) current.displayDimensions = dimensions;
    if (dimensions?.diameter) current.conductorDiameter = dimensions.diameter;
  }
  const detail = enrichProductDetail(
    current,
    designationDecoded
  );
  const familyDetail = applyCatalogAdditionalProfiles(
    applyCatalogFamilyProfiles(
      applyCatalogFamilyPilot(detail, designationDecoded),
      designationDecoded
    ),
    designationDecoded
  );
  return {
    ...applyExplicitSpecs(
      familyDetail,
      usesOriginalDesignationForSpecs(product, designationDecoded)
        ? designationDecoded
        : familyDetail.designationDecoded
    ),
    ...(!familyDetail.catalogContent?.text &&
      familyDetail.description ===
        buildDescription(current, current.category, current.unit, current.stock) && {
        descriptionIsFallback: true,
      }),
    image,
    imageVariants: getImageVariants(image),
    imageAlt: getProductImageAlt(product, image),
  };
}
