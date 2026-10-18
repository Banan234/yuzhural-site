import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { validateCableImagePng } from './cableImagePng.js';
import {
  createImageProvider,
  ImageProviderError,
} from './cableImageProvider.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
async function optional(file) {
  try {
    return await read(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function writeProductionJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
const safeKey = (key) => /^[a-z0-9][a-z0-9_-]{0,219}$/u.test(key);

/** Frozen approved visualProfile, never the older six-family SKU parser. */
export function buildVisualProfilePrompt(profile) {
  const p = profile;
  if (
    !Number.isInteger(p.cores) ||
    p.cores < 1 ||
    p.coreColors?.length !== p.cores ||
    !['solid', 'stranded'].includes(p.conductorConstruction) ||
    !['round', 'flat', 'twisted-bundle'].includes(p.geometry) ||
    !['copper', 'aluminium'].includes(p.conductorMaterial) ||
    typeof p.hasOuterJacket !== 'boolean' ||
    typeof p.armor !== 'boolean' ||
    typeof p.shield !== 'boolean'
  )
    throw new Error('Incomplete approved visualProfile');
  const metal =
    p.conductorMaterial === 'aluminium' ? 'silvery aluminium' : 'copper';
  const colors = p.coreColors
    .map(
      (c, i) =>
        `${i + 1}: ${c === 'yellow-green' ? 'yellow-and-green striped insulation on ONE wire' : c}`
    )
    .join('; ');
  const lines = [
    'Use case: product-mockup. One standardized realistic professional 3D product render for an electrical cable catalogue. Realistic materials, matte polymers, moderate natural metal highlights, soft neutral studio lighting. Keep the established compact catalogue scale and shallow three-quarter camera.',
    `Exact visual family: ${p.family}. Product type: ${p.productType}. Geometry: ${p.geometry}.`,
    'Orientation: the intact product body is on the RIGHT, the stripped ends and exposed metal tips point LEFT. A natural gentle 8-degree diagonal rises toward the RIGHT. Maintain generous transparent breathing room above and below. The object is positioned slightly to the right of center. Keep a normal free left margin and every stripped tip fully visible. Do not enlarge or thicken the object to reach the right border. Preserve a relaxed catalogue composition and gentle separation of cores.',
    p.hasOuterJacket
      ? `The common outer jacket is ${p.outerJacket}. It surrounds all ${p.cores} insulated cores on the RIGHT and opens into a short stepped cutaway toward the LEFT. The intact jacket may continue out of the right frame, while the stripped LEFT tips remain fully visible. No right-facing cut end. Keep the established moderate body thickness and compact fan of cores.`
      : p.geometry === 'twisted-bundle'
        ? `Self-supporting bundle of exactly ${p.cores} individually insulated wires twisted together on the RIGHT. NO common outer sheath or jacket. The twisted wires separate gently toward the LEFT. Do not turn this into a jacketed multicore cable.`
        : 'A single insulated installation wire: exactly ONE layer of colored insulation around its conductor. NO common outer jacket, NO additional black sheath, NO nested multicore cable. Insulated body on the RIGHT, one stripped metal tip on the LEFT.',
    `Exactly ${p.cores} insulated conductors and exactly ${p.cores} exposed ${metal} tips. No extra insulated wires. Each metal strand inside a stranded conductor is part of that same core, not another insulated conductor.`,
    `Assign precisely these colors to the ${p.cores} insulated conductors: ${colors}. A yellow-green stripe never means two separate wires. Blue remains blue. Do not add a PE or neutral core beyond this exact list.`,
    p.conductorConstruction === 'solid'
      ? `Solid-core ${metal}: ONE continuous smooth solid circular metal rod inside each insulated core. Each left tip has a single solid cross-section. No bundles of thin strands or brushes.`
      : `Stranded ${metal}: each insulated core contains ONE compact neat bundle of fine ${metal} strands. Show the bundle at each left tip, with a tidy circular cross-section. No solid rods and no loose brush of long strands.`,
    p.geometry === 'flat'
      ? 'The product is genuinely FLAT: flattened outer profile and cores arranged side by side in a single row. Do not render a round cable.'
      : '',
    p.armor
      ? `Visible armor: ${p.armorType === 'steel-tapes' ? 'two overlapping helically wrapped STEEL TAPES' : 'a ring of helically laid STEEL WIRES'}. Reveal this distinct metallic protective layer in a restrained stepped cutaway UNDER the outer jacket and OUTSIDE the insulated core assembly. Steel armor is not a copper braid or an extra insulated core.`
      : 'No armor layer.',
    p.shield
      ? `Visible overall screen: ${p.shieldType === 'overall-foil-with-drain' ? 'a thin metallic FOIL wrapping around the insulated core assembly, plus ONE thin bare drain wire beside the foil' : 'a thin continuous COPPER TAPE screen around the insulated core assembly'}. Reveal the screen as its own thin layer under the outer protection. This is an OVERALL screen, not separate screens on each core. The drain, when specified, is bare and does not increase the insulated core count.`
      : 'No metallic shield and no drain wire.',
    p.specialElements?.includes('fire-barrier')
      ? 'Fire-resistant construction: show a restrained thin pale mica fire-barrier tape wrapping around each conductor under its colored insulation at the stepped cutaway. Keep the same exact insulated core count.'
      : '',
    'Nominal cross-section is product metadata only. Use uniform qualitative catalogue thickness within this visual group; do not calculate physical diameters. Preserve the family-specific visible layers above.',
    'Genuinely transparent PNG with real alpha. No opaque backdrop, painted checkerboard, floor, background shadow, halo or scenery. No text, markings, numbers, labels, logos, dimensions, watermark or other objects. Do not mirror the composition.',
    `Final construction check: ${p.cores} insulated cores, ${p.conductorConstruction} ${metal}, ${p.geometry}, common jacket ${p.hasOuterJacket ? 'present' : 'absent'}, armor ${p.armor ? p.armorType : 'absent'}, screen ${p.shield ? p.shieldType : 'absent'}.`,
  ];
  return lines.filter(Boolean).join('\n\n');
}

export function makeProductionPlan(audit, products, renderConfig) {
  const ready = audit.groups.filter(
    (g) => g.visualClassification === 'AUTO_APPROVED'
  );
  const missing = ready.filter((g) => g.imageStatus === 'MISSING');
  const reuse = ready.filter((g) => g.imageStatus === 'REUSE');
  const rows = new Map(audit.rows.map((r) => [r.sku, r]));
  const catalog = new Map(products.map((p) => [p.sku, p]));
  if (
    products.length !== 5708 ||
    missing.length !== 446 ||
    reuse.length !== 119 ||
    missing.reduce((n, g) => n + g.autoApprovedSkus.length, 0) !== 1307 ||
    reuse.reduce((n, g) => n + g.autoApprovedSkus.length, 0) !== 570 ||
    audit.needsReview.length !== 3831
  )
    throw new Error(
      'Approved scope must be exactly 446 MISSING / 119 REUSE / 1877 eligible / 3831 review'
    );
  const used = new Set();
  const groups = ready.map((g) => {
    if (!safeKey(g.visualKey) || !['MISSING', 'REUSE'].includes(g.imageStatus))
      throw new Error('Invalid production group');
    const members = g.autoApprovedSkus.map((sku) => {
      const row = rows.get(sku),
        product = catalog.get(sku);
      if (
        !row ||
        !product ||
        row.visualClassification !== 'AUTO_APPROVED' ||
        row.visualKey !== g.visualKey ||
        used.has(sku)
      )
        throw new Error(
          'Production SKU is duplicated or outside approved scope'
        );
      used.add(sku);
      return {
        sku,
        productId: product.id,
        sourceName: product.sourceName,
        productName: product.name,
        primaryCores: row.primaryCores,
        cores: row.cores,
        section: row.section,
        auxiliaryCores: row.auxiliaryCores,
        auxiliarySection: row.auxiliarySection,
        sectionUnit: row.sectionUnit,
        hasPE: row.hasPE,
        hasN: row.hasN,
        technicalProfile: row.technicalProfile,
        illustrationDefaults: row.illustrationDefaults,
        productHash: hash(JSON.stringify(product)),
      };
    });
    const prompt = buildVisualProfilePrompt(g.visualProfile);
    const image =
      g.imageStatus === 'REUSE'
        ? g.proposedImage
        : `/product-images/generated/pr1_${g.visualKey}.png`;
    if (
      typeof image !== 'string' ||
      !/^\/product-images\/generated\/[a-zA-Z0-9_-]+\.png$/u.test(image)
    )
      throw new Error('Unsafe production image path');
    const asset = audit.existingAssets.find((a) => a.image === image);
    if (g.imageStatus === 'REUSE' && (!asset || asset.integrity !== 'verified'))
      throw new Error('REUSE image is not a verified approved asset');
    return {
      visualKey: g.visualKey,
      action: g.imageStatus,
      image,
      visualProfile: g.visualProfile,
      prompt,
      promptHash: hash(prompt),
      expectedSha256: asset?.sha256 || null,
      members,
    };
  });
  if (audit.needsReview.some((r) => used.has(r.sku)))
    throw new Error('NEEDS_REVIEW entered the production queue');
  const plan = {
    schemaVersion: 1,
    scope: 'approved-production-stage-1',
    sourceAuditFingerprint: audit.auditFingerprint,
    catalogSha256: audit.integrity.after[audit.catalogFile],
    renderConfig,
    counts: { missing: 446, reuse: 119, eligible: 1877, needsReview: 3831 },
    reviewSkus: audit.needsReview.map((r) => r.sku),
    groups,
  };
  return { ...plan, planId: hash(JSON.stringify(plan)) };
}

export function productionSummary(plan, manifest, qualityRejections = {}) {
  const records = Object.values(manifest.groups).map((record) =>
    qualityRejections[record.visualKey]
      ? {
          ...record,
          bound: false,
          status: 'failed',
          qualityRejected: true,
          error: qualityRejections[record.visualKey].reason,
        }
      : record
  );
  const completed = records.filter((r) => r.bound);
  const reused = completed.filter((r) => r.action === 'REUSE');
  const generated = completed.filter((r) => r.action === 'MISSING');
  return {
    updatedAt: now(),
    planId: plan.planId,
    reuseExisting: {
      visualKeys: reused.length,
      products: reused.reduce((n, r) => n + r.skuCount, 0),
    },
    generated: {
      visualKeys: generated.length,
      products: generated.reduce((n, r) => n + r.skuCount, 0),
    },
    decodedNewPngReceived: records.filter(
      (r) => r.action === 'MISSING' && r.validation
    ).length,
    failed: records
      .filter((r) => r.status === 'failed')
      .map((r) => ({
        visualKey: r.visualKey,
        reason: r.error,
        image: r.image || null,
      })),
    skippedCache: manifest.skippedCache || 0,
    apiRequests: manifest.apiRequests,
    productsWithIllustrations: completed.reduce((n, r) => n + r.skuCount, 0),
    needsReviewUntouched: plan.reviewSkus.length,
    pending:
      plan.groups.length -
      completed.length -
      records.filter((r) => r.status === 'failed').length,
  };
}

async function productionLock(file) {
  try {
    return await fs.open(file, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  // Serialize stale-lock recovery so two resuming processes cannot remove a
  // newly acquired writer's lock. Never reclaim a foreign host or live PID.
  const recoveryFile = `${file}.recovery`;
  const recovery = await fs.open(recoveryFile, 'wx');
  try {
    const owner = await optional(file);
    if (owner) {
      if (
        owner.host !== hostname() ||
        !Number.isInteger(owner.pid) ||
        owner.pid < 1
      )
        throw new Error('Image pipeline lock owner cannot be safely verified');
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') alive = false;
        else throw error;
      }
      if (alive)
        throw new Error('Another image pipeline process is still running');
      await fs.rm(file);
    }
    return await fs.open(file, 'wx');
  } finally {
    await recovery.close();
    await fs.rm(recoveryFile, { force: true });
  }
}

/** One lock shared with the old pipeline; atomic checkpoints and serialized SKU binding. */
export async function runVisualProduction({
  root,
  plan,
  config,
  provider,
  stateDir,
  onProgress = () => {},
}) {
  const lockFile = path.join(config.metadataDir, '.pipeline.lock');
  await fs.mkdir(config.metadataDir, { recursive: true });
  const lock = await productionLock(lockFile);
  await lock.writeFile(
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      created_at: now(),
      planId: plan.planId,
    })
  );
  let saveChain = Promise.resolve();
  const serial = (fn) => {
    const result = saveChain.then(fn);
    saveChain = result.catch(() => {});
    return result;
  };
  const manifestFile = path.join(stateDir, 'manifest.json');
  const metadataFile = (g) =>
    path.join(stateDir, 'groups', `${g.visualKey}.json`);
  const imageFile = (g) => path.join(root, 'public', g.image.slice(1));
  let manifest;
  const save = async () => {
    manifest.updatedAt = now();
    await writeProductionJson(manifestFile, manifest);
  };
  const checkCatalog = async () => {
    if (hash(await fs.readFile(config.catalogFile)) !== plan.catalogSha256)
      throw new Error(
        'Catalog changed since the approved dry-run; production scope is frozen'
      );
  };
  async function bind(group, record) {
    await serial(async () => {
      await checkCatalog();
      const binding = await read(config.manifestFile);
      for (const member of group.members) {
        const previous = binding.bySku[member.sku];
        if (previous && previous.image !== group.image)
          throw new Error(
            'Existing approved SKU image conflicts with the frozen plan'
          );
        binding.bySku[member.sku] = {
          ...previous,
          image: group.image,
          status: 'approved',
          kind: 'generated-illustration',
          productId: member.productId,
          sourceName: member.sourceName,
          productName: member.productName,
          primaryCores: member.primaryCores,
          cores: member.cores,
          section: member.section,
          auxiliaryCores: member.auxiliaryCores,
          auxiliarySection: member.auxiliarySection,
          family: group.visualProfile.family,
          sectionAffectsVisual: !!group.visualProfile.sectionKey,
          colors: group.visualProfile.coreColors,
          visualKey: group.visualKey,
          sha256: record.validation.sha256,
          productionPlanId: plan.planId,
        };
      }
      await writeProductionJson(config.manifestFile, binding);
      record.bound = true;
      record.status = group.action === 'REUSE' ? 'reused' : 'generated';
      record.updatedAt = now();
      manifest.groups[group.visualKey] = record;
      await save();
    });
  }
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await checkCatalog();
    manifest = (await optional(manifestFile)) || {
      schemaVersion: 1,
      planId: plan.planId,
      createdAt: now(),
      apiRequests: 0,
      skippedCache: 0,
      groups: {},
    };
    if (manifest.planId !== plan.planId)
      throw new Error('Production manifest belongs to another frozen plan');
    if (!(await optional(path.join(stateDir, 'baseline-bindings.json'))))
      await writeProductionJson(
        path.join(stateDir, 'baseline-bindings.json'),
        await read(config.manifestFile)
      );
    await save();
    const generator = provider || createImageProvider(config);
    let next = 0;
    async function worker() {
      while (next < plan.groups.length) {
        const group = plan.groups[next++];
        const key = group.visualKey;
        let record = manifest.groups[key] || {
          visualKey: key,
          action: group.action,
          skuCount: group.members.length,
          status: 'queued',
          attempts: 0,
          bound: false,
        };
        try {
          if (record.qualityRejected) {
            onProgress({ visualKey: key, status: 'failed', cache: true });
            continue;
          }
          const exists = await fs.stat(imageFile(group)).then(
            () => true,
            (error) => {
              if (error.code === 'ENOENT') return false;
              throw error;
            }
          );
          const metadata = await optional(metadataFile(group));
          if (exists) {
            const validation = validateCableImagePng(
              await fs.readFile(imageFile(group)),
              config
            );
            const expected =
              group.expectedSha256 ||
              metadata?.validation?.sha256 ||
              record.validation?.sha256;
            if (expected && validation.sha256 !== expected)
              throw new Error('Cached image SHA-256 mismatch; no regeneration');
            if (group.action === 'MISSING' && !metadata && !record.attempts)
              throw new Error(
                'Untracked image at deterministic output path; no regeneration'
              );
            if (
              !validation.has_transparency ||
              validation.transparent_ratio < 0.15 ||
              validation.foreground_ratio < 0.01
            )
              throw new Error(
                'Cached PNG has no usable transparency or visible product; no regeneration'
              );
            record = {
              ...record,
              validation,
              image: group.image,
              recovered: !record.bound,
            };
            if (!metadata)
              await writeProductionJson(metadataFile(group), {
                ...group,
                ...record,
                planId: plan.planId,
                recoveredAt: now(),
              });
            await serial(async () => {
              manifest.skippedCache++;
              await save();
            });
            await bind(group, record);
            onProgress({
              visualKey: key,
              status: record.status,
              cache: true,
              summary: productionSummary(plan, manifest),
            });
            continue;
          }
          if (group.action === 'REUSE')
            throw new Error('Approved REUSE image is missing; no regeneration');
          // A missing completed/in-flight output is never silently charged again on resume.
          if (record.status === 'failed') {
            onProgress({ visualKey: key, status: 'failed', cache: true });
            continue;
          }
          if (record.attempts || record.bound)
            throw new Error(
              'Interrupted request or missing completed output; outcome unknown, no duplicate request'
            );
          await checkCatalog();
          const binding = await read(config.manifestFile);
          if (Object.values(binding.bySku).some((e) => e.visualKey === key))
            throw new Error(
              'visualKey already has a catalog binding; missing output requires review, no API request'
            );
          record.status = 'generating';
          record.startedAt = now();
          await serial(async () => {
            manifest.groups[key] = record;
            await save();
          });
          const result = await generator.generate(
            { prompt: group.prompt },
            {
              onAttempt: async () => {
                await serial(async () => {
                  record.attempts++;
                  manifest.apiRequests++;
                  manifest.groups[key] = record;
                  await save();
                });
              },
            }
          );
          // Persist original bytes before decoding: validation failures never trigger another charge.
          await fs.mkdir(path.dirname(imageFile(group)), { recursive: true });
          const temp = `${imageFile(group)}.${randomUUID()}.tmp`;
          try {
            await fs.writeFile(temp, result.buffer, { flag: 'wx' });
            await fs.rename(temp, imageFile(group));
          } finally {
            await fs.rm(temp, { force: true });
          }
          const validation = validateCableImagePng(result.buffer, config);
          if (
            !validation.has_transparency ||
            validation.transparent_ratio < 0.15 ||
            validation.foreground_ratio < 0.01
          )
            throw new Error(
              'PNG has no usable transparent background or visible product'
            );
          record = {
            ...record,
            status: 'generated',
            image: group.image,
            validation,
            httpStatus: result.httpStatus,
            provider: result.provider,
            model: result.model,
            requestId: result.requestId,
            generatedAt: now(),
          };
          await writeProductionJson(metadataFile(group), {
            ...group,
            ...record,
            planId: plan.planId,
            renderConfig: plan.renderConfig,
            visualReview: 'pending-final-sample-check',
            apiUsage: result.usage,
            revisedPrompt: result.revisedPrompt,
          });
          await serial(async () => {
            manifest.groups[key] = record;
            await save();
          });
          await bind(group, record);
          onProgress({
            visualKey: key,
            status: 'generated',
            httpStatus: record.httpStatus,
            summary: productionSummary(plan, manifest),
          });
        } catch (error) {
          const reason =
            error instanceof ImageProviderError
              ? error.message
              : /PNG|Cached|cache|Catalog changed|Existing approved|Interrupted request|visualKey already|Approved REUSE|Untracked/u.test(
                    error.message
                  )
                ? error.message
                : 'Storage or production validation failed; inspect saved checkpoint';
          record = {
            ...record,
            status: 'failed',
            bound: false,
            error: reason,
            httpStatus: error.httpStatus || record.httpStatus || null,
            updatedAt: now(),
          };
          await serial(async () => {
            manifest.groups[key] = record;
            await save();
          });
          onProgress({
            visualKey: key,
            status: 'failed',
            error: reason,
            summary: productionSummary(plan, manifest),
          });
        }
      }
    }
    const workers = await Promise.allSettled(
      Array.from({ length: config.concurrency }, worker)
    );
    if (workers.some((r) => r.status === 'rejected'))
      throw new Error('Production storage worker failed; checkpoints retained');
    return productionSummary(plan, manifest);
  } finally {
    await saveChain;
    await lock.close();
    await fs.rm(lockFile, { force: true });
  }
}
