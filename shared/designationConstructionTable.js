const numeric = (value) => Number(String(value).replace(',', '.'));
const code = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[-\s]/gu, '')
    .replace(/A/gu, 'А')
    .replace(/C/gu, 'С');

// Rows encode joint constraints: never take an independent cross-product of
// counts and sizes from different rows, executions or voltage ratings.
export function checkConstructionTable(product, designation, rule) {
  let depth = 0;
  for (const character of designation) {
    if (character === '(') depth++;
    if (character === ')' && --depth < 0)
      return { reason: 'construction-or-execution-outside-reviewed-scope' };
  }
  if (depth !== 0)
    return { reason: 'construction-or-execution-outside-reviewed-scope' };
  const parsed = new RegExp(rule.sourcePattern, 'iu').exec(designation)?.groups;
  if (!parsed)
    return { reason: 'construction-or-execution-outside-reviewed-scope' };
  if (rule.requiresProtectiveMarker && !['G', 'X'].includes(parsed.protective))
    return { reason: 'construction-protective-conductor-not-specified' };
  if (product.hasGroundCore === true && parsed.protective !== 'G')
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  const cores = numeric(parsed.cores ?? rule.fixedCores);
  const group = numeric(parsed.group ?? 1);
  const section = numeric(parsed.section ?? rule.fixedSection);
  const screenSection =
    parsed.screenSection == null ? null : numeric(parsed.screenSection);
  const concentricSection =
    parsed.concentricSection == null ? null : numeric(parsed.concentricSection);
  const screen = Boolean(parsed.screen);
  const drain = parsed.drain == null ? null : numeric(parsed.drain);
  const normalizedConfiguration = (value) =>
    String(value)
      .replace(/[х×]/giu, 'x')
      .replace(/,/gu, '.')
      .replace(/\s/gu, '')
      .toLowerCase();
  const sourceExecutions = [
    parsed.executionBefore,
    parsed.executionMiddle,
    parsed.executionAfter,
  ]
    .filter(Boolean)
    .map(code);
  const execution = sourceExecutions[0] || '';
  if (
    new Set(sourceExecutions).size > 1 ||
    !(rule.executions || ['']).includes(execution)
  )
    return { reason: 'construction-or-execution-outside-reviewed-scope' };
  const sourceVoltages = [
    parsed.voltage,
    parsed.voltageV == null ? null : numeric(parsed.voltageV) / 1000,
    parsed.voltageBeforeV == null
      ? null
      : numeric(parsed.voltageBeforeV) / 1000,
  ]
    .filter((value) => value != null)
    .map(numeric);
  const classes = [parsed.classBefore, parsed.classAfter, parsed.conductorClass]
    .filter((value) => value != null)
    .map(numeric);
  if (new Set(sourceVoltages).size > 1 || new Set(classes).size > 1)
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  const sourceVoltage = sourceVoltages[0] ?? null;
  const conductorClass = classes[0] ?? null;
  const suppliedVoltage =
    product.voltage == null ? null : numeric(product.voltage);
  if (
    [
      ['cores', cores],
      ['groupCores', group],
      ['crossSection', section],
    ].some(([key, n]) => product[key] != null && numeric(product[key]) !== n) ||
    (sourceVoltage != null &&
      suppliedVoltage != null &&
      sourceVoltage !== suppliedVoltage) ||
    (product.screenCrossSection != null &&
      (screenSection == null ||
        numeric(product.screenCrossSection) !== screenSection)) ||
    (product.concentricConductorCrossSection != null &&
      (concentricSection == null ||
        numeric(product.concentricConductorCrossSection) !==
          concentricSection)) ||
    ['groundSection', 'groundCores'].some((key) => product[key] != null) ||
    ['neutralCores', 'neutralSection'].some(
      (key) =>
        product[key] != null &&
        (!rule.neutralConductor ||
          numeric(product[key]) !==
            rule.neutralConductor[key === 'neutralCores' ? 'cores' : 'section'])
    )
  )
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  if (
    product.conductorConfiguration != null &&
    (!parsed.configuration ||
      normalizedConfiguration(product.conductorConfiguration) !==
        normalizedConfiguration(parsed.configuration))
  )
    return { reason: 'construction-fields-conflict-or-outside-scope' };
  const voltage = sourceVoltage ?? suppliedVoltage;
  if (rule.requiresVoltage && voltage == null)
    return { reason: 'construction-voltage-not-specified' };
  const acceptedAttributes = new Set(
    [
      execution,
      ...[
        parsed.material,
        parsed.climate,
        parsed.conductorFinish,
        parsed.color,
        parsed.filling,
        parsed.protective,
        parsed.screen,
      ].filter(Boolean),
      ...(rule.joinSourceAttributes && execution && parsed.climate
        ? [
            `${rule.attributeExecutionPrefix || ''}${execution}${parsed.climate}`,
          ]
        : []),
      ...(rule.joinSourceAttributes &&
      parsed.conductorFinish &&
      sourceVoltage != null
        ? [`${parsed.conductorFinish}-${sourceVoltage}`]
        : []),
      ...(parsed.waterblock ? [parsed.waterblock] : []),
      ...(rule.allowedAttributes || []),
    ].map(code)
  );
  if (
    (product.attributes || []).some(
      (attribute) =>
        !acceptedAttributes.has(code(attribute)) &&
        !(voltage != null && numeric(attribute) === voltage)
    )
  )
    return { reason: 'construction-attributes-outside-reviewed-scope' };
  const rows = rule.rows.filter(
    (row) =>
      (row.protective == null || row.protective === parsed.protective) &&
      row.sections.includes(section) &&
      row.counts.includes(cores) &&
      (row.groupSizes || [1]).includes(group) &&
      Boolean(row.screen) === screen &&
      (screenSection == null
        ? row.screenSections == null
        : row.screenSections?.includes(screenSection)) &&
      (concentricSection == null
        ? row.concentricSections == null
        : row.concentricSections?.includes(concentricSection)) &&
      (!row.conductorClasses ||
        row.conductorClasses.includes(conductorClass)) &&
      (row.drain ?? null) === drain &&
      (voltage == null || row.voltagesKV?.includes(voltage))
  );
  if (!rows.length) return { reason: 'construction-combination-not-confirmed' };
  return {
    configuration: {
      cores,
      group,
      section,
      ...(rule.neutralConductor
        ? {
            neutralCores: rule.neutralConductor.cores,
            neutralSection: rule.neutralConductor.section,
          }
        : {}),
      ...(screenSection == null ? {} : { screenSection }),
      ...(concentricSection == null ? {} : { concentricSection }),
      screen,
      drain,
      conductorClass,
      ...(parsed.material ? { material: parsed.material } : {}),
      ...(parsed.climate ? { climate: parsed.climate } : {}),
      ...(parsed.protective ? { protective: parsed.protective } : {}),
      voltage,
      execution,
      documentedVoltages: [
        ...new Set(rows.flatMap((row) => row.voltagesKV || [])),
      ],
    },
  };
}
