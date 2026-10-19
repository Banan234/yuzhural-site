// Файл рендерит корзину выбранных позиций, изменение количества и переход к запросу КП.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { MAX_CART_ITEMS, useCartStore } from '../store/useCartStore';
import { useSEO } from '../hooks/useSEO';
import { CATALOG_CANONICAL_PATH } from '../lib/canonicalPaths.js';
import { trackEvent } from '../lib/analytics';
import { expectOkApiJson } from '../lib/apiResponse';
import { captureException } from '../lib/errorTracking';
import { formatProductPrice } from '../lib/productPrice';
import { formatMessage, messages } from '../../shared/messages.js';
import {
  getProductImage,
  getProductImageAlt,
} from '../../shared/productImages.js';
import {
  MAX_QUOTE_ITEM_COMMENT_LENGTH,
  MAX_QUOTE_ITEM_TITLE_LENGTH,
} from '../../shared/quoteValidation.js';
import '../styles/sections/cart-favorites.css';

const initialManualItem = {
  mark: '',
  quantity: '',
  unit: 'м',
  comment: '',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function formatCartSummaryTotal(totalPrice, hasRequestPriceItems) {
  if (totalPrice > 0 && hasRequestPriceItems) {
    return `${formatNumber(totalPrice)} ₽ + позиции по запросу`;
  }

  if (totalPrice > 0) {
    return `${formatNumber(totalPrice)} ₽`;
  }

  if (hasRequestPriceItems) {
    return 'Итог будет рассчитан в КП';
  }

  return '0 ₽';
}

export default function CartPage() {
  useSEO({
    title: 'Список для КП',
    description:
      'Список кабельно-проводниковой продукции для запроса коммерческого предложения.',
    noindex: true,
  });
  const {
    items,
    addManualItem,
    updateItemQuantity,
    removeItem,
    clearCart,
    syncWithCatalog,
  } = useCartStore();
  const [manualItem, setManualItem] = useState(initialManualItem);
  const [manualError, setManualError] = useState('');
  const [isPdfBuilding, setIsPdfBuilding] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [syncNotice, setSyncNotice] = useState(null);
  const syncRanRef = useRef(false);

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
    syncRanRef.current = true;
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
        const summary = syncWithCatalog({
          found: data.found,
          missing: data.missing,
        });
        if (
          summary.removed.length > 0 ||
          summary.priceChanged.length > 0 ||
          summary.slugChanged > 0
        ) {
          setSyncNotice(summary);
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        captureException(error, { source: 'CartPage.syncWithCatalog' });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownloadPdf() {
    if (items.length === 0) return;
    setPdfError('');
    setIsPdfBuilding(true);
    try {
      const { generateQuotePdf } = await import('../lib/quotePdf.js');
      await generateQuotePdf({ items });
      const total = items.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      );
      trackEvent('price-download', {
        items: items.length,
        total: Math.round(total),
        format: 'pdf',
        source: 'cart',
      });
    } catch (error) {
      captureException(error, { source: 'CartPage.buildPdf' });
      setPdfError(error.message || messages.errors.cart.pdfBuildFailed);
    } finally {
      setIsPdfBuilding(false);
    }
  }

  const positionsCount = items.length;
  const isCartLimitReached = positionsCount >= MAX_CART_ITEMS;
  const totalLength = items.reduce((sum, item) => {
    if ((item.unit || '').toLowerCase() !== 'м') {
      return sum;
    }

    return sum + Number(item.quantity || 0);
  }, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const hasRequestPriceItems = items.some((item) => {
    const price = Number(item.price);
    return !Number.isFinite(price) || price <= 0;
  });
  const cartSummaryTotal = formatCartSummaryTotal(
    totalPrice,
    hasRequestPriceItems
  );

  function handleManualChange(event) {
    const { name, value } = event.target;

    setManualItem((prev) => ({
      ...prev,
      [name]: value,
    }));
    setManualError('');
  }

  function handleManualSubmit(event) {
    event.preventDefault();

    const mark = manualItem.mark.trim();
    const quantity = Number(manualItem.quantity);

    if (!mark) {
      setManualError(messages.errors.cart.manualTitleRequired);
      return;
    }

    if (mark.length > MAX_QUOTE_ITEM_TITLE_LENGTH) {
      setManualError(
        formatMessage(messages.errors.cart.manualTitleTooLong, {
          max: MAX_QUOTE_ITEM_TITLE_LENGTH,
        })
      );
      return;
    }

    if (manualItem.comment.trim().length > MAX_QUOTE_ITEM_COMMENT_LENGTH) {
      setManualError(
        formatMessage(messages.errors.cart.manualCommentTooLong, {
          max: MAX_QUOTE_ITEM_COMMENT_LENGTH,
        })
      );
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError(messages.errors.cart.quantityRequired);
      return;
    }

    if (isCartLimitReached) {
      setManualError(
        formatMessage(messages.errors.cart.limitReached, {
          max: MAX_CART_ITEMS,
        })
      );
      return;
    }

    const wasAdded = addManualItem({
      title: mark,
      name: mark,
      fullName: mark,
      mark,
      shortDescription:
        manualItem.comment.trim() || messages.text.cartManualDefaultDescription,
      quantity,
      unit: manualItem.unit,
      comment: manualItem.comment.trim(),
    });

    if (!wasAdded) {
      setManualError(
        formatMessage(messages.errors.cart.limitReached, {
          max: MAX_CART_ITEMS,
        })
      );
      return;
    }

    setManualItem(initialManualItem);
  }

  return (
    <section className="section cart-page">
      <Container>
        <Breadcrumbs current="Список для КП" />
        <div className="cart-page__head">
          <div>
            <h1 className="page-title">Список для КП</h1>
            <p className="page-subtitle">
              Соберите позиции, укажите метраж и отправьте список на расчёт. Это
              не оформление оплаты.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty__content">
              <h2 className="cart-empty__title">Список пока пуст</h2>
              <p className="cart-empty__text">
                Выберите товары в каталоге или добавьте позицию вручную ниже.
              </p>
            </div>
            <Link to={CATALOG_CANONICAL_PATH} className="button-primary">
              Перейти в каталог
            </Link>
          </div>
        ) : null}

        {syncNotice ? (
          <div className="cart-sync-notice" role="status">
            <strong>Каталог обновился — список актуализирован.</strong>
            <ul>
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

        <div className="cart-manual">
          <div className="cart-manual__head">
            <h2 className="cart-manual__title">Добавить позицию вручную</h2>
            <p className="cart-manual__text">
              Для срочной заявки: введите марку или описание кабеля, даже если
              позиции нет в каталоге.
            </p>
          </div>

          <form className="cart-manual__form" onSubmit={handleManualSubmit}>
            <label className="cart-manual__field cart-manual__field--mark">
              <span>Марка или наименование</span>
              <input
                name="mark"
                value={manualItem.mark}
                onChange={handleManualChange}
                maxLength={MAX_QUOTE_ITEM_TITLE_LENGTH}
                placeholder="Например: ВВГнг-LS 3×2.5"
              />
            </label>

            <label className="cart-manual__field">
              <span>Метраж</span>
              <input
                name="quantity"
                type="number"
                min="0"
                step="0.01"
                value={manualItem.quantity}
                onChange={handleManualChange}
                placeholder="500"
              />
            </label>

            <label className="cart-manual__field">
              <span>Ед.</span>
              <select
                name="unit"
                value={manualItem.unit}
                onChange={handleManualChange}
              >
                <option value="м">м</option>
                <option value="шт">шт</option>
                <option value="кг">кг</option>
                <option value="бухта">бухта</option>
              </select>
            </label>

            <label className="cart-manual__field cart-manual__field--comment">
              <span>Комментарий</span>
              <input
                name="comment"
                value={manualItem.comment}
                onChange={handleManualChange}
                maxLength={MAX_QUOTE_ITEM_COMMENT_LENGTH}
                placeholder="Например: нужен аналог, срочно"
              />
            </label>

            <button
              type="submit"
              className="button-secondary cart-manual__submit"
            >
              Добавить в список
            </button>
          </form>

          {manualError ? (
            <div className="field-error">{manualError}</div>
          ) : null}
        </div>

        {items.length > 0 ? (
          <>
            <div className="cart-list">
              {items.map((item) => {
                const quantity = Number(item.quantity || 0);
                const unit = item.unit || 'м';
                const lineTotal = Number(item.price || 0) * quantity;
                const itemPrice = formatProductPrice(item.price, unit, {
                  context: 'quote',
                });
                const itemImage = getProductImage(item);
                const itemImageAlt = getProductImageAlt(item);

                return (
                  <article key={item.id} className="cart-item">
                    <img
                      src={itemImage}
                      alt={itemImageAlt}
                      className="cart-item__image"
                      width="560"
                      height="320"
                      loading="lazy"
                      decoding="async"
                    />

                    <div className="cart-item__content">
                      <div className="cart-item__meta">
                        {item.sku ? (
                          <div className="cart-item__sku">SKU: {item.sku}</div>
                        ) : null}
                        <div className="cart-item__category">
                          {item.category}
                        </div>
                      </div>

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

                      {item.shortDescription ? (
                        <p className="cart-item__description">
                          {item.shortDescription}
                        </p>
                      ) : null}

                      <div className="cart-item__price-row">
                        <div className="cart-item__price">{itemPrice.text}</div>
                        {lineTotal > 0 ? (
                          <div className="cart-item__line-total">
                            Предварительно: {lineTotal.toLocaleString('ru-RU')}{' '}
                            ₽
                          </div>
                        ) : null}
                      </div>

                      <div className="cart-item__actions">
                        <label className="cart-item__quantity">
                          <span>Метраж</span>
                          <div className="cart-item__quantity-control">
                            <input
                              key={`${item.id}-${quantity}`}
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={quantity}
                              onBlur={(event) =>
                                updateItemQuantity(item.id, event.target.value)
                              }
                            />
                            <strong>{unit}</strong>
                          </div>
                        </label>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="cart-summary">
              <div className="cart-summary__counts">
                <span>
                  Позиций: {formatNumber(positionsCount)} /{' '}
                  {formatNumber(MAX_CART_ITEMS)}
                </span>
                <span>Общая длина: {formatNumber(totalLength)} м</span>
                <span className="cart-summary__total">
                  Предварительная сумма: <strong>{cartSummaryTotal}</strong>
                </span>
              </div>
              <p className="cart-summary__note">
                Сумма справочная, без скидки объёма и без учёта ручных позиций.
                Итоговые цены фиксируем в коммерческом предложении.
              </p>

              <div className="cart-summary__actions">
                <button
                  type="button"
                  className="button-primary cart-summary__quote"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('open-cart-quote-modal')
                    )
                  }
                >
                  Запросить коммерческое предложение
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleDownloadPdf}
                  disabled={isPdfBuilding}
                  title="Сформировать КП на бланке и сохранить в PDF"
                >
                  {isPdfBuilding ? 'Формируем PDF...' : '↓ Скачать КП в PDF'}
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Очистить список для КП? Все позиции будут удалены.'
                      )
                    ) {
                      clearCart();
                    }
                  }}
                >
                  Очистить корзину
                </button>
              </div>

              {pdfError ? <div className="field-error">{pdfError}</div> : null}
            </div>
          </>
        ) : null}
      </Container>
    </section>
  );
}
