// Файл рендерит карточку товара, характеристики, похожие позиции, действия корзины и SEO.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductCard from '../components/ui/ProductCard';
import ProductServiceLinks from '../components/services/ProductServiceLinks';
import { fetchProductBySlug, fetchRelatedProducts } from '../lib/productsApi';
import { useCartStore } from '../store/useCartStore';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { trackEvent } from '../lib/analytics';
import { captureException } from '../lib/errorTracking';
import { formatProductPrice } from '../lib/productPrice';
import { usePrerenderData } from '../lib/prerenderData';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import {
  buildProductBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  buildProductMetaTitle,
} from '../lib/productSeo';
import {
  getProductImage,
  getProductImageAlt,
} from '../../shared/productImages.js';
import { messages } from '../../shared/messages.js';
import { NOT_FOUND_SEO, NotFoundPageContent } from './NotFoundPage.jsx';
import '../styles/sections/product-detail.css';

const BREADCRUMB_JSON_LD_ID = 'product-breadcrumb-json-ld';
const PRODUCT_JSON_LD_ID = 'product-product-json-ld';
const QUANTITY_INPUT_ID = 'product-quantity-input';

function getProductDisplayTitle(product) {
  return (
    product?.title || product?.fullName || product?.name || product?.mark || ''
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const prerenderData = usePrerenderData();
  const initialProduct =
    prerenderData.product && prerenderData.product.slug === slug
      ? prerenderData.product
      : null;
  const addItem = useCartStore((state) => state.addItem);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(() => initialProduct);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(() => !initialProduct);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState('');

  useSEO(
    isNotFound
      ? NOT_FOUND_SEO
      : {
          title: product ? buildProductMetaTitle(product) : undefined,
          description: product ? buildProductMetaDescription(product) : '',
          ogType: 'product',
          image: product ? getProductImage(product) : undefined,
          canonical:
            product?.slug || slug ? `/product/${product?.slug || slug}` : false,
        }
  );

  useEffect(() => {
    const controller = new AbortController();

    if (initialProduct) {
      setQuantity(1);
      setRelatedProducts([]);
      setProduct(initialProduct);
      setIsLoading(false);
      setIsNotFound(false);
      setError('');
      return () => controller.abort();
    }

    setQuantity(1);
    setRelatedProducts([]);
    setProduct(null);
    setIsNotFound(false);

    async function load() {
      let item = null;

      try {
        setIsLoading(true);
        setError('');

        item = await fetchProductBySlug(slug, controller.signal);

        setIsNotFound(!item);
        setProduct(item);
        if (item) {
          trackEvent('product-view', {
            sku: item.sku || item.id,
            slug: item.slug,
            mark: item.mark,
            category: item.catalogCategorySlug || item.catalogSectionSlug,
          });
        }
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        if (requestError.status === 404) {
          setIsNotFound(true);
          setProduct(null);
          setRelatedProducts([]);
          setIsLoading(false);
          return;
        }

        captureException(requestError, {
          source: 'ProductPage.loadProduct',
          slug: typeof slug === 'string' ? slug : undefined,
        });
        setError(
          requestError.message || messages.errors.productApi.productLoadFailed
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      if (!item) {
        return;
      }

      try {
        const related = await fetchRelatedProducts(slug, 6, controller.signal);
        setRelatedProducts(related);
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        captureException(requestError, {
          source: 'ProductPage.loadRelatedProducts',
          slug: typeof slug === 'string' ? slug : undefined,
        });
        setRelatedProducts([]);
      }
    }

    load();

    return () => controller.abort();
  }, [initialProduct, slug]);

  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd(product);
  const productJsonLd = buildProductJsonLd(product);

  useJsonLd(BREADCRUMB_JSON_LD_ID, breadcrumbJsonLd);
  useJsonLd(PRODUCT_JSON_LD_ID, productJsonLd);

  if (isLoading) {
    return (
      <section className="section">
        <Container>
          <h1 className="page-title">Загружаем товар</h1>
          <p className="page-subtitle">
            Проверяем актуальные данные из прайса.
          </p>
        </Container>
      </section>
    );
  }

  if (isNotFound) {
    return <NotFoundPageContent />;
  }

  if (!product) {
    return (
      <section className="section">
        <Container>
          <h1 className="page-title">
            {messages.errors.productApi.productNotFound}
          </h1>
          <p className="page-subtitle">
            {error || messages.errors.productApi.productNotFoundDescription}
          </p>
          <Link to={CATALOG_CANONICAL_PATH} className="button-primary">
            {messages.text.backToCatalog}
          </Link>
        </Container>
      </section>
    );
  }

  function openProductQuoteModal() {
    window.dispatchEvent(
      new CustomEvent('open-cart-quote-modal', {
        detail: {
          title: 'Запрос КП по этой позиции',
          description:
            'Заполните форму, и мы подготовим коммерческое предложение по выбранной позиции.',
          items: [{ ...product, quantity }],
        },
      })
    );
  }

  const manufacturerName = String(product.manufacturer || '').trim();
  const productTitle = getProductDisplayTitle(product);
  const productDescription =
    product.description || buildProductMetaDescription(product);
  const productImage = getProductImage(product);
  const productImageAlt = getProductImageAlt(product);
  const isProductInStock =
    typeof product.inStock === 'boolean'
      ? product.inStock
      : Number(product.stock) > 0;
  const leadTime = product.leadTime || 'уточняем';
  const productPrice = formatProductPrice(product.price, product.unit, {
    context: 'request',
  });

  return (
    <section className="section">
      <Container>
        <div className="product-page">
          <div className="product-page__media">
            <img
              src={productImage}
              alt={productImageAlt}
              className="product-page__image"
              width="560"
              height="320"
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="product-page__content">
            <div className="product-page__category">{product.category}</div>
            <h1 className="page-title">{productTitle}</h1>

            <div className="product-page__meta">
              <div>SKU: {product.sku}</div>
              {manufacturerName ? (
                <div>Производитель: {manufacturerName}</div>
              ) : null}
            </div>

            <p className="page-subtitle">{productDescription}</p>
            <ProductServiceLinks product={product} quantity={quantity} />

            <div className="product-page__status-row">
              <span
                className={
                  isProductInStock
                    ? 'product-page__status product-page__status--in-stock'
                    : 'product-page__status product-page__status--out'
                }
              >
                {isProductInStock ? 'В наличии' : 'Под заказ'}
              </span>

              <span className="product-page__lead-time">
                Срок поставки: {leadTime}
              </span>
            </div>

            <div className="product-page__price">{productPrice.value}</div>

            {productPrice.unitLabel ? (
              <div className="product-page__unit">{productPrice.unitLabel}</div>
            ) : null}

            <div className="product-page__buttons">
              <div className="product-qty">
                <button
                  type="button"
                  aria-label="Уменьшить количество товара"
                  aria-controls={QUANTITY_INPUT_ID}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>

                <label className="visually-hidden" htmlFor={QUANTITY_INPUT_ID}>
                  Количество товара
                </label>
                <input
                  id={QUANTITY_INPUT_ID}
                  type="number"
                  value={quantity}
                  min="1"
                  onChange={(event) =>
                    setQuantity(Math.max(1, Number(event.target.value) || 1))
                  }
                />

                <button
                  type="button"
                  aria-label="Увеличить количество товара"
                  aria-controls={QUANTITY_INPUT_ID}
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="button-primary"
                onClick={openProductQuoteModal}
              >
                Запросить КП по этой позиции
              </button>

              <button
                type="button"
                className="button-secondary"
                onClick={() => addItem({ ...product, quantity })}
              >
                Добавить в корзину
              </button>

              <Link to="/cart" className="button-secondary">
                Перейти в корзину
              </Link>
            </div>
          </div>
        </div>

        {product.specs && Object.keys(product.specs).length > 0 && (
          <div className="product-details">
            <div className="product-details__card">
              <h2 className="section-title section-title--left">
                Технические характеристики
              </h2>

              <table className="product-specs-table">
                <tbody>
                  {Object.entries(product.specs).map(([key, value]) => (
                    <tr key={key} className="product-specs-table__row">
                      <td className="product-specs-table__label">{key}</td>
                      <td className="product-specs-table__value">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {relatedProducts.length > 0 ? (
          <div className="related-products">
            <div className="section-head">
              <h2 className="section-title section-title--left">
                Похожие товары
              </h2>
            </div>

            <div className="products-grid">
              {relatedProducts.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
