// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getProductBreadcrumbs } from '../../lib/productSeo.js';
import Breadcrumbs from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('links to home and marks the current page without a self-link', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs current="Оплата" />
      </MemoryRouter>
    );
    const nav = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    expect(within(nav).getByRole('link', { name: 'Главная' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(within(nav).getByText('Оплата')).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).queryByRole('link', { name: 'Оплата' })).toBeNull();
  });

  it('uses the same product hierarchy as structured data and renders all parents', () => {
    const items = getProductBreadcrumbs({
      title: 'ВВГнг(А)-LS 3х2.5',
      slug: 'vvg-3-2-5',
      catalogSection: 'Силовые кабели',
      catalogSectionSlug: 'silovoy-kabel',
      catalogCategory: 'Медные кабели',
      catalogCategorySlug: 'mednye-kabeli',
      catalogSubcategory: 'Кабели с пониженным дымовыделением',
      catalogSubcategorySlug: 'ls-kabeli',
    });
    render(
      <MemoryRouter>
        <Breadcrumbs items={items} />
      </MemoryRouter>
    );
    const nav = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      items.slice(0, -1).map((item) => item.to)
    );
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(within(nav).getByText(items.at(-1).label)).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('includes navigation in server-rendered HTML', () => {
    const html = renderToString(
      <MemoryRouter>
        <Breadcrumbs current="Доставка" />
      </MemoryRouter>
    );
    expect(html).toContain('aria-label="Хлебные крошки"');
    expect(html).toContain('aria-current="page">Доставка');
    expect(html).toContain('href="/"');
  });

  it('omits breadcrumbs when the path only contains home', () => {
    const { container } = render(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Главная', to: '/' }]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
