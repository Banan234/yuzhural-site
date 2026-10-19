import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProducts } from './productsApi.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchProducts', () => {
  it('sends the exact mark selected in the alphabetical index', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchProducts(undefined, { search: 'ЗКП', mark: 'ЗКП', limit: 24 });

    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost');
    expect(url.searchParams.get('search')).toBe('ЗКП');
    expect(url.searchParams.get('mark')).toBe('ЗКП');
    expect(url.searchParams.get('limit')).toBe('24');
  });
});
