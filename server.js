// Файл создаёт Express API: каталог, заявки, лиды, безопасность, rate limiting, SMTP и health endpoints.

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import { promises as fs } from 'fs';
import path from 'path';
import proxyaddr from 'proxy-addr';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { monitorEventLoopDelay } from 'perf_hooks';
import { pathToFileURL } from 'url';
import { createCatalogStore } from './lib/catalog.js';
import { createFileChatStore } from './lib/chatStore.js';
import { createVkChatBridge } from './lib/vkChat.js';
import {
  MAX_QUOTE_ITEMS,
  MAX_QUOTE_PAYLOAD_BYTES,
  isValidQuoteRequest,
  isValidRussianPhone,
} from './shared/quoteValidation.js';
import { formatMessage, messages } from './shared/messages.js';
import { accessLog, logger } from './lib/logger.js';
import {
  CANONICAL_CATEGORY_ORDER,
  DEFAULT_PRODUCTS_LIMIT,
  MAX_PRODUCTS_LIMIT,
  applyCatalogFiltersAndSort,
  buildProductSuggestions,
  createCatalogQueryStore,
  hasProductFilters,
  parseLimit,
  parsePage,
} from './lib/catalogQuery.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const CATALOG_CACHE_TTL_SECONDS = 60;
const CATALOG_CACHE_TTL_MS = CATALOG_CACHE_TTL_SECONDS * 1000;
const DEFAULT_FEATURED_PRODUCTS_LIMIT = 10;
const MAX_FEATURED_PRODUCTS_LIMIT = 50;
const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
// Anti-bot time trap: 2s is low enough for browser autofill/manual submit,
// but cuts off scripts that POST immediately after loading the form.
const MIN_FORM_RENDER_MS = 2_000;
// Response floor for form endpoints. Honeypot/fast-submit branches return a
// fake success without SMTP; this delay keeps that branch from being trivially
// distinguishable from a real sendMail path by response timing.
const FORM_RESPONSE_DELAY_RANGE_MS = Object.freeze({ min: 1_200, max: 2_600 });
const DEFAULT_TRUSTED_PROXY_IPS = 'loopback';
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 20_000;
const DEFAULT_SMTP_SEND_RETRIES = 1;
const DEFAULT_SMTP_RETRY_DELAY_MS = 750;
const DEFAULT_FORMS_DELIVERY_MODE = 'smtp';
const LOCAL_FILE_FORMS_DELIVERY_MODE = 'local_file';
const DEFAULT_FORMS_LOCAL_OUTBOX_DIR = 'data/forms-outbox';
const DEFAULT_VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const QUOTE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const LEAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const BOT_FORM_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PRODUCT_API_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const QUOTE_RATE_LIMIT = 12;
const LEAD_RATE_LIMIT = 30;
const CHAT_RATE_LIMIT = 60;
const BOT_FORM_RATE_LIMIT = 5;
const PRODUCT_API_RATE_LIMIT = 3_000;
const MAX_LEAD_NAME_LENGTH = 120;
const MAX_LEAD_COMMENT_LENGTH = 1000;
const MAX_LEAD_SOURCE_LENGTH = 160;
const MAX_CHAT_MESSAGE_LENGTH = 2_000;
const MAX_CHAT_TOKEN_LENGTH = 128;
const RUNTIME_EVENT_LOOP_DELAY = monitorEventLoopDelay({ resolution: 20 });
const RETRYABLE_MAIL_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ESOCKET',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

RUNTIME_EVENT_LOOP_DELAY.enable();

const API_CSP_DIRECTIVES = Object.freeze({
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  connectSrc: ["'self'"],
  fontSrc: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  frameSrc: ["'none'"],
  imgSrc: ["'none'"],
  manifestSrc: ["'none'"],
  mediaSrc: ["'none'"],
  objectSrc: ["'none'"],
  scriptSrc: ["'none'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'none'"],
  workerSrc: ["'none'"],
});
const API_PERMISSIONS_POLICY =
  'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

// Honeypot: скрытое поле, которое реальный пользователь не видит и не заполняет.
// Боты обычно заполняют все input'ы подряд — отдаём им фейковый success.
function isHoneypotTriggered(body) {
  return Boolean(
    body &&
    typeof body.company_website === 'string' &&
    body.company_website.trim()
  );
}

function getHeaderValue(req, name) {
  return String(req.get(name) || '').trim();
}

function hasBrowserLikeHeaders(req) {
  return Boolean(
    getHeaderValue(req, 'user-agent') && getHeaderValue(req, 'accept-language')
  );
}

function hasSuspiciousSubmitTiming(body) {
  const hasRenderedAt = Object.hasOwn(body || {}, 'rendered_at');
  const hasSubmitAt = Object.hasOwn(body || {}, 'submit_at');

  // Старые открытые вкладки после деплоя могут отправить payload без новых
  // полей. Не блокируем отсутствие обоих значений, но режем битые/слишком
  // быстрые значения, если клиент уже начал их присылать.
  if (!hasRenderedAt && !hasSubmitAt) return false;
  if (!hasRenderedAt || !hasSubmitAt) return true;

  const renderedAt = Number(body.rendered_at);
  const submitAt = Number(body.submit_at);

  if (!Number.isFinite(renderedAt) || !Number.isFinite(submitAt)) {
    return true;
  }

  return submitAt - renderedAt < MIN_FORM_RENDER_MS;
}

function getBotSubmissionSignal(req) {
  if (isHoneypotTriggered(req.body)) return 'honeypot';
  if (!hasBrowserLikeHeaders(req)) return 'missing_headers';
  if (hasSuspiciousSubmitTiming(req.body)) return 'fast_submit';
  return null;
}

function isBotSubmission(req) {
  return Boolean(getBotSubmissionSignal(req));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// На POST-эндпоинтах принимаем только JSON. Без Content-Type: application/json
// express.json() оставляет req.body пустым, isValidQuoteRequest всё равно
// вернёт false — но явный 415 быстрее даёт обратную связь и режет мусор.
function requireJsonContentType(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return res.status(415).json({
      ok: false,
      message: messages.errors.api.expectedJsonContentType,
    });
  }
  return next();
}

function normalizeEmail(value) {
  // Удаляем любые control-символы (включая CR/LF/TAB) — защита от
  // header injection в replyTo при последующей отправке через SMTP.
  // Если после чистки строка перестаёт быть валидным email, isValidQuoteRequest
  // её отбросит на следующем шаге.
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .toLowerCase();
}

// Финальный guard перед передачей пользовательского значения в SMTP-заголовок.
// nodemailer и сам валидирует, но defense-in-depth: явно отбрасываем строку
// при любом намёке на CR/LF/control-символы или несоответствие email-формату.
const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function safeReplyTo(value) {
  const email = String(value ?? '');
  if (!email) return undefined;
  if (/[\r\n\x00-\x1f\x7f]/.test(email)) return undefined;
  if (!SAFE_EMAIL_RE.test(email)) return undefined;
  return email;
}

function normalizePhoneInput(value) {
  // Сохраняем + в начале, остальное — только цифры. Финальная валидация
  // живёт в isValidRussianPhone / isValidQuoteRequest.
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  return raw.startsWith('+') ? `+${digits}` : digits;
}

function isTrimmedStringWithinLength(value, maxLength) {
  return String(value ?? '').trim().length <= maxLength;
}

function isNonEmptyTrimmedStringWithinLength(value, maxLength) {
  const length = String(value ?? '').trim().length;
  return length > 0 && length <= maxLength;
}

function normalizeChatToken(value) {
  return String(value ?? '')
    .trim()
    .slice(0, MAX_CHAT_TOKEN_LENGTH);
}

function getChatTokenFromRequest(req) {
  const authorization = String(req.get('authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return normalizeChatToken(match?.[1]);
}

function applyCatalogCache(res) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${CATALOG_CACHE_TTL_SECONDS}, must-revalidate`
  );
}

async function flushPendingManagerNotifications({
  conversationId,
  chatStore,
  vkBridge,
  loggerImpl = logger,
}) {
  if (!conversationId || !chatStore || !vkBridge?.isConfigured?.()) {
    return 0;
  }

  const pendingMessages =
    await chatStore.getPendingCustomerMessages(conversationId);
  let deliveredCount = 0;

  for (const { conversation, message } of pendingMessages) {
    try {
      const customerMessages = conversation.messages.filter(
        (entry) => entry.role === 'customer'
      );
      const isConversationStart =
        customerMessages.length > 0 && customerMessages[0].id === message.id;
      const notification = isConversationStart
        ? await vkBridge.notifyConversationCreated(conversation)
        : await vkBridge.notifyCustomerMessage(conversation, message);

      if (!notification) {
        break;
      }

      await chatStore.markCustomerMessageNotified(
        conversation.id,
        message.id,
        notification
      );
      deliveredCount += 1;
    } catch (error) {
      loggerImpl.error('chat.manager_notify_failed', {
        err: error,
        conversationId: conversation.id,
        customerMessageId: message.id,
      });
      break;
    }
  }

  return deliveredCount;
}

function getFeaturedProducts(items, limit) {
  return [...items]
    .sort((a, b) => {
      const promotedDiff = (b.promoted ? 1 : 0) - (a.promoted ? 1 : 0);
      if (promotedDiff !== 0) return promotedDiff;
      return (b.stock || 0) - (a.stock || 0);
    })
    .slice(0, limit);
}

async function warmCatalogCaches({
  catalogStore,
  catalogQueryStore,
  warmFeatured,
  featuredLimit = DEFAULT_FEATURED_PRODUCTS_LIMIT,
}) {
  const items = await catalogStore.loadCatalogProducts();
  catalogStore.getCatalogProductListItems(items);
  catalogQueryStore.getCatalogSections(items);
  if (warmFeatured) {
    await warmFeatured(featuredLimit, items);
  }
  return items.length;
}

function parseBooleanEnv(value, fallback) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseIntegerEnv(value, fallback, { min = 1, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function readNonEmptyEnv(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

const SMTP_REQUIRED_ENV_KEYS = Object.freeze([
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'QUOTE_TO_EMAIL',
]);

function getFormsDeliveryMode(env = process.env) {
  const normalized = String(env.FORMS_DELIVERY_MODE || '')
    .trim()
    .toLowerCase();

  return normalized === LOCAL_FILE_FORMS_DELIVERY_MODE
    ? LOCAL_FILE_FORMS_DELIVERY_MODE
    : DEFAULT_FORMS_DELIVERY_MODE;
}

function resolveFormsLocalOutboxDir(env = process.env) {
  const raw =
    String(env.FORMS_LOCAL_OUTBOX_DIR || '').trim() ||
    DEFAULT_FORMS_LOCAL_OUTBOX_DIR;

  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function getFormsDiagnostic(env = process.env) {
  const deliveryMode = getFormsDeliveryMode(env);
  const missing = SMTP_REQUIRED_ENV_KEYS.filter(
    (key) => !String(env[key] || '').trim()
  );
  const formsEnabled = parseBooleanEnv(env.FORMS_ENABLED, true);
  const deliveryConfigured =
    deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE || missing.length === 0;

  return {
    formsEnabled,
    deliveryMode,
    deliveryConfigured,
    smtpConfigured: missing.length === 0,
    missing,
    localOutboxDir:
      deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE
        ? resolveFormsLocalOutboxDir(env)
        : null,
  };
}

function withFormsDeliveryStatus(
  diagnostic,
  { deliveryVerified = null, env = process.env } = {}
) {
  const deliveryMode = diagnostic.deliveryMode || DEFAULT_FORMS_DELIVERY_MODE;
  const deliveryConfigured = Object.hasOwn(diagnostic, 'deliveryConfigured')
    ? diagnostic.deliveryConfigured
    : Boolean(diagnostic.smtpConfigured);

  return {
    ...diagnostic,
    deliveryMode,
    deliveryConfigured,
    localOutboxDir:
      deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE
        ? diagnostic.localOutboxDir || resolveFormsLocalOutboxDir(env)
        : null,
    deliveryVerified,
    smtpVerified:
      deliveryMode === DEFAULT_FORMS_DELIVERY_MODE ? deliveryVerified : null,
    smtpReady:
      diagnostic.formsEnabled &&
      deliveryConfigured &&
      deliveryVerified !== false,
  };
}

export function validateFormsEnv(env = process.env) {
  const diagnostic = getFormsDiagnostic(env);
  if (!diagnostic.formsEnabled) return diagnostic;
  if (
    env.NODE_ENV === 'production' &&
    diagnostic.deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE
  ) {
    throw new Error(
      'FORMS_DELIVERY_MODE=local_file доступен только вне production'
    );
  }
  if (env.NODE_ENV === 'production' && diagnostic.missing.length > 0) {
    throw new Error(
      `SMTP не настроен: задайте ${diagnostic.missing.join(', ')} или FORMS_ENABLED=false`
    );
  }
  return diagnostic;
}

export function validateVkEnv(env = process.env) {
  const accessToken = readNonEmptyEnv(env.VK_COMMUNITY_ACCESS_TOKEN);
  const managerPeerId = readNonEmptyEnv(env.VK_MANAGER_PEER_ID);
  const callbackSecret = readNonEmptyEnv(env.VK_CALLBACK_SECRET);
  const allowInsecureCallback = parseBooleanEnv(
    env.VK_CALLBACK_ALLOW_INSECURE,
    false
  );
  const callbackAutoConfigure = parseBooleanEnv(
    env.VK_CALLBACK_AUTO_CONFIGURE,
    false
  );
  const callbackUrl = readNonEmptyEnv(env.VK_CALLBACK_URL);
  const vkEnabled = Boolean(accessToken || managerPeerId);

  if (env.NODE_ENV === 'production' && vkEnabled && allowInsecureCallback) {
    throw new Error(
      'VK callback не может работать в insecure-режиме в production'
    );
  }

  if (
    env.NODE_ENV === 'production' &&
    vkEnabled &&
    !callbackSecret &&
    !allowInsecureCallback
  ) {
    throw new Error(
      'VK callback не настроен безопасно: задайте VK_CALLBACK_SECRET или отключите VK bridge'
    );
  }

  if (callbackAutoConfigure && !readNonEmptyEnv(env.VK_GROUP_ID)) {
    throw new Error('VK callback auto-config требует VK_GROUP_ID');
  }

  if (
    callbackAutoConfigure &&
    !callbackUrl &&
    !readNonEmptyEnv(env.SITE_URL) &&
    !readNonEmptyEnv(env.VITE_SITE_URL)
  ) {
    throw new Error(
      'VK callback auto-config требует VK_CALLBACK_URL или SITE_URL/VITE_SITE_URL'
    );
  }

  return {
    vkEnabled,
    callbackSecretConfigured: Boolean(callbackSecret),
    allowInsecureCallback,
    callbackAutoConfigure,
  };
}

export function validateStartupEnv(env = process.env) {
  const site = validateSiteUrlEnv(env);
  const forms = validateFormsEnv(env);
  const vk = validateVkEnv(env);

  return { site, forms, vk };
}

function getBearerToken(req) {
  const authorization = String(req.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : '';
}

function hasInternalMetricsAccess(req) {
  const token = readNonEmptyEnv(process.env.INTERNAL_METRICS_TOKEN);
  if (!token) return false;

  return (
    getBearerToken(req) === token ||
    String(req.get('x-internal-metrics-token') || '').trim() === token
  );
}

function getVkHealthSnapshot(vkBridge) {
  const snapshot =
    vkBridge && typeof vkBridge.getStatusSnapshot === 'function'
      ? vkBridge.getStatusSnapshot()
      : null;
  if (!snapshot) {
    return {
      ok: false,
      status: 'unavailable',
      vk: null,
    };
  }

  const publicEndpoint = snapshot.callback?.publicEndpoint || {};
  const callbackReady =
    snapshot.configured &&
    snapshot.callback?.confirmationTokenConfigured &&
    Boolean(snapshot.callback?.url);
  const publicEndpointHealthy = publicEndpoint.healthy !== false;

  let status = 'ready';
  if (!snapshot.enabled) {
    status = 'unavailable';
  } else if (!callbackReady) {
    status = 'callback_unconfigured';
  } else if (publicEndpoint.healthy === false) {
    status = 'callback_unreachable';
  } else if (!publicEndpoint.isStablePublicEntryPoint) {
    status = 'tunnel_or_ephemeral';
  }

  return {
    ok: snapshot.enabled && callbackReady && publicEndpointHealthy,
    status,
    vk: {
      ...snapshot,
      callback: {
        ...snapshot.callback,
        publicEndpoint: {
          ...publicEndpoint,
          operationalRisk:
            publicEndpoint.exposure === 'tunnel' ||
            publicEndpoint.exposure === 'private' ||
            publicEndpoint.exposure === 'insecure_public'
              ? 'high'
              : publicEndpoint.exposure === 'public'
                ? 'low'
                : 'unknown',
        },
      },
    },
  };
}

function getVkCallbackProbeIntervalMs(env = process.env) {
  return parseIntegerEnv(
    env.VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS,
    DEFAULT_VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS,
    {
      min: 0,
      max: MAX_VK_CALLBACK_PUBLIC_PROBE_INTERVAL_MS,
    }
  );
}

function logVkCallbackOperationalRisk(vkBridge) {
  const snapshot =
    vkBridge && typeof vkBridge.getStatusSnapshot === 'function'
      ? vkBridge.getStatusSnapshot()
      : null;
  const publicEndpoint = snapshot?.callback?.publicEndpoint || null;
  if (!snapshot?.enabled || !publicEndpoint?.configured) {
    return;
  }

  if (!publicEndpoint.isStablePublicEntryPoint) {
    logger.warn('startup.vk_callback_operational_risk', {
      exposure: publicEndpoint.exposure || 'unknown',
      tunnelProvider: publicEndpoint.tunnelProvider || null,
      callbackUrl: snapshot.callback?.url || null,
      hint: 'VK callback использует tunnel/private URL и остаётся операционно хрупким до выноса на постоянный публичный endpoint',
    });
  }
}

function attachVkCallbackProbeScheduler({ server, vkBridge, env }) {
  const intervalMs = getVkCallbackProbeIntervalMs(env);
  if (
    intervalMs <= 0 ||
    !vkBridge ||
    typeof vkBridge.probePublicCallbackEndpoint !== 'function' ||
    typeof vkBridge.getStatusSnapshot !== 'function'
  ) {
    return null;
  }

  let lastHealthyState =
    vkBridge.getStatusSnapshot()?.callback?.publicEndpoint?.healthy;
  const runProbe = async () => {
    try {
      const result = await vkBridge.probePublicCallbackEndpoint();
      const snapshot = vkBridge.getStatusSnapshot();
      const publicEndpoint = snapshot?.callback?.publicEndpoint || {};
      const isHealthy = publicEndpoint.healthy;

      if (isHealthy === false && lastHealthyState !== false) {
        logger.warn('vk.callback.public_probe_unhealthy', {
          callbackUrl: snapshot?.callback?.url || null,
          exposure: publicEndpoint.exposure || 'unknown',
          tunnelProvider: publicEndpoint.tunnelProvider || null,
          consecutiveFailures: publicEndpoint.consecutiveFailures || 0,
          lastHttpStatus: publicEndpoint.lastHttpStatus || null,
          error: publicEndpoint.lastError || null,
        });
      } else if (isHealthy === true && lastHealthyState === false) {
        logger.info('vk.callback.public_probe_recovered', {
          callbackUrl: snapshot?.callback?.url || null,
          exposure: publicEndpoint.exposure || 'unknown',
          lastHttpStatus: publicEndpoint.lastHttpStatus || null,
        });
      } else if (
        isHealthy === false &&
        Number(publicEndpoint.consecutiveFailures) > 0 &&
        Number(publicEndpoint.consecutiveFailures) % 5 === 0
      ) {
        logger.warn('vk.callback.public_probe_still_unhealthy', {
          callbackUrl: snapshot?.callback?.url || null,
          consecutiveFailures: publicEndpoint.consecutiveFailures,
          lastHttpStatus: publicEndpoint.lastHttpStatus || null,
        });
      }

      lastHealthyState = isHealthy;
      return result;
    } catch (error) {
      logger.error('vk.callback.public_probe_scheduler_failed', { err: error });
      return null;
    }
  };

  const timer = setInterval(() => {
    void runProbe();
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  if (server && typeof server.once === 'function') {
    server.once('close', () => {
      clearInterval(timer);
    });
  }

  return { intervalMs, runProbe };
}

function bytesToMb(value) {
  return Math.round((value / 1024 / 1024) * 10) / 10;
}

function nanosecondsToMs(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value / 1e6) * 10) / 10;
}

export function getRuntimeHealthSnapshot({
  activeRequests = 0,
  eventLoopDelay = RUNTIME_EVENT_LOOP_DELAY,
} = {}) {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    pid: process.pid,
    node: process.version,
    activeRequests,
    memoryMb: {
      rss: bytesToMb(memory.rss),
      heapTotal: bytesToMb(memory.heapTotal),
      heapUsed: bytesToMb(memory.heapUsed),
      external: bytesToMb(memory.external),
      arrayBuffers: bytesToMb(memory.arrayBuffers),
    },
    eventLoopDelayMs: {
      mean: nanosecondsToMs(eventLoopDelay.mean),
      p95: nanosecondsToMs(eventLoopDelay.percentile(95)),
      max: nanosecondsToMs(eventLoopDelay.max),
    },
    cpuUsageMs: {
      user: Math.round(cpu.user / 1000),
      system: Math.round(cpu.system / 1000),
    },
  };
}

function normalizeCanonicalSiteUrl(value, key) {
  const raw = readNonEmptyEnv(value);
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} должен быть абсолютным http(s)-URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${key} должен использовать протокол http или https`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      `${key} должен быть базовым URL без userinfo, query и hash`
    );
  }

  return parsed.href.replace(/\/+$/, '');
}

export function validateSiteUrlEnv(env = process.env) {
  const siteUrl = normalizeCanonicalSiteUrl(env.SITE_URL, 'SITE_URL');
  const viteSiteUrl = normalizeCanonicalSiteUrl(
    env.VITE_SITE_URL,
    'VITE_SITE_URL'
  );

  if (siteUrl && viteSiteUrl && siteUrl !== viteSiteUrl) {
    throw new Error(
      `SITE_URL и VITE_SITE_URL должны совпадать: SITE_URL="${siteUrl}", VITE_SITE_URL="${viteSiteUrl}"`
    );
  }

  return {
    siteUrl: siteUrl || viteSiteUrl,
    viteSiteUrl,
  };
}

export function getSmtpTransportOptions(env = process.env) {
  const secure = parseBooleanEnv(env.SMTP_SECURE, true);
  const pool = parseBooleanEnv(env.SMTP_POOL, true);
  const options = {
    host: env.SMTP_HOST,
    port: parseIntegerEnv(env.SMTP_PORT, secure ? 465 : 587, {
      min: 1,
      max: 65_535,
    }),
    secure,
    pool,
    connectionTimeout: parseIntegerEnv(
      env.SMTP_CONNECTION_TIMEOUT_MS,
      DEFAULT_SMTP_CONNECTION_TIMEOUT_MS,
      { min: 1_000, max: 120_000 }
    ),
    greetingTimeout: parseIntegerEnv(
      env.SMTP_GREETING_TIMEOUT_MS,
      DEFAULT_SMTP_GREETING_TIMEOUT_MS,
      { min: 1_000, max: 120_000 }
    ),
    socketTimeout: parseIntegerEnv(
      env.SMTP_SOCKET_TIMEOUT_MS,
      DEFAULT_SMTP_SOCKET_TIMEOUT_MS,
      { min: 1_000, max: 300_000 }
    ),
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  };

  if (pool) {
    options.maxConnections = parseIntegerEnv(env.SMTP_POOL_MAX_CONNECTIONS, 2, {
      min: 1,
      max: 10,
    });
    options.maxMessages = parseIntegerEnv(env.SMTP_POOL_MAX_MESSAGES, 100, {
      min: 1,
      max: 10_000,
    });
  }

  return options;
}

function normalizeMailRecipients(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createLocalFileMailTransporter(env = process.env) {
  const outboxDir = resolveFormsLocalOutboxDir(env);

  return {
    async verify() {
      await fs.mkdir(outboxDir, { recursive: true });
      return true;
    },
    async sendMail(mailOptions) {
      await fs.mkdir(outboxDir, { recursive: true });

      const createdAt = new Date();
      const messageId = `<${randomUUID()}@local-file.forms>`;
      const fileName = `${createdAt.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
      const filePath = path.join(outboxDir, fileName);
      const from =
        String(mailOptions?.from || '').trim() ||
        'local-forms@yuzhural-site.test';
      const to = normalizeMailRecipients(
        mailOptions?.to || 'local-sales@yuzhural-site.test'
      );
      const payload = {
        createdAt: createdAt.toISOString(),
        deliveryMode: LOCAL_FILE_FORMS_DELIVERY_MODE,
        messageId,
        envelope: {
          from,
          to,
          replyTo: String(mailOptions?.replyTo || '').trim() || null,
        },
        message: {
          subject: String(mailOptions?.subject || '').trim(),
          text: mailOptions?.text || '',
          html: mailOptions?.html || '',
        },
      };

      await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);

      logger.info('forms.local_outbox_saved', {
        outboxFile: filePath,
        messageId,
        to: payload.envelope.to,
      });

      return {
        accepted: payload.envelope.to,
        rejected: [],
        envelope: payload.envelope,
        messageId,
        localOutboxFile: filePath,
      };
    },
  };
}

export function getMailSendOptions(env = process.env) {
  return {
    maxRetries: parseIntegerEnv(
      env.SMTP_SEND_RETRIES,
      DEFAULT_SMTP_SEND_RETRIES,
      { min: 0, max: 5 }
    ),
    retryDelayMs: parseIntegerEnv(
      env.SMTP_RETRY_DELAY_MS,
      DEFAULT_SMTP_RETRY_DELAY_MS,
      { min: 0, max: 60_000 }
    ),
  };
}

export function createTransporter(env = process.env) {
  if (getFormsDeliveryMode(env) === LOCAL_FILE_FORMS_DELIVERY_MODE) {
    return createLocalFileMailTransporter(env);
  }

  return nodemailer.createTransport(getSmtpTransportOptions(env));
}

export async function verifySmtpTransporter(transporter) {
  if (!transporter || typeof transporter.verify !== 'function') {
    throw new Error('SMTP transporter не поддерживает verify()');
  }

  await transporter.verify();
  return true;
}

export async function initializeFormsForStartup({
  env = process.env,
  mailTransporter,
} = {}) {
  const diagnostic = validateFormsEnv(env);

  if (!diagnostic.formsEnabled) {
    return {
      transporter: null,
      diagnostic: withFormsDeliveryStatus(diagnostic, {
        deliveryVerified: null,
      }),
    };
  }

  if (!diagnostic.deliveryConfigured) {
    return {
      transporter: null,
      diagnostic: withFormsDeliveryStatus(diagnostic, {
        deliveryVerified: false,
      }),
    };
  }

  const transporter = mailTransporter || createTransporter(env);

  try {
    await verifySmtpTransporter(transporter);
    return {
      transporter,
      diagnostic: withFormsDeliveryStatus(diagnostic, {
        deliveryVerified: true,
      }),
    };
  } catch (error) {
    const message =
      diagnostic.deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE
        ? `Local outbox недоступен: проверьте путь ${diagnostic.localOutboxDir}. Для временного отключения заявок задайте FORMS_ENABLED=false.`
        : 'SMTP verify не прошёл: проверьте SMTP_HOST/SMTP_PORT/SMTP_SECURE, логин, app password и доступность SMTP-сервера. Для временного отключения заявок задайте FORMS_ENABLED=false.';

    if (env.NODE_ENV === 'production') {
      throw new Error(message, { cause: error });
    }

    logger.error('startup.smtp_verify_failed', {
      err: error,
      hint: message,
    });

    return {
      transporter: null,
      diagnostic: withFormsDeliveryStatus(diagnostic, {
        deliveryVerified: false,
      }),
    };
  }
}

function getFormsUnavailableMessage(formsDiagnostic) {
  if (!formsDiagnostic.formsEnabled) {
    return messages.errors.api.formsDisabled;
  }

  return messages.errors.api.formsUnavailable;
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function getDefaultFormResponseDelayRange() {
  if (isTestRuntime()) return { min: 0, max: 0 };
  return FORM_RESPONSE_DELAY_RANGE_MS;
}

function normalizeFormResponseDelayRange(range) {
  const min = Number(range?.min);
  const max = Number(range?.max);
  const normalizedMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const normalizedMax = Number.isFinite(max)
    ? Math.max(normalizedMin, Math.floor(max))
    : normalizedMin;

  return { min: normalizedMin, max: normalizedMax };
}

function pickFormResponseDelayMs(range) {
  const { min, max } = range;
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function waitForFormResponseFloor(startedAt, targetDelayMs) {
  const elapsedMs = Date.now() - startedAt;
  await wait(targetDelayMs - elapsedMs);
}

async function sendFormJson(res, startedAt, targetDelayMs, body, status = 200) {
  await waitForFormResponseFloor(startedAt, targetDelayMs);
  return res.status(status).json(body);
}

async function sendFormErrorResponse(
  res,
  startedAt,
  targetDelayMs,
  message,
  status = 500
) {
  return sendFormJson(
    res,
    startedAt,
    targetDelayMs,
    { ok: false, message },
    status
  );
}

export function isRetryableMailError(error) {
  const responseCode = Number(error?.responseCode);
  if (
    Number.isInteger(responseCode) &&
    responseCode >= 400 &&
    responseCode < 500
  ) {
    return true;
  }

  const code = String(error?.code || '').toUpperCase();
  return RETRYABLE_MAIL_ERROR_CODES.has(code);
}

export async function sendMailWithRetry(
  transporter,
  mailOptions,
  {
    event = 'smtp.send',
    maxRetries = DEFAULT_SMTP_SEND_RETRIES,
    retryDelayMs = DEFAULT_SMTP_RETRY_DELAY_MS,
  } = {}
) {
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (error) {
      if (attempt >= totalAttempts || !isRetryableMailError(error)) {
        throw error;
      }

      logger.warn('smtp.send.retry', {
        err: error,
        event,
        attempt,
        next_attempt: attempt + 1,
        max_retries: maxRetries,
        retry_delay_ms: retryDelayMs,
      });
      await wait(retryDelayMs);
    }
  }

  return null;
}

function createErrorResponse(res, message, status = 500) {
  return res.status(status).json({
    ok: false,
    message,
  });
}

export function parseTrustedProxyIps(value = process.env.TRUSTED_PROXY_IPS) {
  const raw = String(value ?? '').trim() || DEFAULT_TRUSTED_PROXY_IPS;
  return raw.split(/[\s,]+/).filter(Boolean);
}

export function createTrustedProxyFn(value = process.env.TRUSTED_PROXY_IPS) {
  return proxyaddr.compile(parseTrustedProxyIps(value));
}

const QUOTE_CHANNEL_LABELS = {
  phone: 'Звонок по телефону',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
};

function createQuoteItemsHtml(items) {
  return items
    .map(
      (item) => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.title)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.sku) || '—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.category)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.quantity)} ${escapeHtml(item.unit) || ''}</td>
            <td style="padding:8px;border:1px solid #ddd;">${Number(item.price || 0) > 0 ? `${escapeHtml(item.price)} ₽` : 'Рассчитать'}</td>
          </tr>
          ${
            item.comment
              ? `<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;color:#555;">Комментарий: ${escapeHtml(item.comment)}</td></tr>`
              : ''
          }
        `
    )
    .join('');
}

// Фабрика express-инстанса. Каждый вызов создаёт изолированный rate limiter
// и cors-allowlist — что позволяет параллельным интеграционным тестам не
// влиять друг на друга. На проде вызывается ровно один раз из main-блока.
export function createApp({
  rateLimitOptions,
  quoteRateLimitOptions,
  leadRateLimitOptions,
  chatRateLimitOptions,
  botRateLimitOptions,
  productApiRateLimitOptions,
  env = process.env,
  trustProxy = createTrustedProxyFn(),
  catalogStore = createCatalogStore(),
  catalogQueryStore = createCatalogQueryStore({
    getCatalogProductsByCategory: catalogStore.getCatalogProductsByCategory,
    facetCacheTtlMs: CATALOG_CACHE_TTL_MS,
  }),
  mailTransporter,
  chatStore = createFileChatStore(),
  vkBridge = createVkChatBridge({ env }),
  formsDiagnostic,
  mailSendOptions = getMailSendOptions(env),
  formResponseDelayRange = getDefaultFormResponseDelayRange(),
  warmCatalogOnStart = false,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  const startupFormsDiagnostic = withFormsDeliveryStatus(
    formsDiagnostic || validateFormsEnv(env),
    {
      env,
      deliveryVerified:
        formsDiagnostic && Object.hasOwn(formsDiagnostic, 'deliveryVerified')
          ? formsDiagnostic.deliveryVerified
          : formsDiagnostic && Object.hasOwn(formsDiagnostic, 'smtpVerified')
            ? formsDiagnostic.smtpVerified
            : null,
    }
  );
  const resolvedMailTransporter =
    mailTransporter ||
    (startupFormsDiagnostic.formsEnabled &&
    startupFormsDiagnostic.deliveryConfigured &&
    startupFormsDiagnostic.deliveryVerified !== false
      ? createTransporter(env)
      : null);

  app.set('etag', false);
  app.set('trust proxy', trustProxy);
  app.locals.mailTransporter = resolvedMailTransporter;
  app.locals.chatStore = chatStore;
  app.locals.vkBridge = vkBridge;
  app.locals.formsDiagnostic = startupFormsDiagnostic;
  app.locals.activeRequests = 0;
  app.locals.catalogWarmupPromise = null;
  let featuredProductsCache = null;
  const normalizedFormResponseDelayRange = normalizeFormResponseDelayRange(
    formResponseDelayRange
  );

  async function getFeaturedProductsResponse(limit, allItems) {
    const items = allItems || (await catalogStore.loadCatalogProducts());

    if (
      featuredProductsCache &&
      featuredProductsCache.catalogItems === items &&
      featuredProductsCache.limit === limit
    ) {
      return featuredProductsCache.responseItems;
    }

    const featured = getFeaturedProducts(items, limit);
    const responseItems = catalogStore.getCatalogProductListItems(featured);
    featuredProductsCache = {
      catalogItems: items,
      limit,
      responseItems,
    };
    return responseItems;
  }

  if (warmCatalogOnStart) {
    app.locals.catalogWarmupPromise = warmCatalogCaches({
      catalogStore,
      catalogQueryStore,
      warmFeatured: getFeaturedProductsResponse,
    })
      .then((count) => {
        logger.info('startup.catalog_warmed', { count });
        return count;
      })
      .catch((error) => {
        logger.error('startup.catalog_warm_failed', { err: error });
        return 0;
      });
  }

  // Формы имеют разную "цену": короткая заявка часто используется из модалок
  // и hero-блока, а полноценное КП тяжелее для менеджера. Лимиты раздельные и
  // достаточно мягкие для офисов за корпоративным NAT.
  const formRateLimitMessage = {
    ok: false,
    message: messages.errors.api.quoteRateLimited,
  };
  const sharedFormRateLimitOptions = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...rateLimitOptions,
  };
  const botFormRateLimiter = rateLimit({
    windowMs: BOT_FORM_RATE_LIMIT_WINDOW_MS,
    limit: BOT_FORM_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: (req) => !isBotSubmission(req),
    ...sharedFormRateLimitOptions,
    ...botRateLimitOptions,
  });
  const quoteRateLimiter = rateLimit({
    windowMs: QUOTE_RATE_LIMIT_WINDOW_MS,
    limit: QUOTE_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: isBotSubmission,
    ...sharedFormRateLimitOptions,
    ...quoteRateLimitOptions,
  });
  const leadRateLimiter = rateLimit({
    windowMs: LEAD_RATE_LIMIT_WINDOW_MS,
    limit: LEAD_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: isBotSubmission,
    ...sharedFormRateLimitOptions,
    ...leadRateLimitOptions,
  });
  const chatRateLimitMessage = {
    ok: false,
    message: messages.errors.api.chatRateLimited,
  };
  const chatRateLimiter = rateLimit({
    windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
    limit: CHAT_RATE_LIMIT,
    message: chatRateLimitMessage,
    skip: isBotSubmission,
    ...sharedFormRateLimitOptions,
    ...chatRateLimitOptions,
  });
  const productApiRateLimiter = rateLimit({
    windowMs: PRODUCT_API_RATE_LIMIT_WINDOW_MS,
    limit: PRODUCT_API_RATE_LIMIT,
    message: {
      ok: false,
      message: messages.errors.api.productApiRateLimited,
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...productApiRateLimitOptions,
  });

  // CORS-allowlist. В проде фронт и API на одном домене — CORS не нужен;
  // если ALLOWED_ORIGINS не задан, отдаём заголовки только для same-origin
  // (cors() c origin=false по сути выключает CORS). В dev указывайте
  // ALLOWED_ORIGINS=http://localhost:5173 или совпадающий VITE_SITE_URL.
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(accessLog());
  app.use((req, res, next) => {
    app.locals.activeRequests += 1;
    let finished = false;
    const markFinished = () => {
      if (finished) return;
      finished = true;
      app.locals.activeRequests = Math.max(0, app.locals.activeRequests - 1);
    };
    res.on('finish', markFinished);
    res.on('close', markFinished);
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        // Запросы без Origin (curl, same-origin, server-to-server) пропускаем.
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, false);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: API_CSP_DIRECTIVES,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: {
        maxAge: HSTS_MAX_AGE_SECONDS,
        includeSubDomains: true,
      },
      xFrameOptions: { action: 'deny' },
    })
  );
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', API_PERMISSIONS_POLICY);
    next();
  });
  app.use('/api/products', compression());
  app.use(express.json({ limit: MAX_QUOTE_PAYLOAD_BYTES }));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ ok: false, message: messages.errors.api.payloadTooLarge });
    }
    return next(err);
  });

  // Публичная liveness-проба для Nginx/Docker/k8s. Никакого I/O и никаких
  // runtime-деталей: этот endpoint проксируется наружу через /api/*.
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
    });
  });

  app.get('/api/runtime', (req, res) => {
    if (!hasInternalMetricsAccess(req)) {
      return res.status(404).json({
        ok: false,
        message: 'Не найдено',
      });
    }

    return res.json({
      ok: true,
      uptime: process.uptime(),
      ts: Date.now(),
      runtime: getRuntimeHealthSnapshot({
        activeRequests: app.locals.activeRequests,
      }),
      forms: {
        formsEnabled: app.locals.formsDiagnostic.formsEnabled,
        deliveryMode: app.locals.formsDiagnostic.deliveryMode,
        deliveryConfigured: app.locals.formsDiagnostic.deliveryConfigured,
        deliveryVerified: app.locals.formsDiagnostic.deliveryVerified,
        smtpConfigured: app.locals.formsDiagnostic.smtpConfigured,
        smtpVerified: app.locals.formsDiagnostic.smtpVerified,
        smtpReady: app.locals.formsDiagnostic.smtpReady,
        missingConfig: app.locals.formsDiagnostic.missing,
        localOutboxDir: app.locals.formsDiagnostic.localOutboxDir,
      },
      vk: getVkHealthSnapshot(app.locals.vkBridge).vk,
    });
  });

  app.get('/api/vk/health', async (req, res) => {
    if (!hasInternalMetricsAccess(req)) {
      return res.status(404).json({
        ok: false,
        message: 'Не найдено',
      });
    }

    const shouldRefresh = parseBooleanEnv(req.query.refresh, false);
    if (
      shouldRefresh &&
      app.locals.vkBridge &&
      typeof app.locals.vkBridge.probePublicCallbackEndpoint === 'function'
    ) {
      try {
        await app.locals.vkBridge.probePublicCallbackEndpoint();
      } catch (error) {
        logger.error('vk.health.probe_failed', { err: error });
      }
    }

    const snapshot = getVkHealthSnapshot(app.locals.vkBridge);
    const httpStatus = snapshot.ok ? 200 : 503;
    return res.status(httpStatus).json(snapshot);
  });

  app.get('/api/forms/health', (req, res) => {
    const diagnostic = app.locals.formsDiagnostic;
    const ok = diagnostic.formsEnabled && diagnostic.smtpReady;

    return res.status(ok ? 200 : 503).json({
      ok,
      status: ok ? 'ready' : 'unavailable',
    });
  });

  app.post('/api/vk/callback', async (req, res) => {
    const bridge = app.locals.vkBridge;
    const update = req.body && typeof req.body === 'object' ? req.body : {};
    const type = String(update.type || '').trim();
    const secret = String(update.secret || '').trim();

    if (!bridge?.isConfigured?.() && type !== 'confirmation') {
      bridge?.noteCallbackRejected?.({
        reason: 'not_configured',
        type,
      });
      logger.warn('vk.callback.rejected', {
        reason: 'not_configured',
        type: type || 'unknown',
        groupId: String(update.group_id || '').trim() || null,
      });
      return res.status(404).json({
        ok: false,
        message: 'Не найдено',
      });
    }

    if (
      type !== 'confirmation' &&
      bridge?.requiresCallbackSecret?.() &&
      (!bridge.callbackSecret || !secret || secret !== bridge.callbackSecret)
    ) {
      bridge?.noteCallbackRejected?.({
        reason: 'secret_mismatch',
        type,
      });
      const statusSnapshot = bridge?.getStatusSnapshot?.();
      const mismatchCount =
        Number(statusSnapshot?.runtime?.secretMismatchCount) || 0;
      if (mismatchCount === 1 || mismatchCount % 5 === 0) {
        logger.warn('vk.callback.secret_mismatch_threshold', {
          mismatchCount,
          managerPeerId: statusSnapshot?.managerPeerId || null,
          callbackUrl: statusSnapshot?.callback?.url || null,
        });
      }
      logger.warn('vk.callback.rejected', {
        reason: 'secret_mismatch',
        type: type || 'unknown',
        groupId: String(update.group_id || '').trim() || null,
        secretPresent: Boolean(secret),
      });
      return res.status(404).json({
        ok: false,
        message: 'Не найдено',
      });
    }

    try {
      const result = await bridge.handleCallbackUpdate(update, {
        chatStore: app.locals.chatStore,
      });
      bridge?.noteCallbackHandled?.(update, result);

      if (result?.confirmation) {
        return res.type('text/plain').send(bridge.confirmationToken || '');
      }

      return res.type('text/plain').send('ok');
    } catch (error) {
      bridge?.noteCallbackFailed?.(update, error);
      logger.error('vk.callback.failed', { err: error });
      return res.status(500).type('text/plain').send('error');
    }
  });

  app.get('/api/chat/conversations/:conversationId', async (req, res) => {
    try {
      const { conversationId } = req.params;
      const token = getChatTokenFromRequest(req);

      if (!token) {
        return res.status(404).json({
          ok: false,
          message: messages.errors.api.chatNotFound,
        });
      }

      const conversation =
        await app.locals.chatStore.getConversationForCustomer(
          conversationId,
          token
        );

      if (!conversation) {
        return res.status(404).json({
          ok: false,
          message: messages.errors.api.chatNotFound,
        });
      }

      await flushPendingManagerNotifications({
        conversationId,
        chatStore: app.locals.chatStore,
        vkBridge: app.locals.vkBridge,
      });

      const refreshedConversation =
        await app.locals.chatStore.getConversationForCustomer(
          conversationId,
          token
        );

      return res.json({
        ok: true,
        role: 'customer',
        conversation: refreshedConversation || conversation,
      });
    } catch (error) {
      logger.error('chat.conversation.read_failed', { err: error });
      return createErrorResponse(res, messages.errors.api.chatLoadFailed);
    }
  });

  app.post(
    '/api/chat/conversations',
    requireJsonContentType,
    botFormRateLimiter,
    chatRateLimiter,
    async (req, res) => {
      const formResponseStartedAt = Date.now();
      const formResponseDelayMs = pickFormResponseDelayMs(
        normalizedFormResponseDelayRange
      );

      try {
        if (getBotSubmissionSignal(req)) {
          return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
            ok: true,
            message: messages.success.chatStarted,
          });
        }

        const { phone, name, message, source } = req.body;
        const contactName = String(name || '').trim();
        const normalizedPhone = normalizePhoneInput(phone);
        const chatMessage = String(message || '').trim();
        const chatSource = String(source || '').trim();

        if (
          !isTrimmedStringWithinLength(contactName, MAX_LEAD_NAME_LENGTH) ||
          !isNonEmptyTrimmedStringWithinLength(
            chatMessage,
            MAX_CHAT_MESSAGE_LENGTH
          ) ||
          !isTrimmedStringWithinLength(chatSource, MAX_LEAD_SOURCE_LENGTH)
        ) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.invalidChatRequest,
            400
          );
        }

        const created = await app.locals.chatStore.createConversation({
          customerPhone: normalizedPhone,
          customerName: contactName,
          source: chatSource,
          initialMessage: chatMessage,
        });

        await flushPendingManagerNotifications({
          conversationId: created.conversation.id,
          chatStore: app.locals.chatStore,
          vkBridge: app.locals.vkBridge,
        });

        return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
          ok: true,
          message: messages.success.chatStarted,
          conversationId: created.conversation.id,
          customerToken: created.customerToken,
          conversation: created.customerConversation,
        });
      } catch (error) {
        logger.error('chat.conversation.create_failed', { err: error });
        return sendFormErrorResponse(
          res,
          formResponseStartedAt,
          formResponseDelayMs,
          messages.errors.api.chatSendFailed
        );
      }
    }
  );

  app.post(
    '/api/chat/conversations/:conversationId/messages',
    requireJsonContentType,
    chatRateLimiter,
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const token = getChatTokenFromRequest(req);
        const message = String(req.body?.message || '').trim();

        if (
          !token ||
          !isNonEmptyTrimmedStringWithinLength(message, MAX_CHAT_MESSAGE_LENGTH)
        ) {
          return res.status(400).json({
            ok: false,
            message: messages.errors.api.invalidChatRequest,
          });
        }

        const updated = await app.locals.chatStore.appendCustomerMessage(
          conversationId,
          token,
          message
        );

        if (!updated) {
          return res.status(404).json({
            ok: false,
            message: messages.errors.api.chatNotFound,
          });
        }

        await flushPendingManagerNotifications({
          conversationId,
          chatStore: app.locals.chatStore,
          vkBridge: app.locals.vkBridge,
        });

        const refreshedConversation =
          await app.locals.chatStore.getConversationForCustomer(
            conversationId,
            token
          );

        return res.json({
          ok: true,
          role: 'customer',
          message: messages.success.chatMessageSent,
          conversation: refreshedConversation || updated.customerConversation,
        });
      } catch (error) {
        logger.error('chat.message.send_failed', { err: error });
        return createErrorResponse(res, messages.errors.api.chatSendFailed);
      }
    }
  );

  app.get('/api/products', productApiRateLimiter, async (req, res) => {
    try {
      applyCatalogCache(res);

      const allItems = await catalogStore.loadCatalogProducts();
      const categorySlug =
        typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const hasPagination = req.query.page != null || req.query.limit != null;
      const hasFilters = hasProductFilters(req.query);
      const baseItems = catalogQueryStore.getCatalogQueryItems(
        allItems,
        categorySlug
      );
      const searchedItems = catalogQueryStore.getSearchFilteredProducts(
        baseItems,
        req.query.search
      );
      const facets = catalogQueryStore.getCatalogFacets(searchedItems, {
        categorySlug,
        search: req.query.search,
        catalogItems: allItems,
      });
      const filteredItems = applyCatalogFiltersAndSort(
        searchedItems,
        req.query
      );
      const total = filteredItems.length;

      let responseItems;
      let pagination = null;

      if (hasPagination) {
        const limit = parseLimit(
          req.query.limit,
          DEFAULT_PRODUCTS_LIMIT,
          MAX_PRODUCTS_LIMIT
        );
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(parsePage(req.query.page), totalPages);
        const start = (page - 1) * limit;
        responseItems = catalogStore.getCatalogProductListItems(
          filteredItems.slice(start, start + limit)
        );
        pagination = { page, limit, total, totalPages };
      } else if (
        !hasFilters &&
        categorySlug &&
        CANONICAL_CATEGORY_ORDER.has(categorySlug)
      ) {
        responseItems = catalogStore.getCatalogProductListItemsByCategory(
          categorySlug,
          allItems
        );
      } else if (!hasFilters) {
        responseItems = catalogStore.getCatalogProductListItems(baseItems);
      } else {
        responseItems = catalogStore.getCatalogProductListItems(filteredItems);
      }

      return res.json({
        ok: true,
        items: responseItems,
        meta: {
          count: responseItems.length,
          total,
          catalogCount: allItems.length,
          pagination,
          facets,
          // Дерево категорий считаем всегда по полному каталогу, чтобы фильтр в URL
          // не схлопывал боковую навигацию.
          catalogSections: catalogQueryStore.getCatalogSections(allItems),
          filter: categorySlug ? { category: categorySlug } : null,
        },
      });
    } catch (error) {
      logger.error('catalog.list.failed', { err: error });
      return createErrorResponse(res, messages.errors.api.catalogLoadFailed);
    }
  });

  app.get('/api/products/featured', productApiRateLimiter, async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(
        req.query.limit,
        DEFAULT_FEATURED_PRODUCTS_LIMIT,
        MAX_FEATURED_PRODUCTS_LIMIT
      );

      return res.json({
        ok: true,
        items: await getFeaturedProductsResponse(limit),
      });
    } catch (error) {
      logger.error('catalog.featured.failed', { err: error });
      return createErrorResponse(res, messages.errors.api.productsLoadFailed);
    }
  });

  app.get(
    '/api/products/suggestions',
    productApiRateLimiter,
    async (req, res) => {
      try {
        applyCatalogCache(res);

        const limit = parseLimit(req.query.limit, 7, 20);
        const items = await catalogStore.loadCatalogProducts();

        return res.json({
          ok: true,
          items: buildProductSuggestions(items, req.query.search, limit),
        });
      } catch (error) {
        logger.error('catalog.suggestions.failed', { err: error });
        return createErrorResponse(
          res,
          messages.errors.api.suggestionsLoadFailed
        );
      }
    }
  );

  app.get(
    '/api/products/:slug/related',
    productApiRateLimiter,
    async (req, res) => {
      try {
        applyCatalogCache(res);

        const limit = parseLimit(req.query.limit, 6, 24);
        const product = await catalogStore.findProductBySlug(req.params.slug);

        if (!product) {
          return res.status(404).json({
            ok: false,
            message: messages.errors.api.productNotFound,
          });
        }

        const items = await catalogStore.loadCatalogProducts();
        const related = items
          .filter(
            (item) =>
              item.id !== product.id && item.category === product.category
          )
          .slice(0, limit);

        return res.json({
          ok: true,
          items: catalogStore.getCatalogProductListItems(related),
        });
      } catch (error) {
        logger.error('catalog.related.failed', {
          err: error,
          slug: req.params.slug,
        });
        return createErrorResponse(
          res,
          messages.errors.api.relatedProductsLoadFailed
        );
      }
    }
  );

  app.get('/api/products/:slug', productApiRateLimiter, async (req, res) => {
    try {
      applyCatalogCache(res);

      const item = await catalogStore.findProductBySlug(req.params.slug);

      if (!item) {
        return res.status(404).json({
          ok: false,
          message: messages.errors.api.productNotFound,
        });
      }

      return res.json({
        ok: true,
        item,
      });
    } catch (error) {
      logger.error('catalog.product.failed', {
        err: error,
        slug: req.params.slug,
      });
      return createErrorResponse(res, messages.errors.api.productLoadFailed);
    }
  });

  // Сверка списка товаров с актуальным каталогом. Клиент шлёт массив
  // стабильных id, в ответ — список найденных позиций (актуальные slug,
  // price, unit, stock, name) и список отсутствующих. Сверка по id, а не
  // по slug, чтобы переименования не выглядели как удаление товара.
  app.post(
    '/api/products/lookup',
    productApiRateLimiter,
    requireJsonContentType,
    async (req, res) => {
      try {
        const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : null;
        if (!rawIds) {
          return createErrorResponse(
            res,
            messages.errors.api.idsArrayExpected,
            400
          );
        }
        if (rawIds.length > MAX_QUOTE_ITEMS) {
          return createErrorResponse(
            res,
            formatMessage(messages.errors.api.tooManyIds, {
              max: MAX_QUOTE_ITEMS,
            }),
            400
          );
        }
        const requestedIds = [];
        const seen = new Set();
        for (const value of rawIds) {
          const id = Number(value);
          if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
          seen.add(id);
          requestedIds.push(id);
        }

        const items = await catalogStore.loadCatalogProducts();
        const listItems = catalogStore.getCatalogProductListItems(items);
        const byId = new Map(listItems.map((item) => [item.id, item]));

        const found = [];
        const missing = [];
        for (const id of requestedIds) {
          const item = byId.get(id);
          if (item) found.push(item);
          else missing.push(id);
        }

        return res.json({ ok: true, found, missing });
      } catch (error) {
        logger.error('catalog.lookup.failed', { err: error });
        return createErrorResponse(res, messages.errors.api.lookupFailed);
      }
    }
  );

  app.post(
    '/api/quote',
    requireJsonContentType,
    botFormRateLimiter,
    quoteRateLimiter,
    async (req, res) => {
      const formResponseStartedAt = Date.now();
      const formResponseDelayMs = pickFormResponseDelayMs(
        normalizedFormResponseDelayRange
      );

      try {
        const formsDiagnostic = app.locals.formsDiagnostic;
        if (!formsDiagnostic.formsEnabled || !formsDiagnostic.smtpReady) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            getFormsUnavailableMessage(formsDiagnostic),
            503
          );
        }

        if (getBotSubmissionSignal(req)) {
          return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
            ok: true,
            message: messages.success.quoteSent,
          });
        }

        const {
          customer: rawCustomer,
          items,
          totalCount,
          totalPrice,
          createdAt,
        } = req.body;
        const customer = rawCustomer
          ? {
              ...rawCustomer,
              phone: normalizePhoneInput(rawCustomer.phone),
              email: normalizeEmail(rawCustomer.email),
            }
          : rawCustomer;

        const quoteRequest = { ...req.body, customer, items };

        if (!isValidQuoteRequest(quoteRequest)) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.invalidQuoteRequest,
            400
          );
        }

        const html = `
        <h2>Новая заявка на коммерческое предложение</h2>

        <p><strong>Дата:</strong> ${escapeHtml(createdAt)}</p>

        <h3>Контакты клиента</h3>
        <p><strong>Имя:</strong> ${escapeHtml(customer.name)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(customer.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(customer.email) || '—'}</p>
        <div style="margin:12px 0;padding:10px 12px;border:1px solid #f59e0b;background:#fef3c7;color:#92400e;">
          <strong>Проверка безопасности:</strong> проверьте email отправителя в теле письма перед ответом.
        </div>
        <p><strong>Предпочтительный канал:</strong> ${escapeHtml(QUOTE_CHANNEL_LABELS[customer.preferredChannel] || customer.preferredChannel) || '—'}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(customer.comment) || '—'}</p>

        <h3>Состав заявки</h3>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;">Товар</th>
              <th style="padding:8px;border:1px solid #ddd;">SKU</th>
              <th style="padding:8px;border:1px solid #ddd;">Категория</th>
              <th style="padding:8px;border:1px solid #ddd;">Метраж/объём</th>
              <th style="padding:8px;border:1px solid #ddd;">Цена</th>
            </tr>
          </thead>
          <tbody>
            ${createQuoteItemsHtml(items)}
          </tbody>
        </table>

        <p><strong>Всего позиций:</strong> ${totalCount}</p>
        <p><strong>Общая сумма:</strong> ${totalPrice} ₽</p>
      `;

        const replyTo = safeReplyTo(customer.email);

        await sendMailWithRetry(
          resolvedMailTransporter,
          {
            from: env.SMTP_FROM,
            to: env.QUOTE_TO_EMAIL,
            ...(replyTo ? { replyTo } : {}),
            subject: 'Новая заявка на КП — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'quote.send' }
        );

        return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
          ok: true,
          message: messages.success.quoteSent,
        });
      } catch (error) {
        logger.error('quote.send.failed', { err: error });
        return sendFormErrorResponse(
          res,
          formResponseStartedAt,
          formResponseDelayMs,
          messages.errors.api.quoteSendFailed
        );
      }
    }
  );

  app.post(
    '/api/lead-request',
    requireJsonContentType,
    botFormRateLimiter,
    leadRateLimiter,
    async (req, res) => {
      const formResponseStartedAt = Date.now();
      const formResponseDelayMs = pickFormResponseDelayMs(
        normalizedFormResponseDelayRange
      );

      try {
        const formsDiagnostic = app.locals.formsDiagnostic;
        if (!formsDiagnostic.formsEnabled || !formsDiagnostic.smtpReady) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            getFormsUnavailableMessage(formsDiagnostic),
            503
          );
        }

        if (getBotSubmissionSignal(req)) {
          return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
            ok: true,
            message: messages.success.leadSentDetailed,
          });
        }

        const { name, phone, comment, source, createdAt } = req.body;
        const contactName = String(name || '').trim();
        const normalizedPhone = normalizePhoneInput(phone);
        const leadComment = String(comment || '').trim();
        const leadSource = String(source || '').trim();

        if (!isValidRussianPhone(normalizedPhone)) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.phoneInvalid,
            400
          );
        }

        if (
          !isTrimmedStringWithinLength(contactName, MAX_LEAD_NAME_LENGTH) ||
          !isTrimmedStringWithinLength(leadComment, MAX_LEAD_COMMENT_LENGTH) ||
          !isTrimmedStringWithinLength(leadSource, MAX_LEAD_SOURCE_LENGTH)
        ) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.invalidQuoteRequest,
            400
          );
        }

        const html = `
        <h2>Новая короткая заявка</h2>
        <p><strong>Дата:</strong> ${escapeHtml(createdAt) || '—'}</p>
        <p><strong>Источник:</strong> ${escapeHtml(leadSource) || '—'}</p>
        <p><strong>Контактное лицо:</strong> ${escapeHtml(contactName) || 'Не указано'}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(normalizedPhone)}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(leadComment) || '—'}</p>
      `;

        await sendMailWithRetry(
          resolvedMailTransporter,
          {
            from: env.SMTP_FROM,
            to: env.QUOTE_TO_EMAIL,
            subject: 'Новая короткая заявка — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'lead.send' }
        );

        return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
          ok: true,
          message: messages.success.leadSentDetailed,
        });
      } catch (error) {
        logger.error('lead.send.failed', { err: error });
        return sendFormErrorResponse(
          res,
          formResponseStartedAt,
          formResponseDelayMs,
          messages.errors.api.quoteSendFailed
        );
      }
    }
  );

  return app;
}

// Запускаем listen только если файл вызван напрямую (`node server.js`),
// а не импортирован тестом или другим скриптом.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// Проверка обязательных env-переменных на старте.
function logFormsStartupState(formsDiagnostic) {
  const diagnostic =
    formsDiagnostic || withFormsDeliveryStatus(validateFormsEnv());
  if (
    diagnostic.formsEnabled &&
    diagnostic.deliveryMode === DEFAULT_FORMS_DELIVERY_MODE &&
    diagnostic.missing.length > 0
  ) {
    logger.warn('startup.smtp_misconfigured', {
      missing: diagnostic.missing,
      hint: 'в production процесс завершится; локально формы вернут 503',
    });
  } else if (
    diagnostic.formsEnabled &&
    diagnostic.deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE &&
    diagnostic.deliveryVerified === true
  ) {
    logger.info('startup.forms_local_file_ready', {
      outboxDir: diagnostic.localOutboxDir,
      hint: 'FORMS_DELIVERY_MODE=local_file: заявки сохраняются в локальный outbox',
    });
  } else if (diagnostic.formsEnabled && diagnostic.deliveryVerified === false) {
    logger.error('startup.smtp_unverified', {
      hint:
        diagnostic.deliveryMode === LOCAL_FILE_FORMS_DELIVERY_MODE
          ? 'Local outbox недоступен: проверьте FORMS_LOCAL_OUTBOX_DIR или задайте FORMS_ENABLED=false'
          : 'SMTP verify не прошёл: проверьте .env или задайте FORMS_ENABLED=false',
    });
  } else if (diagnostic.formsEnabled && diagnostic.smtpVerified === true) {
    logger.info('startup.smtp_verified', {
      hint: 'FORMS_ENABLED=true: SMTP настроен, transporter.verify() успешен',
    });
  } else if (!diagnostic.formsEnabled) {
    logger.warn('startup.forms_disabled', {
      hint: 'FORMS_ENABLED=false: заявки /api/quote и /api/lead-request отключены',
    });
  }
}

export async function startServer({
  env = process.env,
  port = env.PORT || PORT,
  warmCatalogOnStart = true,
  mailTransporter,
  vkBridge = createVkChatBridge({ env }),
  listen = (app, listenPort, onListening) =>
    app.listen(listenPort, onListening),
} = {}) {
  const startup = validateStartupEnv(env);
  const formsStartup = await initializeFormsForStartup({
    env,
    mailTransporter,
  });
  logFormsStartupState(formsStartup.diagnostic || startup.forms);
  if (startup.vk.allowInsecureCallback) {
    logger.warn('startup.vk_callback_insecure', {
      hint: 'VK_CALLBACK_ALLOW_INSECURE=true: проверка secret отключена только для локальной диагностики',
    });
  }
  if (startup.vk.callbackAutoConfigure) {
    logger.info('startup.vk_callback_autoconfigure_enabled');
  }

  const app = createApp({
    env,
    warmCatalogOnStart,
    mailTransporter: formsStartup.transporter,
    vkBridge,
    formsDiagnostic: formsStartup.diagnostic,
  });
  let server;
  await new Promise((resolve, reject) => {
    let settled = false;
    server = listen(app, port, () => {
      logger.info('startup.listening', { port });
      settled = true;
      resolve();
    });

    if (server && typeof server.once === 'function') {
      server.once('error', (error) => {
        if (!settled) {
          reject(error);
        }
      });
    }
  });

  try {
    const webhookConfigured = await vkBridge.configureWebhook?.();
    if (webhookConfigured) {
      logger.info('startup.vk_callback_configured', webhookConfigured);
    }
  } catch (error) {
    vkBridge.noteWebhookConfigureFailed?.(error);
    logger.error('startup.vk_callback_failed', { err: error });
  }
  try {
    const publicProbe = await vkBridge.probePublicCallbackEndpoint?.();
    if (publicProbe && publicProbe.ok) {
      logger.info('startup.vk_callback_public_endpoint_ready', publicProbe);
    } else if (publicProbe) {
      logger.warn('startup.vk_callback_public_endpoint_degraded', publicProbe);
    }
  } catch (error) {
    logger.error('startup.vk_callback_public_probe_failed', { err: error });
  }
  logVkCallbackOperationalRisk(vkBridge);
  const vkCallbackProbeScheduler = attachVkCallbackProbeScheduler({
    server,
    vkBridge,
    env,
  });
  if (vkCallbackProbeScheduler) {
    logger.info('startup.vk_callback_probe_scheduler_started', {
      intervalMs: vkCallbackProbeScheduler.intervalMs,
    });
  }

  return { app, server };
}

if (isMain) {
  try {
    await startServer();
  } catch (error) {
    logger.error('startup.env_invalid', { err: error });
    process.exit(1);
  }
}
