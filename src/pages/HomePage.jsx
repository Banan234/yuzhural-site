// Файл рендерит главную страницу: hero, лид-форма, категории, товары в наличии и SEO-блоки.

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Container from '../components/ui/Container';
import CategoryShowcase from '../components/home/CategoryShowcase';
import HeroLeadForm from '../components/home/HeroLeadForm';
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
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_REQUISITES,
  SITE_URL,
  SITE_WORKING_HOURS_DISPLAY,
  buildOrganizationJsonLd,
} from '../lib/siteConfig';
import '../styles/sections/home-critical.css';

const heroBenefits = [
  'Более 6 000 позиций в каталоге',
  'Сертификаты и паспорта на продукцию',
  'Счёт и КП в день обращения',
  'Отгрузка от 1 дня',
];

const audienceSegments = [
  {
    title: 'Строительным компаниям',
    text: 'Закрываем кабельные позиции для объектов, чтобы стройка не вставала из-за сроков поставки.',
  },
  {
    title: 'Подрядчикам',
    text: 'Помогаем быстро подобрать кабель под проект и отправить КП без затяжных согласований.',
  },
  {
    title: 'Снабженцам',
    text: 'Даём понятный расчёт по наличию, срокам и стоимости, чтобы быстрее закрывать заявки внутри компании.',
  },
  {
    title: 'Промышленным предприятиям',
    text: 'Подбираем кабель для производственных задач и регулярных закупок с отгрузкой со склада.',
  },
];
const workflowSteps = [
  {
    number: '01',
    title: 'Заявка',
    text: 'Отправляете список необходимого кабеля.',
  },
  {
    number: '02',
    title: 'КП в рабочий день',
    text: 'Проверяем наличие, подбираем позиции и отправляем коммерческое предложение.',
  },
  {
    number: '03',
    title: 'Отгружаем со склада',
    text: 'Комплектуем заказ и отгружаем со склада.',
    featured: true,
  },
];

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

export default function HomePage() {
  useSEO({
    title: 'Кабель оптом в Челябинске',
    description: `Работаем с юрлицами. Подберём кабель под ваш объект и подготовим коммерческое предложение ${SITE_QUOTE_RESPONSE_DISPLAY}.`,
  });

  useJsonLd('home-organization-json-ld', ORGANIZATION_JSON_LD);
  useJsonLd('home-website-json-ld', WEBSITE_JSON_LD);

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
    void import('../styles/sections/home.css');
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    if (hasInitialFeaturedProducts) {
      return () => controller.abort();
    }

    async function loadProducts() {
      try {
        setIsLoading(true);
        setLoadError('');
        const items = await fetchFeaturedProducts(10, controller.signal);
        setProducts(items);
      } catch (error) {
        if (error.name !== 'AbortError') {
          captureException(error, { source: 'HomePage.loadFeatured' });
          if (!hasInitialFeaturedProducts) {
            setLoadError(messages.errors.home.featuredLoadFailed);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [hasInitialFeaturedProducts]);

  const openQuoteModal = () => {
    window.dispatchEvent(
      new CustomEvent('open-quote-modal', {
        detail: {
          title: 'Получить КП',
          subtitle:
            'Оставьте телефон и комментарий — подготовим предложение по вашей задаче.',
          submitLabel: 'Получить КП',
          source: 'CTA на главной',
        },
      })
    );
  };

  return (
    <>
      <div className="home-hero-zone">
        <section className="home-hero">
          <picture className="home-hero__bg" aria-hidden="true">
            <source
              srcSet="/hero-bg-768.avif 768w, /hero-bg-1024.avif 1024w, /hero-bg-1280.avif 1280w, /hero-bg-1536.avif 1536w"
              sizes="100vw"
              type="image/avif"
            />
            <source
              srcSet="/hero-bg-768.webp 768w, /hero-bg-1024.webp 1024w, /hero-bg-1280.webp 1280w, /hero-bg-1536.webp 1536w"
              sizes="100vw"
              type="image/webp"
            />
            <img
              src="/hero-bg-1280.webp"
              alt=""
              width="1280"
              height="853"
              fetchpriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>
          <Container>
            <div className="home-hero__content">
              <h1 className="home-hero__title">
                Кабель оптом со склада в Челябинске
              </h1>
              <p className="home-hero__subtitle">
                Отгрузка от{' '}
                <span className="home-hero__subtitle-accent">1 дня</span> ·
                Поставки по всей России
                <br />
                КП готовим{' '}
                <span className="home-hero__subtitle-accent">
                  {SITE_QUOTE_RESPONSE_DISPLAY}
                </span>
              </p>
              <div className="home-hero__actions">
                <button
                  type="button"
                  className="home-hero__btn-primary"
                  onClick={openQuoteModal}
                >
                  Запросить КП
                </button>
                <Link
                  to={CATALOG_CANONICAL_PATH}
                  className="home-hero__btn-secondary"
                >
                  Смотреть каталог
                </Link>
              </div>
            </div>
          </Container>
        </section>

        <section className="home-benefits">
          <Container>
            <ul className="home-benefits__list">
              {heroBenefits.map((b) => (
                <li key={b} className="home-benefits__item">
                  <span className="home-benefits__check" aria-hidden="true">
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path
                        d="M1 4.5L4 7.5L10 1.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <div className="home-hero-zone__form">
          <HeroLeadForm
            subtitle={`Ответим ${SITE_QUOTE_RESPONSE_DISPLAY}`}
            source="Форма в герое главной"
            idPrefix="home-lead"
          />
        </div>
      </div>

      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />

      <CategoryShowcase />

      <section className="section section--soft home-workflow">
        <Container>
          <div className="home-workflow__intro">
            <div>
              <div className="home-workflow__eyebrow">Как мы работаем?</div>
              <h2 className="section-title section-title--left">
                От заявки до отгрузки за 1 день
              </h2>
            </div>
            <p className="home-workflow__lead">
              3 шага: заявка, проверка наличия и цены, затем отгрузка со склада
              после оплаты и согласования комплектации.
            </p>
          </div>

          <div className="home-workflow__grid">
            {workflowSteps.map((step) => (
              <article
                key={step.number}
                className={`home-workflow__card${step.featured ? ' home-workflow__card--featured' : ''}`}
              >
                <div className="home-workflow__step">{step.number}</div>
                <h3 className="home-workflow__title">{step.title}</h3>
                <p className="home-workflow__text">{step.text}</p>
              </article>
            ))}
          </div>

          <div className="home-workflow__summary">
            <div className="home-workflow__summary-copy">
              <div className="home-workflow__summary-label">Результат</div>
              <p className="home-workflow__summary-text">
                Получаете готовое коммерческое предложение и необходимый кабель.
              </p>
            </div>
            <button
              type="button"
              className="home-workflow__cta"
              onClick={openQuoteModal}
            >
              Запросить КП
            </button>
          </div>
        </Container>
      </section>

      <section className="section section--dark-soft home-audience">
        <Container>
          <div className="home-audience__head">
            <div className="home-audience__eyebrow">С кем мы работаем?</div>
            <h2 className="section-title section-title--left">
              <span id="audience-segments-title">
                Работаем с теми, кому нужен быстрый и понятный закупочный
                процесс
              </span>
            </h2>
            <p className="home-audience__sub">
              Если у вас горят сроки, нужна ясность по наличию и требуется КП
              без лишней переписки, этот формат работы для вас.
            </p>
          </div>

          <ul className="home-audience__grid">
            {audienceSegments.map((item) => (
              <li key={item.title} className="home-audience__card">
                <h3 className="home-audience__title">{item.title}</h3>
                <p className="home-audience__text">{item.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="section home-proof">
        <Container>
          <div className="home-proof__head">
            <div>
              <div className="home-proof__eyebrow">Проверка до заявки</div>
              <h2 className="section-title section-title--left">
                Реквизиты, адрес и условия работы открыты на сайте
              </h2>
            </div>
          </div>

          <div className="home-proof__grid">
            <article className="home-proof__card">
              <h3 className="home-proof__title">Юридические данные</h3>
              <dl className="home-proof__details">
                <div>
                  <dt>Организация</dt>
                  <dd>{SITE_REQUISITES.fullLegalName}</dd>
                </div>
                <div>
                  <dt>ИНН</dt>
                  <dd>{SITE_REQUISITES.taxId}</dd>
                </div>
                <div>
                  <dt>ОГРН</dt>
                  <dd>{SITE_REQUISITES.registrationNumber}</dd>
                </div>
              </dl>
            </article>

            <article className="home-proof__card">
              <h3 className="home-proof__title">Адрес и режим работы</h3>
              <dl className="home-proof__details">
                <div>
                  <dt>Офис</dt>
                  <dd>{SITE_OFFICE_ADDRESS_DISPLAY}</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>{SITE_WORKING_HOURS_DISPLAY}</dd>
                </div>
              </dl>
            </article>

            <article className="home-proof__card">
              <h3 className="home-proof__title">Производители в прайсе</h3>
              <p className="home-proof__text">
                Работаем с номенклатурой российских и зарубежных производителей:
                {` ${SITE_MANUFACTURERS.slice(0, 7).join(', ')} `}и другими
                позициями из прайс-листа.
              </p>
            </article>
          </div>
        </Container>
      </section>
    </>
  );
}
