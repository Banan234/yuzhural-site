// Файл готовит структуру пунктов меню каталога для desktop и mobile навигации.

import catalogCategoriesData from '../../../shared/catalogCategories.json';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';

const cableSection = catalogCategoriesData.sections.find(
  (section) => section.slug === 'kabel-i-provod'
);

function buildSearchLink(term) {
  return {
    label: term,
    to: `${CATALOG_CANONICAL_PATH}?search=${encodeURIComponent(term)}`,
  };
}

function buildCategoryMenuItem(category) {
  const uniqueKeywords = Array.from(new Set(category.keywords || []))
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: category.name,
    slug: category.slug,
    links: [
      { label: category.name, to: `/catalog/${category.slug}` },
      ...uniqueKeywords.map(buildSearchLink),
    ],
  };
}

export const CABLE_SECTION_NAME = cableSection?.name || 'Кабель и провод';

export const CATALOG_MENU = [
  ...(cableSection?.categories || []).map(buildCategoryMenuItem),
];
