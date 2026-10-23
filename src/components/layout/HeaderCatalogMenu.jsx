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
  const catalogContentRef = useRef(null);
  const catalogAimRef = useRef(null);
  const pendingCatalogIndexRef = useRef(null);
  const catalogSwitchTimeoutRef = useRef(null);
  const requestedFacetsRef = useRef(new Set());
  const activeCatalogGroup =
    CATALOG_MENU[activeCatalogIndex] || CATALOG_MENU[0];
  const activeFacets = facetsBySlug[activeCatalogGroup.slug];
  const visibleMarks = expandedMarks
    ? activeCatalogGroup.marks
    : activeCatalogGroup.marks.slice(0, 20);

  function clearCatalogSwitchTimeout() {
    clearTimeout(catalogSwitchTimeoutRef.current);
    catalogSwitchTimeoutRef.current = null;
  }

  function hoverCatalogGroup(index, event) {
    if (index === activeCatalogIndex) {
      clearCatalogSwitchTimeout();
      catalogAimRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const origin = catalogAimRef.current;
    const panel = catalogContentRef.current?.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    // Keep the current group while the pointer crosses the triangle joining
    // its last position to the near corners of the open content panel.
    if (origin && panel && x > origin.x && x < panel.left) {
      const progress = (x - origin.x) / (panel.left - origin.x);
      const top = origin.y + (panel.top - 8 - origin.y) * progress;
      const bottom = origin.y + (panel.bottom + 8 - origin.y) * progress;
      if (y >= top && y <= bottom) {
        pendingCatalogIndexRef.current = index;
        if (!catalogSwitchTimeoutRef.current) {
          catalogSwitchTimeoutRef.current = setTimeout(() => {
            catalogSwitchTimeoutRef.current = null;
            catalogAimRef.current = null;
            setActiveCatalogIndex(pendingCatalogIndexRef.current);
            setExpandedMarks(false);
          }, 300);
        }
        return;
      }
    }
    selectCatalogGroup(index);
  }

  function selectCatalogGroup(index) {
    clearCatalogSwitchTimeout();
    catalogAimRef.current = null;
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
    clearCatalogSwitchTimeout();
    clearCatalogCloseTimeout();
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
  }

  function openCatalogMenu() {
    clearCatalogCloseTimeout();
    setIsCatalogOpen(true);
  }

  function closeCatalogMenu() {
    clearCatalogSwitchTimeout();
    catalogAimRef.current = null;
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
    clearCatalogSwitchTimeout();
    catalogAimRef.current = null;
    clearCatalogCloseTimeout();
    const nextIsOpen = !isCatalogPinnedOpen;
    setIsCatalogPinnedOpen(nextIsOpen);
    setIsCatalogOpen(nextIsOpen);
  }

  useEffect(() => {
    clearCatalogSwitchTimeout();
    catalogAimRef.current = null;
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
        clearCatalogSwitchTimeout();
        catalogAimRef.current = null;
        setIsCatalogOpen(false);
        setIsCatalogPinnedOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        clearCatalogCloseTimeout();
        clearCatalogSwitchTimeout();
        catalogAimRef.current = null;
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
      clearCatalogSwitchTimeout();
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
                    onMouseEnter={(event) => hoverCatalogGroup(index, event)}
                    onMouseMove={(event) => hoverCatalogGroup(index, event)}
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
                ref={catalogContentRef}
                onMouseEnter={() => {
                  clearCatalogSwitchTimeout();
                  catalogAimRef.current = null;
                }}
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
            clearCatalogSwitchTimeout();
            catalogAimRef.current = null;
            setIsCatalogOpen(false);
            setIsCatalogPinnedOpen(false);
          }}
        />
      )}
    </>
  );
}
