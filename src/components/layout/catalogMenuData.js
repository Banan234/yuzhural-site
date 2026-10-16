// Файл готовит структуру пунктов меню каталога для desktop и mobile навигации.

import catalogCategoriesData from '../../../shared/catalogCategories.json';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';

function buildSearchLink(term) {
  return {
    label: term,
    to: `${CATALOG_CANONICAL_PATH}?search=${encodeURIComponent(term)}`,
  };
}

function buildCategoryMenuItem(category) {
  const subcategoryLinks = (category.subcategories || []).map(
    (subcategory) => ({
      label: subcategory.name,
      to: `/catalog/${subcategory.slug}`,
    })
  );
  const seenLabels = new Set(
    [category.name, ...subcategoryLinks.map((link) => link.label)].map(
      (label) => label.trim().toLocaleLowerCase('ru-RU')
    )
  );
  const keywordLinks = (category.keywords || []).flatMap((keyword) => {
    const label = keyword.trim();
    const normalizedLabel = label.toLocaleLowerCase('ru-RU');
    if (!label || seenLabels.has(normalizedLabel)) return [];
    seenLabels.add(normalizedLabel);
    return [buildSearchLink(label)];
  });

  return {
    title: category.name,
    slug: category.slug,
    to: `/catalog/${category.slug}`,
    subcategories: subcategoryLinks,
    marks: keywordLinks,
    links: [
      { label: category.name, to: `/catalog/${category.slug}` },
      ...subcategoryLinks,
      ...keywordLinks,
    ],
  };
}

export const CATALOG_SECTIONS = catalogCategoriesData.sections.map(
  (section) => ({
    title: section.name,
    slug: section.slug,
    to: `/catalog/${section.slug}`,
    groups: (section.categories || []).map(buildCategoryMenuItem),
  })
);

const mainSection = CATALOG_SECTIONS.find(
  (section) => section.slug === 'kabel-i-provod'
);
const specialSection = catalogCategoriesData.sections.find(
  (section) => section.slug === 'specialnye-kabeli'
);

export const CATALOG_MENU = [
  ...mainSection.groups.filter((group) => group.slug !== 'prochee'),
  buildCategoryMenuItem({
    name: specialSection.name,
    slug: specialSection.slug,
    subcategories: specialSection.categories,
  }),
  ...mainSection.groups.filter((group) => group.slug === 'prochee'),
];
