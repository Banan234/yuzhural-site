import { expect, test } from '@playwright/test';

const groups = [
  { letter: 'А', id: 'letter-410', size: 80 },
  { letter: 'З', id: 'letter-417', size: 3 },
  { letter: 'К', id: 'letter-41a', size: 351 },
].map(({ size, ...group }) => ({
  ...group,
  marks: Array.from({ length: size }, (_, index) => ({
    mark: `${group.letter}-${String(index + 1).padStart(3, '0')}${
      index % 17 === 0 ? ' длинное обозначение кабеля 1.0-180' : ''
    }`,
    count: 1,
  })),
}));

async function positions(list) {
  return list.evaluate((element) => {
    const origin = element.getBoundingClientRect();
    return [...element.querySelectorAll('a')].map((link) => {
      const rect = link.getBoundingClientRect();
      return { x: rect.x - origin.x, y: rect.y - origin.y };
    });
  });
}

function expectStablePositions(before, after) {
  expect(after).toHaveLength(before.length);
  const largestShift = Math.max(
    ...after.map((point, index) =>
      Math.max(
        Math.abs(point.x - before[index].x),
        Math.abs(point.y - before[index].y)
      )
    )
  );
  // Scrolling in WebKit can change floating-point coordinates by < 0.001px.
  expect(largestShift).toBeLessThanOrEqual(0.1);
}

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`mark columns stay fixed on hover and focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/marks', (route) =>
      route.fulfill({ json: { ok: true, groups } })
    );
    await page.goto('/marks/');
    await expect(page.locator('.marks-page__group a')).toHaveCount(434);
    await page.evaluate(() => document.fonts.ready);

    for (const group of groups) {
      const list = page.locator(`#${group.id} ul`);
      const before = await positions(list);
      const boundaries = new Map();
      before.forEach(({ x }, index) => {
        const column = boundaries.get(x) || [index, index];
        column[1] = index;
        boundaries.set(x, column);
      });

      // The first and last links in each column exercise the balancing boundary.
      for (const index of new Set([...boundaries.values()].flat())) {
        await list.locator('a').nth(index).hover();
        expectStablePositions(before, await positions(list));
        await list.locator('a').nth(index).focus();
        expectStablePositions(before, await positions(list));
      }
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}

test('Back keeps fast navigation and restores an interactive list without refetching', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let marksRequests = 0;
  await page.route('**/api/marks', async (route) => {
    marksRequests += 1;
    await route.fulfill({ json: { ok: true, groups } });
  });
  await page.goto('/marks/');
  const link = page.locator('#letter-41a a').nth(10);
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.site-header').evaluate(async (header) => {
    await Promise.all(
      header
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {}))
    );
  });
  await page.evaluate(() => {
    window.marksDocument = true;
  });
  await link.click();
  await page.waitForURL('**/catalog/**');
  expect(await page.evaluate(() => window.marksDocument)).toBe(true);
  const requestsBeforeBack = marksRequests;
  await page.goBack();
  await expect(page.locator('.marks-page__group a')).toHaveCount(434);
  const savedTop = await page.evaluate(() => history.state.marksReturn.top);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeCloseTo(savedTop, 0);
  await page.mouse.move(800, 600);
  await page.mouse.wheel(0, 350);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(savedTop + 200);
  expect(marksRequests).toBe(requestsBeforeBack);
  expect(await page.evaluate(() => window.marksDocument)).toBe(true);
  await expect(page.locator('[role="status"]')).toHaveCount(0);
});
