// Файл покрывает лид-форму в hero-блоке главной страницы: валидацию, отправку и ошибку недоступности.

import { expect, test } from '@playwright/test';
import { messages } from '../shared/messages.js';

const HERO_FORM_TITLE = 'Не тратьте время на поиск кабеля';
const VALID_PHONE = '+7 900 123-45-67';

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

async function openHeroLeadForm(page) {
  await page.goto('/');

  const heroForm = page.locator('.home-hero-zone__form');
  await expect(
    heroForm.getByRole('heading', { name: HERO_FORM_TITLE })
  ).toBeVisible();

  return heroForm;
}

async function fillHeroLeadForm(
  form,
  { phone = VALID_PHONE, consent = true, comment = '' } = {}
) {
  await form.getByLabel('Ваш телефон').fill(phone);

  if (comment) {
    await form.getByLabel(/Комментарий/i).fill(comment);
  }

  if (consent) {
    await form.getByLabel(/Даю согласие/i).check();
  }
}

test('home hero lead form validates empty and invalid phone values', async ({
  page,
}) => {
  let submitAttempts = 0;

  await page.route('**/api/lead-request', async (route) => {
    submitAttempts += 1;
    await fulfillJson(route, { ok: true, message: messages.success.leadSent });
  });

  const heroForm = await openHeroLeadForm(page);
  const phoneField = heroForm.getByLabel('Ваш телефон');
  const submitButton = heroForm.getByRole('button', { name: 'Получить КП' });

  await submitButton.click();

  await expect(
    heroForm.getByText(messages.errors.leadForm.phoneInvalid)
  ).toBeVisible();
  await expect(phoneField).toHaveAttribute('aria-invalid', 'true');

  await phoneField.fill('12345');
  await heroForm.getByLabel(/Даю согласие/i).check();
  await submitButton.click();

  await expect(
    heroForm.getByText(messages.errors.leadForm.phoneInvalid)
  ).toBeVisible();
  expect(submitAttempts).toBe(0);
});

test('home hero lead form requires consent before submit', async ({ page }) => {
  let submitAttempts = 0;

  await page.route('**/api/lead-request', async (route) => {
    submitAttempts += 1;
    await fulfillJson(route, { ok: true, message: messages.success.leadSent });
  });

  const heroForm = await openHeroLeadForm(page);

  await fillHeroLeadForm(heroForm, { consent: false });
  await heroForm.getByRole('button', { name: 'Получить КП' }).click();

  await expect(
    heroForm.getByText(messages.errors.leadForm.consentRequired)
  ).toBeVisible();
  await expect(heroForm.getByLabel(/Даю согласие/i)).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  expect(submitAttempts).toBe(0);
});

test('home hero lead form submits valid payload successfully', async ({
  page,
}) => {
  let leadPayload;

  await page.route('**/api/lead-request', async (route) => {
    leadPayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ok: true,
      message: messages.success.leadSentDetailed,
    });
  });

  const heroForm = await openHeroLeadForm(page);

  await fillHeroLeadForm(heroForm, {
    comment: 'ВВГ 3x2.5, 500 метров',
  });
  await heroForm.getByRole('button', { name: 'Получить КП' }).click();

  await expect(
    heroForm.getByText(messages.success.leadSentDetailed)
  ).toBeVisible();

  expect(leadPayload).toMatchObject({
    phone: VALID_PHONE,
    comment: 'ВВГ 3x2.5, 500 метров',
    source: 'Форма в герое главной',
    company_website: '',
  });
  expect(leadPayload.createdAt).toEqual(expect.any(String));
  expect(leadPayload.rendered_at).toEqual(expect.any(Number));
  expect(leadPayload.submit_at).toEqual(expect.any(Number));
  expect(leadPayload.submit_at).toBeGreaterThan(leadPayload.rendered_at);
});

test('home hero lead form shows disabled-backend message to user', async ({
  page,
}) => {
  await page.route('**/api/lead-request', async (route) => {
    await fulfillJson(
      route,
      {
        ok: false,
        message: messages.errors.api.formsDisabled,
      },
      { status: 503 }
    );
  });

  const heroForm = await openHeroLeadForm(page);

  await fillHeroLeadForm(heroForm);
  await heroForm.getByRole('button', { name: 'Получить КП' }).click();

  await expect(
    heroForm.getByText(messages.errors.api.formsDisabled)
  ).toBeVisible();
  await expect(
    heroForm.getByRole('button', { name: 'Получить КП' })
  ).toBeEnabled();
});
