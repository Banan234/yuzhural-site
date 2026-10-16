// Файл проверяет открытие и работу модального окна заявки с главной страницы.

import { expect, test } from '@playwright/test';

test('home page opens callback modal and traps focus', async ({ page }) => {
  await page.goto('/');

  const heroHeading = page.getByRole('heading', {
    name: 'Пришлите список — подготовим КП',
  });
  await expect(heroHeading).toBeVisible();

  const opener = page
    .locator('.home-concept__quote')
    .getByRole('button', { name: 'Заказать звонок' });
  await opener.click();

  const dialog = page.getByRole('dialog', {
    name: 'Заказать звонок',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Заказать звонок' })
  ).toBeVisible();

  const closeButton = dialog.getByRole('button', { name: 'Закрыть' });
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Ваш телефон')).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
