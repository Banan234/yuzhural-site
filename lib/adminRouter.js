import express from 'express';
import rateLimit from 'express-rate-limit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import {
  createAdminSessions,
  validAdminHash,
  verifyAdminPassword,
} from './adminAuth.js';

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const text = (value, max, required = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    fail('Проверьте обязательные поля и длину текста');
  return value.trim();
};
async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
export async function readRawAdminProducts(env) {
  const active = await readJson(
    env.CATALOG_PRODUCTS_FILE || 'data/catalog-current/products.json',
    null
  );
  return active || (await readJson('data/products.json', []));
}
export function createAdminRouter({ env, store }) {
  const router = express.Router();
  const enabled = validAdminHash(env.ADMIN_PASSWORD_HASH);
  const sessions = createAdminSessions({
    secure: env.NODE_ENV === 'production',
  });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!enabled)
      return res.status(503).json({
        message:
          'Доступ владельца ещё не настроен. Задайте ADMIN_PASSWORD_HASH на сервере.',
      });
    next();
  });
  const sameOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const allowed = [
      env.SITE_URL,
      env.VITE_SITE_URL,
      ...(env.ALLOWED_ORIGINS || '').split(','),
    ]
      .filter(Boolean)
      .map((s) => {
        try {
          return new URL(s.trim()).origin;
        } catch {
          return '';
        }
      });
    if (
      !origin ||
      !allowed.includes(origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return res
        .status(403)
        .json({ message: 'Запрос с этого адреса запрещён' });
    next();
  };
  router.use(sameOrigin);
  router.post(
    '/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        message: 'Слишком много попыток входа. Повторите через 15 минут.',
      },
    }),
    async (req, res) => {
      if (
        !(await verifyAdminPassword(
          req.body?.password,
          env.ADMIN_PASSWORD_HASH
        ))
      )
        return res.status(401).json({ message: 'Неверный пароль' });
      sessions.remove(req, res);
      const session = sessions.create(res);
      res.json({ csrf: session.csrf });
    }
  );
  router.use((req, res, next) => {
    const session = sessions.get(req);
    if (!session)
      return res.status(401).json({ message: 'Войдите в панель управления' });
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      req.headers['x-csrf-token'] !== session.csrf
    )
      return res
        .status(403)
        .json({ message: 'Обновите страницу и повторите действие' });
    req.adminSession = session;
    next();
  });
  router.get('/session', (req, res) =>
    res.json({ csrf: req.adminSession.csrf })
  );
  router.post('/logout', (req, res) => {
    sessions.remove(req, res);
    res.json({ ok: true });
  });
  router.get('/overview', async (req, res) => {
    const [state, requests, raw, report] = await Promise.all([
      store.read(),
      store.listRequests(),
      readRawAdminProducts(env),
      readJson('data/import-report.json', null),
    ]);
    res.json({
      revision: state.revision,
      products: raw.length + Object.keys(state.customProducts).length,
      requests: requests.length,
      newRequests: requests.filter(
        (r) =>
          !state.leadStates[r.requestId] ||
          state.leadStates[r.requestId].status === 'new'
      ).length,
      editedProducts: Object.keys(state.products).length,
      report: report && {
        status: report.status,
        generatedAt: report.generatedAt,
        message: report.message,
      },
      formsEnabled: String(env.FORMS_ENABLED).toLowerCase() !== 'false',
    });
  });
  router.get('/requests', async (req, res) => {
    const [records, state] = await Promise.all([
      store.listRequests(),
      store.read(),
    ]);
    res.json({
      revision: state.revision,
      items: records.map((r) => ({
        ...r,
        ...(state.leadStates[r.requestId] || { status: 'new', note: '' }),
      })),
    });
  });
  router.get('/requests/:id', async (req, res) => {
    const [record, state] = await Promise.all([
      store.getRequest(req.params.id),
      store.read(),
    ]);
    res.json({
      ...record,
      revision: state.revision,
      ...(state.leadStates[req.params.id] || { status: 'new', note: '' }),
      attachments: (record.attachments || []).map(
        ({ filename, contentType }, index) => ({ filename, contentType, index })
      ),
    });
  });
  router.get('/requests/:id/files/:index', async (req, res) => {
    const record = await store.getRequest(req.params.id);
    if (!/^\d+$/.test(req.params.index)) fail('Файл не найден', 404);
    const file = record.attachments?.[Number(req.params.index)];
    if (!file) fail('Файл не найден', 404);
    res.type('application/octet-stream');
    res.attachment(file.filename);
    res.send(Buffer.from(file.contentBase64, 'base64'));
  });
  router.put('/requests/:id', async (req, res) => {
    await store.getRequest(req.params.id);
    if (!['new', 'working', 'done', 'spam'].includes(req.body.status))
      fail('Неизвестный статус');
    const note = text(req.body.note, 5000);
    const state = await store.mutate(req.body.revision, (s) => {
      s.leadStates[req.params.id] = {
        status: req.body.status,
        note,
        updatedAt: new Date().toISOString(),
      };
    });
    res.json({ revision: state.revision });
  });
  router.delete('/requests/:id', async (req, res) => {
    await store.getRequest(req.params.id);
    const state = await store.mutate(req.body.revision, (s) => {
      delete s.leadStates[req.params.id];
    });
    await store.deleteRequest(req.params.id);
    res.json({ revision: state.revision });
  });
  router.get('/products', async (req, res) => {
    const [state, raw] = await Promise.all([
      store.read(),
      readRawAdminProducts(env),
    ]);
    const all = [...raw, ...Object.values(state.customProducts)].map((p) => ({
      ...p,
      ...state.products[String(p.id)],
      edited: !!state.products[String(p.id)],
      custom: !!state.customProducts[String(p.id)],
    }));
    const q = String(req.query.search || '').toLocaleLowerCase('ru');
    const filtered = all.filter((p) =>
      `${p.name} ${p.sku} ${p.id}`.toLocaleLowerCase('ru').includes(q)
    );
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    res.json({
      revision: state.revision,
      total: filtered.length,
      page,
      pages: Math.max(1, Math.ceil(filtered.length / 40)),
      items: filtered.slice((page - 1) * 40, page * 40),
      categories: [
        ...new Set(raw.map((p) => p.category).filter(Boolean)),
      ].sort(),
    });
  });
  function productFields(body) {
    const value = {
      name: text(body.name, 240, true),
      price: Number(body.price),
      stock: Number(body.stock),
      hidden: body.hidden === true,
    };
    if (
      body.price === '' ||
      body.stock === '' ||
      !Number.isFinite(value.price) ||
      value.price < 0 ||
      !Number.isFinite(value.stock) ||
      value.stock < 0
    )
      fail('Цена и остаток должны быть неотрицательными числами');
    value.fullName = value.name;
    if (body.description !== undefined)
      value.description = text(body.description, 5000);
    return value;
  }
  router.post('/products', async (req, res) => {
    const fields = productFields(req.body);
    const raw = await readRawAdminProducts(env);
    const category = text(req.body.category, 240, true);
    const sample = raw.find((p) => p.category === category);
    if (!sample) fail('Выберите существующую категорию');
    const id = 2 ** 48 + randomInt(1, 2 ** 47);
    const product = {
      ...Object.fromEntries(
        Object.entries(sample).filter(([k]) => /^catalog|^category$/.test(k))
      ),
      ...fields,
      id,
      sku: text(req.body.sku, 80, true),
      slug: `manual-${Math.abs(id)}`,
      sourceName: fields.name,
      unit: 'м',
    };
    const state = await store.mutate(req.body.revision, (s) => {
      if (
        raw.some((p) => p.id === id) ||
        s.customProducts[id] ||
        raw.some((p) => p.sku === product.sku) ||
        Object.values(s.customProducts).some((p) => p.sku === product.sku)
      )
        fail('Такой артикул уже существует');
      s.customProducts[id] = product;
    });
    res.json({ revision: state.revision, product });
  });
  router.put('/products/:id', async (req, res) => {
    const fields = productFields(req.body);
    const raw = await readRawAdminProducts(env);
    const state = await store.mutate(req.body.revision, (s) => {
      if (
        !raw.some((p) => String(p.id) === req.params.id) &&
        !s.customProducts[req.params.id]
      )
        fail('Товар не найден', 404);
      s.products[req.params.id] = fields;
    });
    res.json({ revision: state.revision });
  });
  router.delete('/products/:id/override', async (req, res) => {
    const state = await store.mutate(req.body.revision, (s) => {
      delete s.products[req.params.id];
    });
    res.json({ revision: state.revision });
  });
  router.get('/imports', async (req, res) => {
    const history = await readJson('data/import-history.json', []);
    const report = await readJson('data/import-report.json', null);
    // Only operational summaries; never expose paths, remote URLs or raw source cells.
    const summary = (r) => ({
      generatedAt: r.generatedAt || r.timestamp || r.finishedAt,
      status: r.status,
      message: r.message,
      blocked: r.blocked,
      total: r.total || r.productsCount || r.productsImported,
    });
    res.json({
      report: report ? summary(report) : null,
      reviewRows: (report?.reviewRows || []).map((r) => ({
        product: r.product,
        reason: r.reason,
      })),
      history: (Array.isArray(history)
        ? history
        : history.imports || history.history || []
      )
        .slice(-30)
        .reverse()
        .map(summary),
    });
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
    res.status(status).json({
      message:
        status === 500
          ? 'Не удалось прочитать или сохранить данные. Повторите действие.'
          : error.message,
    });
  });
  return router;
}
