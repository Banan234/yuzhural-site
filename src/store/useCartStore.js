// Файл хранит состояние корзины, выбранные позиции, количество и persisted-синхронизацию.

import { createItemsStore } from './createItemsStore.js';
import { MAX_QUOTE_ITEMS } from '../../shared/quoteValidation.js';
import { PRODUCT_IMAGE_FALLBACKS } from '../../shared/productImages.js';
import { clampCartQuantity } from '../lib/cartQuantity.js';

export const MAX_CART_ITEMS = MAX_QUOTE_ITEMS;

// Date.now() даёт коллизию при быстрых кликах (двойной клик «Добавить»
// на одной миллисекунде → одинаковый id, и updateItemQuantity дёргает обе строки).
function createManualId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useCartStore = createItemsStore({
  name: 'yuzhural-cart',
  version: 1,
  withQuantity: true,
  maxItems: MAX_CART_ITEMS,
  normalizeQuantity: clampCartQuantity,
  normalizeStoredItem: (item) => ({
    ...item,
    quantity: clampCartQuantity(item, item.quantity),
  }),
  prepareItem: (product) => ({
    ...product,
    quantity: clampCartQuantity(product, product.quantity || 1),
  }),
  mergeItem: (existingItem, product) => ({
    ...existingItem,
    stock: product.stock ?? existingItem.stock,
    quantity: clampCartQuantity(
      { ...existingItem, stock: product.stock ?? existingItem.stock },
      existingItem.quantity + (product.quantity || 1)
    ),
  }),
  createExtraActions: ({ set, get }) => ({
    addManualItem: (item) =>
      get().addItem({
        id: `manual-${createManualId()}`,
        slug: '',
        sku: '',
        image: PRODUCT_IMAGE_FALLBACKS.nonCable,
        category: 'Ручная позиция',
        price: 0,
        unit: 'м',
        manual: true,
        ...item,
        quantity: item.quantity || 1,
      }),

    clearCart: () => get().clearItems(),

    // Сверяет каталожные позиции в корзине с актуальным состоянием каталога.
    // Принимает результат POST /api/products/lookup. Ручные позиции и
    // позиции без числового id (legacy) пропускаются. Возвращает сводку для UI.
    syncWithCatalog: ({ found, missing }) => {
      const foundById = new Map(
        (Array.isArray(found) ? found : []).map((item) => [item.id, item])
      );
      const missingSet = new Set(
        (Array.isArray(missing) ? missing : []).map((id) => Number(id))
      );

      const summary = { removed: [], priceChanged: [], slugChanged: 0 };

      set((state) => {
        const nextItems = [];
        for (const cartItem of state.items) {
          if (cartItem.manual) {
            nextItems.push(cartItem);
            continue;
          }
          const id = Number(cartItem.id);
          if (!Number.isFinite(id) || id <= 0) {
            // Старые корзины без числовых id — оставляем как есть, пусть
            // пользователь увидит и сам решит. Не трогаем — не наш случай.
            nextItems.push(cartItem);
            continue;
          }
          if (missingSet.has(id)) {
            summary.removed.push({
              id,
              title: cartItem.title || cartItem.name || cartItem.mark || '',
            });
            continue;
          }
          const fresh = foundById.get(id);
          if (!fresh) {
            // Не было ни в found, ни в missing → не сверяли (например, обрезано
            // лимитом). Оставляем без изменений.
            nextItems.push(cartItem);
            continue;
          }
          if (
            Number(cartItem.price) !== Number(fresh.price) &&
            Number(fresh.price) > 0
          ) {
            summary.priceChanged.push({
              id,
              title: fresh.title || cartItem.title,
              priceBefore: Number(cartItem.price) || 0,
              priceAfter: Number(fresh.price),
            });
          }
          if (cartItem.slug && fresh.slug && cartItem.slug !== fresh.slug) {
            summary.slugChanged += 1;
          }
          nextItems.push({
            ...cartItem,
            slug: fresh.slug || cartItem.slug,
            sku: fresh.sku || cartItem.sku,
            title: fresh.title || cartItem.title,
            category: fresh.category || cartItem.category,
            price: Number(fresh.price) || 0,
            unit: fresh.unit || cartItem.unit,
            stock: fresh.stock,
            quantity: clampCartQuantity(
              { ...cartItem, stock: fresh.stock },
              cartItem.quantity
            ),
            image: fresh.image || cartItem.image,
          });
        }
        return { items: nextItems.filter((item) => item.quantity > 0) };
      });

      return summary;
    },
  }),
});
