import {
  clampCartQuantity,
  getCartQuantityLimit,
} from '../lib/cartQuantity.js';
import {
  calculateQuote,
  formatQuoteMoney,
  getQuoteTotalDisplay,
} from '../../shared/quoteMoney.js';
// Файл рендерит корзину выбранных позиций, изменение количества и переход к запросу КП.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useCartStore } from '../store/useCartStore';
import { useSEO } from '../hooks/useSEO';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import { trackEvent } from '../lib/analytics';
import { expectOkApiJson } from '../lib/apiResponse';
import { captureException } from '../lib/errorTracking';
import { formatProductPrice } from '../lib/productPrice';
import { messages } from '../../shared/messages.js';
import {
  getProductImage,
  getProductImageAlt,
} from '../../shared/productImages.js';
import '../styles/sections/cart-favorites.css';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

export default function CartPage() {
  useSEO({
    title: 'Корзина',
    description:
      'Список кабельно-проводниковой продукции для запроса коммерческого предложения.',
    noindex: true,
  });
  const {
    items: storedItems,
    updateItemQuantity,
    removeItem,
    clearCart,
    syncWithCatalog,
  } = useCartStore();
  const money = calculateQuote(storedItems);
  const items = money.items;
  const [isPdfBuilding, setIsPdfBuilding] = useState(false);
  const pdfBuildingRef = useRef(false);
  const [pdfError, setPdfError] = useState('');
  const [syncNotice, setSyncNotice] = useState(null);
  const syncRanRef = useRef(false);

  async function handleRemoveItem(event, id) {
    const button = event.currentTarget;
    const row = button.closest('.cart-item');
    if (
      !row?.animate ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      removeItem(id);
      return;
    }
    button.disabled = true;
    const animation = row.animate(
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(12px)' },
      ],
      { duration: 220, easing: 'ease-out', fill: 'forwards' }
    );
    try {
      await animation.finished;
    } catch {
      // A cancelled animation must not cancel the requested removal.
    }
    removeItem(id);
    animation.cancel();
  }

  useEffect(() => {
    if (syncRanRef.current) return;
    const catalogIds = items
      .filter((item) => !item.manual)
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (catalogIds.length === 0) {
      syncRanRef.current = true;
      return;
    }
    const controller = new AbortController();
    fetch('/api/products/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: catalogIds }),
      signal: controller.signal,
    })
      .then((response) =>
        expectOkApiJson(response, messages.errors.api.lookupFailed)
      )
      .then((data) => {
        if (controller.signal.aborted) return;
        const summary = syncWithCatalog({
          found: data.found,
          missing: data.missing,
          pending: data.pending,
        });
        syncRanRef.current = true;
        if (
          summary.removed.length > 0 ||
          summary.pending?.length > 0 ||
          summary.priceChanged.length > 0 ||
          summary.slugChanged > 0
        ) {
          setSyncNotice(summary);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        captureException(error, { source: 'CartPage.syncWithCatalog' });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownloadPdf() {
    if (items.length === 0 || pdfBuildingRef.current) return;
    pdfBuildingRef.current = true;
    setPdfError('');
    setIsPdfBuilding(true);
    try {
      const { generateQuotePdf } = await import('../lib/quotePdf.js');
      await generateQuotePdf({ items });
      trackEvent('price-download', {
        items: items.length,
        ...(money.complete ? { total: money.totalPrice } : {}),
        format: 'pdf',
        source: 'cart',
      });
    } catch (error) {
      captureException(error, { source: 'CartPage.buildPdf' });
      setPdfError(error.message || messages.errors.cart.pdfBuildFailed);
    } finally {
      pdfBuildingRef.current = false;
      setIsPdfBuilding(false);
    }
  }

  const positionsCount = items.length;
  const totalLength = items.reduce((sum, item) => {
    if ((item.unit || '').toLowerCase() !== 'м') {
      return sum;
    }

    return sum + Number(item.quantity || 0);
  }, 0);
  const hasRequestPriceItems = money.unknownPriceCount > 0;
  const cartSummaryTotal = getQuoteTotalDisplay(money);

  return (
    <section className="section cart-page">
      <Container>
        <Link to={CATALOG_CANONICAL_PATH} className="cart-page__back">
          <span aria-hidden="true">←</span> Вернуться в каталог
        </Link>
        <div className="cart-page__head">
          <div>
            <h1 className="page-title">Корзина</h1>
          </div>
          {items.length > 0 ? (
            <div className="cart-toolbar">
              <div className="cart-toolbar__actions">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isPdfBuilding}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
                  </svg>
                  {isPdfBuilding ? 'Формируем PDF…' : 'Скачать PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Очистить список для КП? Все позиции будут удалены.'
                      )
                    )
                      clearCart();
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
                  </svg>
                  Очистить корзину
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <svg
              className="cart-empty__icon"
              width="112"
              height="112"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 10h8l10 34h29l7-24H18M22 32h34M34 20v24M46 20v24" />
              <circle cx="28" cy="54" r="4" />
              <circle cx="49" cy="54" r="4" />
            </svg>
            <h2 className="cart-empty__title">Ваша корзина пуста</h2>
            <p className="cart-empty__text">
              Добавьте товары, чтобы отправить список на расчёт.
            </p>
            <Link to={CATALOG_CANONICAL_PATH} className="cart-empty__link">
              Вернуться в каталог
            </Link>
          </div>
        ) : null}

        {syncNotice ? (
          <div className="cart-sync-notice" role="status">
            <strong>Каталог обновился — список актуализирован.</strong>
            <ul>
              {syncNotice.pending?.length > 0 ? (
                <li>Данные уточняются: {syncNotice.pending.length}</li>
              ) : null}
              {syncNotice.removed.length > 0 ? (
                <li>
                  Сняты с поставки и удалены: {syncNotice.removed.length}
                  {syncNotice.removed.length <= 3
                    ? ` (${syncNotice.removed.map((p) => p.title).join(', ')})`
                    : ''}
                </li>
              ) : null}
              {syncNotice.priceChanged.length > 0 ? (
                <li>Обновлены цены: {syncNotice.priceChanged.length}</li>
              ) : null}
              {syncNotice.slugChanged > 0 ? (
                <li>Обновлены ссылки: {syncNotice.slugChanged}</li>
              ) : null}
            </ul>
            <button
              type="button"
              className="cart-sync-notice__dismiss"
              onClick={() => setSyncNotice(null)}
              aria-label="Скрыть уведомление"
            >
              ×
            </button>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            {pdfError ? (
              <div className="field-error" role="alert">
                {pdfError}
              </div>
            ) : null}
            <div className="cart-layout">
              <div className="cart-list">
                <div className="cart-list__head" aria-hidden="true">
                  <span>Товары в корзине · {formatNumber(positionsCount)}</span>
                  <span>Количество</span>
                  <span>Сумма</span>
                  <span />
                </div>
                {items.map((item, index) => {
                  const quantity = Number(item.quantity || 0);
                  const unit = item.unit || 'м';
                  const lineTotalKopecks = money.rows[index].lineKopecks;
                  const itemPrice = formatProductPrice(item.price, unit, {
                    fallback: 'Цена по запросу',
                  });
                  return (
                    <article key={item.id} className="cart-item">
                      <img
                        src={getProductImage(item)}
                        alt={getProductImageAlt(item)}
                        className="cart-item__image"
                        width="104"
                        height="88"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="cart-item__content">
                        {item.sku ? (
                          <div className="cart-item__sku">
                            Артикул: {item.sku}
                          </div>
                        ) : null}
                        <h2 className="cart-item__title">
                          {item.slug ? (
                            <Link
                              to={`/product/${item.slug}`}
                              className="cart-item__title-link"
                            >
                              {item.title}
                            </Link>
                          ) : (
                            <span>{item.title}</span>
                          )}
                        </h2>
                        {item.category ? (
                          <p className="cart-item__category">{item.category}</p>
                        ) : null}
                      </div>
                      <div className="cart-item__quantity">
                        <span className="cart-item__mobile-label">
                          {unit === 'м' ? 'Метраж' : 'Количество'} ({unit})
                        </span>
                        <div className="cart-item__quantity-control">
                          <button
                            type="button"
                            aria-label={`Уменьшить количество: ${item.title}`}
                            disabled={quantity <= 1}
                            onClick={() =>
                              updateItemQuantity(
                                item.id,
                                Math.max(1, Math.ceil(quantity) - 1)
                              )
                            }
                          >
                            −
                          </button>
                          <input
                            key={`${item.id}-${quantity}`}
                            aria-label={`${unit === 'м' ? 'Метраж' : 'Количество'}: ${item.title}`}
                            type="number"
                            min={Math.min(1, getCartQuantityLimit(item))}
                            max={getCartQuantityLimit(item)}
                            step="any"
                            defaultValue={quantity}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value) && value > 0) {
                                updateItemQuantity(item.id, value);
                                event.target.value = String(
                                  clampCartQuantity(item, value)
                                );
                              } else event.target.value = String(quantity);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter')
                                event.currentTarget.blur();
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`Увеличить количество: ${item.title}`}
                            disabled={quantity >= getCartQuantityLimit(item)}
                            onClick={() =>
                              updateItemQuantity(item.id, quantity + 1)
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="cart-item__unit">{unit}</span>
                      </div>
                      <div className="cart-item__price-row">
                        <strong
                          className={`cart-item__line-total${itemPrice.hasPrice ? '' : ' cart-item__line-total--request'}`}
                        >
                          {lineTotalKopecks !== null
                            ? formatQuoteMoney(lineTotalKopecks)
                            : 'По запросу'}
                        </strong>
                        <span className="cart-item__price">
                          {itemPrice.text}
                        </span>
                      </div>
                      <button
                        className="cart-item__remove"
                        type="button"
                        aria-label={`Удалить: ${item.title}`}
                        title="Удалить товар"
                        onClick={(event) => handleRemoveItem(event, item.id)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <path d="m6 6 12 12M6 18 18 6" />
                        </svg>
                      </button>
                    </article>
                  );
                })}
              </div>
              <aside
                className="cart-summary"
                aria-labelledby="cart-summary-title"
              >
                <h2 id="cart-summary-title">Ваш заказ</h2>
                <dl className="cart-summary__counts">
                  <div>
                    <dt>Позиций</dt>
                    <dd>{formatNumber(positionsCount)}</dd>
                  </div>
                  {totalLength > 0 ? (
                    <div>
                      <dt>Общий метраж</dt>
                      <dd>{formatNumber(totalLength)} м</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="cart-summary__total">
                  <span>{cartSummaryTotal.label}</span>
                  <strong key={cartSummaryTotal.value}>
                    {cartSummaryTotal.value}
                  </strong>
                </div>
                <button
                  type="button"
                  className="button-primary cart-summary__quote"
                  aria-label="Запросить коммерческое предложение"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('open-cart-quote-modal')
                    )
                  }
                >
                  Запросить КП <span aria-hidden="true">→</span>
                </button>
                <p className="cart-summary__note">
                  Уточним наличие, сроки поставки и итоговую стоимость в
                  коммерческом предложении.
                </p>
                {hasRequestPriceItems ? (
                  <p className="cart-summary__request-note">
                    {cartSummaryTotal.detail ||
                      'В списке есть позиции без цены. Рассчитаем их при подготовке КП.'}
                  </p>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
      </Container>
    </section>
  );
}
