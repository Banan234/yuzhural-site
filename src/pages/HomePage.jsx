// Главная страница: каталог, быстрый поиск и заявка на расчёт по спецификации.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../components/ui/Container';
import ContactRequestForm from '../components/home/ContactRequestForm';
import HomeWhyUsVariants from '../components/home/HomeWhyUsVariants';
import CategoryShowcase from '../components/home/CategoryShowcase';
import StockProductsGrid from '../components/home/StockProductsGrid';
import { HomeFaq } from '../components/home/HomeDetailsSections';
import { fetchFeaturedProducts } from '../lib/productsApi';
import { captureException } from '../lib/errorTracking';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { usePrerenderData } from '../lib/prerenderData';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import { messages } from '../../shared/messages.js';
import { DEFAULT_FEATURED_PRODUCTS_LIMIT } from '../../shared/featuredProducts.js';
import {
  SITE_MANUFACTURERS,
  SITE_MANUFACTURER_LOGOS,
  SITE_NAME,
  SITE_EMAIL_HREF,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_URL,
  buildOrganizationJsonLd,
} from '../lib/siteConfig';
import '../styles/sections/home-concept.css';

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  ...buildOrganizationJsonLd(),
};
const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}${CATALOG_CANONICAL_PATH}?search={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

const quickFacts = [
  { icon: 'truck', title: 'Доставка', detail: 'по России' },
  { icon: 'shield', title: 'Работа с НДС', detail: 'документы к поставке' },
  { icon: 'box', title: 'Самовывоз', detail: 'в Челябинске' },
];

function FactIcon({ name }) {
  if (name === 'truck')
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    );
  if (name === 'shield')
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
      <path d="m3 7 9 4 9-4M12 11v10" />
    </svg>
  );
}

export default function HomePage() {
  useSEO({
    title: 'Кабель оптом в Челябинске',
    description: `Кабель и провод для юридических лиц. Подберём позиции и подготовим коммерческое предложение ${SITE_QUOTE_RESPONSE_DISPLAY}.`,
  });
  useJsonLd('home-organization-json-ld', ORGANIZATION_JSON_LD);
  useJsonLd('home-website-json-ld', WEBSITE_JSON_LD);

  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const prerenderData = usePrerenderData();
  const initialFeaturedProducts = Array.isArray(
    prerenderData.home?.featuredProducts
  )
    ? prerenderData.home.featuredProducts
    : [];
  const hasInitialFeaturedProducts = initialFeaturedProducts.length > 0;
  const [products, setProducts] = useState(initialFeaturedProducts);
  const [isLoading, setIsLoading] = useState(!hasInitialFeaturedProducts);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    if (hasInitialFeaturedProducts) return () => controller.abort();
    async function loadProducts() {
      try {
        setIsLoading(true);
        setLoadError('');
        setProducts(
          await fetchFeaturedProducts(
            DEFAULT_FEATURED_PRODUCTS_LIMIT,
            controller.signal
          )
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          captureException(error, { source: 'HomePage.loadFeatured' });
          setLoadError(messages.errors.home.featuredLoadFailed);
        }
      } finally {
        setIsLoading(false);
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [hasInitialFeaturedProducts]);

  function handleSearch(event) {
    event.preventDefault();
    const query = search.trim();
    if (query)
      navigate(`${CATALOG_CANONICAL_PATH}?search=${encodeURIComponent(query)}`);
  }

  return (
    <div className="home-concept">
      <section className="home-concept__hero" aria-labelledby="home-hero-title">
        <picture className="home-concept__hero-image" aria-hidden="true">
          <source
            media="(max-width: 768px)"
            srcSet="/mobile-hero-cable.webp"
            type="image/webp"
          />
          <img
            src="/home-warehouse-concept.jpg"
            alt=""
            width="1672"
            height="941"
            fetchpriority="high"
            loading="eager"
            decoding="async"
          />
        </picture>
        <Container>
          <div className="home-concept__hero-content">
            <h1 id="home-hero-title">
              Кабель и провод
              <br />
              для вашего проекта
            </h1>
            <p className="home-concept__hero-lead">
              Пришлите спецификацию или список позиций — подберём кабель,
              уточним наличие и рассчитаем стоимость поставки.
            </p>
            <div className="home-concept__hero-actions">
              <a
                href="/specification/"
                className="home-concept__button home-concept__button--orange"
              >
                Отправить спецификацию <span aria-hidden="true">→</span>
              </a>
              <Link
                to={CATALOG_CANONICAL_PATH}
                className="home-concept__button home-concept__button--text"
              >
                Перейти в каталог
              </Link>
            </div>
            <ul className="home-concept__hero-facts">
              {quickFacts.map((fact) => (
                <li key={fact.icon}>
                  <FactIcon name={fact.icon} />
                  <span>
                    <strong>{fact.title}</strong>
                    <small>{fact.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section
        className="home-concept__search-band"
        aria-label="Быстрый поиск по каталогу"
      >
        <Container>
          <div className="home-concept__search-layout">
            <div className="home-concept__search-heading">
              <h2>Быстрый поиск по каталогу</h2>
              <Link className="home-task-link" to="/services/application/">
                Подобрать по задаче →
              </Link>
            </div>
            <form
              onSubmit={handleSearch}
              role="search"
              className="home-concept__search-form"
            >
              <label htmlFor="home-catalog-search" className="visually-hidden">
                Марка или сечение кабеля
              </label>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                id="home-catalog-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Например, ВВГнг(А)-LS 4×25"
              />
              <button type="submit">Найти</button>
            </form>
          </div>
          <p className="home-concept__search-hint">
            Поиск по марке, сечению и названию товара
          </p>
        </Container>
      </section>

      <CategoryShowcase />
      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />
      <section
        className="home-concept__quote"
        aria-labelledby="home-quote-title"
      >
        <Container>
          <div className="home-concept__quote-panel">
            <div className="home-concept__quote-copy">
              <h2 id="home-quote-title">Не тратьте время на поиски</h2>
              <p>Закажите консультацию у менеджера</p>
              <p className="home-concept__quote-description">
                Оставьте заявку — наш менеджер свяжется с вами в течение 15
                минут в рабочее время.
              </p>
              <ContactRequestForm />
            </div>
            <div className="home-concept__quote-visual" aria-hidden="true">
              <img
                src="/product-images/generated/vvg-png__3core.png"
                alt=""
                loading="lazy"
                decoding="async"
                width="1774"
                height="887"
              />
            </div>
          </div>
        </Container>
      </section>

      <HomeWhyUsVariants />

      <section
        className="home-concept__manufacturers"
        aria-labelledby="home-manufacturers-title"
      >
        <Container>
          <div className="home-concept__section-head">
            <h2 id="home-manufacturers-title">Производители</h2>
          </div>
          <ul>
            {SITE_MANUFACTURERS.slice(0, 7).map((name) => {
              const logo = SITE_MANUFACTURER_LOGOS[name];
              return (
                <li key={name}>
                  {logo ? (
                    <>
                      <img
                        className={`home-concept__manufacturer-logo${logo.monochrome ? ' home-concept__manufacturer-logo--monochrome' : ''}`}
                        src={logo.src}
                        alt={logo.alt}
                        width="180"
                        height="54"
                        loading="lazy"
                        decoding="async"
                      />
                      {logo.caption && (
                        <span className="home-concept__manufacturer-caption">
                          {logo.caption}
                        </span>
                      )}
                    </>
                  ) : (
                    name
                  )}
                </li>
              );
            })}
          </ul>
        </Container>
      </section>
      <HomeFaq />
    </div>
  );
}
