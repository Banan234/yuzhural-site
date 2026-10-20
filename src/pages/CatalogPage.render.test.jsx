// @vitest-environment jsdom
// Файл проверяет рендер страницы каталога, фильтры, состояния загрузки и SEO-элементы.

import '../test/renderTestSetup.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from '../lib/productsApi.js';
import { SITE_URL } from '../lib/siteConfig.js';
import { toCanonicalSitePath } from '../lib/canonicalPaths.js';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import CatalogPage, {
  doesCatalogPrerenderDataMatchQuery,
} from './CatalogPage.jsx';

vi.mock('../lib/productsApi.js', () => ({
  fetchProducts: vi.fn(),
}));

function renderCatalogPage(initialEntry = '/catalog', prerenderData = {}) {
  render(
    <PrerenderDataProvider data={prerenderData}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/:slug" element={<CatalogPage />} />
        </Routes>
      </MemoryRouter>
    </PrerenderDataProvider>
  );
}

it('offers an explicit correction without replacing the query', async () => {
  fetchProducts.mockResolvedValue({
    items: [],
    meta: {
      total: 0,
      search: {
        matchedBeforeFilters: 0,
        corrections: [{ query: 'ВВГ 3х2.5', count: 4 }],
      },
    },
  });
  renderCatalogPage('/catalog/?search=ddu%203х2.5');
  const correction = await screen.findByRole('link', { name: 'ВВГ 3х2.5' });
  expect(correction.getAttribute('href')).toBe(
    `/catalog/?${new URLSearchParams({ search: 'ВВГ 3х2.5' })}`
  );
  expect(screen.getByText('Поиск: «ddu 3х2.5»')).toBeVisible();
});

it('explains when filters hide existing search matches', async () => {
  fetchProducts.mockResolvedValue({
    items: [],
    meta: { total: 0, search: { matchedBeforeFilters: 4, corrections: [] } },
  });
  renderCatalogPage('/catalog/?search=ВВГ%20185&priceMin=99999');
  expect(
    await screen.findByRole('link', { name: 'Показать без фильтров' })
  ).toHaveAttribute(
    'href',
    `/catalog/?${new URLSearchParams({ search: 'ВВГ 185' })}`
  );
});

beforeEach(() => {
  fetchProducts.mockReset();
  fetchProducts.mockResolvedValue({
    items: [],
    meta: {
      total: 0,
      catalogCount: 0,
      catalogSections: [
        {
          slug: 'kabel-i-provod',
          name: 'Кабель и провод',
          categories: [],
        },
      ],
    },
  });
});

describe('CatalogPage', () => {
  it.each([
    ['kabeli-peredachi-dannykh', 'Кабели передачи данных'],
    ['lan-kabeli', 'LAN-кабели — витая пара'],
    ['kabeli-svyazi', 'Кабели связи'],
  ])('открывает товары и правильного родителя для %s', async (slug, title) => {
    renderCatalogPage(`/catalog/${slug}`);
    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: slug })
      )
    );
    expect(
      screen.getByRole('heading', { level: 1, name: title })
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
    if (slug !== 'kabeli-peredachi-dannykh')
      expect(
        screen.getByRole('link', { name: 'Кабели передачи данных' })
      ).toHaveAttribute('href', '/catalog/kabeli-peredachi-dannykh');
  });
  it('открывает все нагревательные товары сразу и сохраняет родителя подкатегории', async () => {
    renderCatalogPage('/catalog/kabeli-nagrevatelnye');
    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'kabeli-nagrevatelnye' })
      )
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Кабели нагревательные' })
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
  });

  it('показывает родителя саморегулирующихся кабелей', async () => {
    renderCatalogPage('/catalog/samoreguliruyushchiesya-kabeli');
    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'samoreguliruyushchiesya-kabeli' })
      )
    );
    expect(
      screen.getByRole('link', { name: 'Кабели нагревательные' })
    ).toHaveAttribute('href', '/catalog/kabeli-nagrevatelnye');
  });
  it('открывает товары общего раздела управления и контроля сразу', async () => {
    fetchProducts.mockResolvedValue({
      items: [
        {
          id: 3,
          slug: 'kvvg-7x1',
          title: 'КВВГ 7х1',
          mark: 'КВВГ',
          price: 100,
          stock: 10,
        },
      ],
      meta: {
        total: 1,
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        catalogSections: [],
      },
    });
    renderCatalogPage('/catalog/kontrolnyy-kabel');
    expect(
      await screen.findByRole('link', { name: 'КВВГ 7х1' })
    ).toHaveAttribute('href', '/product/kvvg-7x1');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Кабель управления и контроля',
      })
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
  });

  it('показывает общий раздел родителем объединённой сигнализации', async () => {
    renderCatalogPage('/catalog/signalno-blokirovochnye');
    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'signalno-blokirovochnye' })
      )
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Кабель для сигнализации и блокировки',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Кабель управления и контроля' })
    ).toHaveAttribute('href', '/catalog/kontrolnyy-kabel');
  });

  it('сразу показывает товары проводов, а подкатегории доступны по отдельным ссылкам', async () => {
    fetchProducts.mockResolvedValue({
      items: [
        {
          id: 2,
          slug: 'pugv-1x2-5',
          title: 'ПуГВ 1х2,5',
          mark: 'ПуГВ',
          price: 50,
          stock: 10,
        },
      ],
      meta: {
        total: 1,
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        catalogSections: [
          {
            slug: 'kabel-i-provod',
            name: 'Кабель и провод',
            categories: [
              {
                slug: 'provoda',
                name: 'Провода',
                subcategories: [{ slug: 'provoda-ustanovochnye', count: 1 }],
              },
            ],
          },
        ],
      },
    });
    renderCatalogPage('/catalog/provoda');
    expect(
      await screen.findByRole('link', { name: 'ПуГВ 1х2,5' })
    ).toHaveAttribute('href', '/product/pugv-1x2-5');
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
  });

  it('сразу показывает товары силового кабеля вместо подкатегорий', async () => {
    fetchProducts.mockResolvedValue({
      items: [
        {
          id: 1,
          slug: 'vvg-3x2-5',
          title: 'ВВГ 3х2,5',
          mark: 'ВВГ',
          price: 100,
          stock: 10,
        },
      ],
      meta: {
        total: 1,
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        catalogSections: [
          {
            slug: 'kabel-i-provod',
            name: 'Кабель и провод',
            categories: [
              {
                slug: 'silovoy-kabel',
                name: 'Силовой кабель',
                subcategories: [{ slug: 'silovoy-kabel-spe', count: 1 }],
              },
            ],
          },
        ],
      },
    });
    renderCatalogPage('/catalog/silovoy-kabel');
    expect(
      await screen.findByRole('link', { name: 'ВВГ 3х2,5' })
    ).toHaveAttribute('href', '/product/vvg-3x2-5');
    expect(fetchProducts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: 'silovoy-kabel' })
    );
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
    expect(screen.queryByText(/Найдено:/)).not.toBeInTheDocument();
  });

  it('открывает выдачу подкатегории с родителем в хлебных крошках', async () => {
    renderCatalogPage('/catalog/silovoy-kabel-bronirovannyy');
    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'silovoy-kabel-bronirovannyy' })
      )
    );
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Кабель бронированный силовой',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Силовой кабель' })
    ).toHaveAttribute('href', '/catalog/silovoy-kabel');
    expect(document.querySelectorAll('.subcategory-card')).toHaveLength(0);
  });
  it('оставляет общий h1 на /catalog, даже если API вернул одну секцию', async () => {
    renderCatalogPage();

    await waitFor(() => expect(fetchProducts).toHaveBeenCalled());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Каталог продукции' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Кабель и провод' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}${toCanonicalSitePath('/catalog')}`
    );
  });

  it('не делает fetch, если prerender data совпадает с /catalog', () => {
    const prerenderData = {
      catalog: {
        path: '/catalog',
        items: [
          {
            id: 1,
            slug: 'vvg-3x2-5',
            title: 'ВВГ 3х2,5',
            mark: 'ВВГ',
            price: 100,
            stock: 10,
          },
        ],
        catalogSections: [],
        meta: {
          total: 1,
          catalogCount: 1,
          pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        },
      },
    };

    renderCatalogPage('/catalog', prerenderData);

    expect(fetchProducts).not.toHaveBeenCalled();
    expect(screen.getByText('ВВГ 3х2,5')).toBeInTheDocument();
  });

  it('не показывает prerender-товары, если query не совпадает с /catalog', () => {
    fetchProducts.mockReturnValue(new Promise(() => {}));
    const prerenderData = {
      catalog: {
        path: '/catalog',
        items: [
          {
            id: 1,
            slug: 'vvg-3x2-5',
            title: 'ВВГ 3х2,5',
            mark: 'ВВГ',
            price: 100,
            stock: 10,
          },
        ],
        catalogSections: [],
        meta: {
          total: 1,
          catalogCount: 1,
          pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
        },
      },
    };

    renderCatalogPage('/catalog?search=кг', prerenderData);

    expect(screen.queryByText('ВВГ 3х2,5')).not.toBeInTheDocument();
    expect(
      screen.getByText('Подготавливаем товары из прайса...')
    ).toBeInTheDocument();
    expect(fetchProducts).toHaveBeenCalledTimes(1);
  });

  it('считает prerender data неподходящими при фильтрах или другой странице', () => {
    const prerenderData = {
      path: '/catalog',
      meta: {
        pagination: { page: 1, limit: 24 },
      },
    };

    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24 },
      })
    ).toBe(true);
    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24, page: 2 },
      })
    ).toBe(false);
    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24, search: 'ввг' },
      })
    ).toBe(false);
    expect(
      doesCatalogPrerenderDataMatchQuery({
        activeCategoryParam: '',
        prerenderData,
        productQueryOptions: { limit: 24, mark: 'ВВГ' },
      })
    ).toBe(false);
  });

  it('передаёт точную марку из перечня в API и показывает её в выдаче', async () => {
    renderCatalogPage('/catalog?search=ЗКП&mark=ЗКП');

    await waitFor(() =>
      expect(fetchProducts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ search: 'ЗКП', mark: 'ЗКП' })
      )
    );
    expect(screen.getByText(/Марка «ЗКП»/)).toBeInTheDocument();
  });

  it('передает расширенные фильтры для категории силового кабеля из общего каталога', async () => {
    renderCatalogPage(
      '/catalog?category=silovoy-kabel&powerGroup=Сшитый+полиэтилен+%28XLPE%29&appType=силовой&spe=1'
    );

    await waitFor(() => expect(fetchProducts).toHaveBeenCalled());

    expect(fetchProducts.mock.calls[0][1]).toMatchObject({
      category: 'silovoy-kabel',
      powerGroup: 'Сшитый полиэтилен (XLPE)',
      appType: 'силовой',
      spe: '1',
    });
  });

  it('показывает 404 для несуществующего category slug и не делает fetch', () => {
    renderCatalogPage('/catalog/__missing__');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Страница не найдена' })
    ).toBeInTheDocument();
    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it('рендерит section slug из sitemap как валидный route', async () => {
    renderCatalogPage('/catalog/kabel-i-provod');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Кабель и провод' })
    ).toBeInTheDocument();
    expect(fetchProducts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: 'kabel-i-provod' })
    );
  });
});
