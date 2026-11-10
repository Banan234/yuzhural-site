import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';
const allowed = {
  'YU-0005011': {
    family: 'pugv',
    cores: 1,
    geometry: 'round',
    hasOuterJacket: false,
    conductorMaterial: 'copper',
  },
  'YU-0005219': {
    family: 'shvvp',
    cores: 2,
    geometry: 'flat',
    hasOuterJacket: true,
    conductorMaterial: 'copper',
  },
  'YU-0004818': {
    family: 'sip-4',
    cores: 4,
    geometry: 'twisted-bundle',
    hasOuterJacket: false,
    conductorMaterial: 'aluminium',
  },
};
export async function prepareGeometryPilot(root, profile, sku) {
  const spec = allowed[sku];
  if (!spec)
    throw Error(
      'NEEDS_REVIEW: SKU is not authorized for the three-geometry control'
    );
  const read = async (p) => JSON.parse(await fs.readFile(path.join(root, p)));
  const products = await read('data/catalog-current/products.json'),
    product = products.find((p) => p.sku === sku);
  if (!product) throw Error('NEEDS_REVIEW: SKU not in current catalogue');
  const context = {
    rules: await read('data/cableVisualClassificationRules.json'),
    familyVisualRules: await read('data/familyVisualRules.json'),
    knowledge: await read('shared/designationKnowledgeBase.json'),
    colorRules: await read('data/cableImageColors.json'),
  };
  const c = classifyPracticalCableVisualProduct(product, context);
  if (
    c.visualClassification !== 'AUTO_APPROVED' ||
    c.issues.length ||
    JSON.stringify(c.visualProfile) !== JSON.stringify(profile)
  )
    throw Error(
      'NEEDS_REVIEW: current technical profile differs or is ambiguous'
    );
  if (
    Object.entries(spec).some(([k, v]) => profile[k] !== v) ||
    profile.conductorConstruction !== 'stranded' ||
    profile.armor !== false ||
    profile.shield !== false
  )
    throw Error('NEEDS_REVIEW: geometry control construction conflict');
  return {
    version: 'new-geometry-control-1.0.0',
    sku,
    visualKey: c.visualKey,
    referenceRole: 'style-only; NOT a construction template',
    referenceType: 'SIMPLE',
    status: 'NEEDS_REVIEW',
    automaticApproval: false,
    notes:
      'Explicit user authorization for these three controls, not generic release of unsupported geometry',
  };
}
export function geometryPilotPrompt(pilot, p) {
  const common = `AUTHORIZED NEW-GEOMETRY CONTROL ${pilot.version}, SKU ${pilot.sku}. Attached SIMPLE PNG is ONLY a style/material/lighting/camera-scale example, NOT the geometry of the target. Adapt composition to the true shape below while retaining the moderate catalogue scale, gentle diagonal, intact body RIGHT and bare metal ends LEFT, safe left margin and air above/below. Preserve real alpha, no halos/baked shadows/text. Exactly ${p.cores} insulated core(s), ${p.cores} exposed core conductor bundle(s); multiple fine strands inside ONE bundle are NOT extra insulated cores. No armor, no screen, no mica/fire barrier. Do not copy the three-core count or common round sheath of the reference.`;
  if (pilot.sku === 'YU-0005011')
    return (
      common +
      ' Render ONE flexible copper wire. ONE WHITE individual insulation cylinder encloses ONE stranded copper bundle containing several fine warm copper wires. Strip only this single white insulation at LEFT to show a short bare stranded copper end. There is NO common outer jacket, no second insulation sleeve, no hidden additional core. White insulated intact wire continues RIGHT. Not a black multi-core cable.'
    );
  if (pilot.sku === 'YU-0005219')
    return (
      common +
      ' Render a FLAT flexible two-core cord with a genuinely flat/oval BLACK common outer sheath enclosing TWO side-by-side cores: BROWN and BLUE. Each core has its own fine-stranded copper end at LEFT. Preserve clearly flat exterior; do not inflate it into a circular round cable. No filler or extra inner sheath layers. Two cores only, not four ends or separate extra wires.'
    );
  return (
    common +
    ' Render SIP-4: FOUR individual BLACK insulated flexible ALUMINIUM stranded conductors twisted together in a compact visible helical bundle, NO common outer jacket at all. Exactly FOUR distinct short exposed silver-grey aluminium stranded ends LEFT. All four insulated conductors are peers, same nominal area, same diameter; no separate bare carrier/neutral messenger, no SIP-2 construction. The intact right portion visibly consists of four twisted insulated wires; never draw one black common tube around them. Do not show copper.'
  );
}
