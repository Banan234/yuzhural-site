// Файл проверяет health-мониторинг, дедупликацию уведомлений и защищённые проверки.

import { describe, expect, it, vi } from 'vitest';
import {
  buildMonitorChecks,
  checkMonitorEndpoint,
  formatMonitorNotification,
  getMonitorConfig,
  runHealthMonitor,
  summarizeMonitorResults,
} from './monitorHealth.js';

function mockResponse(status, payload = {}) {
  return {
    status,
    text: async () => JSON.stringify(payload),
  };
}

function healthyFetch(url) {
  if (url.endsWith('/healthz'))
    return Promise.resolve(mockResponse(200, { text: 'ok\n' }));
  if (url.endsWith('/'))
    return Promise.resolve(mockResponse(200, { text: '<html></html>' }));
  if (url.endsWith('/sitemap.xml')) {
    return Promise.resolve(mockResponse(200, { text: '<urlset></urlset>' }));
  }
  if (url.endsWith('/api/health'))
    return Promise.resolve(mockResponse(200, { ok: true }));
  if (url.endsWith('/api/forms/health')) {
    return Promise.resolve(
      mockResponse(503, { ok: false, status: 'unavailable' })
    );
  }
  if (url.endsWith('/api/runtime'))
    return Promise.resolve(mockResponse(200, { ok: true }));
  return Promise.resolve(mockResponse(200, { ok: true, status: 'ready' }));
}

describe('monitor config', () => {
  it('строит базовые проверки и не включает приватные endpoints без токена', () => {
    const config = getMonitorConfig({
      env: { SITE_URL: 'https://example.test', MONITOR_CHECK_FORMS: 'false' },
      projectPath: '/tmp/project',
    });
    expect(config.baseUrl).toBe('https://example.test');
    expect(buildMonitorChecks(config).map((item) => item.key)).toEqual([
      'web',
      'homepage',
      'sitemap',
      'api',
    ]);
  });

  it('добавляет runtime/VK при наличии internal token', () => {
    const config = getMonitorConfig({
      env: {
        SITE_URL: 'https://example.test',
        INTERNAL_METRICS_TOKEN: 'secret',
        MONITOR_CHECK_FORMS: 'true',
        MONITOR_CHECK_VK: 'true',
      },
    });
    expect(buildMonitorChecks(config).map((item) => item.key)).toEqual([
      'web',
      'homepage',
      'sitemap',
      'api',
      'forms',
      'runtime',
      'vk',
    ]);
  });
});

describe('checkMonitorEndpoint', () => {
  it('принимает намеренно отключённые формы без тревоги', async () => {
    const result = await checkMonitorEndpoint(
      { key: 'forms', path: '/api/forms/health', kind: 'forms' },
      {
        baseUrl: 'https://example.test',
        timeoutMs: 1000,
        retries: 0,
        requireForms: false,
      },
      {
        fetchImpl: async () =>
          mockResponse(503, { ok: false, status: 'unavailable' }),
      }
    );
    expect(result.ok).toBe(true);
  });

  it('передаёт bearer token для runtime', async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.headers.Authorization).toBe('Bearer secret');
      return mockResponse(200, { ok: true });
    });
    const result = await checkMonitorEndpoint(
      { key: 'runtime', path: '/api/runtime', kind: 'runtime' },
      {
        baseUrl: 'https://example.test',
        timeoutMs: 1000,
        retries: 0,
        internalToken: 'secret',
      },
      { fetchImpl }
    );
    expect(result.ok).toBe(true);
  });

  it('разрешает отключённый VK только при явном флаге', async () => {
    const result = await checkMonitorEndpoint(
      { key: 'vk', path: '/api/vk/health?refresh=1', kind: 'vk' },
      {
        baseUrl: 'https://example.test',
        timeoutMs: 1000,
        retries: 0,
        internalToken: 'secret',
        allowDisabledVk: true,
      },
      {
        fetchImpl: async () =>
          mockResponse(503, { ok: false, status: 'unavailable' }),
      }
    );
    expect(result.ok).toBe(true);
  });

  it('отличает настоящий healthz от HTML с HTTP 200', async () => {
    const result = await checkMonitorEndpoint(
      { key: 'web', path: '/healthz', kind: 'liveness' },
      { baseUrl: 'https://example.test', timeoutMs: 1000, retries: 0 },
      { fetchImpl: async () => mockResponse(200, { text: '<html></html>' }) }
    );
    expect(result.ok).toBe(false);
  });
});

describe('runHealthMonitor', () => {
  it('уведомляет только при переходе в down и при восстановлении', async () => {
    let state = {};
    const notify = vi.fn(async () => ({ ok: true }));
    const failingFetch = async (url) => {
      if (url.endsWith('/healthz')) return mockResponse(500);
      return healthyFetch(url);
    };

    const first = await runHealthMonitor({
      env: {
        MONITOR_BASE_URL: 'https://example.test',
        MONITOR_CHECK_FORMS: 'false',
        MONITOR_WEBHOOK_URL: 'https://hooks.example.test',
      },
      fetchImpl: failingFetch,
      readState: async () => state,
      writeState: async (_path, next) => {
        state = next;
      },
      notify,
      now: new Date('2026-09-08T00:00:00Z'),
    });
    expect(first.ok).toBe(false);
    expect(first.shouldNotify).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);

    const repeated = await runHealthMonitor({
      env: {
        MONITOR_BASE_URL: 'https://example.test',
        MONITOR_CHECK_FORMS: 'false',
        MONITOR_WEBHOOK_URL: 'https://hooks.example.test',
      },
      fetchImpl: failingFetch,
      readState: async () => state,
      writeState: async (_path, next) => {
        state = next;
      },
      notify,
    });
    expect(repeated.shouldNotify).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);

    const recovered = await runHealthMonitor({
      env: {
        MONITOR_BASE_URL: 'https://example.test',
        MONITOR_CHECK_FORMS: 'false',
        MONITOR_WEBHOOK_URL: 'https://hooks.example.test',
      },
      fetchImpl: healthyFetch,
      readState: async () => state,
      writeState: async (_path, next) => {
        state = next;
      },
      notify,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.shouldNotify).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe('monitor formatting', () => {
  it('формирует сообщение без секретов и с результатами проверок', () => {
    const message = formatMonitorNotification({
      status: 'down',
      results: [
        {
          key: 'web',
          ok: false,
          reason: 'таймаут',
          status: 0,
          durationMs: 100,
        },
      ],
      now: new Date('2026-09-08T00:00:00Z'),
    });
    expect(message).toContain('Сбой сайта');
    expect(message).toContain('web');
    expect(message).not.toContain('secret');
    expect(summarizeMonitorResults([{ ok: true, key: 'web' }])).toMatchObject({
      ok: true,
      failed: [],
    });
  });
});
