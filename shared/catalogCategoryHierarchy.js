import catalogCategories from './catalogCategories.json' with { type: 'json' };
import {
  getPowerCableSubcategorySlug,
  isFlexibleRubberPowerCable,
} from './powerCableClassification.js';
import {
  getWireCatalogPlacement,
  WIRE_CATEGORY_SLUG,
} from './wireClassification.js';

const categoryBySlug = new Map(
  catalogCategories.sections.flatMap((section) =>
    section.categories.map((category) => [category.slug, category])
  )
);

const sectionByCategorySlug = new Map(
  catalogCategories.sections.flatMap((section) =>
    section.categories.map((category) => [category.slug, section])
  )
);

const powerCableCategory = catalogCategories.sections
  .flatMap((section) => section.categories)
  .find((category) => category.slug === 'silovoy-kabel');

export const IMPORTED_CABLES_CATEGORY = {
  name: 'Импортные кабели',
  slug: 'importnye-kabeli',
};

export const IMPORTED_CABLES_DEFAULT_SUBCATEGORY = {
  name: 'Другие импортные кабели',
  slug: 'importnye-drugie-kabeli',
};

function normalizeCatalogCategory(product = {}) {
  const category = product.catalogCategory || '';
  const categorySlug = product.catalogCategorySlug || '';
  const subcategory = product.catalogSubcategory || '';
  const subcategorySlug = product.catalogSubcategorySlug || '';

  if (categorySlug === WIRE_CATEGORY_SLUG) {
    const placement = getWireCatalogPlacement(product);
    if (placement?.categorySlug === WIRE_CATEGORY_SLUG) {
      const wireCategory = categoryBySlug.get(WIRE_CATEGORY_SLUG);
      const resolved = wireCategory.subcategories.find(
        (entry) => entry.slug === placement.subcategorySlug
      );
      return {
        catalogCategory: wireCategory.name,
        catalogCategorySlug: wireCategory.slug,
        catalogSubcategory: resolved?.name || '',
        catalogSubcategorySlug: resolved?.slug || '',
      };
    }
    if (placement?.categorySlug) {
      const resolvedCategory = categoryBySlug.get(placement.categorySlug);
      return normalizeCatalogCategory({
        ...product,
        catalogCategory: resolvedCategory?.name || category,
        catalogCategorySlug: placement.categorySlug,
        catalogSubcategory: '',
        catalogSubcategorySlug: '',
      });
    }
    return {
      catalogCategory: categoryBySlug.get(WIRE_CATEGORY_SLUG).name,
      catalogCategorySlug: WIRE_CATEGORY_SLUG,
      catalogSubcategory: '',
      catalogSubcategorySlug: '',
    };
  }

  if (
    categorySlug === powerCableCategory.slug ||
    (categorySlug === 'gibkiy-kabel' && isFlexibleRubberPowerCable(product))
  ) {
    const resolvedSlug = getPowerCableSubcategorySlug(product);
    const resolved = powerCableCategory.subcategories?.find(
      (entry) => entry.slug === (resolvedSlug || subcategorySlug)
    );
    return {
      catalogCategory: powerCableCategory.name,
      catalogCategorySlug: powerCableCategory.slug,
      catalogSubcategory: resolved?.name || subcategory,
      catalogSubcategorySlug: resolved?.slug || subcategorySlug,
    };
  }

  if (categorySlug !== IMPORTED_CABLES_CATEGORY.slug) {
    return {
      catalogCategory: category,
      catalogCategorySlug: categorySlug,
      catalogSubcategory: subcategory,
      catalogSubcategorySlug: subcategorySlug,
    };
  }

  return {
    catalogCategory: IMPORTED_CABLES_CATEGORY.name,
    catalogCategorySlug: IMPORTED_CABLES_CATEGORY.slug,
    catalogSubcategory: subcategory || IMPORTED_CABLES_DEFAULT_SUBCATEGORY.name,
    catalogSubcategorySlug:
      subcategorySlug || IMPORTED_CABLES_DEFAULT_SUBCATEGORY.slug,
  };
}

export function normalizeCatalogHierarchy(product = {}) {
  const hierarchy = normalizeCatalogCategory(product);
  const section = sectionByCategorySlug.get(hierarchy.catalogCategorySlug);
  return {
    ...hierarchy,
    ...(section
      ? { catalogSection: section.name, catalogSectionSlug: section.slug }
      : {}),
  };
}

export function getCatalogCategorySlugs(product = {}) {
  const normalized = normalizeCatalogHierarchy(product);
  return new Set(
    [
      normalized.catalogCategorySlug,
      normalized.catalogSubcategorySlug,
      normalized.catalogSectionSlug || product.catalogSectionSlug,
    ].filter(Boolean)
  );
}
