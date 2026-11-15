import { expect, test } from '@playwright/test';

test('scrolling past the header keeps the page at the requested position', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/');
  await expect(page.locator('#home-hero-title')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const header = page.locator('.site-header');
  const initialHeight = await header.evaluate(
    (element) => element.offsetHeight
  );

  for (const top of [48, 121, 220, 600, 121, 0]) {
    await page.evaluate(async (position) => {
      window.scrollTo({ top: position, behavior: 'instant' });
      await new Promise(requestAnimationFrame);
      await Promise.all(
        document
          .querySelector('.site-header')
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      );
      await new Promise(requestAnimationFrame);
    }, top);

    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(top, 0);
    expect(await header.evaluate((element) => element.offsetHeight)).toBe(
      initialHeight
    );
  }
});
