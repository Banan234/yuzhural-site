// Файл готовит jsdom-окружение, моки браузерных API и общие настройки render-тестов.

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

function createMemoryStorage() {
  const store = new Map();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

const testStorage = createMemoryStorage();
const testSessionStorage = createMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  configurable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: testStorage,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: testSessionStorage,
  configurable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: testSessionStorage,
  configurable: true,
});

beforeEach(() => {
  window.scrollTo = vi.fn();
  window.requestAnimationFrame =
    window.requestAnimationFrame ||
    ((callback) => window.setTimeout(callback, 0));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
