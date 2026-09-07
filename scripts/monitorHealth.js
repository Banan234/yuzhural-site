// Файл проверяет доступность production-сервиса и уведомляет о переходах состояния.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_STATE_FILE = path.join('data', 'monitor-state.json');

function parsePositiveInteger(value, fallback, max = 120_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), max)
    : fallback;
}

function parseNonNegativeInteger(value, fallback, max = 10) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(Math.floor(parsed), max)
    : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolvePath(projectPath, value, fallback) {
  const candidate = String(value || '').trim() || fallback;
  return path.isAbsolute(candidate)
    ? candidate
    : path.join(projectPath, candidate);
}

export function normalizeMonitorBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function getMonitorConfig({
  env = process.env,
  projectPath = projectRoot,
} = {}) {
  const baseUrl = normalizeMonitorBaseUrl(
    env.MONITOR_BASE_URL || env.SITE_URL || env.VITE_SITE_URL
  );
  const internalToken = String(env.INTERNAL_METRICS_TOKEN || '').trim();
  const checkForms = parseBoolean(env.MONITOR_CHECK_FORMS, true);
  const checkVk =
    parseBoolean(env.MONITOR_CHECK_VK, Boolean(internalToken)) &&
    Boolean(internalToken);

  return {
    baseUrl,
    timeoutMs: parsePositiveInteger(env.MONITOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retries: parseNonNegativeInteger(env.MONITOR_RETRIES, DEFAULT_RETRIES),
    checkForms,
    requireForms: parseBoolean(env.MONITOR_REQUIRE_FORMS, false),
    checkRuntime: Boolean(internalToken),
    checkVk,
    allowDisabledVk: parseBoolean(env.VK_SMOKE_ALLOW_DISABLED, false),
    productPath: String(env.MONITOR_PRODUCT_PATH || '').trim(),
    internalToken,
    webhookUrl: String(
      env.MONITOR_WEBHOOK_URL || env.MONITOR_ALERT_WEBHOOK_URL || ''
    ).trim(),
    stateFile: resolvePath(
      projectPath,
      env.MONITOR_STATE_FILE,
      DEFAULT_STATE_FILE
    ),
  };
}

export function buildMonitorChecks(config) {
  const checks = [
    { key: 'web', path: '/healthz', kind: 'liveness' },
    { key: 'homepage', path: '/', kind: 'html' },
    { key: 'sitemap', path: '/sitemap.xml', kind: 'sitemap' },
    { key: 'api', path: '/api/health', kind: 'api' },
  ];

  if (config.checkForms) {
    checks.push({ key: 'forms', path: '/api/forms/health', kind: 'forms' });
  }
  if (config.checkRuntime) {
    checks.push({ key: 'runtime', path: '/api/runtime', kind: 'runtime' });
  }
  if (config.checkVk) {
    checks.push({
      key: 'vk',
      path: '/api/vk/health?refresh=1',
      kind: 'vk',
    });
  }
  if (config.productPath) {
    checks.push({ key: 'product', path: config.productPath, kind: 'product' });
  }

  return checks;
}

function joinUrl(baseUrl, requestPath) {
  return new URL(requestPath, `${baseUrl}/`).toString();
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    url.search = '';
    return url.toString();
  } catch {
    return String(value || '').split(/[?#]/)[0];
  }
}

async function readResponsePayload(response) {
  if (!response || typeof response.text !== 'function') return {};
  const text = (await response.text()).slice(0, 16_384);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function responseIsSuccessful(response) {
  return Boolean(response?.status >= 200 && response?.status < 300);
}

function evaluateMonitorResponse(check, response, payload, config) {
  const status = Number(response?.status) || 0;
  const statusText = String(payload?.status || '').trim();

  if (check.kind === 'forms') {
    if (config.requireForms) {
      return {
        ok: status === 200 && payload?.ok === true && statusText === 'ready',
        reason:
          status === 200 && payload?.ok === true && statusText === 'ready'
            ? ''
            : 'формы не готовы',
      };
    }

    const intentionallyUnavailable =
      status === 503 && payload?.ok === false && statusText === 'unavailable';
    const ready =
      status === 200 && payload?.ok === true && statusText === 'ready';
    return {
      ok: ready || intentionallyUnavailable,
      reason:
        ready || intentionallyUnavailable ? '' : 'неожиданный статус форм',
    };
  }

  if (check.kind === 'runtime') {
    const ok = status === 200 && payload?.ok === true;
    return {
      ok,
      reason: ok
        ? ''
        : status === 200
          ? 'runtime не подтвердил ok=true'
          : 'runtime недоступен',
    };
  }

  if (check.kind === 'liveness') {
    const ok = status === 200 && String(payload?.text || '').trim() === 'ok';
    return {
      ok,
      reason: ok
        ? ''
        : status === 200
          ? 'healthz вернул неожиданный ответ'
          : 'healthz недоступен',
    };
  }

  if (check.kind === 'html') {
    const ok =
      responseIsSuccessful(response) && /<html[\s>]/i.test(payload?.text || '');
    return {
      ok,
      reason: ok
        ? ''
        : responseIsSuccessful(response)
          ? 'главная не похожа на HTML'
          : `HTTP ${status || 'ошибка сети'}`,
    };
  }

  if (check.kind === 'sitemap') {
    const ok =
      responseIsSuccessful(response) &&
      /<urlset[\s>]|<sitemapindex[\s>]/i.test(payload?.text || '');
    return {
      ok,
      reason: ok
        ? ''
        : responseIsSuccessful(response)
          ? 'sitemap имеет неожиданный формат'
          : `HTTP ${status || 'ошибка сети'}`,
    };
  }

  if (check.kind === 'product') {
    const ok =
      responseIsSuccessful(response) &&
      /rel=["']canonical["']/i.test(payload?.text || '') &&
      /application\/ld\+json/i.test(payload?.text || '');
    return {
      ok,
      reason: ok
        ? ''
        : responseIsSuccessful(response)
          ? 'карточка без SEO-данных'
          : `HTTP ${status || 'ошибка сети'}`,
    };
  }

  if (check.kind === 'vk') {
    const disabled =
      config.allowDisabledVk &&
      status === 503 &&
      payload?.ok === false &&
      statusText === 'unavailable';
    const ready =
      status === 200 && payload?.ok === true && statusText === 'ready';
    return {
      ok: ready || disabled,
      reason: ready || disabled ? '' : 'VK bridge не готов',
    };
  }

  if (!responseIsSuccessful(response)) {
    return { ok: false, reason: `HTTP ${status || 'ошибка сети'}` };
  }

  if (check.kind === 'api' && payload?.ok !== true) {
    return { ok: false, reason: 'API не подтвердил ok=true' };
  }

  return { ok: true, reason: '' };
}

export async function checkMonitorEndpoint(
  check,
  config,
  {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  const url = joinUrl(config.baseUrl, check.path);
  const headers = {};
  if (
    (check.kind === 'runtime' || check.kind === 'vk') &&
    config.internalToken
  ) {
    headers.Authorization = `Bearer ${config.internalToken}`;
  }

  let lastResult = null;
  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const payload = await readResponsePayload(response);
      const evaluation = evaluateMonitorResponse(
        check,
        response,
        payload,
        config
      );
      lastResult = {
        key: check.key,
        path: check.path,
        ok: evaluation.ok,
        status: Number(response.status) || 0,
        reason: evaluation.reason,
        durationMs: Date.now() - startedAt,
        attempts: attempt + 1,
      };
      if (lastResult.ok || attempt === config.retries) return lastResult;
    } catch (error) {
      lastResult = {
        key: check.key,
        path: check.path,
        ok: false,
        status: 0,
        reason: error?.name === 'AbortError' ? 'таймаут' : 'ошибка сети',
        durationMs: Date.now() - startedAt,
        attempts: attempt + 1,
      };
      if (attempt === config.retries) return lastResult;
    } finally {
      clearTimeout(timer);
    }
    await sleep(250 * 2 ** attempt);
  }

  return (
    lastResult || {
      key: check.key,
      path: check.path,
      ok: false,
      status: 0,
      reason: 'неизвестная ошибка',
      durationMs: 0,
      attempts: 0,
    }
  );
}

export function summarizeMonitorResults(results) {
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    failed: failed.map((result) => result.key),
    signature: failed
      .map((result) => `${result.key}:${result.reason}`)
      .join('|'),
  };
}

export function formatMonitorNotification({
  status,
  results,
  now = new Date(),
}) {
  const failed = results.filter((result) => !result.ok);
  const title = status === 'up' ? 'Сайт восстановлен' : 'Сбой сайта';
  const lines = results.map((result) => {
    const marker = result.ok ? 'OK' : 'FAIL';
    const detail = result.ok
      ? `${result.status || 'ok'} за ${result.durationMs} мс`
      : result.reason;
    return `${marker} ${result.key}: ${detail}`;
  });

  return [
    title,
    `Время: ${now.toISOString()}`,
    failed.length > 0
      ? `Проблемы: ${failed.map((item) => item.key).join(', ')}`
      : 'Все проверки снова проходят.',
    ...lines,
  ].join('\n');
}

async function loadState(stateFile, fsApi = fs) {
  try {
    const raw = await fsApi.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveState(stateFile, state, fsApi = fs) {
  await fsApi.mkdir(path.dirname(stateFile), { recursive: true });
  const temporaryFile = `${stateFile}.${process.pid}.tmp`;
  await fsApi.writeFile(
    temporaryFile,
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
  await fsApi.rename(temporaryFile, stateFile);
}

export async function sendMonitorNotification(
  webhookUrl,
  message,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  if (!webhookUrl) return { ok: false, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: controller.signal,
    });
    return { ok: responseIsSuccessful(response), status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthMonitor({
  env = process.env,
  projectPath = projectRoot,
  fetchImpl = fetch,
  sleep,
  now = new Date(),
  readState = (stateFile) => loadState(stateFile),
  writeState = (stateFile, state) => saveState(stateFile, state),
  notify = (webhookUrl, message, options) =>
    sendMonitorNotification(webhookUrl, message, options),
} = {}) {
  const config = getMonitorConfig({ env, projectPath });
  if (!config.baseUrl) {
    throw new Error('Не задан MONITOR_BASE_URL, SITE_URL или VITE_SITE_URL.');
  }

  const checks = buildMonitorChecks(config);
  const results = [];
  for (const check of checks) {
    results.push(
      await checkMonitorEndpoint(check, config, { fetchImpl, sleep })
    );
  }

  const summary = summarizeMonitorResults(results);
  const nextStatus = summary.ok ? 'up' : 'down';
  const previousState = await readState(config.stateFile);
  const previousStatus = previousState.status || 'unknown';
  const transitioned = nextStatus !== previousStatus;
  const changedFailure =
    nextStatus === 'down' && summary.signature !== previousState.signature;
  const shouldNotify =
    Boolean(config.webhookUrl) &&
    ((nextStatus === 'down' &&
      (transitioned || changedFailure || previousState.notified !== true)) ||
      (nextStatus === 'up' && previousStatus === 'down'));

  let notification = { ok: false, skipped: true };
  if (shouldNotify) {
    try {
      notification = await notify(
        config.webhookUrl,
        formatMonitorNotification({ status: nextStatus, results, now }),
        { fetchImpl, timeoutMs: config.timeoutMs }
      );
    } catch {
      notification = { ok: false, error: 'ошибка отправки уведомления' };
    }
  }

  await writeState(config.stateFile, {
    version: 1,
    status: nextStatus,
    signature: summary.signature,
    checkedAt: now.toISOString(),
    notified: shouldNotify && notification.ok,
  });

  return {
    ...summary,
    status: nextStatus,
    previousStatus,
    transitioned,
    shouldNotify,
    notification,
    results,
    config: {
      baseUrl: redactUrl(config.baseUrl),
      checks: checks.map((check) => check.key),
    },
  };
}

function usage() {
  return [
    'Usage: node scripts/monitorHealth.js',
    '',
    'Environment: MONITOR_BASE_URL, MONITOR_WEBHOOK_URL, INTERNAL_METRICS_TOKEN,',
    'MONITOR_REQUIRE_FORMS, MONITOR_CHECK_VK, MONITOR_PRODUCT_PATH, MONITOR_STATE_FILE.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const result = await runHealthMonitor();
  for (const item of result.results) {
    console.log(
      `${item.ok ? 'OK' : 'FAIL'} ${item.key} ${item.status || ''} ${item.reason || ''}`.trim()
    );
  }
  if (result.shouldNotify) {
    console.log(
      `Уведомление: ${result.notification.ok ? 'отправлено' : 'ошибка отправки'}`
    );
  }
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`Ошибка health-монитора: ${error.message}`);
    process.exitCode = 1;
  });
}
