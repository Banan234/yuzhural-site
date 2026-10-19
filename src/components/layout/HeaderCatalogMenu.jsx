// Файл отвечает за выпадающее меню каталога в шапке и навигацию по группам категорий.

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CATALOG_MENU } from './catalogMenuData';
import { fetchProducts } from '../../lib/productsApi.js';

const CATALOG_DROPDOWN_ID = 'catalog-dropdown';

export default function HeaderCatalogMenu() {
  const location = useLocation();
  const isCatalogPage = location.pathname.startsWith('/catalog');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogPinnedOpen, setIsCatalogPinnedOpen] = useState(false);
  const [activeCatalogIndex, setActiveCatalogIndex] = useState(0);
  const [expandedMarks, setExpandedMarks] = useState(false);
  const [facetsBySlug, setFacetsBySlug] = useState({});
  const catalogCloseTimeoutRef = useRef(null);
  const catalogWrapperRef = useRef(null);
  const requestedFacetsRef = useRef(new Set());
  const activeCatalogGroup =
    CATALOG_MENU[activeCatalogIndex] || CATALOG_MENU[0];
  const activeFacets = facetsBySlug[activeCatalogGroup.slug];
  const visibleMarks = expandedMarks
    ? activeCatalogGroup.marks
    : activeCatalogGroup.marks.slice(0, 20);

  function selectCatalogGroup(index) {
    setActiveCatalogIndex(index);
    setExpandedMarks(false);
  }

  function clearCatalogCloseTimeout() {
    if (catalogCloseTimeoutRef.current) {
      clearTimeout(catalogCloseTimeoutRef.current);
      catalogCloseTimeoutRef.current = null;
    }
  }

  function closeCatalogAfterNavigation() {
    clearCatalogCloseTimeout();
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
  }

  function openCatalogMenu() {
    clearCatalogCloseTimeout();
    setIsCatalogOpen(true);
  }

  function closeCatalogMenu() {
    if (isCatalogPinnedOpen) {
      return;
    }

    clearCatalogCloseTimeout();

    catalogCloseTimeoutRef.current = setTimeout(() => {
      setIsCatalogOpen(false);
      catalogCloseTimeoutRef.current = null;
    }, 140);
  }

  function toggleCatalogMenu() {
    clearCatalogCloseTimeout();
    const nextIsOpen = !isCatalogPinnedOpen;
    setIsCatalogPinnedOpen(nextIsOpen);
    setIsCatalogOpen(nextIsOpen);
  }

  useEffect(() => {
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (
      !isCatalogOpen ||
      !activeCatalogGroup ||
      requestedFacetsRef.current.has(activeCatalogGroup.slug)
    ) {
      return undefined;
    }

    const controller = new AbortController();
    const slug = activeCatalogGroup.slug;
    requestedFacetsRef.current.add(slug);
    fetchProducts(controller.signal, { category: slug, limit: 1 })
      .then((result) => {
        setFacetsBySlug((current) => ({
          ...current,
          [slug]: result.meta?.facets || {},
        }));
      })
      .catch(() => {
        requestedFacetsRef.current.delete(slug);
      });

    return () => controller.abort();
  }, [isCatalogOpen, activeCatalogGroup]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        catalogWrapperRef.current &&
        !catalogWrapperRef.current.contains(event.target)
      ) {
        clearCatalogCloseTimeout();
        setIsCatalogOpen(false);
        setIsCatalogPinnedOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        clearCatalogCloseTimeout();
        setIsCatalogOpen(false);
        setIsCatalogPinnedOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      clearCatalogCloseTimeout();
    };
  }, []);

  return (
    <>
      <div
        ref={catalogWrapperRef}
        className="catalog-wrapper"
        onMouseLeave={closeCatalogMenu}
      >
        <button
          type="button"
          className={`catalog-button ${
            isCatalogPage || isCatalogOpen ? 'catalog-button--active' : ''
          }`}
          onMouseEnter={openCatalogMenu}
          onClick={toggleCatalogMenu}
          aria-controls={isCatalogOpen ? CATALOG_DROPDOWN_ID : undefined}
          aria-expanded={isCatalogOpen}
        >
          <span
            className={`catalog-button__icon${isCatalogOpen ? ' catalog-button__icon--open' : ''}`}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
          <span>Каталог</span>
        </button>

        {isCatalogOpen && (
          <>
            <div
              className="catalog-hover-bridge"
              onMouseEnter={openCatalogMenu}
              onMouseLeave={closeCatalogMenu}
            />

            <div
              id={CATALOG_DROPDOWN_ID}
              className="catalog-dropdown"
              onMouseEnter={openCatalogMenu}
              onMouseLeave={closeCatalogMenu}
            >
              <div
                className="catalog-dropdown__sidebar"
                aria-label="Категории каталога"
              >
                {CATALOG_MENU.map((group, index) => (
                  <Link
                    key={group.slug}
                    to={group.to}
                    className={`catalog-dropdown__sidebar-item ${
                      activeCatalogIndex === index
                        ? 'catalog-dropdown__sidebar-item--active'
                        : ''
                    }`}
                    onMouseEnter={() => selectCatalogGroup(index)}
                    onFocus={() => selectCatalogGroup(index)}
                    onClick={closeCatalogAfterNavigation}
                  >
                    <span>{group.title}</span>
                    <span
                      className="catalog-dropdown__arrow"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </Link>
                ))}
              </div>

              <div
                key={activeCatalogGroup.slug}
                className="catalog-dropdown__content"
              >
                <div className="catalog-dropdown__group">
                  <Link
                    to={activeCatalogGroup.to}
                    className="catalog-dropdown__group-title"
                    onClick={closeCatalogAfterNavigation}
                  >
                    {activeCatalogGroup.title}
                    <span aria-hidden="true">›</span>
                  </Link>

                  <div className="catalog-dropdown__columns">
                    {activeCatalogGroup.subcategories.length > 0 && (
                      <div className="catalog-dropdown__column">
                        <h3>Подкатегории</h3>
                        {activeCatalogGroup.subcategories.map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            className="catalog-dropdown__link"
                            onClick={closeCatalogAfterNavigation}
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    )}
                    {visibleMarks.length > 0 && (
                      <div className="catalog-dropdown__column catalog-dropdown__column--marks">
                        <h3>Марки кабеля</h3>
                        <div className="catalog-dropdown__marks">
                          {visibleMarks.map((link) => (
                            <Link
                              key={link.to}
                              to={link.to}
                              className="catalog-dropdown__link"
                              onClick={closeCatalogAfterNavigation}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                        {activeCatalogGroup.marks.length > 20 && (
                          <button
                            type="button"
                            className="catalog-dropdown__more"
                            aria-expanded={expandedMarks}
                            onClick={() => setExpandedMarks((value) => !value)}
                          >
                            {expandedMarks
                              ? 'Свернуть'
                              : `Показать все марки (${activeCatalogGroup.marks.length})`}
                          </button>
                        )}
                      </div>
                    )}
                    {activeFacets?.materials?.filter(
                      (value) => value !== 'не определено'
                    ).length > 0 && (
                      <div className="catalog-dropdown__column">
                        <h3>Материал жилы</h3>
                        {activeFacets.materials
                          .filter((value) => value !== 'не определено')
                          .map((value) => (
                            <Link
                              key={value}
                              to={`${activeCatalogGroup.to}?material=${encodeURIComponent(value)}`}
                              className="catalog-dropdown__link"
                              onClick={closeCatalogAfterNavigation}
                            >
                              {value === 'медь'
                                ? 'Медные'
                                : value === 'алюминий'
                                  ? 'Алюминиевые'
                                  : value}
                            </Link>
                          ))}
                      </div>
                    )}
                    {activeFacets?.cores?.length > 0 && (
                      <div className="catalog-dropdown__column">
                        <h3>По количеству жил</h3>
                        {activeFacets.cores.slice(0, 5).map((value) => (
                          <Link
                            key={value}
                            to={`${activeCatalogGroup.to}?cores=${encodeURIComponent(value)}`}
                            className="catalog-dropdown__link"
                            onClick={closeCatalogAfterNavigation}
                          >
                            {value}{' '}
                            {value === '1'
                              ? 'жила'
                              : Number(value) < 5
                                ? 'жилы'
                                : 'жил'}
                          </Link>
                        ))}
                      </div>
                    )}
                    {activeFacets?.voltages?.length > 0 && (
                      <div className="catalog-dropdown__column">
                        <h3>По напряжению</h3>
                        {activeFacets.voltages.map((value) => (
                          <Link
                            key={value}
                            to={`${activeCatalogGroup.to}?voltage=${encodeURIComponent(value)}`}
                            className="catalog-dropdown__link"
                            onClick={closeCatalogAfterNavigation}
                          >
                            {value} кВ
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {isCatalogPinnedOpen && (
        <button
          type="button"
          className="catalog-page-lock"
          aria-label="Закрыть каталог"
          onClick={() => {
            clearCatalogCloseTimeout();
            setIsCatalogOpen(false);
            setIsCatalogPinnedOpen(false);
          }}
        />
      )}
    </>
  );
}
