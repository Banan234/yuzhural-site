import { cableSharedVisualKey, cableReusableConstructionKey, CABLE_SHARED_VISUAL_REUSE, cableVisibleConstructionKey, CABLE_VISUAL_GROUP_REUSE, cableSchematicSignature, CABLE_SCHEMATIC_REUSE } from './cableReferenceCompatibility.js';
import { cableReviewCheckAccepted } from './cableIllustrationDefects.js';
import { blocksCableCatalogAssignment } from './cableReviewPolicy.js';
import { cableIllustrationDefects } from './cableIllustrationDefects.js';
import { CATALOG_CABLE_VERSION, readCableCatalogProfile, requireCableCatalogProfile } from './cableCatalogProfile.js';
import { persistCableReviewDecision } from './cableReviewDecisions.js';
import { cableGenerationClaimKey } from './cableGenerationClaims.js';
import { assertCableIllustrationPrompt, cableIllustrationRulesHash, selectCableIllustrationRules } from './cableIllustrationRules.js';
import { vvgCutHold, vvgCutQuality } from './cableVvgCutQuality.js';
import {
  approvedCableVerificationContext,
  archiveApprovedCableResult,
  findApprovedCableResult,
} from './cableApprovedResults.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cableFamilyScope } from './cableVisualClassification.js';
import { createHash } from 'node:crypto';
import { loadCableImageStyle } from './cableImageStyle.js';
import { validateCableImagePng } from './cableImagePng.js';
import { PNG } from 'pngjs';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { deriveMulticoreComposition, inspectMulticoreComposition, multicoreCompositionReviewChecks } from './cableMulticoreComposition.js';
import { CABLE_FRAME_REVIEW_CHECKS, CABLE_STYLE_REVIEW_CHECKS } from './cableCoreGeometry.js';
import { getVvgIllustrationSignature, VVG_TYPICAL_ILLUSTRATION } from './cableVvgIllustration.js';
import { approvedCableImagePath, getGeneratedProductImage } from '../../shared/productImages.js';
import { imageDisposition } from './cableSkuImageFacts.js';
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
export function cableStyleReviewRequirements(group, request) {
  const historicalTargetedEdit = Boolean(request?.editTarget);
  const composition = deriveMulticoreComposition(group.profile, { historicalTargetedEdit });
  const technical = buildCableTechnicalProfile(group.profile);
  const activeRules = selectCableIllustrationRules(group.profile, technical, { editTarget: historicalTargetedEdit });
  const required = [...new Set([
    ...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS,
    ...(vvgCutQuality(group.profile, technical)?.checks ?? []),
    ...multicoreCompositionReviewChecks(composition),
    ...(request?.cutRevision?.version === 'vvg-review-revision-1' ? ['targetAnatomyPreserved'] : []),
    ...(request?.coreArrangement?.id === 'five-perimeter' ? ['fivePerimeterAllCoresInsideJacket'] : []),
    ...activeRules.flatMap(rule => rule.review ?? []),
  ])];
  return { composition, technical, activeRules, required };
}
/** Explicit review only; no binding. Exact PNG hash, reviewer and checks required. */
export async function recordCableStyleReview({ root, draftDir, decision, verifyOnly = false }) {
  const style = await loadCableImageStyle(root);
  const group = await read(path.join(draftDir, 'group.json')),
    image = await fs.readFile(path.join(draftDir, 'image.png'));
  const actualRoot = await fs.realpath(root);
  const actualDraft = await fs.realpath(draftDir);
  const allowedRoots = ['outputs', 'data/product-image-metadata/review-decisions'];
  if (!allowedRoots.some(folder => actualDraft.startsWith(path.join(actualRoot, folder) + path.sep)))
    throw Error('Review must target a draft or a durable review copy');
  if (group.status === 'APPROVED' && decision.status !== 'APPROVED')
    throw Error('Approved decisions require the separate withdrawal procedure');
  const request = await optional(path.join(draftDir, 'request.json'));
  if (decision.status === 'APPROVED' && (request?.catalogSource?.version === CATALOG_CABLE_VERSION ||
      group.profile.technicalConstruction?.source === CATALOG_CABLE_VERSION)) {
    if (!group.members?.length) throw Error('Catalog draft has no SKU identity');
    for (const { sku } of group.members) {
      const catalog = await requireCableCatalogProfile(root, sku);
      if (catalog.visualKey !== group.visualKey || digest(catalog.profile) !== digest(group.profile)) {
        const construction = group.visibleConstructionGroup && cableReusableConstructionKey(group.profile);
        if (!construction || cableReusableConstructionKey(catalog.profile) !== construction)
          throw Error('Catalog changed after draft generation: ' + sku);
      }
    }
  }
  const composition = deriveMulticoreComposition(group.profile, {
    historicalTargetedEdit: Boolean(request?.editTarget),
  });
  const validation = validateCableImagePng(image, {
    background: decision.status === 'APPROVED' ? 'transparent' : undefined,
    composition: { rightEdgeCrop: true },
  });
  if (decision.status === 'APPROVED' && vvgCutHold(validation.sha256))
    throw Error('VVG source has an open cut-quality correction');
  const compositionChecks = multicoreCompositionReviewChecks(composition);
  const { activeRules, required } = decision.status === 'APPROVED'
    ? cableStyleReviewRequirements(group, request) : { activeRules: [], required: [] };
  if (request?.ruleTrace && decision.status === 'APPROVED') {
    if (request.ruleTrace.sha256 !== cableIllustrationRulesHash ||
        digest(request.ruleTrace.ids) !== digest(activeRules.map(rule => rule.id)))
      throw Error('Draft rule trace differs from the active standard');
    assertCableIllustrationPrompt(activeRules, request.prompt);
  }
  if (decision.status === 'APPROVED' &&
      (!validation.bounds || !validation.has_transparency ||
        (request && (digest(request.profile) !== digest(group.profile) ||
          request.standardVersion !== group.standardVersion))))
    throw Error('Draft pixels or request profile do not support approval');
  if (group.standardVersion !== style.version && decision.status === 'APPROVED')
    throw Error(
      'Draft uses an older style standard; cannot approve under current geometry rules'
    );
  if (
    decision.sha256 !== digest(image) ||
    !decision.reviewer ||
    !['APPROVED', 'REJECTED', 'NEEDS_REVIEW'].includes(decision.status)
  )
    throw Error('Review requires exact PNG hash, reviewer and decision');
  if (
    decision.status === 'APPROVED' &&
    !required.every(k => cableReviewCheckAccepted(decision, k))
  )
    throw Error('All manual checks must pass before approval');
  let pixelReview;
  if (decision.status === 'APPROVED' && compositionChecks.length) {
    pixelReview = inspectMulticoreComposition(
      PNG.sync.read(image), validation, group.profile,
      buildCableTechnicalProfile(group.profile), decision.observations
    );
    if (pixelReview.findings.length || pixelReview.missing.length)
      throw Error('Multicore verification incomplete: ' + [...pixelReview.findings, ...pixelReview.missing].join(', '));
  }
  const linkedDefects = cableIllustrationDefects.filter(defect =>
    defect.observedSha256?.includes(decision.sha256) ||
    defect.hold?.some(item => item.sha256 === decision.sha256) ||
    defect.catalogAcceptances?.some(item => item.sha256 === decision.sha256));
  const record = {
    reviewSchemaVersion: 'cable-review-2',
    scope: { family: group.profile.family, skus: [...new Set(group.members?.map(member => member.sku) ?? [])] },
    defectRules: linkedDefects.map(defect => ({
      defectId: defect.id, ruleId: defect.ruleId, version: defect.ruleVersion ?? null,
      rulesSha256: defect.rulesSha256 ?? null, requirement: defect.expected ?? defect.description,
    })),

    ...decision,
    ...(pixelReview ? { pixelReview } : {}),
    ...(activeRules.length ? { reviewedRules: { sha256: cableIllustrationRulesHash,
      ids: activeRules.map(rule => rule.id), checks: required } } : {}),
    APPROVED_FOR_CATALOG: decision.status === 'APPROVED' && !decision.archiveOnly && decision.APPROVED_FOR_CATALOG !== false,
    APPROVED_AS_REFERENCE: decision.status === 'APPROVED' && !decision.archiveOnly && decision.APPROVED_AS_REFERENCE === true,
    visualKey: group.visualKey,
    standardVersion: group.standardVersion,
    reviewedAt: new Date().toISOString(),
  };
  if (verifyOnly) return record;
  if (record.status === 'APPROVED')
    await archiveApprovedCableResult({
      root,
      draftDir,
      group: { ...group, multicoreComposition: composition },
      approval: record,
    });
  const durableDecision = await persistCableReviewDecision({
    root, draftDir, image, group: { ...group, status: record.status }, request, decision: record,
    claimKey: cableGenerationClaimKey(group.profile, request?.cutRevision ?? group.cutRevision),
  });
  await atomic(path.join(draftDir, 'approval.json'), durableDecision);
  await atomic(path.join(draftDir, 'group.json'), {
    ...group,
    status: decision.status,
    multicoreComposition: composition,
    manualReview: durableDecision,
    automaticProductionBinding: false,
  });
  return durableDecision;
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
  typicalVvg: explicitReuse = false,
  onlyUnboundInFamily = false,
  reusePolicy = VVG_TYPICAL_ILLUSTRATION,
}) {
  const style = await loadCableImageStyle(root),
    group = await read(path.join(draftDir, 'group.json')),
    approval = await read(path.join(draftDir, 'approval.json')),
    png = await fs.readFile(path.join(draftDir, 'image.png'));
  const registry = await optional(path.join(root, 'data/cable-approved-results/registry.json'));
  if (registry && blocksCableCatalogAssignment(registry, approval))
    throw Error('Manual gallery review blocks new catalog assignments');
  if (
    approval.status !== 'APPROVED' ||
    approval.APPROVED_FOR_CATALOG !== true ||
    approval.visualKey !== group.visualKey ||
    approval.sha256 !== digest(png) ||
    approval.standardVersion !== style.version ||
    group.standardVersion !== style.version ||
    !approval.reviewer ||
    ![...CABLE_STYLE_REVIEW_CHECKS, ...multicoreCompositionReviewChecks(group.multicoreComposition)].every(k => cableReviewCheckAccepted(approval, k))
  )
    throw Error('Image not manually approved for current standard');
  if (approval.reviewedRules &&
      (!Array.isArray(approval.reviewedRules.checks) ||
        !approval.reviewedRules.checks.every(key => cableReviewCheckAccepted(approval, key))))
    throw Error('Archived approval is missing recorded visual checks');
  const live = new Map(products.map((p) => [p.sku, p])),
    visible = new Map(visibleProducts.map((p) => [p.sku, p]));
  if (
    currentGroup &&
    (currentGroup.visualKey !== group.visualKey ||
      digest(currentGroup.profile) !== digest(group.profile))
  )
    throw Error('Current SKU group construction differs from approved image');
  const typicalVvg = explicitReuse || group.visibleConstructionGroup === true;
  if (group.visibleConstructionGroup && !explicitReuse) reusePolicy = cableSharedVisualKey(group.profile) ? CABLE_SHARED_VISUAL_REUSE : CABLE_VISUAL_GROUP_REUSE;
  const members = currentGroup
    ? currentGroup.members.filter((m) =>
        currentGroup.eligibleSkus.includes(m.sku)
      )
    : group.members;
  if (members.length && vvgCutHold(approval.sha256))
    throw Error('VVG source has an open cut-quality correction; new bindings are held');
  const changes = [];
  for (const member of members) {
    const p = live.get(member.sku);
    if (!p || digest(p) !== member.productHash)
      throw Error('SKU source changed after dry-run');
    const catalog = readCableCatalogProfile(p);
    if (onlyUnboundInFamily && (bindings.bySku?.[p.sku] || !visible.has(p.sku) ||
        !cableFamilyScope(group.profile.family) ||
        (reusePolicy !== CABLE_SHARED_VISUAL_REUSE &&
          cableFamilyScope(catalog.profile?.family) !== cableFamilyScope(group.profile.family))))
      throw Error('SKU is already assigned, hidden or outside the approved family: ' + p.sku);
    const signature = reusePolicy === CABLE_SHARED_VISUAL_REUSE ? cableSharedVisualKey :
      reusePolicy === CABLE_VISUAL_GROUP_REUSE ? cableVisibleConstructionKey :
      reusePolicy === CABLE_SCHEMATIC_REUSE ? cableSchematicSignature : getVvgIllustrationSignature;
    const equivalent = typicalVvg && signature(catalog.profile);
    if ((catalog.visualKey !== group.visualKey || digest(catalog.profile) !== digest(group.profile)) &&
        (!equivalent || equivalent !== signature(group.profile)))
      throw Error('Approved PNG differs from current catalog facts: ' + p.sku);
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
        ...(typicalVvg && {
          typicalIllustration: { policy: reusePolicy, profile: group.profile },
        }),
        manualReview: {
          status: 'APPROVED',
          sha256: approval.sha256,
          reviewer: approval.reviewer,
          checks: approval.checks,
          ...(approval.acceptedCatalogChecks && { acceptedCatalogChecks: approval.acceptedCatalogChecks }),
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
  const [patch] = await applyApprovedBindingPatches({ root: args.root, assignments: [args] });
  return patch;
}

export async function applyApprovedBindingPatches({ root, assignments = [], catalogRevision, restore = [] }) {
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
    if (catalogRevision && catalogRevision !== digest({products, bindings,
        overrides: await optional(path.join(root, 'data/priceOverrides.json'))}))
      throw Error('Каталог изменился. Пересчитайте охват.');
    const cards = await createCatalogStore({
      productsFile: path.join(root, 'data/catalog-current/products.json'),
      overridesFile: path.join(root, 'data/priceOverrides.json'),
    }).loadCatalogProducts();
    const visibleProducts = cards.flatMap(card => card.offers?.length ?
      card.offers.map(offer => ({ ...card, ...offer, image:offer.image || card.image })) : [card]);
    const next = structuredClone(bindings);
    const productsBySku = new Map(products.map(product => [product.sku, product]));
    const patches = [];
    const transactions = [];
    const changedSkus = new Set();
    for (const { draftDir, placementHash, expectedHead } of restore) {
      const file = path.join(draftDir, 'binding-transaction.json');
      const transaction = await read(file);
      const approval = await read(path.join(draftDir, 'approval.json'));
      if (!transaction.galleryPlacement || !['APPLIED', 'PREPARED'].includes(transaction.status) ||
          transaction.patch.pngSha256 !== approval.sha256 || !transaction.patch.changes.length)
        throw Error('Нет применённой операции для восстановления.');
      if (placementHash && placementHash !== digest(transaction.patch.changes))
        throw Error('После утверждения появились новые привязки. Отмена остановлена.');
      if (expectedHead !== undefined && expectedHead !== (registry.reviewBySha256?.[approval.sha256]?.at(-1)?.hash ?? null))
        throw Error('После утверждения появились новые решения. Отмена остановлена.');
      for (const { sku, before, after } of transaction.patch.changes) {
        if (changedSkus.has(sku) || before !== null || after.sha256 !== approval.sha256 ||
            digest(bindings.bySku?.[sku] ?? null) !== digest(after))
          throw Error('Привязка изменилась после утверждения: ' + sku);
        changedSkus.add(sku);
        delete next.bySku[sku];
      }
      transactions.push({ file, patch:transaction.patch, restoring:true, galleryPlacement:true });
      patches.push(transaction.patch);
    }
    for (const assignment of assignments) {
      const { draftDir } = assignment;
      const patch = await prepareApprovedBindingPatch({
        ...assignment, root, products, visibleProducts, overrides, bindings,
      });
      patches.push(patch);
      if (!patch.changes.length) continue;

      const group = await read(path.join(draftDir, 'group.json'));
      const request = approvedCableVerificationContext(await loadCableImageStyle(root), group.profile);
      const archived = await findApprovedCableResult({
        root, visualKey: group.visualKey, profile: group.profile, request,
      });
      if (archived?.APPROVED_FOR_CATALOG !== true || archived.sha256 !== patch.pngSha256)
        throw Error('Image is not approved for the catalog in the permanent registry');
      for (const { sku, after } of patch.changes) {
        if (changedSkus.has(sku)) throw Error('SKU occurs in multiple assignments: ' + sku);
        changedSkus.add(sku);
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
      } catch (error) {
        if (error.code !== 'EEXIST' || digest(await fs.readFile(destination)) !== patch.pngSha256)
          throw error;
      }
      transactions.push({ file: path.join(draftDir, 'binding-transaction.json'), patch,
        galleryPlacement:assignment.onlyUnboundInFamily === true });
    }
    if (!transactions.length) return patches;
    for (const { file, patch, restoring, galleryPlacement } of transactions)
      if (!restoring) await atomic(file, { status: 'PREPARED', patch, ...(galleryPlacement && { galleryPlacement }) });
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
    for (const { file, patch, restoring, galleryPlacement } of transactions)
      await atomic(file, { status: restoring ? 'RESTORED' : 'APPLIED', patch, ...(galleryPlacement && { galleryPlacement }) });
    return patches;
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
