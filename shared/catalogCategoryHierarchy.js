import catalogCategories from './catalogCategories.json' with { type: 'json' };
import {
  getPowerCableSubcategorySlug,
  isFlexibleRubberPowerCable,
} from './powerCableClassification.js';
import {
  getWireCatalogPlacement,
  WIRE_CATEGORY_SLUG,
} from './wireClassification.js';
import {
  CONTROL_CABLE_CATEGORY_SLUG,
  CONTROL_CABLE_SOURCE_CATEGORIES,
  CONTROL_CATEGORY_ALIASES,
  getControlCablePlacement,
} from './controlCableClassification.js';
import {
  HEATING_CABLE_CATEGORY_SLUG,
  getHeatingCablePlacement,
} from './heatingCableClassification.js';
import {
  DATA_CABLE_CATEGORY_SLUG,
  DATA_CABLE_SOURCE_CATEGORIES,
  getDataCablePlacement,
} from './dataCableClassification.js';

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

  const dataPlacement = getDataCablePlacement(product);
  if (dataPlacement || DATA_CABLE_SOURCE_CATEGORIES.has(categorySlug)) {
    if (
      dataPlacement &&
      dataPlacement.categorySlug !== DATA_CABLE_CATEGORY_SLUG
    ) {
      const destination = categoryBySlug.get(dataPlacement.categorySlug);
      return normalizeCatalogCategory({
        ...product,
        catalogCategory: destination.name,
        catalogCategorySlug: destination.slug,
        catalogSubcategory: '',
        catalogSubcategorySlug: dataPlacement.subcategorySlug,
      });
    }
    const dataCategory = categoryBySlug.get(DATA_CABLE_CATEGORY_SLUG);
    const resolved = dataCategory.subcategories.find(
      (entry) => entry.slug === dataPlacement?.subcategorySlug
    );
    return {
      catalogCategory: dataCategory.name,
      catalogCategorySlug: dataCategory.slug,
      catalogSubcategory: resolved?.name || '',
      catalogSubcategorySlug: resolved?.slug || '',
    };
  }

  if (categorySlug === HEATING_CABLE_CATEGORY_SLUG) {
    const placement = getHeatingCablePlacement(product);
    if (placement && placement.categorySlug !== HEATING_CABLE_CATEGORY_SLUG) {
      const destination = categoryBySlug.get(placement.categorySlug);
      return normalizeCatalogCategory({
        ...product,
        catalogCategory: destination.name,
        catalogCategorySlug: destination.slug,
        catalogSubcategory: '',
        catalogSubcategorySlug: placement.subcategorySlug,
      });
    }
    const heatingCategory = categoryBySlug.get(HEATING_CABLE_CATEGORY_SLUG);
    const resolved = heatingCategory.subcategories.find(
      (entry) => entry.slug === placement?.subcategorySlug
    );
    return {
      catalogCategory: heatingCategory.name,
      catalogCategorySlug: heatingCategory.slug,
      catalogSubcategory: resolved?.name || '',
      catalogSubcategorySlug: resolved?.slug || '',
    };
  }

  if (CONTROL_CABLE_SOURCE_CATEGORIES.has(categorySlug)) {
    const placement = getControlCablePlacement(product);
    if (placement && placement.categorySlug !== CONTROL_CABLE_CATEGORY_SLUG) {
      const destination = categoryBySlug.get(placement.categorySlug);
      return normalizeCatalogCategory({
        ...product,
        catalogCategory: destination.name,
        catalogCategorySlug: destination.slug,
        catalogSubcategory: '',
        catalogSubcategorySlug: placement.subcategorySlug,
      });
    }
    const controlCategory = categoryBySlug.get(CONTROL_CABLE_CATEGORY_SLUG);
    const resolved = controlCategory.subcategories.find(
      (entry) => entry.slug === placement?.subcategorySlug
    );
    return {
      catalogCategory: controlCategory.name,
      catalogCategorySlug: controlCategory.slug,
      catalogSubcategory: resolved?.name || '',
      catalogSubcategorySlug: resolved?.slug || '',
    };
  }

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
      // Старый API-фильтр остаётся совместимым после объединения рубрик.
      ...Object.entries(CONTROL_CATEGORY_ALIASES)
        .filter(([, target]) => target === normalized.catalogSubcategorySlug)
        .map(([alias]) => alias),
    ].filter(Boolean)
  );
}
