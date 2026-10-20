// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchProductSuggestions } from '../../lib/productsApi.js';
import HeaderSearch from './HeaderSearch.jsx';

vi.mock('../../lib/productsApi.js', () => ({
  fetchProductSuggestions: vi.fn(),
}));
vi.mock('../../lib/analytics.js', () => ({ trackEvent: vi.fn() }));
function setup(entry = '/catalog/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <HeaderSearch /> }],
    { initialEntries: [entry] }
  );
  render(<RouterProvider router={router} />);
  return {
    router,
    input: screen.getByRole('combobox', { name: 'Поиск по каталогу' }),
  };
}
beforeEach(() => fetchProductSuggestions.mockReset().mockResolvedValue([]));
afterEach(() => vi.useRealTimers());

it('starts a new search without stale mark, price, category, cores or page filters', async () => {
  const { router, input } = setup(
    '/catalog/?search=КГ&mark=КГ&priceMin=2000&priceMax=1&cores=4&section=16&category=provoda&page=6&limit=48&sort=price-asc'
  );
  fireEvent.change(input, { target: { value: 'ВВГ 185' } });
  fireEvent.submit(input.closest('form'));
  await waitFor(() => expect(router.state.location.search).toContain('185'));
  expect(
    Object.fromEntries(new URLSearchParams(router.state.location.search))
  ).toEqual({ search: 'ВВГ 185', limit: '48', sort: 'price-asc' });
  expect(router.state.location.pathname).toBe('/catalog/');
});
it('selecting a suggestion retains the section and adds the selected mark', async () => {
  fetchProductSuggestions.mockResolvedValue([
    { key: 'ввг', mark: 'ВВГ', query: 'ВВГ 185', filterMark: 'ВВГ', count: 4 },
  ]);
  const { router, input } = setup('/catalog/?search=ВВГ%20185');
  fireEvent.focus(input);
  fireEvent.click(await screen.findByRole('option', { name: /ВВГ/ }));
  await waitFor(() =>
    expect(new URLSearchParams(router.state.location.search).get('mark')).toBe(
      'ВВГ'
    )
  );
  expect(new URLSearchParams(router.state.location.search).get('search')).toBe(
    'ВВГ 185'
  );
});
it('keyboard selection applies an explicit correction and preserves dimensions', async () => {
  fetchProductSuggestions.mockResolvedValue([
    {
      key: 'correction',
      mark: 'ввг 3х2.5',
      query: 'ввг 3х2.5',
      type: 'correction',
      count: 5,
    },
  ]);
  const { router, input } = setup('/catalog/?search=ddu%203х2.5');
  fireEvent.focus(input);
  await screen.findByRole('option', { name: /Возможно/ });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(
      new URLSearchParams(router.state.location.search).get('search')
    ).toBe('ввг 3х2.5')
  );
  expect(new URLSearchParams(router.state.location.search).has('mark')).toBe(
    false
  );
});
it('discards a response for an older query even if the server ignores cancellation', async () => {
  vi.useFakeTimers();
  let resolveOld;
  fetchProductSuggestions.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      })
  );
  fetchProductSuggestions.mockResolvedValueOnce([
    { key: 'new', mark: 'ПУГВ', count: 2 },
  ]);
  const { input } = setup('/catalog/?search=ВВГ');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'ПУГВ' } });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  expect(screen.getByRole('option', { name: /ПУГВ/ })).toBeVisible();
  await act(async () => {
    resolveOld([{ key: 'old', mark: 'ВВГ', count: 20 }]);
  });
  expect(screen.queryByRole('option', { name: /ВВГ/ })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /ПУГВ/ })).toBeVisible();
});
