// Файл отвечает за выпадающее меню каталога в шапке и навигацию по группам категорий.

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CATALOG_MENU, CATALOG_SECTIONS } from './catalogMenuData';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';

const CATALOG_DROPDOWN_ID = 'catalog-dropdown';

export default function HeaderCatalogMenu() {
  const location = useLocation();
  const isCatalogPage = location.pathname.startsWith('/catalog');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isCatalogPinnedOpen, setIsCatalogPinnedOpen] = useState(false);
  const [activeCatalogIndex, setActiveCatalogIndex] = useState(0);
  const catalogCloseTimeoutRef = useRef(null);
  const catalogWrapperRef = useRef(null);
  const activeCatalogGroup =
    CATALOG_MENU[activeCatalogIndex] || CATALOG_MENU[0];
  const activeCatalogSection = CATALOG_SECTIONS.find((section) =>
    section.groups.includes(activeCatalogGroup)
  );

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

  function pinCatalogMenuOpen() {
    clearCatalogCloseTimeout();
    setIsCatalogPinnedOpen(true);
    setIsCatalogOpen(true);
  }

  useEffect(() => {
    setIsCatalogOpen(false);
    setIsCatalogPinnedOpen(false);
  }, [location.pathname, location.search]);

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
          onClick={pinCatalogMenuOpen}
          aria-controls={isCatalogOpen ? CATALOG_DROPDOWN_ID : undefined}
          aria-expanded={isCatalogOpen}
        >
          <span className="catalog-button__icon" aria-hidden="true">
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
              <div className="catalog-dropdown__sidebar">
                <div className="catalog-dropdown__sections">
                  {CATALOG_SECTIONS.map((section) => (
                    <Link
                      key={section.slug}
                      to={section.to}
                      className={`catalog-dropdown__section ${
                        activeCatalogSection?.slug === section.slug
                          ? 'catalog-dropdown__section--active'
                          : ''
                      }`}
                      onMouseEnter={() =>
                        setActiveCatalogIndex(
                          CATALOG_MENU.indexOf(section.groups[0])
                        )
                      }
                      onFocus={() =>
                        setActiveCatalogIndex(
                          CATALOG_MENU.indexOf(section.groups[0])
                        )
                      }
                      onClick={closeCatalogAfterNavigation}
                    >
                      {section.title}
                    </Link>
                  ))}
                </div>
                {activeCatalogSection?.groups.map((group) => {
                  const index = CATALOG_MENU.indexOf(group);
                  return (
                    <Link
                      key={group.slug}
                      to={group.links[0]?.to || CATALOG_CANONICAL_PATH}
                      className={`catalog-dropdown__sidebar-item ${
                        activeCatalogIndex === index
                          ? 'catalog-dropdown__sidebar-item--active'
                          : ''
                      }`}
                      onMouseEnter={() => setActiveCatalogIndex(index)}
                      onFocus={() => setActiveCatalogIndex(index)}
                      onClick={closeCatalogAfterNavigation}
                    >
                      {group.title}
                    </Link>
                  );
                })}
              </div>

              <div
                key={activeCatalogGroup.slug}
                className="catalog-dropdown__content"
              >
                <div className="catalog-dropdown__group">
                  <div className="catalog-dropdown__group-title">
                    {activeCatalogGroup.title}
                  </div>

                  <div className="catalog-dropdown__group-subtitle">
                    Выберите нужную подкатегорию и перейдите в каталог.
                  </div>

                  <div className="catalog-dropdown__links catalog-dropdown__links--wide">
                    {activeCatalogGroup.links.map((link) => (
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
