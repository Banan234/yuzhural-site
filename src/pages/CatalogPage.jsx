// Файл рендерит страницу каталога с фильтрами, поиском, категориями и списком товаров.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import ProductListingView from '../components/catalog/ProductListingView';
import { fetchProducts } from '../lib/productsApi';
import { captureException } from '../lib/errorTracking';
import { useSEO } from '../hooks/useSEO';
import { useCatalogFilters } from '../hooks/useCatalogFilters';
import { usePrerenderData } from '../lib/prerenderData';
import { toCanonicalSitePath } from '../lib/canonicalPaths.js';
import { russianCountNoun } from '../lib/russianCount.js';
import { messages } from '../../shared/messages.js';
import { NOT_FOUND_SEO, NotFoundPageContent } from './NotFoundPage.jsx';
import catalogCategoriesData from '../../shared/catalogCategories.json';
import { HEATING_CABLE_CATEGORY_SLUG } from '../../shared/heatingCableClassification.js';
import { DATA_CABLE_CATEGORY_SLUG } from '../../shared/dataCableClassification.js';
import {
  CONTROL_CABLE_CATEGORY_SLUG,
  CONTROL_CATEGORY_ALIASES,
} from '../../shared/controlCableClassification.js';
import '../styles/sections/catalog.css';

const CATALOG_PAGE_SIZE = 24;
const CATEGORY_ROUTE_FILTERS = { showAppType: true, showSPE: true };
const POWER_CABLE_CATEGORY_SLUG = 'silovoy-kabel';
const CATALOG_PRERENDER_FILTER_KEYS = [
  'search',
  'mark',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
  'powerGroup',
];

const routeEntryBySlug = {};
const parentByChildSlug = {};
const sectionByRouteSlug = {};
for (const section of catalogCategoriesData.sections) {
  routeEntryBySlug[section.slug] = {
    ...section,
    routeType: 'section',
  };
  sectionByRouteSlug[section.slug] = section;
  for (const cat of section.categories) {
    routeEntryBySlug[cat.slug] = {
      ...cat,
      routeType: 'category',
    };
    sectionByRouteSlug[cat.slug] = section;

    for (const sub of cat.subcategories || []) {
      routeEntryBySlug[sub.slug] = {
        ...sub,
        routeType: 'subcategory',
        parentName: cat.name,
        parentSlug: cat.slug,
      };
      parentByChildSlug[sub.slug] = routeEntryBySlug[cat.slug];
      sectionByRouteSlug[sub.slug] = section;
    }
  }
}

function getPositiveQueryNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function doesCatalogPrerenderDataMatchQuery({
  activeCategoryParam,
  prerenderData,
  productQueryOptions = {},
  expectedPath = '/catalog',
}) {
  if (!prerenderData || prerenderData.path !== expectedPath) return false;
  if (
    activeCategoryParam &&
    expectedPath !== `/catalog/${activeCategoryParam}`
  ) {
    return false;
  }

  const prerenderPagination = prerenderData.meta?.pagination || {};
  const currentPage = getPositiveQueryNumber(productQueryOptions.page, 1);
  const prerenderPage = getPositiveQueryNumber(prerenderPagination.page, 1);
  if (currentPage !== prerenderPage) return false;

  const currentLimit = getPositiveQueryNumber(
    productQueryOptions.limit,
    CATALOG_PAGE_SIZE
  );
  const prerenderLimit = getPositiveQueryNumber(
    prerenderPagination.limit,
    CATALOG_PAGE_SIZE
  );
  if (currentLimit !== prerenderLimit) return false;

  if (productQueryOptions.sort && productQueryOptions.sort !== 'default') {
    return false;
  }

  return CATALOG_PRERENDER_FILTER_KEYS.every(
    (key) => !productQueryOptions[key]
  );
}

export default function CatalogPage() {
  const { slug } = useParams();
  const [catalogSearchParams] = useSearchParams();
  const isCategoryRoute = Boolean(slug);
  const categoryParam = catalogSearchParams.get('category') || '';
  const shouldIncludeAdvancedFilters =
    isCategoryRoute || categoryParam === POWER_CABLE_CATEGORY_SLUG;
  const prerenderData = usePrerenderData();
  const expectedPrerenderPath = isCategoryRoute
    ? `/catalog/${slug}`
    : '/catalog';
  const catalogPrerenderData =
    prerenderData.catalog?.path === expectedPrerenderPath
      ? prerenderData.catalog
      : null;
  const { filters, productQueryOptions, searchQuery, updateParam } =
    useCatalogFilters({
      limit: CATALOG_PAGE_SIZE,
      includeAdvancedFilters: shouldIncludeAdvancedFilters,
    });
  const routeCategory = isCategoryRoute ? routeEntryBySlug[slug] : null;
  const parentCategory = isCategoryRoute
    ? parentByChildSlug[slug] || null
    : null;
  const isMissingCategoryRoute = isCategoryRoute && !routeCategory;
  const hasSubcategories =
    Boolean(routeCategory) &&
    routeCategory.routeType === 'category' &&
    Array.isArray(routeCategory.subcategories) &&
    routeCategory.subcategories.length > 0;
  const selectedCategory = isCategoryRoute ? slug : filters.category;
  const activeCategoryParam =
    CONTROL_CATEGORY_ALIASES[selectedCategory] || selectedCategory;
  const hasMatchingPrerenderData = doesCatalogPrerenderDataMatchQuery({
    activeCategoryParam,
    prerenderData: catalogPrerenderData,
    productQueryOptions,
    expectedPath: expectedPrerenderPath,
  });
  const initialCatalogPrerenderData = hasMatchingPrerenderData
    ? catalogPrerenderData
    : null;

  const [products, setProducts] = useState(
    () => initialCatalogPrerenderData?.items || []
  );
  const [catalogSections, setCatalogSections] = useState(
    () => initialCatalogPrerenderData?.catalogSections || []
  );
  const [productsMeta, setProductsMeta] = useState(
    () => initialCatalogPrerenderData?.meta || {}
  );
  const [isLoading, setIsLoading] = useState(
    () => !initialCatalogPrerenderData
  );
  const [error, setError] = useState('');
  const didUseInitialPrerenderDataRef = useRef(hasMatchingPrerenderData);

  useEffect(() => {
    if (isMissingCategoryRoute) {
      return undefined;
    }

    const controller = new AbortController();
    async function loadProducts({ showLoading = true, showError = true } = {}) {
      try {
        if (showLoading) {
          setIsLoading(true);
        }
        setError('');

        const result = await fetchProducts(controller.signal, {
          ...productQueryOptions,
          category: activeCategoryParam,
        });
        setProducts(result.items);
        setCatalogSections(result.meta?.catalogSections || []);
        setProductsMeta(result.meta || {});
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        captureException(requestError, { source: 'CatalogPage.loadProducts' });
        if (showError) {
          setError(
            requestError.message || messages.errors.productApi.catalogLoadFailed
          );
        }
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    }

    if (hasMatchingPrerenderData) {
      if (didUseInitialPrerenderDataRef.current) {
        return () => controller.abort();
      }

      setProducts(catalogPrerenderData.items || []);
      setCatalogSections(catalogPrerenderData.catalogSections || []);
      setProductsMeta(catalogPrerenderData.meta || {});
      setIsLoading(false);
      setError('');
      didUseInitialPrerenderDataRef.current = true;
      return () => controller.abort();
    }

    didUseInitialPrerenderDataRef.current = false;
    loadProducts();

    return () => controller.abort();
  }, [
    activeCategoryParam,
    catalogPrerenderData,
    hasMatchingPrerenderData,
    isMissingCategoryRoute,
    productQueryOptions,
    searchQuery,
  ]);

  const activeCategory = useMemo(() => {
    if (routeCategory) return routeCategory;
    if (!activeCategoryParam) return null;
    for (const section of catalogSections) {
      const match = section.categories.find(
        (cat) =>
          cat.slug === activeCategoryParam || cat.name === activeCategoryParam
      );
      if (match) return match;
    }
    return null;
  }, [activeCategoryParam, catalogSections, routeCategory]);

  const routeSection = activeCategoryParam
    ? sectionByRouteSlug[activeCategoryParam]
    : null;
  const breadcrumbItems = [
    { label: 'Главная', to: '/' },
    {
      label: 'Каталог',
      ...(isCategoryRoute || activeCategoryParam ? { to: '/catalog/' } : {}),
    },
  ];
  if (routeCategory?.routeType === 'section') {
    breadcrumbItems.push({ label: routeCategory.name });
  } else if (routeCategory) {
    if (routeSection) {
      breadcrumbItems.push({
        label: routeSection.name,
        to: `/catalog/${routeSection.slug}`,
      });
    }
    if (parentCategory) {
      breadcrumbItems.push({
        label: parentCategory.name,
        to: `/catalog/${parentCategory.slug}`,
      });
    }
    breadcrumbItems.push({ label: routeCategory.name });
  } else if (activeCategory) {
    if (routeSection) {
      breadcrumbItems.push({
        label: routeSection.name,
        to: `/catalog/${routeSection.slug}`,
      });
    }
    breadcrumbItems.push({ label: activeCategory.name });
  }

  const pageTitle = activeCategory ? activeCategory.name : 'Каталог продукции';
  const subcategoryCounts = new Map(
    catalogSections
      .flatMap((section) => section.categories)
      .find((category) => category.slug === activeCategoryParam)
      ?.subcategories?.map((subcategory) => [
        subcategory.slug,
        subcategory.count,
      ]) || []
  );
  const visibleCount =
    productsMeta.pagination?.total ?? productsMeta.total ?? products.length;
  const isPowerCableCategory =
    activeCategoryParam === POWER_CABLE_CATEGORY_SLUG ||
    activeCategory?.slug === POWER_CABLE_CATEGORY_SLUG;
  const listingExtraFilters =
    isCategoryRoute || isPowerCableCategory
      ? {
          ...CATEGORY_ROUTE_FILTERS,
          showPowerGroups: isPowerCableCategory,
        }
      : undefined;
  useSEO(
    isMissingCategoryRoute
      ? NOT_FOUND_SEO
      : {
          title: isCategoryRoute
            ? activeCategory
              ? `${activeCategory.name} — купить оптом в Челябинске`
              : 'Каталог'
            : activeCategory
              ? `Каталог: ${activeCategory.name}`
              : 'Каталог продукции',
          description: activeCategory
            ? `Купить ${activeCategory.name.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`
            : 'Каталог кабельной и некабельной продукции. Кабель, провод, арматура и электрооборудование в наличии и под заказ.',
          canonical:
            isCategoryRoute && slug
              ? `/catalog/${slug}`
              : activeCategoryParam
                ? toCanonicalSitePath(
                    `/catalog?category=${encodeURIComponent(activeCategoryParam)}`
                  )
                : toCanonicalSitePath('/catalog'),
        }
  );

  if (isMissingCategoryRoute) {
    return <NotFoundPageContent />;
  }

  return (
    <section
      className={
        isCategoryRoute
          ? 'section'
          : 'section section--dark-soft catalog-section'
      }
    >
      <Container>
        <div className="catalog-page">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="catalog-page__header">
            <h1 className="page-title catalog-page__title">{pageTitle}</h1>
            <p className="catalog-page__subtitle">
              {isLoading ? (
                'Загружаем актуальные позиции из прайса...'
              ) : (
                <>
                  <span className="catalog-page__availability">В наличии</span>{' '}
                  <strong>{visibleCount.toLocaleString('ru-RU')}</strong>{' '}
                  {russianCountNoun(visibleCount, {
                    one: 'позиция',
                    few: 'позиции',
                    many: 'позиций',
                  })}
                  {filters.mark && <> · Марка «{filters.mark}»</>}
                  {' · Отгрузка со склада в Челябинске'}
                </>
              )}
            </p>
          </div>

          <div className="catalog-layout">
            <div className="catalog-main">
              {isCategoryRoute &&
              hasSubcategories &&
              !isPowerCableCategory &&
              activeCategoryParam !== 'provoda' &&
              activeCategoryParam !== HEATING_CABLE_CATEGORY_SLUG &&
              activeCategoryParam !== DATA_CABLE_CATEGORY_SLUG &&
              activeCategoryParam !== CONTROL_CABLE_CATEGORY_SLUG ? (
                <div
                  className={`subcategories-grid${isPowerCableCategory ? ' subcategories-grid--power' : ''}`}
                >
                  {activeCategory.subcategories.map((sub) => (
                    <Link
                      key={sub.slug}
                      to={`/catalog/${sub.slug}`}
                      className="subcategory-card"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="subcategory-card__content">
                        <span className="subcategory-card__name">
                          {sub.name}
                        </span>
                        {sub.description && (
                          <span className="subcategory-card__description">
                            {sub.description}
                          </span>
                        )}
                        {subcategoryCounts.has(sub.slug) && (
                          <span className="subcategory-card__count">
                            Позиций:{' '}
                            {subcategoryCounts
                              .get(sub.slug)
                              .toLocaleString('ru-RU')}
                          </span>
                        )}
                      </span>
                      <span className="subcategory-card__arrow">›</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <ProductListingView
                  products={products}
                  isLoading={isLoading}
                  error={error}
                  scopeKey={activeCategoryParam || 'all'}
                  extraFilters={listingExtraFilters}
                  pagination={productsMeta.pagination}
                  filterOptions={productsMeta.facets}
                />
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
