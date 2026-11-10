import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
export const FORM_REPLY_TIME =
  'Ответим в течение рабочего дня. Если заявка поступила вне рабочего времени — в ближайший рабочий день.';
export function mailSignature(env = {}) {
  const email =
    env.SITE_EMAIL || env.VITE_SITE_EMAIL || 'yuek.sales@yandex.com';
  return `<hr><p>ЮУЭК — отдел продаж<br><a href="tel:+79043069494">+7 904 306-94-94</a><br><a href="mailto:${escape(email)}">${escape(email)}</a><br>Пн–Пт 09:00–17:00, Челябинск (UTC+5)</p>`;
}
export function formatMailTime(iso) {
  return (
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Yekaterinburg',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso)) + ' (Челябинск, UTC+5)'
  );
}
export function mailPageLink(page, env) {
  const base = env.SITE_URL || env.VITE_SITE_URL;
  if (!base || !page) return escape(page || '—');
  try {
    const url = new URL(page, base);
    if (
      url.origin !== new URL(base).origin ||
      !['http:', 'https:'].includes(url.protocol)
    )
      return escape(page);
    return `<a href="${escape(url.href)}">${escape(url.href)}</a>`;
  } catch {
    return escape(page);
  }
}

// One API process per directory. Store only hashes, timestamps and delivery state,
// never customer content or SMTP credentials. Pending SMTP after a crash is
// deliberately not resent automatically: acceptance may already have happened.
export function createFormDelivery({
  env,
  sendMail,
  saveRequest,
  directory = env.FORMS_RECEIPTS_DIR ||
    (process.env.VITEST ? null : './data/form-receipts'),
}) {
  const active = new Map();
  const memory = new Map();
  async function load(key) {
    if (!directory) return memory.get(key);
    try {
      return JSON.parse(
        await fs.readFile(path.join(directory, key + '.json'), 'utf8')
      );
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async function save(key, record) {
    if (!directory) {
      memory.set(key, structuredClone(record));
      return;
    }
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, key + '.json');
    const tmp = file + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
      await fs.rename(tmp, file);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }
  return async function deliver({
    kind,
    submissionId,
    payload,
    consent,
    attachments = [],
    managerMail,
    customerEmail,
    customerSummary,
    previousRequestId,
  }) {
    const digest = createHash('sha256').update(
      JSON.stringify({ kind, payload })
    );
    for (const file of attachments)
      digest.update(file.filename).update(file.content);
    const fingerprint = digest.digest('hex');
    if (
      submissionId &&
      (typeof submissionId !== 'string' ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(submissionId))
    )
      throw Object.assign(new Error('Некорректный идентификатор заявки.'), {
        status: 400,
      });
    // Compatibility for older clients without an id; intentional new requests
    // from current forms always carry a new UUID.
    const key = hash(kind + ':' + (submissionId || fingerprint));
    if (active.has(key)) {
      const prior = active.get(key);
      if (prior.fingerprint !== fingerprint)
        throw Object.assign(
          new Error('Данные заявки изменились. Отправьте её заново.'),
          { status: 409 }
        );
      return prior.promise;
    }
    const promise = (async () => {
      let record = await load(key);
      if (record && Date.now() - record.createdAt > 86400000) record = null;
      if (record && record.fingerprint !== fingerprint)
        throw Object.assign(
          new Error('Данные заявки изменились. Отправьте её заново.'),
          { status: 409 }
        );
      if (!record) {
        record = {
          fingerprint,
          createdAt: Date.now(),
          requestId:
            previousRequestId && /^YUEK-[A-F0-9]{12}$/.test(previousRequestId)
              ? previousRequestId
              : 'YUEK-' + key.slice(0, 12).toUpperCase(),
          stages: {},
        };
        await save(key, record);
      }
      const requestId = record.requestId;
      if (saveRequest)
        await saveRequest({
          requestId,
          kind,
          payload,
          consent,
          createdAt: new Date(record.createdAt).toISOString(),
          attachments: attachments.map((file) => ({
            filename: file.filename,
            contentType: file.contentType,
            contentBase64: Buffer.from(file.content).toString('base64'),
          })),
        });
      async function stage(name, mail) {
        if (record.stages[name] === 'sent') return;
        if (record.stages[name] === 'pending')
          throw Object.assign(
            new Error(
              `Доставка заявки № ${requestId} уточняется. Не создавайте новую заявку; позвоните +7 904 306-94-94 и назовите её номер.`
            ),
            { status: 503 }
          );
        record.stages[name] = 'pending';
        await save(key, record);
        try {
          let result;
          try {
            result = await sendMail(mail);
          } catch (error) {
            if (!(error.responseCode >= 400 && error.responseCode < 500))
              throw error;
            result = await sendMail(mail);
          }
          if (result?.rejected?.length)
            throw Object.assign(
              new Error('Почтовый сервер отклонил получателя.'),
              { responseCode: 550 }
            );
          record.stages[name] = 'sent';
          await save(key, record);
        } catch (error) {
          // A positive SMTP rejection or failure before connection/auth is safe to retry.
          if (
            error.responseCode >= 400 ||
            ['EAUTH', 'ECONNECTION', 'EDNS', 'ECONNREFUSED'].includes(
              error.code
            )
          ) {
            delete record.stages[name];
            await save(key, record);
          }
          if (record.stages[name] === 'pending') {
            throw Object.assign(
              new Error(
                `Доставка заявки № ${requestId} уточняется. Не создавайте новую заявку; позвоните +7 904 306-94-94 и назовите её номер.`
              ),
              { status: 503, cause: error }
            );
          }
          throw error;
        }
      }
      await stage('manager', {
        ...managerMail,
        subject: `${managerMail.subject} · № ${requestId}`,
        html:
          `<p><strong>Заявка № ${requestId}</strong></p>` +
          managerMail.html +
          mailSignature(env),
      });
      let receiptEmailStatus = customerEmail ? 'pending' : 'not_requested';
      if (customerEmail) {
        try {
          await stage('customer', {
            from: managerMail.from,
            to: customerEmail,
            replyTo: env.QUOTE_TO_EMAIL,
            subject: `Заявка № ${requestId} принята — ЮУЭК`,
            text: `Заявка № ${requestId} принята. ${FORM_REPLY_TIME}\nЭто подтверждение получения, не подтверждение цены, наличия или заказа.\nЮУЭК — отдел продаж, +7 904 306-94-94`,
            html: `<h2>Заявка № ${requestId} принята</h2><p>${FORM_REPLY_TIME}</p>${customerSummary || ''}<p>Это подтверждение получения заявки. Цены, наличие и условия поставки уточнит менеджер.</p>${mailSignature(env)}`,
          });
          receiptEmailStatus = 'sent';
        } catch (error) {
          logger.warn('forms.customer_receipt_pending', {
            requestId,
            code: error.code,
            responseCode: error.responseCode,
          });
          receiptEmailStatus = 'pending';
        }
      }
      return { requestId, receiptEmailStatus };
    })();
    active.set(key, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      active.delete(key);
    }
  };
}
