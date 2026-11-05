const value = (v) => Number(String(v).replace(',', '.'));
const compact = (v) => String(v).replace(/\s/gu, '').toUpperCase();

// A valid multiplication is necessary, but does not prove a manufacturer's
// module layout. Non-central layouts must occur in the cited matrix explicitly.
export function checkOpticalConstruction(product, designation, rule) {
  let depth = 0;
  for (const c of designation) {
    if (c === '(') depth++;
    if (c === ')' && --depth < 0)
      return { reason: 'construction-or-execution-outside-reviewed-scope' };
  }
  const p = new RegExp(rule.sourcePattern, 'u').exec(designation)?.groups;
  if (!p || depth)
    return { reason: 'construction-or-execution-outside-reviewed-scope' };
  const fibers = value(p.fibers),
    load = value(p.load),
    fiber = p.fiber.toUpperCase();
  const modules =
    p.modules == null ? (rule.centralModule ? 1 : null) : value(p.modules);
  const perModule =
    p.perModule == null
      ? rule.centralModule
        ? fibers
        : null
      : value(p.perModule);
  if (
    !rule.fiberTypes.includes(fiber) ||
    ![fibers, modules, perModule].every((n) => Number.isInteger(n) && n > 0) ||
    modules * perModule !== fibers
  )
    return { reason: 'construction-combination-not-confirmed' };
  if (
    [
      'cores',
      'crossSection',
      'groupCores',
      'groundCores',
      'groundSection',
      'screenCrossSection',
      'concentricConductorCrossSection',
      'conductorConfiguration',
      'voltage',
    ].some((key) => product[key] != null)
  )
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  const diameters =
    fiber === 'М' ? [50, 125] : fiber === 'Г' ? [62.5, 125] : [];
  if (
    ['opticalFiberCoreDiameter', 'opticalFiberCladdingDiameter'].some(
      (key, i) => product[key] != null && value(product[key]) !== diameters[i]
    )
  )
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  if (
    (product.attributes || []).some(
      (attribute) => !compact(designation).includes(compact(attribute))
    )
  )
    return { reason: 'construction-attributes-outside-reviewed-scope' };
  const row = rule.rows.find(
    (r) =>
      (!r.fiberTypes || r.fiberTypes.includes(fiber)) &&
      r.fibers.includes(fibers) &&
      r.modules === modules &&
      r.perModule.includes(perModule) &&
      r.loadsKN.includes(load)
  );
  if (!row) return { reason: 'construction-combination-not-confirmed' };
  return { configuration: { fibers, fiber, modules, perModule, loadKN: load } };
}
