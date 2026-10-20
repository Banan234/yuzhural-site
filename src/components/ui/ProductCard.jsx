// Файл рендерит товарную карточку каталога с ценой, статусом, действиями корзины и ссылкой на товар.

import { Link } from 'react-router-dom';
import { useCartStore } from '../../store/useCartStore';
import {
  CardActions,
  CardPrice,
  CartQuantityControl,
  ProductBadges,
  ProductMeta,
  ProductSummary,
  ProductTitle,
} from './ProductCardParts';
import { formatProductPrice } from '../../lib/productPrice';
import {
  getProductImage,
  getProductImageAlt,
} from '../../../shared/productImages.js';
import '../../styles/sections/product-card.css';

function formatStockLabel(product) {
  const stockValue = product.stock.toLocaleString('ru-RU');
  return product.unit ? `${stockValue} ${product.unit}` : stockValue;
}

export default function ProductCard({ product, variant = 'default' }) {
  const addItem = useCartStore((state) => state.addItem);
  const quantity = useCartStore(
    (state) => state.items.find((item) => item.id === product.id)?.quantity || 0
  );
  const decreaseItem = useCartStore((state) => state.decreaseItem);
  const isStockVariant = variant === 'stock';
  const productUrl = `/product/${product.slug}`;
  const stockLabel = `В наличии: ${formatStockLabel(product)}`;
  const stockSubtitle = stockLabel;
  const catalogStockLabel = stockLabel;
  const isInStock = product.inStock ?? product.stock > 0;
  const statusLabel = isInStock ? 'В наличии' : 'Под заказ';
  const shippingLabel = isInStock
    ? product.stock >= 100
      ? 'Отгрузка: сегодня'
      : 'Отгрузка: 1-2 дня'
    : 'Отгрузка: под заказ';
  const badges = [];

  if (!isStockVariant && product.stock >= 500) {
    badges.push('Хит');
  }

  const productPrice = formatProductPrice(product.price, product.unit, {
    context: 'request',
  });
  const priceValue = productPrice.value;
  const priceUnitLabel = productPrice.unitLabel;
  const productImage = getProductImage(product);
  const productImageAlt = getProductImageAlt(product);
  const brand = product.brand || product.manufacturer || product.catalogBrand;
  const displayTitle = (() => {
    if (!brand) return product.title;
    const upper = product.title.toUpperCase();
    const brandUp = brand.toUpperCase();
    if (upper.startsWith(brandUp + '-') || upper.startsWith(brandUp + ' ')) {
      return product.title.slice(brand.length + 1).trim();
    }
    return product.title;
  })();
  const catalogSpecs = [
    product.cores != null && {
      label: 'Количество жил',
      value: product.cores.toLocaleString('ru-RU'),
    },
    product.crossSection != null && {
      label: 'Сечение',
      value: `${Number(product.crossSection).toLocaleString('ru-RU')} мм²`,
    },
    product.screenCrossSection != null && {
      label: 'Сечение экрана',
      value: `${Number(product.screenCrossSection).toLocaleString('ru-RU')} мм²`,
    },
    product.concentricConductorCrossSection != null && {
      label: 'Сечение концентрического проводника',
      value: `${Number(product.concentricConductorCrossSection).toLocaleString('ru-RU')} мм²`,
    },
    product.doubleInsulationThickness != null && {
      label: 'Удвоенная толщина изоляции',
      value: `${Number(product.doubleInsulationThickness).toLocaleString('ru-RU')} мм`,
    },
    product.opticalFiberCoreDiameter != null && {
      label: 'Диаметр сердцевины волокна',
      value: `${Number(product.opticalFiberCoreDiameter).toLocaleString('ru-RU')} мкм`,
    },
    product.opticalFiberCladdingDiameter != null && {
      label: 'Диаметр оболочки волокна',
      value: `${Number(product.opticalFiberCladdingDiameter).toLocaleString('ru-RU')} мкм`,
    },
    product.conductorStrandCount != null && {
      label: 'Проволок в жиле',
      value: Number(product.conductorStrandCount).toLocaleString('ru-RU'),
    },
    product.voltage != null && {
      label: 'Напряжение',
      value: `${product.voltage} кВ`,
    },
    brand && { label: 'Производитель', value: brand },
    product.conductorConfiguration && {
      label: 'Конфигурация жил',
      value: product.conductorConfiguration,
    },
  ].filter(Boolean);

  function handleOpenQuote() {
    window.dispatchEvent(
      new CustomEvent('open-quote-modal', {
        detail: {
          title: 'Получить КП',
          subtitle:
            'Оставьте телефон — уточним наличие и подготовим предложение по позиции.',
          submitLabel: 'Получить КП',
          comment: `Интересует ${displayTitle}${product.sku ? `, SKU: ${product.sku}` : ''}`,
          source: 'Карточка товара',
        },
      })
    );
  }

  function handleAddToCart() {
    addItem({ ...product, quantity: 1 });
  }

  if (variant === 'catalog-list') {
    return (
      <article className="product-card product-card--catalog-list">
        <Link to={productUrl} className="product-card__list-image">
          <img
            src={productImage}
            alt={productImageAlt}
            width="140"
            height="90"
            loading="lazy"
            decoding="async"
          />
        </Link>

        <div className="product-card__list-main">
          <ProductTitle productUrl={productUrl} title={displayTitle} />
          <div className="product-card__list-meta">
            <span
              className={`product-card__list-stock${
                isInStock ? ' product-card__list-stock--available' : ''
              }`}
            >
              {stockLabel}
            </span>
            {product.sku && <span>Арт. {product.sku}</span>}
          </div>
          {catalogSpecs.length > 0 && (
            <dl className="product-card__list-specs">
              {catalogSpecs.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="product-card__list-aside">
          <CardPrice
            isStockVariant={false}
            priceValue={priceValue}
            priceUnitLabel={priceUnitLabel}
          />
          {quantity > 0 ? (
            <CartQuantityControl
              quantity={quantity}
              title={displayTitle}
              onIncrease={handleAddToCart}
              onDecrease={() => decreaseItem(product.id)}
            />
          ) : (
            <button
              type="button"
              className="product-card__list-cart"
              onClick={handleAddToCart}
              aria-label={`Добавить ${displayTitle} в корзину`}
            >
              В корзину
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`product-card${isStockVariant ? ' product-card--stock' : ''}`}
    >
      <Link to={productUrl} className="product-card__image-link">
        {!isStockVariant && <ProductBadges badges={badges} />}
        <img
          src={productImage}
          alt={productImageAlt}
          className="product-card__image"
          width="560"
          height="320"
          loading="lazy"
          decoding="async"
        />
      </Link>

      <div className="product-card__body">
        {!isStockVariant && (
          <ProductMeta
            brand={brand}
            product={product}
            isInStock={isInStock}
            statusLabel={statusLabel}
          />
        )}

        <ProductTitle productUrl={productUrl} title={displayTitle} />
        <ProductSummary
          isStockVariant={isStockVariant}
          stockSubtitle={stockSubtitle}
          catalogStockLabel={catalogStockLabel}
          shippingLabel={shippingLabel}
          description={product.shortDescription}
        />
        <CardPrice
          isStockVariant={isStockVariant}
          priceValue={priceValue}
          priceUnitLabel={priceUnitLabel}
        />
        <CardActions
          isStockVariant={isStockVariant}
          quantity={quantity}
          title={displayTitle}
          onDecrease={() => decreaseItem(product.id)}
          onAddToCart={handleAddToCart}
          onOpenQuote={handleOpenQuote}
        />
      </div>
    </article>
  );
}
