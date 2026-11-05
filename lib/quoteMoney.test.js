import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';
import { PERSONAL_DATA_CONSENT_VERSION } from '../shared/personalDataConsent.js';
let server, base, sendMail;
const row = (id, price, quantity) => ({
  id,
  title: 'Тестовая позиция ' + id,
  sku: 'TEST-' + id,
  category: 'Тестовая',
  unit: 'кг',
  price,
  quantity,
});
const payload = (items) => ({
  customer: {
    name: 'Тестовый адресат',
    phone: '+7 (999) 000-00-01',
    email: 'client@example.test',
    preferredChannel: 'phone',
    consent: true,
    consentVersion: PERSONAL_DATA_CONSENT_VERSION,
  },
  items,
  totalPrice: 999.999,
  totalCount: 999,
  rendered_at: Date.now() - 10000,
  submit_at: Date.now(),
  company_website: '',
});
beforeEach(async () => {
  sendMail = vi.fn().mockResolvedValue({ messageId: 'synthetic-only' });
  const app = createApp({
    env: {
      NODE_ENV: 'test',
      FORMS_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'test@example.test',
      SMTP_PASS: 'fixture-only',
      SMTP_FROM: 'test@example.test',
      QUOTE_TO_EMAIL: 'sales@example.test',
    },
    mailTransporter: { sendMail },
    formsDiagnostic: {
      formsEnabled: true,
      smtpReady: true,
      deliveryConfigured: true,
      deliveryVerified: true,
    },
    catalogStore: {
      loadCatalogProducts: async () => [{ id: 1, stock: 5.7, unit: 'кг' }],
      getCatalogProductsByCategory: async () => [],
      getPendingProducts: () => [{ id: 58 }],
    },
    chatStore: {},
    vkBridge: {},
    formResponseDelayRange: { min: 0, max: 0 },
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((r) => server.close(r));
});
const post = (body) =>
  fetch(base + '/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('quote HTTP and captured mail monetary parity (no real delivery)', () => {
  it('ignores client totals and excludes a pending catalog identity even with an old positive price', async () => {
    const response = await post(
      payload([
        row(1, 0.005, 1),
        row(2, 0.005, 1),
        row('manual-1', 0, 2),
        { ...row(58, 999, 100), title: 'PENDING_SENTINEL' },
      ])
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.quoteSummary).toMatchObject({
      totalCount: 3,
      totalPrice: null,
      knownSubtotalKopecks: 2,
      totalComplete: false,
      unknownPriceCount: 1,
    });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('Известная часть');
    expect(html).toContain('0,02 ₽');
    expect(html.match(/0,01 ₽/g)).toHaveLength(2);
    expect(html).toContain('Полная сумма после расчёта');
    expect(html).not.toContain('PENDING_SENTINEL');
    expect(html).not.toContain('999.999');
  });
  it('calculates whole kg and preserves unit price precision in mail', async () => {
    const response = await post(payload([row(1, 99.99, 1), row(2, 12.345, 1)]));
    expect(response.status).toBe(200);
    expect((await response.json()).quoteSummary).toMatchObject({
      totalPrice: 112.34,
      totalKopecks: 11234,
      totalComplete: true,
    });
    const html = sendMail.mock.calls[0][0].html;
    for (const text of ['99,99 ₽', '12,35 ₽', '112,34 ₽', '12,345 ₽'])
      expect(html).toContain(text);
    expect(html).not.toContain('49.995');
  });
  it('keeps a fully unpriced request without a numeric total', async () => {
    const response = await post(payload([row('manual-1', null, 2)]));
    expect(response.status).toBe(200);
    expect((await response.json()).quoteSummary.totalPrice).toBeNull();
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('Итог будет рассчитан в КП');
    expect(html).not.toContain('0,00 ₽');
  });
  it('does not send an empty request after all pending rows were removed', async () => {
    const response = await post(payload([row(58, 999, 2)]));
    expect(response.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it.each([-1, 'NaN', 'Infinity', true, [100]])(
    'rejects invalid price %s without sending',
    async (price) => {
      expect((await post(payload([row(1, price, 2)]))).status).toBe(400);
      expect(sendMail).not.toHaveBeenCalled();
    }
  );
});

// Real HTTP boundary with an injected in-memory mail transport, no delivery.
it.each(['шт', 'м', 'кг'])(
  'rejects fractional/zero/negative %s without mail, accepts a whole order',
  async (unit) => {
    for (const quantity of [0.5, 1.2, 0, -1]) {
      expect(
        (await post(payload([{ ...row(1, 99.99, quantity), unit }]))).status
      ).toBe(400);
      expect(sendMail).not.toHaveBeenCalled();
    }
    const response = await post(payload([{ ...row(1, 99.99, 2), unit }]));
    expect(response.status).toBe(200);
    expect((await response.json()).quoteSummary.totalPrice).toBe(199.98);
    expect(sendMail).toHaveBeenCalledTimes(1);
  }
);

it('accepts only the actual terminal fractional stock, not a forged client balance', async () => {
  for (const quantity of [5.5, 5.8, 6]) {
    expect(
      (await post(payload([{ ...row(1, 10, quantity), stock: quantity }])))
        .status
    ).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  }
  const response = await post(payload([row(1, 10, 5.7)]));
  expect(response.status).toBe(200);
  expect((await response.json()).quoteSummary.totalPrice).toBe(57);
  expect(sendMail).toHaveBeenCalledTimes(1);
});
