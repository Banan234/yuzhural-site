// Файл рендерит блок товаров в наличии на главной странице с карточками и состояниями загрузки.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';
import Container from '../ui/Container';
import ProductCard from '../ui/ProductCard';

const SLIDE_DURATION_MS = 320;

export default function StockProductsGrid({ products, isLoading, loadError }) {
  const trackRef = useRef(null);
  const animationTimeoutRef = useRef(null);
  const cloneKeyRef = useRef(0);
  const [orderedProducts, setOrderedProducts] = useState(products);
  const [renderedProducts, setRenderedProducts] = useState(() =>
    products.map((product) => ({ key: String(product.id), product }))
  );
  const [animationStyles, setAnimationStyles] = useState({});
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setOrderedProducts(products);
    setRenderedProducts(
      products.map((product) => ({ key: String(product.id), product }))
    );
    setAnimationStyles({});
    setIsAnimating(false);
  }, [products]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  function getSlideStep() {
    const track = trackRef.current;

    if (!track) {
      return 0;
    }

    const firstCard = track.querySelector('.product-card--stock');

    if (!firstCard) {
      return 0;
    }

    const cardWidth = firstCard.getBoundingClientRect().width;
    const trackStyles = window.getComputedStyle(track);
    const gap =
      Number.parseFloat(trackStyles.columnGap || trackStyles.gap || '0') || 0;

    return cardWidth + gap;
  }

  function buildRenderedProducts(items) {
    return items.map((product) => ({
      key: String(product.id),
      product,
    }));
  }

  function getCloneKey(prefix, productId) {
    cloneKeyRef.current += 1;
    return `${prefix}-${cloneKeyRef.current}-${productId}`;
  }

  function handleScroll(direction) {
    if (orderedProducts.length <= 1 || isAnimating) {
      return;
    }

    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    const step = getSlideStep();

    if (!step) {
      return;
    }

    setIsAnimating(true);

    if (direction > 0) {
      const [firstProduct, ...restProducts] = orderedProducts;

      setRenderedProducts([
        ...buildRenderedProducts(orderedProducts),
        {
          key: getCloneKey('tail-clone', firstProduct.id),
          product: firstProduct,
        },
      ]);

      setAnimationStyles({
        transform: 'translateX(0)',
        transition: 'none',
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimationStyles({
            transform: `translateX(-${step}px)`,
            transition: `transform ${SLIDE_DURATION_MS}ms ease`,
          });
        });
      });

      animationTimeoutRef.current = setTimeout(() => {
        const nextProducts = [...restProducts, firstProduct];

        setOrderedProducts(nextProducts);
        setRenderedProducts(buildRenderedProducts(nextProducts));
        setAnimationStyles({});
        setIsAnimating(false);
      }, SLIDE_DURATION_MS);

      return;
    }

    const lastProduct = orderedProducts[orderedProducts.length - 1];
    const previousProducts = [lastProduct, ...orderedProducts.slice(0, -1)];

    setRenderedProducts([
      {
        key: getCloneKey('head-clone', lastProduct.id),
        product: lastProduct,
      },
      ...buildRenderedProducts(orderedProducts),
    ]);

    setAnimationStyles({
      transform: `translateX(-${step}px)`,
      transition: 'none',
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimationStyles({
          transform: 'translateX(0)',
          transition: `transform ${SLIDE_DURATION_MS}ms ease`,
        });
      });
    });

    animationTimeoutRef.current = setTimeout(() => {
      setOrderedProducts(previousProducts);
      setRenderedProducts(buildRenderedProducts(previousProducts));
      setAnimationStyles({});
      setIsAnimating(false);
    }, SLIDE_DURATION_MS);
  }

  return (
    <section id="stock-now" className="section home-stock-showcase">
      <Container>
        <div className="home-stock-showcase__head section-head">
          <div>
            <h2 className="section-title section-title--left">
              Товары из каталога
            </h2>
          </div>

          <Link
            to={CATALOG_CANONICAL_PATH}
            className="section-link home-stock-showcase__link"
          >
            Смотреть весь каталог
            <span aria-hidden="true">→</span>
          </Link>
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
          <div className="home-stock-showcase__carousel">
            <button
              type="button"
              className="home-stock-showcase__arrow home-stock-showcase__arrow--prev"
              onClick={() => handleScroll(-1)}
              disabled={orderedProducts.length <= 1}
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
              ref={trackRef}
              className="products-grid products-grid--stock-showcase"
              style={animationStyles}
            >
              {renderedProducts.map(({ key, product }) => (
                <ProductCard key={key} product={product} variant="stock" />
              ))}
            </div>

            <button
              type="button"
              className="home-stock-showcase__arrow home-stock-showcase__arrow--next"
              onClick={() => handleScroll(1)}
              disabled={orderedProducts.length <= 1}
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
