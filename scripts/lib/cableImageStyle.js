import { cableGroupReferenceChoices, cableReferenceLayoutId } from './cableGroupReferences.js';
import { cableRegistryReview } from './cableReviewPolicy.js';
import familyVisualRules from '../../data/familyVisualRules.json' with { type: 'json' };
import classificationRules from '../../data/cableVisualClassificationRules.json' with { type: 'json' };
import { resolveFamilyVisualRule } from './familyVisualRules.js';
import { loadCableCatalogItem } from './cableCatalogProfile.js';
import { loadCableReviewDecisions } from './cableReviewDecisions.js';
import { assertCableIllustrationPrompt, cableIllustrationRules, cableIllustrationRulesHash, selectCableIllustrationRules } from './cableIllustrationRules.js';
import { validateVvgCutRevision, vvgCutPrompt, vvgCutQuality } from './cableVvgCutQuality.js';
import { buildCableCompositionContract } from './cableCompositionContract.js';
import { usesScreenedVvgStripping } from './cableStrippingComposition.js';
import { cableGenerationClaimKey, cableGenerationReservationKey, findCableGenerationClaim, findHistoricalCatalogClaim, readCableGenerationClaims, reserveCableGeneration } from './cableGenerationClaims.js';
import { CABLE_FRAME_REVIEW_CHECKS } from './cableCoreGeometry.js';
import { PNG } from 'pngjs';
import { deriveMulticoreComposition, multicoreCompositionPrompt, multicoreCompositionReviewChecks, inspectMulticoreComposition } from './cableMulticoreComposition.js';
import { selectCableGenerationReferences } from './cableApprovedStyleReference.js';
import {deriveLayerContactRule,layerContactPrompt} from './cableLayerContact.js';
import {deriveStrippingCompositionPreference,strippingCompositionPrompt} from './cableStrippingComposition.js';
import {
  outerSheathGeometryPrompt,
  deriveOuterSheathGeometry,
} from './cableOuterSheathGeometry.js';
import { findApprovedGeometryReference } from './cableGeometryReferences.js';
import {
  prepareGeometryPilot,
  geometryPilotPrompt,
} from './cableGeometryPilot.js';
import {
  deriveMulticoreStrippingRule,
  multicoreStrippingPrompt,
} from './cableMulticoreVisualRules.js';
import { approvedCableVerificationContext, findExistingCatalogCable, findHistoricalCatalogApproval, selectReusableCableResults } from './cableApprovedResults.js';
import {
  buildCableTechnicalProfile,
  technicalProfilePrompt,
} from './cableTechnicalProfile.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createImageProvider } from './cableImageProvider.js';
import { validateCableImagePng } from './cableImagePng.js';
import {
  deriveCableCoreGeometry,
  coreGeometryPrompt,
  CABLE_STYLE_REVIEW_CHECKS,
} from './cableCoreGeometry.js';
export const PINNED_STYLE_SHA256 =
  '9efe6f176dd789859814e89c2e41571c3d8c18268fabb662ab5e1893e95dfa60';
const hash = (b) => createHash('sha256').update(b).digest('hex');
export async function loadCableImageStyle(root) {
  const buffer = await fs.readFile(path.join(root, 'cable-image-style.json'));
  if (hash(buffer) !== PINNED_STYLE_SHA256)
    throw Error(
      'Cable style config changed: new version and explicit user approval required'
    );
  const style = JSON.parse(buffer);
  const lock = JSON.parse(
    await fs.readFile(
      path.join(root, 'assets/cable-style-reference/standard.lock.json')
    )
  );
  if (
    lock.configSha256 !== PINNED_STYLE_SHA256 ||
    lock.version !== style.version
  )
    throw Error('Style lock mismatch');
  for (const [type, r] of Object.entries(style.references)) {
    if (
      lock.references[type]?.sha256 !== r.sha256 ||
      hash(await fs.readFile(path.join(root, r.path))) !== r.sha256
    )
      throw Error('Protected reference SHA-256 mismatch: ' + type);
  }
  return style;
}
export async function prepareCableStyleRequest(root, profile, options) {
  return buildCableStyleRequest(root, profile, await loadCableImageStyle(root), options);
}

async function buildCableStyleRequest(
  root,
  profile,
  style,
  {
    geometryInput = {},
    editTarget = null,
    strippingCorrection = null,
    geometryPilotSku = null,
    geometryRevision = null,
    vvgCutRevision = false,
    vvgReviewRevision = false,
    layoutRevision = null,
    referenceChoices = null,
    galleryCorrection = null,
  } = {}
) {
  if (profile?.schematicAssumptions?.fireBarrier?.basis === 'unknown-barrier-construction' ||
      profile?.technicalConstruction?.fireBarrierStatus === 'present-not-exposed') {
    throw Error('NEEDS_TECHNICAL_REVIEW: для огнестойкого исполнения не подтверждены материал или расположение барьера');
  }
  const geometryPilot = geometryPilotSku
    ? await prepareGeometryPilot(root, profile, geometryPilotSku)
    : null;
  const geometryReference = await findApprovedGeometryReference(root, profile);
  const outerSheathGeometry = deriveOuterSheathGeometry(profile);
  if (outerSheathGeometry === 'UNKNOWN')
    throw Error('NEEDS_TECHNICAL_REVIEW: outer sheath geometry unknown');
  if (profile?.coreLayout && !profile.coreLayout.sectionGroups)
    throw Error(
      'NEEDS_REVIEW: mixed-size core layout needs explicit reviewed construction/colour mapping'
    );
  const geometryRequirements = deriveCableCoreGeometry(profile, geometryInput);
  if (geometryRequirements.status === 'NEEDS_REVIEW')
    throw Error('NEEDS_REVIEW: ' + geometryRequirements.reason);
  if (geometryRequirements.mode === 'MIXED' && !profile.coreLayout?.sectionGroups)
    throw Error(
      'NEEDS_REVIEW: mixed sections require reviewed core layout and colour/material mapping before generation'
    );
  const type = profile?.visualizationType,
    reference = style.references[type];
  if (!reference)
    throw Error('NEEDS_REVIEW: missing/unsupported visualizationType');
  if (
    !Number.isInteger(profile.cores) ||
    profile.cores < 1 ||
    !Array.isArray(profile.coreColors) ||
    profile.coreColors.length !== profile.cores
  )
    throw Error('NEEDS_REVIEW: exact core count/colours required');
  if (
    !['copper', 'aluminium'].includes(profile.conductorMaterial) ||
    !['solid', 'stranded'].includes(profile.conductorConstruction)
  )
    throw Error('NEEDS_REVIEW: conductor material/construction required');
  const familyId = profile.family?.replace(/-catalog(?:-frls)?$/u, '');
  const context = { rules: classificationRules, familyVisualRules };
  const flatFamily = familyId?.replace(/-png(?:-|$).*/u, '-p');
  const familyIds = [familyId, ...(profile.geometry === 'flat'
    ? [flatFamily === familyId ? familyId + '-p' : flatFamily] : [])];
  const familyTemplate = familyIds.some(id => {
    const rule = resolveFamilyVisualRule({ familyId: id, baseFamily: id?.toUpperCase() }, context);
    return rule?.approvedStyleFrom &&
      profile.cores >= (rule.minCores ?? 1) && profile.cores <= (rule.maxCores ?? Infinity) &&
      ['round', 'flat'].includes(profile.geometry) &&
      ['geometry', 'hasOuterJacket', 'conductorMaterial'].every(field =>
        rule.structure[field] == null || rule.structure[field] === profile[field]);
  });
  const protectedGeometry = Boolean(profile.schematicAssumptions) ||
    (outerSheathGeometry === 'NO_COMMON_SHEATH' && type === 'SIMPLE' && profile.cores === 1 && profile.geometry === 'round') || (outerSheathGeometry === 'ROUND' && profile.geometry === 'round') ||
    (outerSheathGeometry === 'FLAT' && profile.geometry === 'flat' && profile.family === 'shvvp' && profile.cores === 3) ||
    (outerSheathGeometry === 'FLAT' && profile.technicalConstruction?.reviewedFlatLayout === true &&
      (profile.cores === 2 || (profile.cores === 4 && profile.pairedGroupSize === 2)));
  if (
    typeof profile.armor !== 'boolean' ||
    typeof profile.shield !== 'boolean' ||
    (profile.armor && !profile.armorType)
  )
    throw Error('NEEDS_REVIEW: layer construction unknown');
  if (
    profile.armor &&
    !['steel-tapes', 'steel-wires', 'corrugated-steel-tape'].includes(profile.armorType) &&
    !(profile.armorType === 'schematic-armor' && profile.schematicAssumptions?.['Тип брони'])
  )
    throw Error('NEEDS_REVIEW: unsupported armour');
  if (
    (profile.specialElements || []).some(
      (x) =>
        ![
          'fire-barrier',
          'drain-wire',
          ...(geometryPilot || geometryReference ? ['twisted-insulated-cores'] : []),
        ].includes(x)
    )
  )
    throw Error('NEEDS_REVIEW: undocumented special element');
  const layered =
    profile.armor ||
    profile.shield ||
    profile.specialElements?.includes('fire-barrier');
  if (layered && !type.includes('LAYERED'))
    throw Error('NEEDS_REVIEW: type/layer conflict');
  const technicalProfile = buildCableTechnicalProfile(profile);
  const screenedCompact = usesScreenedVvgStripping(profile);
  let multicoreStripping = screenedCompact ? null : deriveMulticoreStrippingRule(profile);
  const cutQuality = vvgCutQuality(profile, technicalProfile);
  let cutRevision = null;
  let target = null;
  if (editTarget || strippingCorrection || geometryRevision || vvgCutRevision || vvgReviewRevision) {
    if (vvgCutRevision && (!editTarget || strippingCorrection || geometryRevision || geometryPilotSku))
      throw Error('VVG correction requires one saved draft or approved source');
    if (vvgReviewRevision && (!editTarget || strippingCorrection || geometryRevision || geometryPilotSku || vvgCutRevision))
      throw Error('VVG review revision requires one previously reviewed source');
    const validRevision =
      geometryPilot &&
      ((geometryPilotSku === 'YU-0005219' &&
        geometryRevision === 'tight-flat-sheath') ||
        (geometryPilotSku === 'YU-0004818' &&
          geometryRevision === 'compact-sip-ends'));
    if (
      geometryRevision &&
      (!validRevision || !editTarget || strippingCorrection)
    )
      throw Error('NEEDS_REVIEW: unsupported geometry revision');
    if (
      !geometryRevision && !vvgCutRevision && !vvgReviewRevision &&
      (!editTarget ||
        !strippingCorrection ||
        !multicoreStripping ||
        strippingCorrection.min !== 1.25 ||
        strippingCorrection.max !== 1.3)
    )
      throw Error('NEEDS_REVIEW: unsupported targeted stripping correction');
    const targetPath = path.resolve(root, editTarget);
    const actualTarget = await fs.realpath(targetPath);
    const actualRoot = await fs.realpath(root);
    const approvedArchive = path.join(actualRoot, 'data/cable-approved-results') + path.sep;
    if (!actualTarget.startsWith(path.join(actualRoot, 'outputs') + path.sep) &&
        !(vvgCutRevision && actualTarget.startsWith(approvedArchive)) &&
        !(vvgReviewRevision && actualTarget.startsWith(path.join(actualRoot, 'data/product-image-metadata/review-decisions') + path.sep)))
      throw Error('Edit target must be a saved draft inside outputs');
    const bytes = await fs.readFile(actualTarget);
    validateCableImagePng(bytes, {
      background: 'transparent',
      composition: { rightEdgeCrop: false },
    });
    target = {
      path: targetPath,
      sha256: hash(bytes),
      role: 'previous-generation-edit-target',
    };
    if (vvgCutRevision) {
      const source = JSON.parse(await fs.readFile(path.join(path.dirname(targetPath), 'group.json')));
      cutRevision = validateVvgCutRevision({
        quality: cutQuality, profile, sourceProfile: source.profile, sourceSha256: target.sha256,
      });
    }
    if (vvgReviewRevision) {
      const source = (await loadCableReviewDecisions(root))
        .find(({ decision }) => decision.sha256 === target.sha256 && decision.disposition === 'NEEDS_CORRECTION');
      const sourceGroup = source && JSON.parse(await fs.readFile(path.join(source.decisionDir, 'group.json')));
      const mode = screenedCompact ? 'screened-compact-stripping'
        : ['vvgng-a-frls', 'vvg-catalog-frls'].includes(profile.family) && profile.cores === 1 ? 'frls-layer-allowlist' : null;
      if (!mode || !sourceGroup || hash(JSON.stringify(sourceGroup.profile)) !== hash(JSON.stringify(profile)))
        throw Error('NEEDS_REVIEW: correction source or construction does not match the durable review');
      cutRevision = { version: 'vvg-review-revision-1', mode, sourceSha256: target.sha256 };
      multicoreStripping = null;
    }
    if (!geometryRevision && !cutRevision)
      multicoreStripping = {
        ...multicoreStripping,
        insulatedCoreExposedLengthRatio: { min: 1.25, max: 1.3 },
        correctionBaseline: target,
        correction:
          'Move jacket cut RIGHT relative to fixed bare-metal ends; no global scaling',
      };
  }
  const perimeterFive = cableReferenceLayoutId(profile) === 'five-perimeter';
  const layout = perimeterFive ? {
    id: 'five-perimeter', requiresReviewedLayout: true,
    instruction: 'Looking down the cable axis, arrange five equal cores compactly in a ring inside the jacket opening. Leave the centre of the ring free of any core. Every insulated core, including the black one, must visibly emerge from inside the same inner jacket rim. No core may emerge from the outer wall, pass through the rim or run outside the jacket. Show all five distinct copper tips without fanning.',
  } : {
    id: 'target-layout',
    instruction: profile.pairedGroupSize
      ? `Arrange ${profile.cores / profile.pairedGroupSize} compact groups of ${profile.pairedGroupSize} individually visible cores.`
      : profile.geometry === 'flat' ? 'Keep the target cores side by side within the flat cross-section.'
      : 'Arrange the exact target core count as one compact bundle about the cable axis, matching any group sizes in the contract. Each tip remains separately visible.',
  };
  if (layoutRevision) {
    if (target || layoutRevision.sku !== 'YU-0002637' || !perimeterFive ||
        layoutRevision.sha256 !== '89709f81046132fe86750af532397830cccb2c0e5658451501010f0394ca211d')
      throw Error('Invalid perimeter-layout revision');
    cutRevision = { version: 'family-layout-revision-1', mode: layout.id, sourceSha256: layoutRevision.sha256 };
  }
  if (galleryCorrection) {
    if (target || cutRevision) throw Error('Conflicting correction modes');
    cutRevision = { version:'gallery-correction-1', sourceSha256:galleryCorrection.sha256 };
  }
  let approvedReferences = [];
  let referenceSelection = null;
  if (!target) {
    const preferred = referenceChoices ?? await cableGroupReferenceChoices(root, profile);
    try {
      const selection = await selectCableGenerationReferences(root, profile, {
        layout,
        preferred,
        excludeSha256: reference.sha256,
      });
      approvedReferences = selection.selected;
      referenceSelection = { librarySize: selection.librarySize, compatible: selection.compatibleReferenceCount,
        ranking: selection.ranking, choices:selection.choices, groupChoices:selection.groupChoices };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (preferred?.primary || preferred?.geometry)
        throw Error('Файл назначенного референса или его запись в архиве отсутствует. Проверьте назначения группы.',{cause:error});
    }
  }
  const approvedStyleReference = approvedReferences[0] ?? null;
  if (!target && !geometryPilot && !geometryReference && !familyTemplate && !protectedGeometry &&
      !approvedReferences.some(entry => entry.role === 'GEOMETRY_MATCH'))
    throw Error('NEEDS_REVIEW: unsupported layout for protected style: ' + outerSheathGeometry +
      ', ' + profile.cores + ' cores, ' + type);
  const referenceStatus = approvedStyleReference?.role || 'PROTECTED_STYLE_ONLY';
  const referenceEntries = target ? [target] : approvedReferences;
  const uniqueReferences = [...new Set(referenceEntries.map(entry => entry.sha256))];
  const positionOf = sha256 => uniqueReferences.indexOf(sha256) + 2;
  const additionalReferences = target ? [target] : uniqueReferences.map(sha256 =>
    approvedReferences.find(entry => entry.sha256 === sha256)).map(entry => ({
    ...entry,
    permission: {
      visualKey: entry.visualKey,
      archiveOnly: entry.archiveOnly,
      profileHash: hash(JSON.stringify(entry.profile)),
      registry: path.join(root, 'data/cable-approved-results/registry.json'),
      approval: path.join(path.dirname(entry.path), 'approval.json'),
      group: path.join(path.dirname(entry.path), 'group.json'),
    },
  }));
  const referenceInputs = [
    { position: 1, role: 'protected-style', sha256: reference.sha256,
      evidence: {
        approvalStatus: 'PROTECTED_STYLE', technicalFamily: null,
        prohibitedTransfer: ['all construction anatomy', ...(screenedCompact ? ['axial insulation exposure lengths'] : [])],
      },
    },
    ...referenceEntries.map(({ sha256, visualKey, role, allowedUse, evidence, rank }) => ({
      position: positionOf(sha256),
      role: target ? 'historical-edit-target' : role,
      sha256,
      ...(visualKey && { visualKey }),
      ...(allowedUse && { allowedUse }),
      ...(evidence && { evidence, rank }),
      ...(target && {
        allowedUse: 'same-construction source canvas for a targeted edit only',
        evidence: {
          technicalFamily: profile.family, approvalStatus: 'EDIT_TARGET_NOT_A_POSITIVE_REFERENCE',
          prohibitedTransfer: ['the diagnosed defect', 'any feature outside the technical contract'],
        },
      }),
    })),
  ];
  const geometricInput = referenceInputs.find(input => input.role === 'GEOMETRY_MATCH');
  const sharedReference = uniqueReferences.length < referenceEntries.length;
  const supplementalInstructions = approvedReferences.length
    ? ' ' + approvedReferences.map(({ sha256, role, allowedUse, evidence }) =>
      `INPUT ${positionOf(sha256)} (${role}): use only ${allowedUse}. ${sharedReference ? 'For this role, do' : 'Do'} not transfer ${evidence.prohibitedTransfer.join(', ')}.`).join(' ') +
      (sharedReference ? ' The same uploaded image has both roles. Apply each permission and restriction within its stated role.' : '') +
      ' The target contract governs all core counts, colours, conductor properties and layers. Input 1 controls the protected camera and scale.'
    : '';
  const strippingComposition = screenedCompact ? null : deriveStrippingCompositionPreference(profile);
  const layerContact = deriveLayerContactRule(profile, technicalProfile);
  const multicoreComposition = deriveMulticoreComposition(profile, {
    historicalTargetedEdit: Boolean(target),
  });
  const activeRules = selectCableIllustrationRules(profile, technicalProfile, { editTarget: Boolean(target) });
  const ruleTrace = { version: cableIllustrationRules.version, sha256: cableIllustrationRulesHash,
    ids: activeRules.map(rule => rule.id) };
  const visualCompositionContract = buildCableCompositionContract(profile, {
    editTarget: target, multicoreComposition, strippingComposition, multicoreStripping,
  });
  const prompt =
    (!profile.schematicAssumptions && profile.technicalConstruction?.source === 'catalog-construction-1'
      ? 'Use only the provided catalog facts. Do not research or consult outside technical documentation or infer missing construction. ' : '') +
    (profile.schematicAssumptions
      ? 'SCHEMATIC ILLUSTRATION. The unconfirmedRenderingAssumptions in the contract are rendering conventions only. Use them for the illustration and do not claim them as product specifications. Do not research or add external information. Do not expose any other undocumented layer. ' : '') +
    'TECHNICAL_CONTRACT (immutable anatomy). ' + technicalProfilePrompt(technicalProfile) +
    ' VISUAL_COMPOSITION_CONTRACT ' + JSON.stringify(visualCompositionContract) +
    (familyTemplate || protectedGeometry ? ' Use the target construction and composition contracts for target layout; images define style and only their permitted reference features. ' : '') +
    ' Composition adjustments must never change the technical contract. ' + layerContactPrompt(layerContact) +
    multicoreCompositionPrompt(multicoreComposition) +
    supplementalInstructions +
    (galleryCorrection ? ' REVIEW CORRECTION (subordinate to the technical contract): ' +
      JSON.stringify({ reason:galleryCorrection.reason, note:galleryCorrection.note }) + '. ' : '') +
    (!target ? ' CORE ARRANGEMENT: ' + layout.instruction +
      (geometricInput ? ' Use the geometry image for positions only.' : ' Use this explicit layout diagram in words; no geometric PNG is supplied.') : '') +
    vvgCutPrompt(cutQuality) +
    (cutRevision?.mode === 'flush-filling' ? ' In INPUT 2 trim only the excess visible fill back to the jacket cut plane. Do not shift the jacket cut, change the core arrangement, insulation thickness or any stripping length.' : '') +
    (vvgCutRevision ? ' INPUT 2 is the exact correction target. Apply only the VVG cut-quality correction above. Preserve the original copper tips, exposed metal lengths, insulation colors, material, view, and overall scale. Render a truly transparent background with no halo.' : '') +
    (cutRevision?.mode === 'screened-compact-stripping'
      ? ' INPUT 2 is the exact correction target. Shorten only the visible insulated lengths relative to the screen and outer sheath steps. Preserve metal tips, layout, diameters, insulation walls, layer inventory, order, geometry and scale.' : '') +
    (cutRevision?.mode === 'frls-layer-allowlist'
      ? ' INPUT 2 is the exact correction target. Remove only visible steps outside the TECHNICAL_CONTRACT allowlist. Preserve the short mica step and the documented inner and outer PVC sheaths. Keep all other positions, geometry, stripping lengths and scale.' : '') +
    ' ' + activeRules.flatMap(rule => rule.prompt ?? []).join(' ') +
    ` Use the attached USER-APPROVED ${type} reference as the mandatory visual standard, version ${style.version}. This reference defines style, scale, composition, tilt, camera, materials appearance, lighting, detail, left margin, proportions and exposed metal/insulation lengths${screenedCompact ? ', except insulation exposure which must follow SCREENED VVG COMPACT STRIPPING' : multicoreStripping || strippingComposition ? ', except the applicable insulated-core exposure amendment below' : ''}. Preserve these parameters; no artistic experiments. Rebuild internal geometry as required by the supplied technical contract: exact insulated core count, colours, actual conductor material, solid/stranded construction and documented layers/family details. Do not copy the reference core count when it differs from target. ${profile.conductorMaterial === 'aluminium' ? 'ALUMINIUM conductors, silver-grey, never copper.' : 'COPPER conductors.'} ${profile.conductorConstruction === 'solid' ? 'Each core contains one SOLID conductor.' : 'Each core is STRANDED; show fine wires inside each core, not extra insulated cores.'} EXACTLY ${profile.cores} insulated cores. Compact volumetric bundle, never flat fan. Intact body on RIGHT continues beyond right canvas edge; stripped end and bare conductor extensions on LEFT fully visible. Match reference bare-metal length with clear insulation boundary; no ferrules/lugs. Include only documented construction layers; never add screen/armour if false. True transparent PNG, no dark halos, haze, baked shadows, background residue, text or logos. Nominal section does not change overall reference scale. ${coreGeometryPrompt(geometryRequirements)} Target visualProfile: ${JSON.stringify(profile)}. Mandatory constraints: ${JSON.stringify(style.constraints)}. ${strippingComposition && !target ? strippingCompositionPrompt(strippingComposition, referenceInputs.find(input => input.role === 'FAMILY_PRIMARY')?.position ?? 1) : multicoreStrippingPrompt(multicoreStripping)} ${target && !geometryRevision && !cutRevision ? 'TARGETED EDIT: image 1 is the immutable generic STYLE reference only. Image 2 is the PREVIOUS GENERATION of the target cable and is the spatial edit target. Keep all target conductor ends anchored at their existing positions, same length and diameter. Move the black common jacket cut/opening to the RIGHT along the cable axis, exposing 25-30% more of each black insulated core than IMAGE 2. Do NOT move the copper ends left or scale any object. The elliptical jacket mouth moves right, the black insulation becomes visible in the newly uncovered area. Preserve jacket wall thickness, exact target core count, camera, tilt, canvas and global scale of image 2. This targeted 25-30% correction overrides the default 20-25% instruction. No extra ends. Do not transfer anatomy from image 1.' : ''} ${geometryPilot ? geometryPilotPrompt(geometryPilot, profile) : ''} ${outerSheathGeometryPrompt(profile)} ${geometryReference ? 'Supplemental user-approved construction reference exists for this exact profile; preserve its image through APPROVED reuse.' : ''} ${geometryRevision ? geometryRevisionPrompt(geometryRevision) : ''}`;
  assertCableIllustrationPrompt(activeRules, prompt);
  return {
    ruleTrace,
    standardVersion: style.version,
    standardSha256: PINNED_STYLE_SHA256,
    reference: { ...reference },
    endpoint: style.endpoint,
    model: style.model,
    prompt,
    profile,
    geometryRequirements,
    technicalProfile,
    visualCompositionContract,
    referenceSelection,
    ...(!target && { coreArrangement: { ...layout, mode: geometricInput ? 'GEOMETRIC_REFERENCE' : 'EXPLICIT_SCHEME' } }),
    multicoreStripping,
    multicoreComposition,
    strippingComposition,
    layerContact,
    editTarget: target,
    geometryPilot,
    geometryRevision,
    cutQuality,
    cutRevision,
    ...(galleryCorrection && { galleryCorrection }),
    geometryReference,
    outerSheathGeometry,
    config: {
      provider: style.provider,
      apiBaseUrl: style.baseUrl,
      apiKeyEnv: 'IMAGE_API_KEY',
      model: style.model,
      imageEndpoint: 'edits',
      referenceImage: path.join(root, reference.path),
      requiredReferenceSha256: reference.sha256,
      additionalReferenceImages: additionalReferences,
      size: '1536x1024',
      quality: 'high',
      format: 'png',
      background: 'transparent',
      timeoutMs: 300000,
      retries: 0,
      composition: { rightEdgeCrop: true },
    },
    approvedStyleReference,
    referenceStatus,
    referenceInputs,
    qualityStatus: 'NEEDS_REVIEW',
    automaticProductionBinding: false,
  };
}
/** New generations are draft-only. No catalogue or production-manifest code is imported. */
export async function generateCableStyleDraft({
  root,
  profile,
  outputDir,
  visualKey,
  requestOptions,
  env = process.env,
  providerFactory = createImageProvider,
  sku,
  dryRun = false,
  confirmedOnly = false,
  approvedSha,
}) {
  if (requestOptions?.geometryPilotSku || requestOptions?.geometryRevision || requestOptions?.strippingCorrection ||
      requestOptions?.editTarget || requestOptions?.vvgCutRevision || requestOptions?.vvgReviewRevision)
    throw Error('NEEDS_TECHNICAL_REVIEW: legacy generation modes are disabled');
  const catalog = await loadCableCatalogItem(root, sku);
  const style = await loadCableImageStyle(root);
  if (!Object.values(requestOptions ?? {}).some(Boolean) && !profile && !visualKey) {
    const existing = await findExistingCatalogCable({root,catalog,style});
    if (existing) return {
      status: 'EXISTING_STANDARD_APPROVED', approvedDraftDir: existing.absoluteDraftDir,
      sha256: existing.sha256, visualKey: existing.visualKey, automaticProductionBinding: false,
    };
  }
  if (catalog.issues.length)
    throw Error('NEEDS_TECHNICAL_REVIEW: ' + catalog.issues.join(' | '));
  if (confirmedOnly && catalog.profile.schematicAssumptions)
    throw Error('NEEDS_TECHNICAL_REVIEW: catalog construction is incomplete for ' + sku +
      ' (' + Object.keys(catalog.profile.schematicAssumptions).join(', ') + ')');
  if ((profile && hash(JSON.stringify(profile)) !== hash(JSON.stringify(catalog.profile))) ||
      (visualKey && visualKey !== catalog.visualKey))
    throw Error('NEEDS_TECHNICAL_REVIEW: requested construction differs from the catalog');
  profile = catalog.profile;
  visualKey = catalog.visualKey;
  const reusable = !requestOptions?.correctionSourceSha &&
    await selectReusableCableResults({
      root, visualKey, profile, family: catalog.product.markFamily,
      request: approvedCableVerificationContext(style, profile),
      catalog, includeAlternatives: dryRun,
    });
  const { selected, alternatives } = reusable || {};
  const approved = approvedSha && selected?.sha256 !== approvedSha
    ? alternatives?.find(option => option.sha256 === approvedSha)
    : selected;
  if (approvedSha && !approved?.APPROVED_FOR_CATALOG)
    throw Error('NEEDS_REVIEW: approve this exact PNG for the SKU in the gallery first: ' + sku);
  if (approved)
    return {
      status: 'APPROVED_DRAFT_NOT_PUBLISHED',
      approvedDraftDir: approved.absoluteDraftDir,
      validation: approved.validation,
      automaticProductionBinding: false,
      ...(dryRun && {
        sha256: approved.sha256,
        visualKey: approved.visualKey,
        catalogAllowed: approved.APPROVED_FOR_CATALOG === true,
        equivalent: approved.equivalent,
        reusePolicy: approved.reusePolicy,
        alternatives: alternatives.map(({ sha256, visualKey }) => ({ sha256, visualKey })),
      }),
    };
  if (requestOptions?.layoutRevision) {
    const { sha256, sku: revisionSku, draftDir } = requestOptions.layoutRevision;
    const prior = await fs.realpath(path.resolve(root, draftDir));
    const outputRoot = await fs.realpath(path.join(root, 'outputs'));
    if (!prior.startsWith(outputRoot + path.sep)) throw Error('Layout revision source must be an existing draft');
    const decisions = await loadCableReviewDecisions(root);
    if (!decisions.some(({ decision }) => decision.sha256 === sha256 &&
        decision.status === 'NEEDS_REVIEW' && decision.disposition === 'NEEDS_CORRECTION'))
      throw Error('Layout revision requires a durable correction decision');
    const [png, old] = await Promise.all([fs.readFile(path.join(prior, 'image.png')),
      fs.readFile(path.join(prior, 'group.json'), 'utf8').then(JSON.parse)]);
    if (sku !== revisionSku || old.status !== 'NEEDS_REVIEW' || old.visualKey !== visualKey ||
        hash(png) !== sha256 || !old.members.some(member => member.sku === sku))
      throw Error('Perimeter layout correction requires the exact pending draft');
  }
  if (requestOptions?.referenceChoices || requestOptions?.galleryCorrection)
    throw Error('Choose correction references through the review gallery.');
  const correctionSha = requestOptions?.correctionSourceSha ?? requestOptions?.layoutRevision?.sha256;
  const registry = correctionSha && JSON.parse(await fs.readFile(path.join(root,'data/cable-approved-results/registry.json'), 'utf8'));
  const correction = registry && cableRegistryReview(registry, correctionSha);
  const savedCorrection = correction?.catalog === 'NEEDS_CORRECTION' ? correction.correction : null;
  let galleryCorrection = null;
  if (requestOptions?.correctionSourceSha) {
    if (requestOptions.editTarget || requestOptions.layoutRevision || !/^[a-f0-9]{64}$/u.test(correctionSha) ||
        savedCorrection?.visualKey !== visualKey || savedCorrection?.profileHash !== hash(JSON.stringify(profile)))
      throw Error('The gallery correction does not match this catalog profile');
    const event = registry.reviewBySha256[correctionSha].at(-1);
    galleryCorrection = { sha256:correctionSha, decisionHash:event.hash,
      reason:savedCorrection.reason, note:event.note };
  }
  const preferred = savedCorrection?.references;
  let referenceChoices = null;
  if (preferred?.primary || preferred?.geometry) {
    const assigned = await cableGroupReferenceChoices(root, profile);
    referenceChoices = {
      primary: preferred.primary || (assigned?.primary === preferred.geometry ? '' : assigned?.primary),
      geometry: preferred.geometry || (assigned?.geometry === preferred.primary ? '' : assigned?.geometry),
    };
  }
  const request = await buildCableStyleRequest(root, profile, style, { ...requestOptions, referenceChoices, galleryCorrection });
  request.catalogSource = catalog.source;
  let claims;
  if (!request.cutRevision || requestOptions?.layoutRevision || galleryCorrection) {
    const bindings = await fs.readFile(path.join(root, 'shared/generatedProductImages.json'), 'utf8')
      .then(JSON.parse).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
    if (bindings?.bySku?.[sku]?.status === 'approved')
      throw Error('NEEDS_TECHNICAL_REVIEW: existing catalog image requires explicit reconciliation: ' + sku);
    if (await findHistoricalCatalogApproval(root, sku, profile))
      return { status: 'HISTORICAL_PROFILE_REVIEW_REQUIRED', cached: true, automaticProductionBinding: false };
    claims = !requestOptions?.layoutRevision && await readCableGenerationClaims(root);
    const previous = galleryCorrection && findCableGenerationClaim(claims, profile);
    const hold = previous?.status === 'REQUEST_OUTCOME_UNKNOWN' ? previous :
      claims && await findHistoricalCatalogClaim(sku, profile, galleryCorrection
      ? new Map([...claims].filter(([, claim]) => claim.status === 'REQUEST_OUTCOME_UNKNOWN'))
      : claims);
    if (hold) return {
      ...hold, originalStatus: hold.status, status: 'HISTORICAL_PROFILE_REVIEW_REQUIRED',
      cached: true, automaticProductionBinding: false,
    };
  }
  if (dryRun) {
    const key = cableGenerationReservationKey(profile, request.cutRevision);
    const originalKey = cableGenerationClaimKey(profile, request.cutRevision);
    const records = claims || await readCableGenerationClaims(root, key === originalKey ? key : undefined);
    const previous = findCableGenerationClaim(records, profile, request.cutRevision, key);
    if (previous) return previous;
    const { config, ...preview } = request;
    return { status: 'PREPARED_NOT_SENT', sku, visualKey, request: preview };
  }
  const output = path.resolve(outputDir);
  if (!output.startsWith(path.join(root, 'outputs') + path.sep))
    throw Error('Draft output must be inside outputs/');
  await fs.mkdir(output, { recursive: true });
  const occupied = await reserveCableGeneration({ root, profile, sku, outputDir: output, visualKey, revision: request.cutRevision });
  if (occupied) return { ...occupied, cached: true, cache: true, automaticProductionBinding: false };
  const claim = path.join(output, 'request.json');
  await fs.writeFile(
    claim,
    JSON.stringify(
      { ...request, visualKey, config: undefined, status: 'requesting' },
      null,
      2
    ),
    { flag: 'wx' }
  );
  let responseReceived = false;
  try {
    const result = await providerFactory(request.config, { env }).generate({
      prompt: request.prompt,
    });
    responseReceived = true;
    await fs.writeFile(path.join(output, 'image.png'), result.buffer, {
      flag: 'wx',
    });
    const validation = validateCableImagePng(result.buffer, {
      background: 'transparent',
      composition: request.config.composition,
    });
    const metadata = {
      ruleTrace: request.ruleTrace,
      standardVersion: request.standardVersion,
      referenceSha256: request.reference.sha256,
      model: request.model,
      httpStatus: result.httpStatus,
      validation,
      compositionCheck: validation.compositionCheck,
      multicorePixelReview: request.multicoreComposition
        ? inspectMulticoreComposition(PNG.sync.read(result.buffer), validation, profile, request.technicalProfile)
        : null,
      geometryRequirements: request.geometryRequirements,
      technicalProfile: request.technicalProfile,
      visualCompositionContract: request.visualCompositionContract,
      multicoreStripping: request.multicoreStripping,
      multicoreComposition: request.multicoreComposition,
      strippingComposition: request.strippingComposition,
      layerContact: request.layerContact,
      geometryPilot: request.geometryPilot,
      geometryRevision: request.geometryRevision,
      outerSheathGeometry: request.outerSheathGeometry,
      constructionCheck: request.technicalProfile.verification,
      geometryCheck: {
        status: 'NEEDS_REVIEW',
        pixelVerification: 'NOT_AUTOMATED',
        checks: CABLE_STYLE_REVIEW_CHECKS,
      },
      status: 'NEEDS_REVIEW',
      automaticProductionBinding: false,
      manualChecksRequired: [...new Set([
        ...CABLE_STYLE_REVIEW_CHECKS, ...CABLE_FRAME_REVIEW_CHECKS, ...(request.cutQuality?.checks ?? []),
        ...multicoreCompositionReviewChecks(request.multicoreComposition),
        ...selectCableIllustrationRules(profile, request.technicalProfile, { editTarget: Boolean(request.editTarget) })
          .flatMap(rule => rule.review ?? []),
      ])],
    };
    await fs.writeFile(
      path.join(output, 'review.json'),
      JSON.stringify(metadata, null, 2)
    );
    const { product, source } = catalog;
    await fs.writeFile(path.join(output, 'group.json'), JSON.stringify({
      ...metadata, visualKey, profile, catalogSource: source,
      members: [{ sku, name: product.name, productHash: hash(JSON.stringify(product)), oldBinding: null }],
    }, null, 2), { flag: 'wx' });
    return metadata;
  } catch (error) {
    await fs.writeFile(
      path.join(output, 'review.json'),
      JSON.stringify(
        {
          status: error.httpStatus == null && !responseReceived
            ? 'REQUEST_OUTCOME_UNKNOWN' : 'FAILED',
          httpStatus: error.httpStatus ?? null,
          reason: error.message,
          automaticProductionBinding: false,
        },
        null,
        2
      )
    );
    throw error;
  }
}

function geometryRevisionPrompt(kind) {
  const common =
    'TARGETED GEOMETRY REVISION: Image 1 is the protected style reference ONLY. Image 2 is the exact PREVIOUS GENERATION to edit. Preserve image 2 scale, material, core diameters, metal-end length, tilt, direction, lighting and transparent canvas. Do not enlarge or globally shrink/stretch the object. ';
  return (
    common +
    (kind === 'tight-flat-sheath'
      ? 'SHVVP: change ONLY the black common sheath fit. Bring the sheath side walls inward so they closely hug the TWO existing brown/blue insulated stranded-copper cores, with no oversized empty side cavities. Keep normal thin wall thickness and the genuinely FLAT/OVAL capsule cross-section, not a circular tube. Do not shrink the two cores. Exactly two copper bundles. No new layers, no armor/screen.'
      : 'SIP-4: gently bring the FOUR stripped ends and nearby insulated tips closer toward one central compact cluster. Remove the visual separation into two widely spaced pairs. Keep every end separately readable, four BLACK individually insulated stranded-ALUMINIUM cores, same diameters and length. Preserve right-side helical twist and overall bundle scale. Do NOT add a common outer jacket or a fifth carrier conductor; no SIP-2 construction.')
  );
}
