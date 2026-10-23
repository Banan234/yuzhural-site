// @vitest-environment jsdom
// Файл проверяет SEO статических информационных страниц: доставку, оплату и о компании.

import '../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from './CartPage.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import { useCartStore } from '../store/useCartStore.js';

function renderPage(page, path) {
  render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {page}
    </MemoryRouter>
  );
}

function getRobotsMetaContent() {
  return document.querySelector('meta[name="robots"]')?.getAttribute('content');
}

function getCanonicalHref() {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href');
}

const noPriceItem = {
  id: 777,
  sku: 'NO-PRICE',
  slug: 'no-price',
  title: 'Кабель без цены',
  category: 'Силовой кабель',
  price: 0,
  quantity: 2,
  unit: 'м',
  image: '/product-placeholder.svg',
};

const pricedItem = {
  id: 778,
  sku: 'PRICE-ITEM',
  slug: 'price-item',
  title: 'Кабель с ценой',
  category: 'Силовой кабель',
  price: 600,
  quantity: 2,
  unit: 'м',
  image: '/product-placeholder.svg',
};

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe('private pages SEO', () => {
  it('не индексирует корзину и показывает расчет цены в КП для нулевой цены', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, found: [noPriceItem], missing: [] }),
      })
    );
    useCartStore.setState({ items: [noPriceItem] });

    renderPage(<CartPage />, '/cart');

    await waitFor(() => {
      expect(getRobotsMetaContent()).toBe('noindex,follow');
    });
    const item = screen.getByRole('article');
    expect(
      within(item).getByRole('link', { name: noPriceItem.title })
    ).toHaveAttribute('href', `/product/${noPriceItem.slug}`);
    expect(item).toHaveTextContent(/по запросу|рассчитан.*КП/i);
    expect(item).not.toHaveTextContent(/₽/);
    const summary = screen.getByRole('complementary');
    expect(summary).toHaveTextContent(/рассчитан.*КП|по запросу/i);
    expect(summary).not.toHaveTextContent(/₽/);
  });

  it('показывает в итогах корзины сумму и позиции по запросу вместе', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          found: [pricedItem, noPriceItem],
          missing: [],
        }),
      })
    );
    useCartStore.setState({ items: [pricedItem, noPriceItem] });

    renderPage(<CartPage />, '/cart');

    expect(screen.getByText('Кабель с ценой')).toBeInTheDocument();
    expect(screen.getByText('Кабель без цены')).toBeInTheDocument();
    const summary = screen.getByRole('complementary');
    expect(summary).toHaveTextContent(/1\s*200\s*₽/);
    expect(summary).toHaveTextContent(/по запросу|рассчитан.*КП/i);
  });

  it('убирает canonical и ставит noindex на 404-страницу', async () => {
    renderPage(<NotFoundPage />, '/missing');

    await waitFor(() => {
      expect(getRobotsMetaContent()).toBe('noindex,follow');
    });
    expect(getCanonicalHref()).toBeUndefined();
  });
});
