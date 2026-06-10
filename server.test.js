// Файл проверяет Express API, валидацию заявок, антибот-защиту, каталожные endpoints и health checks.

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  closeTestServer,
  startTestServer,
} from './src/test/startTestServer.js';

// Мокаем nodemailer ДО импорта server.js — чтобы createTransport вернул
// заглушку и реальные SMTP-вызовы не уходили никуда. vi.hoisted гарантирует,
// что объявление sendMail поднимется выше vi.mock.
const { createTransportMock, sendMailMock, verifyMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  const verifyMock = vi.fn().mockResolvedValue(true);
  const createTransportMock = vi.fn(() => ({
    sendMail: sendMailMock,
    verify: verifyMock,
  }));
  return { createTransportMock, sendMailMock, verifyMock };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const {
  createApp,
  createTransporter,
  getMailSendOptions,
  getRuntimeHealthSnapshot,
  getFormsDiagnostic,
  getSmtpTransportOptions,
  initializeFormsForStartup,
  isRetryableMailError,
  sendMailWithRetry,
  startServer,
  createTrustedProxyFn,
  parseTrustedProxyIps,
  validateStartupEnv,
  validateFormsEnv,
  validateSiteUrlEnv,
  validateVkEnv,
} = await import('./server.js');
const { createCatalogQueryStore } = await import('./lib/catalogQuery.js');
const { createInMemoryChatStore } = await import('./lib/chatStore.js');
const { MAX_QUOTE_ITEM_COMMENT_LENGTH, MAX_QUOTE_PAYLOAD_BYTES } =
  await import('./shared/quoteValidation.js');

let server;
let baseUrl;
const renderedAt = Date.parse('2026-04-26T05:00:00.000Z');
const TEST_SMTP_ENV = Object.freeze({
  NODE_ENV: 'test',
  FORMS_ENABLED: 'true',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'secret',
  SMTP_FROM: 'ЮУЭК <mailer@example.test>',
  QUOTE_TO_EMAIL: 'sales@example.test',
});

function createTestEnv(overrides = {}) {
  return {
    ...TEST_SMTP_ENV,
    ...overrides,
  };
}

function createMockVkBridge(overrides = {}) {
  return {
    isConfigured: vi.fn(() => true),
    requiresCallbackSecret: vi.fn(() => true),
    notifyConversationCreated: vi.fn(async () => null),
    notifyCustomerMessage: vi.fn(async () => null),
    handleCallbackUpdate: vi.fn(async () => ({ ok: true, handled: false })),
    configureWebhook: vi.fn(async () => false),
    noteWebhookConfigureFailed: vi.fn(() => null),
    noteCallbackRejected: vi.fn(() => null),
    noteCallbackHandled: vi.fn(() => null),
    noteCallbackFailed: vi.fn(() => null),
    probePublicCallbackEndpoint: vi.fn(async () => ({
      ok: true,
      statusCode: 200,
      bodyMatched: true,
    })),
    getStatusSnapshot: vi.fn(() => ({
      enabled: true,
      configured: true,
      managerPeerId: '2000000005',
      managerUserIds: [],
      callback: {
        groupId: '123',
        apiVersion: '5.199',
        url: 'https://vk.example.test/api/vk/callback',
        confirmationTokenConfigured: true,
        secretRequired: true,
        autoConfigureEnabled: false,
        autoConfigure: {
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastResult: null,
          lastError: null,
        },
        publicEndpoint: {
          configured: true,
          exposure: 'public',
          isHttps: true,
          isLikelyTunnel: false,
          tunnelProvider: null,
          isStablePublicEntryPoint: true,
          lastProbeAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastOk: true,
          lastHttpStatus: 200,
          lastBodyMatched: true,
          lastError: null,
          healthy: true,
        },
      },
      runtime: {
        lastSuccessfulAt: null,
        lastSuccessfulType: null,
        lastSuccessfulConversationId: null,
        totalSuccessful: 0,
        lastRejectedAt: null,
        lastRejectedReason: null,
        lastRejectedType: null,
        totalRejected: 0,
        lastSecretMismatchAt: null,
        secretMismatchCount: 0,
        lastFailureAt: null,
        lastFailureType: null,
        lastFailureError: null,
      },
    })),
    callbackSecret: 'vk-secret',
    confirmationToken: 'vk-confirmation-token',
    ...overrides,
  };
}

function createTestApp({
  env = createTestEnv(),
  rateLimitOptions = { limit: 1000 },
  chatStore = createInMemoryChatStore(),
  vkBridge = createMockVkBridge(),
  ...options
} = {}) {
  return createApp({
    env,
    rateLimitOptions,
    chatStore,
    vkBridge,
    ...options,
  });
}

beforeAll(async () => {
  // Высокий лимит: тестам нужно слать больше 5 запросов в минуту, иначе
  // boilerplate-проверки (415, 400 на bad payload и т.п.) уткнутся в rate limit.
  const app = createTestApp();
  const started = await startTestServer(app);
  server = started.server;
  baseUrl = started.baseUrl;
});

afterAll(async () => {
  await closeTestServer(server);
});

beforeEach(() => {
  createTransportMock.mockClear();
  createTransportMock.mockImplementation(() => ({
    sendMail: sendMailMock,
    verify: verifyMock,
  }));
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: 'test-id' });
  verifyMock.mockClear();
  verifyMock.mockResolvedValue(true);
});

const validPayload = {
  customer: {
    name: 'Иван',
    phone: '+7 (900) 123-45-67',
    email: 'ivan@example.com',
    comment: '',
    preferredChannel: 'phone',
    consent: true,
  },
  items: [
    {
      id: 1,
      sku: 'YU-1',
      title: 'ВВГ 3х2.5',
      category: 'Кабель ВВГ',
      price: 100,
      quantity: 5,
      unit: 'м',
    },
  ],
  totalCount: 1,
  totalPrice: 500,
  createdAt: '2026-04-26 10:00',
  rendered_at: renderedAt,
  submit_at: renderedAt + 3_000,
};

const validLeadPayload = {
  phone: '+7 (900) 123-45-67',
  comment: 'ВВГ 3х2.5',
  source: 'Тест',
  createdAt: '2026-04-26 10:00',
  rendered_at: renderedAt,
  submit_at: renderedAt + 3_000,
  company_website: '',
};

const validChatPayload = {
  message: 'Нужен ВВГнг-LS 3х2.5, 400 метров',
  source: 'Виджет',
  rendered_at: renderedAt,
  submit_at: renderedAt + 3_000,
  company_website: '',
};

async function postJson(path, body, init = {}) {
  return postJsonTo(baseUrl, path, body, init);
}

async function postJsonTo(targetBaseUrl, path, body, init = {}) {
  const { headers: initHeaders = {}, ...restInit } = init;

  return fetch(`${targetBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 Vitest',
      'Accept-Language': 'ru-RU,ru;q=0.9',
      ...initHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...restInit,
  });
}

async function withTestServer(app, callback) {
  const { server: localServer, baseUrl: localBaseUrl } =
    await startTestServer(app);

  try {
    return await callback(localBaseUrl);
  } finally {
    await closeTestServer(localServer);
  }
}

const productFixtures = [
  {
    id: 101,
    sku: 'VVG-3-2-5',
    slug: 'vvgng-ls-3x2-5',
    title: 'ВВГнг-LS 3х2.5',
    fullName: 'Кабель ВВГнг-LS 3х2.5 0.66 кВ',
    mark: 'ВВГнг-LS',
    category: 'Силовой кабель',
    catalogCategory: 'Силовой кабель',
    catalogCategorySlug: 'silovoy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 3,
    crossSection: 2.5,
    voltage: 660,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 120,
    stock: 10,
    unit: 'м',
  },
  {
    id: 102,
    sku: 'AVVG-4-16',
    slug: 'avvg-4x16',
    title: 'АВВГ 4х16',
    fullName: 'Кабель АВВГ 4х16 1 кВ',
    mark: 'АВВГ',
    category: 'Силовой кабель',
    catalogCategory: 'Силовой кабель',
    catalogCategorySlug: 'silovoy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['алюминиевые жилы'] },
    cores: 4,
    crossSection: 16,
    voltage: 1000,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 260,
    stock: 4,
    unit: 'м',
  },
  {
    id: 103,
    sku: 'KG-4-4',
    slug: 'kg-4x4',
    title: 'КГ 4х4',
    fullName: 'Кабель гибкий КГ 4х4 0.66 кВ',
    mark: 'КГ',
    category: 'Гибкий кабель',
    catalogCategory: 'Гибкий кабель',
    catalogCategorySlug: 'gibkiy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 4,
    crossSection: 4,
    voltage: 660,
    catalogApplicationType: 'гибкий',
    catalogType: 'СПЭ',
    price: 310,
    stock: 12,
    unit: 'м',
  },
  {
    id: 104,
    sku: 'SIP-2-16',
    slug: 'sip-2x16',
    title: 'СИП-2 2х16',
    fullName: 'Провод СИП-2 2х16 0.6/1 кВ',
    mark: 'СИП-2',
    category: 'Самонесущий провод',
    catalogCategory: 'Самонесущий провод',
    catalogCategorySlug: 'samonesushchiy-provod',
    catalogSection: 'Провода',
    catalogSectionSlug: 'provoda',
    cableDecoded: { decoded: ['алюминиевые жилы'] },
    cores: 2,
    crossSection: 16,
    voltage: 1000,
    catalogApplicationType: 'воздушный',
    catalogType: 'ПВХ',
    price: 90,
    stock: 8,
    unit: 'м',
  },
];

function createProductCatalogApp(items = productFixtures, appOptions = {}) {
  const catalogStore = {
    loadCatalogProducts: vi.fn(async () => items),
    getCatalogProductListItems: vi.fn((value) => value),
    getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
      value.filter((item) => item.catalogCategorySlug === categorySlug)
    ),
    getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
      value.filter((item) => item.catalogCategorySlug === categorySlug)
    ),
    findProductBySlug: vi.fn(async (slug) =>
      items.find((item) => item.slug === slug)
    ),
  };
  const catalogQueryStore = createCatalogQueryStore({
    getCatalogProductsByCategory: catalogStore.getCatalogProductsByCategory,
    facetCacheTtlMs: 0,
  });
  const app = createTestApp({
    catalogStore,
    catalogQueryStore,
    ...appOptions,
  });

  return { app, catalogStore };
}

function parseCspHeader(value) {
  return Object.fromEntries(
    String(value || '')
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...tokens] = directive.split(/\s+/);
        return [name, tokens];
      })
  );
}

describe('GET /api/health', () => {
  it('возвращает минимальную публичную liveness-пробу', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });
});

describe('GET /api/forms/health', () => {
  it('возвращает только публичный статус готовых форм', async () => {
    const app = createTestApp({
      formsDiagnostic: {
        formsEnabled: true,
        smtpConfigured: true,
        missing: [],
        smtpVerified: true,
      },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/forms/health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        ok: true,
        status: 'ready',
      });
      expect(JSON.stringify(data)).not.toContain('smtpConfigured');
      expect(JSON.stringify(data)).not.toContain('smtpVerified');
      expect(JSON.stringify(data)).not.toContain('missingConfig');
    });
  });

  it('не раскрывает диагностические детали при недоступных формах', async () => {
    const app = createTestApp({
      env: createTestEnv({ FORMS_ENABLED: 'false' }),
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/forms/health`);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data).toEqual({
        ok: false,
        status: 'unavailable',
      });
      expect(JSON.stringify(data)).not.toContain('secret');
      expect(JSON.stringify(data)).not.toContain('smtpConfigured');
      expect(JSON.stringify(data)).not.toContain('smtpVerified');
      expect(JSON.stringify(data)).not.toContain('missingConfig');
    });
  });
});

describe('GET /api/runtime', () => {
  it('скрывает runtime-метрики без внутреннего токена', async () => {
    const app = createTestApp();

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/runtime`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
      expect(data.runtime).toBeUndefined();
      expect(data.forms).toBeUndefined();
    });
  });

  it('возвращает runtime-метрики только с валидным токеном', async () => {
    const originalToken = process.env.INTERNAL_METRICS_TOKEN;
    process.env.INTERNAL_METRICS_TOKEN = 'test-runtime-token';
    const app = createTestApp();

    try {
      await withTestServer(app, async (localBaseUrl) => {
        const denied = await fetch(`${localBaseUrl}/api/runtime`, {
          headers: { authorization: 'Bearer wrong-token' },
        });
        expect(denied.status).toBe(404);

        const res = await fetch(`${localBaseUrl}/api/runtime`, {
          headers: { authorization: 'Bearer test-runtime-token' },
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
        expect(typeof data.uptime).toBe('number');
        expect(typeof data.ts).toBe('number');
        expect(data.runtime).toMatchObject({
          pid: expect.any(Number),
          node: expect.any(String),
          activeRequests: expect.any(Number),
          memoryMb: {
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
            external: expect.any(Number),
            arrayBuffers: expect.any(Number),
          },
          eventLoopDelayMs: {
            mean: expect.any(Number),
            p95: expect.any(Number),
            max: expect.any(Number),
          },
          cpuUsageMs: {
            user: expect.any(Number),
            system: expect.any(Number),
          },
        });
        expect(data.forms).toEqual({
          formsEnabled: true,
          smtpConfigured: true,
          smtpVerified: null,
          smtpReady: true,
          missingConfig: [],
        });
        expect(data.vk).toMatchObject({
          enabled: true,
          configured: true,
          managerPeerId: '2000000005',
          callback: {
            url: 'https://vk.example.test/api/vk/callback',
            publicEndpoint: {
              exposure: 'public',
              healthy: true,
            },
          },
        });
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.INTERNAL_METRICS_TOKEN;
      } else {
        process.env.INTERNAL_METRICS_TOKEN = originalToken;
      }
    }
  });
});

describe('GET /api/vk/health', () => {
  it('скрывает VK runtime-статус без внутреннего токена', async () => {
    const app = createTestApp();

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/vk/health`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
      expect(data.vk).toBeUndefined();
    });
  });

  it('возвращает VK bridge status с последним success и secret mismatch', async () => {
    const originalToken = process.env.INTERNAL_METRICS_TOKEN;
    process.env.INTERNAL_METRICS_TOKEN = 'test-runtime-token';
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_MANAGER_USER_IDS: '42',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_CALLBACK_URL: 'https://vk.example.test/api/vk/callback',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            peer_id: 2000000005,
            message_id: 900,
            conversation_message_id: 500,
          },
        }),
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    try {
      await withTestServer(app, async (localBaseUrl) => {
        const createRes = await postJsonTo(
          localBaseUrl,
          '/api/chat/conversations',
          validChatPayload
        );
        const created = await createRes.json();

        await chatStore.registerManagerNotification(created.conversationId, {
          channel: 'vk',
          peerId: '2000000005',
          messageId: 500,
          conversationMessageId: 500,
        });

        const rejectedRes = await postJsonTo(
          localBaseUrl,
          '/api/vk/callback',
          {
            type: 'message_reply',
            event_id: 'evt-secret-mismatch',
            group_id: 123,
            secret: 'wrong-secret',
            object: {
              id: 777,
              out: 1,
              peer_id: 2000000005,
              from_id: 123,
              admin_author_id: 42,
              conversation_message_id: 778,
              text: 'Не должен пройти.',
              reply_message: {
                id: 500,
                conversation_message_id: 500,
                peer_id: 2000000005,
                text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
              },
            },
          }
        );
        expect(rejectedRes.status).toBe(404);

        const callbackRes = await postJsonTo(
          localBaseUrl,
          '/api/vk/callback',
          {
            type: 'message_reply',
            event_id: 'evt-status-success',
            group_id: 123,
            secret: 'vk-secret',
            object: {
              id: 888,
              out: 1,
              peer_id: 2000000005,
              from_id: 123,
              admin_author_id: 42,
              conversation_message_id: 889,
              text: 'Статусный ответ менеджера.',
              reply_message: {
                id: 500,
                conversation_message_id: 500,
                peer_id: 2000000005,
                text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
              },
            },
          }
        );
        expect(callbackRes.status).toBe(200);

        const res = await fetch(`${localBaseUrl}/api/vk/health`, {
          headers: { authorization: 'Bearer test-runtime-token' },
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toMatchObject({
          ok: true,
          status: 'ready',
          vk: {
            enabled: true,
            configured: true,
            managerPeerId: '2000000005',
            callback: {
              groupId: '123',
              url: 'https://vk.example.test/api/vk/callback',
            },
            runtime: {
              lastSuccessfulType: 'message_reply',
              lastSuccessfulConversationId: created.conversationId,
              lastRejectedReason: 'secret_mismatch',
              secretMismatchCount: 1,
            },
          },
        });
        expect(data.vk.runtime.lastSuccessfulAt).toEqual(expect.any(String));
        expect(data.vk.runtime.lastSecretMismatchAt).toEqual(expect.any(String));
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.INTERNAL_METRICS_TOKEN;
      } else {
        process.env.INTERNAL_METRICS_TOKEN = originalToken;
      }
    }
  });

  it('умеет форсировать live probe callback URL через refresh=1', async () => {
    const originalToken = process.env.INTERNAL_METRICS_TOKEN;
    process.env.INTERNAL_METRICS_TOKEN = 'test-runtime-token';
    const snapshot = {
      enabled: true,
      configured: true,
      managerPeerId: '2000000005',
      managerUserIds: [],
      callback: {
        groupId: '123',
        apiVersion: '5.199',
        url: 'https://demo.loca.lt/api/vk/callback',
        confirmationTokenConfigured: true,
        secretRequired: true,
        autoConfigureEnabled: false,
        autoConfigure: {
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastResult: null,
          lastError: null,
        },
        publicEndpoint: {
          configured: true,
          url: 'https://demo.loca.lt/api/vk/callback',
          hostname: 'demo.loca.lt',
          protocol: 'https:',
          exposure: 'tunnel',
          isHttps: true,
          isLikelyTunnel: true,
          tunnelProvider: 'localtunnel',
          isStablePublicEntryPoint: false,
          lastProbeAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastOk: null,
          lastHttpStatus: null,
          lastBodyMatched: null,
          lastError: null,
          healthy: false,
        },
      },
      runtime: {
        lastSuccessfulAt: null,
        lastSuccessfulType: null,
        lastSuccessfulConversationId: null,
        totalSuccessful: 0,
        lastRejectedAt: null,
        lastRejectedReason: null,
        lastRejectedType: null,
        totalRejected: 0,
        lastSecretMismatchAt: null,
        secretMismatchCount: 0,
        lastFailureAt: null,
        lastFailureType: null,
        lastFailureError: null,
      },
    };
    const vkBridge = createMockVkBridge({
      probePublicCallbackEndpoint: vi.fn(async () => {
        snapshot.callback.publicEndpoint.lastProbeAt = new Date().toISOString();
        snapshot.callback.publicEndpoint.lastSuccessAt =
          snapshot.callback.publicEndpoint.lastProbeAt;
        snapshot.callback.publicEndpoint.lastOk = true;
        snapshot.callback.publicEndpoint.lastHttpStatus = 200;
        snapshot.callback.publicEndpoint.lastBodyMatched = true;
        snapshot.callback.publicEndpoint.healthy = true;
        return { ok: true, statusCode: 200, bodyMatched: true };
      }),
      getStatusSnapshot: vi.fn(() => snapshot),
    });
    const app = createTestApp({ vkBridge });

    try {
      await withTestServer(app, async (localBaseUrl) => {
        const res = await fetch(
          `${localBaseUrl}/api/vk/health?refresh=1`,
          {
            headers: { authorization: 'Bearer test-runtime-token' },
          }
        );
        const data = await res.json();

        expect(vkBridge.probePublicCallbackEndpoint).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(200);
        expect(data.status).toBe('tunnel_or_ephemeral');
        expect(data.vk.callback.publicEndpoint).toMatchObject({
          exposure: 'tunnel',
          tunnelProvider: 'localtunnel',
          operationalRisk: 'high',
          healthy: true,
          lastHttpStatus: 200,
        });
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.INTERNAL_METRICS_TOKEN;
      } else {
        process.env.INTERNAL_METRICS_TOKEN = originalToken;
      }
    }
  });
});

describe('runtime health snapshot', () => {
  it('rounds memory and event loop metrics to compact numeric values', () => {
    const snapshot = getRuntimeHealthSnapshot({
      activeRequests: 7,
      eventLoopDelay: {
        mean: 1_250_000,
        max: 9_900_000,
        percentile: () => 2_500_000,
      },
    });

    expect(snapshot.activeRequests).toBe(7);
    expect(snapshot.memoryMb.rss).toEqual(expect.any(Number));
    expect(snapshot.eventLoopDelayMs).toEqual({
      mean: 1.3,
      p95: 2.5,
      max: 9.9,
    });
  });
});

describe('forms diagnostics', () => {
  it('reports SMTP readiness without secret values', () => {
    expect(
      getFormsDiagnostic({
        NODE_ENV: 'production',
        FORMS_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: '',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'robot@example.test',
        QUOTE_TO_EMAIL: 'sales@example.test',
      })
    ).toEqual({
      formsEnabled: true,
      smtpConfigured: false,
      missing: ['SMTP_USER'],
    });
  });

  it('fails fast in production unless forms are explicitly disabled', () => {
    expect(() =>
      validateFormsEnv({ NODE_ENV: 'production', FORMS_ENABLED: 'true' })
    ).toThrow(/SMTP не настроен/);

    expect(
      validateFormsEnv({ NODE_ENV: 'production', FORMS_ENABLED: 'false' })
    ).toMatchObject({
      formsEnabled: false,
      smtpConfigured: false,
    });
  });

  it('accepts production startup when forms are explicitly disabled', () => {
    expect(
      validateStartupEnv({
        NODE_ENV: 'production',
        FORMS_ENABLED: 'false',
      }).forms
    ).toEqual({
      formsEnabled: false,
      smtpConfigured: false,
      missing: [
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM',
        'QUOTE_TO_EMAIL',
      ],
    });
  });

  it('accepts production startup with a complete SMTP configuration', () => {
    expect(
      validateStartupEnv({
        NODE_ENV: 'production',
        FORMS_ENABLED: 'true',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: 'mailer@example.test',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'ЮУЭК <mailer@example.test>',
        QUOTE_TO_EMAIL: 'sales@example.test',
        VK_CALLBACK_SECRET: 'vk-secret',
      }).forms
    ).toEqual({
      formsEnabled: true,
      smtpConfigured: true,
      missing: [],
    });
  });

  it('fails production startup when VK bridge is enabled without callback secret', () => {
    expect(() =>
      validateVkEnv({
        NODE_ENV: 'production',
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
      })
    ).toThrow(/VK callback не настроен безопасно/);
  });

  it('fails production startup when VK insecure callback mode is enabled', () => {
    expect(() =>
      validateVkEnv({
        NODE_ENV: 'production',
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_ALLOW_INSECURE: 'true',
      })
    ).toThrow(/insecure-режиме/);
  });

  it('fails VK auto-config without group id', () => {
    expect(() =>
      validateVkEnv({
        NODE_ENV: 'development',
        VK_CALLBACK_AUTO_CONFIGURE: 'true',
        VK_CALLBACK_URL: 'https://example.test/api/vk/callback',
      })
    ).toThrow(/VK_GROUP_ID/);
  });

  it('fails VK auto-config without callback URL or site URL', () => {
    expect(() =>
      validateVkEnv({
        NODE_ENV: 'development',
        VK_CALLBACK_AUTO_CONFIGURE: 'true',
        VK_GROUP_ID: '123',
      })
    ).toThrow(/VK_CALLBACK_URL или SITE_URL\/VITE_SITE_URL/);
  });

  it('marks SMTP as verified after transporter.verify succeeds', async () => {
    const mailTransporter = {
      verify: vi.fn().mockResolvedValue(true),
      sendMail: vi.fn(),
    };

    await expect(
      initializeFormsForStartup({
        env: createTestEnv({ NODE_ENV: 'production' }),
        mailTransporter,
      })
    ).resolves.toMatchObject({
      transporter: mailTransporter,
      diagnostic: {
        formsEnabled: true,
        smtpConfigured: true,
        smtpVerified: true,
        smtpReady: true,
      },
    });
    expect(mailTransporter.verify).toHaveBeenCalledTimes(1);
  });

  it('fails production startup before listen when SMTP verify fails', async () => {
    const mailTransporter = {
      verify: vi.fn().mockRejectedValue(new Error('auth failed')),
      sendMail: vi.fn(),
    };
    const listen = vi.fn();

    await expect(
      startServer({
        env: createTestEnv({ NODE_ENV: 'production' }),
        mailTransporter,
        listen,
        warmCatalogOnStart: false,
      })
    ).rejects.toThrow(/SMTP verify не прошёл/);
    expect(listen).not.toHaveBeenCalled();
  });

  it('keeps staging/dev startup explicit and marks forms unavailable when SMTP verify fails', async () => {
    const mailTransporter = {
      verify: vi.fn().mockRejectedValue(new Error('auth failed')),
      sendMail: vi.fn(),
    };

    const result = await initializeFormsForStartup({
      env: createTestEnv({ NODE_ENV: 'development' }),
      mailTransporter,
    });

    expect(result).toMatchObject({
      transporter: null,
      diagnostic: {
        formsEnabled: true,
        smtpConfigured: true,
        smtpVerified: false,
        smtpReady: false,
      },
    });
  });

  it('starts listening before VK callback auto-config runs', async () => {
    const steps = [];
    const vkBridge = createMockVkBridge({
      configureWebhook: vi.fn(async () => {
        steps.push('configureWebhook');
        return false;
      }),
    });
    const listen = vi.fn((app, port, onListening) => {
      steps.push(`listen:${port}`);
      onListening();
      steps.push('listening-callback-fired');
      return { once: vi.fn() };
    });

    await startServer({
      env: createTestEnv({
        FORMS_ENABLED: 'false',
      }),
      vkBridge,
      listen,
      warmCatalogOnStart: false,
    });

    expect(steps).toEqual([
      'listen:3001',
      'listening-callback-fired',
      'configureWebhook',
    ]);
  });
});

describe('VK callback auto-config', () => {
  it('updates an existing callback server and preserves unrelated callback events', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const requests = [];
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_AUTO_CONFIGURE: 'true',
        VK_CALLBACK_URL: 'https://example.test/api/vk/callback',
        VK_CALLBACK_SERVER_ID: '7',
        VK_GROUP_ID: '238733404',
        VK_API_VERSION: '5.199',
      }),
      fetchImpl: vi.fn(async (url, init) => {
        const method = new URL(url).pathname.split('/').pop();
        const body = init.body;
        requests.push({
          method,
          body: body instanceof URLSearchParams ? new URLSearchParams(body) : body,
        });

        const responses = {
          'groups.getCallbackConfirmationCode': {
            response: { code: '8e0f944f' },
          },
          'groups.getCallbackServers': {
            response: {
              count: 1,
              items: [
                {
                  id: 7,
                  title: 'legacy-server',
                  url: 'https://old.example.test/api/vk/callback',
                },
              ],
            },
          },
          'groups.editCallbackServer': { response: 1 },
          'groups.getCallbackSettings': {
            response: {
              api_version: '5.199',
              message_new: 0,
              message_reply: 0,
              message_edit: 1,
            },
          },
          'groups.setCallbackSettings': { response: 1 },
        };

        return {
          ok: true,
          json: async () => responses[method],
        };
      }),
    });

    await expect(vkBridge.configureWebhook()).resolves.toEqual({
      mode: 'updated',
      serverId: 7,
      callbackUrl: 'https://example.test/api/vk/callback',
      confirmationToken: '8e0f944f',
    });

    expect(vkBridge.confirmationToken).toBe('8e0f944f');
    expect(requests.map((entry) => entry.method)).toEqual([
      'groups.getCallbackConfirmationCode',
      'groups.getCallbackServers',
      'groups.editCallbackServer',
      'groups.getCallbackSettings',
      'groups.setCallbackSettings',
    ]);

    expect(requests[2].body.get('group_id')).toBe('238733404');
    expect(requests[2].body.get('server_id')).toBe('7');
    expect(requests[2].body.get('title')).toBe('yuzhural-site');
    expect(requests[2].body.get('url')).toBe(
      'https://example.test/api/vk/callback'
    );
    expect(requests[2].body.get('secret_key')).toBe('vk-secret');

    expect(requests[4].body.get('group_id')).toBe('238733404');
    expect(requests[4].body.get('server_id')).toBe('7');
    expect(requests[4].body.get('api_version')).toBe('5.199');
    expect(requests[4].body.get('message_new')).toBe('1');
    expect(requests[4].body.get('message_reply')).toBe('1');
    expect(requests[4].body.get('message_edit')).toBe('1');
  });

  it('creates a callback server and derives callback URL from SITE_URL', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const requests = [];
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_AUTO_CONFIGURE: 'true',
        SITE_URL: 'https://prod.example.test/',
        VK_GROUP_ID: '238733404',
      }),
      fetchImpl: vi.fn(async (url, init) => {
        const method = new URL(url).pathname.split('/').pop();
        const body = init.body;
        requests.push({
          method,
          body: body instanceof URLSearchParams ? new URLSearchParams(body) : body,
        });

        const responses = {
          'groups.getCallbackConfirmationCode': { response: 'prod-confirm' },
          'groups.getCallbackServers': { response: { count: 0, items: [] } },
          'groups.addCallbackServer': { response: { server_id: 11 } },
          'groups.getCallbackSettings': { response: {} },
          'groups.setCallbackSettings': { response: 1 },
        };

        return {
          ok: true,
          json: async () => responses[method],
        };
      }),
    });

    await expect(vkBridge.configureWebhook()).resolves.toEqual({
      mode: 'created',
      serverId: 11,
      callbackUrl: 'https://prod.example.test/api/vk/callback',
      confirmationToken: 'prod-confirm',
    });

    expect(requests.map((entry) => entry.method)).toEqual([
      'groups.getCallbackConfirmationCode',
      'groups.getCallbackServers',
      'groups.addCallbackServer',
      'groups.getCallbackSettings',
      'groups.setCallbackSettings',
    ]);
    expect(requests[2].body.get('url')).toBe(
      'https://prod.example.test/api/vk/callback'
    );
    expect(requests[2].body.get('title')).toBe('yuzhural-site');
  });
});

describe('security headers', () => {
  it('выставляет security headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const csp = res.headers.get('content-security-policy');
    const cspDirectives = parseCspHeader(csp);
    const hsts = res.headers.get('strict-transport-security');

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(res.headers.get('permissions-policy')).toContain('geolocation=()');
    expect(res.headers.get('permissions-policy')).toContain('microphone=()');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(cspDirectives).toMatchObject({
      'default-src': ["'none'"],
      'base-uri': ["'none'"],
      'connect-src': ["'self'"],
      'font-src': ["'none'"],
      'form-action': ["'none'"],
      'frame-ancestors': ["'none'"],
      'frame-src': ["'none'"],
      'img-src': ["'none'"],
      'manifest-src': ["'none'"],
      'media-src': ["'none'"],
      'object-src': ["'none'"],
      'script-src': ["'none'"],
      'script-src-attr': ["'none'"],
      'style-src': ["'none'"],
      'worker-src': ["'none'"],
    });
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain('https:');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('trusted proxy configuration', () => {
  it('parses comma/space-separated proxy list with loopback fallback', () => {
    expect(
      parseTrustedProxyIps(' 10.0.0.0/8, 192.168.0.0/16 loopback ')
    ).toEqual(['10.0.0.0/8', '192.168.0.0/16', 'loopback']);
    expect(parseTrustedProxyIps('')).toEqual(['loopback']);
  });

  it('trusts only configured proxy IP ranges', () => {
    const trustProxy = createTrustedProxyFn('loopback,10.0.0.0/8');

    expect(trustProxy('127.0.0.1')).toBe(true);
    expect(trustProxy('::ffff:127.0.0.1')).toBe(true);
    expect(trustProxy('10.20.30.40')).toBe(true);
    expect(trustProxy('203.0.113.10')).toBe(false);
  });

  it('sets Express trust proxy to the injected function', () => {
    const trustProxy = vi.fn(() => false);
    const app = createTestApp({ trustProxy });

    expect(app.get('trust proxy')).toBe(trustProxy);
    expect(app.get('trust proxy fn')('127.0.0.1')).toBe(false);
    expect(trustProxy).toHaveBeenCalledWith('127.0.0.1');
  });
});

describe('startup env validation', () => {
  it('accepts matching SITE_URL and VITE_SITE_URL after trailing slash normalization', () => {
    expect(
      validateSiteUrlEnv({
        SITE_URL: 'https://example.test/',
        VITE_SITE_URL: 'https://example.test',
      })
    ).toEqual({
      siteUrl: 'https://example.test',
      viteSiteUrl: 'https://example.test',
    });
  });

  it('allows only one canonical URL variable for local/dev scripts', () => {
    expect(
      validateSiteUrlEnv({
        SITE_URL: '',
        VITE_SITE_URL: 'http://localhost:5173/',
      })
    ).toEqual({
      siteUrl: 'http://localhost:5173',
      viteSiteUrl: 'http://localhost:5173',
    });
  });

  it('fails when SITE_URL and VITE_SITE_URL point to different origins', () => {
    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'https://api.example.test',
        VITE_SITE_URL: 'https://www.example.test',
      })
    ).toThrow(
      'SITE_URL и VITE_SITE_URL должны совпадать: SITE_URL="https://api.example.test", VITE_SITE_URL="https://www.example.test"'
    );
  });

  it('fails on non-base or non-http canonical URLs', () => {
    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'ftp://example.test',
        VITE_SITE_URL: 'ftp://example.test',
      })
    ).toThrow('SITE_URL должен использовать протокол http или https');

    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'https://example.test?utm=1',
      })
    ).toThrow('SITE_URL должен быть базовым URL без userinfo, query и hash');
  });
});

describe('SMTP delivery', () => {
  it('builds pooled transporter options with bounded timeouts', () => {
    const options = getSmtpTransportOptions({
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '2525',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user@example.test',
      SMTP_PASS: 'secret',
      SMTP_POOL: 'true',
      SMTP_POOL_MAX_CONNECTIONS: '3',
      SMTP_POOL_MAX_MESSAGES: '50',
      SMTP_CONNECTION_TIMEOUT_MS: '4000',
      SMTP_GREETING_TIMEOUT_MS: '5000',
      SMTP_SOCKET_TIMEOUT_MS: '6000',
    });

    expect(options).toMatchObject({
      host: 'smtp.example.test',
      port: 2525,
      secure: false,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout: 4000,
      greetingTimeout: 5000,
      socketTimeout: 6000,
      auth: {
        user: 'user@example.test',
        pass: 'secret',
      },
    });
  });

  it('uses safe defaults for SMTP send retry settings', () => {
    expect(getMailSendOptions({})).toEqual({
      maxRetries: 1,
      retryDelayMs: 750,
    });
  });

  it('creates one app-scoped transporter', () => {
    createTransportMock.mockClear();

    const app = createTestApp();

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(app.locals.mailTransporter).toBeDefined();
  });

  it('passes transport options to nodemailer', () => {
    const env = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@example.test',
      SMTP_PASS: 'secret',
    };

    createTransporter(env);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        pool: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    );
  });

  it('retries transient SMTP errors', async () => {
    const transientError = Object.assign(new Error('socket reset'), {
      code: 'ECONNRESET',
    });
    const transporter = {
      sendMail: vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ messageId: 'ok' }),
    };

    await expect(
      sendMailWithRetry(
        transporter,
        { subject: 'test' },
        { maxRetries: 1, retryDelayMs: 0 }
      )
    ).resolves.toEqual({ messageId: 'ok' });
    expect(transporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent SMTP errors', async () => {
    const authError = Object.assign(new Error('bad auth'), { code: 'EAUTH' });
    const transporter = {
      sendMail: vi.fn().mockRejectedValue(authError),
    };

    await expect(
      sendMailWithRetry(
        transporter,
        { subject: 'test' },
        { maxRetries: 2, retryDelayMs: 0 }
      )
    ).rejects.toBe(authError);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('classifies temporary 4xx SMTP responses as retryable', () => {
    expect(isRetryableMailError({ responseCode: 421 })).toBe(true);
    expect(isRetryableMailError({ responseCode: 550 })).toBe(false);
    expect(isRetryableMailError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableMailError({ code: 'EAUTH' })).toBe(false);
  });
});

describe('GET /api/products', () => {
  it('warms catalog caches on startup when enabled', async () => {
    const items = productFixtures;
    const catalogStore = {
      loadCatalogProducts: vi.fn(async () => items),
      getCatalogProductListItems: vi.fn((value) => value),
      getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      findProductBySlug: vi.fn(async (slug) =>
        items.find((item) => item.slug === slug)
      ),
    };
    const catalogQueryStore = {
      getCatalogQueryItems: vi.fn((value) => value),
      getSearchFilteredProducts: vi.fn((value) => value),
      getCatalogFacets: vi.fn(() => ({})),
      getCatalogSections: vi.fn(() => []),
    };

    const app = createTestApp({
      catalogStore,
      catalogQueryStore,
      warmCatalogOnStart: true,
    });

    await app.locals.catalogWarmupPromise;

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(1);
    expect(catalogStore.getCatalogProductListItems).toHaveBeenCalledWith(items);
    expect(catalogQueryStore.getCatalogSections).toHaveBeenCalledWith(items);
  });

  it('uses injected catalog stores and cached facets provider', async () => {
    const items = [
      {
        id: 1,
        sku: 'SKU-1',
        slug: 'alpha-cable',
        title: 'Alpha Cable',
        fullName: 'Alpha Cable',
        mark: 'ALPHA',
        category: 'Power cable',
        catalogCategory: 'Power cable',
        catalogCategorySlug: 'power-cable',
        catalogSection: 'Кабель и провод',
        catalogSectionSlug: 'kabel-i-provod',
        price: 100,
        stock: 10,
        unit: 'м',
      },
    ];
    const catalogStore = {
      loadCatalogProducts: vi.fn(async () => items),
      getCatalogProductListItems: vi.fn((value) => value),
      getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      findProductBySlug: vi.fn(async (slug) =>
        items.find((item) => item.slug === slug)
      ),
    };
    const catalogQueryStore = {
      getCatalogQueryItems: vi.fn((value) => value),
      getSearchFilteredProducts: vi.fn((value) => value),
      getCatalogFacets: vi.fn(() => ({ materials: ['медь'] })),
      getCatalogSections: vi.fn(() => []),
    };
    const app = createTestApp({
      catalogStore,
      catalogQueryStore,
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/products?search=alpha`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items).toEqual(items);
      expect(data.meta.facets).toEqual({ materials: ['медь'] });
    });

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(1);
    expect(catalogQueryStore.getSearchFilteredProducts).toHaveBeenCalledWith(
      items,
      'alpha'
    );
    expect(catalogQueryStore.getCatalogFacets).toHaveBeenCalledWith(
      items,
      expect.objectContaining({
        categorySlug: '',
        search: 'alpha',
        catalogItems: items,
      })
    );
  });

  it('filters products by cross section', async () => {
    const { app } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({ section: '16' });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual([
        'AVVG-4-16',
        'SIP-2-16',
      ]);
      expect(data.meta.total).toBe(2);
      expect(data.meta.pagination).toBeNull();
      expect(data.meta.facets.sections).toEqual([2.5, 4, 16]);
    });
  });

  it('combines material and voltage filters with sorting', async () => {
    const { app } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({
        material: 'алюминий',
        voltage: '1000',
        sort: 'price-desc',
      });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual([
        'AVVG-4-16',
        'SIP-2-16',
      ]);
      expect(data.items.map((item) => item.price)).toEqual([260, 90]);
      expect(data.meta.total).toBe(2);
      expect(data.meta.facets.materials).toEqual(['алюминий', 'медь']);
      expect(data.meta.facets.voltages).toEqual([660, 1000]);
    });
  });

  it('paginates products with page and limit params', async () => {
    const manyItems = Array.from({ length: 25 }, (_, index) => ({
      ...productFixtures[0],
      id: 200 + index,
      sku: `PAGE-${String(index + 1).padStart(2, '0')}`,
      slug: `page-product-${index + 1}`,
      title: `Товар ${index + 1}`,
      fullName: `Тестовый товар ${index + 1}`,
      mark: `PAGE-${index + 1}`,
      price: index + 1,
      stock: index,
    }));
    const { app } = createProductCatalogApp(manyItems);

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({ page: '2', limit: '24' });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual(['PAGE-25']);
      expect(data.meta.count).toBe(1);
      expect(data.meta.total).toBe(25);
      expect(data.meta.pagination).toEqual({
        page: 2,
        limit: 24,
        total: 25,
        totalPages: 2,
      });
    });
  });

  it('combines category lookup with search and scoped facets', async () => {
    const { app, catalogStore } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({
        category: 'silovoy-kabel',
        search: 'АВВГ',
      });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual(['AVVG-4-16']);
      expect(data.meta.total).toBe(1);
      expect(data.meta.filter).toEqual({ category: 'silovoy-kabel' });
      expect(data.meta.facets).toMatchObject({
        materials: ['алюминий'],
        powerGroups: ['ВВГ / бронированные'],
        sections: [16],
        voltages: [1000],
        minPrice: 260,
        maxPrice: 260,
      });
    });

    expect(catalogStore.getCatalogProductsByCategory).toHaveBeenCalledWith(
      'silovoy-kabel',
      productFixtures
    );
  });

  it('filters power cable category by dedicated power group', async () => {
    const xlpeItem = {
      ...productFixtures[1],
      id: 105,
      sku: 'APVV-1-70',
      slug: 'apvv-ng-ls-1x70',
      title: 'АПвВ нг(А)LS 1х70',
      fullName: 'Кабель АПвВ нг(А)LS 1х70 10 кВ',
      mark: 'АПвВ нг(А)LS',
      cores: 1,
      crossSection: 70,
      voltage: 10,
      catalogType: 'СПЭ',
      price: 500,
      stock: 2,
    };
    const { app } = createProductCatalogApp([...productFixtures, xlpeItem]);

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({
        category: 'silovoy-kabel',
        powerGroup: 'Сшитый полиэтилен (XLPE)',
      });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual(['APVV-1-70']);
      expect(data.meta.facets.powerGroups).toEqual([
        'ВВГ / бронированные',
        'Сшитый полиэтилен (XLPE)',
      ]);
    });
  });
});

describe('GET /api/products/featured', () => {
  it('caches featured list items by catalog identity and limit', async () => {
    const { app, catalogStore } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const first = await fetch(
        `${localBaseUrl}/api/products/featured?limit=2`
      );
      const second = await fetch(
        `${localBaseUrl}/api/products/featured?limit=2`
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      await first.json();
      await second.json();
    });

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(2);
    expect(catalogStore.getCatalogProductListItems).toHaveBeenCalledTimes(1);
  });
});

describe('catalog public API rate limit', () => {
  it('uses one soft bucket for the public catalog endpoints', async () => {
    const { app } = createProductCatalogApp(productFixtures, {
      productApiRateLimitOptions: { limit: 2 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect((await fetch(`${localBaseUrl}/api/products`)).status).toBe(200);
      expect(
        (await fetch(`${localBaseUrl}/api/products/featured`)).status
      ).toBe(200);

      const res = await fetch(`${localBaseUrl}/api/products/suggestions`);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data).toEqual({
        ok: false,
        message: 'Слишком много запросов к каталогу. Попробуйте немного позже.',
      });
    });
  });

  it('limits lookup without sharing counters with form rate limits', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const { app } = createProductCatalogApp(productFixtures, {
      mailTransporter,
      productApiRateLimitOptions: { limit: 1 },
      quoteRateLimitOptions: { limit: 10 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect(
        (await postJsonTo(localBaseUrl, '/api/products/lookup', { ids: [101] }))
          .status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/products/lookup', { ids: [102] }))
          .status
      ).toBe(429);
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(200);
    });
  });

  it('applies the catalog API bucket to product detail routes too', async () => {
    const { app } = createProductCatalogApp(productFixtures, {
      productApiRateLimitOptions: { limit: 1 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect((await fetch(`${localBaseUrl}/api/products`)).status).toBe(200);

      const detail = await fetch(`${localBaseUrl}/api/products/vvgng-ls-3x2-5`);

      expect(detail.status).toBe(429);
    });
  });

  it('keys requests by trusted proxy client IP', async () => {
    const { app } = createProductCatalogApp(productFixtures, {
      productApiRateLimitOptions: { limit: 1 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect(
        (
          await fetch(`${localBaseUrl}/api/products`, {
            headers: { 'X-Forwarded-For': '203.0.113.10' },
          })
        ).status
      ).toBe(200);
      expect(
        (
          await fetch(`${localBaseUrl}/api/products/featured`, {
            headers: { 'X-Forwarded-For': '203.0.113.11' },
          })
        ).status
      ).toBe(200);
      expect(
        (
          await fetch(`${localBaseUrl}/api/products/suggestions`, {
            headers: { 'X-Forwarded-For': '203.0.113.10' },
          })
        ).status
      ).toBe(429);
    });
  });
});

describe('POST /api/products/lookup', () => {
  async function postLookup(localBaseUrl, body, headers = {}) {
    return fetch(`${localBaseUrl}/api/products/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('возвращает found/missing по списку id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, { ids: [101, 9999, 104] });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.found.map((item) => item.id)).toEqual([101, 104]);
      expect(data.missing).toEqual([9999]);
    });
  });

  it('игнорирует дубли и невалидные id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, {
        ids: [101, 101, 0, -3, 'abc', null, 104],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.found.map((item) => item.id).sort()).toEqual([101, 104]);
      expect(data.missing).toEqual([]);
    });
  });

  it('400 при отсутствии массива ids', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, { foo: 'bar' });
      expect(res.status).toBe(400);
    });
  });

  it('400 при превышении лимита по числу id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const ids = Array.from({ length: 201 }, (_, i) => i + 1);
      const res = await postLookup(localBaseUrl, { ids });
      expect(res.status).toBe(400);
    });
  });

  it('415 без application/json', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/products/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'ids=1',
      });
      expect(res.status).toBe(415);
    });
  });
});

describe('POST /api/quote', () => {
  it('503 с понятным сообщением, если формы отключены через FORMS_ENABLED=false', async () => {
    const mailTransporter = { sendMail: vi.fn() };
    const app = createTestApp({
      env: createTestEnv({ FORMS_ENABLED: 'false' }),
      mailTransporter,
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data).toEqual({
        ok: false,
        message:
          'Формы временно отключены. Свяжитесь с нами по телефону или email.',
      });
    });

    expect(mailTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('503 без попытки SMTP, если формы включены, но SMTP-конфигурация неполная', async () => {
    const mailTransporter = { sendMail: vi.fn() };
    const app = createTestApp({
      env: createTestEnv({ SMTP_PASS: '' }),
      mailTransporter,
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data).toEqual({
        ok: false,
        message:
          'Формы временно недоступны. Свяжитесь с нами по телефону или email.',
      });
    });

    expect(mailTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('happy path: валидный payload отправляет письмо и возвращает ok', async () => {
    const res = await postJson('/api/quote', validPayload);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.subject).toMatch(/КП/);
    expect(mailArgs.replyTo).toBe('ivan@example.com');
    expect(mailArgs.html).toContain('ВВГ 3х2.5');
    expect(mailArgs.html).toContain(
      'проверьте email отправителя в теле письма перед ответом'
    );
  });

  it('принимает валидную заявку с consent=true', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        consent: true,
      },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('повторяет отправку при временной SMTP-ошибке', async () => {
    const transientError = Object.assign(new Error('temporary SMTP failure'), {
      responseCode: 421,
    });
    const mailTransporter = {
      sendMail: vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ messageId: 'retry-ok' }),
    };
    const app = createTestApp({
      mailTransporter,
      mailSendOptions: { maxRetries: 1, retryDelayMs: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('500 при финальной SMTP-ошибке после transport timeout', async () => {
    const timeoutError = Object.assign(new Error('socket timeout'), {
      code: 'ETIMEDOUT',
    });
    const mailTransporter = {
      sendMail: vi.fn().mockRejectedValue(timeoutError),
    };
    const app = createTestApp({
      mailTransporter,
      mailSendOptions: { maxRetries: 0, retryDelayMs: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.message).toBe('Не удалось отправить заявку');
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('honeypot — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      company_website: 'https://spam.example',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('honeypot — фейковый success ждёт response floor', async () => {
    const app = createTestApp({
      formResponseDelayRange: { min: 40, max: 40 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const startedAt = Date.now();
      const res = await postJsonTo(localBaseUrl, '/api/quote', {
        ...validPayload,
        company_website: 'https://spam.example',
      });
      const elapsedMs = Date.now() - startedAt;
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(elapsedMs).toBeGreaterThanOrEqual(35);
    });

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('быстрый submit — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      submit_at: validPayload.rendered_at + 500,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('пустые браузерные headers — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', validPayload, {
      headers: {
        'User-Agent': '',
        'Accept-Language': '',
      },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('429 предлагает телефон или email', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const app = createTestApp({
      mailTransporter,
      quoteRateLimitOptions: { limit: 1 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(200);

      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data).toEqual({
        ok: false,
        message:
          'Слишком много заявок. Попробуйте позже или свяжитесь с нами по телефону или email.',
      });
    });
  });

  it('короткая заявка и полноценное КП используют независимые лимиты', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const app = createTestApp({
      mailTransporter,
      quoteRateLimitOptions: { limit: 1 },
      leadRateLimitOptions: { limit: 1 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(429);
      expect(
        (await postJsonTo(localBaseUrl, '/api/lead-request', validLeadPayload))
          .status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/lead-request', validLeadPayload))
          .status
      ).toBe(429);
    });
  });

  it('офисный NAT-сценарий не режется после трёх КП за час', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const app = createTestApp({
      rateLimitOptions: null,
      mailTransporter,
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      for (let index = 0; index < 4; index += 1) {
        const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
        expect(res.status).toBe(200);
      }
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(4);
  });

  it('honeypot и быстрый submit учитываются отдельно от нормального лимита КП', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const app = createTestApp({
      mailTransporter,
      quoteRateLimitOptions: { limit: 1 },
      botRateLimitOptions: { limit: 10 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      expect(
        (
          await postJsonTo(localBaseUrl, '/api/quote', {
            ...validPayload,
            company_website: 'https://spam.example',
          })
        ).status
      ).toBe(200);
      expect(
        (
          await postJsonTo(localBaseUrl, '/api/quote', {
            ...validPayload,
            submit_at: validPayload.rendered_at + 500,
          })
        ).status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/quote', validPayload)).status
      ).toBe(429);
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('повторяющиеся bot-сигналы ограничиваются отдельным лимитом', async () => {
    const mailTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
    const app = createTestApp({
      mailTransporter,
      quoteRateLimitOptions: { limit: 100 },
      botRateLimitOptions: { limit: 2 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      for (let index = 0; index < 2; index += 1) {
        const res = await postJsonTo(localBaseUrl, '/api/quote', {
          ...validPayload,
          company_website: `https://spam-${index}.example`,
        });
        expect(res.status).toBe(200);
      }

      const res = await postJsonTo(localBaseUrl, '/api/quote', {
        ...validPayload,
        company_website: 'https://spam-limit.example',
      });
      expect(res.status).toBe(429);
    });

    expect(mailTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('415 при отсутствии Content-Type: application/json', async () => {
    const res = await fetch(`${baseUrl}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(415);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при коротком телефоне', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: { ...validPayload.customer, phone: '+7 999' },
    });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при мусорном телефоне', async () => {
    for (const phone of ['3333333333', '1234567890']) {
      sendMailMock.mockClear();

      const res = await postJson('/api/quote', {
        ...validPayload,
        customer: { ...validPayload.customer, phone },
      });

      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    }
  });

  it('400 при слишком длинном комментарии позиции', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      items: [
        {
          ...validPayload.items[0],
          comment: 'x'.repeat(MAX_QUOTE_ITEM_COMMENT_LENGTH + 1),
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('413 при превышении транспортного лимита JSON body', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      extra: 'x'.repeat(MAX_QUOTE_PAYLOAD_BYTES),
    });
    const data = await res.json();

    expect(res.status).toBe(413);
    expect(data.ok).toBe(false);
    expect(data.message).toBe('Слишком большой запрос');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при пустой корзине', async () => {
    const res = await postJson('/api/quote', { ...validPayload, items: [] });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при канале email без email', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        email: '',
        preferredChannel: 'email',
      },
    });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при отсутствии согласия на обработку данных', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        consent: false,
      },
    });

    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('replyTo не выставляется, если email пустой', async () => {
    await postJson('/api/quote', {
      ...validPayload,
      customer: { ...validPayload.customer, email: '' },
    });
    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.replyTo).toBeUndefined();
  });

  it('CRLF в email отбрасывается на валидации, replyTo не выставляется', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        email: 'ivan@example.com\r\nBcc: attacker@evil.com',
      },
    });
    // Валидация на normalizeEmail вычистит \r\n → email становится склеенным
    // и не проходит EMAIL_RE → 400 без отправки письма.
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/lead-request', () => {
  it('503 с понятным сообщением, если формы отключены через FORMS_ENABLED=false', async () => {
    const mailTransporter = { sendMail: vi.fn() };
    const app = createTestApp({
      env: createTestEnv({ FORMS_ENABLED: 'false' }),
      mailTransporter,
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(
        localBaseUrl,
        '/api/lead-request',
        validLeadPayload
      );
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data).toEqual({
        ok: false,
        message:
          'Формы временно отключены. Свяжитесь с нами по телефону или email.',
      });
    });

    expect(mailTransporter.sendMail).not.toHaveBeenCalled();
  });

  it('happy path: валидный payload отправляет письмо и возвращает ok', async () => {
    const res = await postJson('/api/lead-request', validLeadPayload);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.subject).toMatch(/короткая заявка/i);
    expect(mailArgs.html).toContain('ВВГ 3х2.5');
  });

  it('500 с пользовательским сообщением при SMTP-ошибке', async () => {
    const mailTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error('535 auth failed')),
    };
    const app = createTestApp({
      mailTransporter,
      mailSendOptions: { maxRetries: 0, retryDelayMs: 0 },
      formResponseDelayRange: { min: 0, max: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(
        localBaseUrl,
        '/api/lead-request',
        validLeadPayload
      );
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data).toEqual({
        ok: false,
        message: 'Не удалось отправить заявку',
      });
      expect(JSON.stringify(data)).not.toContain('535');
      expect(JSON.stringify(data)).not.toContain('auth failed');
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('400 при мусорном телефоне', async () => {
    for (const phone of ['3333333333', '1234567890']) {
      sendMailMock.mockClear();

      const res = await postJson('/api/lead-request', {
        ...validLeadPayload,
        phone,
      });

      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    }
  });

  it('400 при слишком длинных полях короткой заявки', async () => {
    for (const payloadPatch of [
      { name: 'И'.repeat(121) },
      { comment: 'К'.repeat(1001) },
      { source: 'S'.repeat(161) },
    ]) {
      sendMailMock.mockClear();

      const res = await postJson('/api/lead-request', {
        ...validLeadPayload,
        ...payloadPatch,
      });

      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    }
  });

  it('быстрый submit — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/lead-request', {
      ...validLeadPayload,
      submit_at: validLeadPayload.rendered_at + 500,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('chat conversations API', () => {
  it('создаёт диалог и отправляет уведомление менеджеру во VK', async () => {
    const chatStore = createInMemoryChatStore();
    const vkBridge = createMockVkBridge({
      notifyConversationCreated: vi.fn(async () => ({
        channel: 'vk',
        peerId: '2000000005',
        messageId: 77,
        conversationMessageId: 701,
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.message).toBe(
        'Диалог начат. Менеджер ответит здесь в рабочее время.'
      );
      expect(data.conversationId).toEqual(expect.any(String));
      expect(data.customerToken).toEqual(expect.any(String));
      expect(data.conversation.messages).toHaveLength(2);
      expect(data.conversation.messages[1]).toMatchObject({
        role: 'customer',
        text: validChatPayload.message,
      });

      expect(vkBridge.notifyConversationCreated).toHaveBeenCalledTimes(1);

      const storedConversation = await chatStore.getConversation(
        data.conversationId
      );
      expect(storedConversation.managerNotifications).toContainEqual(
        expect.objectContaining({
          channel: 'vk',
          peerId: '2000000005',
          messageId: 77,
          conversationMessageId: 701,
        })
      );
    });
  });

  it('доправляет pending VK-уведомление при следующем чтении диалога клиентом', async () => {
    const chatStore = createInMemoryChatStore();
    let notifyAttempt = 0;
    const vkBridge = createMockVkBridge({
      notifyConversationCreated: vi.fn(async () => {
        notifyAttempt += 1;
        if (notifyAttempt === 1) {
          throw new Error('vk unavailable');
        }

        return {
          channel: 'vk',
          peerId: '2000000005',
          messageId: 77,
          conversationMessageId: 701,
        };
      }),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      const storedBeforeRetry = await chatStore.getConversation(
        created.conversationId
      );
      expect(storedBeforeRetry.managerNotifications).toHaveLength(0);

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );

      expect(customerRes.status).toBe(200);
      expect(vkBridge.notifyConversationCreated).toHaveBeenCalledTimes(2);

      const storedAfterRetry = await chatStore.getConversation(
        created.conversationId
      );
      expect(storedAfterRetry.managerNotifications).toContainEqual(
        expect.objectContaining({
          channel: 'vk',
          peerId: '2000000005',
          messageId: 77,
          conversationMessageId: 701,
        })
      );
    });
  });

  it('отдаёт историю клиенту и шлёт новое VK-уведомление на сообщение', async () => {
    const chatStore = createInMemoryChatStore();
    const vkBridge = createMockVkBridge({
      notifyConversationCreated: vi.fn(async () => ({
        channel: 'vk',
        peerId: '2000000005',
        messageId: 77,
        conversationMessageId: 701,
      })),
      notifyCustomerMessage: vi.fn(async () => ({
        channel: 'vk',
        peerId: '2000000005',
        messageId: 88,
        conversationMessageId: 702,
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();

      expect(customerRes.status).toBe(200);
      expect(customerData.role).toBe('customer');
      expect(customerData.conversation.customerPhone).toBeUndefined();

      const messageRes = await postJsonTo(
        localBaseUrl,
        `/api/chat/conversations/${created.conversationId}/messages`,
        {
          message: 'Есть ли в наличии 400 метров?',
        },
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const messageData = await messageRes.json();

      expect(messageRes.status).toBe(200);
      expect(messageData.message).toBe('Сообщение отправлено');
      expect(vkBridge.notifyCustomerMessage).toHaveBeenCalledTimes(1);

      const storedConversation = await chatStore.getConversation(
        created.conversationId
      );
      expect(storedConversation.managerNotifications).toContainEqual(
        expect.objectContaining({
          channel: 'vk',
          peerId: '2000000005',
          messageId: 88,
          conversationMessageId: 702,
        })
      );
    });
  });

  it('не отдаёт клиентскую переписку без bearer-токена', async () => {
    const chatStore = createInMemoryChatStore();
    const app = createTestApp({ chatStore });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`
      );
      const customerData = await customerRes.json();

      expect(customerRes.status).toBe(404);
      expect(customerData.ok).toBe(false);
      expect(customerData.message).toBe('Диалог не найден');
    });
  });

  it('принимает ответ менеджера из VK callback и показывает его клиенту', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const outboundCalls = [];
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async (url, init) => {
        outboundCalls.push({ url, init });
        return {
          ok: true,
          json: async () => ({
            response: {
              peer_id: 2000000005,
              message_id: 900,
              conversation_message_id: 500,
            },
          }),
        };
      }),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();
      const firstNotificationBody = outboundCalls[0]?.init?.body;

      expect(firstNotificationBody).toBeInstanceOf(URLSearchParams);
      expect(firstNotificationBody.get('message')).toContain('Контакт: не указан');
      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_new',
          event_id: 'evt-101',
          group_id: 123,
          secret: 'vk-secret',
          object: {
            message: {
              id: 777,
              conversation_message_id: 778,
              peer_id: 2000000005,
              from_id: 42,
              text: 'Подтверждаю, 400 метров есть на складе.',
              reply_message: {
                id: 500,
                conversation_message_id: 500,
                peer_id: 2000000005,
                text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
              },
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const lastMessage =
        customerData.conversation.messages[
          customerData.conversation.messages.length - 1
        ];

      expect(lastMessage).toMatchObject({
        role: 'manager',
        text: 'Подтверждаю, 400 метров есть на складе.',
      });
      expect(outboundCalls).toHaveLength(2);
    });
  });

  it('принимает ответ из интерфейса сообщества через message_reply', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const outboundCalls = [];
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_MANAGER_USER_IDS: '42',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async (url, init) => {
        outboundCalls.push({ url, init });
        return {
          ok: true,
          json: async () => ({
            response: {
              peer_id: 2000000005,
              message_id: 900,
              conversation_message_id: 500,
            },
          }),
        };
      }),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_reply',
          event_id: 'evt-community-reply',
          group_id: 123,
          secret: 'vk-secret',
          object: {
            id: 777,
            out: 1,
            peer_id: 2000000005,
            from_id: 123,
            admin_author_id: 42,
            conversation_message_id: 778,
            text: 'Отвечаю из интерфейса сообщества.',
            reply_message: {
              id: 500,
              conversation_message_id: 500,
              peer_id: 2000000005,
              text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const lastMessage =
        customerData.conversation.messages[
          customerData.conversation.messages.length - 1
        ];

      expect(lastMessage).toMatchObject({
        role: 'manager',
        text: 'Отвечаю из интерфейса сообщества.',
      });
      expect(outboundCalls).toHaveLength(2);
    });
  });

  it('не теряет ответ менеджера, если VK ack не отправился', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    let ackCallCount = 0;
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async () => {
        ackCallCount += 1;
        if (ackCallCount > 1) {
          throw new Error('vk ack failed');
        }

        return {
          ok: true,
          json: async () => ({
            response: {
              peer_id: 2000000005,
              message_id: 900,
              conversation_message_id: 500,
            },
          }),
        };
      }),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_new',
          event_id: 'evt-ack-failure',
          group_id: 123,
          secret: 'vk-secret',
          object: {
            message: {
              id: 777,
              conversation_message_id: 778,
              peer_id: 2000000005,
              from_id: 42,
              text: 'Подтверждаю, 400 метров есть на складе.',
              reply_message: {
                id: 500,
                conversation_message_id: 500,
                peer_id: 2000000005,
                text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
              },
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();

      expect(customerData.conversation.messages.at(-1)).toMatchObject({
        role: 'manager',
        text: 'Подтверждаю, 400 метров есть на складе.',
      });
    });
  });

  it('игнорирует исходящие сообщения сообщества без admin_author_id', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            peer_id: 2000000005,
            message_id: 900,
            conversation_message_id: 500,
          },
        }),
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_reply',
          event_id: 'evt-service-reply',
          group_id: 123,
          secret: 'vk-secret',
          object: {
            id: 777,
            out: 1,
            peer_id: 2000000005,
            from_id: 123,
            conversation_message_id: 778,
            text: 'Служебное исходящее сообщение сообщества.',
            reply_message: {
              id: 500,
              conversation_message_id: 500,
              peer_id: 2000000005,
              text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const managerMessages = customerData.conversation.messages.filter(
        (message) => message.role === 'manager' && message.createdAt
      );

      expect(managerMessages).toHaveLength(0);
    });
  });

  it('игнорирует повторную доставку одного и того же VK event_id', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            peer_id: 2000000005,
            message_id: 900,
            conversation_message_id: 500,
          },
        }),
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const payload = {
        type: 'message_new',
        event_id: 'evt-duplicate',
        group_id: 123,
        secret: 'vk-secret',
        object: {
          message: {
            id: 777,
            conversation_message_id: 778,
            peer_id: 2000000005,
            from_id: 42,
            text: 'Подтверждаю, 400 метров есть на складе.',
            reply_message: {
              id: 500,
              conversation_message_id: 500,
              peer_id: 2000000005,
              text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
            },
          },
        },
      };

      expect(
        (await postJsonTo(localBaseUrl, '/api/vk/callback', payload)).status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/vk/callback', payload)).status
      ).toBe(200);

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const managerMessages = customerData.conversation.messages.filter(
        (message) =>
          message.role === 'manager' &&
          message.text === 'Подтверждаю, 400 метров есть на складе.'
      );

      expect(managerMessages).toHaveLength(1);
    });
  });

  it('не дублирует manager reply без event_id при повторной доставке одного и того же VK message', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_MANAGER_USER_IDS: '42',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            peer_id: 2000000005,
            message_id: 900,
            conversation_message_id: 500,
          },
        }),
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const payload = {
        type: 'message_reply',
        group_id: 123,
        secret: 'vk-secret',
        object: {
          id: 777,
          out: 1,
          peer_id: 2000000005,
          from_id: 123,
          admin_author_id: 42,
          conversation_message_id: 778,
          text: 'Один и тот же manager reply без event_id.',
          reply_message: {
            id: 500,
            conversation_message_id: 500,
            peer_id: 2000000005,
            text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
          },
        },
      };

      expect(
        (await postJsonTo(localBaseUrl, '/api/vk/callback', payload)).status
      ).toBe(200);
      expect(
        (await postJsonTo(localBaseUrl, '/api/vk/callback', payload)).status
      ).toBe(200);

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const managerMessages = customerData.conversation.messages.filter(
        (message) =>
          message.role === 'manager' &&
          message.text === 'Один и тот же manager reply без event_id.'
      );

      expect(managerMessages).toHaveLength(1);
    });
  });

  it('не принимает manager reply длиннее лимита и не показывает его клиенту', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const outboundCalls = [];
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_MANAGER_USER_IDS: '42',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_CONFIRMATION_TOKEN: 'vk-confirmation-token',
        VK_GROUP_ID: '123',
      }),
      fetchImpl: vi.fn(async (url, init) => {
        outboundCalls.push({ url, init });
        return {
          ok: true,
          json: async () => ({
            response: {
              peer_id: 2000000005,
              message_id: 900,
              conversation_message_id: 500,
            },
          }),
        };
      }),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_reply',
          event_id: 'evt-overlong-manager-reply',
          group_id: 123,
          secret: 'vk-secret',
          object: {
            id: 777,
            out: 1,
            peer_id: 2000000005,
            from_id: 123,
            admin_author_id: 42,
            conversation_message_id: 778,
            text: 'L'.repeat(2001),
            reply_message: {
              id: 500,
              conversation_message_id: 500,
              peer_id: 2000000005,
              text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();
      const managerMessages = customerData.conversation.messages.filter(
        (message) => message.role === 'manager' && message.createdAt
      );

      expect(managerMessages).toHaveLength(0);
      expect(outboundCalls).toHaveLength(2);
      const ackBody = outboundCalls[1]?.init?.body;
      expect(ackBody).toBeInstanceOf(URLSearchParams);
      expect(ackBody.get('message')).toContain('от 1 до 2000 символов');
    });
  });

  it('не принимает VK callback без secret', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const app = createTestApp({
      vkBridge: createVkChatBridge({
        env: createTestEnv({
          VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
          VK_MANAGER_PEER_ID: '2000000005',
          VK_CALLBACK_SECRET: 'vk-secret',
        }),
        fetchImpl: vi.fn(),
      }),
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/vk/callback', {
        type: 'message_new',
        event_id: 'evt-1',
        object: {
          message: {
            peer_id: 2000000005,
            from_id: 42,
            text: 'test',
          },
        },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
    });
  });

  it('принимает VK callback с несовпадающим secret в локальном insecure-режиме', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const vkBridge = createVkChatBridge({
      env: createTestEnv({
        VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
        VK_MANAGER_PEER_ID: '2000000005',
        VK_MANAGER_USER_IDS: '42',
        VK_CALLBACK_SECRET: 'vk-secret',
        VK_CALLBACK_ALLOW_INSECURE: 'true',
      }),
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: {
            peer_id: 2000000005,
            message_id: 900,
            conversation_message_id: 500,
          },
        }),
      })),
    });
    const app = createTestApp({ chatStore, vkBridge });

    await withTestServer(app, async (localBaseUrl) => {
      const createRes = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const created = await createRes.json();

      await chatStore.registerManagerNotification(created.conversationId, {
        channel: 'vk',
        peerId: '2000000005',
        messageId: 500,
        conversationMessageId: 500,
      });

      const callbackRes = await postJsonTo(
        localBaseUrl,
        '/api/vk/callback',
        {
          type: 'message_reply',
          event_id: 'evt-insecure-local-reply',
          group_id: 123,
          secret: 'unexpected-secret',
          object: {
            id: 777,
            out: 1,
            peer_id: 2000000005,
            from_id: 123,
            admin_author_id: 42,
            conversation_message_id: 778,
            text: 'Локальный reply без строгой проверки secret.',
            reply_message: {
              id: 500,
              conversation_message_id: 500,
              peer_id: 2000000005,
              text: `Новый диалог с сайта\n#chat_${created.conversationId}`,
            },
          },
        }
      );

      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.text()).toBe('ok');

      const customerRes = await fetch(
        `${localBaseUrl}/api/chat/conversations/${created.conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${created.customerToken}`,
          },
        }
      );
      const customerData = await customerRes.json();

      expect(customerData.conversation.messages.at(-1)).toMatchObject({
        role: 'manager',
        text: 'Локальный reply без строгой проверки secret.',
      });
    });
  });

  it('не принимает VK callback, если bridge включён без callback secret', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const app = createTestApp({
      vkBridge: createVkChatBridge({
        env: createTestEnv({
          VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
          VK_MANAGER_PEER_ID: '2000000005',
        }),
        fetchImpl: vi.fn(),
      }),
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/vk/callback', {
        type: 'message_new',
        event_id: 'evt-2',
        secret: 'anything',
        object: {
          message: {
            peer_id: 2000000005,
            from_id: 42,
            text: 'test',
          },
        },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
    });
  });

  it('не регистрирует manager notification, если messages.send вернул частичную ошибку', async () => {
    const { createVkChatBridge } = await import('./lib/vkChat.js');
    const chatStore = createInMemoryChatStore();
    const app = createTestApp({
      chatStore,
      vkBridge: createVkChatBridge({
        env: createTestEnv({
          VK_COMMUNITY_ACCESS_TOKEN: 'vk-token',
          VK_MANAGER_PEER_ID: '2000000005',
          VK_CALLBACK_SECRET: 'vk-secret',
        }),
        fetchImpl: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            response: [
              {
                peer_id: 2000000005,
                error: 'Chat not supported',
              },
            ],
          }),
        })),
      }),
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(
        localBaseUrl,
        '/api/chat/conversations',
        validChatPayload
      );
      const data = await res.json();

      expect(res.status).toBe(200);

      const storedConversation = await chatStore.getConversation(
        data.conversationId
      );
      expect(storedConversation.managerNotifications).toHaveLength(0);
    });
  });
});
