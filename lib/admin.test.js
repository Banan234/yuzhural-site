import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdminStore } from './adminStore.js';
import { hashAdminPassword } from './adminAuth.js';
import { createAdminRouter } from './adminRouter.js';
import { createCatalogStore } from './catalog.js';
import { createFormDelivery } from './formDelivery.js';
const cleanup = [];
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});
async function fixture(enabled = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yuek-admin-'));
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  const products = path.join(directory, 'products.json');
  await fs.writeFile(
    products,
    JSON.stringify([
      {
        id: 108,
        name: 'АВБбШв 4х4',
        fullName: 'АВБбШв 4х4',
        sku: 'YU-108',
        slug: 'avbbshv-4h4',
        price: 37.5,
        stock: 41,
        unit: 'м',
        category: 'Кабель АВБбШв',
        catalogSection: 'Кабель и провод',
        catalogSectionSlug: 'kabel-i-provod',
        catalogCategory: 'Силовой кабель',
        catalogCategorySlug: 'silovoy-kabel',
      },
    ])
  );
  const env = {
    ADMIN_DATA_DIR: directory,
    ADMIN_PASSWORD_HASH: enabled
      ? await hashAdminPassword('a-unique-test-password')
      : '',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    CATALOG_PRODUCTS_FILE: products,
  };
  const store = createAdminStore(directory);
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter({ env, store }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  cleanup.push(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/`;
  let cookie = '',
    csrf = '';
  async function request(
    url,
    body,
    method = body ? 'POST' : 'GET',
    extra = {}
  ) {
    const r = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Cookie: cookie,
        'X-CSRF-Token': csrf,
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    return { status: r.status, value, headers: r.headers };
  }
  const login = async () => {
    const r = await request('login', { password: 'a-unique-test-password' });
    cookie = r.headers.get('set-cookie').split(';')[0];
    csrf = r.value.csrf;
    return r;
  };
  return { store, request, login, directory, products };
}
describe('admin access and durable business edits', () => {
  it('fails closed, checks password/origin/CSRF and revokes logout sessions', async () => {
    const f = await fixture();
    expect((await f.request('overview')).status).toBe(401);
    expect((await f.request('login', { password: 'wrong' })).status).toBe(401);
    expect(
      (
        await f.request(
          'login',
          { password: 'a-unique-test-password' },
          'POST',
          { Origin: 'https://evil.test' }
        )
      ).status
    ).toBe(403);
    const login = await f.login();
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    expect(login.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(
      (await f.request('logout', {}, 'POST', { 'X-CSRF-Token': '' })).status
    ).toBe(403);
    expect((await f.request('overview')).status).toBe(200);
    expect((await f.request('logout', {})).status).toBe(200);
    expect((await f.request('overview')).status).toBe(401);
    const disabled = await fixture(false);
    expect((await disabled.request('session')).status).toBe(503);
  });
  it('rejects injection strings, non-string passwords and forged sessions', async () => {
    const f = await fixture();
    for (const password of [
      "' OR '1'='1' --",
      '" OR 1=1 --',
      '<script>alert(1)</script>',
      'a-unique-test-password\u0000',
      { $ne: null },
      ['a-unique-test-password'],
      null,
      'x'.repeat(513),
    ]) {
      const response = await f.request('login', { password });
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    for (const endpoint of ['overview', 'requests', 'products', 'imports']) {
      expect(
        (
          await f.request(endpoint, undefined, 'GET', {
            Cookie: 'yuek_admin=forged-token',
          })
        ).status
      ).toBe(401);
    }
    expect((await f.login()).status).toBe(200);
  });
  it('blocks password guessing after ten attempts', async () => {
    const f = await fixture();
    for (let attempt = 0; attempt < 10; attempt++)
      expect((await f.request('login', { password: 'wrong' })).status).toBe(
        401
      );
    const blocked = await f.request('login', {
      password: 'a-unique-test-password',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('set-cookie')).toBeNull();
  });
  it('applies price/stock/hide edits and manual products to the real catalog, detects conflicts and restores source values', async () => {
    const f = await fixture();
    await f.login();
    const catalog = createCatalogStore({
      productsFile: f.products,
      adminDataDir: f.directory,
    });
    expect((await catalog.loadCatalogProducts())[0].price).toBe(37.5);
    const patch = {
      revision: 0,
      name: 'АВБбШв 4х4',
      price: 50,
      stock: 25,
      description: 'Точный отрез',
      hidden: false,
    };
    expect((await f.request('products/108', patch, 'PUT')).status).toBe(200);
    expect((await f.request('products/108', patch, 'PUT')).status).toBe(409);
    let product = (await catalog.loadCatalogProducts())[0];
    expect(product.price).toBe(50);
    expect(product.stock).toBe(25);
    expect(product.description).toBe('Точный отрез');
    expect(
      (
        await f.request(
          'products/108',
          { ...patch, revision: 1, hidden: true },
          'PUT'
        )
      ).status
    ).toBe(200);
    expect(await catalog.loadCatalogProducts()).toHaveLength(0);
    expect(
      (await f.request('products/108/override', { revision: 2 }, 'DELETE'))
        .status
    ).toBe(200);
    expect((await catalog.loadCatalogProducts())[0].price).toBe(37.5);
    const added = await f.request('products', {
      revision: 3,
      name: 'Кабель АВБбШв 5х6',
      price: 120,
      stock: 50,
      sku: 'MANUAL-1',
      category: 'Кабель АВБбШв',
    });
    expect(added.status).toBe(200);
    const fresh = createCatalogStore({
      productsFile: f.products,
      adminDataDir: f.directory,
    });
    expect(
      (await fresh.loadCatalogProducts()).some(
        (p) => p.id === added.value.product.id
      )
    ).toBe(true);
    expect(
      (
        await f.request(
          'products/108',
          { ...patch, revision: 4, price: -1 },
          'PUT'
        )
      ).status
    ).toBe(400);
  });
  it('persists requests before delivery, preserves first received time and protects attachments and notes', async () => {
    const f = await fixture();
    const deliver = createFormDelivery({
      env: {},
      directory: null,
      saveRequest: f.store.saveRequest,
      sendMail: async () => ({ accepted: ['owner@test.test'] }),
    });
    const input = {
      kind: 'lead',
      submissionId: '1234567890123456',
      payload: { name: 'Покупатель', phone: '+79043069494' },
      consent: { version: '1' },
      attachments: [
        {
          filename: 'list.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF-file'),
        },
      ],
      managerMail: { subject: 'Заявка', html: 'Текст' },
    };
    const result = await deliver(input);
    const first = await f.store.getRequest(result.requestId);
    await deliver(input);
    expect((await f.store.getRequest(result.requestId)).createdAt).toBe(
      first.createdAt
    );
    expect(
      (await f.request(`requests/${result.requestId}/files/0`)).status
    ).toBe(401);
    await f.login();
    const list = await f.request('requests');
    expect(list.value.items).toHaveLength(1);
    expect(JSON.stringify(list.value)).not.toContain('contentBase64');
    const detail = await f.request(`requests/${result.requestId}`);
    expect(detail.value.consent.version).toBe('1');
    expect(detail.value.attachments[0].filename).toBe('list.pdf');
    expect(JSON.stringify(detail.value)).not.toContain('contentBase64');
    expect(
      (
        await f.request(
          `requests/${result.requestId}`,
          { revision: 0, status: 'working', note: 'Позвонить завтра' },
          'PUT'
        )
      ).status
    ).toBe(200);
    expect((await f.store.read()).leadStates[result.requestId].note).toBe(
      'Позвонить завтра'
    );
    expect(
      (
        await f.request(
          `requests/${result.requestId}`,
          { revision: 1 },
          'DELETE'
        )
      ).status
    ).toBe(200);
    expect(await f.store.listRequests()).toHaveLength(0);
    expect((await f.request(`requests/${result.requestId}`)).status).toBe(404);
  });
});
