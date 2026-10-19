// Файл рендерит блок товаров в наличии на главной странице с карточками и состояниями загрузки.

import { useId } from 'react';
import Container from '../ui/Container';
import ProductCard from '../ui/ProductCard';
import useProductCarousel from './useProductCarousel';

export default function StockProductsGrid({ products, isLoading, loadError }) {
  const titleId = useId();
  const trackId = useId();
  const {
    carouselRef,
    viewportRef,
    trackRef,
    items,
    trailingProduct,
    move,
    carouselEvents,
    viewportEvents,
    canScroll,
    visibleCount,
    isAnimating,
  } = useProductCarousel(products, !isLoading && !loadError);

  return (
    <section
      id="stock-now"
      className="section home-stock-showcase"
      aria-labelledby={titleId}
    >
      <Container>
        <div className="home-stock-showcase__head section-head">
          <div>
            <h2 id={titleId} className="section-title section-title--left">
              Товары из каталога
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="catalog-empty catalog-empty--centered">
            Загружаем актуальные позиции...
          </div>
        ) : loadError ? (
          <div className="catalog-empty catalog-empty--centered">
            {loadError}
          </div>
        ) : (
          <div
            ref={carouselRef}
            className="home-stock-showcase__carousel"
            role="group"
            aria-roledescription="карусель"
            aria-label="Товары из каталога"
            tabIndex={canScroll ? 0 : undefined}
            {...carouselEvents}
          >
            <button
              type="button"
              className="home-stock-showcase__arrow home-stock-showcase__arrow--prev"
              onClick={() => move(-1)}
              disabled={!canScroll}
              aria-disabled={isAnimating || !canScroll}
              aria-controls={trackId}
              aria-label="Показать предыдущие товары"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div
              ref={viewportRef}
              className="home-stock-showcase__viewport"
              aria-live="off"
              {...viewportEvents}
            >
              <div
                ref={trackRef}
                id={trackId}
                className="products-grid products-grid--stock-showcase"
              >
                {items.map((product, index) => (
                  <div
                    key={product.id}
                    className="home-stock-showcase__slide"
                    inert={index >= visibleCount ? '' : undefined}
                    aria-hidden={index >= visibleCount ? true : undefined}
                  >
                    <ProductCard product={product} variant="stock" />
                  </div>
                ))}
                {trailingProduct && (
                  <div
                    className="home-stock-showcase__slide"
                    key="transition-tail"
                    inert=""
                    aria-hidden="true"
                  >
                    <ProductCard product={trailingProduct} variant="stock" />
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="home-stock-showcase__arrow home-stock-showcase__arrow--next"
              onClick={() => move(1)}
              disabled={!canScroll}
              aria-disabled={isAnimating || !canScroll}
              aria-controls={trackId}
              aria-label="Показать следующие товары"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </Container>
    </section>
  );
}
