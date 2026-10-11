// Файл рендерит список товаров каталога, состояния загрузки, пустые результаты и управление выдачей.

import { useEffect, useMemo, useState } from 'react';
import ProductCard from '../ui/ProductCard';
import { formatVoltage } from '../../lib/catalogFilters';
import {
  applyCatalogFiltersAndSort,
  buildCatalogFacets,
  filterProductsBySearch,
  normalizeCatalogFilterQuery,
} from '../../../shared/catalogQuery.js';
import { useCatalogFilters } from '../../hooks/useCatalogFilters';

const PAGE_SIZE = 24;
const PRICE_MIN_ID = 'price-min';
const PRICE_MAX_ID = 'price-max';
const SORT_SELECT_ID = 'sort-select';

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
  idPrefix = 'catalog',
}) {
  const {
    showAppType = false,
    showSPE = false,
    showPowerGroups = false,
  } = extraFilters;
  const {
    filters,
    filtersKey: catalogFiltersKey,
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

  const [priceMinInput, setPriceMinInput] = useState(priceMin);
  const [priceMaxInput, setPriceMaxInput] = useState(priceMax);
  const [localPage, setLocalPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isServerPaged = Boolean(pagination);
  const filterPanelBodyId = `${idPrefix}-filter-panel-body`;

  useEffect(() => {
    setPriceMinInput(priceMin);
  }, [priceMin]);

  useEffect(() => {
    setPriceMaxInput(priceMax);
  }, [priceMax]);

  // Сбрасываем страницу при любой смене фильтров. Ключ строим один раз
  // из релевантных параметров — без этого зависимости пересоздавались бы
  // на каждый ререндер, провоцируя лишние прогоны эффекта.
  const filtersKey = useMemo(
    () => [scopeKey, catalogFiltersKey].join('|'),
    [scopeKey, catalogFiltersKey]
  );

  useEffect(() => {
    if (!isServerPaged) {
      setLocalPage(1);
    }
  }, [filtersKey, isServerPaged]);

  function commitPriceRange() {
    const minVal = priceMinInput.trim();
    const maxVal = priceMaxInput.trim();
    updateParams({
      priceMin: minVal,
      priceMax: maxVal,
    });
  }

  const searchedProducts = useMemo(() => {
    return filterProductsBySearch(products, search);
  }, [products, search]);

  const localFilterOptions = useMemo(() => {
    return buildCatalogFacets(searchedProducts);
  }, [searchedProducts]);

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
  const page = pagination?.page || localPage;
  const resultCount = pagination?.total ?? filteredProducts.length;
  const totalPages =
    pagination?.totalPages || Math.ceil(filteredProducts.length / PAGE_SIZE);
  const visibleProducts = isServerPaged
    ? products
    : filteredProducts.slice(
        (localPage - 1) * PAGE_SIZE,
        localPage * PAGE_SIZE
      );

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
  const activeFilterCount = [
    search,
    priceMin || priceMax,
    selectedMaterials.length,
    selectedConstructions.length,
    selectedCores.length,
    selectedSections.length,
    selectedVoltages.length,
    showPowerGroups && selectedPowerGroups.length,
    showAppType && selectedAppTypes.length,
    showSPE && onlySPE,
  ].filter(Boolean).length;

  const hasAnyFilterOption =
    filterOptions.materials.length > 0 ||
    filterOptions.constructions.length > 0 ||
    filterOptions.cores.length > 0 ||
    filterOptions.sections.length > 0 ||
    filterOptions.voltages.length > 0 ||
    (showPowerGroups && filterOptions.powerGroups.length > 0) ||
    (showAppType && filterOptions.appTypes.length > 0) ||
    (showSPE && filterOptions.hasSPE);

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
    <>
        <form
          className="catalog-price-range"
          onSubmit={(e) => {
            e.preventDefault();
            commitPriceRange();
          }}
        >
          <span className="catalog-price-range__label">Цена, ₽</span>
          <label className="visually-hidden" htmlFor={PRICE_MIN_ID}>
            Цена от, ₽
          </label>
          <input
            id={PRICE_MIN_ID}
            type="number"
            inputMode="numeric"
            min="0"
            className="catalog-price-range__input"
            placeholder="от"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
            onBlur={commitPriceRange}
          />
          <span className="catalog-price-range__dash">—</span>
          <label className="visually-hidden" htmlFor={PRICE_MAX_ID}>
            Цена до, ₽
          </label>
          <input
            id={PRICE_MAX_ID}
            type="number"
            inputMode="numeric"
            min="0"
            className="catalog-price-range__input"
            placeholder="до"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
            onBlur={commitPriceRange}
          />
          <button type="submit" className="catalog-price-range__apply">
            OK
          </button>
        </form>

      {hasAnyFilterOption && (
        <div className="catalog-filter-panel">
          <button
            type="button"
            className="catalog-filter-panel__head"
            onClick={() => setIsFilterOpen((v) => !v)}
            aria-controls={filterPanelBodyId}
            aria-expanded={isFilterOpen}
          >
            <span className="catalog-filter-panel__title">
              Все параметры
              {activeFilterCount > 0 && (
                <span className="catalog-filter-panel__badge">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <span
              className={`catalog-filter-panel__chevron${
                isFilterOpen ? ' catalog-filter-panel__chevron--open' : ''
              }`}
              aria-hidden="true"
            >
              &#8679;
            </span>
          </button>

          <div
            id={filterPanelBodyId}
            className="catalog-filter-panel__body"
            hidden={!isFilterOpen}
          >
            {filterOptions.materials.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">Материал жилы</span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.materials.map((mat) => (
                    <button
                      key={mat}
                      type="button"
                      aria-pressed={selectedMaterials.includes(mat)}
                      className={`catalog-filter-tag${
                        selectedMaterials.includes(mat)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('material', mat)}
                    >
                      {mat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterOptions.constructions.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">
                  Исполнение жилы
                </span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.constructions.map((construction) => (
                    <button
                      key={construction}
                      type="button"
                      aria-pressed={selectedConstructions.includes(
                        construction
                      )}
                      className={`catalog-filter-tag${
                        selectedConstructions.includes(construction)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() =>
                        toggleCsvParam('construction', construction)
                      }
                    >
                      {construction}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterOptions.cores.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">Кол-во жил</span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.cores.map((core) => (
                    <button
                      key={core}
                      type="button"
                      aria-pressed={selectedCores.includes(core)}
                      className={`catalog-filter-tag${
                        selectedCores.includes(core)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('cores', core)}
                    >
                      {core}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterOptions.sections.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">Сечение, мм²</span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.sections.map((section) => (
                    <button
                      key={section}
                      type="button"
                      aria-pressed={selectedSections.includes(section)}
                      className={`catalog-filter-tag${
                        selectedSections.includes(section)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('section', section)}
                    >
                      {section.toLocaleString('ru-RU')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filterOptions.voltages.length > 0 && (
              <div className="catalog-filter-row">
                <span className="catalog-filter-row__label">
                  Напряжение, кВ
                </span>
                <div className="catalog-filter-row__tags">
                  {filterOptions.voltages.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={selectedVoltages.includes(v)}
                      className={`catalog-filter-tag${
                        selectedVoltages.includes(v)
                          ? ' catalog-filter-tag--active'
                          : ''
                      }`}
                      onClick={() => toggleCsvParam('voltage', v)}
                    >
                      {formatVoltage(v)}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
      )}

      {!error && (
        <div className="catalog-filter-summary">
          <div className="catalog-filter-panel__sort">
            <label
              className="catalog-filter-panel__sort-label"
              htmlFor={SORT_SELECT_ID}
            >
              Сортировка:
            </label>
            <select
              id={SORT_SELECT_ID}
              value={sortBy}
              onChange={(e) =>
                updateParam(
                  'sort',
                  e.target.value === 'default' ? '' : e.target.value
                )
              }
              className="catalog-sidebar__select catalog-filter-panel__sort-select"
            >
              <option value="default">По умолчанию</option>
              <option value="price-asc">Цена: по возрастанию</option>
              <option value="price-desc">Цена: по убыванию</option>
              <option value="title-asc">По названию</option>
              <option value="popular">По наличию</option>
            </select>
          </div>
          <div className="catalog-filter-panel__results">
            {isLoading ? (
              'Загружаем...'
            ) : (
              <>
                Найдено: <strong>{resultCount}</strong> товаров
              </>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div className="catalog-empty">{error}</div>
      ) : isLoading ? (
        <div className="catalog-empty">Подготавливаем товары из прайса...</div>
      ) : resultCount > 0 ? (
        <>
          <div
            id="catalog-grid"
            className="catalog-grid-anchor"
            aria-hidden="true"
          />
          <h2 className="visually-hidden">Товары каталога</h2>
          <div className="products-grid products-grid--catalog">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
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
                  <span key={`dots-${i}`} className="catalog-pagination__dots">
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
    </>
  );
}
