import { deriveCableCoreGeometry } from './cableCoreGeometry.js';
import { deriveOuterSheathGeometry } from './cableOuterSheathGeometry.js';
import historicalRules from '../../data/cableTechnicalConstructionRules.json' with { type: 'json' };
import screenVisualStandard from '../../data/cableScreenVisualStandard.json' with { type: 'json' };
/** Construction contract is independent of the style PNG. No inferred filler layers. */
export const TECHNICAL_REQUEST_VERSION = 'construction-contract-4';
export function buildCableTechnicalProfile(p) {
  const fail = (s) => {
    throw Error('NEEDS_REVIEW: ' + s);
  };
  if (
    !p ||
    !Number.isInteger(p.cores) ||
    p.cores < 1 ||
    p.coreColors?.length !== p.cores
  )
    fail('exact cores/colors required');
  if (
    !['copper', 'aluminium'].includes(p.conductorMaterial) ||
    !['solid', 'stranded'].includes(p.conductorConstruction)
  )
    fail('unknown conductor');
  if (
    typeof p.armor !== 'boolean' ||
    typeof p.shield !== 'boolean' ||
    !Array.isArray(p.specialElements)
  )
    fail('unknown construction flags');
  if ((!p.armor && p.armorType) || (!p.shield && p.shieldType))
    fail('conflicting layer flags');
  if (p.armor && !['steel-tapes', 'steel-wires', 'corrugated-steel-tape'].includes(p.armorType) &&
      !(p.armorType === 'schematic-armor' && p.schematicAssumptions?.['Тип брони']))
    fail('unknown armor');
  if (
    p.specialElements.some(
      (x) =>
        !['fire-barrier', 'drain-wire', 'twisted-insulated-cores'].includes(x)
    )
  )
    fail('unknown special layer');
  const groupSize = p.pairedGroupSize ?? 1;
  if (![1, 2, 3, 4].includes(groupSize) || p.cores % groupSize !== 0)
    fail('group size does not divide the exact insulated core count');
  const mixed = p.coreLayout?.sectionGroups && deriveCableCoreGeometry(p);
  if (mixed?.status === 'NEEDS_REVIEW') fail(mixed.reason);
  const diameters = mixed?.metalDiameterGroups.flatMap(group =>
    Array(group.count).fill(group.relativeDiameter));
  const supplied = p.technicalConstruction;
  const catalogStrict = supplied?.source === 'catalog-construction-1';
  // Legacy rules only interpret archived profiles. A catalog profile supplies every layer.
  const explicit = supplied || historicalRules.families[p.family];
  const fire = p.specialElements.includes('fire-barrier');
  if ((fire || /frls/i.test(p.family || '')) && !explicit)
    fail('manufacturer fire barrier documentation required');
  if (
    explicit &&
    (!explicit.source ||
      typeof explicit.fireBarrier !== 'boolean' ||
      typeof explicit.screen !== 'boolean' ||
      typeof explicit.armor !== 'boolean')
  )
    fail('unconfirmed technical construction');
  if (
    explicit &&
    (explicit.armor !== p.armor ||
      explicit.screen !== p.shield ||
      explicit.fireBarrier !== fire)
  )
    fail('technical construction conflicts with profile flags');
  if (
    explicit?.fireBarrier &&
    (explicit.fireBarrierMaterial !== 'mica-containing-tapes' ||
      explicit.fireBarrierPlacement !==
        'around-each-conductor-under-individual-insulation')
  )
    fail('unsupported or unknown fire barrier material/placement');
  const innerMaterial = explicit?.innerSheath;
  if (
    innerMaterial != null &&
    innerMaterial !== false &&
    (typeof innerMaterial !== 'string' || !innerMaterial.trim())
  )
    fail('inner sheath material requires documentation');
  const innerSheath = {
    status: innerMaterial === false ? 'absent' : innerMaterial || (catalogStrict && explicit.innerSheathPresent === true) ? 'present' : 'unknown',
    material: innerMaterial || null,
  };

  const interstitialFilling = explicit?.interstitialFilling ?? { status: 'unknown' };
  if (
    !['present', 'absent', 'unknown'].includes(interstitialFilling.status) ||
    (interstitialFilling.status === 'present' &&
      (p.cores < 2 ||
        ((!catalogStrict || interstitialFilling.material != null) &&
          (typeof interstitialFilling.material !== 'string' || !interstitialFilling.material.trim())) ||
        typeof interstitialFilling.placement !== 'string' ||
        !interstitialFilling.placement.trim()))
  )
    fail('interstitial filling requires documented material and placement');
  if (
    interstitialFilling.status !== 'present' &&
    (interstitialFilling.material || interstitialFilling.placement)
  )
    fail('conflicting interstitial filling details');

  const outerSheath = {
    status: p.hasOuterJacket === true ? 'present' : p.hasOuterJacket === false ? 'absent' : 'unknown',
    appearance: p.hasOuterJacket === true ? p.outerJacket || 'catalog polymer' : null,
  };

  // Screen presence remains technical. Appearance is a universal symbolic convention.
  // Actual screen type may be unknown; do not fabricate a manufacturer specification.
  const screenType = explicit?.screenType || p.shieldType || null;
  const screenAppearance = screenVisualStandard.appearance;
  const layers = outerSheath.status === 'present'
    ? [
        {
          role: 'outer-jacket',
          scope: 'overall',
          appearance: outerSheath.appearance,
          ...(explicit?.outerMaterial != null || catalogStrict ? { material: explicit.outerMaterial ?? null } : {}),
        },
      ]
    : [];
  if (p.armor)
    layers.push({
      role: 'armor',
      function: 'mechanical-protection',
      scope: 'overall',
      type: p.armorType,
      appearance:
        p.armorType === 'steel-tapes'
          ? 'overlapping steel armor tapes'
          : p.armorType === 'steel-wires' ? 'steel armor wires' :
            p.armorType === 'corrugated-steel-tape' ? 'one corrugated steel tape armor band' :
            'neutral mechanical protection band without wire or tape details',
    });
  const screenPlacement = catalogStrict ? explicit.screenPlacement : screenVisualStandard.placement;
  const individualScreen = ['each-pair', 'overall-and-each-pair'].includes(screenPlacement);
  if (p.shield && screenPlacement !== 'each-pair')
    layers.push({
      role: 'screen', scope: 'overall', type: screenType, appearance: screenAppearance,
      visualType: screenVisualStandard.visualType, materialClaim: false,
      placement: screenPlacement, function: 'electromagnetic-screening',
    });
  if (innerSheath.status === 'present')
    layers.push({
      role: 'inner-sheath',
      scope: 'overall-under-screen-if-present',
      material: innerSheath.material,
      appearance:
        'ordinary non-metallic polymer inner sheath; neither screen nor armor',
    });
  if (interstitialFilling.status === 'present')
    layers.push({
      role: 'interstitial-filling',
      scope: 'between-insulated-cores',
      material: interstitialFilling.material,
      placement: interstitialFilling.placement,
      ...(explicit?.integratedFilling && { connectedTo: 'inner-sheath' }),
    });
  const separator = explicit?.separator || null;
  if (separator)
    layers.push({
      role: 'separator',
      scope: 'documented-interface-only',
      appearance: separator,
    });
  if (p.shield && individualScreen)
    layers.push({ role: 'individual-screen', scope: 'each-pair', type: screenType,
      appearance: screenAppearance, visualType: screenVisualStandard.visualType,
      materialClaim: false, placement: 'around-each-insulated-pair', function: 'electromagnetic-screening' });
  layers.push({ role: 'individual-insulation', scope: 'each-core',
    ...(explicit?.insulationMaterial != null ? { material: explicit.insulationMaterial } : {}) });
  if (fire)
    layers.push({
      role: 'fire-barrier',
      scope: 'each-core-under-individual-insulation',
      appearance:
        'thin pale non-metallic mica wrapping, NOT silver armor tapes',
    });
  const drain = explicit
    ? explicit.drainWire === true
    : p.shield && p.specialElements.includes('drain-wire');
  return {
    version: TECHNICAL_REQUEST_VERSION,
    outerSheathGeometry: deriveOuterSheathGeometry(p),
    family: p.family,
    ...(p.coaxial && { coaxial: true }),
    ...(p.schematicAssumptions && { unconfirmedRenderingAssumptions: p.schematicAssumptions }),
    insulatedCoreCount: p.cores,
    coreMetalEndCount: p.cores,
    ...(groupSize > 1 && { groups: { count: p.cores / groupSize, coresPerGroup: groupSize } }),
    conductorMaterial: p.conductorMaterial,
    ...(p.conductorFinish && { conductorFinish: p.conductorFinish }),
    conductorConstruction: p.conductorConstruction,
    conductorShape: p.conductorShape ?? null,
    armor: { present: p.armor, type: p.armorType || null },
    screen: { present: p.shield, type: screenType },
    screenVisualStandard: p.shield ? screenVisualStandard : null,
    screenType,
    ...(individualScreen && { individualScreen: true }),
    screenFunction: p.shield ? 'electromagnetic-screening' : null,
    armorFunction: p.armor ? 'mechanical-protection' : null,
    screenRendering: p.shield ? screenAppearance : null,
    armorType: p.armorType || null,
    fireBarrierMaterial: fire ? explicit.fireBarrierMaterial : null,
    fireBarrierPlacement: fire ? explicit.fireBarrierPlacement : null,
    layerOrder: 'outside-to-conductor; interstitial filler occupies spaces, not a concentric envelope',
    constructionSource: explicit?.source || null,
    constructionEvidence: catalogStrict ? null : p.shield && p.family === 'vvgng-a-ls'
      ? historicalRules.referenceEvidence.screenedVvgLs
      : p.family === 'vvgng-a-frls' && !supplied ? historicalRules.referenceEvidence.frls : null,
    constructionBasis: explicit?.basis || null,
    fireBarrier: fire,
    ...(explicit?.fireBarrierStatus && { fireBarrierStatus: explicit.fireBarrierStatus }),
    ...(explicit?.separatorStatus && { separatorStatus: explicit.separatorStatus }),
    ...(catalogStrict && explicit.drainWire == null && { drainWireStatus: 'unknown' }),
    layers,
    layerRoleCount: layers.length,
    layerCountScope:
      'role count; each-core roles repeat on every core; not a count of manufacturing tape wraps',
    additionalConductors: drain
      ? [{ role: 'screen-drain', count: 1, insulated: false }]
      : [],
    cores: p.coreColors.map((color, i) => ({
      id: i + 1,
      color,
      metalEndId: i + 1,
      metalEndCount: 1,
      ...(!mixed?.qualitative && { relativeDiameter: diameters?.[i] ?? 1 }),
      ...(groupSize > 1 && { group: Math.floor(i / groupSize) + 1 }),
    })),
    innerSheath,
    separator,
    interstitialFilling,
    ...(explicit?.integratedFilling && { integratedFilling: true }),
    outerSheath,
    verification: {
      status: 'NEEDS_REVIEW',
      pixelVerification: 'NOT_AUTOMATED',
      insulatedCoreCount: null,
      coreMetalEndCount: null,
      additionalConductorCount: null,
      layerRoles: null,
    },
  };
}
function sheathAndFillingPrompt(t) {
  const filling = {
    present: 'Show only the documented filling material in its documented placement and extent. Keep the individual insulation outlines readable. Do not turn interstitial material into a continuous sheath or a separate envelope.',
    absent: 'Interstitial filling is confirmed absent. Show individually separated insulated core outlines with no material drawn between them. Do not invent gaps or an annular void at the sheath.',
    unknown: 'Interstitial filling is undocumented. Do not depict filling or assert empty cavities. Keep core outlines readable and leave the undocumented interface visually unexposed. If it must be shown, obtain manufacturer documentation before generation.',
  }[t.interstitialFilling.status];
  const innerSheath = t.innerSheath.status === 'present'
    ? 'Show the documented inner sheath as its own polymer envelope, without extending it into the core interstices unless the filling contract specifically documents that construction.'
    : 'Do not draw a separate inner sheath, backing sleeve, or extra polymer envelope.';
  const relation = t.integratedFilling
    ? 'The documented inner sheath fills the interstices as one continuous extrusion. Do not depict a separate filler ring.'
    : 'The inner sheath, interstitial filling and outer sheath are independent.';
  return `${relation} ${innerSheath} ${filling} ${t.outerSheath.status === 'present' ? 'Show the documented outer sheath as the exterior envelope. If its material is unknown, use a neutral illustrative surface without asserting its real material or color.' : 'Do not add an outer sheath.'}`;
}

export function technicalProfilePrompt(t) {
  return `PROTECTED STYLE INPUT 1 ONLY: the first PNG supplies camera, scale, outer framing, lighting and render quality. Do not transfer its internal geometry. Rebuild the target core assembly from the construction contract. If a compatible geometry input is explicitly identified below, use it for the spatial arrangement only. Do not mechanically add or remove a reference wire. Technical contract overrides reference anatomy. EXACTLY ${t.insulatedCoreCount} insulated cores and EXACTLY ${t.coreMetalEndCount} corresponding exposed core ends. ${t.groups ? `Arrange exactly ${t.groups.count} separate bundles of ${t.groups.coresPerGroup} insulated cores each. Keep groups legible and every individual core end visible. Do not add group wraps or individual screens unless listed in the contract.` : ''} ${t.coaxial ? 'The single centre conductor and its dielectric are concentric with the outer screen. Never depict the screen as an extra core.' : ''} One-to-one numbered core/end mapping; every end must be individually visible and centered in its own insulation. No extra core, hidden stub, duplicate end, cap or dummy cylinder. ${t.conductorFinish === 'tinned' ? 'Render the documented thin tin finish on the copper strand surface; the section metal remains copper, not aluminium.' : ''} ${t.armor.present ? 'Use ONLY the specified armor.' : 'ABSOLUTELY NO ARMOR: no overlapping steel tapes, no steel wires, even if visible in reference.'} ${t.screen.present ? 'SCREEN serves electromagnetic shielding; ARMOR serves mechanical protection. UNIVERSAL SYMBOLIC SCREEN: render each explicitly listed screen as a single thin flexible SILVER metallic foil-like layer with a fine clearly legible CROSSHATCH MESH texture of crossing lines. Combine delicate continuous foil with fine woven-wire-like texture. The mesh must be visible, never coarse. Silver like aluminium or tinned copper is a VISUAL CONVENTION, not the actual manufacturer material. Technical screen type/material in metadata MUST NOT override this visual convention. No copper-coloured screen, no thick spiral tape, broad strips, raised armor seams or rigid cylinder. Follow the layer scopes in the contract. Keep any documented armor physically separate from shielding. Keep core metal materials, colors, mica barriers, count, scale and composition unchanged. Never infer screen or armor from the style PNG.' : 'NO SCREEN.'} ${t.fireBarrier ? 'MANDATORY VISIBLE MICA STRIPPING STEP on EVERY core: bare metal tip -> short exposed thin pale mica-containing tape winding directly around metal -> colored insulation. Render a short axially exposed segment of actual fine tape texture between bare metal and insulation, not merely a flat pale end ring. Keep overall stripping length and scale; distribute this short step within that length. Mica is under insulation, never a common outer silver sleeve, armor or screen.' : ['unknown', 'present-not-exposed'].includes(t.fireBarrierStatus) ? 'Fire barrier construction is unresolved; keep the interface covered and do not expose or invent a barrier layer.' : 'NO fire barrier.'} ${t.additionalConductors.length ? 'Exactly ONE documented thin bare screen drain separately beside the screen; NOT an insulated core, NOT an extra full-size core end.' : t.drainWireStatus === 'unknown' ? 'Drain status is unknown. Do not draw an unconfirmed separate drain.' : 'NO additional conductors and NO drain wire; do not copy the previous draft drain.'} Visible layers are an exhaustive allowlist with no extra steps: ${t.layers.map(layer => layer.role).join(', ')}. ${t.separator ? 'Show only the documented separator at its specified interface.' : 'Do not draw a visible separator.'} Unknown entries are metadata only; do not expose an unknown interface as a separate layer. ${sheathAndFillingPrompt(t)} ${t.family === 'vvg' && t.outerSheath.status === 'present' && t.innerSheath.status !== 'present' && t.interstitialFilling.status !== 'present' ? 'Ordinary VVG: copper conductors, individual PVC insulation, and one continuous common PVC jacket. At the cut edge show only one common polymer ring. Do not render a second envelope, free tube or conspicuous annular cavity.' : ''} Preserve overall reference envelope and scale while rebuilding internal geometry. Construction contract: ${JSON.stringify(t)}. Before rendering verify a bijection of all insulated cores and their metal ends; after rendering the result still requires independent pixel/manual verification.`;
}
