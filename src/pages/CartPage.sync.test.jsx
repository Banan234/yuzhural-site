// @vitest-environment jsdom
import '../test/renderTestSetup.js';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CartPage from './CartPage.jsx';
import { useCartStore } from '../store/useCartStore.js';
import { calculateQuote } from '../../shared/quoteMoney.js';
const saved = {
  id: 1,
  sku: 'SYNTHETIC',
  slug: 'synthetic',
  title: 'Синтетический кабель',
  unit: 'м',
  price: 1,
  stock: 100,
  quantity: 1,
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const response = (payload, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => payload,
});
function mount(strict = true) {
  const page = (
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}
beforeEach(() => useCartStore.setState({ items: [{ ...saved }] }));

describe('CartPage one-time catalog refresh lifecycle', () => {
  it('restarts after StrictMode cleanup, updates commercial values and ignores the late cancelled response', async () => {
    const attempts = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        const d = deferred();
        attempts.push({
          ...d,
          signal: options.signal,
          body: JSON.parse(options.body),
        });
        return d.promise;
      })
    );
    const view = mount();
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[0].signal.aborted).toBe(true);
    expect(attempts[1].signal.aborted).toBe(false);
    expect(attempts[1].body).toEqual({ ids: [1] });
    const fresh = {
      ...saved,
      price: 99.99,
      quantity: 999,
      classificationReview: { previousId: 1 },
    };
    await act(async () =>
      attempts[1].resolve(
        response({ ok: true, found: [fresh], missing: [], pending: [] })
      )
    );
    expect(useCartStore.getState().items[0]).toMatchObject({
      price: 99.99,
      quantity: 1,
    });
    expect(calculateQuote(useCartStore.getState().items).totalKopecks).toBe(
      9999
    );
    expect(screen.getByRole('complementary')).toHaveTextContent('99,99 ₽');
    // Simulate an implementation/server that ignores AbortSignal and returns after the new response.
    await act(async () =>
      attempts[0].resolve(
        response({
          ok: true,
          found: [{ ...saved, price: 777 }],
          missing: [1],
          pending: [],
        })
      )
    );
    expect(useCartStore.getState().items[0]).toMatchObject({
      price: 99.99,
      quantity: 1,
    });
    expect(screen.queryByText(/Сняты с поставки/)).not.toBeInTheDocument();
    // Store quantity changes must not introduce a periodic/dependency-triggered refresh.
    act(() => useCartStore.getState().updateItemQuantity(1, 0.75));
    expect(attempts).toHaveLength(2);
    view.unmount();
  });
  it('ignores an aborted response even when its JSON finishes parsing late', async () => {
    const json = deferred();
    let n = 0;
    const last = deferred();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        ++n === 1
          ? Promise.resolve({ ok: true, json: () => json.promise })
          : last.promise
      )
    );
    mount();
    await waitFor(() => expect(n).toBe(2));
    await act(async () =>
      last.resolve(
        response({
          ok: true,
          found: [{ ...saved, price: 123.45 }],
          missing: [],
        })
      )
    );
    await act(async () =>
      json.resolve({ ok: true, found: [], missing: [1], pending: [] })
    );
    expect(useCartStore.getState().items[0].price).toBe(123.45);
  });
  it.each(['abort', 'network', '503'])(
    'preserves the previous snapshot on %s instead of reporting zero/missing',
    async (kind) => {
      const attempts = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          const d = deferred();
          attempts.push(d);
          return d.promise;
        })
      );
      mount();
      await waitFor(() => expect(attempts).toHaveLength(2));
      await act(async () => {
        if (kind === '503')
          attempts[1].resolve(
            response(
              {
                ok: false,
                found: [],
                missing: [1],
                message: 'Synthetic unavailable',
              },
              503
            )
          );
        else
          attempts[1].reject(
            kind === 'abort'
              ? new DOMException('Synthetic abort', 'AbortError')
              : new TypeError('Synthetic network failure')
          );
      });
      expect(useCartStore.getState().items).toEqual([saved]);
      expect(
        screen.queryByText(/Сняты с поставки|Данные уточняются:/)
      ).not.toBeInTheDocument();
      expect(screen.getByRole('complementary')).toHaveTextContent('1,00 ₽');
    }
  );
  it.each([true, false])(
    'excludes only explicit pending/missing and preserves normal/review/manual quantities (StrictMode=%s)',
    async (strict) => {
      useCartStore.setState({
        items: [
          saved,
          { ...saved, id: 2, unit: 'кг', quantity: 1.5 },
          { ...saved, id: 3, quantity: 2.25 },
          { ...saved, id: 4 },
          { ...saved, id: 5 },
          { ...saved, id: 'manual-test', manual: true, quantity: 3, price: 0 },
        ],
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          response({
            ok: true,
            found: [
              { ...saved, price: 99.99 },
              { ...saved, id: 2, unit: 'кг', price: 10.015 },
              {
                ...saved,
                id: 3,
                price: 123.45,
                classificationReview: { previousId: 3 },
              },
            ],
            missing: [4, 5],
            pending: [4],
          })
        )
      );
      mount(strict);
      await waitFor(() =>
        expect(useCartStore.getState().items.map((p) => p.id)).toEqual([
          1,
          2,
          3,
          'manual-test',
        ])
      );
      expect(useCartStore.getState().items.map((p) => p.quantity)).toEqual([
        1, 2, 3, 3,
      ]);
      const money = calculateQuote(useCartStore.getState().items);
      expect(money.rows.map((r) => r.lineKopecks)).toEqual([
        9999,
        2003,
        37035,
        null,
      ]);
      expect(money.knownSubtotalKopecks).toBe(49037);
      expect(money.totalPrice).toBeNull();
      expect(money.unknownPriceCount).toBe(1);
      // Store updates are synchronous; the local React notice commits afterwards.
      expect(
        await screen.findByText('Данные уточняются: 1')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Сняты с поставки и удалены: 1/)
      ).toBeInTheDocument();
    }
  );
  it('does not apply a request that resolves after the page unmounts', async () => {
    const d = deferred();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => d.promise)
    );
    const view = mount(false);
    view.unmount();
    await act(async () =>
      d.resolve(response({ ok: true, found: [], missing: [1], pending: [] }))
    );
    expect(useCartStore.getState().items).toEqual([saved]);
  });
});
