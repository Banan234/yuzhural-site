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
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_REQUISITES,
  SITE_URL,
  SITE_WORKING_HOURS_DISPLAY,
  buildOrganizationJsonLd,
} from '../lib/siteConfig';
import '../styles/sections/home-critical.css';

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

  const specificationEmailHref = `${SITE_EMAIL_HREF}?subject=${encodeURIComponent('Расчёт кабеля по спецификации')}&body=${encodeURIComponent('Здравствуйте! Прошу рассчитать кабель по приложенной спецификации.\n')}`;

  return (
    <>
      <div className="home-hero-zone">
        <section className="home-hero">
          <picture className="home-hero__bg" aria-hidden="true">
            <img
              src="/home-hero-quote.webp"
              alt=""
              width="1672"
              height="941"
              fetchpriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>
          <Container>
            <div className="home-hero__content">
              <p className="home-hero__eyebrow">Расчёт по вашей спецификации</p>
              <h1
                className="home-hero__title"
                aria-label="Пришлите список — пришлём КП"
              >
                Пришлите список&nbsp;— пришлём КП
              </h1>
              <p className="home-hero__subtitle">
                Марки, сечения и метраж — текстом, в Excel или PDF. Подберём
                аналоги, если нужной марки нет, и пришлём цены со сроками.
              </p>
              <div className="home-hero__actions">
                <a
                  href={specificationEmailHref}
                  className="home-hero__btn-primary"
                >
                  Отправить спецификацию
                </a>
                <button
                  type="button"
                  className="home-hero__btn-secondary"
                  onClick={openQuoteModal}
                >
                  <svg
                    width="19"
                    height="16"
                    viewBox="0 0 19 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="17"
                      height="14"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="m2 3 7.5 5.5L17 3"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Запросить КП
                </button>
              </div>
            </div>
          </Container>
        </section>

        <nav className="home-benefits" aria-label="Возможности поставки">
          <Container>
            <ol className="home-benefits__list">
              <li className="home-benefits__item">
                <Link
                  to={CATALOG_CANONICAL_PATH}
                  className="home-benefits__link"
                >
                  <span>01</span> Ассортимент
                </Link>
              </li>
              <li className="home-benefits__item">
                <Link to="/about/" className="home-benefits__link">
                  <span>02</span> ГОСТ и паспорт
                </Link>
              </li>
              <li className="home-benefits__item home-benefits__item--active">
                <button
                  type="button"
                  className="home-benefits__link"
                  onClick={openQuoteModal}
                >
                  <span>03</span> Быстрое КП
                </button>
              </li>
              <li className="home-benefits__item">
                <Link to="/delivery/" className="home-benefits__link">
                  <span>04</span> Доставка
                </Link>
              </li>
              <li className="home-benefits__item">
                <a
                  href={specificationEmailHref}
                  className="home-benefits__link"
                >
                  <span>05</span> Под объект
                </a>
              </li>
            </ol>
          </Container>
        </nav>
      </div>

      <section className="home-hero-facts" aria-label="Коротко о работе">
        <Container>
          <div className="home-hero-facts__grid">
            <div className="home-hero-facts__item">
              <span className="home-hero-facts__label">Каталог</span>
              <strong>Кабель и провод</strong>
              <span>Подбор по марке и сечению</span>
            </div>
            <div className="home-hero-facts__item">
              <span className="home-hero-facts__label">
                Коммерческое предложение
              </span>
              <strong>В рабочий день</strong>
              <span>Цены, наличие и сроки</span>
            </div>
            <div className="home-hero-facts__item">
              <span className="home-hero-facts__label">Отгрузка</span>
              <strong>От 1 дня</strong>
              <span>Поставки по всей России</span>
            </div>
            <a
              className="home-hero-facts__item home-hero-facts__item--link"
              href="/price.xls"
              download
            >
              <span className="home-hero-facts__label">Прайс-лист</span>
              <strong>Скачать XLS</strong>
              <span>Посмотреть позиции и цены →</span>
            </a>
          </div>
        </Container>
      </section>

      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />

      <CategoryShowcase />

      <section
        className="home-quote-section"
        aria-label="Запросить расчёт кабеля"
      >
        <Container>
          <div className="home-quote-section__inner">
            <div className="home-quote-section__copy">
              <span className="home-quote-section__eyebrow">Нужен расчёт?</span>
              <h2>Подберём кабель под вашу задачу</h2>
              <p>
                Оставьте телефон и марки кабеля — подготовим предложение{' '}
                {SITE_QUOTE_RESPONSE_DISPLAY}.
              </p>
            </div>
            <div className="home-hero-zone__form">
              <HeroLeadForm
                subtitle={`Ответим ${SITE_QUOTE_RESPONSE_DISPLAY}`}
                source="Форма на главной"
                idPrefix="home-lead"
              />
            </div>
          </div>
        </Container>
      </section>

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
