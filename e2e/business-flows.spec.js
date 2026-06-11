// Файл покрывает ключевые бизнес-сценарии: лид-форма, запрос КП, чат и internal runtime.

import { expect, test } from '@playwright/test';

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

async function openChatWidget(page) {
  const launcher = page.getByRole('button', { name: 'Чат с менеджером' });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(
    page.getByRole('heading', { name: 'Чат с менеджером' })
  ).toBeVisible();
}

async function openCartPageWithFixtureProduct(page) {
  await page.goto(PRODUCT_ROUTE);
  await page.getByRole('button', { name: 'Добавить в корзину' }).click();
  await page.goto('/cart');
  await expect(
    page.getByRole('heading', { name: 'Список для КП' })
  ).toBeVisible();
  await expect(page.getByText(/ВВГнг-LS 3[хx]2\.5/i)).toBeVisible();
}

async function addManualCartItem(page, item = {}) {
  const {
    mark = 'АВБбШв 4x25',
    quantity = '50',
    comment = 'Нужен аналог с расчётом',
  } = item;

  const manualForm = page.locator('.cart-manual__form');
  await manualForm.getByLabel('Марка или наименование').fill(mark);
  await manualForm.getByLabel('Метраж').fill(quantity);
  await manualForm.getByLabel('Комментарий').fill(comment);
  await manualForm.getByRole('button', { name: 'Добавить в список' }).click();

  await expect(page.getByRole('heading', { name: mark })).toBeVisible();
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

test('home hero lead form submits HeroLeadForm payload', async ({ page }) => {
  let leadPayload;

  await page.route('**/api/lead-request', async (route) => {
    leadPayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ok: true,
      message: 'Заявка отправлена. Мы скоро свяжемся с вами.',
    });
  });

  await page.goto('/');

  const heroForm = page.locator('.home-hero-zone__form');
  const commentField = heroForm.getByLabel(/Комментарий/i);

  await expect(
    heroForm.getByRole('heading', { name: 'Не тратьте время на поиск кабеля' })
  ).toBeVisible();
  await heroForm.getByRole('button', { name: 'ВВГ', exact: true }).click();
  await expect(commentField).toHaveValue('ВВГ');

  await heroForm.getByLabel('Ваш телефон').fill('+7 900 123-45-67');
  await heroForm.getByLabel(/Даю согласие/i).check();
  await heroForm.getByRole('button', { name: 'Получить КП' }).click();

  await expect(
    heroForm.getByText('Заявка отправлена. Мы скоро свяжемся с вами.')
  ).toBeVisible();

  expect(leadPayload).toMatchObject({
    phone: '+7 900 123-45-67',
    comment: 'ВВГ',
    source: 'Форма в герое главной',
    company_website: '',
  });
  expect(leadPayload.createdAt).toEqual(expect.any(String));
  expect(leadPayload.rendered_at).toEqual(expect.any(Number));
  expect(leadPayload.submit_at).toEqual(expect.any(Number));
  expect(leadPayload.submit_at).toBeGreaterThan(leadPayload.rendered_at);
});

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

  await expect(
    page.getByRole('heading', { name: 'Список для КП' })
  ).toBeVisible();
  await expect(page.getByText('Список пока пуст.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Перейти в каталог' })
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

  await expect(dialog.getByText('Введите имя')).toBeVisible();
  await expect(dialog.getByText('Введите телефон')).toBeVisible();
  await expect(
    dialog.getByText('Нужно согласие на обработку данных')
  ).toBeVisible();
  expect(quoteRequests).toBe(0);
});

test('cart quote modal submits request and clears cart after success', async ({
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
  await addManualCartItem(page);

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
  await expect(page.getByText('Список пока пуст.')).toBeVisible();
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

test('chat widget creates and restores a customer session', async ({
  context,
  page,
}) => {
  const baseConversation = {
    id: 'chat-e2e',
    messages: [
      {
        id: 'm1',
        role: 'manager',
        text: 'Здравствуйте.\nУ вас возникли вопросы? Мы с удовольствием ответим!',
        createdAt: '2026-06-10T07:00:00.000Z',
      },
      {
        id: 'm2',
        role: 'customer',
        text: 'Нужен ВВГ 3x2.5',
        createdAt: '2026-06-10T07:00:01.000Z',
      },
    ],
  };
  const restoredConversation = {
    ...baseConversation,
    messages: [
      ...baseConversation.messages,
      {
        id: 'm3',
        role: 'manager',
        text: 'Менеджер подключился, готовим предложение.',
        createdAt: '2026-06-10T07:05:00.000Z',
      },
    ],
  };

  let createCalls = 0;
  let conversationReads = 0;

  await context.route('**/api/chat/conversations', async (route) => {
    createCalls += 1;

    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toMatchObject({
      message: 'Нужен ВВГ 3x2.5',
      source: 'Чат: Главная страница',
      company_website: '',
    });

    await fulfillJson(route, {
      ok: true,
      message: 'Диалог начат. Менеджер ответит здесь в рабочее время.',
      conversationId: 'chat-e2e',
      customerToken: 'customer-token',
      conversation: baseConversation,
    });
  });

  await context.route('**/api/chat/conversations/chat-e2e', async (route) => {
    conversationReads += 1;

    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe(
      'Bearer customer-token'
    );

    await fulfillJson(route, {
      ok: true,
      role: 'customer',
      conversation:
        conversationReads === 1 ? baseConversation : restoredConversation,
    });
  });

  await page.goto('/');
  await openChatWidget(page);
  const chatWidget = page.getByRole('region', { name: 'Чат с менеджером' });
  await chatWidget.getByLabel(/Даю согласие/).check();
  await chatWidget.getByLabel('Введите сообщение').fill('Нужен ВВГ 3x2.5');
  await chatWidget.getByRole('button', { name: 'Отправить сообщение' }).click();

  await expect(page.getByText('Нужен ВВГ 3x2.5')).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('yuzhural-chat-session');
        return raw ? JSON.parse(raw) : null;
      })
    )
    .toEqual({
      conversationId: 'chat-e2e',
      customerToken: 'customer-token',
    });

  await page.close();

  const restoredPage = await context.newPage();
  await restoredPage.goto('/');
  await expect.poll(() => conversationReads).toBeGreaterThanOrEqual(2);

  await openChatWidget(restoredPage);
  await expect(
    restoredPage.getByText('Менеджер подключился, готовим предложение.')
  ).toBeVisible();
  expect(createCalls).toBe(1);
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

test('internal runtime page tolerates degraded VK health JSON response', async ({
  page,
}) => {
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
    await fulfillJson(route, runtimeSnapshot);
  });

  await page.route('**/api/vk/health', async (route) => {
    await fulfillJson(route, degradedVkSnapshot, { status: 503 });
  });

  await page.goto('/internal/runtime');

  const heroCard = page.locator('.internal-runtime__hero-card');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Internal Runtime' })
  ).toBeVisible();
  await expect(heroCard.getByText('degraded')).toHaveClass(
    /internal-runtime__badge--warn/
  );
  await expect(page.getByText('Probe returned 503')).toBeVisible();
  await expect(
    page.getByText('Probe degraded after repeated 503 responses')
  ).toBeVisible();
  await expect(page.getByText('chat_42')).toBeVisible();
  await expect(
    page.getByText('https://vk.example.test/api/vk/callback')
  ).toBeVisible();
});
