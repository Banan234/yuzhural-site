import { expect, test } from '@playwright/test';
import { expectFieldError } from './helpers/assertions.js';
import { SITE_WORKING_HOURS_DISPLAY } from '../src/lib/siteConfig.js';

const phone = '+7 (900) 123-45-67';
const dialogFor = (page) =>
  page.getByRole('dialog', { name: 'Заказать звонок', exact: true });

async function openHeaderCallback(page, path = '/catalog/montazhnyy-kabel/') {
  await page.goto(path);
  await page
    .locator('.site-header')
    .getByRole('button', { name: 'Заказать звонок', exact: true })
    .click();
  const dialog = dialogFor(page);
  await expect(dialog).toBeVisible();
  if (path.includes('montazhnyy')) {
    await expect(
      page.getByRole('heading', { name: 'Монтажный кабель', exact: true })
    ).toBeVisible();
  }
  return dialog;
}

test('callback has its own styles on direct entry and after visiting home', async ({
  page,
}, testInfo) => {
  for (const path of ['/catalog/montazhnyy-kabel/', '/', '/contacts/']) {
    const dialog = await openHeaderCallback(page, path);
    const input = dialog.getByLabel('Ваш телефон');
    await expect(input).toHaveAttribute('type', 'tel');
    await expect(input).toHaveCSS('min-height', '46px');
    await expect(dialog.locator('.hero-lead-form')).toHaveCSS(
      'display',
      'grid'
    );
    const widths = await input.evaluate((el) => ({
      input: el.clientWidth,
      form: el.closest('form').clientWidth,
    }));
    expect(Math.abs(widths.input - widths.form)).toBeLessThan(4);
    await expect(dialog.locator('.hero-lead-card__schedule')).toContainText(
      SITE_WORKING_HOURS_DISPLAY
    );
    if (path.includes('montazh')) {
      await page.screenshot({
        path: testInfo.outputPath('callback-desktop.png'),
      });
    }
    if (path === '/') {
      const close = dialog.getByRole('button', { name: 'Закрыть' });
      await expect(close).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(input).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(close).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(
      page
        .locator('.site-header')
        .getByRole('button', { name: 'Заказать звонок', exact: true })
    ).toBeFocused();
  }
});

test('callback validates, handles failure without losing data and submits once', async ({
  page,
}, testInfo) => {
  let submissions = [];
  let releaseSuccess;
  await page.route('**/api/lead-request', async (route) => {
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) {
      await route.fulfill({
        status: 503,
        json: { ok: false, message: 'Сервис временно недоступен' },
      });
    } else {
      await new Promise((resolve) => {
        releaseSuccess = resolve;
      });
      await route.fulfill({ json: { ok: true, message: 'Заявка отправлена' } });
    }
  });
  const dialog = await openHeaderCallback(page);
  const submit = dialog.locator('button[type="submit"]');
  await expect(submit).toHaveAccessibleName(/\S/);
  await submit.click();
  await expect(dialog.getByLabel('Ваш телефон')).toBeFocused();
  await expectFieldError(dialog.getByLabel(/телефон/i));
  expect(submissions).toHaveLength(0);
  await dialog.getByLabel('Ваш телефон').fill(phone);
  await submit.click();
  await expect(dialog.getByLabel(/Даю согласие/)).toBeFocused();
  await expectFieldError(dialog.getByRole('checkbox', { name: /согласи/i }));
  expect(submissions).toHaveLength(0);
  await dialog.getByLabel(/Даю согласие/).check();
  await dialog
    .getByLabel(/О чём хотите узнать/)
    .fill('Нужна доставка в Челябинск');
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Сервис временно недоступен'
  );
  await expect(dialog.getByLabel('Ваш телефон')).toHaveValue(phone);
  await expect(dialog.getByLabel(/О чём хотите узнать/)).toHaveValue(
    'Нужна доставка в Челябинск'
  );
  await expect(dialog.getByLabel(/Даю согласие/)).toBeChecked();
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect.poll(() => Boolean(releaseSuccess)).toBe(true);
  expect(submissions).toHaveLength(2);
  releaseSuccess();
  await expect(dialog.getByRole('status').getByRole('heading')).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText(phone);
  expect(submissions[1]).toMatchObject({
    requestType: 'callback',
    consent: true,
    phone,
    page: '/catalog/montazhnyy-kabel/',
    source: 'Заказ звонка: шапка сайта',
    company_website: '',
  });
  await page.screenshot({ path: testInfo.outputPath('callback-success.png') });
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .locator('.site-header')
      .getByRole('button', { name: 'Заказать звонок', exact: true })
  ).toBeFocused();
  await page
    .locator('.site-header')
    .getByRole('button', { name: 'Заказать звонок', exact: true })
    .click();
  await expect(dialog.getByLabel('Ваш телефон')).toHaveValue('');
  await expect(dialog.getByLabel(/Даю согласие/)).not.toBeChecked();
});

test('footer and contact buttons open the same callback form', async ({
  page,
}) => {
  for (const [scope, source] of [
    ['.site-footer', 'Заказ звонка: футер'],
    ['.contacts-page__hero-card', 'Заказ звонка: страница контактов'],
  ]) {
    let payload;
    await page.route('**/api/lead-request', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto('/contacts/');
    await page
      .locator(scope)
      .getByRole('button', { name: 'Заказать звонок' })
      .click();
    const dialog = dialogFor(page);
    await dialog.getByLabel('Ваш телефон').fill(phone);
    await dialog.getByLabel(/Даю согласие/).check();
    await dialog.getByRole('button', { name: 'Жду звонка' }).click();
    await expect(dialog.getByRole('status')).toBeVisible();
    expect(payload).toMatchObject({
      source,
      requestType: 'callback',
      page: '/contacts/',
      comment: 'Просьба перезвонить',
    });
    await page.unroute('**/api/lead-request');
  }
});

for (const width of [320, 390]) {
  test(`mobile callback fits ${width}px, scrolls on short screens and returns focus`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/catalog/montazhnyy-kabel/');
    const opener = page.getByRole('button', { name: 'Открыть меню' });
    await opener.click();
    await page
      .getByRole('dialog', { name: 'Мобильное меню' })
      .getByRole('button', { name: 'Заказать звонок' })
      .click();
    const dialog = dialogFor(page);
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Мобильное меню' })
    ).toBeHidden();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await expect(dialog.getByLabel('Ваш телефон')).toHaveCSS(
      'font-size',
      '16px'
    );
    await page.screenshot({
      path: testInfo.outputPath(`callback-mobile-${width}.png`),
    });
    const submit = dialog.getByRole('button', { name: 'Жду звонка' });
    await submit.scrollIntoViewIfNeeded();
    expect(
      await submit.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2
        );
        return top === el || el.contains(top);
      })
    ).toBe(true);
    await page.setViewportSize({ width, height: 390 });
    await dialog
      .getByRole('button', { name: 'Жду звонка' })
      .scrollIntoViewIfNeeded();
    await expect(
      dialog.getByRole('button', { name: 'Жду звонка' })
    ).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });
}
