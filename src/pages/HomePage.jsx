// Главная страница: каталог и заявка по спецификации.
import { useEffect, useRef, useState } from 'react';
import Container from '../components/ui/Container';
import ContactRequestForm from '../components/home/ContactRequestForm';
import HomeWhyUsVariants from '../components/home/HomeWhyUsVariants';
import OrderStepsVariants from '../components/home/OrderStepsVariants';
import CategoryShowcase from '../components/home/CategoryShowcase';
import StockProductsGrid from '../components/home/StockProductsGrid';
import HomeHeroCarousel from '../components/home/HomeHeroCarousel';
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

export default function HomePage() {
  const quoteRef = useRef(null);

  useEffect(() => {
    const section = quoteRef.current;
    if (!section || !window.matchMedia) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      if (motion.matches) {
        section.style.removeProperty('--cable-scroll-x');
        section.style.removeProperty('--cable-scroll-y');
        return;
      }
      const rect = section.getBoundingClientRect();
      const progress = Math.max(
        0,
        Math.min(
          1,
          (window.innerHeight - rect.top) / (window.innerHeight + rect.height)
        )
      );
      section.style.setProperty(
        '--cable-scroll-x',
        `${-180 + progress * 220}px`
      );
      section.style.setProperty('--cable-scroll-y', `${12 - progress * 18}px`);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    motion.addEventListener('change', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      motion.removeEventListener('change', schedule);
      section.style.removeProperty('--cable-scroll-x');
      section.style.removeProperty('--cable-scroll-y');
    };
  }, []);

  useSEO({
    title: 'Кабель оптом в Челябинске',
    description: `Кабель и провод для юридических лиц. Подберём позиции и подготовим коммерческое предложение ${SITE_QUOTE_RESPONSE_DISPLAY}.`,
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

  return (
    <div className="home-concept">
      <HomeHeroCarousel />

      <CategoryShowcase />
      <StockProductsGrid
        products={products}
        isLoading={isLoading}
        loadError={loadError}
      />
      <section
        ref={quoteRef}
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
              <div className="home-concept__quote-visual" aria-hidden="true">
                <img
                  src="/product-images/generated/pvs__3core__jacket-black-pvc.png"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width="1774"
                  height="887"
                />
              </div>
            </div>
            <div className="home-concept__quote-form-card">
              <ContactRequestForm />
            </div>
          </div>
        </Container>
      </section>

      <HomeWhyUsVariants />

      <OrderStepsVariants />

      <section
        className="home-concept__manufacturers"
        aria-labelledby="home-manufacturers-title"
      >
        <Container>
          <div className="home-concept__section-head">
            <h2 id="home-manufacturers-title">Производители в прайсе</h2>
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
