/** Geometry contract; derives nominal ratios, never claims to measure a generated PNG. */
export const CORE_GEOMETRY_REVIEW_CHECKS = [
  'metalEndCount',
  'equalDiameters',
  'relativeDiameters',
  'coaxialStripping',
  'geometryConsistency',
  'noExtraCylinders',
];
export const CABLE_STYLE_REVIEW_CHECKS = [
  'coreCount',
  'material',
  'colours',
  'layers',
  'direction',
  'proportions',
  'stripping',
  'background',
  'referenceMatch',
  ...CORE_GEOMETRY_REVIEW_CHECKS,
];
export const CABLE_STYLE_REVIEW_LABELS = [
  'Точное количество изолированных жил',
  'Материал проводника',
  'Цвета изоляции',
  'Все реальные слои',
  'Направление',
  'Пропорции и масштаб',
  'Длина зачистки',
  'Фон без ореолов: белый/тёмный/шахматный',
  'Соответствие утверждённому эталону',
  'У каждой видимой жилы свой металлический конец; количество проверено',
  'Равные сечения: равные диаметры металла; изоляция равна при одинаковой конструкции и стенке',
  'Разные сечения: относительные диаметры проверены; либо подтверждено, что все сечения равны',
  'Металл выходит из центра изоляции; постоянное цилиндрическое сечение для круглой однопроволочной жилы',
  'Геометрия всех жил согласована с учётом перспективы',
  'Нет лишних цилиндров, утолщений, сужений и деформаций',
];

// Prospective checks. Historical APPROVED records retain their original checklist.
export const CABLE_FRAME_REVIEW_LABELS = {
  frameAndLeftMargin: 'Горизонтальная композиция, минимальный левый отступ, концы целиком; ориентир ширины 80–90%',
  visibleConstruction: 'Форма, исполнение жил, роль каждого слоя и прилегание соответствуют контракту',
  individualStripping: 'Металл и изоляция различимы отдельно на каждой жиле, пучок компактный',
};
export const CABLE_FRAME_REVIEW_CHECKS = Object.keys(CABLE_FRAME_REVIEW_LABELS);

export function deriveCableCoreGeometry(profile, input = {}) {
  const fail = (reason) => ({
    status: 'NEEDS_REVIEW',
    reason,
    pixelVerification: 'NOT_AUTOMATED',
    automaticApproval: false,
  });
  if (!Number.isInteger(profile.cores) || profile.cores < 1)
    return fail('Exact insulated core count required');
  const groups =
    profile.coreLayout?.sectionGroups ?? input.sectionGroups ??
    (profile.coreLayout
      ? null
      : [{ count: profile.cores, section: input.section ?? null }]);
  if (!Array.isArray(groups) || !groups.length)
    return fail('Mixed-size cores require explicit section groups');
  if (
    groups.some((g) => !Number.isInteger(g.count) || g.count < 1) ||
    groups.reduce((n, g) => n + g.count, 0) !== profile.cores
  )
    return fail('Section-group counts do not equal total insulated cores');
  const specified = groups.map((g) => g.section);
  // A uniform group needs no nominal section to enforce one shared visual diameter.
  if (
    specified.some(
      (s) =>
        s != null && (typeof s !== 'number' || !Number.isFinite(s) || s <= 0)
    ) ||
    (groups.length > 1 && specified.some((s) => s == null))
  )
    return fail('Every mixed section must be a finite positive number');
  const uniform =
    groups.length === 1 || specified.every((s) => s === specified[0]);
  const shape = profile.conductorShape;
  const shapes = groups.map((g) => g.conductorShape || shape);
  const constructions = groups.map(
    (g) => g.conductorConstruction || profile.conductorConstruction
  );
  const comparable =
    shapes.every((s) => s === 'circular') &&
    constructions.every(
      (c) => c === constructions[0] && ['solid', 'stranded'].includes(c)
    );
  const qualitative = !uniform && profile.coreLayout?.qualitative === true;
  if (!comparable && !qualitative && !(uniform && shape === 'sector' && profile.schematicAssumptions))
    return fail(
      'Round conductors of the same known construction required; no invented diameter formula for sector/mixed construction'
    );
  const maximum = uniform ? null : Math.max(...specified);
  return {
    status: 'REQUIREMENTS_DEFINED_NOT_PIXEL_VERIFIED',
    mode: uniform ? 'UNIFORM' : 'MIXED',
    expectedInsulatedCoreCount: profile.cores,
    expectedMetalEndCount: profile.cores,
    conductorMaterial: profile.conductorMaterial,
    conductorConstruction: profile.conductorConstruction,
    conductorShape: shape,
    // Only relative ratios enter the geometry contract. Absolute sizes stay in SKU metadata.
    metalDiameterGroups: groups.map((g) => ({
      count: g.count,
      ...(qualitative ? { relativeSection: g.section / maximum, shape: g.conductorShape ?? shape }
        : { relativeDiameter: uniform ? 1 : Math.sqrt(g.section / maximum) }),
    })),
    ...(qualitative && { qualitative: true }),
    ratioFormula: qualitative ? null : uniform
      ? 'all relative diameters = 1'
      : 'd2/d1 = sqrt(S2/S1)',
    insulationOuterDiameterRule: uniform
      ? 'Equal outer diameters when insulation construction and wall thickness are equal'
      : 'Do not infer insulation outer diameter from metal area alone; verify documented construction and wall thickness',
    globalScale: 'UNCHANGED_REFERENCE_SCALE',
    metalEndRule:
      'Own centred bare conductor extension per core; constant cylindrical diameter for circular solid conductor; stranded remains stranded',
    geometryScope:
      'Conductor geometry only; preserve approved composition, tilt, stripping length, material and lighting',
    pixelVerification: 'NOT_AUTOMATED',
    automaticApproval: false,
    mandatoryReviewChecks: CORE_GEOMETRY_REVIEW_CHECKS,
  };
}

export function coreGeometryPrompt(requirements) {
  return `MANDATORY CORE GEOMETRY: ${requirements.expectedInsulatedCoreCount} insulated cores and ${requirements.expectedMetalEndCount} separate exposed metallic ends. ${requirements.qualitative ? 'Keep the known groups of larger and smaller conductors and preserve their known shapes. Use relative section only to order sizes; no diameter formula is specified.' : requirements.mode === 'UNIFORM' ? 'All metal conductors must be copies of the SAME-diameter geometry, with only natural perspective differences. Insulated core outer diameters must also match if insulation construction and wall thickness are the same.' : 'Mixed-size round conductors of identical construction: relative metal DIAMETERS, not radii/areas, obey sqrt(section ratio).'} Relative metal diameter groups (count and normalized diameter): ${JSON.stringify(requirements.metalDiameterGroups)}. Every bare end exits the CENTRE of its corresponding insulation, with a sharp stripping boundary and constant diameter. Circular solid ends must be true cylinders, no swelling, narrowing, distortion, caps or sleeves. Keep stranded construction where specified. Material: ${requirements.conductorMaterial}. No extra stumps/cylinders. Correct all cores as a consistent geometric set, never patch one defective core in isolation. Preserve reference global scale regardless of nominal section, composition, camera, tilt, stripping lengths, transparency and lighting. Insulation rule: ${requirements.insulationOuterDiameterRule}.`;
}
