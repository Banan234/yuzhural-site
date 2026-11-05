// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { act, lazy } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import MainLayout from './MainLayout.jsx';
import { useCartStore } from '../../store/useCartStore.js';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(window, 'scrollY', {
    value: 0,
    writable: true,
    configurable: true,
  });
});

it.each([
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [true, true, false],
  [true, false, true],
])(
  'hydrates a deferred route with persisted cart filled=%s, early scroll=%s and restored scroll=%s',
  async (filled, scroll, restoredScroll) => {
    useCartStore.setState({
      items: filled
        ? [{ id: 1, title: 'Fixture', quantity: 2, price: 10, unit: 'м' }]
        : [],
    });
    const errors = [];
    function Content() {
      return <h1>Hydratable route</h1>;
    }
    function makeRouter(Page) {
      return createMemoryRouter([
        {
          path: '/',
          element: <MainLayout />,
          children: [{ index: true, element: <Page /> }],
        },
      ]);
    }
    const server = makeRouter(Content);
    const host = document.createElement('div');
    host.innerHTML = renderToString(<RouterProvider router={server} />);
    document.body.append(host);
    const originalHeading = host.querySelector('h1');
    let release;
    const DeferredPage = lazy(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ default: Content });
        })
    );
    if (restoredScroll) window.scrollY = 600;
    const client = makeRouter(DeferredPage);
    let root;
    try {
      await act(async () => {
        root = hydrateRoot(host, <RouterProvider router={client} />, {
          onRecoverableError: (error) => errors.push(error.message),
        });
        await new Promise((resolve) => setTimeout(resolve, 40));
      });
      if (scroll)
        await act(async () => {
          window.scrollY = 600;
          window.dispatchEvent(new Event('scroll'));
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      // The store has already published its browser snapshot while the route waits.
      expect(host.querySelector('h1')).toBe(originalHeading);
      expect(
        [...host.querySelectorAll('.cart-badge')].map((el) => el.textContent)
      ).toEqual(filled ? ['1', '1'] : []);
      await act(async () => {
        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(host.querySelector('h1')).toBe(originalHeading);
      expect(errors).toEqual([]);
    } finally {
      await act(async () => root?.unmount());
      server.dispose();
      client.dispose();
      host.remove();
      useCartStore.setState({ items: [] });
    }
  }
);
