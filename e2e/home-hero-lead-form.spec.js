// Проверяем текущую форму связи на главной: валидацию, оба канала и сбой API.
import { expect, test } from '@playwright/test';
import { expectFieldError } from './helpers/assertions.js';

const PHONE_INPUT = '+7 (900) 123-45-67';
const PHONE_PAYLOAD = '+79001234567';

async function openContactForm(page) {
  await page.goto('/');
  const form = page.getByRole('form', { name: /заявка на связь/i });
  await expect(form).toBeVisible();
  await expect(form.locator('button[type="submit"]')).toHaveAccessibleName(
    /\S/
  );
  return form;
}

async function fillContactForm(form, { consent = true } = {}) {
  await form.getByRole('textbox', { name: /имя/i }).fill('Иван Петров');
  await form.getByRole('textbox', { name: /телефон/i }).fill(PHONE_INPUT);
  if (consent) await form.getByRole('checkbox', { name: /согласи/i }).check();
}

test('home contact form validates empty and invalid phone values', async ({
  page,
}) => {
  let submitAttempts = 0;
  await page.route('**/api/lead-request', async (route) => {
    submitAttempts += 1;
    await route.fulfill({ json: { ok: true } });
  });
  const form = await openContactForm(page);
  const submit = form.locator('button[type="submit"]');
  const name = form.getByRole('textbox', { name: /имя/i });
  const phone = form.getByRole('textbox', { name: /телефон/i });
  await submit.click();
  await expectFieldError(name);
  await expectFieldError(phone);
  await expect(name).toBeFocused();
  await name.fill('Иван Петров');
  await phone.fill('12345');
  await form.getByRole('checkbox', { name: /согласи/i }).check();
  await submit.click();
  await expectFieldError(phone);
  await expect(phone).toBeFocused();
  expect(submitAttempts).toBe(0);
});

test('home contact form requires consent before submit', async ({ page }) => {
  let submitAttempts = 0;
  await page.route('**/api/lead-request', async (route) => {
    submitAttempts += 1;
    await route.fulfill({ json: { ok: true } });
  });
  const form = await openContactForm(page);
  await fillContactForm(form, { consent: false });
  await form.locator('button[type="submit"]').click();
  const consent = form.getByRole('checkbox', { name: /согласи/i });
  await expectFieldError(consent);
  await expect(consent).toBeFocused();
  expect(submitAttempts).toBe(0);
});

for (const channel of ['phone', 'email']) {
  test(`home contact form submits only the selected ${channel} contact`, async ({
    page,
  }) => {
    let payload;
    await page.route('**/api/lead-request', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    const form = await openContactForm(page);
    await fillContactForm(form);
    const contact = channel === 'phone' ? PHONE_PAYLOAD : 'buyer@example.com';
    if (channel === 'email') {
      await form.getByRole('radio', { name: /email/i }).check();
      await form.getByRole('textbox', { name: /email/i }).fill(contact);
    }
    await form.locator('button[type="submit"]').click();
    await expect(page.getByRole('status')).toContainText(contact);
    expect(payload).toMatchObject({
      name: 'Иван Петров',
      contactChannel: channel,
      [channel]: contact,
      consent: true,
      requestType: 'lead',
      source: 'Главная: помощь с подбором кабеля',
      page: '/',
      company_website: '',
    });
    expect(payload).not.toHaveProperty(channel === 'phone' ? 'email' : 'phone');
    expect(payload.createdAt).toEqual(expect.any(String));
    expect(payload.rendered_at).toEqual(expect.any(Number));
    expect(payload.submit_at).toBeGreaterThan(payload.rendered_at);
  });
}

test('home contact form preserves fields and allows retry after backend failure', async ({
  page,
}) => {
  await page.route('**/api/lead-request', async (route) => {
    await route.fulfill({
      status: 503,
      json: { ok: false, message: 'Forms unavailable (fixture)' },
    });
  });
  const form = await openContactForm(page);
  await fillContactForm(form);
  const submit = form.locator('button[type="submit"]');
  await submit.click();
  await expect(form.getByRole('alert')).toHaveText(
    'Forms unavailable (fixture)'
  );
  await expect(form.getByRole('textbox', { name: /имя/i })).toHaveValue(
    'Иван Петров'
  );
  await expect(form.getByRole('textbox', { name: /телефон/i })).toHaveValue(
    PHONE_INPUT
  );
  await expect(form.getByRole('checkbox', { name: /согласи/i })).toBeChecked();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(submit).toBeEnabled();
});
