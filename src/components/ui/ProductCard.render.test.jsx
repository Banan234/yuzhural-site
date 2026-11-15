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
  it('показывает диаметр и число пар у кабеля с диаметральной маркировкой', () => {
    render(
      <MemoryRouter>
        <ProductCard
          variant="catalog-list"
          product={{
            ...baseProduct,
            cores: 10,
            crossSection: 0.5,
            conductorDiameter: 0.5,
          }}
        />
      </MemoryRouter>
    );
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('Количество пар');
    expect(card).toHaveTextContent('Диаметр жилы');
    expect(card).toHaveTextContent('0,5 мм');
    expect(card).not.toHaveTextContent('мм²');
  });

  it.each(['default', 'stock', 'catalog-list', 'catalog-tile'])(
    'adds the cheapest available source balance directly (%s)',
    (variant) => {
      render(
        <MemoryRouter>
          <ProductCard
            variant={variant}
            product={{
              ...baseProduct,
              price: 100,
              priceVaries: true,
              offers: [
                { id: 11, stock: 7, price: 120 },
                { id: 12, stock: 0, price: 50 },
                { id: 10, stock: 5, price: 100 },
              ],
            }}
          />
        </MemoryRouter>
      );
      fireEvent.click(
        screen.getByRole('button', { name: /В корзину|Добавить .* в корзину/ })
      );
      expect(useCartStore.getState().items[0]).toMatchObject({
        id: 10,
        price: 100,
        stock: 5,
        quantity: 1,
      });
      expect(useCartStore.getState().items[0]).not.toHaveProperty('offers');
      expect(screen.getByRole('article').textContent).toContain('от 100 ₽');
    }
  );

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
      expect(
        screen.getByRole('textbox', {
          name: `Количество ${baseProduct.title}`,
        })
      ).toHaveValue('1');
      fireEvent.click(
        screen.getByRole('button', { name: /Увеличить количество/ })
      );
      expect(useCartStore.getState().items[0].quantity).toBe(2);
      expect(
        screen.getByRole('textbox', {
          name: `Количество ${baseProduct.title}`,
        })
      ).toHaveValue('2');
      act(() =>
        useCartStore.getState().updateItemQuantity(baseProduct.id, 11.5)
      );
      expect(
        screen.getByRole('textbox', {
          name: `Количество ${baseProduct.title}`,
        })
      ).toHaveValue('12');
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

describe('Производитель в названии карточки', () => {
  it.each([
    ['HELUKABEL 2х2х0.75', 'HELUKABEL', 'HELUKABEL 2х2х0.75'],
    ['Герда КВ 4х2х1', 'ГЕРДА', 'Герда КВ 4х2х1'],
    ['FTP cat.5 2PR Rexant', 'REXANT', 'FTP cat.5 2PR'],
  ])('показывает %s по общему правилу', (title, manufacturer, expected) => {
    renderCard({ ...baseProduct, title, manufacturer });
    expect(screen.getByRole('heading', { name: expected })).toBeInTheDocument();
    expect(screen.queryByText(/^Производитель:/)).not.toBeInTheDocument();
  });
});

describe('Остаток в счётчике', () => {
  it('останавливает добавление на доступном остатке', () => {
    renderCard({ ...baseProduct, stock: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    const plus = screen.getByRole('button', {
      name: `Увеличить количество ${baseProduct.title}`,
    });
    fireEvent.click(plus);
    expect(plus).toBeDisabled();
    expect(useCartStore.getState().items[0].quantity).toBe(2);
    fireEvent.click(plus);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });
});

it('позволяет вводить метраж вручную, с запятой и ограничением остатком', () => {
  renderCard({ ...baseProduct, stock: 10 });
  fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
  const input = screen.getByRole('textbox', {
    name: `Количество ${baseProduct.title}`,
  });
  fireEvent.change(input, { target: { value: '' } });
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: '5,5' } });
  fireEvent.blur(input);
  expect(useCartStore.getState().items[0].quantity).toBe(6);
  fireEvent.change(input, { target: { value: '99' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('10');
  expect(useCartStore.getState().items[0].quantity).toBe(10);
  fireEvent.change(input, { target: { value: 'ошибка' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('10');
});

describe('Метраж в каталоге', () => {
  it('добавляет введённый метраж с десятичной запятой', () => {
    render(
      <MemoryRouter>
        <ProductCard product={baseProduct} variant="catalog-tile" />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole('textbox', { name: /Количество/ }), {
      target: { value: '2,5' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: /Количество/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить .* в корзину/ })
    );
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });
});
