// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProductBySlug,
  fetchProducts,
  fetchRelatedProducts,
} from '../lib/productsApi';
import { useCartStore } from '../store/useCartStore';
import ProductPage from './ProductPage';

vi.mock('../lib/productsApi', () => ({
  fetchProductBySlug: vi.fn(),
  fetchProducts: vi.fn(),
  fetchRelatedProducts: vi.fn(),
}));
const product = {
  id: 1,
  slug: 'vvg-4x95',
  sku: 'YU-1',
  title: 'ВВГ 4х95',
  mark: 'ВВГ',
  cores: 4,
  crossSection: 95,
  price: 120.5,
  unit: 'м',
  stock: 50,
  category: 'Силовой кабель',
  specs: { Сечение: '95 мм²' },
};
function setup() {
  return render(
    <MemoryRouter initialEntries={['/product/vvg-4x95']}>
      <Routes>
        <Route path="/product/:slug" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useCartStore.setState({ items: [] });
  fetchProductBySlug.mockResolvedValue(product);
  fetchRelatedProducts.mockResolvedValue([]);
  fetchProducts.mockResolvedValue({
    items: [],
    meta: { pagination: { totalPages: 1 } },
  });
});

describe('ProductPage purchase and variants', () => {
  it('пересчитывает сумму и передаёт точный метраж в корзину и КП', async () => {
    setup();
    const quantity = await screen.findByRole('spinbutton', {
      name: 'Количество товара',
    });
    fireEvent.change(quantity, { target: { value: '12.5' } });
    expect(
      document
        .querySelector('.product-page__total strong')
        .textContent.replace(/\s/g, '')
    ).toBe('1506,25₽');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }));
    expect(useCartStore.getState().items[0]).toMatchObject({
      id: 1,
      quantity: 12.5,
      price: 120.5,
    });
    const onQuote = vi.fn();
    window.addEventListener('open-cart-quote-modal', onQuote);
    fireEvent.click(
      screen.getByRole('button', { name: 'Запросить КП по этой позиции' })
    );
    expect(onQuote.mock.calls[0][0].detail.items[0]).toMatchObject({
      quantity: 12.5,
      sku: 'YU-1',
    });
    window.removeEventListener('open-cart-quote-modal', onQuote);
  });
  it('не показывает нулевую сумму у товара без цены', async () => {
    fetchProductBySlug.mockResolvedValue({ ...product, price: 0 });
    setup();
    expect(await screen.findByText('Цена по запросу')).toBeVisible();
    expect(document.querySelector('.product-page__total')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }));
    expect(useCartStore.getState().items[0].price).toBe(0);
  });
  it('загружает следующие страницы марки и обновляет товар при выборе варианта', async () => {
    const other = {
      ...product,
      id: 2,
      slug: 'vvg-4x70',
      title: 'ВВГ 4х70',
      crossSection: 70,
      price: 80,
    };
    fetchProducts
      .mockResolvedValueOnce({
        items: [product],
        meta: { pagination: { totalPages: 2 } },
      })
      .mockResolvedValueOnce({ items: [other] });
    fetchProductBySlug.mockImplementation(async (slug) =>
      slug === other.slug ? other : product
    );
    setup();
    const link = await screen.findByRole('link', {
      name: 'Сечение жилы, мм²: 70',
    });
    expect(fetchProducts).toHaveBeenCalledWith(
      expect.any(AbortSignal),
      expect.objectContaining({ page: 2, mark: 'ВВГ' })
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Количество товара' }),
      { target: { value: '20' } }
    );
    fireEvent.click(link);
    expect(
      await screen.findByRole('heading', { level: 1, name: other.title })
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: 'Количество товара' })
      ).toHaveValue(1)
    );
  });
  it('оставляет заказ доступным, когда список вариантов не загрузился', async () => {
    fetchProducts.mockRejectedValue(new Error('network error'));
    setup();
    expect(
      await screen.findByRole('button', { name: 'Добавить в корзину' })
    ).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Сечение жилы, мм²: 95' })
    ).toHaveAttribute('aria-current', 'page');
  });
});
