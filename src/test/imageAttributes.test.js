// @vitest-environment jsdom
// Audit rendered production images, including props forwarded through <picture> helpers.
import './renderTestSetup.js';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { prepareProductDetail } from '../../lib/productPresentation.js';
import { render as renderRoute } from '../entry-server.jsx';
import ProductCard from '../components/ui/ProductCard.jsx';
import ResponsiveProductImage from '../components/ui/ResponsiveProductImage.jsx';
import MobileNav from '../components/layout/MobileNav.jsx';
import CartPage from '../pages/CartPage.jsx';
import HomePage from '../pages/HomePage.jsx';
import ProductPage from '../pages/ProductPage.jsx';
import QualityPage from '../pages/QualityPage.jsx';
import { PrerenderDataProvider } from '../lib/prerenderData.jsx';
import { useCartStore } from '../store/useCartStore.js';

vi.mock('../../data/companyEvidence.json', () => ({
  default: {
    certificates: [],
    reviews: [],
    projects: [
      {
        approved: true,
        title: 'Synthetic project',
        description: 'Fixture only',
        image: '/synthetic-project.png',
      },
    ],
  },
}));

const product = {
  id: 101,
  sku: 'IMAGE-FIXTURE',
  slug: 'image-fixture',
  name: 'ВВГ 3х2,5',
  title: 'ВВГ 3х2,5',
  fullName: 'ВВГ 3х2,5',
  mark: 'ВВГ',
  category: 'Силовой кабель',
  unit: 'м',
  price: 120,
  stock: 50,
  image: '/product-placeholder.svg',
  imageVariants: [{ src: '/fixture.webp', width: 320 }],
  quantity: 1,
};
const required = ['width', 'height', 'loading', 'decoding'];

function imageProblems(root) {
  return [...root.querySelectorAll('img')].flatMap((image, index) => {
    const invalid = required.filter((attribute) => {
      const value = image.getAttribute(attribute);
      if (attribute === 'width' || attribute === 'height')
        return !(Number(value) > 0);
      return !(
        attribute === 'loading' ? ['lazy', 'eager'] : ['sync', 'async', 'auto']
      ).includes(value);
    });
    if (!image.hasAttribute('alt')) invalid.push('alt');
    return invalid.map(
      (attribute) =>
        `${index}:${image.getAttribute('src')} missing/invalid ${attribute}`
    );
  });
}
function htmlRoot(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}
function expectImages(root, selector) {
  // Prevent an empty/loading/error branch from making the audit pass vacuously.
  expect(root.querySelectorAll(selector).length, selector).toBeGreaterThan(0);
  expect(imageProblems(root)).toEqual([]);
}
function inRouter(component) {
  return h(MemoryRouter, null, component);
}

describe('rendered production image attributes', () => {
  it('checks home/layout/hero/quote images and featured product calls', () => {
    const root = htmlRoot(
      renderToStaticMarkup(
        inRouter(
          h(
            PrerenderDataProvider,
            { data: { home: { featuredProducts: [product] } } },
            h(HomePage)
          )
        )
      )
    );
    expectImages(root, '.home-concept__quote-visual picture img');
    expectImages(root, '.home-concept__hero img');
    expectImages(htmlRoot(renderRoute('/')), '.site-header img');
    expectImages(root, '#stock-now .product-card img');
  });
  it('checks the product-page production call with responsive variants', () => {
    const root = htmlRoot(
      renderToStaticMarkup(
        h(
          MemoryRouter,
          { initialEntries: ['/product/image-fixture'] },
          h(
            PrerenderDataProvider,
            {
              data: {
                product: {
                  ...prepareProductDetail(product),
                  image: product.image,
                  imageVariants: product.imageVariants,
                },
              },
            },
            h(
              Routes,
              null,
              h(Route, { path: '/product/:slug', element: h(ProductPage) })
            )
          )
        )
      )
    );
    expectImages(root, '.product-page__image');
    expect(
      root.querySelector('.product-page__media source').getAttribute('srcset')
    ).toContain('/fixture.webp 320w');
  });
  it.each(['default', 'stock', 'catalog-list'])(
    'checks ProductCard %s and forwarded props with and without variants',
    (variant) => {
      for (const imageVariants of [[], product.imageVariants]) {
        const root = htmlRoot(
          renderToStaticMarkup(
            inRouter(
              h(ProductCard, {
                product: { ...product, imageVariants },
                variant,
              })
            )
          )
        );
        expectImages(root, 'img');
      }
    }
  );
  it('checks quality document images', () => {
    const root = htmlRoot(renderToStaticMarkup(inRouter(h(QualityPage))));
    expectImages(root, '.evidence-grid img');
  });
  it('checks the open mobile menu production branch', () => {
    const root = htmlRoot(
      renderToStaticMarkup(
        inRouter(h(MobileNav, { isOpen: true, onClose() {}, onOpenQuote() {} }))
      )
    );
    expectImages(root, '.mobile-nav img');
  });
  it('checks the populated cart branch', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, found: [product], missing: [] }),
      })
    );
    useCartStore.setState({ items: [product] });
    try {
      const { container } = render(inRouter(h(CartPage)));
      expectImages(container, '.cart-item img');
    } finally {
      useCartStore.setState({ items: [] });
    }
  });
  it.each(required)(
    'detects a missing %s after forwarding, in both helper branches',
    (attribute) => {
      for (const variants of [[], product.imageVariants]) {
        const props = {
          src: '/negative-control.png',
          alt: '',
          width: 320,
          height: 200,
          loading: 'lazy',
          decoding: 'async',
          variants,
        };
        delete props[attribute];
        const root = htmlRoot(
          renderToStaticMarkup(h(ResponsiveProductImage, props))
        );
        expect(imageProblems(root)).toEqual([
          `0:/negative-control.png missing/invalid ${attribute}`,
        ]);
      }
    }
  );
  it.each(required)(
    'detects removal of %s from an actual production image',
    (attribute) => {
      const root = htmlRoot(
        renderToStaticMarkup(inRouter(h(ProductCard, { product })))
      );
      expectImages(root, 'img');
      const image = root.querySelector('img');
      image.removeAttribute(attribute);
      expect(imageProblems(root)).toEqual([
        `0:${image.getAttribute('src')} missing/invalid ${attribute}`,
      ]);
    }
  );
});
