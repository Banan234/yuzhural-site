import { readSourceState } from './importSourceState.js';
import { createHash } from 'crypto';
import { writeFileAtomic } from './importPublisher.js';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { buildReportHtml } from './importReport.js';

export function buildImportEmail(report) {
  const success = report.status === 'published';
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Yekaterinburg',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(report.generatedAt));
  const s = report.summary || {};
  const lines = [
    success ? 'Каталог обновлён.' : 'Импорт не выполнен. Каталог не обновлён.',
    `Запуск: ${date} (Екатеринбург).`,
    report.message,
    ...[
      ['Товаров в результате', 'productsImported'],
      ['Добавлено', 'added'],
      ['Удалено', 'removed'],
      ['Изменений цен', 'priceChanged'],
      ['Изменений остатков', 'stockChanged'],
      ['Исключено некабельных', 'excludedNonCable'],
      ['На проверке', 'reviewRows'],
    ]
      .filter(([, key]) => s[key] != null)
      .map(([label, key]) => `${label}: ${s[key]}`),
    ...(report.publishGuard?.warnings || []).map(
      (item) => `Предупреждение: ${item.message}`
    ),
    'Подробный отчёт этого запуска — во вложении.',
  ];
  return {
    subject: `Прайс: ${success ? 'обновлён' : 'ОШИБКА'} — ${date}`,
    text: lines.filter(Boolean).join('\n'),
  };
}

export function importFailureFingerprint(report) {
  if (report.status !== 'failed') return null;
  return createHash('sha256')
    .update(
      JSON.stringify({
        source:
          report.source?.requestedUrl || report.sourceUrl || report.sourceFile,
        sha256: report.source?.sha256 || null,
        message: report.message || '',
      })
    )
    .digest('hex');
}

export async function archiveAndNotifyImport(
  report,
  {
    projectRoot,
    env = process.env,
    createTransport = nodemailer.createTransport,
  } = {}
) {
  const stateFile = path.join(
    projectRoot,
    'data',
    '.import-notification-state.json'
  );
  const fingerprint = importFailureFingerprint(report);
  const state = await readSourceState(stateFile);
  if (fingerprint && state?.failureFingerprint === fingerprint) {
    console.log(
      '[import-email] Повтор той же ошибки: новый архив и письмо не создаются.'
    );
    return { sent: false, suppressed: true };
  }
  const directory = path.join(projectRoot, 'data', 'import-reports');
  await fs.mkdir(directory, { recursive: true });
  const filename = `import-${report.generatedAt.replace(/[:.]/g, '-')}-${report.status}`;
  const html = buildReportHtml(report);
  await fs.writeFile(
    path.join(directory, `${filename}.json`),
    JSON.stringify(report, null, 2)
  );
  await fs.writeFile(path.join(directory, `${filename}.html`), html);
  const outbox = path.join(projectRoot, 'data', 'import-mail-outbox');
  await fs.mkdir(outbox, { recursive: true });
  const pendingFile = path.join(outbox, `${filename}.json`);
  await writeFileAtomic(pendingFile, JSON.stringify(report));
  // Фиксируем подавление только после сохранения письма в надёжную очередь.
  await writeFileAtomic(
    stateFile,
    JSON.stringify({ failureFingerprint: fingerprint })
  );
  const result = await retryPendingImportEmails({
    projectRoot,
    env,
    createTransport,
  });
  return {
    sent: !result.pending.includes(`${filename}.json`),
    missing: result.missing,
  };
}

export async function retryPendingImportEmails({
  projectRoot,
  env = process.env,
  createTransport = nodemailer.createTransport,
} = {}) {
  const outbox = path.join(projectRoot, 'data', 'import-mail-outbox');
  let pending;
  try {
    pending = (await fs.readdir(outbox))
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return { pending: [] };
    throw error;
  }
  if (!pending.length) return { pending: [] };
  const required = [
    'PRICE_IMPORT_REPORT_TO',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) {
    console.error(
      `[import-email] Отчёт сохранён. Письмо не отправлено: не заполнены ${missing.join(', ')}.`
    );
    return { pending, missing };
  }
  const secure = String(env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';
  const transport = createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const remaining = [];
  try {
    for (const entry of pending.slice(0, 5)) {
      try {
        const report = JSON.parse(
          await fs.readFile(path.join(outbox, entry), 'utf8')
        );
        const filename = entry.slice(0, -5);
        const result = await transport.sendMail({
          from: env.SMTP_FROM,
          to: env.PRICE_IMPORT_REPORT_TO,
          messageId: `<price-import-${createHash('sha256').update(entry).digest('hex')}@yuzhural.local>`,
          ...buildImportEmail(report),
          attachments: [
            {
              filename: `${filename}.html`,
              content: buildReportHtml(report),
              contentType: 'text/html; charset=utf-8',
            },
          ],
        });
        if (
          result.rejected?.length ||
          (Array.isArray(result.accepted) && result.accepted.length === 0)
        )
          throw new Error('SMTP отклонил получателя отчёта');
        await fs.unlink(path.join(outbox, entry));
        console.log('[import-email] Отчёт передан почтовому серверу.');
      } catch (error) {
        remaining.push(entry);
        console.error(
          `[import-email] Письмо осталось в очереди: ${error.message}`
        );
      }
    }
    return { pending: [...remaining, ...pending.slice(5)] };
  } finally {
    transport.close?.();
  }
}
