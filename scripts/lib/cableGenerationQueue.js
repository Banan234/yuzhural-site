import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { loadCableImageStyle, prepareCableStyleRequest } from './cableImageStyle.js';
import { deriveLayerContactRule } from './cableLayerContact.js';
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';
import { digest, imageDisposition } from './cableStyleBatch.js';
import { getGeneratedProductImage, matchesApprovedCableConstruction } from '../../shared/productImages.js';

export const GENERATION_QUEUE_VERSION = 'technical-evidence-v2';

const STRUCTURAL_FIELDS = new Set([
  'conductorMaterial', 'conductorConstruction', 'conductorShape', 'geometry',
  'hasOuterJacket', 'armor', 'shield', 'armorType', 'shieldType', 'outerJacketMaterial',
]);

export function refineGenerationEvidence(row, technical, context) {
  const profile = row.visualProfile;
  const evidence = { ...row.technicalProfile };
  const refinements = [];
  const rule = context.familyVisualRules?.familyVisualRules?.[row.familyId];
  // Only explicitly sourced structural rules for this normalized execution.
  // The practical classifier has already checked conflicts, core range and codes.
  if (row.visualClassification === 'AUTO_APPROVED' && rule?.source?.url) {
    for (const item of row.illustrationDefaults || []) {
      const declared = item.basis === 'documented-family-structure'
        ? rule.structure?.[item.field] === item.value
        : Object.values(rule.conductorCodes || {}).some(code => code[item.field] === item.value);
      if (!declared || !STRUCTURAL_FIELDS.has(item.field) || evidence[item.field] != null ||
          item.value !== profile[item.field] ||
          !['documented-family-structure', 'documented-conductor-code'].includes(item.basis))
        continue;
      evidence[item.field] = item.value;
      refinements.push({ field: item.field, source: rule.source.url, basis: item.basis });
    }
    if (evidence.outerJacketMaterial == null && rule.structure?.outerJacketMaterial &&
        profile.hasOuterJacket === true) {
      evidence.outerJacketMaterial = rule.structure.outerJacketMaterial;
      refinements.push({ field: 'outerJacketMaterial', source: rule.source.url, basis: 'documented-family-structure' });
    }
  }
  let construction = technical;
  if (profile.cores === 1 && technical.innerSheath.status === 'unknown' &&
      (!evidence.filler || evidence.filler === 'none') &&
      deriveLayerContactRule(profile, technical).mode === 'CONFIRMED_DIRECT_CONTACT') {
    construction = { ...technical, innerSheath: { status: 'absent' } };
    refinements.push({ field: 'innerSheath', source: 'data/cableLayerContactRules.json', basis: 'confirmed-direct-contact' });
  }
  return { row: { ...row, technicalProfile: evidence }, technical: construction, refinements };
}

export function generationEvidenceIssues(row, technical) {
  const profile = row.visualProfile;
  if (row.visualClassification !== 'AUTO_APPROVED')
    return ['classification-needs-review'];
  const issues = [];
  const evidence = row.technicalProfile;
  for (const field of ['conductorMaterial', 'conductorConstruction', 'conductorShape', 'geometry', 'hasOuterJacket', 'armor', 'shield'])
    if (evidence[field] == null || evidence[field] !== profile[field])
      issues.push('unconfirmed-' + field);
  if (row.evidence?.conductorConstruction?.basis === 'family-section-band')
    issues.push('unverified-conductor-section-band');
  if (JSON.stringify(evidence.coreColors) !== JSON.stringify(profile.coreColors))
    issues.push('unconfirmed-core-colors');
  if (profile.shield && evidence.shieldType !== profile.shieldType)
    issues.push('unconfirmed-screen-type');
  if (profile.armor && evidence.armorType !== profile.armorType)
    issues.push('unconfirmed-armor-type');
  if (profile.coreLayout || profile.conductorShape !== 'circular')
    issues.push('unsupported-core-layout');
  if (technical.outerSheath.status === 'unknown' ||
      (technical.outerSheath.status === 'present' &&
        (!evidence.outerJacketMaterial || evidence.outerJacket !== profile.outerJacket)))
    issues.push('unconfirmed-outer-sheath');
  if (technical.outerSheath.status === 'present' && technical.innerSheath.status === 'unknown')
    issues.push('unconfirmed-inner-sheath');
  if (profile.cores > 1 && technical.interstitialFilling.status === 'unknown')
    issues.push('unconfirmed-interstitial-filling');
  return issues;
}

const unique = values => [...new Set(values)];
const complexity = group => group.profile.cores +
  Number(group.profile.armor) + Number(group.profile.shield) +
  group.profile.specialElements.length;
export const rankGenerationQueue = groups => groups.filter(group =>
  group.status === 'READY_FOR_GENERATION' && !group.pendingDraft
).sort((a, b) => b.additionalSkus.length - a.additionalSkus.length ||
  complexity(a) - complexity(b) || a.visualKey.localeCompare(b.visualKey));

export async function buildCableGenerationQueue({
  root, products, visibleProducts, context, bindings, overrides, registry,
  historicalPlan, pendingKeys = [], reviewedConstructions = {},
}) {
  const style = await loadCableImageStyle(root);
  const historicalSkus = new Set(historicalPlan.groups.flatMap(group => group.members.map(member => member.sku)));
  const visible = new Map(visibleProducts.flatMap(card =>
    (card.offers?.length ? card.offers : [card]).map(offer => [offer.sku, card])
  ));
  const registryChecks = new Map();
  async function verifiedApproval(approval) {
    if (!registryChecks.has(approval.visualKey)) {
      const archive = path.resolve(root, approval.draftDir);
      const valid = archive.startsWith(path.join(root, 'data/cable-approved-results') + path.sep) &&
        await fs.readFile(path.join(archive, 'image.png')).then(
          png => digest(png) === approval.sha256,
          () => false,
        );
      registryChecks.set(approval.visualKey, valid);
    }
    return registryChecks.get(approval.visualKey);
  }

  const groups = new Map();
  const rows = [];
  const preparation = new Map();
  for (const product of products) {
    const classification = classifyPracticalCableVisualProduct(product, context);
    const { visualKey, visualProfile } = classification;
    const reviewed = reviewedConstructions[visualKey];
    const reviewedMember = reviewed?.members[product.sku];
    const profile = reviewedMember?.sourceName === product.sourceName &&
        reviewedMember?.id === product.id && reviewedMember?.section === Number(product.crossSection) &&
        classification.visualClassification === 'AUTO_APPROVED'
      ? reviewed.profile : visualProfile;
    const row = {
      sku: product.sku, name: product.name, slug: product.slug, visualKey,
      historical: historicalSkus.has(product.sku), visible: visible.has(product.sku),
      autoApproved: classification.visualClassification === 'AUTO_APPROVED',
      technical: false, status: 'NEEDS_TECHNICAL_REVIEW', reasons: [],
    };
    let technical;
    try {
      technical = buildCableTechnicalProfile(profile);
      const originalIssues = generationEvidenceIssues(classification, technical);
      if (profile === reviewed?.profile) {
        row.reasons = [];
      } else {
        const refined = refineGenerationEvidence(classification, technical, context);
        row.reasons = generationEvidenceIssues(refined.row, refined.technical);
        if (refined.refinements.length && row.reasons.length < originalIssues.length)
          row.refinements = refined.refinements;
        row.automaticallyDetermined = originalIssues.length > 0 && row.reasons.length === 0;
      }
    } catch (error) {
      row.reasons = [error.message];
    }
    row.technical = row.reasons.length === 0;
    const approval = registry.byVisualKey?.[visualKey];
    const displayed = getGeneratedProductImage(product, bindings, registry);
    if (approval?.APPROVED_FOR_CATALOG === true && approval.status === 'APPROVED' &&
        (displayed || matchesApprovedCableConstruction(product, approval)) &&
        await verifiedApproval(approval)) {
      row.status = 'ALREADY_COVERED';
      row.coverage = displayed ? 'existing-binding' : 'exact-reuse';
    } else if (approval) {
      row.reasons.push('existing-approval-requires-reconciliation');
    } else if (imageDisposition(product, visible.get(product.sku), bindings.bySku?.[product.sku], overrides).protected) {
      row.reasons.push('protected-photo-or-manual-image');
    } else if (!row.visible) {
      row.reasons.push('outside-catalog-listing');
    } else if (row.technical) {
      if (!preparation.has(visualKey)) {
        try {
          const request = await prepareCableStyleRequest(root, profile);
          const reference = request.approvedStyleReference;
          preparation.set(visualKey, request.referenceStatus === 'NEEDS_APPROVED_GEOMETRY_REFERENCE'
            ? { reason: 'no-approved-compatible-multicore-geometry-reference' }
            : reference
            ? { reference: { visualKey: reference.visualKey, sha256: reference.sha256 }, profileHash: digest(profile) }
            : { reason: 'no-compatible-approved-reference' });
        } catch (error) {
          preparation.set(visualKey, { reason: error.message });
        }
      }
      const prep = preparation.get(visualKey);
      if (prep.reference && prep.profileHash === digest(profile)) {
        row.status = 'READY_FOR_GENERATION';
        row.basis = technical.constructionSource || 'saved-technical-classification';
      } else row.reasons.push(prep.reason || 'inconsistent-technical-profile-within-visual-key');
    }
    rows.push(row);
    if (!groups.has(visualKey)) groups.set(visualKey, []);
    groups.get(visualKey).push({ row, profile });
  }

  const result = [...groups].map(([visualKey, members]) => {
    const ready = members.filter(({ row }) => row.status === 'READY_FOR_GENERATION');
    const covered = members.filter(({ row }) => row.status === 'ALREADY_COVERED');
    const representative = (ready[0] || covered[0] || members[0]);
    return {
      visualKey,
      status: ready.length ? 'READY_FOR_GENERATION' : covered.length ? 'ALREADY_COVERED' : 'NEEDS_TECHNICAL_REVIEW',
      pendingDraft: pendingKeys.includes(visualKey),
      profile: representative.profile,
      representative: representative.row,
      compatibleSkus: unique((ready.length ? ready : covered).map(({ row }) => row.sku)),
      additionalSkus: unique(ready.map(({ row }) => row.sku)),
      reference: preparation.get(visualKey)?.reference || null,
      members: members.map(({ row }) => row),
    };
  });
  const queue = rankGenerationQueue(result);
  const blockers = new Map();
  const autoRows = rows.filter(row => row.autoApproved && row.status === 'NEEDS_TECHNICAL_REVIEW');
  for (const row of autoRows) {
    for (const reason of new Set(row.reasons)) {
      if (!blockers.has(reason)) blockers.set(reason, []);
      blockers.get(reason).push(row);
    }
  }
  const blockerBreakdown = [...blockers].map(([reason, affected]) => {
    const visibleAffected = affected.filter(row => row.visible);
    const sole = visibleAffected.filter(row => new Set(row.reasons).size === 1);
    return {
      reason,
      affectedSku: unique(visibleAffected.map(row => row.sku)).length,
      affectedKeys: unique(visibleAffected.map(row => row.visualKey)).length,
      soleBlockerSku: unique(sole.map(row => row.sku)).length,
      soleBlockerKeys: unique(sole.map(row => row.visualKey)).length,
    };
  }).sort((a, b) => b.affectedSku - a.affectedSku || a.reason.localeCompare(b.reason));
  const metrics = subset => ({
    sku: unique(subset.map(row => row.sku)).length,
    visualKeys: unique(subset.map(row => row.visualKey)).length,
    technicallyDeterminedSku: unique(subset.filter(row => row.technical).map(row => row.sku)).length,
    technicallyDeterminedKeys: unique(subset.filter(row => row.technical).map(row => row.visualKey)).length,
    coveredKeys: unique(subset.filter(row => row.status === 'ALREADY_COVERED').map(row => row.visualKey)).length,
    coveredSku: unique(subset.filter(row => row.status === 'ALREADY_COVERED').map(row => row.sku)).length,
    readyKeys: unique(subset.filter(row => row.status === 'READY_FOR_GENERATION' && !pendingKeys.includes(row.visualKey)).map(row => row.visualKey)).length,
    readySku: unique(subset.filter(row => row.status === 'READY_FOR_GENERATION' && !pendingKeys.includes(row.visualKey)).map(row => row.sku)).length,
  });
  return {
    version: GENERATION_QUEUE_VERSION, standardVersion: style.version,
    catalogHash: digest(products),
    summary: {
      releaseSku: unique(products.map(product => product.sku)).length,
      visibleSku: visible.size,
      historicalOriginalSku: historicalSkus.size,
      historicalOriginalKeys: historicalPlan.groups.length,
      historicalPresent: metrics(rows.filter(row => row.historical)),
      historicalStillAutoApproved: metrics(rows.filter(row => row.historical && row.autoApproved)),
      currentAutoApproved: metrics(rows.filter(row => row.autoApproved)),
      categories: Object.fromEntries(['READY_FOR_GENERATION', 'NEEDS_TECHNICAL_REVIEW', 'ALREADY_COVERED'].map(status =>
        [status, result.filter(group => group.status === status).length])),
      blockedAutoApprovedKeys: result.filter(group => group.status === 'NEEDS_TECHNICAL_REVIEW' && group.members.some(row => row.autoApproved)).length,
      queuedKeys: queue.length,
      additionalSku: unique(queue.flatMap(group => group.additionalSkus)).length,
      pendingDraftSku: unique(result.filter(group => group.pendingDraft).flatMap(group => group.members.filter(row => row.technical && row.visible && row.status !== 'ALREADY_COVERED').map(row => row.sku))).length,
      automaticallyRefinedSku: rows.filter(row => row.refinements).length,
      automaticallyDeterminedSku: rows.filter(row => row.automaticallyDetermined).length,
      automaticallyQueuedSku: rows.filter(row => row.automaticallyDetermined && row.status === 'READY_FOR_GENERATION' && !pendingKeys.includes(row.visualKey)).length,
      apiRequests: 0,
    },
    blockerBreakdown,
    next: queue.slice(0, 10),
    groups: result,
  };
}
