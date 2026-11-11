import { expect, it } from 'vitest';
import { explainImportRun } from './importRunExplanation.js';
import { buildImportEmail } from './importNotification.js';
import { buildReportHtml } from './importReport.js';
import { analyzeImportSleep } from './importSleepEvidence.js';

const report = {
  status: 'failed', errorCode: 'IMPORT_TIMEOUT', timeoutMs: 900000,
  generatedAt: '2026-11-09T18:01:51.935Z',
  startedAt: '2026-11-09T17:46:22.689Z', completedAt: '2026-11-09T18:01:51.935Z',
  diagnostic: 'fetch failed (ENOTFOUND)', message: 'Превышено общее время импорта (900 секунд).',
  telemetry: {
    stage: 'Подключение к источнику', maxHeartbeatGapMs: 929216,
    events: [
      { type: 'attempt-start', at: '2026-11-09T17:46:22.722Z', attempt: 1, retries: 3, timeoutMs: 60000 },
      { type: 'connect', url: 'http://user:password@kabelhome.ru/images/price/price.xls?token=secret#private' },
      { type: 'attempt-failure', at: '2026-11-09T18:01:51.905Z', code: 'ENOTFOUND', durationMs: 929183 },
      { type: 'retry-wait', at: '2026-11-09T18:01:51.905Z', backoffMs: 30000 },
    ],
  },
};

it('explains DNS, watchdog termination and an unconfirmed process pause separately in email and HTML', () => {
  for (const output of [buildImportEmail(report).text, buildReportHtml(report)]) {
    expect(output).toContain('22:46:22');
    expect(output).toContain('23:01:51');
    expect(output).toContain('929 с');
    expect(output).toContain('Остановка: превышен общий лимит времени импорта (900 с)');
    expect(output).toContain('Последняя ошибка источника: ENOTFOUND');
    expect(output).toContain('попытка 1 из 3');
    expect(output).toContain('начало следующей попытки в диагностике не зафиксировано');
    expect(output).toContain('Причина не подтверждена');
    expect(output).toContain('до публикации');
    expect(output).not.toContain('Без прогресса: 0 с');
  }
  const text = explainImportRun(report).join('\n');
  expect(text).toContain('http://kabelhome.ru/images/price/price.xls');
  expect(text).not.toMatch(/password|secret|private|user:/);
});

it('does not invent attempts, a sleep event, a network failure or safe publication with missing telemetry', () => {
  const text = explainImportRun({ status: 'failed', generatedAt: report.generatedAt, message: 'Ошибка записи' }).join('\n');
  expect(text).toContain('количество неизвестно');
  expect(text).toContain('Завершение запуска: не зафиксировано');
  expect(text).toContain('нужно проверить файлы');
  expect(text).not.toMatch(/ENOTFOUND|Возможны сон|до публикации|900 с/);
});

it('does not announce a missing retry once the next attempt actually began', () => {
  const text = explainImportRun({ ...report, telemetry: { ...report.telemetry, maxHeartbeatGapMs: 5000, events: [
    ...report.telemetry.events,
    { type: 'attempt-start', at: '2026-11-09T18:02:22Z', attempt: 2, retries: 3, timeoutMs: 60000 },
    { type: 'http', status: 503, at: '2026-11-09T18:02:23Z' },
  ] } }).join('\n');
  expect(text).toContain('попытка 2 из 3');
  expect(text).toContain('HTTP-ответ: 503');
  expect(text).not.toMatch(/начало следующей попытки|Возможны сон/);
});

it('escapes diagnostic facts in HTML', () => {
  const html = buildReportHtml({ ...report, telemetry: { stage: '<script>alert(1)</script>' } });
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

it('correlates the watchdog deadline with macOS sleep in email and HTML', () => {
  const startedAt = '2026-11-10T14:43:40.990Z';
  const watchdogAt = '2026-11-10T15:00:37.028Z';
  const deadlineAt = '2026-11-10T14:58:40.990Z';
  const log = [
    "2026-11-10 19:28:17 +0500 Sleep\tEntering Sleep state due to 'Maintenance Sleep'",
    '2026-11-10 19:43:40 +0500 DarkWake\tDarkWake from Deep Idle',
    "2026-11-10 19:43:42 +0500 Sleep\tEntering Sleep state due to 'Maintenance Sleep'",
    '2026-11-10 19:44:00 +0500 Wake Requests\t[process=private]',
    '2026-11-10 20:00:37 +0500 DarkWake\tDarkWake from Deep Idle',
  ].join('\n');
  const sleepEvidence = analyzeImportSleep(log, startedAt, watchdogAt, deadlineAt);
  expect(sleepEvidence).toMatchObject({
    status: 'overlap',
    totalOverlapMs: 1015000,
    intervals: [{ wakeType: 'dark-wake', includedDeadline: true }],
  });
  const failed = { ...report, startedAt, watchdogAt, completedAt: watchdogAt, deadlineAt, sleepEvidence };
  for (const output of [buildImportEmail(failed).text, buildReportHtml(failed)]) {
    expect(output).toContain('Расчётный срок импорта истёк во время сна');
    expect(output).toContain('19:58:40');
    expect(output).toContain('20:00:37');
    expect(output).toContain('Причину ошибки сети или DNS он не устанавливает');
    expect(output).not.toContain('[process=private]');
  }
  expect(analyzeImportSleep(log, '2026-11-10T15:01:00Z', '2026-11-10T15:02:00Z').status)
    .toBe('no-overlap-observed');
  expect(analyzeImportSleep('', startedAt, watchdogAt).status).toBe('unavailable');
});
