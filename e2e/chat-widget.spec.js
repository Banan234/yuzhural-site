// Файл покрывает e2e-поток чат-виджета: старт диалога, восстановление сессии и backend-error.

import { expect, test } from '@playwright/test';

const CHAT_SESSION_STORAGE_KEY = 'yuzhural-chat-session';

async function fulfillJson(route, payload, { status = 200 } = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

async function openChatWidget(page) {
  const title = page.getByRole('heading', { name: 'Чат с менеджером' });

  if (!(await title.isVisible())) {
    const launcher = page.getByRole('button', { name: 'Чат с менеджером' });
    await expect(launcher).toBeVisible();
    await launcher.click();
  }

  await expect(title).toBeVisible();
}

async function readStoredSession(page) {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, CHAT_SESSION_STORAGE_KEY);
}

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

test('chat widget starts a session with the first message and restores it after reload', async ({
  page,
}) => {
  const initialConversation = {
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
    ...initialConversation,
    messages: [
      ...initialConversation.messages,
      {
        id: 'm3',
        role: 'manager',
        text: 'Менеджер подключился, готовим предложение.',
        createdAt: '2026-06-10T07:05:00.000Z',
      },
    ],
  };

  let createCalls = 0;
  let restoreReads = 0;

  await page.route('**/api/chat/conversations', async (route) => {
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
      conversation: initialConversation,
    });
  });

  await page.route('**/api/chat/conversations/chat-e2e', async (route) => {
    restoreReads += 1;

    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toBe(
      'Bearer customer-token'
    );

    await fulfillJson(route, {
      ok: true,
      role: 'customer',
      conversation:
        restoreReads === 1 ? initialConversation : restoredConversation,
    });
  });

  await page.goto('/');
  await openChatWidget(page);

  const chatWidget = page.getByRole('region', { name: 'Чат с менеджером' });
  await expect(chatWidget.getByLabel(/Даю согласие/)).toBeVisible();
  await expect(
    chatWidget.getByRole('link', { name: /обработку персональных/ })
  ).toHaveAttribute('href', '/privacy');
  await chatWidget.getByLabel(/Даю согласие/).check();
  await chatWidget.getByLabel('Введите сообщение').fill('Нужен ВВГ 3x2.5');
  await chatWidget.getByRole('button', { name: 'Отправить сообщение' }).click();

  await expect(page.getByText('Нужен ВВГ 3x2.5')).toBeVisible();
  await expect
    .poll(() => readStoredSession(page))
    .toEqual({
      conversationId: 'chat-e2e',
      customerToken: 'customer-token',
    });

  await page.reload();
  await expect.poll(() => restoreReads).toBeGreaterThanOrEqual(2);

  await openChatWidget(page);
  await expect(
    page.getByText('Менеджер подключился, готовим предложение.')
  ).toBeVisible();
  expect(createCalls).toBe(1);
});

test('chat widget shows backend error when the first message fails to send', async ({
  page,
}) => {
  await page.route('**/api/chat/conversations', async (route) => {
    expect(route.request().method()).toBe('POST');

    await fulfillJson(
      route,
      {
        ok: false,
        message: 'Сервис чата временно недоступен. Попробуйте позже.',
      },
      { status: 503 }
    );
  });

  await page.goto('/');
  await openChatWidget(page);

  const chatWidget = page.getByRole('region', { name: 'Чат с менеджером' });
  const messageField = chatWidget.getByLabel('Введите сообщение');
  await chatWidget.getByLabel(/Даю согласие/).check();
  await messageField.fill('Нужен расчёт по наличию');
  await chatWidget.getByRole('button', { name: 'Отправить сообщение' }).click();

  await expect(
    page.getByText('Сервис чата временно недоступен. Попробуйте позже.')
  ).toBeVisible();
  await expect(messageField).toHaveValue('Нужен расчёт по наличию');
  await expect(
    page
      .locator('.floating-lead-widget__messages')
      .getByText('Нужен расчёт по наличию')
  ).toHaveCount(0);
  await expect.poll(() => readStoredSession(page)).toBeNull();
  await expect(
    page.getByRole('button', { name: 'Отправить сообщение' })
  ).toBeEnabled();
});
