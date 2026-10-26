import { it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  archiveAndNotifyImport,
  buildImportEmail,
  retryPendingImportEmails,
} from './importNotification.js';

it('описывает ошибку без заявления об обновлении каталога', () => {
  const mail = buildImportEmail({
    generatedAt: '2026-10-24T00:00:00Z',
    status: 'failed',
    message: 'Ошибка загрузки',
  });
  expect(mail.subject).toContain('ОШИБКА');
  expect(mail.text).toContain('Каталог не обновлён');
  expect(mail.text).toContain('Ошибка загрузки');
});

it('архивирует и прикладывает отчёт текущей попытки', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-notify-')
  );
  const sendMail = vi.fn().mockResolvedValue({ rejected: [] });
  const close = vi.fn();
  const report = {
    generatedAt: '2026-10-24T00:00:00Z',
    sourceFile: 'price.xls',
    status: 'failed',
    message: 'CURRENT_FAILURE',
  };
  try {
    await archiveAndNotifyImport(report, {
      projectRoot,
      env: {
        PRICE_IMPORT_REPORT_TO: 'user@example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: 'user',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'from@example.test',
      },
      createTransport: () => ({ sendMail, close }),
    });
    expect(sendMail.mock.calls[0][0].attachments[0].content).toContain(
      'CURRENT_FAILURE'
    );
    expect(sendMail.mock.calls[0][0].to).toBe('user@example.test');
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-reports'))
    ).toHaveLength(2);
    expect(close).toHaveBeenCalled();
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('сохраняет отчёт при отсутствии SMTP и не заявляет об отправке', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-notify-')
  );
  const createTransport = vi.fn();
  try {
    const result = await archiveAndNotifyImport(
      {
        generatedAt: '2026-10-24T00:00:00Z',
        sourceFile: 'price.xls',
        status: 'published',
      },
      { projectRoot, env: {}, createTransport }
    );
    expect(result.sent).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-reports'))
    ).toHaveLength(2);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('досылает письмо после сбоя SMTP и не отправляет его снова после успеха', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-outbox-')
  );
  const env = {
    PRICE_IMPORT_REPORT_TO: 'user@example.test',
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'user',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'from@example.test',
  };
  const report = {
    generatedAt: '2026-10-24T00:00:00Z',
    sourceFile: 'price.xls',
    status: 'published',
    message: 'ORIGINAL_REPORT',
  };
  const sendMail = vi
    .fn()
    .mockRejectedValueOnce(new Error('SMTP unavailable'))
    .mockResolvedValue({ rejected: [] });
  const options = { projectRoot, env, createTransport: () => ({ sendMail }) };
  try {
    expect((await archiveAndNotifyImport(report, options)).sent).toBe(false);
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-mail-outbox'))
    ).toHaveLength(1);
    expect((await retryPendingImportEmails(options)).pending).toEqual([]);
    expect(sendMail.mock.calls[1][0].attachments[0].content).toContain(
      'ORIGINAL_REPORT'
    );
    expect(sendMail.mock.calls[1][0].messageId).toBe(
      sendMail.mock.calls[0][0].messageId
    );
    await retryPendingImportEmails(options);
    expect(sendMail).toHaveBeenCalledTimes(2);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('после заполнения SMTP отправляет сохранённый отчёт без повторного импорта', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-outbox-')
  );
  const sendMail = vi.fn().mockResolvedValue({ rejected: [] });
  try {
    await archiveAndNotifyImport(
      {
        generatedAt: '2026-10-24T00:00:00Z',
        sourceFile: 'price.xls',
        status: 'published',
      },
      { projectRoot, env: {} }
    );
    await retryPendingImportEmails({
      projectRoot,
      env: {
        PRICE_IMPORT_REPORT_TO: 'user@example.test',
        SMTP_HOST: 'host',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'from@example.test',
      },
      createTransport: () => ({ sendMail }),
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('подавляет повтор ошибки после перезапуска, но сохраняет очередь и новые события', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'import-dedup-'));
  const options = { projectRoot, env: {} };
  const report = {
    generatedAt: '2026-10-24T00:00:00Z',
    sourceFile: 'price.xls',
    source: { sha256: 'same-file' },
    status: 'failed',
    message: 'Одинаковая ошибка проверки',
  };
  try {
    await archiveAndNotifyImport(report, options);
    expect(
      (
        await archiveAndNotifyImport(
          { ...report, generatedAt: '2026-10-24T00:30:00Z' },
          options
        )
      ).suppressed
    ).toBe(true);
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-reports'))
    ).toHaveLength(2);
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-mail-outbox'))
    ).toHaveLength(1);
    expect(
      (
        await archiveAndNotifyImport(
          {
            ...report,
            generatedAt: '2026-10-24T01:00:00Z',
            message: 'Другая ошибка',
          },
          options
        )
      ).suppressed
    ).not.toBe(true);
    expect(
      (
        await archiveAndNotifyImport(
          {
            ...report,
            generatedAt: '2026-10-24T01:30:00Z',
            source: { sha256: 'changed-file' },
          },
          options
        )
      ).suppressed
    ).not.toBe(true);
    await archiveAndNotifyImport(
      { ...report, generatedAt: '2026-10-24T02:00:00Z', status: 'published' },
      options
    );
    expect(
      (
        await archiveAndNotifyImport(
          { ...report, generatedAt: '2026-10-24T02:30:00Z' },
          options
        )
      ).suppressed
    ).not.toBe(true);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('обрабатывает ограниченную порцию очереди, чтобы не задерживать импорт', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'import-batch-'));
  const outbox = path.join(projectRoot, 'data/import-mail-outbox');
  const sendMail = vi
    .fn()
    .mockResolvedValue({ accepted: ['user@example.test'], rejected: [] });
  const options = {
    projectRoot,
    env: {
      PRICE_IMPORT_REPORT_TO: 'user@example.test',
      SMTP_HOST: 'host',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      SMTP_FROM: 'from@example.test',
    },
    createTransport: () => ({ sendMail }),
  };
  try {
    await fs.mkdir(outbox, { recursive: true });
    for (let i = 0; i < 7; i++)
      await fs.writeFile(
        path.join(outbox, `${i}.json`),
        JSON.stringify({
          generatedAt: '2026-10-24T00:00:00Z',
          sourceFile: 'price.xls',
          status: 'published',
        })
      );
    expect((await retryPendingImportEmails(options)).pending).toHaveLength(2);
    expect(sendMail).toHaveBeenCalledTimes(5);
    await retryPendingImportEmails(options);
    expect(sendMail).toHaveBeenCalledTimes(7);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});

it('не удаляет письмо из очереди, если SMTP не принял ни одного получателя', async () => {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'import-reject-')
  );
  try {
    const result = await archiveAndNotifyImport(
      {
        generatedAt: '2026-10-24T00:00:00Z',
        sourceFile: 'price.xls',
        status: 'published',
      },
      {
        projectRoot,
        env: {
          PRICE_IMPORT_REPORT_TO: 'user@example.test',
          SMTP_HOST: 'host',
          SMTP_USER: 'user',
          SMTP_PASS: 'pass',
          SMTP_FROM: 'from@example.test',
        },
        createTransport: () => ({
          sendMail: async () => ({ accepted: [], rejected: [] }),
        }),
      }
    );
    expect(result.sent).toBe(false);
    expect(
      await fs.readdir(path.join(projectRoot, 'data/import-mail-outbox'))
    ).toHaveLength(1);
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
