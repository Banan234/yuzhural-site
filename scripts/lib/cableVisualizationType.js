import defaultRules from '../../data/cableVisualizationRules.json' with { type: 'json' };

export const VISUALIZATION_TYPES = [
  'SIMPLE',
  'MULTICORE',
  'LAYERED',
  'MULTICORE + LAYERED',
  'NEEDS_REVIEW',
];

/** Rendering strategy only: does not approve generation or change visual identity. */
export function classifyCableVisualization(row, { rules = defaultRules } = {}) {
  const p = row.visualProfile;
  const technical = row.technicalProfile || p;
  const policy = { ...rules, ...rules.familyOverrides?.[row.familyId] };
  if (!Number.isInteger(policy.compactFromCores) || policy.compactFromCores < 2)
    throw new Error('compactFromCores must be an integer of at least two');
  const reasons = [];
  const add = (code, message) => reasons.push({ code, message });
  if (!p?.family || row.familyRecognized === false)
    add('unknown_family', 'Семейство не подтверждено');
  if (!policy.supportedProductTypes.includes(p.productType))
    add(
      'unknown_product_type',
      'Нет подтверждённой схемы конструкции для типа изделия'
    );
  if (!policy.supportedGeometries.includes(p.geometry))
    add('unknown_geometry', 'Не определена поддерживаемая геометрия изделия');
  if (!Number.isInteger(p.cores) || p.cores < 1)
    add('unknown_cores', 'Не определено точное количество жил');
  for (const field of ['hasOuterJacket', 'armor', 'shield'])
    if (typeof p[field] !== 'boolean')
      add(`unknown_${field}`, `Не определён признак конструкции: ${field}`);
  if (p.armor && !policy.armorTypes.includes(p.armorType))
    add(
      'unknown_armor_type',
      'Нет подтверждённого вида брони для ступенчатого разреза'
    );
  if (p.shield && !policy.shieldTypes.includes(p.shieldType))
    add(
      'unknown_shield_type',
      'Нет подтверждённого расположения и вида экрана'
    );
  if (p.pairedGroupSize > 1)
    add(
      'paired_construction',
      'Парная/групповая конструкция требует отдельной схемы среза'
    );
  for (const issue of row.issues || [])
    if (policy.blockingIssueCodes.includes(issue.code))
      add(issue.code, issue.message);
  for (const field of ['unresolvedModifiers', 'unresolvedFamilySuffix'])
    if (p[field]?.length)
      add(
        'unresolved_structure',
        `В профиле остались неразобранные признаки: ${field}`
      );
  if (p.coreLayout)
    add(
      'mixed_core_layout_review',
      'Нужна подтверждённая схема разноразмерных жил, включая цвет уменьшенной жилы'
    );
  const special = p.specialElements || [];
  for (const element of special)
    if (!policy.knownSpecialElements.includes(element))
      add(
        'unknown_special_element',
        `Нужна схема специального элемента: ${element}`
      );
  if (special.includes('drain-wire') && !p.shield)
    add(
      'drain_without_screen',
      'Контактный проводник указан без подтверждённого экрана'
    );
  if (p.geometry === 'twisted-bundle') {
    if (
      p.productType !== 'sip' ||
      p.hasOuterJacket !== false ||
      p.armor !== false ||
      p.shield !== false ||
      !special.includes('twisted-insulated-cores')
    )
      add(
        'unsupported_bundle',
        'Для пучка нет согласованной схемы изолированных жил без общей оболочки'
      );
  } else if (
    special.includes('twisted-insulated-cores') ||
    p.productType === 'sip'
  ) {
    add(
      'bundle_geometry_conflict',
      'Конструкция СИП и геометрия пучка не согласуются'
    );
  }
  if (
    p.hasOuterJacket === false &&
    p.geometry !== 'twisted-bundle' &&
    (p.cores !== 1 || p.productType !== 'installation-wire')
  )
    add(
      'unsupported_jacketless_construction',
      'Безоболочечное изделие не подтверждено как одиночный установочный провод'
    );
  if (p.hasOuterJacket === false && (p.armor || p.shield))
    add(
      'unsupported_unjacketed_layers',
      'Не подтверждена открытая конструкция с бронёй/экраном'
    );
  if (p.geometry === 'flat' && p.cores >= policy.compactFromCores)
    add(
      'unsupported_flat_multicore',
      'Компактный объёмный срез для многожильной плоской конструкции не согласован'
    );

  const layers = [];
  const layer = (kind, label, basis) => layers.push({ kind, label, basis });
  if (typeof p.productType === 'string')
    layer('core-insulation', 'Изоляция жилы', 'existing-visualProfile');
  if (p.hasOuterJacket === true)
    layer('outer-jacket', 'Наружная оболочка', 'existing-visualProfile');
  if (p.armor)
    layer(
      'armor',
      `Броня: ${p.armorType || 'не уточнена'}`,
      'existing-visualProfile'
    );
  if (p.shield)
    layer(
      'shield',
      `Экран: ${p.shieldType || 'не уточнён'}`,
      'existing-visualProfile'
    );
  if (policy.separateFillerLayers.includes(technical.filler))
    layer(
      'inner-sheath',
      'Документированная внутренняя оболочка',
      'existing-technicalProfile'
    );
  if (special.includes('fire-barrier'))
    layer(
      'fire-barrier',
      'Огнестойкий барьер',
      'existing-visualProfile.specialElements'
    );
  const layered = layers.some((l) =>
    ['armor', 'shield', 'inner-sheath', 'fire-barrier'].includes(l.kind)
  );
  const multicore =
    Number.isInteger(p.cores) &&
    p.cores >= policy.compactFromCores &&
    p.hasOuterJacket === true &&
    p.geometry === 'round';
  const unique = [
    ...new Map(reasons.map((r) => [`${r.code}:${r.message}`, r])).values(),
  ];
  const type = unique.length
    ? 'NEEDS_REVIEW'
    : multicore && layered
      ? 'MULTICORE + LAYERED'
      : layered
        ? 'LAYERED'
        : multicore
          ? 'MULTICORE'
          : 'SIMPLE';
  return {
    visualizationType: type,
    components: type === 'NEEDS_REVIEW' ? [] : type.split(' + '),
    rulesVersion: policy.version,
    reasons: unique,
    knownVisibleLayers: layers,
    visibleLayerCount: unique.length ? null : layers.length,
    physicalLayerCount: null,
    layerCountScope: 'visible-illustration-envelopes-not-full-physical-stack',
    compactFromCores: policy.compactFromCores,
    rationale: unique.length
      ? 'Сначала уточнить конструкцию; тип не назначен автоматически.'
      : [
          multicore
            ? `Круглый кабель с общей оболочкой, ${p.cores} жил: компактный срез.`
            : `${p.cores} жил, геометрия ${p.geometry}: объёмное раскрытие.`,
          layered
            ? 'Броня/экран/отдельный барьер или внутренняя оболочка требуют ступенчатого раскрытия.'
            : 'Дополнительные отдельно раскрываемые слои не подтверждены согласованными правилами.',
        ].join(' '),
  };
}

export function withCableVisualization(row, context = {}) {
  const visualization = classifyCableVisualization(row, {
    rules: context.visualizationRules || defaultRules,
  });
  return {
    ...row,
    visualProfile: {
      ...row.visualProfile,
      visualizationType: visualization.visualizationType,
    },
    visualization,
  };
}
