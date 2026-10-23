// Файл проверяет запросы КП, корзину и доступ к internal runtime.
// Главная и чат проверяются в отдельных e2e-наборах.

import { expect, test } from '@playwright/test';
import { expectFieldError } from './helpers/assertions.js';

const PRODUCT_ROUTE = '/product/e2e-vvgng-ls-3x2-5';
const INTERNAL_TOKEN_STORAGE_KEY = 'yuzhural-internal-metrics-token';

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

test.beforeEach(async ({ request }) => {
  await expect
    .poll(
      async () => {
        const response = await request.get('/api/products?limit=1');
        return response.status();
      },
      { timeout: 30_000 }
    )
    .toBe(200);
});

async function fulfillJson(route, payload, { status = 200 } = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

async function openCartPageWithFixtureProduct(page) {
  await page.goto(PRODUCT_ROUTE);
  await page.getByRole('button', { name: 'Добавить в корзину' }).click();
  await page.goto('/cart');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/ВВГнг-LS 3[хx]2\.5/i)).toBeVisible();
}

// Legacy manual items can still be restored and sent, although the old entry form was removed.
async function restoreManualCartItem(page) {
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('yuzhural-cart'));
    stored.state.items.push({
      id: 'manual-e2e',
      slug: '',
      sku: '',
      manual: true,
      title: 'АВБбШв 4x25',
      category: 'Ручная позиция',
      price: 0,
      quantity: 50,
      unit: 'м',
      comment: 'Нужен аналог с расчётом',
      image: '/product-placeholder.svg',
    });
    localStorage.setItem('yuzhural-cart', JSON.stringify(stored));
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'АВБбШв 4x25' })
  ).toBeVisible();
}

async function openCartQuoteModal(page) {
  await page
    .getByRole('button', { name: 'Запросить коммерческое предложение' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Диалоговое окно' });
  await expect(
    dialog.getByRole('heading', { name: 'Запрос коммерческого предложения' })
  ).toBeVisible();

  return dialog;
}

async function fillRequiredQuoteFields(scope, data = {}) {
  const {
    name = 'Иван Петров',
    phone = '+7 900 123-45-67',
    comment = 'Подготовьте КП сегодня',
    preferredChannel = 'Telegram',
  } = data;

  await scope.getByLabel(/Имя/).fill(name);
  await scope.getByLabel(/Телефон/).fill(phone);
  if (comment) {
    await scope.getByLabel(/Комментарий/).fill(comment);
  }
  if (preferredChannel) {
    await scope.getByLabel(preferredChannel).check();
  }
  await scope.getByLabel(/Даю согласие/i).check();
}

test('product quote modal submits QuoteForm payload', async ({ page }) => {
  let quotePayload;

  await page.route('**/api/quote', async (route) => {
    quotePayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ok: true,
      message: 'Заявка принята',
    });
  });

  await page.goto(PRODUCT_ROUTE);

  await page
    .getByRole('button', { name: 'Запросить КП по этой позиции' })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Диалоговое окно' });
  await expect(
    dialog.getByRole('heading', { name: 'Запрос КП по этой позиции' })
  ).toBeVisible();

  await dialog.getByLabel(/Имя/).fill('Иван Петров');
  await dialog.getByLabel(/Телефон/).fill('+7 900 123-45-67');
  await dialog.getByLabel(/Комментарий/).fill('Нужна отгрузка сегодня');
  await dialog.getByLabel('Telegram').check();
  await dialog.getByLabel(/Даю согласие/i).check();
  await dialog.getByRole('button', { name: 'Отправить запрос КП' }).click();

  await expect(dialog.getByText('Заявка принята')).toBeVisible();

  expect(quotePayload.customer).toMatchObject({
    name: 'Иван Петров',
    phone: '+7 900 123-45-67',
    email: '',
    comment: 'Нужна отгрузка сегодня',
    preferredChannel: 'telegram',
    consent: true,
  });
  expect(quotePayload.items).toHaveLength(1);
  expect(quotePayload.items[0]).toMatchObject({
    title: expect.any(String),
    quantity: 1,
  });
  expect(quotePayload.totalCount).toBe(1);
  expect(quotePayload.totalPrice).toBe(
    Number(quotePayload.items[0].price || 0) *
      Number(quotePayload.items[0].quantity || 0)
  );
  expect(quotePayload.createdAt).toEqual(expect.any(String));
  expect(quotePayload.rendered_at).toEqual(expect.any(Number));
  expect(quotePayload.submit_at).toEqual(expect.any(Number));
  expect(quotePayload.submit_at).toBeGreaterThan(quotePayload.rendered_at);
});

test('cart page keeps quote CTA unavailable until there are positions', async ({
  page,
}) => {
  await page.goto('/cart');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /(?:корзин|список).*пуст/i })
  ).toBeVisible();
  await expect(
    page.locator('.cart-empty').getByRole('link', { name: /каталог/i })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Запросить коммерческое предложение' })
  ).toHaveCount(0);
});

test('cart quote modal validates required fields before request', async ({
  page,
}) => {
  let quoteRequests = 0;

  await page.route('**/api/quote', async (route) => {
    quoteRequests += 1;
    await fulfillJson(route, {
      ok: true,
      message: 'Этого ответа не должно быть',
    });
  });

  await openCartPageWithFixtureProduct(page);

  const dialog = await openCartQuoteModal(page);
  await dialog.getByRole('button', { name: 'Отправить запрос КП' }).click();

  await expectFieldError(dialog.getByRole('textbox', { name: /имя/i }));
  await expectFieldError(dialog.getByRole('textbox', { name: /телефон/i }));
  await expectFieldError(dialog.getByRole('checkbox', { name: /согласи/i }));
  expect(quoteRequests).toBe(0);
});

test('cart submits catalog and restored manual items and clears cart after success', async ({
  page,
}) => {
  let quotePayload;

  await page.route('**/api/quote', async (route) => {
    quotePayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ok: true,
      message: 'КП отправлено. Менеджер свяжется с вами.',
    });
  });

  await openCartPageWithFixtureProduct(page);
  await restoreManualCartItem(page);

  const dialog = await openCartQuoteModal(page);
  await fillRequiredQuoteFields(dialog);
  await dialog.getByRole('button', { name: 'Отправить запрос КП' }).click();

  await expect(
    dialog.getByText('КП отправлено. Менеджер свяжется с вами.')
  ).toBeVisible();

  expect(quotePayload.customer).toMatchObject({
    name: 'Иван Петров',
    phone: '+7 900 123-45-67',
    email: '',
    comment: 'Подготовьте КП сегодня',
    preferredChannel: 'telegram',
    consent: true,
  });
  expect(quotePayload.items).toHaveLength(2);
  expect(quotePayload.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 9100001,
        sku: 'E2E-VVG-001',
        quantity: 1,
        unit: 'м',
      }),
      expect.objectContaining({
        sku: '',
        title: 'АВБбШв 4x25',
        category: 'Ручная позиция',
        price: 0,
        quantity: 50,
        unit: 'м',
        comment: 'Нужен аналог с расчётом',
      }),
    ])
  );
  expect(quotePayload.totalCount).toBe(2);
  expect(quotePayload.totalPrice).toBe(120);
  expect(quotePayload.createdAt).toEqual(expect.any(String));
  expect(quotePayload.rendered_at).toEqual(expect.any(Number));
  expect(quotePayload.submit_at).toEqual(expect.any(Number));
  expect(quotePayload.submit_at).toBeGreaterThan(quotePayload.rendered_at);

  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(
    page.getByRole('heading', { name: /(?:корзин|список).*пуст/i })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Запросить коммерческое предложение' })
  ).toHaveCount(0);
});

test('cart quote modal shows backend error without clearing form', async ({
  page,
}) => {
  await page.route('**/api/quote', async (route) => {
    await fulfillJson(
      route,
      {
        ok: false,
        message: 'Сервис временно недоступен',
      },
      { status: 503 }
    );
  });

  await openCartPageWithFixtureProduct(page);

  const dialog = await openCartQuoteModal(page);
  await fillRequiredQuoteFields(dialog, {
    comment: 'Нужна поставка к пятнице',
  });
  await dialog.getByRole('button', { name: 'Отправить запрос КП' }).click();

  await expect(dialog.getByText('Сервис временно недоступен')).toBeVisible();
  await expect(dialog.getByLabel(/Имя/)).toHaveValue('Иван Петров');
  await expect(dialog.getByLabel(/Телефон/)).toHaveValue('+7 900 123-45-67');
  await expect(dialog.getByLabel(/Комментарий/)).toHaveValue(
    'Нужна поставка к пятнице'
  );
  await expect(
    dialog.getByRole('button', { name: 'Отправить запрос КП' })
  ).toBeEnabled();
  await expect(page.getByText(/ВВГнг-LS 3[хx]2\.5/i)).toBeVisible();
});

test('internal runtime page renders diagnostics and refresh probe flow', async ({
  page,
}) => {
  const runtimeRequests = [];
  const vkRequests = [];

  await page.addInitScript(
    ({ key, token }) => {
      window.sessionStorage.setItem(key, token);
    },
    {
      key: INTERNAL_TOKEN_STORAGE_KEY,
      token: 'test-runtime-token',
    }
  );

  await page.route('**/api/runtime', async (route) => {
    runtimeRequests.push(route.request().headers().authorization || '');
    await fulfillJson(route, runtimeSnapshot);
  });

  await page.route('**/api/vk/health*', async (route) => {
    const url = route.request().url();
    vkRequests.push(url);
    await fulfillJson(
      route,
      url.includes('refresh=1') ? refreshedVkSnapshot : readyVkSnapshot
    );
  });

  await page.goto('/internal/runtime');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Internal Runtime' })
  ).toBeVisible();
  await expect(page.getByText('ready')).toBeVisible();
  await expect(page.getByText('v20.18.0')).toBeVisible();
  await expect(page.getByText('128 сек')).toBeVisible();
  await expect(page.getByText('2000000005')).toBeVisible();
  await expect(
    page.getByText('https://vk.example.test/api/vk/callback')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Проверить callback URL' }).click();

  await expect.poll(() => runtimeRequests.length).toBe(2);
  await expect.poll(() => vkRequests.length).toBe(2);
  expect(runtimeRequests).toEqual([
    'Bearer test-runtime-token',
    'Bearer test-runtime-token',
  ]);
  expect(vkRequests.some((url) => url.includes('refresh=1'))).toBe(true);
});
