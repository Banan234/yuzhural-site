// Файл ловит горизонтальный overflow и критичные адаптивные проблемы на мобильных viewport.

import { expect, test } from '@playwright/test';

const VIEWPORT_WIDTHS = [320, 360, 390, 414];
const ROUTES = [
  '/',
  '/catalog',
  '/catalog/silovoy-kabel',
  '/contacts',
  '/cart',
  '/delivery',
  '/payment',
  '/about',
];

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
}

async function expectVisibleControlsInsideViewport(page, selector) {
  const clippedControls = await page.evaluate((controlSelector) => {
    return Array.from(document.querySelectorAll(controlSelector))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.left < -0.5 || rect.right > window.innerWidth + 0.5)
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          text: element.textContent.trim(),
          left: rect.left,
          right: rect.right,
          viewport: window.innerWidth,
        };
      });
  }, selector);

  expect(clippedControls).toEqual([]);
}

test.describe('mobile header overflow', () => {
  for (const width of VIEWPORT_WIDTHS) {
    test.describe(`${width}px viewport`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
      });

      for (const route of ROUTES) {
        test(`${route} keeps header and page within viewport`, async ({
          page,
        }) => {
          await page.goto(route);

          await expect(page.locator('.site-header')).toBeVisible();
          await expectNoHorizontalOverflow(page);
          await expectVisibleControlsInsideViewport(
            page,
            '.site-header a, .site-header button, .site-header input, .site-header img'
          );

          const mobileMenuButton = page.getByRole('button', {
            name: 'Открыть меню',
          });
          await expect(mobileMenuButton).toBeVisible();
          await mobileMenuButton.click();

          await expect(
            page.getByRole('dialog', { name: 'Мобильное меню' })
          ).toBeVisible();
          await expect(
            page
              .getByRole('dialog', { name: 'Мобильное меню' })
              .getByRole('button', { name: 'Заказать звонок' })
          ).toBeVisible();
          await expectNoHorizontalOverflow(page);
          await expectVisibleControlsInsideViewport(
            page,
            '.mobile-nav a, .mobile-nav button, .mobile-nav img'
          );
        });
      }
    });
  }
});

test('desktop navigation and carousel arrows fit near the header breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1181, height: 720 });
  await page.goto('/');
  await expect(
    page.locator('.home-stock-showcase__arrow').first()
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectVisibleControlsInsideViewport(
    page,
    '.site-header a, .home-stock-showcase__arrow'
  );
});

test('calculator navigation wraps at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/calculator/section/');
  const nav = page.getByRole('navigation', { name: 'Сервисы кабеля' });
  await expect(nav).toBeVisible();
  await expectVisibleControlsInsideViewport(page, '.services-nav a');
  await expectNoHorizontalOverflow(page);
});
