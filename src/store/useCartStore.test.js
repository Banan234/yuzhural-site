// Файл проверяет операции корзины, генерацию item id и persisted-поведение store.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_QUOTE_ITEMS } from '../../shared/quoteValidation.js';

// Минимальный shim localStorage для zustand persist в node-окружении.
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
});

afterEach(() => {
  vi.resetModules();
  delete globalThis.localStorage;
});

async function freshCartModule() {
  vi.resetModules();
  return import('./useCartStore.js');
}

async function freshStore() {
  const mod = await freshCartModule();
  // Каждый импорт даёт fresh-store благодаря resetModules.
  return mod.useCartStore;
}

describe('useCartStore item limit', () => {
  it('не добавляет новую позицию сверх MAX_CART_ITEMS', async () => {
    const { MAX_CART_ITEMS, useCartStore } = await freshCartModule();
    const { addItem } = useCartStore.getState();

    for (let id = 1; id <= MAX_CART_ITEMS; id += 1) {
      expect(addItem({ id, title: `Cable ${id}`, price: 100, unit: 'м' })).toBe(
        true
      );
    }

    expect(
      addItem({
        id: MAX_CART_ITEMS + 1,
        title: 'Over limit',
        price: 100,
        unit: 'м',
      })
    ).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(MAX_CART_ITEMS);
  });

  it('разрешает увеличить количество существующей позиции на лимите', async () => {
    const { MAX_CART_ITEMS, useCartStore } = await freshCartModule();
    const { addItem } = useCartStore.getState();

    for (let id = 1; id <= MAX_CART_ITEMS; id += 1) {
      addItem({ id, title: `Cable ${id}`, quantity: 1, price: 100, unit: 'м' });
    }

    expect(addItem({ id: 1, title: 'Cable 1', quantity: 3 })).toBe(true);
    expect(useCartStore.getState().items).toHaveLength(MAX_CART_ITEMS);
    expect(useCartStore.getState().items[0].quantity).toBe(4);
  });

  it('не добавляет ручную позицию сверх MAX_CART_ITEMS', async () => {
    const { MAX_CART_ITEMS, useCartStore } = await freshCartModule();
    const { addItem, addManualItem } = useCartStore.getState();

    for (let id = 1; id <= MAX_CART_ITEMS; id += 1) {
      addItem({ id, title: `Cable ${id}`, price: 100, unit: 'м' });
    }

    expect(addManualItem({ title: 'Ручной кабель', quantity: 10 })).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(MAX_CART_ITEMS);
  });

  it('обрезает сохранённую корзину при гидрации', async () => {
    const MAX_CART_ITEMS = MAX_QUOTE_ITEMS;
    const persistedItems = Array.from(
      { length: MAX_CART_ITEMS + 5 },
      (_, index) => ({
        id: index + 1,
        title: `Cable ${index + 1}`,
        quantity: 1,
        price: 100,
        unit: 'м',
      })
    );
    localStorage.setItem(
      'yuzhural-cart',
      JSON.stringify({ state: { items: persistedItems }, version: 1 })
    );

    const useCartStore = await freshStore();

    expect(useCartStore.getState().items).toHaveLength(MAX_CART_ITEMS);
    expect(useCartStore.getState().items.at(-1).id).toBe(MAX_CART_ITEMS);
  });

  it('мигрирует старый сырой массив и применяет лимит при гидрации', async () => {
    const MAX_CART_ITEMS = MAX_QUOTE_ITEMS;
    const legacyItems = Array.from(
      { length: MAX_CART_ITEMS + 5 },
      (_, index) => ({
        id: index + 1,
        title: `Legacy cable ${index + 1}`,
        quantity: 1,
        price: 100,
        unit: 'м',
      })
    );
    localStorage.setItem('yuzhural-cart', JSON.stringify(legacyItems));

    const useCartStore = await freshStore();

    expect(useCartStore.getState().items).toHaveLength(MAX_CART_ITEMS);
    expect(useCartStore.getState().items.at(-1).id).toBe(MAX_CART_ITEMS);
    expect(JSON.parse(localStorage.getItem('yuzhural-cart')).version).toBe(1);
  });
});

describe('useCartStore.syncWithCatalog', () => {
  it('удаляет позиции из missing и накапливает их в summary', async () => {
    const useCartStore = await freshStore();
    const { addItem, syncWithCatalog } = useCartStore.getState();
    addItem({ id: 1, title: 'A', price: 100, unit: 'м' });
    addItem({ id: 2, title: 'B', price: 200, unit: 'м' });

    const summary = syncWithCatalog({
      found: [{ id: 1, title: 'A', price: 100, unit: 'м', slug: 'a' }],
      missing: [2],
    });

    expect(summary.removed.map((p) => p.id)).toEqual([2]);
    expect(useCartStore.getState().items.map((i) => i.id)).toEqual([1]);
  });

  it('обновляет цену и фиксирует priceChanged', async () => {
    const useCartStore = await freshStore();
    const { addItem, syncWithCatalog } = useCartStore.getState();
    addItem({ id: 1, title: 'A', price: 100, unit: 'м' });

    const summary = syncWithCatalog({
      found: [{ id: 1, title: 'A', price: 130, unit: 'м', slug: 'a' }],
      missing: [],
    });

    expect(summary.priceChanged).toEqual([
      { id: 1, title: 'A', priceBefore: 100, priceAfter: 130 },
    ]);
    expect(useCartStore.getState().items[0].price).toBe(130);
  });

  it('переписывает slug при ренейме и считает slugChanged', async () => {
    const useCartStore = await freshStore();
    const { addItem, syncWithCatalog } = useCartStore.getState();
    addItem({ id: 1, title: 'A', slug: 'old-a', price: 100, unit: 'м' });

    const summary = syncWithCatalog({
      found: [{ id: 1, title: 'A', slug: 'new-a', price: 100, unit: 'м' }],
      missing: [],
    });

    expect(summary.slugChanged).toBe(1);
    expect(useCartStore.getState().items[0].slug).toBe('new-a');
  });

  it('не трогает manual-позиции', async () => {
    const useCartStore = await freshStore();
    const { addManualItem, syncWithCatalog } = useCartStore.getState();
    addManualItem({ title: 'Ручной кабель', quantity: 5, price: 999 });

    const before = useCartStore.getState().items[0];
    const summary = syncWithCatalog({ found: [], missing: [] });

    expect(useCartStore.getState().items[0]).toEqual(before);
    expect(summary.removed).toEqual([]);
  });

  it('оставляет позиции, которых нет ни в found, ни в missing', async () => {
    const useCartStore = await freshStore();
    const { addItem, syncWithCatalog } = useCartStore.getState();
    addItem({ id: 1, title: 'A', price: 100, unit: 'м' });
    addItem({ id: 2, title: 'B', price: 200, unit: 'м' });

    syncWithCatalog({
      found: [{ id: 1, title: 'A', price: 100, unit: 'м' }],
      missing: [],
    });

    expect(useCartStore.getState().items.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe('ограничение количеством в наличии', () => {
  it('ограничивает первое добавление, повторные клики и ручное количество', async () => {
    const store = await freshStore();
    const product = { id: 1, title: 'Кабель', stock: 10, quantity: 17 };
    store.getState().addItem(product);
    expect(store.getState().items[0].quantity).toBe(10);
    store.getState().addItem({ ...product, quantity: 1 });
    expect(store.getState().items[0].quantity).toBe(10);
    store.getState().updateItemQuantity(1, 99);
    expect(store.getState().items[0].quantity).toBe(10);
    store.getState().updateItemQuantity(1, 4.25);
    expect(store.getState().items[0].quantity).toBe(4.25);
  });
  it('учитывает дробный остаток и его уменьшение при сверке каталога', async () => {
    const store = await freshStore();
    store.getState().addItem({ id: 1, title: 'Кабель', stock: 0.4 });
    expect(store.getState().items[0].quantity).toBe(0.4);
    store
      .getState()
      .syncWithCatalog({ found: [{ id: 1, stock: 0.2 }], missing: [] });
    expect(store.getState().items[0].quantity).toBe(0.2);
  });
  it('исправляет сохранённую корзину с превышенным остатком', async () => {
    localStorage.setItem(
      'yuzhural-cart',
      JSON.stringify({
        state: { items: [{ id: 1, stock: 10, quantity: 17 }] },
        version: 1,
      })
    );
    const store = await freshStore();
    expect(store.getState().items[0].quantity).toBe(10);
  });
  it('не ограничивает ручные позиции, но не добавляет отсутствующий товар', async () => {
    const store = await freshStore();
    expect(store.getState().addItem({ id: 1, stock: 0 })).toBe(false);
    store
      .getState()
      .addManualItem({ title: 'Ручная позиция', stock: 0, quantity: 100 });
    expect(store.getState().items[0].quantity).toBe(100);
  });
});
