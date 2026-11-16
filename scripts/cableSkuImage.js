import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { createCatalogStore } from '../lib/catalog.js';
import { withCatalogImagePolicy } from '../shared/productImages.js';
import { readCableCatalogProfile } from './lib/cableCatalogProfile.js';
import { cableReusableConstructionKey } from './lib/cableReferenceCompatibility.js';
import { generateCableStyleDraft } from './lib/cableImageStyle.js';
import {
  indexCableSkuCards,
  readCableSkuImageFacts,
} from './lib/cableSkuImageFacts.js';
import { applyApprovedBindingPatches, digest } from './lib/cableStyleBatch.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export async function runCableSkuImage({
  root = projectRoot,
  sku,
  generate = false,
  bind,
  correctionSourceSha,
  env,
  providerFactory,
}) {
  if (
    !sku ||
    (generate && bind) ||
    (bind !== undefined && !/^[a-f0-9]{64}$/u.test(bind)) ||
    (correctionSourceSha !== undefined && (bind || !/^[a-f0-9]{64}$/u.test(correctionSourceSha)))
  )
    throw Error('Use --sku SKU with optional --generate or --bind SHA256');

  root = await fs.realpath(root);
  const read = async (file) =>
    JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  const productsFile = 'data/catalog-current/products.json';
  const overridesFile = 'data/priceOverrides.json';
  const [products, manifest, registry, overrideData] = await Promise.all([
    read(productsFile),
    read('shared/generatedProductImages.json'),
    read('data/cable-approved-results/registry.json'),
    read(overridesFile).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }),
  ]);
  const matches = products.filter((product) => product.sku === sku);
  if (matches.length !== 1)
    throw Error(
      'NEEDS_TECHNICAL_REVIEW: catalog SKU missing or ambiguous: ' + sku
    );
  const [product] = matches;
  const cards = await withCatalogImagePolicy({ manifest, registry }, () =>
    createCatalogStore({
      productsFile: path.join(root, productsFile),
      overridesFile: path.join(root, overridesFile),
      catalogOverridesFile: path.join(root, 'data/catalogOverrides.json'),
      adminDataDir: path.join(root, 'data/admin'),
    }).loadCatalogProducts()
  );
  const card = indexCableSkuCards(cards).get(sku);
  if (!card)
    throw Error('NEEDS_REVIEW: SKU is outside the visible catalog: ' + sku);
  const facts = readCableSkuImageFacts(
    product,
    card,
    manifest,
    registry,
    overrideData ?? {}
  );
  if (facts.protected)
    throw Error('NEEDS_REVIEW: manual/photo image is protected: ' + sku);
  const { binding } = facts;
  if (binding) {
    const image = facts.generatedImage;
    if (!image || (bind && bind !== binding.sha256))
      throw Error(
        'NEEDS_REVIEW: existing binding requires reconciliation: ' + sku
      );
    const bytes = await fs.readFile(path.join(root, 'public', image.slice(1)));
    if (digest(bytes) !== binding.sha256)
      throw Error('NEEDS_REVIEW: existing catalog PNG SHA mismatch: ' + sku);
    return {
      status: 'EXISTING_STANDARD_APPROVED',
      sku,
      image,
      sha256: binding.sha256,
    };
  }

  const outputDir = generate
    ? path.join(root, 'outputs/cable-sku-drafts', randomUUID())
    : undefined;
  const result = await generateCableStyleDraft({
    root,
    sku,
    outputDir,
    dryRun: !generate,
    confirmedOnly: true,
    approvedSha: bind,
    requestOptions: correctionSourceSha ? { correctionSourceSha } : undefined,
    env,
    providerFactory,
  });
  if (!bind)
    return result.status === 'NEEDS_REVIEW' && outputDir
      ? { ...result, sku, draftDir: path.relative(root, outputDir) }
      : result;
  if (!result.catalogAllowed || result.sha256 !== bind)
    throw Error(
      'NEEDS_REVIEW: approve this exact PNG for the SKU in the gallery first: ' +
        sku
    );

  const draftDir = result.approvedDraftDir;
  const group = await read(
    path.join(path.relative(root, draftDir), 'group.json')
  );
  const [patch] = await applyApprovedBindingPatches({
    root,
    catalogRevision: digest({
      products,
      bindings: manifest,
      overrides: overrideData,
    }),
    assignments: [
      {
        draftDir,
        onlyUnboundInFamily: true,
        typicalVvg: result.equivalent,
        reusePolicy: result.reusePolicy,
        currentGroup: {
          visualKey: group.visualKey,
          profile: group.profile,
          eligibleSkus: [sku],
          members: [{ sku, productHash: digest(product), oldBinding: null }],
        },
      },
    ],
  });
  return {
    status: 'APPLIED',
    sku,
    sha256: patch.pngSha256,
    image: patch.changes[0].after.image,
  };
}

export async function runCableSkuBatch({ root = projectRoot, skus, generate, env, providerFactory }) {
  const products = JSON.parse(await fs.readFile(path.join(root, 'data/catalog-current/products.json'), 'utf8'));
  const groups = new Map();
  for (const sku of new Set(skus)) {
    const product = products.find(item => item.sku === sku);
    const { profile, visualKey } = product ? readCableCatalogProfile(product) : {};
    const key = cableReusableConstructionKey(profile) ?? visualKey ?? sku;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sku);
  }
  const results = [];
  for (const skus of groups.values()) {
    const [sku] = skus;
    const result = await runCableSkuImage({ root, sku, generate, env, providerFactory })
      .catch(error => ({ error: error.message }));
    results.push({ ...result, sku, skus });
  }
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { values } = parseArgs({
      options: {
        sku: { type: 'string', multiple: true },
        generate: { type: 'boolean' },
        bind: { type: 'string' },
        'retry-from': { type: 'string' },
      },
    });
    if (values.sku && values.generate && values.bind === undefined)
      dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });
    const skus = values.sku ?? [];
    if (skus.length > 1 && (values.bind !== undefined || values['retry-from'] !== undefined))
      throw Error('--bind and --retry-from require one SKU');
    const result = skus.length > 1
      ? await runCableSkuBatch({ skus, generate: values.generate })
      : await runCableSkuImage({ ...values, sku: skus[0], correctionSourceSha: values['retry-from'] });
    console.log(JSON.stringify(result, null, 2));
    if (Array.isArray(result) && result.some(row => row.error)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
