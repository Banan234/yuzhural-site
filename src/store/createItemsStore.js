// Файл создаёт общую zustand-логику persisted store для коллекций товаров.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMigratingItemsStorage } from '../lib/browserStorage.js';

const identity = (item) => item;
const keepExistingItem = (existingItem) => existingItem;
const createNoExtraActions = () => ({});
const NO_ITEM_LIMIT = Infinity;

function normalizeItemLimit(maxItems) {
  const limit = Number(maxItems);
  return Number.isInteger(limit) && limit > 0 ? limit : NO_ITEM_LIMIT;
}

function applyItemLimit(items, maxItems) {
  if (!Array.isArray(items)) return [];
  if (!Number.isFinite(maxItems)) return items;
  return items.slice(0, maxItems);
}

export function createItemsStore({
  name,
  version = 1,
  prepareItem = identity,
  mergeItem = keepExistingItem,
  withQuantity = false,
  maxItems = NO_ITEM_LIMIT,
  normalizeStoredItem = identity,
  normalizeQuantity = (_item, quantity) => quantity,
  createExtraActions = createNoExtraActions,
}) {
  if (!name) {
    throw new Error('createItemsStore requires a storage name');
  }

  const itemLimit = normalizeItemLimit(maxItems);

  return create(
    persist(
      (set, get) => {
        const baseActions = {
          items: [],

          addItem: (item) => {
            const state = get();
            const nextItem = prepareItem(item, state);
            if (withQuantity && nextItem.quantity <= 0) return false;
            const existingItem = state.items.find(
              (currentItem) => currentItem.id === nextItem.id
            );

            if (existingItem) {
              const mergedItem = mergeItem(existingItem, nextItem, state);
              if (mergedItem === existingItem) return true;

              set({
                items: state.items.map((currentItem) =>
                  currentItem.id === nextItem.id ? mergedItem : currentItem
                ),
              });
              return true;
            }

            if (state.items.length >= itemLimit) {
              return false;
            }

            set({ items: [...state.items, nextItem] });
            return true;
          },

          removeItem: (id) =>
            set((state) => ({
              items: state.items.filter((item) => item.id !== id),
            })),

          clearItems: () => set({ items: [] }),
        };

        const quantityActions = withQuantity
          ? {
              updateItemQuantity: (id, quantity) =>
                set((state) => {
                  const nextQuantity = Math.max(0, Number(quantity) || 0);
                  return {
                    items: state.items
                      .map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              quantity: normalizeQuantity(item, nextQuantity),
                            }
                          : item
                      )
                      .filter((item) => item.quantity > 0),
                  };
                }),

              decreaseItem: (id) =>
                set((state) => ({
                  items: state.items
                    .map((item) =>
                      item.id === id
                        ? { ...item, quantity: item.quantity - 1 }
                        : item
                    )
                    .filter((item) => item.quantity > 0),
                })),
            }
          : {};

        return {
          ...baseActions,
          ...quantityActions,
          ...createExtraActions({ set, get }),
        };
      },
      {
        name,
        storage: createJSONStorage(() => createMigratingItemsStorage()),
        partialize: (state) => ({ items: state.items }),
        migrate: (persistedState) => {
          const nextState =
            persistedState && typeof persistedState === 'object'
              ? persistedState
              : {};

          return {
            ...nextState,
            items: applyItemLimit(nextState.items, itemLimit)
              .map(normalizeStoredItem)
              .filter((item) => !withQuantity || item.quantity > 0),
          };
        },
        merge: (persistedState, currentState) => {
          const nextState =
            persistedState && typeof persistedState === 'object'
              ? persistedState
              : {};

          return {
            ...currentState,
            ...nextState,
            items: applyItemLimit(nextState.items, itemLimit)
              .map(normalizeStoredItem)
              .filter((item) => !withQuantity || item.quantity > 0),
          };
        },
        version,
      }
    )
  );
}
