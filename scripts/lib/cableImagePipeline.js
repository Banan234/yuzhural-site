import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildCableImageJob,
  CableImageInputError,
  hashImageData,
} from './cableImageSpec.js';
import { validateCableImagePng } from './cableImagePng.js';
import { getCableVisualConfig } from './cableImageVisual.js';
import { getHistoricalGeneratedProductImage } from './historicalGeneratedProductImage.js';

const inside = (root, file) => {
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`))
    throw new Error(`Path must be inside the project: ${file}`);
  return resolved;
};
const exists = async (file) =>
  fs.access(file).then(
    () => true,
    (e) => {
      if (e.code === 'ENOENT') return false;
      throw e;
    }
  );
const relative = (root, file) =>
  path.relative(root, file).split(path.sep).join('/');

async function readJson(file, missing) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && missing !== undefined) return missing;
    throw new Error(`Cannot read valid JSON: ${file}`, { cause: e });
  }
}

export async function loadCableImageConfig(
  root,
  file = 'data/cableImageConfig.json',
  { env = process.env } = {}
) {
  const config = await readJson(path.resolve(root, file));
  if (env.IMAGE_API_BASE_URL?.trim())
    config.apiBaseUrl = env.IMAGE_API_BASE_URL.trim();
  if (env.IMAGE_MODEL?.trim()) config.model = env.IMAGE_MODEL.trim();
  config.imageEndpoint ||= 'generations';
  if (!['generations', 'edits'].includes(config.imageEndpoint))
    throw new Error('Invalid imageEndpoint');
  if (config.provider === 'codex-sale' && config.apiKeyEnv !== 'IMAGE_API_KEY')
    throw new Error('codex.sale requires the separate IMAGE_API_KEY');
  const apiUrl = new URL(config.apiBaseUrl);
  if (
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    !(
      apiUrl.protocol === 'https:' ||
      (apiUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname))
    )
  )
    throw new Error(
      'Image API URL requires HTTPS (HTTP only for local tests), without credentials/query'
    );
  if (
    config.normalization?.enabled &&
    (!Number.isInteger(config.normalization.width) ||
      !Number.isInteger(config.normalization.height) ||
      config.normalization.width <= 0 ||
      config.normalization.height <= 0 ||
      config.normalization.width * config.normalization.height > 16000000)
  )
    throw new Error('Invalid normalization canvas');
  if (
    config.schemaVersion !== 1 ||
    config.format !== 'png' ||
    config.background !== 'transparent'
  )
    throw new Error(
      'Cable image configuration requires schemaVersion=1, PNG and transparent background'
    );
  if (
    !/^\d+x\d+$/u.test(config.size) ||
    config.size.split('x').some((n) => Number(n) < 16)
  )
    throw new Error('Image size must be explicit WIDTHxHEIGHT');
  for (const [key, min, max] of [
    ['concurrency', 1, 8],
    ['retries', 0, 5],
    ['retryDelayMs', 0, 60000],
    ['timeoutMs', 1, 900000],
  ]) {
    if (
      !Number.isInteger(config[key]) ||
      config[key] < min ||
      config[key] > max
    )
      throw new Error(`Invalid ${key}`);
  }
  if (
    !['low', 'medium', 'high', 'auto'].includes(config.quality) ||
    !config.model ||
    !config.apiKeyEnv ||
    !config.templateVersion ||
    !config.families
  )
    throw new Error('Incomplete image API/template configuration');
  if (
    !['constant', 'bands'].includes(config.geometry?.sectionMode) ||
    !config.geometry.defaultThickness
  )
    throw new Error('Invalid geometry configuration');
  if (config.geometry.sectionMode === 'bands') {
    if (
      !config.geometry.sectionBands?.length ||
      config.geometry.sectionBands.some(
        (b, i, all) =>
          !Number.isFinite(b.maxSection) ||
          b.maxSection <= 0 ||
          !b.label ||
          (i > 0 && b.maxSection <= all[i - 1].maxSection)
      )
    )
      throw new Error(
        'Thickness bands require increasing maxSection and labels'
      );
  }
  if (
    typeof config.visualRules?.default?.sectionAffectsVisual !== 'boolean' ||
    !config.visualRules.familyModifiers ||
    !Array.isArray(config.visualRules.nonFamilyAttributes) ||
    !config.visualRules.families
  )
    throw new Error('Invalid visualRules configuration');
  if (
    config.composition &&
    (config.composition.rightEdgeCrop !== true ||
      !(
        config.composition.tiltDegrees > 0 &&
        config.composition.tiltDegrees <= 15
      ) ||
      !(
        config.composition.leftMarginRatio > 0 &&
        config.composition.leftMarginRatio < 0.2
      ) ||
      !(
        config.composition.verticalMarginRatio > 0 &&
        config.composition.verticalMarginRatio < 0.3
      ) ||
      !(
        config.composition.sheathTransitionRatio > 0.3 &&
        config.composition.sheathTransitionRatio < 0.8
      ))
  )
    throw new Error('Invalid catalogue composition');
  for (const rule of [
    config.visualRules.default,
    ...Object.values(config.visualRules.families),
  ])
    if (
      rule.conductorConstruction &&
      !['solid', 'stranded'].includes(rule.conductorConstruction)
    )
      throw new Error('Invalid conductorConstruction visual rule');
  for (const rule of Object.values(config.visualRules.families))
    if (typeof rule.sectionAffectsVisual !== 'boolean')
      throw new Error('Invalid family sectionAffectsVisual');
  for (const key of [
    'minimumTransparentRatio',
    'minimumForegroundRatio',
    'minimumMarginRatio',
  ]) {
    if (!(config.validation?.[key] > 0 && config.validation[key] < 0.5))
      throw new Error(`Invalid validation.${key}`);
  }
  for (const key of [
    'outputDir',
    'metadataDir',
    'groupMetadataDir',
    'manifestFile',
    'colorsFile',
  ])
    config[key] = inside(root, config[key]);
  if (
    !config.outputDir.startsWith(
      `${path.resolve(root, 'public')}${path.sep}`
    ) ||
    config.publicBasePath !==
      `/${relative(path.join(root, 'public'), config.outputDir)}`
  )
    throw new Error('outputDir must match publicBasePath inside public/');
  config.catalogFile = path.resolve(root, config.catalogFile);
  config.referenceImage = config.referenceImage
    ? inside(root, config.referenceImage)
    : null;
  const colorRules = await readJson(config.colorsFile);
  if (!colorRules.version || !colorRules.profiles || !colorRules.skuOverrides)
    throw new Error('Invalid cable color configuration');
  config.styleReferenceHash = config.referenceImage
    ? hashImageData(await fs.readFile(config.referenceImage))
    : null;
  const referenceHash =
    config.imageEndpoint === 'edits' && config.referenceImage
      ? hashImageData(await fs.readFile(config.referenceImage))
      : null;
  return { config, colorRules, referenceHash };
}

export async function loadCableImageProducts(file) {
  const raw = await readJson(file);
  const products = Array.isArray(raw) ? raw : raw?.items;
  if (!Array.isArray(products))
    throw new Error('Catalog must be a product array or {items: []}');
  assertUniqueSkus(products);
  return products;
}

function assertUniqueSkus(products) {
  const seen = new Set();
  for (const p of products) {
    if (!p || typeof p !== 'object')
      throw new Error('Catalog contains an invalid product row');
    const sku = String(p.sku || '').trim();
    if (sku && seen.has(sku))
      throw new Error(`Duplicate SKU in catalog: ${sku}`);
    if (sku) seen.add(sku);
  }
}

async function readMetadata(config) {
  let names;
  try {
    names = await fs.readdir(config.metadataDir);
  } catch (e) {
    if (e.code === 'ENOENT') return new Map();
    throw e;
  }
  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith('.json') &&
        name !== 'generation-state.json' && name !== 'historical-generation-claims.json')
      .map(async (name) => {
        const entry = await readJson(path.join(config.metadataDir, name));
        if (`${entry.sku}.json` !== name || !entry.status)
          throw new Error(`Invalid image metadata: ${name}`);
        return [entry.sku, entry];
      })
  );
  return new Map(entries);
}

async function readManifest(config) {
  const manifest = await readJson(config.manifestFile, {
    schemaVersion: 1,
    bySku: {},
  });
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.bySku ||
    typeof manifest.bySku !== 'object' ||
    Array.isArray(manifest.bySku)
  )
    throw new Error('Invalid generated image manifest');
  return manifest;
}

async function readGroupMetadata(config) {
  const names = await fs.readdir(config.groupMetadataDir).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  const records = new Map();
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const entry = await readJson(path.join(config.groupMetadataDir, name));
    if (
      `${entry.visualKey}.json` !== name ||
      !entry.status ||
      entry.schemaVersion !== 2
    )
      throw new Error(`Invalid visual group metadata: ${name}`);
    records.set(entry.visualKey, entry);
  }
  return records;
}

async function nextOutput(root, job, config) {
  const base = job.visual_key;
  let version = 1;
  let file;
  do {
    file = path.join(
      config.outputDir,
      `${base}${version === 1 ? '' : `-v${version}`}.png`
    );
    version += 1;
  } while (await exists(file));
  return {
    output_filename: relative(root, file),
    public_url: `${config.publicBasePath}/${path.basename(file)}`,
  };
}

function isIndividualImage(value) {
  return (
    typeof value === 'string' &&
    !!value &&
    value !== '/product-placeholder.svg' &&
    !value.startsWith('/category-placeholders/')
  );
}

const groupMember = (job, bindingAllowed, existingImage) => ({
  sku: job.sku,
  product_id: job.product_id,
  source_name: job.source_name,
  product_name: job.product_name,
  section: job.parameters.section,
  groundSection: job.parameters.groundSection,
  product_fingerprint: job.product_fingerprint,
  parameters: job.parameters,
  binding_allowed: bindingAllowed,
  existing_image: existingImage || null,
});

export async function planCableImages({
  root,
  products,
  config,
  colorRules,
  referenceHash,
  options = {},
}) {
  assertUniqueSkus(products);
  const [metadata, groupMetadata, manifest] = await Promise.all([
    readMetadata(config),
    readGroupMetadata(config),
    readManifest(config),
  ]);
  const requested = options.skus?.length ? new Set(options.skus) : null;
  if (requested)
    for (const sku of requested)
      if (!products.some((p) => p.sku === sku))
        throw new Error(`SKU not found in catalog: ${sku}`);
  const grouped = new Map(),
    productJobs = new Map(),
    skipped = [];
  let withoutImages = 0;
  // Parse every row BEFORE selection/limit, so a selected group contains every matching SKU.
  for (const product of products) {
    const individual = options.existingImages?.[product.sku] ?? product.image;
    const visibleImage = isIndividualImage(individual)
      ? individual
      : getHistoricalGeneratedProductImage(product, manifest) || individual;
    if (!isIndividualImage(visibleImage)) withoutImages++;
    let job;
    try {
      job = buildCableImageJob(product, config, colorRules, referenceHash);
    } catch (e) {
      if (!(e instanceof CableImageInputError)) throw e;
      skipped.push({
        sku: product.sku || null,
        name: product.name || product.title,
        reason: e.message,
      });
      continue;
    }
    productJobs.set(job.sku, job);
    const generatedBinding = manifest.bySku[job.sku];
    const ownGeneratedImage = generatedBinding?.image === visibleImage;
    const bindingAllowed =
      !!options.force || !isIndividualImage(visibleImage) || ownGeneratedImage;
    const member = groupMember(job, bindingAllowed, visibleImage);
    const prior = grouped.get(job.visual_key);
    if (prior) {
      if (
        prior.visual_descriptor_hash !== job.visual_descriptor_hash ||
        prior.render_fingerprint !== job.render_fingerprint
      )
        throw new Error(`Visual key collision: ${job.visual_key}`);
      prior.products.push(member);
    } else
      grouped.set(job.visual_key, {
        ...job,
        schemaVersion: 2,
        family: job.parameters.visualFamily,
        cores: job.parameters.cores,
        products: [member],
      });
  }
  const checked = new Map();
  async function checkAsset(entry) {
    if (!entry.output_filename) throw new Error('Missing cached output path');
    if (!checked.has(entry.output_filename)) {
      const file = inside(root, entry.output_filename);
      if (!file.startsWith(`${config.outputDir}${path.sep}`))
        throw new Error('Cached image outside configured output directory');
      checked.set(
        entry.output_filename,
        validateCableImagePng(await fs.readFile(file), config)
      );
    }
    const validation = checked.get(entry.output_filename);
    if (validation.sha256 !== entry.validation?.sha256)
      throw new Error('Cached image checksum mismatch');
    if (
      entry.public_url !==
      `${config.publicBasePath}/${path.basename(entry.output_filename)}`
    )
      throw new Error('Cached public path mismatch');
    return validation;
  }
  // Only exact, current legacy configurations can seed the new group cache.
  // This recognizes the approved pilot without modifying its metadata in a dry-run.
  const legacyByGroup = new Map(),
    staleLegacyGroups = new Set();
  for (const entry of metadata.values()) {
    if (entry.schemaVersion === 2) continue;
    const live = productJobs.get(entry.sku);
    if (!live || entry.product_fingerprint !== live.product_fingerprint)
      continue;
    let legacyCompatible = false;
    if (
      config.preserveApprovedVisuals &&
      entry.status === 'approved' &&
      entry.parameters &&
      hashImageData(entry.prompt) === entry.prompt_hash
    ) {
      try {
        const actualVisual = getCableVisualConfig(
          entry.parameters,
          config,
          colorRules
        );
        const originalFingerprint = hashImageData({
          prompt: entry.prompt,
          referenceHash: entry.reference_hash,
          model: entry.requested_api_model || entry.model,
          size: entry.size,
          quality: entry.quality,
          format: entry.format,
          background: 'transparent',
        });
        legacyCompatible =
          actualVisual.descriptorHash === live.visual_descriptor_hash &&
          originalFingerprint === entry.visual_key;
      } catch {
        /* Unknown historic construction is never automatically transferred. */
      }
    }
    if (
      !legacyCompatible &&
      (entry.visual_key !== live.legacy_render_fingerprint ||
        hashImageData(entry.prompt) !== entry.prompt_hash)
    ) {
      staleLegacyGroups.add(live.visual_key);
      continue;
    }
    if (!legacyByGroup.has(live.visual_key) || entry.status === 'approved')
      legacyByGroup.set(live.visual_key, entry);
  }
  let groups = [...grouped.values()];
  for (const group of groups) {
    const stored = groupMetadata.get(group.visual_key);
    const legacy = stored ? null : legacyByGroup.get(group.visual_key);
    const cached = stored || legacy;
    group.expected_output_filename = relative(
      root,
      path.join(config.outputDir, `${group.visual_key}.png`)
    );
    group.products.sort((a, b) => a.sku.localeCompare(b.sku, 'en'));
    group.generation_required = false;
    group.existing_image = false;
    if (!options.force && cached) {
      if (
        stored &&
        (stored.visual_descriptor_hash !== group.visual_descriptor_hash ||
          (stored.render_fingerprint !== group.render_fingerprint &&
            !(config.preserveApprovedVisuals && stored.status === 'approved')))
      ) {
        group.action = 'blocked';
        group.reason = 'changed_template_requires_force';
      } else if (!['approved', 'needs_review'].includes(cached.status)) {
        group.action = 'blocked';
        group.reason = `${cached.status}_requires_force`;
      } else {
        try {
          const validation = await checkAsset(cached);
          group.existing_image = true;
          group.output_filename = cached.output_filename;
          group.public_url = cached.public_url;
          group.cache = {
            status: cached.status,
            validation,
            render_fingerprint: cached.render_fingerprint || cached.visual_key,
            template_version: cached.template_version,
            reference_hash: cached.reference_hash,
            composition: cached.composition || { rightEdgeCrop: false },
            style_reference: cached.style_reference,
            retained_existing_style:
              cached.template_version !== config.templateVersion,
            visual_review: cached.visual_review,
            provider: cached.provider,
            model: cached.model,
            prompt: cached.prompt,
            prompt_hash: cached.prompt_hash,
            created_at: cached.created_at,
            revised_prompt: cached.revised_prompt,
            api_request_id: cached.api_request_id,
            requested_api_model: cached.requested_api_model,
            source_validation: cached.source_validation,
            normalization: cached.normalization,
            http_status: cached.http_status,
            api_usage: cached.api_usage,
            attempts: cached.attempts,
          };
          if (legacy) group.reused_from = legacy.sku;
          group.legacy_asset = !!legacy;
          if (cached.status === 'needs_review') {
            group.action = 'await_review';
            group.reason = 'already_generated_needs_review';
          } else {
            const needsBindings = group.products.some(
              (p) =>
                p.binding_allowed &&
                (manifest.bySku[p.sku]?.image !== group.public_url ||
                  manifest.bySku[p.sku]?.visualKey !== group.visual_key ||
                  manifest.bySku[p.sku]?.section !== p.section ||
                  manifest.bySku[p.sku]?.sourceName !== p.source_name ||
                  manifest.bySku[p.sku]?.productId !== p.product_id)
            );
            group.action = needsBindings ? 'reuse' : 'preserve';
            group.reason = needsBindings
              ? 'approved_group_image'
              : 'already_approved';
          }
        } catch {
          group.action = 'blocked';
          group.reason = 'cached_asset_invalid_requires_force';
        }
      }
    } else if (!options.force && staleLegacyGroups.has(group.visual_key)) {
      group.action = 'blocked';
      group.reason = 'changed_template_requires_force';
    } else if (
      !options.force &&
      !group.products.some((p) => p.binding_allowed)
    ) {
      group.action = 'preserve';
      group.reason = 'existing_product_image';
    } else if (
      !options.force &&
      (await exists(path.join(config.outputDir, `${group.visual_key}.png`)))
    ) {
      group.action = 'blocked';
      group.reason = 'orphan_asset_requires_force';
    } else {
      group.action = 'generate';
      group.generation_required = true;
      Object.assign(group, await nextOutput(root, group, config));
    }
    group.image = group.output_filename
      ? path.basename(group.output_filename)
      : null;
    group.sku_count = group.products.length;
    group.skus_without_images = group.products.filter(
      (p) => !isIndividualImage(p.existing_image)
    ).length;
  }
  const allGroups = groups;
  if (requested)
    groups = groups.filter((g) => g.products.some((p) => requested.has(p.sku)));
  if (options.sort === 'stock') {
    const stockBySku = new Map(
      products.map((p) => [p.sku, Number(p.stock || 0)])
    );
    groups.sort(
      (a, b) =>
        Math.max(...b.products.map((p) => stockBySku.get(p.sku))) -
          Math.max(...a.products.map((p) => stockBySku.get(p.sku))) ||
        a.visual_key.localeCompare(b.visual_key)
    );
  } else groups.sort((a, b) => a.visual_key.localeCompare(b.visual_key, 'en'));
  if (options.limit) groups = groups.slice(0, options.limit);
  const jobs = groups.filter((g) => ['generate', 'reuse'].includes(g.action));
  for (const group of groups.filter(
    (g) => !['generate', 'reuse'].includes(g.action)
  ))
    for (const p of group.products)
      skipped.push({
        sku: p.sku,
        name: p.source_name,
        reason: group.reason,
        visualKey: group.visual_key,
      });
  const generate = jobs.filter((g) => g.action === 'generate').length;
  // A saved dry-run authorizes this exact scope/settings/cache state for a later explicit run.
  const planId = hashImageData({
    schemaVersion: 2,
    config: {
      provider: config.provider,
      apiBaseUrl: config.apiBaseUrl,
      imageEndpoint: config.imageEndpoint,
      normalization: config.normalization,
      preserveApprovedVisuals: !!config.preserveApprovedVisuals,
      composition: config.composition,
      model: config.model,
      referenceHash,
      outputDir: config.outputDir,
      metadataDir: config.metadataDir,
      groupMetadataDir: config.groupMetadataDir,
      manifestFile: config.manifestFile,
      retries: config.retries,
      validation: config.validation,
    },
    force: !!options.force,
    groups: groups.map((g) => ({
      key: g.visual_key,
      render: g.render_fingerprint,
      action: g.action,
      output: g.output_filename,
      checksum: g.cache?.validation.sha256,
      products: g.products.map((p) => [
        p.sku,
        p.product_fingerprint,
        p.binding_allowed,
        p.existing_image,
      ]),
    })),
  });
  return {
    schemaVersion: 2,
    planId,
    groups,
    jobs,
    skipped,
    summary: {
      total_skus: products.length,
      skus_without_images: withoutImages,
      parsed_skus: productJobs.size,
      unsupported_skus: products.length - productJobs.size,
      unique_visual_groups: allGroups.length,
      selected_visual_groups: groups.length,
      selected_skus: groups.reduce((n, g) => n + g.products.length, 0),
      existing_group_images: groups.filter((g) => g.existing_image).length,
      new_images_required: generate,
      api_requests_planned: generate,
      maximum_api_attempts: generate * (config.retries + 1),
      api_requests_executed: 0,
      blocked_groups: groups.filter((g) => g.action === 'blocked').length,
      pending_review_groups: groups.filter((g) => g.action === 'await_review')
        .length,
      selected: jobs.length,
      generate,
      reuse: jobs.filter((g) => g.action === 'reuse').length,
      skipped: skipped.length,
    },
  };
}
