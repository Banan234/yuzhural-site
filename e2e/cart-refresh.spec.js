import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const oldItem = {
  id: 9100001,
  sku: 'E2E-VVG-001',
  slug: 'e2e-vvgng-ls-3x2-5',
  title: 'ВВГнг-LS 3х2.5',
  category: 'Силовой кабель',
  price: 1,
  stock: 500,
  unit: 'м',
  quantity: 1.25,
};
async function seed(page, items = [oldItem], { late = false } = {}) {
  await page.addInitScript(
    ({ items, late }) => {
      localStorage.setItem(
        'yuzhural-cart',
        JSON.stringify({ state: { items }, version: 1 })
      );
      const original = window.fetch.bind(window);
      window.__cartRefreshCalls = [];
      window.fetch = (url, options) => {
        if (String(url) !== '/api/products/lookup')
          return original(url, options);
        const call = { signal: options.signal, settled: false };
        window.__cartRefreshCalls.push(call);
        if (late && window.__cartRefreshCalls.length === 1)
          return new Promise((resolve) => {
            window.__releaseOldCartResponse = () => {
              call.settled = true;
              resolve(
                new Response(
                  JSON.stringify({
                    ok: true,
                    found: [],
                    missing: items.map((p) => p.id),
                    pending: [],
                  }),
                  {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                  }
                )
              );
            };
          });
        return original(url, options).finally(() => {
          call.settled = true;
        });
      };
    },
    { items, late }
  );
}
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('yuzhural-cart')).state.items
  );
function noHydrationErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('persisted cart refreshes from the real lookup handler, retains quantity and T05 money', async ({
  page,
}, testInfo) => {
  const errors = noHydrationErrors(page);
  if (process.env.E2E_PRODUCTION === 'true') {
    const documentResponse = await page.request.get('/cart');
    const html = await documentResponse.text();
    const built = await readFile(
      new URL('../dist/cart/index.html', import.meta.url),
      'utf8'
    );
    expect(documentResponse.status()).toBe(200);
    expect(html.includes('id="root" data-client-render="true"')).toBe(true);
    expect(html === built).toBe(true);
    await testInfo.attach('published-cart-html', {
      body: JSON.stringify({
        status: documentResponse.status(),
        url: documentResponse.url(),
        bytes: Buffer.byteLength(html),
        matchesBuiltHtml: html === built,
      }),
      contentType: 'application/json',
    });
  }
  await seed(page);
  const responses = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/products/lookup') && r.ok())
      responses.push(await r.json());
  });
  await page.goto('/cart');
  await expect.poll(async () => (await saved(page))[0]?.price).toBe(120);
  expect((await saved(page))[0].quantity).toBe(1.25);
  await expect(page.locator('.cart-summary')).toContainText('150,00 ₽');
  expect(
    responses.some(
      (r) => r.ok && r.found.some((p) => p.id === 9100001 && p.price === 120)
    )
  ).toBe(true);
  const attempts = await page.evaluate(() =>
    window.__cartRefreshCalls.map((c) => ({
      aborted: c.signal.aborted,
      settled: c.settled,
    }))
  );
  expect(attempts.filter((c) => !c.aborted)).toHaveLength(1);
  if (process.env.E2E_PRODUCTION !== 'true')
    expect(attempts.some((c) => c.aborted)).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach('cart-after-refresh', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('refresh-attempts', {
    body: JSON.stringify(attempts),
    contentType: 'application/json',
  });
});

test('review updates normally; pending/disappeared are distinguished; manual and valid positions remain', async ({
  page,
}) => {
  const items = [
    oldItem,
    { ...oldItem, id: 9100002, quantity: 2.25 },
    { ...oldItem, id: 9100003 },
    { ...oldItem, id: 9100004 },
    { ...oldItem, id: 'manual-fixture', manual: true, price: 0, quantity: 3 },
  ];
  await seed(page, items);
  await page.route('**/api/products/lookup', (route) =>
    route.fulfill({
      json: {
        ok: true,
        found: [
          { ...oldItem, price: 99.99 },
          {
            ...oldItem,
            id: 9100002,
            price: 123.45,
            classificationReview: { previousId: 9100002 },
          },
        ],
        missing: [9100003, 9100004],
        pending: [9100003],
      },
    })
  );
  await page.goto('/cart');
  await expect
    .poll(async () => (await saved(page)).map((p) => p.id))
    .toEqual([9100001, 9100002, 'manual-fixture']);
  expect((await saved(page)).map((p) => p.quantity)).toEqual([1.25, 2.25, 3]);
  await expect(page.locator('.cart-sync-notice')).toContainText(
    'Данные уточняются: 1'
  );
  await expect(page.locator('.cart-sync-notice')).toContainText(
    'Сняты с поставки и удалены: 1'
  );
  // 99.99*1.25=124.9875→124.99;123.45*2.25=277.7625→277.76; known total402.75.
  await expect(page.locator('.cart-summary')).toContainText('402,75 ₽');
  await expect(page.locator('.cart-summary')).toContainText(
    /без цены|по запросу|часть|уточнен/i
  );
});

for (const mode of ['network', 'abort', '503'])
  test(`lookup ${mode} retains the old values without a false missing/pending result`, async ({
    page,
  }) => {
    await seed(page);
    await page.route('**/api/products/lookup', (route) =>
      mode === '503'
        ? route.fulfill({
            status: 503,
            json: {
              ok: false,
              found: [],
              missing: [oldItem.id],
              message: 'Synthetic unavailable',
            },
          })
        : route.abort(mode === 'abort' ? 'aborted' : 'failed')
    );
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { name: 'Корзина', exact: true })
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__cartRefreshCalls.length > 0 &&
            window.__cartRefreshCalls.every((c) => c.settled)
        )
      )
      .toBe(true);
    expect(await saved(page)).toEqual([oldItem]);
    await expect(page.locator('.cart-sync-notice')).toHaveCount(0);
    await expect(page.locator('.cart-summary')).toContainText('1,25 ₽');
  });

test('a late cancelled response cannot overwrite a newer refresh after navigation back', async ({
  page,
}) => {
  await seed(page, [oldItem], { late: true });
  await page.goto('/cart');
  await expect(
    page.getByRole('heading', { name: 'Корзина', exact: true })
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Вернуться в каталог', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('.cart-page')).toHaveCount(0);
  await page.goBack();
  await expect.poll(async () => (await saved(page))[0]?.price).toBe(120);
  expect(
    await page.evaluate(() => window.__cartRefreshCalls[0].signal.aborted)
  ).toBe(true);
  await page.evaluate(() => window.__releaseOldCartResponse());
  // Wait through React promise callbacks without a guessed network delay.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  expect((await saved(page))[0]).toMatchObject({
    id: oldItem.id,
    price: 120,
    quantity: 1.25,
  });
  await expect(page.locator('.cart-item')).toHaveCount(1);
  await expect(
    page.locator('.cart-sync-notice').filter({ hasText: 'Сняты с поставки' })
  ).toHaveCount(0);
});
