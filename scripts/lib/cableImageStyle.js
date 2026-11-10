import { selectApprovedStyleReference } from './cableApprovedStyleReference.js';
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
import { findApprovedCableResult } from './cableApprovedResults.js';
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
export async function prepareCableStyleRequest(
  root,
  profile,
  {
    geometryInput = {},
    editTarget = null,
    strippingCorrection = null,
    geometryPilotSku = null,
    geometryRevision = null,
  } = {}
) {
  const style = await loadCableImageStyle(root);
  const geometryPilot = geometryPilotSku
    ? await prepareGeometryPilot(root, profile, geometryPilotSku)
    : null;
  const geometryReference = await findApprovedGeometryReference(root, profile);
  const outerSheathGeometry = deriveOuterSheathGeometry(profile);
  if (outerSheathGeometry === 'UNKNOWN')
    throw Error('NEEDS_TECHNICAL_REVIEW: outer sheath geometry unknown');
  if (profile?.coreLayout)
    throw Error(
      'NEEDS_REVIEW: mixed-size core layout needs explicit reviewed construction/colour mapping'
    );
  const geometryRequirements = deriveCableCoreGeometry(profile, geometryInput);
  if (geometryRequirements.status === 'NEEDS_REVIEW')
    throw Error('NEEDS_REVIEW: ' + geometryRequirements.reason);
  if (geometryRequirements.mode === 'MIXED')
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
  if (
    !geometryPilot &&
    !geometryReference &&
    (profile.geometry !== 'round' || profile.hasOuterJacket !== true)
  )
    throw Error(
      'NEEDS_REVIEW: no approved reference for this geometry/jacket construction'
    );
  if (
    typeof profile.armor !== 'boolean' ||
    typeof profile.shield !== 'boolean' ||
    (profile.armor && !profile.armorType)
  )
    throw Error('NEEDS_REVIEW: layer construction unknown');
  if (
    profile.armor &&
    !['steel-tapes', 'steel-wires'].includes(profile.armorType)
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
  let multicoreStripping = deriveMulticoreStrippingRule(profile);
  let target = null;
  if (editTarget || strippingCorrection || geometryRevision) {
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
      !geometryRevision &&
      (!editTarget ||
        !strippingCorrection ||
        !multicoreStripping ||
        strippingCorrection.min !== 1.25 ||
        strippingCorrection.max !== 1.3)
    )
      throw Error('NEEDS_REVIEW: unsupported targeted stripping correction');
    const targetPath = path.resolve(root, editTarget);
    if (!targetPath.startsWith(path.join(root, 'outputs') + path.sep))
      throw Error('Edit target must be a saved draft inside outputs');
    const bytes = await fs.readFile(targetPath);
    validateCableImagePng(bytes, {
      background: 'transparent',
      composition: { rightEdgeCrop: false },
    });
    target = {
      path: targetPath,
      sha256: hash(bytes),
      role: 'previous-generation-edit-target',
    };
    if (!geometryRevision)
      multicoreStripping = {
        ...multicoreStripping,
        insulatedCoreExposedLengthRatio: { min: 1.25, max: 1.3 },
        correctionBaseline: target,
        correction:
          'Move jacket cut RIGHT relative to fixed bare-metal ends; no global scaling',
      };
  }
  let approvedStyleReference = null;
  try {
    approvedStyleReference = await selectApprovedStyleReference(root, profile);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.message !== 'No compatible manually APPROVED reference')
      throw error;
  }
  const strippingComposition = deriveStrippingCompositionPreference(profile);
  const layerContact = deriveLayerContactRule(profile);
  const prompt =
    technicalProfilePrompt(technicalProfile) + layerContactPrompt(layerContact) +
    ` Use the attached USER-APPROVED ${type} reference as the mandatory visual standard, version ${style.version}. This reference defines style, scale, composition, tilt, camera, materials appearance, lighting, detail, left margin, proportions and exposed metal/insulation lengths${multicoreStripping || strippingComposition ? ', except the applicable insulated-core exposure amendment below' : ''}. Preserve these parameters; no artistic experiments. Rebuild internal geometry as required by the supplied technical contract: exact insulated core count, colours, actual conductor material, solid/stranded construction and documented layers/family details. Do not copy the reference core count when it differs from target. ${profile.conductorMaterial === 'aluminium' ? 'ALUMINIUM conductors, silver-grey, never copper.' : 'COPPER conductors.'} ${profile.conductorConstruction === 'solid' ? 'Each core contains one SOLID conductor.' : 'Each core is STRANDED; show fine wires inside each core, not extra insulated cores.'} EXACTLY ${profile.cores} insulated cores. Compact volumetric bundle, never flat fan. Intact body on RIGHT continues beyond right canvas edge; stripped end and bare conductor extensions on LEFT fully visible. Match reference bare-metal length with clear insulation boundary; no ferrules/lugs. Include only documented construction layers; never add screen/armour if false. True transparent PNG, no dark halos, haze, baked shadows, background residue, text or logos. Nominal section does not change overall reference scale. ${coreGeometryPrompt(geometryRequirements)} Target visualProfile: ${JSON.stringify(profile)}. Mandatory constraints: ${JSON.stringify(style.constraints)}. ${strippingComposition && !target ? strippingCompositionPrompt(strippingComposition) : multicoreStrippingPrompt(multicoreStripping)} ${target && !geometryRevision ? 'TARGETED EDIT: image 1 is the immutable generic STYLE reference only. Image 2 is the PREVIOUS GENERATION of this exact 7-core cable and is the spatial edit target. Keep all seven copper ends anchored at their existing positions, same length and diameter. Move the black common jacket cut/opening to the RIGHT along the cable axis, exposing 25-30% more of each black insulated core than IMAGE 2. Do NOT move the copper ends left or scale any object. The elliptical jacket mouth moves right, the black insulation becomes visible in the newly uncovered area. Preserve jacket wall thickness, seven cores, camera, tilt, canvas and global scale of image 2. This targeted 25-30% correction overrides the default 20-25% instruction. No extra ends. Do not transfer 27-core anatomy from image 1.' : ''} ${geometryPilot ? geometryPilotPrompt(geometryPilot, profile) : ''} ${outerSheathGeometryPrompt(profile)} ${geometryReference ? 'Supplemental user-approved construction reference exists for this exact profile; preserve its image through APPROVED reuse.' : ''} ${geometryRevision ? geometryRevisionPrompt(geometryRevision) : ''}`;
  return {
    standardVersion: style.version,
    standardSha256: PINNED_STYLE_SHA256,
    reference: { ...reference },
    endpoint: style.endpoint,
    model: style.model,
    prompt,
    profile,
    geometryRequirements,
    technicalProfile,
    multicoreStripping,
    strippingComposition,
    layerContact,
    editTarget: target,
    geometryPilot,
    geometryRevision,
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
      additionalReferenceImages: [
        ...(target ? [target] : []),
        ...(!target && approvedStyleReference ? [{
          path: approvedStyleReference.path,
          sha256: approvedStyleReference.sha256,
          role: 'manually-approved-compatible-style',
        }] : []),
      ],
      size: '1536x1024',
      quality: 'high',
      format: 'png',
      background: 'transparent',
      timeoutMs: 300000,
      retries: 0,
      composition: { rightEdgeCrop: true },
    },
    approvedStyleReference,
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
}) {
  const request = await prepareCableStyleRequest(root, profile, requestOptions);
  const approved = await findApprovedCableResult({
    root,
    visualKey,
    profile,
    request,
  });
  if (approved)
    return {
      status: 'APPROVED_DRAFT_NOT_PUBLISHED',
      approvedDraftDir: approved.absoluteDraftDir,
      validation: approved.validation,
      automaticProductionBinding: false,
    };
  const output = path.resolve(outputDir);
  if (!output.startsWith(path.join(root, 'outputs') + path.sep))
    throw Error('Draft output must be inside outputs/');
  await fs.mkdir(output, { recursive: true });
  const claim = path.join(output, 'request.json');
  await fs.writeFile(
    claim,
    JSON.stringify(
      { ...request, config: undefined, status: 'requesting' },
      null,
      2
    ),
    { flag: 'wx' }
  );
  try {
    const result = await providerFactory(request.config, { env }).generate({
      prompt: request.prompt,
    });
    await fs.writeFile(path.join(output, 'image.png'), result.buffer, {
      flag: 'wx',
    });
    const validation = validateCableImagePng(result.buffer, {
      background: 'transparent',
      composition: request.config.composition,
    });
    const metadata = {
      standardVersion: request.standardVersion,
      referenceSha256: request.reference.sha256,
      model: request.model,
      httpStatus: result.httpStatus,
      validation,
      compositionCheck: validation.compositionCheck,
      geometryRequirements: request.geometryRequirements,
      technicalProfile: request.technicalProfile,
      multicoreStripping: request.multicoreStripping,
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
      manualChecksRequired: CABLE_STYLE_REVIEW_CHECKS,
    };
    await fs.writeFile(
      path.join(output, 'review.json'),
      JSON.stringify(metadata, null, 2)
    );
    return metadata;
  } catch (error) {
    await fs.writeFile(
      path.join(output, 'review.json'),
      JSON.stringify(
        {
          status: 'FAILED',
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
