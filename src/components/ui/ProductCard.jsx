import { addCableImagePreviewQuery } from '../../lib/cableImagePreview.js';
import { getProductPurchaseItem } from '../../../shared/productOffers.js';
import { getProductReferenceSpecs } from '../../../shared/productReferenceSpecs.js';
import { getCartQuantityLimit } from '../../lib/cartQuantity.js';
import ResponsiveProductImage from './ResponsiveProductImage.jsx';
import { formatManufacturerTitle } from '../../../shared/manufacturerTitle.js';
// Файл рендерит товарную карточку каталога с ценой, статусом, действиями корзины и ссылкой на товар.

import { Link } from 'react-router-dom';
import { useState } from 'react';
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
} from '../../../shared/productImagePresentation.js';
import '../../styles/sections/product-card.css';

function formatStockLabel(product) {
  const stockValue = product.stock.toLocaleString('ru-RU');
  return product.unit ? `${stockValue} ${product.unit}` : stockValue;
}

export default function ProductCard({ product, variant = 'default' }) {
  const availableOffers = (product.offers || []).filter(
    (offer) => Number(offer.stock) > 0
  );
  const cheapestOffer = [
    ...(availableOffers.length ? availableOffers : product.offers || []),
  ].sort(
    (a, b) =>
      (Number(a.price) > 0 ? Number(a.price) : Infinity) -
      (Number(b.price) > 0 ? Number(b.price) : Infinity)
  )[0];
  const purchaseProduct = getProductPurchaseItem(product, cheapestOffer?.id);
  const [requestedQuantity, setRequestedQuantity] = useState('1');
  const addItem = useCartStore((state) => state.addItem);
  const quantity = useCartStore(
    (state) =>
      state.items.find((item) => item.id === purchaseProduct.id)?.quantity || 0
  );
  const updateItemQuantity = useCartStore((state) => state.updateItemQuantity);
  const decreaseItem = useCartStore((state) => state.decreaseItem);
  const isStockVariant = variant === 'stock';
  const productUrl = addCableImagePreviewQuery(`/product/${product.slug}`);
  const stockLabel = `В наличии: ${formatStockLabel(product)}`;
  const stockSubtitle = stockLabel;
  const catalogStockLabel = stockLabel;
  const isInStock = product.inStock ?? product.stock > 0;
  const statusLabel = isInStock ? 'В наличии' : 'Под заказ';
  const shippingLabel = 'Отгрузка: 1–2 дня';
  const badges = [];

  if (!isStockVariant && product.stock >= 500) {
    badges.push('Хит');
  }

  const productPrice = formatProductPrice(product.price, product.unit, {
    context: 'request',
  });
  const priceValue = `${product.priceVaries && productPrice.hasPrice ? 'от ' : ''}${productPrice.value}`;
  const priceUnitLabel = productPrice.unitLabel;
  const productImage = getProductImage(product);
  const productImageAlt = getProductImageAlt(product);
  const brand = product.brand || product.manufacturer || product.catalogBrand;
  const displayTitle = formatManufacturerTitle(product.title, product);
  const catalogSpecs = [
    ...(product.referenceSpecs || getProductReferenceSpecs(product)),
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
          items: [
            {
              ...purchaseProduct,
              quantity:
                quantity || Number(requestedQuantity.replace(',', '.')) || 1,
            },
          ],
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
    addItem({ ...purchaseProduct, quantity: 1 });
  }

  if (variant === 'catalog-list') {
    return (
      <article className="product-card product-card--catalog-list">
        <Link to={productUrl} className="product-card__list-image">
          <ResponsiveProductImage
            variants={product.imageVariants}
            sizes="110px"
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
                  <dt>{label}:</dt>
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
              maxQuantity={getCartQuantityLimit(purchaseProduct)}
              title={displayTitle}
              onIncrease={handleAddToCart}
              onDecrease={() => decreaseItem(purchaseProduct.id)}
              onQuantityChange={(value) =>
                updateItemQuantity(purchaseProduct.id, value)
              }
            />
          ) : (
            <button
              type="button"
              className="product-card__list-cart"
              onClick={handleAddToCart}
              aria-label={
                quantity > 0
                  ? `${displayTitle} в корзине`
                  : `Добавить ${displayTitle} в корзину`
              }
            >
              {quantity > 0 ? 'В корзине' : 'В корзину'}
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
        <ResponsiveProductImage
          variants={product.imageVariants}
          sizes="(max-width: 600px) calc(100vw - 26px), (max-width: 1000px) 45vw, 320px"
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
        {variant === 'catalog-tile' ? (
          <div className="product-card__catalog-order">
            <CartQuantityControl
              quantity={
                quantity || Number(requestedQuantity.replace(',', '.')) || 1
              }
              maxQuantity={getCartQuantityLimit(purchaseProduct)}
              title={displayTitle}
              onQuantityChange={(value) =>
                quantity > 0
                  ? updateItemQuantity(purchaseProduct.id, value)
                  : setRequestedQuantity(String(value))
              }
              onIncrease={() =>
                quantity > 0
                  ? handleAddToCart()
                  : setRequestedQuantity(
                      String(
                        Math.min(
                          getCartQuantityLimit(purchaseProduct),
                          (Number(requestedQuantity.replace(',', '.')) || 1) + 1
                        )
                      )
                    )
              }
              onDecrease={() =>
                quantity > 0
                  ? decreaseItem(purchaseProduct.id)
                  : setRequestedQuantity(
                      String(
                        Math.max(
                          Math.min(1, getCartQuantityLimit(purchaseProduct)),
                          (Number(requestedQuantity.replace(',', '.')) || 1) - 1
                        )
                      )
                    )
              }
            />
            <button
              type="button"
              className={`product-card__secondary${quantity > 0 ? ' product-card__secondary--in-cart' : ''}`}
              disabled={
                quantity > 0 || getCartQuantityLimit(purchaseProduct) <= 0
              }
              onClick={() => {
                const parsed = Number(
                  requestedQuantity.trim().replace(',', '.')
                );
                const amount = Math.min(
                  getCartQuantityLimit(purchaseProduct),
                  Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 1
                );
                setRequestedQuantity(String(amount).replace('.', ','));
                addItem({ ...purchaseProduct, quantity: amount });
              }}
              aria-label={
                quantity > 0
                  ? `${displayTitle} в корзине`
                  : `Добавить ${displayTitle} в корзину`
              }
            >
              {quantity > 0 ? 'В корзине' : 'В корзину'}
            </button>
          </div>
        ) : (
          <CardActions
            isStockVariant={isStockVariant}
            quantity={quantity}
            maxQuantity={getCartQuantityLimit(purchaseProduct)}
            title={displayTitle}
            onDecrease={() => decreaseItem(purchaseProduct.id)}
            onQuantityChange={(value) =>
              updateItemQuantity(purchaseProduct.id, value)
            }
            onAddToCart={handleAddToCart}
            onOpenQuote={handleOpenQuote}
          />
        )}
      </div>
    </article>
  );
}
