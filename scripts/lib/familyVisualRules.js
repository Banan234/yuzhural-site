import reviewedProfiles from '../../data/cableReviewedIllustrationProfiles.json' with { type: 'json' };
import { deriveOuterSheathGeometry } from './cableOuterSheathGeometry.js';
import {
  classifyCableVisualProduct,
  makeVisualIdentity,
  normalizeCoreColor,
  normalizeCableFamily,
  visualHash,
} from './cableVisualClassification.js';
import { knownCableVisualizationType, withCableVisualization } from './cableVisualizationType.js';

export const isVisualAutoApproved = (row) =>
  ['recognized', 'AUTO_APPROVED'].includes(row.visualClassification);

export function resolveFamilyVisualRule(row, context) {
  const table = context.familyVisualRules?.familyVisualRules;
  if (!table) return null;
  const id = table[row.familyId]
    ? row.familyId
    : Object.keys(table).find((k) => table[k].baseFamily === row.baseFamily);
  if (!id) return null;
  function resolve(key, seen = new Set()) {
    if (seen.has(key) || !table[key])
      throw new Error(`Invalid familyVisualRules inheritance: ${key}`);
    const item = table[key],
      parent = item.extends
        ? resolve(item.extends, new Set([...seen, key]))
        : {};
    return {
      ...parent,
      ...item,
      structure: { ...parent.structure, ...item.structure },
      visualDefaults: { ...parent.visualDefaults, ...item.visualDefaults },
    };
  }
  const rule = resolve(id);
  return {
    ...rule,
    id,
    structure: {
      ...(context.rules.families[rule.structureRule] || {}),
      ...rule.structure,
    },
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isColorAttribute = (value) =>
  !!normalizeCoreColor(String(value).replace(/[().]/gu, '').trim());

/** Catalogue decisions retain technical unknowns, without treating visual conventions as specifications. */
export function classifyPracticalCableVisualProduct(product, context) {
  const strict = classifyCableVisualProduct(product, context),
    rule = resolveFamilyVisualRule(strict, context) || {
      id: null,
      structure: {},
      visualDefaults: {},
      minCores: 1,
      maxCores: 100000,
      colorProfile: null,
    };
  const p = structuredClone(strict.visualProfile),
    defaults = [],
    critical = [];
  const add = (code, message) => critical.push({ code, message });
  const setDefault = (key, value, basis) => {
    if (p[key] === null && value !== undefined && value !== null) {
      p[key] = structuredClone(value);
      defaults.push({ field: key, value: p[key], basis, ruleId: rule.id });
    }
  };
  for (const key of [
    'conductorMaterial',
    'conductorConstruction',
    'conductorShape',
    'geometry',
    'hasOuterJacket',
    'armor',
    'shield',
  ]) {
    if (
      p[key] != null &&
      rule.structure[key] != null &&
      !same(p[key], rule.structure[key])
    )
      add(
        'family_structure_conflict',
        `Явные данные и известная конструкция семейства расходятся: ${key}`
      );
  }
  for (const [key, value] of Object.entries(rule.structure))
    if (key in p && key !== 'specialElements')
      setDefault(key, value, 'documented-family-structure');
  const normalized = normalizeCableFamily(product, context);
  const conductorCode = Object.entries(rule.conductorCodes || {}).find(
    ([code]) => normalized.attributes.some((a) => a.toUpperCase() === code)
  );
  if (conductorCode)
    for (const [field, value] of Object.entries(conductorCode[1])) {
      if (p[field] !== null && p[field] !== value)
        add(
          'construction_conflict',
          `Исполнение ${conductorCode[0]} противоречит данным: ${field}`
        );
      else setDefault(field, value, 'documented-conductor-code');
    }
  const roleSuffix = Object.entries(
    rule.protectiveConductorSuffixes || {}
  ).find(
    ([suffix]) =>
      normalized.unresolvedFamilySuffix === suffix ||
      normalized.attributes.some((a) => a.toUpperCase() === suffix)
  );
  const suppliedPE = product.hasPE ?? product.visualCharacteristics?.hasPE;
  if (
    roleSuffix &&
    typeof suppliedPE === 'boolean' &&
    suppliedPE !== roleSuffix[1]
  )
    add(
      'explicit_role_conflict',
      'Индекс J/O и явно указанное наличие PE противоречат друг другу'
    );
  const transition = rule.constructionTransitions?.find(
    (b) => strict.section >= b.minSection
  );
  if (transition)
    setDefault(
      'conductorConstruction',
      transition.value,
      'documented-family-section-transition'
    );
  const declaredColors = [
    ...new Set([
      ...(p.declaredColors || []),
      ...(p.unresolvedModifiers || [])
        .map((a) => normalizeCoreColor(String(a).replace(/[().]/gu, '').trim()))
        .filter(Boolean),
      ...normalized.attributes
        .map((a) => normalizeCoreColor(String(a).replace(/[().]/gu, '').trim()))
        .filter(Boolean),
    ]),
  ];
  if (
    p.hasOuterJacket === true &&
    p.outerJacket === null &&
    declaredColors.length === 1
  )
    p.outerJacket = declaredColors[0];
  for (const [key, value] of Object.entries(rule.visualDefaults || {}))
    setDefault(key, value, 'catalogue-illustration-default');
  if (
    rule.structure.constructionBands &&
    strict.section &&
    !p.conductorConstruction
  ) {
    const band = rule.structure.constructionBands.find(
      (b) => strict.section <= b.maxSection
    );
    if (band)
      setDefault(
        'conductorConstruction',
        band.value,
        'documented-family-section-band'
      );
  }
  // Unknown exact filler and polymer details are recorded, not drawn as extra layers.
  const { visualizationType, ...technicalProfile } = strict.visualProfile;
  const rowColorsKnown =
    Array.isArray(p.coreColors) && p.coreColors.length === strict.cores;
  let colors = rowColorsKnown ? [...p.coreColors] : null;
  const explicitPE = suppliedPE ?? roleSuffix?.[1];
  const explicitN = product.hasN ?? product.visualCharacteristics?.hasN;
  if (!colors) {
    if (rule.colorProfile === 'single-wire' && strict.cores === 1) {
      const declared = declaredColors;
      colors =
        declared.length === 1
          ? declared
          : [context.familyVisualRules.singleWireDefaultColor];
    } else if (
      rule.colorProfile === 'sip-black' &&
      Number.isInteger(strict.cores)
    )
      colors = Array(strict.cores).fill('black');
    else {
      let profile = rule.colorProfile;
      if (explicitPE === false && profile === 'power') profile = 'powerNoPE';
      colors =
        context.colorRules.profiles[profile]?.[String(strict.cores)] || null;
      const numbered = context.familyVisualRules.numberedControlPalette;
      if (
        !colors &&
        profile === 'control' &&
        strict.cores >= numbered.minimumCores &&
        strict.cores <= numbered.maximumCores
      )
        colors = Array(strict.cores).fill(numbered.color);
      if (colors) colors = [...colors];
      if (
        colors &&
        explicitPE === true &&
        rule.colorProfile === 'power' &&
        strict.cores <= 2
      )
        colors =
          strict.cores === 1 ? ['yellow-green'] : ['brown', 'yellow-green'];
      if (
        !colors &&
        rule.numberedFrom &&
        strict.cores >= rule.numberedFrom &&
        strict.cores <= rule.maxCores
      ) {
        colors = Array(strict.cores).fill('black');
        if (explicitPE === true) colors[colors.length - 1] = 'yellow-green';
      }
      if (
        colors &&
        explicitN === true &&
        explicitPE === true &&
        strict.cores === 4
      )
        colors = ['brown', 'black', 'blue', 'yellow-green'];
    }
    if (colors) {
      p.coreColors = colors;
      defaults.push({
        field: 'coreColors',
        value: colors,
        basis: 'family-catalogue-palette',
        ruleId: rule.id,
      });
    }
  }
  if (Array.isArray(colors)) {
    colors = colors.map(normalizeCoreColor);
    p.coreColors = colors;
    if (colors.some((c) => !c) || colors.length !== strict.cores)
      add(
        'color_conflict',
        'Палитра должна содержать ровно по одному цвету на каждую жилу'
      );
    if (
      typeof explicitPE === 'boolean' &&
      explicitPE !== colors.includes('yellow-green')
    )
      add(
        'explicit_role_conflict',
        'Явное указание PE не согласуется с доступной каталоговой палитрой'
      );
    if (explicitN === true && !colors.includes('blue'))
      add(
        'explicit_role_conflict',
        'Для явно указанного N нет согласованной палитры с синей жилой'
      );
  }
  if (
    Number.isInteger(strict.cores) &&
    (strict.cores < rule.minCores || strict.cores > rule.maxCores)
  )
    add(
      'unsupported_core_range',
      `Правило ${rule.id} допускает ${rule.minCores}–${rule.maxCores} жил; в товаре ${strict.cores}`
    );
  if (p.armor === true && !p.armorType)
    add(
      'armor_detail_unknown',
      'Броня есть, но её принципиальная конструкция не определена'
    );
  if (p.shield === true && !p.shieldType)
    add(
      'shield_detail_unknown',
      'Экран есть, но нет правила его видимого исполнения'
    );
  const nonblocking = new Set([
    'unknown_filler',
    'filler_detail_unknown',
    'unknown_outerJacketMaterial',
    'unknown_insulation',
    'missing_section',
    'auxiliary_role_unknown',
  ]);
  const criticalUnknown = {
    unknown_productType: 'productType',
    unknown_conductorMaterial: 'conductorMaterial',
    unknown_conductorConstruction: 'conductorConstruction',
    unknown_conductorShape: 'conductorShape',
    unknown_geometry: 'geometry',
    unknown_hasOuterJacket: 'hasOuterJacket',
    unknown_outerJacket: 'outerJacket',
    unknown_armor: 'armor',
    unknown_shield: 'shield',
    unknown_coreColors: 'coreColors',
  };
  const nonBlockingIssues = [];
  for (const issue of strict.issues) {
    let covered = nonblocking.has(issue.code);
    if (
      issue.code === 'auxiliary_role_unknown' &&
      !(p.hasOuterJacket === true && rule.id)
    )
      covered = false;
    if (criticalUnknown[issue.code])
      covered = p[criticalUnknown[issue.code]] !== null;
    if (issue.code === 'unverified_modifier') {
      const unresolved = p.unresolvedModifiers || [];
      covered = unresolved.every(
        (a) =>
          isColorAttribute(a) ||
          (roleSuffix && a.toUpperCase() === roleSuffix[0]) ||
          (conductorCode && a.toUpperCase() === conductorCode[0]) ||
          (context.familyVisualRules.nonVisualAttributePatterns || []).some(
            (pattern) => new RegExp(pattern, 'iu').test(a)
          )
      );
    }
    if (issue.code === 'unverified_family_suffix') {
      const suffix = p.unresolvedFamilySuffix;
      covered =
        (!!roleSuffix && suffix === roleSuffix[0]) ||
        (/^(?:0[.,]66|1)(?:КВ)?$/iu.test(suffix || '') &&
          ['power-cable', 'control-cable'].includes(p.productType));
    }
    if (issue.code === 'shield_detail_unknown') covered = !!p.shieldType;
    if (issue.code === 'armor_detail_unknown') covered = !!p.armorType;
    if (covered)
      nonBlockingIssues.push({
        ...issue,
        resolution: criticalUnknown[issue.code]
          ? 'familyVisualRules'
          : 'not-critical-for-this-illustration',
      });
    else critical.push(issue);
  }
  for (const key of context.familyVisualRules.criticalFields) {
    const value = key === 'family' ? strict.familyId : p[key];
    if (value === null || value === undefined || value === '')
      add(`unknown_${key}`, `Не определён критический признак: ${key}`);
  }
  if (p.hasOuterJacket === true && !p.outerJacket)
    add('unknown_outerJacket', 'Не определён типаж наружной оболочки');
  if (!colors)
    add(
      'unknown_coreColors',
      'Для этого семейства/количества жил нет согласованной палитры'
    );
  // Nominal sections remain metadata. Mixed-size cores are a construction, not a scale.
  let coreLayout = null;
  if (strict.auxiliaryCores > 0) {
    const relation =
      strict.section && strict.auxiliarySection
        ? strict.auxiliarySection < strict.section
          ? 'reduced'
          : strict.auxiliarySection === strict.section
            ? 'equal'
            : 'larger'
        : 'unknown';
    if (relation !== 'equal') {
      coreLayout = {
        primaryCores: strict.primaryCores,
        auxiliaryCores: strict.auxiliaryCores,
        auxiliarySize: relation,
      };
      // Never infer that the reduced core is PE/N from a parser ground* field.
      add(
        'mixed_core_layout_review',
        'Разноразмерные жилы: нужно подтвердить цвет, назначение и исполнение уменьшенной/дополнительной жилы; одинаковый общий масштаб сохраняется'
      );
    }
  }
  const issues = [
    ...new Map(critical.map((i) => [`${i.code}:${i.message}`, i])).values(),
  ];
  const colorsKey = colors ? colors.join('-') : 'unknown';
  // Functions and exact auxiliary sections remain in technical metadata. Total count stays critical.
  const visualProfile = {
    family: strict.familyId,
    productType: p.productType,
    cores: strict.cores,
    ...(coreLayout ? { coreLayout } : {}),
    conductorMaterial: p.conductorMaterial,
    conductorConstruction: p.conductorConstruction,
    conductorShape: p.conductorShape,
    geometry: p.geometry,
    hasOuterJacket: p.hasOuterJacket,
    outerJacket: p.outerJacket,
    armor: p.armor,
    armorType: p.armor ? p.armorType : null,
    shield: p.shield,
    shieldType: p.shield ? p.shieldType : null,
    specialElements: p.specialElements,
    coreColors: colors,
    coreColorScheme:
      rule.colorProfile === 'control' &&
      strict.cores >= 6 &&
      colors?.every((c) => c === 'black')
        ? `${strict.cores}core-control-black`
        : strict.cores > 5 && colors
          ? `${strict.cores}core-${rule.colorProfile || 'catalogue'}-palette-${visualHash(colors).slice(0, 8)}`
          : `${strict.cores}core-${colorsKey}`,
    pairedGroupSize: p.pairedGroupSize,
    sectionKey: p.sectionKey,
    unresolvedModifiers: issues.some((i) => i.code === 'unverified_modifier')
      ? p.unresolvedModifiers
      : [],
    unresolvedFamilySuffix: issues.some(
      (i) => i.code === 'unverified_family_suffix'
    )
      ? p.unresolvedFamilySuffix
      : null,
  };
  const result = withCableVisualization(
    {
      ...strict,
      ...makeVisualIdentity(visualProfile),
      technicalProfile: {
        ...technicalProfile,
        outerSheathGeometry: deriveOuterSheathGeometry(visualProfile),
      },
      construction: p.conductorConstruction,
      geometry: p.geometry,
      visualClassification: issues.length ? 'needs_review' : 'AUTO_APPROVED',
      classificationConfidence: issues.length ? 'low' : 'medium',
      issues,
      criticalIssues: issues,
      nonBlockingIssues,
      appliedFamilyVisualRule: rule.id,
      illustrationDefaults: defaults,
      classificationMode: 'practical',
      paletteIsCatalogueConvention: !rowColorsKnown,
      notes: [
        ...strict.notes,
        'Каталоговые defaults не объявляются фактическими характеристиками конкретной складской партии.',
      ],
    },
    context
  );
  const reviewed = reviewedProfiles[product.sku];
  if (
    !reviewed ||
    result.visualClassification !== 'AUTO_APPROVED' ||
    reviewed.baselineVisualKey !== result.visualKey ||
    reviewed.productId !== product.id ||
    reviewed.sourceName !== product.sourceName ||
    reviewed.section !== strict.section ||
    technicalProfile.conductorConstruction != null ||
    product.conductorConfiguration ||
    product.conductorStrandCount != null ||
    product.voltage != null ||
    product.manufacturer
  )
    return result;

  // The reviewed illustration is scoped to this source row, without changing
  // supplier specifications or the family defaults for other products.
  const reviewedProfile = { ...result.visualProfile, ...reviewed.profile };
  return {
    ...result,
    ...makeVisualIdentity(reviewedProfile),
    construction: reviewedProfile.conductorConstruction,
    visualization: {
      ...result.visualization,
      visualizationType: reviewedProfile.visualizationType,
      components: reviewedProfile.visualizationType.split(' + '),
      rationale: 'Композиция подтверждена для иллюстрации этой позиции.',
    },
  };
}

/** User-approved legacy images require agreement on visible construction, not newly invented metadata gates. */
export function comparePracticalVisualAsset(row, asset) {
  const p = row.visualProfile,
    a = asset.visualProfile,
    mismatches = [],
    unknown = [];
  const pg = deriveOuterSheathGeometry(p),
    ag = deriveOuterSheathGeometry(a);
  if (pg === 'UNKNOWN' || ag === 'UNKNOWN') unknown.push('outerSheathGeometry');
  else if (pg !== ag) mismatches.push('outerSheathGeometry');
  for (const key of [
    'family',
    'cores',
    'productType',
    'conductorMaterial',
    'conductorConstruction',
    'conductorShape',
    'geometry',
    'hasOuterJacket',
    'outerJacket',
    'armor',
    'shield',
    'coreColors',
    'specialElements',
  ]) {
    if (p[key] == null || a[key] == null) {
      unknown.push(key);
      continue;
    }
    if (!same(p[key], a[key])) mismatches.push(key);
  }
  for (const key of ['armorType', 'shieldType'])
    if (p[key.replace('Type', '')] === true) {
      if (p[key] == null || a[key] == null) unknown.push(key);
      else if (!same(p[key], a[key])) mismatches.push(key);
    }
  if (p.sectionKey != null && !same(p.sectionKey, a.sectionKey))
    mismatches.push('sectionKey');
  return {
    compatible:
      isVisualAutoApproved(row) &&
      asset.status === 'approved' &&
      !mismatches.length &&
      !unknown.length,
    mismatches,
    unknown,
    approvalBasis:
      'user-approved-style-and-typage; matching known visible construction',
    ignoredNonCriticalFields: [
      'filler',
      'outerJacketMaterial',
      'insulation',
      'hasN',
      'auxiliarySectionKey',
      'primaryCores',
      'auxiliaryCores',
    ],
  };
}

/** Compare an approved illustration with a product without authorizing a SKU binding. */
export function compareApprovedVisualConstruction(row, asset, { exact = false } = {}) {
  const product = row.profile ?? {};
  const image = asset.profile ?? {};
  const mismatch = new Set();
  const unknown = new Set(row.uncertainties ?? []);
  const compare = (field, left, right) => {
    if (left == null || right == null) unknown.add(field);
    else if (!same(left, right)) mismatch.add(field);
  };
  const supported = (value, options) => options.includes(value) ? value : null;
  const fields = {
    cores: value => Number.isInteger(value) && value > 0 ? value : null,
    geometry: value => supported(value, ['round', 'flat', 'twisted-bundle']),
    visualizationType: knownCableVisualizationType,
    conductorShape: value => supported(value, ['circular', 'sector']),
    conductorMaterial: value => supported(value, ['copper', 'aluminium']),
    conductorConstruction: value => supported(value, ['solid', 'stranded']),
    hasOuterJacket: value => supported(value, [true, false]),
    shield: value => supported(value, [true, false]),
    armor: value => supported(value, [true, false]),
  };
  const disputed = new Set(row.disputed ?? []);
  for (const [field, normalize] of Object.entries(fields))
    compare(field, disputed.has(field) ? null : normalize(product[field]), normalize(image[field]));
  for (const field of ['shield', 'armor']) {
    if (product[field] === true && image[field] === true && !disputed.has(field)) {
      const type = field + 'Type';
      const knownType = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/u.test(value) &&
        !['unknown', 'conflict', 'unconfirmed'].includes(value) ? value : null;
      compare(type, disputed.has(type) ? null : knownType(product[type]), knownType(image[type]));
    }
  }
  const elements = value => Array.isArray(value) ? [...new Set(value)].sort() : null;
  compare('specialElements', elements(product.specialElements), elements(image.specialElements));
  for (const field of ['coreLayout', 'pairedGroupSize']) {
    if (product[field] != null || image[field] != null) {
      const uniform = value => value === undefined ? false : value;
      compare(field, uniform(product[field]), uniform(image[field]));
    }
  }
  for (const field of ['inner', 'fill', 'separator']) {
    const target = row.layers?.[field];
    const shown = asset.layers?.[field];
    if (asset.hiddenLayers?.includes(field) && shown === false) continue;
    // A previously verified exact scope can supply missing layer evidence.
    if (!exact || (target != null && shown != null)) compare(field, target, shown);
  }
  if (row.color?.cores) compare('coreColors', row.color.cores.toSorted(),
    Array.isArray(image.coreColors) ? image.coreColors.toSorted() : null);
  if (row.color?.jacket) compare('outerJacket', row.color.jacket, image.outerJacket);
  if (row.color?.ambiguous) unknown.add('colorRole');
  if (asset.restriction && !exact) mismatch.add('restrictedLayerTransfer');
  if (!exact && row.classification !== 'AUTO_APPROVED') unknown.add('constructionClassification');
  if (asset.approval?.APPROVED_FOR_CATALOG !== true) unknown.add('catalogApproval');
  return {
    status: mismatch.size ? 'INCOMPATIBLE' : unknown.size ? 'NEEDS_REVIEW' : 'COMPATIBLE',
    mismatch: [...mismatch],
    unknown: [...unknown],
  };
}
