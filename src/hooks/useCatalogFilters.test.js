// Файл проверяет хук фильтров каталога: URL-параметры, сортировку, категории и запросы API.

import { describe, expect, it } from 'vitest';
import {
  applyCatalogFiltersAndSort as applyServerCatalogFiltersAndSort,
  getCatalogSearchFilteredProducts,
} from '../../lib/catalogQuery.js';
import {
  applyCatalogFiltersAndSort,
  filterProductsBySearch,
} from '../../shared/catalogQuery.js';
import {
  buildCatalogProductQueryOptions,
  parseCatalogFilters,
} from './useCatalogFilters.js';

const items = [
  {
    mark: 'АВВГ',
    title: 'Кабель АВВГ 3x2.5',
    fullName: 'АВВГ 3x2.5',
    sku: 'A-001',
    cableDecoded: { decoded: ['алюминиевые жилы'] },
    cores: 3,
    groundCores: 0,
    crossSection: 2.5,
    voltage: 660,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 100,
    stock: 5,
  },
  {
    mark: 'КГ',
    title: 'Кабель КГ 4x4',
    fullName: 'КГ 4x4',
    sku: 'C-002',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 4,
    groundCores: 1,
    crossSection: 4,
    voltage: 660,
    catalogApplicationType: 'гибкий',
    catalogType: 'СПЭ',
    price: 300,
    stock: 12,
  },
  {
    mark: 'ВВГ',
    title: 'Кабель ВВГ 1x1.5',
    fullName: 'ВВГ 1x1.5',
    sku: 'C-003',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 1,
    crossSection: 1.5,
    voltage: 380,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 0,
    stock: 0,
  },
];

describe('catalog filter URL parsing', () => {
  it('normalizes CSV, numeric CSV and boolean filter params', () => {
    const filters = parseCatalogFilters(
      new URLSearchParams(
        'category=kabel&search=ВВГ&priceMin=10&priceMax=nope&material=медь, алюминий&section=2.5,bad,4&voltage=0.66,1&powerGroup=ВВГ / бронированные&appType=силовой&spe=1&sort=price-asc'
      )
    );

    expect(filters).toMatchObject({
      category: 'kabel',
      search: 'ВВГ',
      priceMin: '10',
      priceMax: 'nope',
      priceMinNumber: 10,
      priceMaxNumber: null,
      sortBy: 'price-asc',
      selectedMaterials: ['медь', 'алюминий'],
      selectedSections: [2.5, 4],
      selectedVoltages: [0.66, 1],
      selectedPowerGroups: ['ВВГ / бронированные'],
      selectedAppTypes: ['силовой'],
      onlySPE: true,
    });
  });

  it('builds API query options with optional advanced filters', () => {
    const params = new URLSearchParams(
      'search=ВВГ&mark=ВВГ&material=медь&powerGroup=ВВГ / бронированные&appType=силовой&spe=1&page=2&category=ignored'
    );

    expect(buildCatalogProductQueryOptions(params, { limit: 24 })).toEqual({
      limit: 24,
      search: 'ВВГ',
      mark: 'ВВГ',
      material: 'медь',
      powerGroup: 'ВВГ / бронированные',
      page: '2',
    });
    expect(
      buildCatalogProductQueryOptions(params, {
        limit: 24,
        includeAdvancedFilters: true,
      })
    ).toEqual({
      limit: 24,
      search: 'ВВГ',
      mark: 'ВВГ',
      material: 'медь',
      powerGroup: 'ВВГ / бронированные',
      appType: 'силовой',
      spe: '1',
      page: '2',
    });
  });

  it('keeps client and server catalog filtering results aligned', () => {
    const searchParams = new URLSearchParams(
      'search=Кабель&material=медь&section=1.5,4&priceMin=1&sort=price-desc'
    );
    const serverQuery = Object.fromEntries(searchParams.entries());
    const clientFilters = parseCatalogFilters(searchParams);

    const serverResult = applyServerCatalogFiltersAndSort(
      getCatalogSearchFilteredProducts(items, serverQuery.search),
      serverQuery
    );
    const clientResult = applyCatalogFiltersAndSort(
      filterProductsBySearch(items, clientFilters.search),
      clientFilters
    );

    expect(clientResult).toEqual(serverResult);
  });
});
