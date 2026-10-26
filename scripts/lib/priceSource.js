// Файл отвечает за выбор, загрузку и проверку источника XLS-прайса.

import { createHash } from 'crypto';
import fs from 'fs/promises';

const URL_RE = /^https?:\/\//i;
const SPREADSHEET_URL_RE = /\.(xls|xlsx)(?:[?#].*)?$/i;
const PRICE_SOURCE_PAGE_MAX_BYTES = 2 * 1024 * 1024;
const PRICE_SOURCE_MAX_REDIRECTS = 5;
export const DEFAULT_PRICE_DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024;

function getPriceDownloadMaxBytes() {
  return parsePriceDownloadMaxBytes(process.env.PRICE_DOWNLOAD_MAX_BYTES);
}

class PriceDownloadError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = 'PriceDownloadError';
    this.retryable = retryable;
  }
}

function safeRemoteUrlLabel(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    if (url.search) url.search = '?redacted';
    url.hash = '';
    return url.href;
  } catch {
    return '[invalid URL]';
  }
}

export function parsePriceDownloadMaxBytes(value) {
  if (value == null || value === '') {
    return DEFAULT_PRICE_DOWNLOAD_MAX_BYTES;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PRICE_DOWNLOAD_MAX_BYTES;
  }

  return Math.floor(parsed);
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '0 Б';
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }
  return `${value} Б`;
}

function createPriceDownloadLimitError(url, actualBytes, maxBytes, source) {
  return new PriceDownloadError(
    `Прайс по URL ${safeRemoteUrlLabel(url)} слишком большой: ${source} ${formatBytes(
      actualBytes
    )}, лимит ${formatBytes(
      maxBytes
    )}. Увеличь PRICE_DOWNLOAD_MAX_BYTES, если файл ожидаемо больше.`,
    { retryable: false }
  );
}

export function assertPriceBufferWithinLimit(
  byteLength,
  source,
  maxBytes = getPriceDownloadMaxBytes()
) {
  if (byteLength > maxBytes) {
    throw createPriceDownloadLimitError(
      source,
      byteLength,
      maxBytes,
      'размер файла'
    );
  }
}

function isSpreadsheetUrl(url) {
  if (!url) return false;
  try {
    return SPREADSHEET_URL_RE.test(new URL(url).pathname || '');
  } catch {
    return SPREADSHEET_URL_RE.test(String(url));
  }
}

function normalizeRemoteUrl(
  value,
  trustedSourceUrl,
  { allowHttpsUpgrade = true } = {}
) {
  let url;
  let trusted;
  try {
    url = new URL(value);
    trusted = new URL(trustedSourceUrl);
  } catch {
    throw new PriceDownloadError('Некорректный URL источника прайса', {
      retryable: false,
    });
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new PriceDownloadError(
      `Недопустимый URL источника прайса: ${safeRemoteUrlLabel(url.href)}`,
      { retryable: false }
    );
  }

  const sameHost =
    url.hostname.toLowerCase() === trusted.hostname.toLowerCase();
  const sameOrigin = url.origin === trusted.origin;
  const upgradesToHttps =
    allowHttpsUpgrade &&
    trusted.protocol === 'http:' &&
    url.protocol === 'https:' &&
    !trusted.port &&
    !url.port;
  if (!sameHost || (!sameOrigin && !upgradesToHttps)) {
    throw new PriceDownloadError(
      `Ссылка прайса должна оставаться на исходном хосте (${trusted.host}): ${safeRemoteUrlLabel(url.href)}`,
      { retryable: false }
    );
  }

  if (trusted.protocol === 'https:' && url.protocol !== 'https:') {
    throw new PriceDownloadError(
      `Запрещено понижать HTTPS-соединение источника прайса: ${safeRemoteUrlLabel(url.href)}`,
      { retryable: false }
    );
  }

  return url;
}

async function fetchPriceSourceResponse(
  url,
  signal,
  { fetchImpl = fetch, trustedSourceUrl = url } = {}
) {
  let currentUrl = normalizeRemoteUrl(url, trustedSourceUrl).href;

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(currentUrl, {
      signal,
      redirect: 'manual',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl };
    }
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    if (redirects >= PRICE_SOURCE_MAX_REDIRECTS) {
      throw new PriceDownloadError(
        'Слишком много перенаправлений источника прайса',
        {
          retryable: false,
        }
      );
    }

    if (!location) {
      throw new PriceDownloadError(
        'Редирект источника прайса без заголовка Location',
        {
          retryable: false,
        }
      );
    }
    try {
      currentUrl = normalizeRemoteUrl(
        new URL(location, currentUrl).href,
        trustedSourceUrl
      ).href;
    } catch (error) {
      if (error instanceof PriceDownloadError) throw error;
      throw new PriceDownloadError(
        `Некорректный Location у редиректа источника прайса: ${safeRemoteUrlLabel(location)}`,
        { retryable: false }
      );
    }
  }
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function extractSpreadsheetUrlFromHtml(
  html,
  baseUrl,
  trustedSourceUrl = null
) {
  const hrefRe = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const candidates = [];
  let match;

  while ((match = hrefRe.exec(html))) {
    const rawHref = decodeHtmlAttribute(match[1] || match[2] || match[3] || '');
    if (!rawHref) continue;
    if (
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      continue;
    }

    let resolvedUrl;
    try {
      resolvedUrl = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }

    if (!isSpreadsheetUrl(resolvedUrl)) {
      continue;
    }
    if (trustedSourceUrl) {
      try {
        normalizeRemoteUrl(resolvedUrl, trustedSourceUrl);
      } catch {
        continue;
      }
    }

    const snippet = html
      .slice(
        Math.max(0, match.index - 160),
        match.index + match[0].length + 160
      )
      .toLowerCase();
    const hrefLower = rawHref.toLowerCase();
    let score = 100;

    if (snippet.includes('скач')) score += 25;
    if (snippet.includes('прайс')) score += 20;
    if (snippet.includes('price')) score += 15;
    if (hrefLower.includes('price') || hrefLower.includes('pric')) score += 10;

    candidates.push({ url: resolvedUrl, score });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.url || '';
}

async function readResponseBodyWithLimit(response, url, maxBytes, controller) {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        controller.abort(
          createPriceDownloadLimitError(url, totalBytes, maxBytes, 'скачано')
        );
        throw createPriceDownloadLimitError(
          url,
          totalBytes,
          maxBytes,
          'скачано'
        );
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchRemoteTextWithTimeout(
  url,
  timeoutMs,
  { fetchImpl = fetch, maxBytes = PRICE_SOURCE_PAGE_MAX_BYTES } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timeout ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    const { response, finalUrl } = await fetchPriceSourceResponse(
      url,
      controller.signal,
      { fetchImpl }
    );
    if (!response.ok) {
      throw new Error(
        `Не удалось открыть страницу ${safeRemoteUrlLabel(url)}: HTTP ${response.status}`
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = Number(contentLengthHeader);
    if (
      contentLengthHeader &&
      Number.isFinite(contentLength) &&
      contentLength > maxBytes
    ) {
      throw createPriceDownloadLimitError(
        url,
        contentLength,
        maxBytes,
        'Content-Length'
      );
    }

    const body = await readResponseBodyWithLimit(
      response,
      url,
      maxBytes,
      controller
    );
    const text = body.toString('utf8');
    if (!text.trim()) {
      throw new PriceDownloadError(
        `Страница прайса пустая: ${safeRemoteUrlLabel(url)}`,
        {
          retryable: false,
        }
      );
    }

    return { text, finalUrl };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPriceWithTimeout(
  url,
  timeoutMs,
  {
    maxBytes = getPriceDownloadMaxBytes(),
    fetchImpl = fetch,
    returnMetadata = false,
  } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timeout ${timeoutMs}ms`)),
    timeoutMs
  );
  try {
    const { response, finalUrl } = await fetchPriceSourceResponse(
      url,
      controller.signal,
      { fetchImpl }
    );
    if (!response.ok) {
      throw new Error(
        `Не удалось скачать прайс по URL ${safeRemoteUrlLabel(url)}: HTTP ${response.status}`
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw createPriceDownloadLimitError(
          url,
          contentLength,
          maxBytes,
          'Content-Length'
        );
      }
    }

    const buffer = await readResponseBodyWithLimit(
      response,
      url,
      maxBytes,
      controller
    );
    if (buffer.length === 0) {
      throw new PriceDownloadError(
        `Скачанный файл пустой: ${safeRemoteUrlLabel(url)}`,
        {
          retryable: false,
        }
      );
    }

    return returnMetadata ? { buffer, downloadUrl: finalUrl } : buffer;
  } finally {
    clearTimeout(timer);
  }
}

export function isRetryableHttpError(error) {
  if (typeof error?.retryable === 'boolean') {
    return error.retryable;
  }
  // Network errors / timeouts ретраим всегда; HTTP ретраим только 5xx и 429.
  const httpMatch = /HTTP (\d{3})/.exec(error?.message || '');
  if (!httpMatch) return true;
  const status = Number(httpMatch[1]);
  return status >= 500 || status === 429;
}

export async function resolveRemotePriceUrl(
  sourceUrl,
  timeoutMs,
  { fetchImpl = fetch } = {}
) {
  if (!sourceUrl) {
    throw new PriceDownloadError('Не задан URL удалённого прайса', {
      retryable: false,
    });
  }

  normalizeRemoteUrl(sourceUrl, sourceUrl);

  if (isSpreadsheetUrl(sourceUrl)) {
    return new URL(sourceUrl).href;
  }

  const { text: html, finalUrl: pageUrl } = await fetchRemoteTextWithTimeout(
    sourceUrl,
    timeoutMs,
    { fetchImpl }
  );
  const spreadsheetUrl = extractSpreadsheetUrlFromHtml(
    html,
    pageUrl,
    sourceUrl
  );
  if (!spreadsheetUrl) {
    throw new PriceDownloadError(
      `На странице ${safeRemoteUrlLabel(sourceUrl)} не найдена ссылка на .xls/.xlsx прайс`,
      { retryable: false }
    );
  }

  return spreadsheetUrl;
}

async function downloadPriceFile(
  remoteSourceUrl,
  {
    timeoutMs = Number(process.env.PRICE_DOWNLOAD_TIMEOUT_MS) || 60_000,
    retries = Number(process.env.PRICE_DOWNLOAD_RETRIES) || 3,
    maxBytes = parsePriceDownloadMaxBytes(process.env.PRICE_DOWNLOAD_MAX_BYTES),
    fetchImpl = fetch,
  } = {}
) {
  const downloadUrl = await resolveRemotePriceUrl(remoteSourceUrl, timeoutMs, {
    fetchImpl,
  });
  console.log(
    `Скачивание прайса: ${safeRemoteUrlLabel(downloadUrl)} (источник ${safeRemoteUrlLabel(remoteSourceUrl)}, лимит ${formatBytes(
      maxBytes
    )})`
  );
  let finalDownloadUrl = downloadUrl;
  let buffer;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchPriceWithTimeout(downloadUrl, timeoutMs, {
        maxBytes,
        fetchImpl,
        returnMetadata: true,
      });
      buffer = result.buffer;
      finalDownloadUrl = result.downloadUrl;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableHttpError(error)) {
        throw error;
      }
      const backoffMs = 30_000 * 2 ** (attempt - 1);
      console.warn(
        `Попытка ${attempt}/${retries} провалена (${error.message}). Ретрай через ${backoffMs} мс.`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  if (!buffer) {
    throw lastError || new Error('Не удалось скачать прайс');
  }
  console.log(
    `Скачано ${safeRemoteUrlLabel(finalDownloadUrl)} (${(buffer.length / 1024).toFixed(1)} КБ)`
  );
  return { buffer, downloadUrl: finalDownloadUrl };
}

export function resolvePriceSourceSelection({
  positionalSource = '',
  env = process.env,
  defaultPath,
} = {}) {
  const remoteSourceUrl = URL_RE.test(positionalSource)
    ? positionalSource
    : positionalSource
      ? ''
      : env.PRICE_URL || env.PRICE_PAGE_URL || '';
  const inputFile = (remoteSourceUrl ? '' : positionalSource) || defaultPath;
  return { remoteSourceUrl, inputFile };
}

export async function readLocalPriceFile(
  filePath,
  {
    maxBytes = parsePriceDownloadMaxBytes(process.env.PRICE_DOWNLOAD_MAX_BYTES),
  } = {}
) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    assertPriceBufferWithinLimit(stat.size, filePath, maxBytes);
    const buffer = await handle.readFile();
    assertPriceBufferWithinLimit(buffer.length, filePath, maxBytes);
    return buffer;
  } finally {
    await handle.close();
  }
}

function fingerprint(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function acquirePriceSource({
  remoteUrl = '',
  filePath,
  timeoutMs = Number(process.env.PRICE_DOWNLOAD_TIMEOUT_MS) || 60_000,
  retries = Number(process.env.PRICE_DOWNLOAD_RETRIES) || 3,
  maxBytes = parsePriceDownloadMaxBytes(process.env.PRICE_DOWNLOAD_MAX_BYTES),
  fetchImpl = fetch,
} = {}) {
  let buffer;
  let requestedUrl = null;
  let downloadUrl = null;

  if (remoteUrl) {
    requestedUrl = safeRemoteUrlLabel(remoteUrl);
    const result = await downloadPriceFile(remoteUrl, {
      timeoutMs,
      retries,
      maxBytes,
      fetchImpl,
    });
    buffer = result.buffer;
    downloadUrl = safeRemoteUrlLabel(result.downloadUrl);
  } else {
    if (!filePath) throw new Error('Не задан локальный путь к прайсу.');
    buffer = await readLocalPriceFile(filePath, { maxBytes });
  }

  return {
    buffer,
    metadata: {
      kind: remoteUrl ? 'remote' : 'local',
      requestedUrl,
      downloadUrl,
      sha256: fingerprint(buffer),
      sizeBytes: buffer.length,
    },
  };
}
