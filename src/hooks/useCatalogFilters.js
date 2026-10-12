// Файл синхронизирует фильтры каталога с URL, данными API, категориями и состояниями выдачи.

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  normalizeCatalogFilterQuery,
  parseCsvParam,
} from '../../shared/catalogQuery.js';

const BASE_PRODUCT_QUERY_KEYS = [
  'search',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
  'powerGroup',
  'sort',
  'page',
];
export const CATALOG_PAGE_SIZE_OPTIONS = [21, 24, 48, 96];
const ADVANCED_PRODUCT_QUERY_KEYS = ['appType', 'spe'];
const RESET_FILTER_KEYS = [
  'search',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
  'powerGroup',
  'appType',
  'spe',
  'page',
];

function setParamValue(params, key, value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false
  ) {
    params.delete(key);
    return;
  }

  params.set(key, String(value));
}

export function parseCatalogFilters(searchParams) {
  const priceMin = searchParams.get('priceMin') || '';
  const priceMax = searchParams.get('priceMax') || '';
  const normalized = normalizeCatalogFilterQuery({
    search: searchParams.get('search') || '',
    priceMin,
    priceMax,
    sort: searchParams.get('sort') || '',
    material: searchParams.get('material') || '',
    construction: searchParams.get('construction') || '',
    cores: searchParams.get('cores') || '',
    section: searchParams.get('section') || '',
    voltage: searchParams.get('voltage') || '',
    powerGroup: searchParams.get('powerGroup') || '',
    appType: searchParams.get('appType') || '',
    spe: searchParams.get('spe') || '',
  });

  return {
    category: searchParams.get('category') || '',
    search: normalized.search,
    priceMin,
    priceMax,
    priceMinNumber: normalized.priceMinNumber,
    priceMaxNumber: normalized.priceMaxNumber,
    sortBy: normalized.sortBy,
    selectedMaterials: normalized.selectedMaterials,
    selectedConstructions: normalized.selectedConstructions,
    selectedCores: normalized.selectedCores,
    selectedSections: normalized.selectedSections,
    selectedVoltages: normalized.selectedVoltages,
    selectedPowerGroups: normalized.selectedPowerGroups,
    selectedAppTypes: normalized.selectedAppTypes,
    onlySPE: normalized.onlySPE,
  };
}

export function buildCatalogProductQueryOptions(
  searchParams,
  { limit, includeAdvancedFilters = false } = {}
) {
  const options = {};
  const requestedLimit = Number(searchParams.get('limit'));
  if (CATALOG_PAGE_SIZE_OPTIONS.includes(requestedLimit)) {
    options.limit = requestedLimit;
  } else if (limit) {
    options.limit = limit;
  }

  const keys = includeAdvancedFilters
    ? [...BASE_PRODUCT_QUERY_KEYS, ...ADVANCED_PRODUCT_QUERY_KEYS]
    : BASE_PRODUCT_QUERY_KEYS;

  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      options[key] = value;
    }
  }

  return options;
}

function createCatalogFiltersKey(filters) {
  return [
    filters.search,
    filters.priceMin,
    filters.priceMax,
    filters.sortBy,
    filters.selectedMaterials.join(','),
    filters.selectedConstructions.join(','),
    filters.selectedCores.join(','),
    filters.selectedSections.join(','),
    filters.selectedVoltages.join(','),
    filters.selectedPowerGroups.join(','),
    filters.selectedAppTypes.join(','),
    filters.onlySPE ? '1' : '',
  ].join('|');
}

export function useCatalogFilters({
  limit,
  includeAdvancedFilters = false,
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.toString();
  const currentParams = useMemo(
    () => new URLSearchParams(searchQuery),
    [searchQuery]
  );

  const filters = useMemo(
    () => parseCatalogFilters(currentParams),
    [currentParams]
  );

  const productQueryOptions = useMemo(
    () =>
      buildCatalogProductQueryOptions(currentParams, {
        limit,
        includeAdvancedFilters,
      }),
    [currentParams, includeAdvancedFilters, limit]
  );

  const filtersKey = useMemo(() => createCatalogFiltersKey(filters), [filters]);

  const updateParams = useCallback(
    (values, { replace = false, resetPage = true } = {}) => {
      const next = new URLSearchParams(searchQuery);
      let shouldResetPage = false;

      for (const [key, value] of Object.entries(values)) {
        setParamValue(next, key, value);
        if (key !== 'page') {
          shouldResetPage = true;
        }
      }

      if (resetPage && shouldResetPage) {
        next.delete('page');
      }

      setSearchParams(next, { replace });
    },
    [searchQuery, setSearchParams]
  );

  const updateParam = useCallback(
    (key, value, options) => {
      updateParams({ [key]: value }, options);
    },
    [updateParams]
  );

  const toggleCsvParam = useCallback(
    (key, value) => {
      const valueString = String(value);
      const current = parseCsvParam(currentParams.get(key));
      const next = current.includes(valueString)
        ? current.filter((item) => item !== valueString)
        : [...current, valueString];

      updateParam(key, next.length > 0 ? next.join(',') : '');
    },
    [currentParams, updateParam]
  );

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams(searchQuery);
    RESET_FILTER_KEYS.forEach((key) => next.delete(key));
    setSearchParams(next, { replace: false });
  }, [searchQuery, setSearchParams]);

  return {
    searchParams,
    setSearchParams,
    searchQuery,
    filters,
    filtersKey,
    productQueryOptions,
    updateParam,
    updateParams,
    toggleCsvParam,
    resetFilters,
  };
}
