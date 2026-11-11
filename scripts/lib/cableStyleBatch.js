import {
  archiveApprovedCableResult,
  findApprovedCableResult,
} from './cableApprovedResults.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  loadCableImageStyle,
  prepareCableStyleRequest,
  generateCableStyleDraft,
} from './cableImageStyle.js';
import { validateCableImagePng } from './cableImagePng.js';
import { CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';
import { approvedCableImagePath, getCatalogPhoto, getGeneratedProductImage } from '../../shared/productImages.js';
import { acquirePriceImportLock } from './importLock.js';
import { commitArtifactBatch } from './artifactTransaction.js';
import { rebuildCatalogImagePages } from './rebuildCatalogImagePages.js';
export const digest = (value) =>
  createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value)
    )
    .digest('hex');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const optional = async (file) => {
  try {
    return await read(file);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};
const atomic = async (file, value) => {
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(temp, file);
};
const normalized = (s) =>
  String(s || '')
    .replace(/\s+/gu, ' ')
    .trim();
/** A known generated binding is replaceable; unknown/manual provenance is protected. */
export function imageDisposition(product, visible, binding, overrides = {}) {
  const names = [
    product.name,
    product.sourceName,
    product.fullName,
    visible?.title,
    visible?.name,
  ].map(normalized);
  const explicit =
    Object.entries(overrides.overrides || {}).some(
      ([name, value]) => getCatalogPhoto(value?.image) && names.includes(normalized(name))
    ) ||
    (overrides.matchers || []).some(
      (m) =>
        getCatalogPhoto(m.image) &&
        normalized(m.mark).replaceAll(' ', '').toUpperCase() ===
          normalized(product.mark).replaceAll(' ', '').toUpperCase()
    );
  if (explicit || getCatalogPhoto(product.image))
    return { protected: true, reason: 'manual/raw image override' };
  if (binding && binding.kind !== 'generated-illustration')
    return {
      protected: true,
      reason: 'binding provenance is not generated illustration',
    };
  const image = visible?.image || product.image || '';
  if (
    getCatalogPhoto(image) &&
    !(binding?.kind === 'generated-illustration' && binding.image === image)
  )
    return {
      protected: true,
      reason: 'visible image has manual/unknown provenance',
    };
  return {
    protected: false,
    image: image || null,
    oldGenerated: binding?.kind === 'generated-illustration' ? binding : null,
  };
}
export async function planCableStyleBatch({
  root,
  products,
  visibleProducts,
  bindings,
  overrides,
  context,
  cacheDir,
}) {
  const style = await loadCableImageStyle(root),
    visible = new Map(visibleProducts.map((p) => [p.sku, p])),
    groups = new Map(),
    rows = [];
  const bySku = new Map(products.map(product => [product.sku, product]));
  for (const p of products) {
    const classified = classifyPracticalCableVisualProduct(p, context),
      disposition = imageDisposition(
        p,
        visible.get(p.sku),
        bindings.bySku?.[p.sku],
        overrides
      );
    let reason = null,
      request = null;
    if (
      classified.visualClassification !== 'AUTO_APPROVED' ||
      classified.visualProfile.visualizationType === 'NEEDS_REVIEW'
    )
      reason =
        classified.issues.map((i) => i.message).join('; ') ||
        classified.visualization.reasons.map((i) => i.message).join('; ');
    const row = {
      sku: p.sku,
      name: p.name,
      sourceName: p.sourceName,
      id: p.id,
      slug: p.slug,
      section: p.crossSection,
      primaryCores: p.cores,
      visualKey: classified.visualKey,
      visualizationType: classified.visualProfile.visualizationType,
      productHash: digest(p),
      oldBinding: bindings.bySku?.[p.sku] || null,
      disposition,
      reason,
    };
    let g = groups.get(row.visualKey);
    if (!g) {
      g = {
        visualKey: row.visualKey,
        profile: classified.visualProfile,
        members: [],
        eligibleSkus: [],
        status: 'NEEDS_REVIEW',
        reasons: [],
        request: null,
      };
      groups.set(row.visualKey, g);
    }
    if (!reason && !disposition.protected) {
      try {
        request =
          g.request ||
          (await prepareCableStyleRequest(root, classified.visualProfile));
      } catch (e) {
        reason = e.message;
      }
    }
    row.reason = reason;
    row.status = disposition.protected
      ? 'PROTECTED'
      : reason
        ? 'NEEDS_REVIEW'
        : disposition.oldGenerated
          ? 'REPLACE_LEGACY'
          : 'GENERATE_MISSING';
    g.members.push(row);
    if (reason) g.reasons.push(reason);
    if (!reason && !disposition.protected) {
      g.eligibleSkus.push(p.sku);
      g.request = request;
      g.status = 'READY';
    }
    rows.push(row);
  }
  const batch = [...groups.values()];
  for (const g of batch) {
    g.reasons = [...new Set(g.reasons)];
    g.profileHash = digest(g.profile);
    g.draftKey = digest({
      visualKey: g.visualKey,
      standard: style.version,
      request: g.request?.prompt,
      reference: g.request?.reference.sha256,
    });
    if (g.status === 'READY') {
      const approved = await findApprovedCableResult({
        root,
        visualKey: g.visualKey,
        profile: g.profile,
        request: g.request,
      });
      if (approved) {
        g.status = 'APPROVED_DRAFT_NOT_PUBLISHED';
        g.approvedDraftDir = approved.absoluteDraftDir;
        g.approvedSha256 = approved.sha256;
        const registry = { byVisualKey: { [g.visualKey]: approved } };
        for (const member of g.members) {
          const product = bySku.get(member.sku);
          const image = getGeneratedProductImage(product, bindings, registry);
          if (!image) continue;
          const bytes = await fs.readFile(path.join(root, 'public', image.slice(1))).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
          if (bytes && digest(bytes) === approved.sha256) {
            g.status = 'EXISTING_STANDARD_APPROVED';
            g.approvedImage = image;
            break;
          }
        }
      }
    }
    if (g.status === 'READY' && cacheDir) {
      const record = await optional(
        path.join(cacheDir, g.draftKey, 'review.json')
      );
      const claim = await optional(
        path.join(cacheDir, g.draftKey, 'request.json')
      );
      let image;
      try {
        image = await fs.readFile(path.join(cacheDir, g.draftKey, 'image.png'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (image) {
        try {
          validateCableImagePng(image, {
            background: 'transparent',
            composition: { rightEdgeCrop: false },
          });
          const approval = await optional(
            path.join(cacheDir, g.draftKey, 'approval.json')
          );
          const manuallyApproved =
            approval?.status === 'APPROVED' &&
            approval.standardVersion === style.version &&
            approval.visualKey === g.visualKey &&
            approval.sha256 === digest(image) &&
            approval.reviewer &&
            CABLE_STYLE_REVIEW_CHECKS.every(
              (k) => approval.checks?.[k] === true
            );
          g.status = manuallyApproved
            ? 'APPROVED_DRAFT_NOT_PUBLISHED'
            : 'CACHED_NEEDS_REVIEW';
          g.cachedSha256 = digest(image);
        } catch {
          g.status = 'FAILED_CACHED';
        }
      } else if (record || claim)
        g.status =
          record?.status === 'FAILED'
            ? 'FAILED_CACHED'
            : 'REQUEST_OUTCOME_UNKNOWN';
    }
  }
  const ready = batch.filter((g) => g.status === 'READY');
  const buckets = [
    'SIMPLE',
    'MULTICORE',
    'LAYERED',
    'MULTICORE + LAYERED',
    'NEEDS_REVIEW',
  ].map((type) => ({
    type,
    products: rows.filter((r) => r.visualizationType === type).length,
    visualKeys: batch.filter((g) => g.profile.visualizationType === type)
      .length,
    readyRequests: ready.filter((g) => g.profile.visualizationType === type)
      .length,
  }));
  const summary = {
    products: products.length,
    visualKeys: batch.length,
    types: buckets,
    needsReviewProducts: rows.filter((r) => r.status === 'NEEDS_REVIEW').length,
    protectedProducts: rows.filter((r) => r.status === 'PROTECTED').length,
    eligibleProducts: rows.filter((r) =>
      ['GENERATE_MISSING', 'REPLACE_LEGACY'].includes(r.status)
    ).length,
    legacyReplacementProducts: rows.filter((r) => r.status === 'REPLACE_LEGACY')
      .length,
    missingProducts: rows.filter((r) => r.status === 'GENERATE_MISSING').length,
    existingGeneratedBindings: products.filter(
      (p) => bindings.bySku?.[p.sku]?.kind === 'generated-illustration'
    ).length,
    existingGeneratedImages: new Set(
      products.flatMap((p) =>
        bindings.bySku?.[p.sku]?.kind === 'generated-illustration'
          ? [bindings.bySku[p.sku].image]
          : []
      )
    ).size,
    readyVisualKeys: ready.length,
    replacementVisualKeys: ready.filter((g) =>
      g.members.some((r) => r.status === 'REPLACE_LEGACY')
    ).length,
    missingVisualKeys: ready.filter((g) =>
      g.members.some((r) => r.status === 'GENERATE_MISSING')
    ).length,
    existingStandardApprovedVisualKeys: batch.filter(
      (g) => g.status === 'EXISTING_STANDARD_APPROVED'
    ).length,
    cachedVisualKeys: batch.filter((g) => g.status === 'CACHED_NEEDS_REVIEW')
      .length,
    expectedPaidRequests: ready.length,
    apiRequestsPerformed: 0,
  };
  return {
    schemaVersion: 1,
    groupingVersion: 'core-layout-v2',
    standardVersion: style.version,
    createdAt: new Date().toISOString(),
    catalogHash: digest(products),
    planId: digest({
      catalog: products,
      standard: style.version,
      groups: batch.map((g) => ({
        key: g.visualKey,
        draftKey: g.draftKey,
        skus: g.eligibleSkus,
      })),
    }),
    summary,
    groups: batch,
    rows,
  };
}
/** Sequential, explicit execution only. Cache/claims are never charged twice. */
export async function runCableStyleBatch({
  root,
  plan,
  cacheDir,
  env,
  providerFactory,
}) {
  const style = await loadCableImageStyle(root);
  if (plan.standardVersion !== style.version)
    throw Error(
      'Style version changed: refresh dry-run; do not reuse prior generation approval'
    );
  if (plan.groupingVersion !== 'core-layout-v2')
    throw Error('Obsolete grouping: refresh dry-run before generation');
  const live = await read(
    path.join(root, 'data/catalog-current/products.json')
  );
  if (digest(live) !== plan.catalogHash)
    throw Error('Catalogue changed: refresh dry-run');
  await fs.mkdir(cacheDir, { recursive: true });
  const lock = await fs.open(path.join(cacheDir, '.batch.lock'), 'wx');
  try {
    const results = [];
    for (const g of plan.groups.filter(
      (g) =>
        g.eligibleSkus.length &&
        ![
          'EXISTING_STANDARD_APPROVED',
          'APPROVED_DRAFT_NOT_PUBLISHED',
        ].includes(g.status)
    )) {
      const freshRequest = await prepareCableStyleRequest(root, g.profile);
      const approved = await findApprovedCableResult({
        root,
        visualKey: g.visualKey,
        profile: g.profile,
        request: freshRequest,
      });
      if (approved) {
        results.push({
          visualKey: g.visualKey,
          status: 'APPROVED_DRAFT_NOT_PUBLISHED',
          approvedDraftDir: approved.absoluteDraftDir,
          cache: true,
        });
        continue;
      }
      const dir = path.join(cacheDir, g.draftKey);
      let result;
      try {
        let image;
        try {
          image = await fs.readFile(path.join(dir, 'image.png'));
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
        if (image) {
          const validation = validateCableImagePng(image, {
            background: 'transparent',
            composition: freshRequest.config.composition,
          });
          result = { status: 'NEEDS_REVIEW', cache: true, validation, compositionCheck: validation.compositionCheck };
        } else if (await optional(path.join(dir, 'request.json'))) {
          result = {
            status: 'REQUEST_OUTCOME_UNKNOWN',
            cache: true,
            reason: 'Request already claimed; no automatic retry/payment',
          };
        } else {
          const currentRequest = await prepareCableStyleRequest(
            root,
            g.profile
          );
          if (currentRequest.prompt !== g.request?.prompt)
            throw Error(
              'Stale construction contract: refresh dry-run before API'
            );
          result = await generateCableStyleDraft({
            root,
            profile: g.profile,
            visualKey: g.visualKey,
            outputDir: dir,
            env,
            providerFactory,
          });
        }
      } catch (e) {
        result = { status: 'FAILED', reason: e.message };
      }
      await fs.mkdir(dir, { recursive: true });
      const record = {
        ...result,
        visualKey: g.visualKey,
        draftKey: g.draftKey,
        profile: g.profile,
        geometryRequirements: g.request?.geometryRequirements,
        geometryCheck: {
          status: 'NEEDS_REVIEW',
          pixelVerification: 'NOT_AUTOMATED',
        },
        members: g.members.filter((r) => g.eligibleSkus.includes(r.sku)),
        standardVersion: plan.standardVersion,
      };
      await atomic(path.join(dir, 'group.json'), record);
      results.push(record);
      await atomic(path.join(cacheDir, 'batch-report.json'), {
        planId: plan.planId,
        results,
      });
    }
    return results;
  } finally {
    await lock.close();
    await fs.unlink(path.join(cacheDir, '.batch.lock'));
  }
}
/** Explicit review only; no binding. Exact PNG hash, reviewer and checks required. */
export async function recordCableStyleReview({ root, draftDir, decision }) {
  const style = await loadCableImageStyle(root);
  const group = await read(path.join(draftDir, 'group.json')),
    image = await fs.readFile(path.join(draftDir, 'image.png'));
  validateCableImagePng(image, {
    background: 'transparent',
    composition: { rightEdgeCrop: false },
  });
  const required = CABLE_STYLE_REVIEW_CHECKS;
  if (group.standardVersion !== style.version && decision.status === 'APPROVED')
    throw Error(
      'Draft uses an older style standard; cannot approve under current geometry rules'
    );
  if (
    decision.sha256 !== digest(image) ||
    !decision.reviewer ||
    !['APPROVED', 'REJECTED'].includes(decision.status)
  )
    throw Error('Review requires exact PNG hash, reviewer and decision');
  if (
    decision.status === 'APPROVED' &&
    !required.every((k) => decision.checks?.[k] === true)
  )
    throw Error('All manual checks must pass before approval');
  const record = {
    ...decision,
    APPROVED_FOR_CATALOG: decision.APPROVED_FOR_CATALOG !== false,
    APPROVED_AS_REFERENCE: decision.APPROVED_AS_REFERENCE === true,
    visualKey: group.visualKey,
    standardVersion: group.standardVersion,
    reviewedAt: new Date().toISOString(),
  };
  if (record.status === 'APPROVED')
    await archiveApprovedCableResult({
      root,
      draftDir,
      group,
      approval: record,
    });
  await atomic(path.join(draftDir, 'approval.json'), record);
  await atomic(path.join(draftDir, 'group.json'), {
    ...group,
    status: decision.status,
    manualReview: record,
    automaticProductionBinding: false,
  });
  return record;
}
/** Prepare a reviewable patch first. Does not write public files, bindings or production manifest. */
export async function prepareApprovedBindingPatch({
  root,
  draftDir,
  products,
  visibleProducts,
  bindings,
  overrides,
  currentGroup,
}) {
  const style = await loadCableImageStyle(root),
    group = await read(path.join(draftDir, 'group.json')),
    approval = await read(path.join(draftDir, 'approval.json')),
    png = await fs.readFile(path.join(draftDir, 'image.png'));
  if (
    approval.status !== 'APPROVED' ||
    approval.APPROVED_FOR_CATALOG !== true ||
    approval.visualKey !== group.visualKey ||
    approval.sha256 !== digest(png) ||
    approval.standardVersion !== style.version ||
    group.standardVersion !== style.version ||
    !approval.reviewer ||
    !CABLE_STYLE_REVIEW_CHECKS.every((k) => approval.checks?.[k] === true)
  )
    throw Error('Image not manually approved for current standard');
  const live = new Map(products.map((p) => [p.sku, p])),
    visible = new Map(visibleProducts.map((p) => [p.sku, p]));
  if (
    currentGroup &&
    (currentGroup.visualKey !== group.visualKey ||
      digest(currentGroup.profile) !== digest(group.profile))
  )
    throw Error('Current SKU group construction differs from approved image');
  const members = currentGroup
    ? currentGroup.members.filter((m) =>
        currentGroup.eligibleSkus.includes(m.sku)
      )
    : group.members;
  const changes = [];
  for (const member of members) {
    const p = live.get(member.sku);
    if (!p || digest(p) !== member.productHash)
      throw Error('SKU source changed after dry-run');
    if (
      imageDisposition(
        p,
        visible.get(p.sku),
        bindings.bySku?.[p.sku],
        overrides
      ).protected
    )
      throw Error('Manual/photo image is protected: ' + p.sku);
    if (
      JSON.stringify(bindings.bySku?.[p.sku] || null) !==
      JSON.stringify(member.oldBinding)
    )
      throw Error('Binding changed since plan: ' + p.sku);
    changes.push({
      sku: p.sku,
      before: member.oldBinding,
      after: {
        image: approvedCableImagePath(group),
        status: 'approved',
        kind: 'generated-illustration',
        APPROVED_FOR_CATALOG: true,
        APPROVED_AS_REFERENCE: approval.APPROVED_AS_REFERENCE === true,
        productId: p.id,
        sourceName: p.sourceName,
        productName: p.name,
        primaryCores: p.cores,
        cores: group.profile.cores,
        section: p.crossSection,
        visualKey: group.visualKey,
        sha256: approval.sha256,
        styleVersion: style.version,
        manualReview: {
          status: 'APPROVED',
          sha256: approval.sha256,
          reviewer: approval.reviewer,
          checks: approval.checks,
          reviewedAt: approval.reviewedAt,
        },
        referenceSha256:
          style.references[group.profile.visualizationType].sha256,
      },
    });
  }
  return {
    status: 'PREPARED_NOT_APPLIED',
    pngSha256: approval.sha256,
    sourcePng: path.join(draftDir, 'image.png'),
    changes,
    productionManifestChanged: false,
  };
}
/** Explicit final application. Whole binding file atomically replaced, unrelated entries preserved. */
export async function applyApprovedBindingPatch(args) {
  const { root, draftDir } = args;
  const lockFile = path.join(
    root,
    'data/product-image-metadata/.pipeline.lock'
  );
  const release = await acquirePriceImportLock(path.join(root, 'data/.price-import.lock'));
  if (!release) throw Error('Catalog import, restore or publication is already running');
  let lock, registryLock, stage, stagedMapping;
  try {
    lock = await fs.open(lockFile, 'wx');
    const bindingFile = path.join(root, 'shared/generatedProductImages.json');
    const catalogDir = path.join(root, 'data/catalog-current');
    const productsPath = path.join(catalogDir, 'products.json');
    const registryDir = path.join(root, 'data/cable-approved-results');
    registryLock = await fs.open(path.join(registryDir, '.registry.lock'), 'wx');
    const registry = await read(path.join(registryDir, 'registry.json'));
    const bindings = await read(bindingFile);
    const products = await read(productsPath);
    const overrides =
      (await optional(path.join(root, 'data/priceOverrides.json'))) || {};
    const { createCatalogStore } = await import('../../lib/catalog.js');
    const visibleProducts = await createCatalogStore({
      productsFile: path.join(root, 'data/catalog-current/products.json'),
      overridesFile: path.join(root, 'data/priceOverrides.json'),
    }).loadCatalogProducts();
    const patch = await prepareApprovedBindingPatch({
      ...args,
      products,
      visibleProducts,
      overrides,
      bindings,
    });
    if (!patch.changes.length) return patch;
    const group = await read(path.join(draftDir, 'group.json'));
    const request = await prepareCableStyleRequest(root, group.profile);
    const archived = await findApprovedCableResult({
      root, visualKey: group.visualKey, profile: group.profile, request,
    });
    if (archived?.APPROVED_FOR_CATALOG !== true || archived.sha256 !== patch.pngSha256)
      throw Error('Image is not approved for the catalog in the permanent registry');
    const next = structuredClone(bindings);
    const productsBySku = new Map(products.map(product => [product.sku, product]));
    for (const { sku, after } of patch.changes) {
      next.bySku[sku] = after;
      if (getGeneratedProductImage(productsBySku.get(sku), next, registry) !== after.image)
        throw Error('Catalog image approval or construction mismatch: ' + sku);
    }
    const destination = path.join(root, 'public', patch.changes[0].after.image.slice(1));
    const buffer = await fs.readFile(patch.sourcePng);
    validateCableImagePng(buffer, {
      background: 'transparent',
      composition: { rightEdgeCrop: false },
    });
    try {
      await fs.writeFile(destination, buffer, { flag: 'wx' });
    } catch (e) {
      if (
        e.code !== 'EEXIST' ||
        digest(await fs.readFile(destination)) !== patch.pngSha256
      )
        throw e;
    }
    await atomic(path.join(draftDir, 'binding-transaction.json'), {
      status: 'PREPARED',
      patch,
    });
    if ((await fs.lstat(catalogDir)).isSymbolicLink()) {
      stage = await fs.mkdtemp(path.join(root, 'data/.image-publication-'));
      await fs.cp(await fs.realpath(catalogDir), stage, { recursive: true, preserveTimestamps: true });
      await rebuildCatalogImagePages({
        projectRoot: root,
        productsPath: path.join(stage, 'products.json'),
        publicDir: path.join(stage, 'public'),
        policy: { manifest: next, registry },
      });
      stagedMapping = bindingFile + '.staged';
      await atomic(stagedMapping, next);
      await commitArtifactBatch([
        { stagedPath: stagedMapping, targetPath: bindingFile },
        { stagedPath: stage, targetPath: catalogDir, atomicDirectory: true },
      ]);
    } else {
      await atomic(bindingFile, next);
    }
    await atomic(path.join(draftDir, 'binding-transaction.json'), {
      status: 'APPLIED',
      patch,
    });
    return patch;
  } finally {
    try {
      if (stage) await fs.rm(stage, { recursive: true, force: true });
      if (stagedMapping) await fs.rm(stagedMapping, { force: true });
      if (registryLock) {
        await registryLock.close();
        await fs.unlink(path.join(root, 'data/cable-approved-results/.registry.lock'));
      }
      if (lock) {
        await lock.close();
        await fs.unlink(lockFile);
      }
    } finally {
      await release();
    }
  }
}
