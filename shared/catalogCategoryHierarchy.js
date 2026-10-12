export const IMPORTED_CABLES_CATEGORY = {
  name: 'Импортные кабели',
  slug: 'importnye-kabeli',
};

export const IMPORTED_CABLES_DEFAULT_SUBCATEGORY = {
  name: 'Другие импортные кабели',
  slug: 'importnye-drugie-kabeli',
};

export function normalizeCatalogHierarchy(product = {}) {
  const category = product.catalogCategory || '';
  const categorySlug = product.catalogCategorySlug || '';
  const subcategory = product.catalogSubcategory || '';
  const subcategorySlug = product.catalogSubcategorySlug || '';

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
    catalogSubcategory:
      subcategory || IMPORTED_CABLES_DEFAULT_SUBCATEGORY.name,
    catalogSubcategorySlug:
      subcategorySlug || IMPORTED_CABLES_DEFAULT_SUBCATEGORY.slug,
  };
}

export function getCatalogCategorySlugs(product = {}) {
  const normalized = normalizeCatalogHierarchy(product);
  return new Set(
    [
      normalized.catalogCategorySlug,
      normalized.catalogSubcategorySlug,
      product.catalogSectionSlug,
    ].filter(Boolean)
  );
}
