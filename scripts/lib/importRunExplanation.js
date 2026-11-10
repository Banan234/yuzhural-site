// Human-readable facts shared by the email and HTML report. No network or OS inference.
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

export function explainImportRun(report) {
  const telemetry = report.telemetry || {};
  const events = telemetry.events || [];
  const attempts = events.filter((event) => event.type === 'attempt-start');
  const lastAttempt = attempts.at(-1);
  const lastFailure = events.filter((event) => event.type === 'attempt-failure').at(-1);
  const connection = events.filter((event) => event.type === 'connect').at(-1);
  const http = events.filter((event) => event.type === 'http').at(-1);
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
  if (Number.isFinite(telemetry.maxHeartbeatGapMs) && telemetry.maxHeartbeatGapMs >= 30000) {
    lines.push(`Наблюдение: максимальный разрыв контрольных сигналов процесса — ${duration(telemetry.maxHeartbeatGapMs)}. Возможны сон компьютера, блокировка процесса или высокая нагрузка. Причина не подтверждена: события ОС не собираются.`);
  }
  if (telemetry.capturedAt) lines.push(`Последний снимок диагностики: ${date(telemetry.capturedAt)}. После него могли быть события, не попавшие в отчёт.`);
  const beforePublication = /^(Получение источника|Подключение к источнику|Скачивание)/.test(telemetry.stage || '');
  lines.push(beforePublication
    ? 'Влияние: сбой зафиксирован до публикации; этот запуск не обновил каталог.'
    : 'Влияние: обновление этим запуском не подтверждено. При прерывании публикации нужно проверить файлы каталога.');
  lines.push(`Что проверить: ${classifyImportFailure(report).action}${telemetry.maxHeartbeatGapMs >= 30000 ? ' Дополнительно сопоставить время разрыва с журналом сна и пробуждения компьютера.' : ''}`);
  lines.push('Следующая попытка — при очередном запуске планировщика; точное время в этом отчёте не определено.');
  return lines;
}
