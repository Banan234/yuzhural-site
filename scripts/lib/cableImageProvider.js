import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export class ImageProviderError extends Error {
  constructor(message, retryable = false, httpStatus = null) {
    super(message);
    this.name = 'ImageProviderError';
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

/** Native API adapter for the reusable project pipeline requested by the user. */
export function createImageProvider(
  config,
  { env = process.env, fetchImpl = fetch, sleep = delay } = {}
) {
  if (!['openai', 'codex-sale'].includes(config.provider))
    throw new Error(`Unsupported image provider: ${config.provider}`);
  if (config.provider === 'codex-sale' && config.apiKeyEnv !== 'IMAGE_API_KEY')
    throw new Error('codex.sale requires the separate IMAGE_API_KEY');
  const key = env[config.apiKeyEnv];
  if (!key)
    throw new Error(
      `Set ${config.apiKeyEnv} in the environment; dry-run does not require a key`
    );
  const base = new URL(`${config.apiBaseUrl.replace(/\/+$/u, '')}/`);
  if (
    base.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  )
    throw new Error('Image API requires HTTPS');

  return {
    async generate(job, { onAttempt = async () => {} } = {}) {
      const reference =
        config.imageEndpoint === 'edits' && config.referenceImage
          ? await readFile(config.referenceImage)
          : null;
      for (let attempt = 1; attempt <= config.retries + 1; attempt += 1) {
        await onAttempt(attempt);
        try {
          const fields = {
            model: config.model,
            prompt: job.prompt,
            size: config.size,
            quality: config.quality,
            output_format: config.format,
            background: config.background,
            n: '1',
          };
          const headers = { Authorization: `Bearer ${key}` };
          let body;
          if (reference) {
            body = new FormData();
            for (const [name, value] of Object.entries(fields))
              body.set(name, value);
            body.set(
              'image[]',
              new Blob([reference], { type: 'image/png' }),
              'style-reference.png'
            );
          } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({ ...fields, n: 1 });
          }
          let response;
          try {
            response = await fetchImpl(
              new URL(reference ? 'images/edits' : 'images/generations', base),
              {
                method: 'POST',
                headers,
                body,
                signal: AbortSignal.timeout(config.timeoutMs),
              }
            );
          } catch {
            throw new ImageProviderError(
              'Image API network error or timeout',
              true
            );
          }
          if (!response.ok)
            throw new ImageProviderError(
              `Image API returned HTTP ${response.status}`,
              response.status === 429 ||
                response.status === 408 ||
                response.status >= 500,
              response.status
            );
          let json;
          try {
            json = await response.json();
          } catch {
            throw new ImageProviderError('Image API returned invalid JSON');
          }
          const encoded = json.data?.[0]?.b64_json;
          if (
            json.data?.length !== 1 ||
            typeof encoded !== 'string' ||
            !encoded ||
            !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) ||
            encoded.length > 80_000_000
          )
            throw new ImageProviderError(
              'Image API did not return one base64 image'
            );
          return {
            buffer: Buffer.from(encoded, 'base64'),
            provider: config.provider,
            model: config.model,
            revisedPrompt: json.data[0].revised_prompt || null,
            attempts: attempt,
            httpStatus: response.status,
            usage: json.usage || null,
            requestId: response.headers.get('x-request-id'),
          };
        } catch (error) {
          if (
            !(error instanceof ImageProviderError) ||
            !error.retryable ||
            attempt > config.retries
          )
            throw error;
          await sleep(config.retryDelayMs * 2 ** (attempt - 1));
        }
      }
      throw new Error('Image API retry budget exhausted');
    },
  };
}
