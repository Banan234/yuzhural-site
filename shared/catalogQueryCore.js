// Файл содержит чистые функции нормализации и построения query string для фильтров каталога.

import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from '../lib/catalogClassifiers.js';
import { getPowerCableGroup, POWER_CABLE_GROUPS } from './powerCableGroups.js';

export function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d)\s*[xх×*]\s*(?=\d)/gi, '$1х');
}

export function normalizeSearchKey(value) {
  return normalizeSearchText(value).replace(/[^0-9a-zа-я]+/g, '');
}

export function parseCsvParam(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCsvNumbers(value) {
  return parseCsvParam(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return parseCsvParam(value);
}

function normalizeNumberList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
  }

  return parseCsvNumbers(value);
}

export function normalizeCatalogFilterQueryCore(query = {}) {
  return {
    search: typeof query.search === 'string' ? query.search : '',
    priceMinNumber:
      query.priceMinNumber != null
        ? parsePositiveNumber(query.priceMinNumber)
        : parsePositiveNumber(query.priceMin),
    priceMaxNumber:
      query.priceMaxNumber != null
        ? parsePositiveNumber(query.priceMaxNumber)
        : parsePositiveNumber(query.priceMax),
    sortBy:
      typeof query.sortBy === 'string' && query.sortBy.trim()
        ? query.sortBy
        : typeof query.sort === 'string' && query.sort.trim()
          ? query.sort
          : 'default',
    selectedMaterials: normalizeStringList(
      query.selectedMaterials ?? query.material
    ),
    selectedConstructions: normalizeStringList(
      query.selectedConstructions ?? query.construction
    ),
    selectedCores: normalizeStringList(query.selectedCores ?? query.cores),
    selectedSections: normalizeNumberList(
      query.selectedSections ?? query.section
    ),
    selectedVoltages: normalizeNumberList(
      query.selectedVoltages ?? query.voltage
    ),
    selectedAppTypes: normalizeStringList(
      query.selectedAppTypes ?? query.appType
    ),
    selectedPowerGroups: normalizeStringList(
      query.selectedPowerGroups ?? query.powerGroup
    ),
    onlySPE: query.onlySPE === true || query.spe === '1',
  };
}

export function productMatchesSearchCore(product, search) {
  const query = String(search || '')
    .trim()
    .toLowerCase();
  if (!query) return true;

  const normalizedSearch = normalizeSearchKey(query);

  for (const key of ['mark', 'title', 'fullName', 'sku']) {
    const value = String(product?.[key] || '');
    if (value.toLowerCase().includes(query)) return true;
    if (
      normalizedSearch &&
      normalizeSearchKey(value).includes(normalizedSearch)
    ) {
      return true;
    }
  }

  return false;
}

export function filterProductsBySearchCore(items, search) {
  if (!String(search || '').trim()) return items;
  return items.filter((product) => productMatchesSearchCore(product, search));
}

export function buildCatalogFacetsCore(items) {
  const materialSet = new Set();
  const constructionSet = new Set();
  const coreSet = new Set();
  const sectionSet = new Set();
  const voltageSet = new Set();
  const appTypeSet = new Set();
  const powerGroupSet = new Set();
  const facetCounts = {
    materials: Object.create(null),
    constructions: Object.create(null),
    cores: Object.create(null),
    sections: Object.create(null),
    voltages: Object.create(null),
  };
  const count = (key, value) => {
    if (value !== null && value !== undefined && value !== '')
      facetCounts[key][value] = (facetCounts[key][value] || 0) + 1;
  };
  let hasSPE = false;
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const product of items) {
    materialSet.add(getConductorMaterial(product));
    constructionSet.add(getWireConstruction(product));

    count('materials', getConductorMaterial(product));
    count('constructions', getWireConstruction(product));
    count('sections', product.crossSection);
    count('voltages', product.voltage);
    const coreVariant = getCoreVariantLabel(product);
    count('cores', coreVariant);
    if (coreVariant) coreSet.add(coreVariant);
    if (product.crossSection) sectionSet.add(product.crossSection);
    if (product.voltage != null) voltageSet.add(product.voltage);
    if (product.catalogApplicationType)
      appTypeSet.add(product.catalogApplicationType);
    const powerGroup = getPowerCableGroup(product);
    if (powerGroup) powerGroupSet.add(powerGroup);
    if (product.catalogType === 'СПЭ') hasSPE = true;

    const price = Number(product.price);
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }
  }

  return {
    facetCounts,
    materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
    constructions: [...constructionSet].sort((a, b) =>
      a.localeCompare(b, 'ru')
    ),
    cores: [...coreSet].sort((a, b) =>
      a.localeCompare(b, 'ru', { numeric: true })
    ),
    sections: [...sectionSet].sort((a, b) => a - b),
    voltages: [...voltageSet].sort((a, b) => a - b),
    appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
    powerGroups: POWER_CABLE_GROUPS.filter((group) => powerGroupSet.has(group)),
    hasSPE,
    minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
  };
}

// Facet choices are calculated against every other active filter. This keeps
// each filter's options useful after a selection (for example, the available
// sections after choosing aluminum) while still allowing the current choice
// to be changed or cleared.
export function buildCatalogFacetsForQueryCore(items, query = {}) {
  const normalizedQuery = normalizeCatalogFilterQueryCore(query);
  const baseFacets = buildCatalogFacetsCore(items);
  const facetFilters = [
    ['materials', 'selectedMaterials'],
    ['constructions', 'selectedConstructions'],
    ['cores', 'selectedCores'],
    ['sections', 'selectedSections'],
    ['voltages', 'selectedVoltages'],
    ['appTypes', 'selectedAppTypes'],
    ['powerGroups', 'selectedPowerGroups'],
    ['hasSPE', 'onlySPE'],
  ];

  for (const [facetName, filterName] of facetFilters) {
    const candidates = applyProductFiltersCore(items, {
      ...normalizedQuery,
      [filterName]: filterName === 'onlySPE' ? false : [],
    });
    const available = buildCatalogFacetsCore(candidates);
    baseFacets[facetName] = available[facetName];
    if (available.facetCounts[facetName])
      baseFacets.facetCounts[facetName] = available.facetCounts[facetName];
  }

  // Keep an active choice visible when a combination has no matches so the
  // user can remove it directly instead of having to reset every filter.
  const selectedFacetValues = [
    ['materials', normalizedQuery.selectedMaterials],
    ['constructions', normalizedQuery.selectedConstructions],
    ['cores', normalizedQuery.selectedCores],
    ['sections', normalizedQuery.selectedSections],
    ['voltages', normalizedQuery.selectedVoltages],
    ['appTypes', normalizedQuery.selectedAppTypes],
    ['powerGroups', normalizedQuery.selectedPowerGroups],
  ];
  for (const [facetName, selectedValues] of selectedFacetValues) {
    const values = [...new Set([...baseFacets[facetName], ...selectedValues])];
    if (facetName === 'sections' || facetName === 'voltages') {
      values.sort((a, b) => a - b);
    } else if (facetName === 'cores') {
      values.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    } else if (facetName === 'powerGroups') {
      values.sort(
        (a, b) => POWER_CABLE_GROUPS.indexOf(a) - POWER_CABLE_GROUPS.indexOf(b)
      );
    } else {
      values.sort((a, b) => a.localeCompare(b, 'ru'));
    }
    baseFacets[facetName] = values;
  }
  if (normalizedQuery.onlySPE) baseFacets.hasSPE = true;

  return baseFacets;
}

export function applyProductFiltersCore(items, query) {
  let result = items;
  const selectedMaterials = query.selectedMaterials || [];
  const selectedConstructions = query.selectedConstructions || [];
  const selectedCores = query.selectedCores || [];
  const selectedSections = query.selectedSections || [];
  const selectedVoltages = query.selectedVoltages || [];
  const selectedAppTypes = query.selectedAppTypes || [];
  const selectedPowerGroups = query.selectedPowerGroups || [];
  const priceMinNumber = query.priceMinNumber;
  const priceMaxNumber = query.priceMaxNumber;

  if (selectedMaterials.length > 0) {
    result = result.filter((item) =>
      selectedMaterials.includes(getConductorMaterial(item))
    );
  }
  if (selectedConstructions.length > 0) {
    result = result.filter((item) =>
      selectedConstructions.includes(getWireConstruction(item))
    );
  }
  if (selectedCores.length > 0) {
    result = result.filter((item) =>
      selectedCores.includes(getCoreVariantLabel(item))
    );
  }
  if (selectedSections.length > 0) {
    result = result.filter((item) =>
      selectedSections.includes(item.crossSection)
    );
  }
  if (selectedVoltages.length > 0) {
    result = result.filter((item) => selectedVoltages.includes(item.voltage));
  }
  if (selectedAppTypes.length > 0) {
    result = result.filter((item) =>
      selectedAppTypes.includes(item.catalogApplicationType)
    );
  }
  if (selectedPowerGroups.length > 0) {
    result = result.filter((item) =>
      selectedPowerGroups.includes(getPowerCableGroup(item))
    );
  }
  if (query.onlySPE) {
    result = result.filter((item) => item.catalogType === 'СПЭ');
  }
  if (Number.isFinite(priceMinNumber) && priceMinNumber > 0) {
    result = result.filter((item) => Number(item.price) >= priceMinNumber);
  }
  if (Number.isFinite(priceMaxNumber) && priceMaxNumber > 0) {
    result = result.filter((item) => Number(item.price) <= priceMaxNumber);
  }

  return result;
}

export function applyCatalogFiltersAndSortCore(items, query) {
  const normalizedQuery = normalizeCatalogFilterQueryCore(query);
  return sortProductsCore(
    applyProductFiltersCore(items, normalizedQuery),
    normalizedQuery.sortBy
  );
}

export function getSortablePrice(product) {
  const value = Number(product.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function compareProductsByPrice(a, b, direction = 1) {
  const priceA = getSortablePrice(a);
  const priceB = getSortablePrice(b);
  if (priceA === null && priceB === null) return 0;
  if (priceA === null) return 1;
  if (priceB === null) return -1;
  return direction === 1 ? priceA - priceB : priceB - priceA;
}

export function sortProductsCore(items, sortBy) {
  if (!sortBy || sortBy === 'default') return items;

  const result = [...items];

  if (sortBy === 'price-asc') {
    result.sort((a, b) => compareProductsByPrice(a, b, 1));
  } else if (sortBy === 'price-desc') {
    result.sort((a, b) => compareProductsByPrice(a, b, -1));
  } else if (sortBy === 'title-asc') {
    result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  } else if (sortBy === 'popular') {
    result.sort((a, b) => (b.stock || 0) - (a.stock || 0));
  }

  return result;
}
