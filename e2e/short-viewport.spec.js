import { expect, test } from '@playwright/test';

async function expectInsideViewport(locator) {
  const box = await locator.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(
    await locator.page().evaluate(() => window.innerHeight + 1)
  );
}

test('desktop catalog dropdown fits a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 450 });
  await page.goto('/');
  await page.locator('.catalog-button').hover();
  const dropdown = page.locator('.catalog-dropdown');
  await expect(dropdown).toBeVisible();
  await expectInsideViewport(dropdown);
});

test('short mobile menu scrolls from catalog links to footer actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 280 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Принять необходимые' }).click();
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  const menu = page.getByRole('dialog', { name: 'Мобильное меню' });
  await expect(menu.locator('.mobile-nav__body')).toBeInViewport();
  const action = menu.getByRole('button', { name: 'Запросить КП' });
  await action.scrollIntoViewIfNeeded();
  await expectInsideViewport(action);
  expect(
    await menu
      .locator('.mobile-nav__panel')
      .evaluate((panel) => panel.scrollTop)
  ).toBeGreaterThan(0);
});

test('keyboard navigation scrolls search suggestions without moving the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 280 });
  await page.route('**/api/products/suggestions?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        items: Array.from({ length: 7 }, (_, index) => ({
          key: String(index),
          mark: `ВВГ ${index + 1}`,
          count: 1,
        })),
      },
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Принять необходимые' }).click();
  const input = page.getByRole('combobox', { name: 'Поиск по каталогу' });
  await input.fill('ВВГ');
  const list = page.getByRole('listbox', {
    name: 'Подсказки поиска по каталогу',
  });
  await expect(list.getByRole('option')).toHaveCount(7);
  await expectInsideViewport(list);
  const initialScroll = await page.evaluate(() => window.scrollY);
  await input.press('ArrowUp');
  const last = list.getByRole('option').last();
  await expect(last).toHaveAttribute('aria-selected', 'true');
  await expect(last).toBeInViewport({ ratio: 0.98 });
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);
});

test('chat input stays reachable above the cookie banner in a short window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 280 });
  await page.goto('/');
  await expect(page.locator('.cookie-consent')).toBeVisible();
  await page.getByRole('button', { name: 'Чат с менеджером' }).click();
  const input = page.locator('.floating-lead-widget__composer textarea');
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport({ ratio: 0.98 });
  const bottom = await input.evaluate(
    (element) => element.getBoundingClientRect().bottom
  );
  const banner = await page.locator('.cookie-consent').boundingBox();
  expect(bottom).toBeLessThan(banner.y);
});
