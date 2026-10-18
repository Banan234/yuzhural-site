// @vitest-environment jsdom
// Файл проверяет рендер главной страницы, SEO, hero-форму и ключевые блоки витрины.

import '../test/renderTestSetup.js';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createRouteObjects } from '../app/routes.jsx';
import { render as renderRouteToString } from '../entry-server.jsx';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import CatalogPage from './CatalogPage.jsx';
import ProductPage from './ProductPage.jsx';
import CartPage from './CartPage.jsx';
import ContactsPage from './ContactsPage.jsx';
import DeliveryPage from './DeliveryPage.jsx';
import PaymentPage from './PaymentPage.jsx';
import PrivacyPage from './PrivacyPage.jsx';
import AboutPage from './AboutPage.jsx';
import NotFoundPage from './NotFoundPage.jsx';
import HomePage from './HomePage.jsx';

const featuredProduct = {
  id: 101,
  slug: 'vvgng-ls-3h2-5',
  sku: 'SKU-101',
  title: 'ВВГнг(A)-LS 3х2,5',
  mark: 'ВВГнг(A)-LS',
  category: 'Силовой кабель',
  catalogCategory: 'Силовой кабель',
  price: 125.5,
  unit: 'м',
  stock: 42,
  shortDescription: 'ВВГнг(A)-LS · 3х2,5 мм2',
  image: '/product-placeholder.svg',
};

const HOME_PRERENDER_DATA = {
  home: {
    featuredProducts: [featuredProduct],
  },
};

function extractInternalHrefsFromHtml(html) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href) => href.startsWith('/'));
}

function getRenderedInternalHrefs() {
  return [...document.querySelectorAll('a[href^="/"]')].map((link) =>
    link.getAttribute('href')
  );
}

function expectCanonicalHomepageHrefs(hrefs) {
  expect(hrefs).toContain('/catalog/');
  expect(hrefs).toContain('/payment/');
  expect(hrefs).toContain('/delivery/');
  expect(hrefs).toContain('/about/');
  expect(hrefs).toContain('/contacts/');
  expect(hrefs).toContain('/catalog/?category=Силовой%20кабель');
  expect(hrefs).toContain('/catalog/kontrolnye-kabeli');
  expect(hrefs).toContain('/catalog/kabeli-svyazi');
  expect(hrefs).toContain('/catalog/?category=Гибкий%20кабель');

  expect(hrefs).not.toContain('/catalog');
  expect(hrefs).not.toContain('/payment');
  expect(hrefs).not.toContain('/delivery');
  expect(hrefs).not.toContain('/about');
  expect(hrefs).not.toContain('/contacts');
  expect(hrefs).not.toContain('/catalog?category=Силовой%20кабель');
  expect(hrefs).not.toContain('/catalog?category=Контрольный%20кабель');
  expect(hrefs).not.toContain('/catalog?category=Кабели%20связи');
  expect(hrefs).not.toContain('/catalog?category=Гибкий%20кабель');
}

function renderHomeRoute() {
  const router = createMemoryRouter(
    createRouteObjects({
      HomePage,
      CatalogPage,
      ProductPage,
      CartPage,
      ContactsPage,
      DeliveryPage,
      PaymentPage,
      PrivacyPage,
      AboutPage,
      NotFoundPage,
    }),
    {
      initialEntries: ['/'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }
  );

  render(
    <PrerenderDataProvider data={HOME_PRERENDER_DATA}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </PrerenderDataProvider>
  );
}

describe('HomePage SSR render', () => {
  it('рендерит складскую витрину из prerender data без loading-фолбэка', () => {
    const html = renderToString(
      <MemoryRouter>
        <PrerenderDataProvider data={HOME_PRERENDER_DATA}>
          <HomePage />
        </PrerenderDataProvider>
      </MemoryRouter>
    );

    expect(html).toContain('Товары из каталога');
    expect(html).toContain('ВВГнг(A)-LS 3х2,5');
    expect(html).not.toContain('Загружаем актуальные позиции');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain('<!--$!--><template');
  });

  it('оставляет на главной только canonical internal href в SSR-разметке', () => {
    const html = renderRouteToString('/', {
      prerenderData: HOME_PRERENDER_DATA,
    });

    expectCanonicalHomepageHrefs(extractInternalHrefsFromHtml(html));
  });

  it('рендерит на главной canonical internal href в DOM после полной отрисовки layout', async () => {
    renderHomeRoute();

    expect(
      await screen.findByRole('heading', {
        name: 'Кабель для вашего проекта — с расчётом в рабочий день',
      })
    ).toBeInTheDocument();

    expectCanonicalHomepageHrefs(getRenderedInternalHrefs());
  });
});
