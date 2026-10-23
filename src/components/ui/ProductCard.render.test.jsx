// @vitest-environment jsdom
// Файл проверяет рендер товарной карточки, действия пользователя и доступные подписи.

import '../../test/renderTestSetup.js';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProductCard from './ProductCard.jsx';
import { useCartStore } from '../../store/useCartStore.js';

const baseProduct = {
  id: 10,
  slug: 'request-price-card',
  sku: 'RPC-010',
  title: 'Кабель под расчет',
  fullName: 'Кабель под расчет',
  mark: 'Кабель под расчет',
  category: 'Силовой кабель',
  price: 0,
  stock: 12,
  unit: 'м',
  image: '/product-placeholder.svg',
  shortDescription: 'Тестовая позиция без открытой цены.',
};

function renderCard(product = baseProduct) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ProductCard product={product} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe('ProductCard', () => {
  it('показывает цену по запросу при price=0', () => {
    renderCard();

    expect(screen.getByText('Кабель под расчет')).toBeInTheDocument();
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent(/по запросу|рассчитан.*КП/i);
    expect(card).not.toHaveTextContent(/₽/);
    expect(screen.queryByText(/^\/\s*м$/)).not.toBeInTheDocument();
  });
});

describe('Счётчик корзины в карточке', () => {
  it.each(['default', 'stock', 'catalog-list'])(
    'синхронизирует количество и возвращает кнопку при удалении (%s)',
    (variant) => {
      render(
        <MemoryRouter>
          <ProductCard product={baseProduct} variant={variant} />
        </MemoryRouter>
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: /^(В корзину|Добавить .* в корзину)$/,
        })
      );
      expect(screen.getByRole('status')).toHaveTextContent('1');
      fireEvent.click(
        screen.getByRole('button', { name: /Увеличить количество/ })
      );
      expect(useCartStore.getState().items[0].quantity).toBe(2);
      expect(screen.getByRole('status')).toHaveTextContent('2');
      act(() =>
        useCartStore.getState().updateItemQuantity(baseProduct.id, 12.5)
      );
      expect(screen.getByRole('status')).toHaveTextContent('12,5');
      act(() => useCartStore.getState().updateItemQuantity(baseProduct.id, 1));
      fireEvent.click(
        screen.getByRole('button', { name: /Уменьшить количество/ })
      );
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(
        screen.queryByRole('group', { name: /Количество .* в корзине/ })
      ).toBeNull();
      expect(
        screen.getByRole('button', {
          name: /^(В корзину|Добавить .* в корзину)$/,
        })
      ).toBeVisible();
    }
  );
});
