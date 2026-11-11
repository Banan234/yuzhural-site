// Human-readable facts shared by the email and HTML report.
import { classifyImportFailure } from './importFailureCategory.js';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Yekaterinburg', dateStyle: 'short', timeStyle: 'medium',
});
function date(value) {
  return value && Number.isFinite(Date.parse(value))
    ? `${dateFormatter.format(new Date(value))} (Екатеринбург)` : 'не зафиксировано';
}
function duration(value) {
  return Number.isFinite(value) && value >= 0 ? `${Math.round(value / 1000)} с` : 'не зафиксирована';
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}

function explainSleep(report) {
  const evidence = report.sleepEvidence;
  if (!evidence || evidence.status === 'unsupported') return [];
  if (evidence.status === 'unavailable') {
    return ['Журнал сна macOS недоступен. Влияние сна на запуск определить не удалось.'];
  }
  if (evidence.status === 'no-overlap-observed') {
    return ['В журнале macOS нет завершённых интервалов сна, пересекающихся с запуском.'];
  }
  if (evidence.status !== 'overlap') return [];

  const deadlineInterval = evidence.intervals.find((interval) => interval.includedDeadline);
  const interval = deadlineInterval || evidence.intervals.at(-1);
  const sleep = deadlineInterval ? 'Сон, на который пришёлся лимит' : 'Последний интервал сна';
  const wake = interval.wakeType === 'dark-wake' ? 'Фоновое пробуждение' : 'Пробуждение';
  return [
    `Журнал macOS подтвердил сон во время запуска. Суммарно — ${duration(evidence.totalOverlapMs)}.`,
    `${sleep}: ${date(interval.sleepAt)}. ${wake}: ${date(interval.wakeAt)}.`,
    ...(deadlineInterval ? [`Расчётный срок импорта истёк во время сна (${date(report.deadlineAt)}). Сигнал остановки отправлен после пробуждения (${date(report.watchdogAt)}).`] : []),
    'Журнал сна показывает, когда Mac спал. Причину ошибки сети или DNS он не устанавливает.',
  ];
}

export function explainImportRun(report) {
  const telemetry = report.telemetry || {};
  const events = telemetry.events || [];
  const attempts = events.filter((event) => event.type === 'attempt-start');
  const lastAttempt = attempts.at(-1);
  const lastFailure = events.filter((event) => event.type === 'attempt-failure').at(-1);
  const connection = events.filter((event) => event.type === 'connect').at(-1);
  const http = events.filter((event) => event.type === 'http').at(-1);
  const download = events.filter((event) => event.type === 'download-progress').at(-1);
  const start = report.startedAt || telemetry.startedAt || report.generatedAt;
  const end = report.completedAt || telemetry.capturedAt;
  const elapsed = end && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end))
    ? Date.parse(end) - Date.parse(start) : telemetry.elapsedMs;
  const source = safeUrl(report.source?.requestedUrl || report.sourceUrl || connection?.url);
  const lines = [
    `Начало запуска: ${date(start)}.`,
    `Завершение запуска: ${date(end)}. Длительность: ${duration(elapsed)}.`,
    ...(source ? [`Адрес источника: ${source}`] : []),
    ...(telemetry.stage ? [`Последний зафиксированный этап: ${telemetry.stage}.`] : []),
  ];
  if (report.status !== 'failed') return lines;

  const watchdog = report.errorCode === 'IMPORT_TIMEOUT';
  lines.push(`Остановка: ${watchdog ? `превышен общий лимит времени импорта${report.timeoutMs ? ` (${duration(report.timeoutMs)})` : ''}` : report.message || classifyImportFailure(report).title}.`);
  if (lastFailure?.code || report.diagnostic) {
    lines.push(`Последняя ошибка источника: ${lastFailure?.code || report.diagnostic}${lastFailure ? `; зафиксирована ${date(lastFailure.at)}, длительность попытки ${duration(lastFailure.durationMs)}` : ''}.`);
  }
  if (lastAttempt) {
    lines.push(`Загрузка: последняя зафиксированная попытка ${lastAttempt.attempt} из ${lastAttempt.retries}; лимит одной попытки ${duration(lastAttempt.timeoutMs)}. Это лимит ожидания, а не гарантия остановки во время паузы процесса.`);
    const wait = events.filter((event) => event.type === 'retry-wait').at(-1);
    if (wait && Date.parse(wait.at) >= Date.parse(lastAttempt.at)) {
      lines.push(`Повтор был запланирован через ${duration(wait.backoffMs)}; начало следующей попытки в диагностике не зафиксировано.`);
    }
    lines.push(http ? `Последний HTTP-ответ: ${http.status}, ${date(http.at)}. Он сам по себе не подтверждает полную загрузку файла.` : 'HTTP-ответ в сохранённой диагностике не зафиксирован.');
  } else {
    lines.push('Данные о попытках загрузки не сохранены; их количество неизвестно.');
  }
  if (Number.isFinite(download?.bytes)) {
    lines.push(`Последний прогресс загрузки: ${download.bytes.toLocaleString('ru-RU')} байт, ${date(download.at)}.`);
  }
  const longHeartbeatGap = telemetry.maxHeartbeatGapMs >= 30000;
  if (longHeartbeatGap) {
    lines.push(`Максимальный разрыв контрольных сигналов процесса — ${duration(telemetry.maxHeartbeatGapMs)}.`);
    if (report.sleepEvidence?.status !== 'overlap') {
      lines.push('Возможны сон компьютера, блокировка процесса или высокая нагрузка. Причина не подтверждена.');
    }
  }
  lines.push(...explainSleep(report));
  if (telemetry.capturedAt) lines.push(`Последний снимок диагностики: ${date(telemetry.capturedAt)}. После него могли быть события, не попавшие в отчёт.`);
  const beforePublication = /^(Получение источника|Подключение к источнику|Скачивание)/.test(telemetry.stage || '');
  lines.push(beforePublication
    ? 'Влияние: сбой зафиксирован до публикации; этот запуск не обновил каталог.'
    : 'Влияние: обновление этим запуском не подтверждено. При прерывании публикации нужно проверить файлы каталога.');
  lines.push(`Что проверить: ${classifyImportFailure(report).action}`);
  lines.push('Следующая попытка — при очередном запуске планировщика; точное время в этом отчёте не определено.');
  return lines;
}
