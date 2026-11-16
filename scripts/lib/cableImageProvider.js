import { vvgCutHold } from './cableVvgCutQuality.js';
import { blocksFromLegacyReview, cableReferencePermission } from './cableReviewPolicy.js';
import path from 'node:path';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { cableIllustrationHold } from './cableIllustrationDefects.js';
import { createHash } from 'node:crypto';
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
      if (
        config.requiredReferenceSha256 &&
        (!reference ||
          createHash('sha256').update(reference).digest('hex') !==
            config.requiredReferenceSha256)
      )
        throw new Error(
          'Required style reference missing or changed before upload'
        );
      const inputs = config.additionalReferenceImages || [];
      if (inputs.length > 2 || (inputs.length && !reference))
        throw Error('An edit accepts one protected PNG and up to two additional PNGs');
      const seen = new Set(reference ? [createHash('sha256').update(reference).digest('hex')] : []);
      const additionalReferences = [];
      for (const r of inputs) {
        if (!r.permission || !['FAMILY_PRIMARY', 'GEOMETRY_MATCH'].includes(r.role))
          throw Error('Supplemental reference permission required');
        const bytes = await readFile(r.path).catch(error=>{
          if (error.code==='ENOENT') throw Error('Файл референса отсутствует перед отправкой: '+r.role+' '+r.sha256,{cause:error});
          throw error;
        });
        if (
          !r.sha256 ||
          createHash('sha256').update(bytes).digest('hex') !== r.sha256
        )
          throw Error('Supplemental reference SHA-256 mismatch');
        if (seen.has(r.sha256)) throw Error('Duplicate image reference');
        seen.add(r.sha256);
        if (cableIllustrationHold(r.sha256) || vvgCutHold(r.sha256))
          throw Error('Supplemental reference is held in the defect registry');
        const [registry, approval] = await Promise.all([
          readFile(r.permission.registry).then(JSON.parse),
          readFile(r.permission.approval).then(JSON.parse),
        ]);
        const reviewRoot = path.dirname(path.dirname(path.dirname(r.permission.registry)));
        const decisions = await loadCableReviewDecisions(reviewRoot);
        if (decisions.some(({ decision }) => decision.sha256 === r.sha256 &&
            blocksFromLegacyReview(registry, decision)))
          throw Error('Supplemental reference denied by durable review');
        const record = r.permission.archiveOnly
          ? registry.alternativesBySha256?.[r.sha256] : registry.byVisualKey?.[r.permission.visualKey];
        if (!record || !cableReferencePermission(registry, record, approval))
          throw Error('Supplemental reference permission changed before upload');
        for (const entry of [record, approval])
          if (entry?.status !== 'APPROVED' ||
              entry.visualKey !== r.permission.visualKey || entry.sha256 !== r.sha256)
            throw Error('Supplemental reference permission changed before upload');
        const group = JSON.parse(await readFile(r.permission.group, 'utf8'));
        const profileHash = createHash('sha256').update(JSON.stringify(group.profile)).digest('hex');
        if (group.visualKey !== record.visualKey || profileHash !== record.profileHash ||
            profileHash !== r.permission.profileHash)
          throw Error('Supplemental reference profile changed before upload');
        additionalReferences.push({ bytes, role: r.role });
      }
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
            for (const [i, { bytes, role }] of additionalReferences.entries())
              body.append(
                'image[]',
                new Blob([bytes], { type: 'image/png' }),
                `${role.toLowerCase()}-${i + 1}.png`
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
