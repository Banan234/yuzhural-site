// @vitest-environment jsdom
// Файл проверяет работу layout с localStorage, корзиной и пользовательскими состояниями.

import '../../test/renderTestSetup.js';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProductSuggestions } from '../../lib/productsApi.js';
import MainLayout from './MainLayout.jsx';
import { STORAGE_WRITE_FAILED_EVENT } from '../../lib/browserStorage.js';

vi.mock('../../lib/productsApi.js', () => ({
  fetchProductSuggestions: vi.fn(),
  fetchProducts: vi.fn().mockResolvedValue({ meta: { facets: {} } }),
}));

function renderLayout(initialEntry = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <div>Главная</div> },
          { path: 'catalog', element: <div>Каталог</div> },
        ],
      },
    ],
    {
      initialEntries: [initialEntry],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }
  );

  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  fetchProductSuggestions.mockReset();
  fetchProductSuggestions.mockResolvedValue([
    { key: 'vvgng-ls', mark: 'ВВГнг-LS', count: 12 },
    { key: 'avvg', mark: 'АВВГ', count: 3 },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MainLayout', () => {
  it('печатает названия товаров в пустой строке и останавливается при вводе', () => {
    vi.useFakeTimers();
    renderLayout();

    const searchInput = screen.getByRole('combobox', {
      name: 'Поиск по каталогу',
    });

    act(() => vi.advanceTimersByTime(250));
    expect(searchInput).toHaveAttribute('placeholder', 'В');

    fireEvent.focus(searchInput);
    expect(searchInput).toHaveAttribute('placeholder', 'ВВГнг(А)-LS 3х1.5');

    fireEvent.change(searchInput, { target: { value: 'КГ 4х16' } });
    act(() => vi.advanceTimersByTime(3000));
    expect(searchInput).toHaveValue('КГ 4х16');
    expect(searchInput).toHaveAttribute('placeholder', 'ВВГнг(А)-LS 3х1.5');
  });

  it('показывает плавающий виджет не только на главной, но и на внутренних страницах', () => {
    renderLayout('/catalog');

    expect(
      screen.getByRole('button', { name: 'Чат с менеджером' })
    ).toBeInTheDocument();
  });

  it('показывает UX-фидбек при ошибке сохранения корзины и даёт закрыть предупреждение', async () => {
    const user = userEvent.setup();
    renderLayout();

    window.dispatchEvent(
      new CustomEvent(STORAGE_WRITE_FAILED_EVENT, {
        detail: { key: 'yuzhural-cart', reason: 'quota' },
      })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'браузер не дал сохранить корзину'
    );

    await user.click(screen.getByRole('button', { name: 'Понятно' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('рендерит поиск в шапке как полноценный combobox с listbox и option', async () => {
    vi.useFakeTimers();
    renderLayout();

    const searchInput = screen.getByRole('combobox', {
      name: 'Поиск по каталогу',
    });

    expect(searchInput).toHaveAttribute('aria-autocomplete', 'list');
    expect(searchInput).toHaveAttribute('id', 'header-search');
    expect(searchInput).toHaveAttribute('type', 'search');
    expect(searchInput).toHaveAttribute(
      'aria-controls',
      'header-search-suggestions'
    );
    expect(searchInput).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(searchInput, { target: { value: 'В' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const listbox = screen.getByRole('listbox', {
      name: 'Подсказки поиска по каталогу',
    });
    const options = within(listbox).getAllByRole('option');

    expect(searchInput).toHaveAttribute('aria-expanded', 'true');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('ВВГнг-LS');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(searchInput).toHaveAttribute('aria-activedescendant', options[1].id);

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(searchInput).toHaveValue('АВВГ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('не запрашивает подсказки на каждый символ при быстром вводе', async () => {
    vi.useFakeTimers();
    renderLayout();

    const searchInput = screen.getByRole('combobox', {
      name: 'Поиск по каталогу',
    });

    fireEvent.change(searchInput, { target: { value: 'В' } });
    fireEvent.change(searchInput, { target: { value: 'ВВ' } });
    fireEvent.change(searchInput, { target: { value: 'ВВГ' } });

    expect(fetchProductSuggestions).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(299);
      await Promise.resolve();
    });

    expect(fetchProductSuggestions).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(fetchProductSuggestions).toHaveBeenCalledTimes(1);
    expect(fetchProductSuggestions).toHaveBeenCalledWith(
      'ВВГ',
      7,
      expect.any(AbortSignal)
    );
  });

  it('связывает кнопки мобильного меню и каталога с управляемыми панелями', async () => {
    const user = userEvent.setup();
    renderLayout();

    const mobileMenuButton = screen.getByRole('button', {
      name: 'Открыть меню',
    });
    expect(mobileMenuButton).not.toHaveAttribute('aria-controls');
    expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(mobileMenuButton);

    expect(mobileMenuButton).toHaveAttribute('aria-expanded', 'true');
    expect(mobileMenuButton).toHaveAttribute(
      'aria-controls',
      'mobile-navigation'
    );
    expect(
      await screen.findByRole('dialog', { name: 'Мобильное меню' })
    ).toHaveAttribute('id', 'mobile-navigation');

    await user.click(
      screen.getAllByRole('button', { name: 'Закрыть меню' })[0]
    );

    const catalogButton = await screen.findByRole('button', {
      name: 'Каталог',
    });
    expect(catalogButton).not.toHaveAttribute('aria-controls');
    expect(catalogButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(catalogButton);

    expect(catalogButton).toHaveAttribute('aria-expanded', 'true');
    expect(catalogButton).toHaveAttribute('aria-controls', 'catalog-dropdown');
    expect(document.getElementById('catalog-dropdown')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Силовой кабель' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Силовой кабель' })
    ).not.toBeInTheDocument();
  });
});
