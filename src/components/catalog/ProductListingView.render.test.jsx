// @vitest-environment jsdom
// Файл проверяет рендер выдачи каталога, пустые состояния и доступность карточек товаров.

import '../../test/renderTestSetup.js';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProductListingView from './ProductListingView.jsx';

function makeProduct(overrides) {
  return {
    id: overrides.id,
    slug: overrides.slug,
    sku: overrides.sku || `SKU-${overrides.id}`,
    title: overrides.title,
    fullName: overrides.fullName || overrides.title,
    mark: overrides.mark || overrides.title,
    category: 'Силовой кабель',
    price: overrides.price ?? 120,
    stock: overrides.stock ?? 250,
    unit: 'м',
    image: '/product-placeholder.svg',
    shortDescription: 'Кабель для промышленных и строительных объектов',
    conductorMaterial: overrides.conductorMaterial || 'медь',
    isAluminum: overrides.isAluminum || false,
    cores: overrides.cores || 3,
    crossSection: overrides.crossSection || 2.5,
    voltage: overrides.voltage || 0.66,
    ...overrides,
  };
}

const products = [
  makeProduct({
    id: 1,
    slug: 'vvgng-ls-3x25',
    title: 'ВВГнг-LS 3x2.5',
    mark: 'ВВГнг-LS',
    sku: 'VVG-001',
    price: 120,
  }),
  makeProduct({
    id: 2,
    slug: 'avvg-4x16',
    title: 'АВВГ 4x16',
    mark: 'АВВГ',
    sku: 'AVVG-016',
    price: 310,
    conductorMaterial: 'алюминий',
    isAluminum: true,
    cores: 4,
    crossSection: 16,
    voltage: 1,
  }),
];

function LocationProbe({ onChange }) {
  const location = useLocation();

  useEffect(() => {
    onChange(location);
  }, [location, onChange]);

  return null;
}

function renderListing({ initialEntry = '/catalog', viewProps = {} } = {}) {
  let currentLocation;
  const handleLocationChange = vi.fn((location) => {
    currentLocation = location;
  });

  render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe onChange={handleLocationChange} />
      <ProductListingView
        products={products}
        isLoading={false}
        error={null}
        scopeKey="test-catalog"
        {...viewProps}
      />
    </MemoryRouter>
  );

  return {
    getSearchParam(name) {
      return new URLSearchParams(currentLocation?.search || '').get(name);
    },
  };
}

describe('ProductListingView render flow', () => {
  it('рендерит товары и управление выдачей', () => {
    renderListing();

    expect(screen.getByText('ВВГнг-LS 3x2.5')).toBeInTheDocument();
    expect(screen.getByText('АВВГ 4x16')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Плиточное отображение' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('combobox', { name: 'Количество товаров на странице' })
    ).toHaveValue('24');
  });

  it('применяет поиск из URL', () => {
    const { getSearchParam } = renderListing({
      initialEntry: '/catalog?search=АВВГ',
    });

    expect(getSearchParam('search')).toBe('АВВГ');
    expect(screen.getByText('АВВГ 4x16')).toBeInTheDocument();
    expect(screen.queryByText('ВВГнг-LS 3x2.5')).not.toBeInTheDocument();
  });

  it('коммитит фасет материала в URL и обновляет aria-pressed', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing();

    await user.click(screen.getByRole('button', { name: 'алюминий' }));

    await waitFor(() => expect(getSearchParam('material')).toBe('алюминий'));
    expect(screen.getByRole('button', { name: 'алюминий' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('ВВГнг-LS 3x2.5')).not.toBeInTheDocument();
  });

  it('показывает группы силового кабеля только при включенном фильтре', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing({
      viewProps: {
        extraFilters: { showPowerGroups: true },
        products: [
          makeProduct({
            id: 1,
            slug: 'vvgng-ls-3x25',
            title: 'ВВГнг-LS 3x2.5',
            mark: 'ВВГнг-LS',
          }),
          makeProduct({
            id: 3,
            slug: 'apvv-ng-ls-3x25',
            title: 'АПвВ нг(А)LS 3x2.5',
            mark: 'АПвВ нг(А)LS',
          }),
        ],
      },
    });

    await user.click(
      screen.getByRole('button', { name: 'Сшитый полиэтилен (XLPE)' })
    );

    await waitFor(() =>
      expect(getSearchParam('powerGroup')).toBe('Сшитый полиэтилен (XLPE)')
    );
    expect(screen.getByText('АПвВ нг(А)LS 3x2.5')).toBeInTheDocument();
    expect(screen.queryByText('ВВГнг-LS 3x2.5')).not.toBeInTheDocument();
  });

  it('коммитит диапазон цены в URL', async () => {
    const user = userEvent.setup();
    const { getSearchParam } = renderListing();

    await user.type(screen.getByLabelText('Цена от, ₽'), '100');
    await user.type(screen.getByLabelText('Цена до, ₽'), '200');
    fireEvent.blur(screen.getByLabelText('Цена до, ₽'));

    await waitFor(() => {
      expect(getSearchParam('priceMin')).toBe('100');
      expect(getSearchParam('priceMax')).toBe('200');
    });
    expect(screen.getByText('ВВГнг-LS 3x2.5')).toBeInTheDocument();
    expect(screen.queryByText('АВВГ 4x16')).not.toBeInTheDocument();
  });

  it('показывает фильтры в боковой панели', () => {
    renderListing();

    const sidebar = screen.getByRole('complementary', {
      name: 'Фильтры товаров',
    });
    expect(sidebar).toContainElement(
      screen.getByRole('button', { name: 'алюминий' })
    );
    expect(sidebar).toContainElement(screen.getByLabelText('Цена от, ₽'));
  });
});
