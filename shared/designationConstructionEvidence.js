import { checkOpticalConstruction } from './designationOpticalEvidence.js';
import { checkConstructionTable } from './designationConstructionTable.js';
import registry from './designationConstructionEvidence.json' with { type: 'json' };

export const CONSTRUCTION_EVIDENCE_REVISION = registry.revision;

// This proof is deliberately separate from human-readable decoding. A recognized
// token, a plausible number or a link to a family is not a construction proof.
function hasDocumentEvidence(evidence, documents) {
  const doc = documents.find((item) => item.id === evidence.documentId);
  if (
    !/^[a-f0-9]{64}$/u.test(evidence.sha256 || '') ||
    !doc ||
    doc.status !== 'collected' ||
    doc.publisherType !== 'manufacturer' ||
    doc.sha256 !== evidence.sha256
  )
    return false;
  if (evidence.format === 'html')
    return Boolean(
      (doc.format === 'html' || /html/u.test(doc.contentType || '')) &&
      evidence.locator
    );
  return (
    Boolean(evidence.pages?.length) &&
    evidence.pages.every(
      (page) => Number.isInteger(page) && page > 0 && page <= doc.pages
    )
  );
}

function checkRule({ product, designation, family, documents, rule }) {
  const unknown = (reason) => ({
    status: 'unconfirmed',
    reason,
    revision: registry.revision,
  });
  if (rule.dimension !== family.dimension || rule.mark !== family.mark)
    return unknown('construction-family-scope-changed');
  if (
    (product.hasGroundCore === true && !rule.requiresProtectiveMarker) ||
    (!rule.neutralConductor &&
      ['neutralCores', 'neutralSection'].some((key) => product[key] != null)) ||
    [
      'conductorStrandCount',
      'doubleInsulationThickness',
      ...(rule.kind === 'optical-table'
        ? []
        : ['opticalFiberCladdingDiameter', 'opticalFiberCoreDiameter']),
    ].some((key) => product[key] != null)
  )
    return unknown('construction-fields-conflict-or-outside-scope');
  const proofs = [rule.evidence, ...(rule.supportingEvidence || [])];
  if (proofs.some((proof) => !hasDocumentEvidence(proof, documents)))
    return unknown('construction-document-not-verified');
  if (['conductor-table', 'optical-table'].includes(rule.kind)) {
    const result =
      rule.kind === 'optical-table'
        ? checkOpticalConstruction(product, designation, rule)
        : checkConstructionTable(product, designation, rule);
    if (result.reason) return unknown(result.reason);
    return {
      status: 'confirmed',
      revision: registry.revision,
      ruleId: rule.id,
      evidence: rule.evidence,
      supportingEvidence: rule.supportingEvidence || [],
      configuration: result.configuration,
    };
  }
  if (rule.sourcePattern) {
    if (
      !new RegExp(rule.sourcePattern, 'u').test(designation) ||
      (product.attributes || []).some(
        (attribute) =>
          !new RegExp(rule.attributePattern || '^$', 'iu').test(
            String(attribute).replace(/\s/gu, '')
          )
      ) ||
      product.voltage != null ||
      [
        'cores',
        'crossSection',
        'groupCores',
        'screenCrossSection',
        'groundCores',
        'groundSection',
        'concentricConductorCrossSection',
        'conductorConfiguration',
      ].some((key) => product[key] != null)
    )
      return unknown('model-configuration-outside-reviewed-scope');
    return {
      status: 'confirmed',
      revision: registry.revision,
      ruleId: rule.id,
      evidence: rule.evidence,
      supportingEvidence: rule.supportingEvidence || [],
      configuration: rule.configuration,
    };
  }
  const escaped = rule.mark.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    `^${escaped}\\s+(?<cores>[1-9]\\d*)\\s*[хx×]\\s*(?<section>\\d+(?:[.,]\\d+)?)(?:\\s*[- ]\\s*(?<voltage>\\d+(?:[.,]\\d+)?)\\s*(?:кВ)?)?\\s*$`,
    'iu'
  ).exec(designation);
  if (!match)
    return unknown('construction-or-execution-outside-reviewed-scope');
  const value = (v) => Number(String(v).replace(',', '.'));
  const cores = value(match.groups.cores),
    section = value(match.groups.section);
  const sourceVoltage =
    match.groups.voltage == null ? null : value(match.groups.voltage);
  const suppliedVoltage =
    product.voltage == null ? null : value(product.voltage);
  if (
    [
      ['cores', cores],
      ['crossSection', section],
    ].some(([key, n]) => product[key] != null && value(product[key]) !== n) ||
    (sourceVoltage != null &&
      suppliedVoltage != null &&
      sourceVoltage !== suppliedVoltage) ||
    (product.groupCores != null && value(product.groupCores) !== 1) ||
    [
      'screenCrossSection',
      'groundCores',
      'groundSection',
      'concentricConductorCrossSection',
      'conductorConfiguration',
    ].some((key) => product[key] != null)
  )
    return unknown('construction-fields-conflict-or-outside-scope');
  const voltage = sourceVoltage ?? suppliedVoltage;
  // Extra attributes must not smuggle a different execution behind a base mark.
  if (
    (product.attributes || []).some(
      (attribute) => voltage == null || value(attribute) !== voltage
    )
  )
    return unknown('construction-attributes-outside-reviewed-scope');
  const combinations = rule.combinations.filter(
    (c) =>
      c.cores.includes(cores) &&
      section >= c.min &&
      section <= c.max &&
      rule.nominalSections.includes(section) &&
      (voltage == null || c.voltage === voltage)
  );
  if (!combinations.length)
    return unknown('construction-combination-not-confirmed');
  return {
    status: 'confirmed',
    revision: registry.revision,
    ruleId: rule.id,
    evidence: rule.evidence,
    configuration: {
      cores,
      section,
      voltage,
      documentedVoltages: [...new Set(combinations.map((c) => c.voltage))],
    },
  };
}

export function checkDesignationConstruction(input) {
  const rules = registry.rules.filter(
    (rule) => rule.familyId === input.family?.id
  );
  if (!rules.length)
    return {
      status: 'unconfirmed',
      reason: 'construction-rule-not-reviewed',
      revision: registry.revision,
    };
  const results = rules.map((rule) => checkRule({ ...input, rule }));
  return (
    results.find((result) => result.status === 'confirmed') ||
    results.find(
      (result) =>
        ![
          'construction-or-execution-outside-reviewed-scope',
          'model-configuration-outside-reviewed-scope',
        ].includes(result.reason)
    ) ||
    results[0]
  );
}
