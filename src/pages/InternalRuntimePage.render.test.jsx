// @vitest-environment jsdom
// Файл проверяет route-level рендер внутренней страницы runtime, happy-path и degraded VK health.

import '../test/renderTestSetup.js';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouteObjects } from '../app/routes.jsx';
import InternalRuntimePage from './InternalRuntimePage.jsx';

const INTERNAL_TOKEN_STORAGE_KEY = 'yuzhural-internal-metrics-token';
const AUTO_REFRESH_INTERVAL_MS = 15_000;

function StubPage() {
  return <div>stub</div>;
}

function renderInternalRuntimeRoute() {
  const router = createMemoryRouter(
    createRouteObjects({
      HomePage: StubPage,
      CatalogPage: StubPage,
      ProductPage: StubPage,
      CartPage: StubPage,
      ContactsPage: StubPage,
      DeliveryPage: StubPage,
      PaymentPage: StubPage,
      PrivacyPage: StubPage,
      AboutPage: StubPage,
      InternalRuntimePage,
      NotFoundPage: StubPage,
    }),
    {
      initialEntries: ['/internal/runtime'],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }
  );

  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  );
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const runtimeSnapshot = {
  ok: true,
  uptime: 127.8,
  ts: 1760000000000,
  runtime: {
    node: 'v20.18.0',
    pid: 4242,
    activeRequests: 3,
  },
};

const readyVkSnapshot = {
  ok: true,
  status: 'ready',
  vk: {
    managerPeerId: '2000000005',
    managerUserIds: ['42', '77'],
    runtime: {
      lastSuccessfulAt: '2026-06-10T07:10:00.000Z',
      lastSuccessfulType: 'message_new',
      lastSuccessfulConversationId: 'chat_42',
      totalSuccessful: 12,
      totalRejected: 2,
      secretMismatchCount: 1,
      lastSecretMismatchAt: '2026-06-10T07:05:00.000Z',
    },
    callback: {
      url: 'https://vk.example.test/api/vk/callback',
      autoConfigureEnabled: true,
      autoConfigure: {
        lastAttemptAt: '2026-06-10T07:15:00.000Z',
        lastSuccessAt: '2026-06-10T06:45:00.000Z',
        lastError: null,
      },
      publicEndpoint: {
        exposure: 'public',
        tunnelProvider: 'ngrok',
        isStablePublicEntryPoint: true,
        operationalRisk: 'low',
        healthy: true,
        lastProbeAt: '2026-06-10T07:16:00.000Z',
        lastHttpStatus: 200,
        lastBodyMatched: true,
        lastError: null,
        consecutiveFailures: 0,
        totalProbes: 19,
      },
    },
  },
};

const refreshedVkSnapshot = {
  ...readyVkSnapshot,
  vk: {
    ...readyVkSnapshot.vk,
    callback: {
      ...readyVkSnapshot.vk.callback,
      publicEndpoint: {
        ...readyVkSnapshot.vk.callback.publicEndpoint,
        lastProbeAt: '2026-06-10T07:20:00.000Z',
        totalProbes: 20,
      },
    },
  },
};

const degradedVkSnapshot = {
  ok: false,
  status: 'degraded',
  vk: {
    ...readyVkSnapshot.vk,
    callback: {
      ...readyVkSnapshot.vk.callback,
      autoConfigure: {
        ...readyVkSnapshot.vk.callback.autoConfigure,
        lastError: {
          message: 'Probe degraded after repeated 503 responses',
        },
      },
      publicEndpoint: {
        ...readyVkSnapshot.vk.callback.publicEndpoint,
        healthy: false,
        lastHttpStatus: 503,
        lastBodyMatched: false,
        lastError: {
          message: 'Probe returned 503',
        },
        consecutiveFailures: 4,
      },
    },
  },
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InternalRuntimePage render flow', () => {
  it('остаётся noindex-страницей без canonical', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderInternalRuntimeRoute();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Internal Runtime' })
    ).toBeInTheDocument();
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute('content')
    ).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('показывает приглашение ввести токен и не ходит в API без него', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Internal Runtime' })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Введите внутренний токен')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Сохранить и обновить' })
    );

    expect(
      await screen.findByText('Укажите INTERNAL_METRICS_TOKEN.')
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('сохраняет введённый токен в sessionStorage, очищает localStorage и делает один цикл загрузки', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer fresh-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    await user.type(
      screen.getByLabelText('INTERNAL_METRICS_TOKEN'),
      'fresh-token'
    );
    await user.click(
      screen.getByRole('button', { name: 'Сохранить и обновить' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText('INTERNAL_METRICS_TOKEN')).toHaveValue(
      'fresh-token'
    );
    expect(sessionStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBe(
      'fresh-token'
    );
    expect(localStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('приоритетно читает токен из sessionStorage и удаляет stale localStorage', async () => {
    sessionStorage.setItem(INTERNAL_TOKEN_STORAGE_KEY, 'session-token');
    localStorage.setItem(INTERNAL_TOKEN_STORAGE_KEY, 'legacy-token');

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer session-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText('INTERNAL_METRICS_TOKEN')).toHaveValue(
      'session-token'
    );
    expect(localStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('мигрирует legacy токен из localStorage в sessionStorage и использует его для initial load', async () => {
    localStorage.setItem(INTERNAL_TOKEN_STORAGE_KEY, 'legacy-token');

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer legacy-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText('INTERNAL_METRICS_TOKEN')).toHaveValue(
      'legacy-token'
    );
    expect(sessionStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBe(
      'legacy-token'
    );
    expect(localStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('рендерит runtime и VK метрики при валидном токене и умеет refresh probe', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      INTERNAL_TOKEN_STORAGE_KEY,
      'test-runtime-token'
    );

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer test-runtime-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      if (url === '/api/vk/health?refresh=1') {
        return Promise.resolve(jsonResponse(refreshedVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(screen.getByText('v20.18.0')).toBeInTheDocument();
    expect(screen.getByText('128 сек')).toBeInTheDocument();
    expect(screen.getByText('2000000005')).toBeInTheDocument();
    expect(screen.getByText('42, 77')).toBeInTheDocument();
    expect(
      screen.getByText('https://vk.example.test/api/vk/callback')
    ).toBeInTheDocument();
    expect(screen.getByText('ngrok')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Проверить callback URL' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(
      fetchMock.mock.calls.some(([url]) => url === '/api/vk/health?refresh=1')
    ).toBe(true);
  });

  it('не падает на 503 от /api/vk/health с валидным JSON и показывает degraded статус', async () => {
    window.sessionStorage.setItem(
      INTERNAL_TOKEN_STORAGE_KEY,
      'test-runtime-token'
    );

    const fetchMock = vi.fn((url) => {
      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(
          jsonResponse(degradedVkSnapshot, { ok: false, status: 503 })
        );
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    const badge = await screen.findByText('degraded');
    expect(badge).toHaveClass('internal-runtime__badge--warn');
    expect(screen.getByText('v20.18.0')).toBeInTheDocument();
    expect(screen.getByText('4242')).toBeInTheDocument();
    expect(screen.getByText('128 сек')).toBeInTheDocument();
    expect(screen.getByText('Probe returned 503')).toBeInTheDocument();
    expect(
      screen.getByText('Probe degraded after repeated 503 responses')
    ).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('Нет')).toBeInTheDocument();
    expect(screen.getByText('chat_42')).toBeInTheDocument();
    expect(
      screen.queryByText('Не удалось загрузить диагностику.')
    ).not.toBeInTheDocument();
  });

  it.each([401, 404])(
    'показывает ошибку для fatal статуса %s от /api/vk/health',
    async (status) => {
      window.sessionStorage.setItem(
        INTERNAL_TOKEN_STORAGE_KEY,
        'test-runtime-token'
      );

      const fetchMock = vi.fn((url) => {
        if (url === '/api/runtime') {
          return Promise.resolve(jsonResponse(runtimeSnapshot));
        }

        if (url === '/api/vk/health') {
          return Promise.resolve(
            jsonResponse(
              { ok: false, message: 'Не найдено' },
              { ok: false, status }
            )
          );
        }

        throw new Error(`Unexpected request: ${String(url)}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      renderInternalRuntimeRoute();

      expect(await screen.findByText('Не найдено')).toBeInTheDocument();
      expect(screen.queryByText('v20.18.0')).not.toBeInTheDocument();
      expect(screen.queryByText('degraded')).not.toBeInTheDocument();
    }
  );

  it('делает только один цикл загрузки после сохранения нового токена', async () => {
    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer fresh-runtime-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    fireEvent.change(screen.getByLabelText('INTERNAL_METRICS_TOKEN'), {
      target: { value: 'fresh-runtime-token' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить и обновить' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/runtime',
      '/api/vk/health',
    ]);
    expect(window.sessionStorage.getItem(INTERNAL_TOKEN_STORAGE_KEY)).toBe(
      'fresh-runtime-token'
    );
  });

  it('делает initial load из сохраненного токена и один auto-refresh через 15 секунд', async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem(
      INTERNAL_TOKEN_STORAGE_KEY,
      'test-runtime-token'
    );

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer test-runtime-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/runtime',
      '/api/vk/health',
    ]);
  });

  it('делает один reload при повторном сохранении того же токена', async () => {
    window.sessionStorage.setItem(
      INTERNAL_TOKEN_STORAGE_KEY,
      'test-runtime-token'
    );

    const fetchMock = vi.fn((url, options) => {
      expect(options).toMatchObject({
        headers: { Authorization: 'Bearer test-runtime-token' },
      });

      if (url === '/api/runtime') {
        return Promise.resolve(jsonResponse(runtimeSnapshot));
      }

      if (url === '/api/vk/health') {
        return Promise.resolve(jsonResponse(readyVkSnapshot));
      }

      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderInternalRuntimeRoute();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    fetchMock.mockClear();

    fireEvent.click(
      screen.getByRole('button', { name: 'Сохранить и обновить' })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
