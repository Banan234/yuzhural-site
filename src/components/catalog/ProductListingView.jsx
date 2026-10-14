// Файл рендерит список товаров каталога, состояния загрузки, пустые результаты и управление выдачей.

import { useEffect, useMemo, useState } from 'react';
import CatalogFacet from './CatalogFacet';
import ProductCard from '../ui/ProductCard';
import { formatVoltage } from '../../lib/catalogFilters';
import {
  applyCatalogFiltersAndSort,
  buildCatalogFacetsForQuery,
  filterProductsBySearch,
  normalizeCatalogFilterQuery,
} from '../../../shared/catalogQuery.js';
import {
  CATALOG_PAGE_SIZE_OPTIONS,
  useCatalogFilters,
} from '../../hooks/useCatalogFilters';

const PAGE_SIZE = 24;
const PRICE_MIN_ID = 'price-min';
const PRICE_MAX_ID = 'price-max';

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages]);
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1)
      result.push('...');
  }
  return result;
}

function formatPriceValue(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizePriceInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const number = Number(trimmed);
  return Number.isFinite(number) ? String(Math.max(0, Math.round(number))) : '';
}

function scrollCatalogGridIntoView() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  const top = grid.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: 'smooth' });
}

export default function ProductListingView({
  products,
  isLoading,
  error,
  extraFilters = {},
  scopeKey,
  pagination = null,
  filterOptions: serverFilterOptions = null,
}) {
  const {
    showAppType = false,
    showSPE = false,
    showPowerGroups = false,
  } = extraFilters;
  const {
    filters,
    filtersKey: catalogFiltersKey,
    searchParams,
    updateParam,
    updateParams,
    toggleCsvParam,
    resetFilters,
  } = useCatalogFilters({
    includeAdvancedFilters: showAppType || showSPE || showPowerGroups,
  });
  const {
    search,
    priceMin,
    priceMax,
    priceMinNumber,
    priceMaxNumber,
    sortBy,
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    selectedPowerGroups,
    selectedAppTypes,
    onlySPE,
  } = filters;

  const [priceMinInput, setPriceMinInput] = useState(() =>
    normalizePriceInput(priceMin)
  );
  const [priceMaxInput, setPriceMaxInput] = useState(() =>
    normalizePriceInput(priceMax)
  );
  const [localPage, setLocalPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [viewMode, setViewMode] = useState('tiles');
  const isServerPaged = Boolean(pagination);
  const requestedPageSize = Number(searchParams.get('limit'));
  const pageSize = CATALOG_PAGE_SIZE_OPTIONS.includes(pagination?.limit)
    ? pagination.limit
    : CATALOG_PAGE_SIZE_OPTIONS.includes(requestedPageSize)
      ? requestedPageSize
      : PAGE_SIZE;

  useEffect(() => {
    setPriceMinInput(normalizePriceInput(priceMin));
  }, [priceMin]);

  useEffect(() => {
    setPriceMaxInput(normalizePriceInput(priceMax));
  }, [priceMax]);

  // Сбрасываем страницу при любой смене фильтров. Ключ строим один раз
  // из релевантных параметров — без этого зависимости пересоздавались бы
  // на каждый ререндер, провоцируя лишние прогоны эффекта.
  const filtersKey = useMemo(
    () => [scopeKey, catalogFiltersKey, pageSize].join('|'),
    [scopeKey, catalogFiltersKey, pageSize]
  );

  useEffect(() => {
    if (!isServerPaged) {
      setLocalPage(1);
    }
  }, [filtersKey, isServerPaged]);

  function commitPriceRange() {
    const minVal = normalizePriceInput(priceMinInput);
    const maxVal = normalizePriceInput(priceMaxInput);
    setPriceMinInput(minVal);
    setPriceMaxInput(maxVal);
    updateParams({
      priceMin: minVal,
      priceMax: maxVal,
    });
  }

  const searchedProducts = useMemo(() => {
    return filterProductsBySearch(products, search);
  }, [products, search]);

  const clientFilterQuery = useMemo(() => {
    return normalizeCatalogFilterQuery({
      selectedMaterials,
      selectedConstructions,
      selectedCores,
      selectedSections,
      selectedVoltages,
      selectedPowerGroups: showPowerGroups ? selectedPowerGroups : [],
      selectedAppTypes: showAppType ? selectedAppTypes : [],
      onlySPE: showSPE && onlySPE,
      priceMinNumber,
      priceMaxNumber,
      sortBy,
    });
  }, [
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    selectedPowerGroups,
    showPowerGroups,
    selectedAppTypes,
    showAppType,
    showSPE,
    onlySPE,
    priceMinNumber,
    priceMaxNumber,
    sortBy,
  ]);

  const localFilterOptions = useMemo(
    () => buildCatalogFacetsForQuery(searchedProducts, clientFilterQuery),
    [searchedProducts, clientFilterQuery]
  );

  const filteredProducts = useMemo(() => {
    if (isServerPaged) return products;

    return applyCatalogFiltersAndSort(searchedProducts, clientFilterQuery);
  }, [searchedProducts, clientFilterQuery, isServerPaged, products]);

  const filterOptions = useMemo(() => {
    const source = serverFilterOptions || localFilterOptions;
    return {
      ...source,
      materials: source.materials || [],
      constructions: source.constructions || [],
      cores: source.cores || [],
      sections: source.sections || [],
      voltages: source.voltages || [],
      appTypes: source.appTypes || [],
      powerGroups:
        source.powerGroups?.length > 0
          ? source.powerGroups
          : localFilterOptions.powerGroups || [],
    };
  }, [localFilterOptions, serverFilterOptions]);
  const priceSliderMax = Math.max(
    1,
    Math.ceil(
      Math.max(
        Number(filterOptions.maxPrice) || 0,
        Math.max(0, ...products.map((product) => Number(product.price) || 0))
      )
    )
  );
  const priceRangeMin = Math.min(
    priceSliderMax,
    Math.max(0, Math.round(Number(priceMinInput) || 0))
  );
  const priceRangeMax = Math.max(
    priceRangeMin,
    Math.min(
      priceSliderMax,
      priceMaxInput.trim()
        ? Math.round(Number(priceMaxInput) || 0)
        : priceSliderMax
    )
  );
  const priceMinPercent = (priceRangeMin / priceSliderMax) * 100;
  const priceMaxPercent = (priceRangeMax / priceSliderMax) * 100;
  const priceScaleValues = [0, priceSliderMax];
  const page = pagination?.page || localPage;
  const resultCount = pagination?.total ?? filteredProducts.length;
  const totalPages =
    pagination?.totalPages || Math.ceil(filteredProducts.length / pageSize);
  const visibleProducts = isServerPaged
    ? products
    : filteredProducts.slice((localPage - 1) * pageSize, localPage * pageSize);

  const hasActiveFilters =
    selectedMaterials.length > 0 ||
    selectedConstructions.length > 0 ||
    selectedCores.length > 0 ||
    selectedSections.length > 0 ||
    selectedVoltages.length > 0 ||
    (showPowerGroups && selectedPowerGroups.length > 0) ||
    (showAppType && selectedAppTypes.length > 0) ||
    (showSPE && onlySPE) ||
    !!priceMin ||
    !!priceMax ||
    !!search;
  function handlePageChange(nextPage) {
    const normalizedPage = Math.min(Math.max(nextPage, 1), totalPages);
    if (normalizedPage === page) return;

    if (isServerPaged) {
      updateParam('page', normalizedPage > 1 ? normalizedPage : '');
    } else {
      setLocalPage(normalizedPage);
    }
    requestAnimationFrame(scrollCatalogGridIntoView);
  }

  return (
    <div className="catalog-listing-layout">
      <aside className="catalog-filters-sidebar" aria-label="Фильтры товаров">
        <div className="catalog-filter-panel catalog-filter-panel--sidebar">
          <div className="catalog-filter-panel__head">
            <span className="catalog-filter-panel__title">Фильтры</span>
            <button
              type="button"
              className="catalog-filters-toggle"
              aria-expanded={filtersExpanded}
              aria-controls="catalog-filters-body"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              {filtersExpanded
                ? 'Свернуть'
                : hasActiveFilters
                  ? 'Изменить фильтры'
                  : 'Открыть фильтры'}
            </button>
          </div>

          <div
            className={`catalog-filter-panel__body${filtersExpanded ? ' catalog-filter-panel__body--expanded' : ''}`}
            id="catalog-filters-body"
          >
            <form
              className="catalog-price-range"
              onSubmit={(e) => {
                e.preventDefault();
                commitPriceRange();
              }}
            >
              <span className="catalog-price-range__label">Цена, ₽</span>
              <div className="catalog-price-range__inputs">
                <label className="visually-hidden" htmlFor={PRICE_MIN_ID}>
                  Цена от, ₽
                </label>
                <input
                  id={PRICE_MIN_ID}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={priceSliderMax}
                  step="1"
                  className="catalog-price-range__input"
                  placeholder={formatPriceValue(0)}
                  value={priceMinInput}
                  onChange={(e) => setPriceMinInput(e.target.value)}
                  onBlur={commitPriceRange}
                />
                <label className="visually-hidden" htmlFor={PRICE_MAX_ID}>
                  Цена до, ₽
                </label>
                <input
                  id={PRICE_MAX_ID}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={priceSliderMax}
                  step="1"
                  className="catalog-price-range__input"
                  placeholder={formatPriceValue(priceSliderMax)}
                  value={priceMaxInput}
                  onChange={(e) => setPriceMaxInput(e.target.value)}
                  onBlur={commitPriceRange}
                />
              </div>
              <div className="catalog-price-range__slider">
                <div className="catalog-price-range__track" />
                <div
                  className="catalog-price-range__track-fill"
                  style={{
                    left: `${priceMinPercent}%`,
                    width: `${priceMaxPercent - priceMinPercent}%`,
                  }}
                />
                <input
                  type="range"
                  aria-label="Минимальная цена"
                  min="0"
                  max={priceSliderMax}
                  step="1"
                  value={priceRangeMin}
                  onChange={(event) =>
                    setPriceMinInput(
                      String(
                        Math.min(Number(event.target.value), priceRangeMax)
                      )
                    )
                  }
                  onPointerUp={commitPriceRange}
                  onKeyUp={commitPriceRange}
                  className="catalog-price-range__range catalog-price-range__range--min"
                  style={{
                    zIndex: priceRangeMin > priceSliderMax * 0.9 ? 4 : 3,
                  }}
                />
                <input
                  type="range"
                  aria-label="Максимальная цена"
                  min="0"
                  max={priceSliderMax}
                  step="1"
                  value={priceRangeMax}
                  onChange={(event) =>
                    setPriceMaxInput(
                      String(
                        Math.max(Number(event.target.value), priceRangeMin)
                      )
                    )
                  }
                  onPointerUp={commitPriceRange}
                  onKeyUp={commitPriceRange}
                  className="catalog-price-range__range catalog-price-range__range--max"
                />
              </div>
              <div className="catalog-price-range__scale" aria-hidden="true">
                {priceScaleValues.map((value, index) => (
                  <span
                    key={index}
                    className={
                      index > 0 && index < priceScaleValues.length - 1
                        ? 'catalog-price-range__tick catalog-price-range__tick--marked'
                        : 'catalog-price-range__tick'
                    }
                  >
                    {formatPriceValue(value)}
                  </span>
                ))}
              </div>
            </form>

            {[
              {
                key: 'materials',
                param: 'material',
                label: 'Материал жилы',
                selected: selectedMaterials,
              },
              {
                key: 'constructions',
                param: 'construction',
                label: 'Исполнение жилы',
                selected: selectedConstructions,
              },
              {
                key: 'cores',
                param: 'cores',
                label: 'Кол-во жил',
                selected: selectedCores,
              },
              {
                key: 'sections',
                param: 'section',
                label: 'Сечение, мм²',
                selected: selectedSections,
                format: (value) => Number(value).toLocaleString('ru-RU'),
              },
              {
                key: 'voltages',
                param: 'voltage',
                label: 'Напряжение, кВ',
                selected: selectedVoltages,
                format: formatVoltage,
              },
            ].map((facet) => (
              <CatalogFacet
                key={facet.key}
                label={facet.label}
                values={filterOptions[facet.key]}
                selected={facet.selected}
                counts={filterOptions.facetCounts?.[facet.key]}
                format={facet.format}
                onToggle={(value) => toggleCsvParam(facet.param, value)}
              />
            ))}

            {showAppType && filterOptions.appTypes.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">Применение</span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.appTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={selectedAppTypes.includes(t)}
                      className={`catalog-filter-tag${
                        selectedAppTypes.includes(t)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('appType', t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showPowerGroups && filterOptions.powerGroups.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">
                  Группа силового кабеля
                </span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.powerGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      aria-pressed={selectedPowerGroups.includes(group)}
                      className={`catalog-filter-tag${
                        selectedPowerGroups.includes(group)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('powerGroup', group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSPE && filterOptions.hasSPE && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">Тип изоляции</span>
                <div className="catalog-filter-row__tags">
                  <button
                    type="button"
                    aria-pressed={onlySPE}
                    className={`catalog-filter-tag${
                      onlySPE ? ' catalog-filter-tag--active' : ''
                    }`}
                    onClick={() => updateParam('spe', onlySPE ? '' : '1')}
                  >
                    Только СПЭ
                  </button>
                </div>
              </div>
            )}

            <div className="catalog-filter-panel__footer">
              {hasActiveFilters && (
                <button
                  type="button"
                  className="catalog-filter-panel__reset"
                  onClick={resetFilters}
                >
                  ✕ Сбросить фильтр
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="catalog-results-main">
        <p className="catalog-results-count" role="status">
          Найдено: {resultCount.toLocaleString('ru-RU')} позиций
        </p>
        {!error && (
          <div className="catalog-filter-summary">
            <div className="catalog-sort-row" aria-label="Сортировать товары">
              <strong className="catalog-sort-row__label">
                Сортировать по:
              </strong>
              <button
                type="button"
                className={`catalog-sort-row__option${sortBy === 'popular' ? ' catalog-sort-row__option--active' : ''}`}
                aria-pressed={sortBy === 'popular'}
                onClick={() => updateParam('sort', 'popular')}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M3 14V9m4 5V5m4 9V7m4 7V3" />
                </svg>
                <span>Популярности</span>
              </button>
              <button
                type="button"
                className={`catalog-sort-row__option${sortBy === 'price-asc' ? ' catalog-sort-row__option--active' : ''}`}
                aria-pressed={sortBy === 'price-asc'}
                onClick={() => updateParam('sort', 'price-asc')}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M3 5h12M5 9h8m-6 4h4" />
                </svg>
                <span>Цене</span>
              </button>
              <button
                type="button"
                className={`catalog-sort-row__option${sortBy === 'title-asc' ? ' catalog-sort-row__option--active' : ''}`}
                aria-pressed={sortBy === 'title-asc'}
                onClick={() => updateParam('sort', 'title-asc')}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M4 14V4m-2 2 2-2 2 2m3 7h5m-5-4h4m-4-4h3" />
                </svg>
                <span>Алфавиту</span>
              </button>
              <label className="catalog-page-size">
                <span>Выводить по:</span>
                <select
                  className="catalog-page-size__select"
                  aria-label="Количество товаров на странице"
                  value={pageSize}
                  onChange={(event) => updateParam('limit', event.target.value)}
                >
                  {CATALOG_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="catalog-view-switch"
                aria-label="Вид списка товаров"
              >
                <button
                  type="button"
                  className={`catalog-view-switch__button${
                    viewMode === 'tiles'
                      ? ' catalog-view-switch__button--active'
                      : ''
                  }`}
                  aria-label="Плиточное отображение"
                  aria-pressed={viewMode === 'tiles'}
                  title="Плиточное отображение"
                  onClick={() => setViewMode('tiles')}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
                    <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" />
                    <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" />
                    <rect x="12" y="12" width="5.5" height="5.5" rx="1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`catalog-view-switch__button${
                    viewMode === 'list'
                      ? ' catalog-view-switch__button--active'
                      : ''
                  }`}
                  aria-label="Прайс-лист"
                  aria-pressed={viewMode === 'list'}
                  title="Прайс-лист"
                  onClick={() => setViewMode('list')}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M7.5 4h10M7.5 10h10M7.5 16h10" />
                    <circle cx="3.5" cy="4" r=".8" />
                    <circle cx="3.5" cy="10" r=".8" />
                    <circle cx="3.5" cy="16" r=".8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="catalog-empty">{error}</div>
        ) : isLoading ? (
          <div className="catalog-empty">
            Подготавливаем товары из прайса...
          </div>
        ) : resultCount > 0 ? (
          <>
            <div
              id="catalog-grid"
              className="catalog-grid-anchor"
              aria-hidden="true"
            />
            <h2 className="visually-hidden">Товары каталога</h2>
            <div
              className={`products-grid products-grid--catalog products-grid--catalog-${viewMode}`}
            >
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  variant={
                    viewMode === 'list' ? 'catalog-list' : 'catalog-tile'
                  }
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="catalog-pagination">
                <button
                  type="button"
                  className="catalog-pagination__btn"
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  ← Назад
                </button>

                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span
                      key={`dots-${i}`}
                      className="catalog-pagination__dots"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`catalog-pagination__page${
                        p === page ? ' catalog-pagination__page--active' : ''
                      }`}
                      onClick={() => handlePageChange(p)}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  type="button"
                  className="catalog-pagination__btn"
                  disabled={page === totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Вперёд →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="catalog-empty">
            По вашему запросу товары не найдены.
          </div>
        )}
      </div>
    </div>
  );
}
