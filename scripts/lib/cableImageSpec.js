import { createHash } from 'node:crypto';
import { parseProductName } from './priceParser.js';
import {
  CableImageInputError,
  getCableVisualConfig,
  getCableVisualFamily,
} from './cableImageVisual.js';
export { CableImageInputError } from './cableImageVisual.js';

export const CABLE_IMAGE_ORIENTATION =
  'The intact cable body enters the frame from the RIGHT side. The stripped end and separated conductors extend toward the LEFT side. Exposed copper conductor tips are on the LEFT. Never reverse or mirror this orientation.';

export const hashImageData = (value) =>
  createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value)
    )
    .digest('hex');

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const markKey = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/Ё/gu, 'Е');

function reject(reason) {
  throw new CableImageInputError(reason);
}

/** Opaque YU SKU identifies a record; NxS is parsed from that record, never from its digits. */
export function parseCableImageProduct(product, config, colorRules) {
  const sku = String(product.sku || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(sku))
    reject('Missing or unsafe SKU');
  const sourceName = String(
    product.sourceName ||
      product.fullName ||
      product.name ||
      product.title ||
      ''
  ).trim();
  if (!sourceName) reject('Missing product designation');
  const parsed = parseProductName(sourceName);
  if (parsed.parsingWarnings?.length || product.parsingWarnings?.length)
    reject('Ambiguous or malformed cable specification');
  if (
    parsed.groupCores ||
    product.groupCores ||
    parsed.conductorConfiguration ||
    product.conductorConfiguration
  ) {
    reject(
      'Grouped, paired or annotated configurations need a dedicated visual preset'
    );
  }
  for (const field of [
    'cores',
    'crossSection',
    'groundCores',
    'groundSection',
  ]) {
    if (
      positive(parsed[field]) &&
      positive(product[field]) &&
      Number(parsed[field]) !== Number(product[field])
    ) {
      reject(`Designation and structured data disagree: ${field}`);
    }
  }
  const primaryCores = Number(parsed.cores ?? product.cores);
  const section = Number(parsed.crossSection ?? product.crossSection);
  const groundCores = Number(parsed.groundCores ?? product.groundCores ?? 0);
  const groundSection = parsed.groundSection ?? product.groundSection ?? null;
  const cores = primaryCores + groundCores;
  if (
    !Number.isInteger(primaryCores) ||
    primaryCores < 1 ||
    !Number.isInteger(groundCores) ||
    groundCores < 0 ||
    !positive(section)
  )
    reject('Missing valid cores/section');
  if (groundCores > 0 && !positive(groundSection))
    reject('Missing auxiliary section');
  const attributes = [
    ...new Set([...(parsed.attributes || []), ...(product.attributes || [])]),
  ];
  if (attributes.some((value) => /FR|HF|^Э(?:Ф|М|А|Э)?$|^Б$/iu.test(value))) {
    reject('Fire barrier, shield or armour requires a dedicated visual preset');
  }
  let family = markKey(parsed.mark || product.mark);
  if (
    attributes.some((value) => /^п$/iu.test(value)) &&
    config.families[`${family}-П`]
  )
    family += '-П';
  const preset = config.families[family];
  if (!preset) reject(`Unsupported family: ${family}`);
  const override = colorRules.skuOverrides[sku];
  const profile = preset.colors;
  const colors =
    override?.colors || colorRules.profiles[profile]?.[String(cores)];
  if (
    !Array.isArray(colors) ||
    colors.length !== cores ||
    colors.some((color) => typeof color !== 'string' || !color.trim())
  ) {
    reject(`No exact color rule for ${profile}, ${cores} cores`);
  }
  const visualFamily = getCableVisualFamily({ family, attributes }, config);
  const constructionRule = {
    ...config.visualRules.default,
    ...config.visualRules.families?.[family],
    ...config.visualRules.families?.[visualFamily],
  };
  const explicitStranded = attributes.some((value) =>
    /^(мк|мж|мс)$/iu.test(value)
  );
  const explicitSolid = attributes.some((value) =>
    /^(ок|ож|ос)$/iu.test(value)
  );
  if (explicitStranded && explicitSolid)
    reject('Conflicting conductor construction');
  const strand = attributes.some((value) => /^(мк|мж|мс)$/iu.test(value))
    ? 'stranded'
    : attributes.some((value) => /^(ок|ож|ос)$/iu.test(value))
      ? 'solid'
      : constructionRule.conductorConstruction || 'solid';
  const explicitJacket = attributes
    .map((value) => String(value).toLowerCase().replace(/[().]/gu, '').trim())
    .map((value) => preset.jacketByAttribute?.[value])
    .find(Boolean);
  const result = {
    sku,
    productId: product.id ?? null,
    sourceName,
    family,
    primaryCores,
    cores,
    section,
    groundCores,
    groundSection,
    voltage: parsed.voltage ?? product.voltage ?? null,
    attributes,
    shape: preset.shape,
    material: preset.material,
    strand,
    conductorConstructionSource:
      explicitStranded || explicitSolid
        ? 'designation'
        : constructionRule.constructionSource ||
          'catalogue visual default; not a technical claim for this SKU',
    jacket: explicitJacket || preset.jacket,
    insulation: preset.insulation,
    colors: [...colors],
    colorRule: override ? `sku:${sku}` : `${profile}:${cores}`,
    colorRuleVersion: colorRules.version,
    colorSource:
      override?.source || 'configured catalogue illustration convention',
  };
  const visual = getCableVisualConfig(result, config, colorRules);
  return {
    ...result,
    visualFamily: visual.family,
    sectionAffectsVisual: visual.sectionAffectsVisual,
    sectionMode: visual.sectionMode,
    thicknessLabel: visual.thicknessLabel,
  };
}

export function buildCableImagePrompt(spec, config) {
  const colorList = spec.colors
    .map(
      (color, i) =>
        `${i + 1}. ${color === 'yellow-green' ? 'one yellow-and-green striped PE conductor (one wire, not two)' : color}`
    )
    .join('; ');
  const metal = spec.material === 'aluminium' ? 'silvery aluminium' : 'copper';
  const jacketColor = spec.jacket.split(' ')[0];
  const framing = config.composition || {
    rightEdgeCrop: true,
    tiltDegrees: 8,
    leftMarginRatio: 0.06,
    verticalMarginRatio: 0.1,
    sheathTransitionRatio: 0.56,
  };
  const construction =
    spec.strand === 'stranded'
      ? `Verified construction exception for this family/designation: stranded ${metal} conductors. Show one compact neat bundle of fine ${metal} strands inside each insulated core, not additional insulated wires. Do not replace this known flexible construction with a solid rod.`
      : `Use solid-core ${metal} conductors: one single solid round ${metal} conductor inside each insulated core. Each stripped end shows ONE smooth continuous circular metal rod with a solid circular cross-section. ${metal === 'copper' ? 'not stranded copper; not a bundle of thin copper strands.' : 'Not stranded aluminium; not a bundle of thin strands.'} Never show a brush, braid, multiple fine wires or a split metal tip. This is the catalogue illustration default, not a claim that every real SKU is solid-core.`;
  return [
    'Use case: product-mockup. Create one standardized realistic professional 3D product render for an electrical cable catalogue. Stable composition, realistic materials and soft neutral studio lighting.',
    `Cable family: ${spec.visualFamily || spec.family}. Shape: ${spec.shape}. Matte ${spec.jacket} outer jacket; ${spec.insulation} insulation. Preserve this configured jacket color and construction.`,
    CABLE_IMAGE_ORIENTATION.replace('copper', metal),
    `The intact ${jacketColor} outer cable jacket extends all the way to and beyond the RIGHT edge of the image. The cable enters the image directly through the RIGHT frame boundary. The right end of the cable is intentionally cropped by the image boundary. No visible end cap or termination of the outer jacket on the right. No empty transparent space between the cable and the right edge. The body must cross the right border, not merely approach it.`,
    `Fixed catalogue camera and pose: predominantly horizontal, shallow three-quarter perspective, with a consistent gentle ${framing.tiltDegrees}-degree diagonal inclination. The intact jacket axis rises gently toward the RIGHT and descends slightly toward the LEFT, as in the original catalogue reference. Never perfectly horizontal, never steep, never vertical, no random camera angle.`,
    `Fixed layout: the stripping transition is near ${Math.round(framing.sheathTransitionRatio * 100)}% of canvas width; the leftmost ${metal} tips begin near ${Math.round(framing.leftMarginRatio * 100)}%; the unbroken jacket continues from the transition through 100% of width and beyond the right border. The cable fills most of the useful canvas width. No oversized empty padding. Keep at least ${Math.round(framing.verticalMarginRatio * 100)}% safe space above and below every tip and insulated core.`,
    `The stripped end and all separated cores face LEFT. ALL ${spec.cores} metal tips and insulated ends on the left must be completely visible, with the same small left margin. Never crop the left tips, top or bottom. Only the intact outer jacket on the RIGHT is intentionally cropped.`,
    `Exactly ${spec.cores} insulated conductors are visible. There must be exactly ${spec.cores} conductors, no more and no fewer. Show all ${spec.cores} separately with exactly ${spec.cores} exposed ${metal} tips on the LEFT. No extra wire.`,
    `Conductor colors, one assignment per insulated wire: ${colorList}. Never add a conductor for a color stripe. Separate and fan the cores gently so that every specified core and tip can be counted, while keeping all cores connected inside the jacket.`,
    construction,
    `Thickness treatment: ${spec.thicknessLabel}. ${spec.sectionMode === 'constant' ? 'Nominal section is metadata only. Use the same visual thickness for all sections in this visual group. Do not calculate diameter from cross-sectional area.' : 'Use the configured qualitative thickness band consistently, without physical diameter modelling.'}`,
    config.imageEndpoint === 'edits' && config.referenceImage
      ? 'Use the supplied original reference for the shallow diagonal camera, right-edge crop of the jacket, solid round conductors where configured, gentle core fan and catalogue materials. Do not copy logos or text.'
      : 'Follow the original catalogue reference described above: right-border jacket entry, gentle rising-right diagonal, clearly separated left-pointing cores, smooth solid round metal tips where configured, consistent scale and materials.',
    'Genuinely transparent PNG background with real alpha. No black, white or grey backdrop; no painted checkerboard. No glow, colored halos, bloom, floor, scenery or background shadows. Clean isolated product edges, moderate natural highlights.',
    'No text, markings, labels, symbols, dimensions, logos, watermark, hands or other objects. Do not mirror the composition.',
    `Final check: exactly ${spec.cores} cores and ${spec.cores} metal tips; intact jacket crosses the RIGHT frame boundary with no end cap and no right gap; all LEFT tips fully visible; gentle fixed diagonal; correct conductor construction; transparent background. Template ${config.templateVersion}.`,
  ].join('\n\n');
}

export function buildCableImageJob(product, config, colorRules, referenceHash) {
  const parameters = parseCableImageProduct(product, config, colorRules);
  const prompt = buildCableImagePrompt(parameters, config);
  const visual = getCableVisualConfig(parameters, config, colorRules);
  const renderFingerprint = hashImageData({
    provider: config.provider,
    apiBaseUrl: config.apiBaseUrl,
    imageEndpoint: config.imageEndpoint,
    normalization: config.normalization,
    prompt,
    referenceHash,
    model: config.model,
    size: config.size,
    quality: config.quality,
    format: config.format,
    background: config.background,
  });
  return {
    sku: parameters.sku,
    product_id: parameters.productId,
    source_name: parameters.sourceName,
    product_name:
      product.fullName ||
      product.name ||
      product.title ||
      parameters.sourceName,
    parameters,
    prompt,
    prompt_hash: hashImageData(prompt),
    visual_key: visual.visualKey,
    visualKey: visual.visualKey,
    visual_descriptor: visual.descriptor,
    visual_descriptor_hash: visual.descriptorHash,
    sectionAffectsVisual: visual.sectionAffectsVisual,
    render_fingerprint: renderFingerprint,
    legacy_render_fingerprint: hashImageData({
      prompt: buildCableImagePrompt(
        { ...parameters, visualFamily: undefined },
        config
      ),
      referenceHash,
      model: config.model,
      size: config.size,
      quality: config.quality,
      format: config.format,
      background: config.background,
    }),
    product_fingerprint: hashImageData({
      sku: parameters.sku,
      id: parameters.productId,
      name: parameters.sourceName,
      cores: parameters.cores,
      section: parameters.section,
      groundSection: parameters.groundSection,
    }),
    reference_hash: referenceHash,
    template_version: config.templateVersion,
    model: config.model,
    provider: config.provider,
    size: config.size,
    quality: config.quality,
    format: config.format,
    composition: config.composition,
    style_reference: config.referenceImage || null,
    style_reference_hash: config.styleReferenceHash || null,
  };
}
