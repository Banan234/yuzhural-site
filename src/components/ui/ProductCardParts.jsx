// Файл содержит мелкие части товарной карточки: бейджи, цена, действия и подписи характеристик.

import { Link } from 'react-router-dom';

export function ProductBadges({ badges }) {
  if (badges.length === 0) return null;

  return (
    <div className="product-card__badges">
      {badges.map((badge) => (
        <span key={badge} className="product-card__badge">
          {badge}
        </span>
      ))}
    </div>
  );
}

export function ProductMeta({ brand, product, isInStock, statusLabel }) {
  return (
    <>
      <div className="product-card__meta">
        <div
          className={`product-card__status ${
            isInStock
              ? 'product-card__status--in-stock'
              : 'product-card__status--out'
          }`}
        >
          {statusLabel}
        </div>
      </div>
      <div className="product-card__category">{product.category}</div>
      {brand && (
        <div className="product-card__manufacturer">Производитель: {brand}</div>
      )}
    </>
  );
}

export function ProductTitle({ productUrl, title }) {
  return (
    <h3 className="product-card__title">
      <Link to={productUrl} className="product-card__title-link">
        {title}
      </Link>
    </h3>
  );
}

export function ProductSummary({
  isStockVariant,
  stockSubtitle,
  catalogStockLabel,
  shippingLabel,
  description,
}) {
  if (isStockVariant) {
    return <p className="product-card__subtitle">{stockSubtitle}</p>;
  }

  return (
    <>
      <div className="product-card__supply">
        <p className="product-card__stock-note">{catalogStockLabel}</p>
        <p className="product-card__lead-time-note">{shippingLabel}</p>
      </div>
      <p className="product-card__description">{description}</p>
    </>
  );
}

function PriceRow({ priceValue, priceUnitLabel }) {
  return (
    <div className="product-card__price-row">
      <div className="product-card__price">{priceValue}</div>
      {priceUnitLabel && (
        <div className="product-card__unit">{priceUnitLabel}</div>
      )}
    </div>
  );
}

export function CardPrice({ isStockVariant, priceValue, priceUnitLabel }) {
  if (isStockVariant) {
    return <PriceRow priceValue={priceValue} priceUnitLabel={priceUnitLabel} />;
  }

  return (
    <div className="product-card__price-block">
      <div className="product-card__price-label">Цена</div>
      <PriceRow priceValue={priceValue} priceUnitLabel={priceUnitLabel} />
    </div>
  );
}

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function CartIconButton({ addedToCart, onClick }) {
  const label = addedToCart ? 'Добавлено в корзину' : 'Добавить в корзину';

  return (
    <button
      className={`product-card__icon-button${
        addedToCart ? ' product-card__icon-button--added' : ''
      }`}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <CartIcon />
    </button>
  );
}

export function CardActions({
  isStockVariant,
  addedToCart,
  onAddToCart,
  onOpenQuote,
}) {
  if (isStockVariant) {
    return (
      <div className="product-card__actions">
        <button
          className="product-card__cta"
          type="button"
          onClick={onAddToCart}
        >
          {addedToCart ? '✓ В списке КП' : 'В список КП'}
        </button>
      </div>
    );
  }

  return (
    <div className="product-card__buttons">
      <button
        className="product-card__primary-cta"
        type="button"
        onClick={onOpenQuote}
      >
        Получить КП
      </button>

      <div className="product-card__utility-row">
        <button
          className={`product-card__secondary${
            addedToCart ? ' product-card__secondary--added' : ''
          }`}
          type="button"
          onClick={onAddToCart}
        >
          {addedToCart ? '✓ В корзине' : 'В корзину'}
        </button>
      </div>
    </div>
  );
}
