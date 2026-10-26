import {
  clampCartQuantity,
  getCartQuantityLimit,
} from '../lib/cartQuantity.js';
import { formatManufacturerTitle } from '../../shared/manufacturerTitle.js';
// Файл рендерит карточку товара, характеристики, похожие позиции, действия корзины и SEO.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import ProductCard from '../components/ui/ProductCard';
import ProductSupplyPanel from '../components/purchase/ProductSupplyPanel';
import ProductServiceLinks from '../components/services/ProductServiceLinks';
import ProductDesignation from '../components/catalog/ProductDesignation';
import ProductVariantPicker from '../components/catalog/ProductVariantPicker';
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
  getProductBreadcrumbs,
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
  return formatManufacturerTitle(
    product?.title || product?.fullName || product?.name || product?.mark || '',
    product
  );
}

function SupplyIcon({ type }) {
  const paths = {
    truck: (
      <>
        <path d="M3 5h11v12H3zM14 9h4l3 4v4h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
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
  const [cartFeedback, setCartFeedback] = useState('');
  const [product, setProduct] = useState(() => initialProduct);
  useEffect(() => {
    if (product) setQuantity((value) => clampCartQuantity(product, value));
  }, [product]);
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
      setCartFeedback('');
      setRelatedProducts([]);
      setProduct(initialProduct);
      setIsLoading(false);
      setIsNotFound(false);
      setError('');
      return () => controller.abort();
    }

    setQuantity(1);
    setCartFeedback('');
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
          <Breadcrumbs
            items={[
              { label: 'Главная', to: '/' },
              { label: 'Каталог', to: CATALOG_CANONICAL_PATH },
              { label: 'Товар' },
            ]}
          />
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
          <Breadcrumbs
            items={[
              { label: 'Главная', to: '/' },
              { label: 'Каталог', to: CATALOG_CANONICAL_PATH },
              { label: 'Товар' },
            ]}
          />
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

  const specs = Object.entries(product.specs || {}).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim()
  );
  const summarySpecs = specs
    .filter(([key]) => !/остаток|ед\.\s*изм|марка/i.test(key))
    .slice(0, 5);
  const unit = product.unit || 'шт';
  const totalPrice = formatProductPrice(Number(product.price) * quantity);
  const formatNumber = (value) =>
    Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  function addProductToCart() {
    const added = addItem({ ...product, quantity });
    setCartFeedback(
      added === false
        ? 'В корзине достигнут лимит позиций. Отправьте текущий список на расчёт.'
        : `Добавлено в корзину: ${formatNumber(quantity)} ${unit}`
    );
  }

  return (
    <section className="section product-detail-page">
      <Container>
        <Breadcrumbs items={getProductBreadcrumbs(product)} />
        <header className="product-page__heading">
          <h1 className="page-title">{productTitle}</h1>
          <div className="product-page__meta">
            {product.sku ? <span>Артикул: {product.sku}</span> : null}
            <span>{product.category}</span>
            {manufacturerName ? (
              <span>Производитель: {manufacturerName}</span>
            ) : null}
          </div>
        </header>

        <div className="product-page">
          <div className="product-page__gallery">
            <div className="product-page__media">
              <img
                src={productImage}
                alt={productImageAlt}
                className="product-page__image"
                width="560"
                height="360"
                loading="eager"
                decoding="async"
              />
            </div>
            <p className="product-page__image-note">
              Изображение показывает конструкцию. Внешний вид зависит от
              исполнения и изготовителя.
            </p>
          </div>

          <div className="product-page__parameters">
            <ProductVariantPicker product={product} />
            <h2>Основные характеристики</h2>
            <dl className="product-page__summary">
              {summarySpecs.length ? (
                summarySpecs.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt>Марка</dt>
                  <dd>{product.mark || product.category}</dd>
                </div>
              )}
              {manufacturerName ? (
                <div>
                  <dt>Производитель</dt>
                  <dd>{manufacturerName}</dd>
                </div>
              ) : null}
            </dl>
            <a
              className="product-page__details-link"
              href={
                specs.length
                  ? '#product-specifications'
                  : '#product-description'
              }
            >
              Все характеристики →
            </a>
          </div>

          <aside className="product-page__purchase" aria-label="Заказ товара">
            <div className="product-page__order">
              <div className="product-page__availability">
                <span
                  className="product-page__availability-dot"
                  aria-hidden="true"
                />
                {isProductInStock
                  ? `Остаток в каталоге: ${formatNumber(product.stock || 0)} ${unit}`
                  : 'Под заказ'}
              </div>
              <div className="product-page__price-label">
                {productPrice.hasPrice
                  ? 'Ориентировочная цена'
                  : 'Стоимость поставки'}
              </div>
              <div
                className={`product-page__price${productPrice.hasPrice ? '' : ' product-page__price--request'}`}
              >
                {productPrice.value}
                {productPrice.unitLabel ? (
                  <span className="product-page__unit">
                    {productPrice.unitLabel}
                  </span>
                ) : null}
              </div>
              <p className="product-page__price-note">
                {productPrice.hasPrice
                  ? 'Для предварительного расчёта'
                  : 'Рассчитаем по вашему объёму'}
              </p>
              <label
                className="product-page__quantity-label"
                htmlFor={QUANTITY_INPUT_ID}
              >
                {unit === 'м' ? 'Нужная длина, м' : `Количество, ${unit}`}
              </label>
              <div className="product-qty">
                <button
                  type="button"
                  aria-label="Уменьшить количество товара"
                  aria-controls={QUANTITY_INPUT_ID}
                  onClick={() =>
                    setQuantity((q) =>
                      clampCartQuantity(
                        product,
                        Math.max(0.01, Math.round((q - 1) * 100) / 100)
                      )
                    )
                  }
                >
                  −
                </button>
                <input
                  id={QUANTITY_INPUT_ID}
                  type="number"
                  aria-label="Количество товара"
                  value={quantity}
                  min="0.01"
                  max={getCartQuantityLimit(product)}
                  step={unit === 'м' ? '0.01' : '1'}
                  inputMode={unit === 'м' ? 'decimal' : 'numeric'}
                  onChange={(event) =>
                    setQuantity(
                      clampCartQuantity(
                        product,
                        Math.max(0.01, Number(event.target.value) || 1)
                      )
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Увеличить количество товара"
                  disabled={quantity >= getCartQuantityLimit(product)}
                  aria-controls={QUANTITY_INPUT_ID}
                  onClick={() =>
                    setQuantity((q) =>
                      clampCartQuantity(
                        product,
                        Math.round((q + 1) * 100) / 100
                      )
                    )
                  }
                >
                  +
                </button>
              </div>
              {productPrice.hasPrice ? (
                <div className="product-page__total" aria-live="polite">
                  <span>
                    Сумма за {formatNumber(quantity)} {unit}
                  </span>
                  <strong>{totalPrice.value}</strong>
                </div>
              ) : null}
              <div className="product-page__buttons">
                <button
                  type="button"
                  className="button-primary"
                  onClick={addProductToCart}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Добавить в корзину
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  aria-label="Запросить КП по этой позиции"
                  onClick={openProductQuoteModal}
                >
                  Запросить КП
                </button>
              </div>
              <p className="product-page__order-note">
                Подтвердим наличие, сроки поставки и итоговую стоимость в
                коммерческом предложении.
              </p>
              {cartFeedback ? (
                <div className="product-page__cart-feedback" role="status">
                  {cartFeedback} <Link to="/cart">Перейти в корзину →</Link>
                </div>
              ) : null}
            </div>
            <div className="product-page__conditions">
              <Link to="/delivery/">
                <SupplyIcon type="truck" />
                <div>
                  <strong>Самовывоз со склада</strong>
                  <small>Вашим перевозчиком</small>
                </div>
              </Link>
              <Link to="/contacts/">
                <SupplyIcon type="pin" />
                <div>
                  <strong>Самовывоз в Челябинске</strong>
                  <small>После согласования заказа</small>
                </div>
              </Link>
              <a href="#product-documents">
                <SupplyIcon type="file" />
                <div>
                  <strong>Документы к поставке</strong>
                  <small>Счёт и договор</small>
                </div>
              </a>
            </div>
          </aside>
        </div>

        <nav className="product-page__tabs" aria-label="Информация о товаре">
          {specs.length ? (
            <a href="#product-specifications">Характеристики</a>
          ) : null}
          <a href="#product-description">Описание</a>
          <a href="#product-marking">Расшифровка марки</a>
          <a href="#product-documents">Партия и документы</a>
          <a href="#product-delivery">Получение и оплата</a>
        </nav>

        {specs.length > 0 ? (
          <section id="product-specifications" className="product-details">
            <h2>Технические характеристики</h2>
            <table className="product-specs-table">
              <tbody>
                {specs.map(([key, value]) => (
                  <tr key={key} className="product-specs-table__row">
                    <td className="product-specs-table__label">{key}</td>
                    <td className="product-specs-table__value">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        <section
          id="product-description"
          className="product-details product-page__description"
        >
          <h2>Описание</h2>
          <p>{productDescription}</p>
        </section>
        <div id="product-marking">
          <ProductDesignation product={product} />
        </div>
        <div id="product-documents">
          <ProductSupplyPanel product={product} quantity={quantity} />
        </div>
        <section
          id="product-delivery"
          className="product-details product-page__delivery"
        >
          <h2>Получение и оплата</h2>
          <p>
            Самовывоз со склада в Челябинске: приезжайте самостоятельно или
            закажите забор своей транспортной компанией. Заказ готовим 1–3
            рабочих дня после оплаты. Приезжайте после подтверждения готовности.
          </p>
          <p className="product-page__delivery-time">
            Срок поставки по каталогу: {leadTime}. Подтверждается при заказе.
          </p>
          <div>
            <Link to="/delivery/">Получение заказа →</Link>
            <Link to="/payment/">Способы оплаты →</Link>
          </div>
        </section>
        <section className="product-page__services">
          <h2>Сервисы для этого кабеля</h2>
          <ProductServiceLinks product={product} quantity={quantity} />
        </section>

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
