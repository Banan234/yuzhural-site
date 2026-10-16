// Главная страница: каталог, быстрый поиск и заявка на расчёт по спецификации.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Container from '../components/ui/Container';
import CallbackButton from '../components/forms/CallbackButton';
import CategoryShowcase from '../components/home/CategoryShowcase';
import StockProductsGrid from '../components/home/StockProductsGrid';
import { fetchFeaturedProducts } from '../lib/productsApi';
import { captureException } from '../lib/errorTracking';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { usePrerenderData } from '../lib/prerenderData';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import { messages } from '../../shared/messages.js';
import {
  SITE_MANUFACTURERS,
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
  { icon: 'truck', title: 'Доставка', detail: 'по всей России' },
  { icon: 'shield', title: 'Документы', detail: 'к поставке' },
  { icon: 'box', title: 'Наличие', detail: 'проверим перед КП' },
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
        setProducts(await fetchFeaturedProducts(10, controller.signal));
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
              Кабель для вашего проекта — с расчётом в рабочий день
            </h1>
            <p className="home-concept__hero-lead">
              Подберём марки и аналоги, уточним наличие, цену и срок поставки.
            </p>
            <div className="home-concept__hero-actions">
              <Link
                to={CATALOG_CANONICAL_PATH}
                className="home-concept__button home-concept__button--orange"
              >
                Перейти в каталог <span aria-hidden="true">→</span>
              </Link>
              <a
                href="/specification/"
                className="home-concept__button home-concept__button--outline"
              >
                Отправить спецификацию
              </a>
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
              <h2 id="home-quote-title">Пришлите список — подготовим КП</h2>
              <p>
                Марки, сечения и метраж — текстом, в Excel или PDF. Подберём
                аналоги, уточним наличие, цену и срок поставки.
              </p>
              <div
                className="home-concept__formats"
                aria-label="Форматы спецификации"
              >
                <span>Excel</span>
                <span>PDF</span>
                <span>Текст</span>
              </div>
              <div className="home-concept__quote-actions">
                <a
                  href="/specification/"
                  className="home-concept__button home-concept__button--orange"
                >
                  Отправить спецификацию <span aria-hidden="true">→</span>
                </a>
                <CallbackButton source="Заказ звонка: блок заявки на главной" />
              </div>
            </div>
            <div
              className="home-concept__quote-illustration"
              aria-hidden="true"
            >
              <div className="home-concept__paper">
                <strong>Спецификация</strong>
                <span>
                  Марка <i>Сечение</i> <i>Метраж</i>
                </span>
                <span>
                  ВВГнг(А)-LS <i>4×25</i> <i>500 м</i>
                </span>
                <span>
                  КВВГ <i>7×1,5</i> <i>300 м</i>
                </span>
                <span>
                  ПВС <i>3×1,5</i> <i>200 м</i>
                </span>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="home-concept__trust" aria-label="Условия работы">
        <Container>
          <div className="home-concept__trust-grid">
            <Link to="/about/">
              <FactIcon name="shield" />
              <span>
                <strong>Документы к поставке</strong>
                <small>Реквизиты и условия работы</small>
              </span>
              <b aria-hidden="true">→</b>
            </Link>
            <Link to={CATALOG_CANONICAL_PATH}>
              <FactIcon name="box" />
              <span>
                <strong>Подбор по наличию</strong>
                <small>Проверим остатки и сроки</small>
              </span>
              <b aria-hidden="true">→</b>
            </Link>
            <Link to="/delivery/">
              <FactIcon name="truck" />
              <span>
                <strong>Доставка по России</strong>
                <small>Условия и способы отгрузки</small>
              </span>
              <b aria-hidden="true">→</b>
            </Link>
          </div>
        </Container>
      </section>

      <section
        className="home-concept__manufacturers"
        aria-labelledby="home-manufacturers-title"
      >
        <Container>
          <div className="home-concept__section-head">
            <h2 id="home-manufacturers-title">Производители в прайсе</h2>
            <a href="/price.xls" download>
              Скачать прайс-лист <span aria-hidden="true">→</span>
            </a>
          </div>
          <ul>
            {SITE_MANUFACTURERS.slice(0, 7).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Container>
      </section>
    </div>
  );
}
