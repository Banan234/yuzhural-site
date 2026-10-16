// @vitest-environment jsdom
// Файл проверяет страницу товара, состояния загрузки, ошибки, SEO и пользовательские действия.

import '../test/renderTestSetup.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProductBySlug,
  fetchRelatedProducts,
} from '../lib/productsApi.js';
import ProductPage from './ProductPage.jsx';

vi.mock('../lib/productsApi.js', () => ({
  fetchProductBySlug: vi.fn(),
  fetchRelatedProducts: vi.fn(),
}));

const product = {
  id: 1,
  slug: 'vvgng-ls-3x25',
  sku: 'VVG-001',
  title: 'ВВГнг-LS 3x2.5',
  fullName: 'Кабель ВВГнг-LS 3x2.5',
  mark: 'ВВГнг-LS',
  category: 'Силовой кабель',
  catalogSection: 'Кабель и провод',
  catalogSectionSlug: 'kabel-i-provod',
  catalogCategory: 'Силовой кабель',
  catalogCategorySlug: 'silovoy-kabel',
  manufacturer: '',
  description: 'Кабель для промышленных и строительных объектов.',
  leadTime: '1-2 дня',
  price: 120,
  stock: 50,
  inStock: true,
  unit: 'м',
  image: '/product-placeholder.svg',
};

function renderProductPage() {
  render(
    <MemoryRouter
      initialEntries={['/product/vvgng-ls-3x25']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/product/:slug" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  fetchProductBySlug.mockReset();
  fetchRelatedProducts.mockReset();
  fetchProductBySlug.mockResolvedValue(product);
  fetchRelatedProducts.mockResolvedValue([]);
});

describe('ProductPage', () => {
  it('показывает расшифровку позиции и внешние источники', async () => {
    renderProductPage();
    expect(
      await screen.findByRole('heading', { name: 'Расшифровка обозначения' })
    ).toBeInTheDocument();
    expect(screen.getByText('Изоляция жил из ПВХ')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Документация семейства ВВГ/ })
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('сохраняет блок для неизвестной марки и явно отмечает непроверенное обозначение', async () => {
    fetchProductBySlug.mockResolvedValue({
      ...product,
      mark: 'Неизвестная',
      sourceName: 'Неизвестная 3х2,5',
    });
    renderProductPage();
    expect(await screen.findByText('Требует уточнения:')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Найти полное обозначение в Google/ })
    ).toHaveAttribute('target', '_blank');
  });
  it('даёт полю количества accessible label и скрывает пустого производителя', async () => {
    renderProductPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: product.title })
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Количество товара')).toHaveAttribute(
      'type',
      'number'
    );
    expect(
      screen.getByRole('button', { name: 'Уменьшить количество товара' })
    ).toHaveAttribute('aria-controls', 'product-quantity-input');
    expect(
      screen.getByRole('button', { name: 'Увеличить количество товара' })
    ).toHaveAttribute('aria-controls', 'product-quantity-input');
    expect(screen.queryByText(/^Производитель:/)).not.toBeInTheDocument();
  });

  it('показывает цену по запросу при price=0', async () => {
    fetchProductBySlug.mockResolvedValue({
      ...product,
      price: 0,
    });

    renderProductPage();

    expect(await screen.findByText('Цена по запросу')).toBeInTheDocument();
    expect(screen.queryByText('/ м')).not.toBeInTheDocument();
  });

  it('показывает 404-экран для несуществующего товара', async () => {
    const error = new Error('Товар не найден');
    error.status = 404;
    fetchProductBySlug.mockRejectedValue(error);

    renderProductPage();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Страница не найдена',
      })
    ).toBeInTheDocument();
  });
});
