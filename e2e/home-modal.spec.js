// Файл проверяет открытие и работу модального окна заявки с главной страницы.

import { expect, test } from '@playwright/test';

test('home page opens quote modal and traps focus', async ({ page }) => {
  await page.goto('/');

  const heroHeading = page.getByRole('heading', {
    name: 'Пришлите список — пришлём КП',
  });
  await expect(heroHeading).toBeVisible();

  const opener = page
    .locator('.home-hero')
    .getByRole('button', { name: /Получить КП за 15 минут|Запросить КП/ });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Диалоговое окно' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Получить КП' })
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
