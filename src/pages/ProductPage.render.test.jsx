import { prepareProductDetail } from '../../lib/productPresentation.js';
import { buildDescription } from '../../lib/catalog.js';
// @vitest-environment jsdom
// Файл проверяет страницу товара, состояния загрузки, ошибки, SEO и пользовательские действия.

import '../test/renderTestSetup.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchProductBySlug,
  fetchRelatedProducts,
} from '../lib/productsApi.js';
import ProductPage from './ProductPage.jsx';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import { useCartStore } from '../store/useCartStore.js';

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

// API fixtures include the presentation metadata now supplied by the handler.
function mockProductResponse(item) {
  fetchProductBySlug.mockResolvedValue(prepareProductDetail(item));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  fetchProductBySlug.mockReset();
  fetchRelatedProducts.mockReset();
  mockProductResponse(product);
  fetchRelatedProducts.mockResolvedValue([]);
});

describe('ProductPage', () => {
  it.each(['Escape', 'close button', 'backdrop'])(
    'opens the full product image and restores focus after closing with %s',
    async (closeWith) => {
      const user = userEvent.setup();
      renderProductPage();
      const opener = await screen.findByRole('button', {
        name: `Открыть изображение ${product.title}`,
      });
      const previousOverflow = document.body.style.overflow;
      opener.focus();
      await user.keyboard('{Enter}');
      const dialog = screen.getByRole('dialog', {
        name: `Изображение ${product.title}`,
      });
      const image = within(dialog).getByRole('img');
      expect(image).toHaveAttribute(
        'src',
        opener.querySelector('img').getAttribute('src')
      );
      expect(document.body.style.overflow).toBe('hidden');
      await user.click(image);
      expect(dialog).toBeVisible();
      if (closeWith === 'Escape') await user.keyboard('{Escape}');
      else if (closeWith === 'close button')
        await user.click(
          within(dialog).getByRole('button', { name: 'Закрыть' })
        );
      else await user.click(dialog.parentElement);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(document.body.style.overflow).toBe(previousOverflow);
    }
  );

  it('keeps a classification-review product purchasable at its current commercial values', async () => {
    const originalItems = useCartStore.getState().items;
    useCartStore.setState({ items: [] });
    try {
      mockProductResponse({
        ...product,
        price: 94.3,
        stock: 185,
        classificationReview: { previousId: 1 },
      });
      renderProductPage();
      const buy = await screen.findByRole('button', {
        name: 'Добавить в корзину',
      });
      expect(buy).toBeEnabled();
      fireEvent.click(buy);
      expect(useCartStore.getState().items).toEqual([
        expect.objectContaining({
          id: 1,
          price: 94.3,
          stock: 185,
          quantity: 1,
        }),
      ]);
      expect(screen.queryByText('Данные уточняются')).not.toBeInTheDocument();
    } finally {
      useCartStore.setState({ items: originalItems });
    }
  });
  it('показывает расшифровку позиции и внешние источники', async () => {
    renderProductPage();
    fireEvent.click(
      await screen.findByRole('tab', { name: 'Расшифровка марки' })
    );
    expect(
      await screen.findByRole('heading', { name: /расшифровк/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Изоляция жил из ПВХ')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /применение.*изготовител/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Камский кабель.*применени/i)).toBeInTheDocument();
    expect(screen.getByText(/Подольсккабель.*применени/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: /ХКА.*каталог кабельной продукции/,
      })[0]
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('скрывает служебное описание и неподтверждённую расшифровку', async () => {
    const unknown = {
      ...product,
      mark: 'Неизвестная',
      sourceName: 'Неизвестная 3х2,5',
    };
    mockProductResponse({
      ...unknown,
      description: buildDescription(
        unknown, unknown.category, unknown.unit, unknown.stock
      ),
    });
    renderProductPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: product.title })
    ).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Описание' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Расшифровка марки' })).not.toBeInTheDocument();
    expect(screen.queryByText(/позиция загружена/i)).not.toBeInTheDocument();
  });
  it('даёт полю количества accessible label и скрывает пустого производителя', async () => {
    renderProductPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: product.title })
    ).toBeInTheDocument();

    const quantity = screen.getByRole('spinbutton', { name: /количество/i });
    expect(quantity.id).not.toBe('');
    expect(
      screen.getByRole('button', { name: 'Уменьшить количество товара' })
    ).toHaveAttribute('aria-controls', quantity.id);
    expect(
      screen.getByRole('button', { name: 'Увеличить количество товара' })
    ).toHaveAttribute('aria-controls', quantity.id);
    expect(screen.queryByText(/^Производитель:/)).not.toBeInTheDocument();
  });

  it('показывает цену по запросу при price=0', async () => {
    mockProductResponse({
      ...product,
      price: 0,
    });

    renderProductPage();

    expect(await screen.findByText(/по запросу|рассчитан.*КП/i)).toBeVisible();
    expect(screen.queryByText(/^\s*0(?:[,.]0+)?\s*₽/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\/\s*м$/)).not.toBeInTheDocument();
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

it('показывает только выбранный раздел и открывает разделы по быстрым ссылкам', async () => {
  mockProductResponse({
    ...product,
    specs: { Марка: 'ВВГнг-LS', 'Число жил': 3 },
  });
  renderProductPage();
  expect(
    await screen.findByRole('tabpanel', { name: 'Характеристики' })
  ).toBeVisible();
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(5);
  for (const tab of tabs) {
    fireEvent.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(window.location.hash).toBe(`#${tab.getAttribute('aria-controls')}`);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    for (const panel of screen.getAllByRole('tabpanel', { hidden: true })) {
      if (panel.id === tab.getAttribute('aria-controls'))
        expect(panel).toBeVisible();
      else expect(panel).not.toBeVisible();
    }
  }
  fireEvent.click(screen.getByRole('link', { name: /Все характеристики/ }));
  expect(
    screen.getByRole('tabpanel', { name: 'Характеристики' })
  ).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: /Документы к поставке/ }));
  expect(
    screen.getByRole('tabpanel', { name: 'Партия и документы' })
  ).toBeVisible();
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

it('переключает вкладки стрелками и клавишами Home и End', async () => {
  renderProductPage();
  const tabs = await screen.findAllByRole('tab');
  tabs[0].focus();
  fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
  expect(tabs[1]).toHaveFocus();
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(tabs[1], { key: 'End' });
  expect(tabs.at(-1)).toHaveFocus();
  fireEvent.keyDown(tabs.at(-1), { key: 'ArrowRight' });
  expect(tabs[0]).toHaveFocus();
  fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
  expect(tabs.at(-1)).toHaveFocus();
  fireEvent.keyDown(tabs.at(-1), { key: 'Home' });
  expect(tabs[0]).toHaveFocus();
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

it('открывает раздел по якорю и описание при отсутствии характеристик', async () => {
  window.history.replaceState(null, '', '/#product-marking');
  mockProductResponse({ ...product, specs: {} });
  renderProductPage();
  expect(
    await screen.findByRole('tabpanel', { name: 'Расшифровка марки' })
  ).toBeVisible();
  expect(
    screen.queryByRole('tab', { name: 'Характеристики' })
  ).not.toBeInTheDocument();
  window.history.replaceState(null, '', '/#unknown');
  fireEvent(window, new Event('hashchange'));
  expect(screen.getByRole('tabpanel', { name: 'Описание' })).toBeVisible();
});

it('показывает заполненные покупательские блоки во вкладке описания', async () => {
  window.history.replaceState(null, '', '/#product-description');
  mockProductResponse({
    ...product,
    catalogContent: {
      text: 'Описание исполнения',
      construction: 'Изолированные медные жилы',
      application: 'Подключение приборов',
    },
  });
  renderProductPage();
  expect(await screen.findByText('Описание исполнения')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Конструкция' })).toBeVisible();
  expect(screen.getByText('Подключение приборов')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Как выбрать' })).toBeNull();
});

it('shows pending source data without price, quantity or purchase actions', async () => {
  const { createPendingProduct } =
    await import('../../shared/productAvailability.js');
  mockProductResponse(createPendingProduct(product));
  renderProductPage();
  expect(
    await screen.findByText('Данные уточняются', {
      selector: '[role="status"]',
    })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /добавить в корзину/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /запросить кп/i })
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.queryByText('Ориентировочная цена')).not.toBeInTheDocument();
  expect(screen.queryByText('Остаток в каталоге')).not.toBeInTheDocument();
  expect(
    document.querySelector('#product-jsonld')?.textContent || ''
  ).not.toContain('"@type":"Offer"');
});

it('uses the server 404 on first render and drops it when bootstrap is cleared', async () => {
  const page = (data) => (
    <PrerenderDataProvider data={data}>
      <MemoryRouter initialEntries={['/product/vvgng-ls-3x25']}>
        <ProductPageRoute />
      </MemoryRouter>
    </PrerenderDataProvider>
  );
  function ProductPageRoute() {
    return (
      <Routes>
        <Route path="/product/:slug" element={<ProductPage />} />
      </Routes>
    );
  }
  const firstRender = renderToStaticMarkup(page({ httpStatus: 404 }));
  expect(firstRender).toContain('Страница не найдена');
  expect(firstRender).not.toContain('Загружаем товар');
  const view = render(page({ httpStatus: 404 }));
  expect(
    screen.getByRole('heading', { name: 'Страница не найдена' })
  ).toBeInTheDocument();
  expect(screen.queryByText('Загружаем товар')).not.toBeInTheDocument();
  expect(fetchProductBySlug).not.toHaveBeenCalled();
  view.rerender(page({}));
  expect(
    await screen.findByRole('heading', { name: product.title })
  ).toBeInTheDocument();
  expect(fetchProductBySlug).toHaveBeenCalled();
});

it('keeps an API 503 separate from a missing product', async () => {
  fetchProductBySlug.mockRejectedValue(
    Object.assign(new Error('fixture temporary API outage'), { status: 503 })
  );
  renderProductPage();
  expect(
    await screen.findByText('fixture temporary API outage')
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Не удалось загрузить товар' })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Товар не найден' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Страница не найдена' })
  ).not.toBeInTheDocument();
});
