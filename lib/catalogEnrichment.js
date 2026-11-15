import enrichment from '../data/catalogEnrichment.json' with { type: 'json' };
import { buildDescription } from './catalog.js';
import { isProductPending } from '../shared/productAvailability.js';

// Exact SKU decisions extend the existing decoder, never classify other products.
// Only detail presentation reads this data: list/search/filter inputs stay intact.
const identityFields = [
  'mark',
  'cores',
  'crossSection',
  'groupCores',
  'conductorConfiguration',
  'groundCores',
  'groundSection',
  'voltage',
  'manufacturer',
  'catalogBrand',
  'screenCrossSection',
  'concentricConductorCrossSection',
];
export function getEnrichmentIdentity(product) {
  return {
    sourceName: String(product.sourceName || '')
      .replace(/\s+/gu, '')
      .toUpperCase(),
    ...Object.fromEntries(
      identityFields.map((key) => [key, product[key] || null])
    ),
    hasGroundCore: Boolean(product.hasGroundCore),
    attributes: [...(product.attributes || [])].sort(),
  };
}

const allowedSpecs = new Set([
  'Материал жилы',
  'Материал изоляции',
  'Материал оболочки',
  'Назначение',
  'Бронированный',
  'Тип брони',
  'Экранированный',
  'Тип экрана',
  'Конструкция токопроводящей жилы',
  'Класс гибкости',
  'Напряжение',
]);

// Datasets are immutable snapshots. A replacement snapshot gets its own index.
const indexes = new WeakMap();

function findRecordIndex(dataset) {
  let index = indexes.get(dataset);
  if (!index) {
    index = new Map();
    for (const record of dataset.records) {
      index.set(record.sku, index.has(record.sku) ? null : record);
    }
    indexes.set(dataset, index);
  }
  return index;
}

export function getEnrichmentDecision(product, decoded, dataset = enrichment) {
  const record = findRecordIndex(dataset).get(product.sku);
  if (!record)
    return {
      status: findRecordIndex(dataset).has(product.sku)
        ? 'needs-review'
        : 'outside-pilot',
    };
  if (isProductPending(product)) return { status: 'pending' };
  if (
    record.status !== 'VERIFIED' ||
    JSON.stringify(record.identity) !==
      JSON.stringify(getEnrichmentIdentity(product)) ||
    decoded?.familyRecordId !== record.familyRecordId ||
    decoded?.constructionEvidence?.status !== 'confirmed' ||
    decoded?.constructionEvidence?.ruleId !== record.constructionRuleId ||
    decoded?.constructionEvidence?.revision !== record.constructionRevision ||
    decoded?.warnings?.length ||
    (record.factProfileRef && decoded?.officialComplete !== true)
  )
    return { status: 'needs-review' };
  const profile =
    record.factProfileRef && dataset.factProfiles?.[record.factProfileRef];
  if (
    record.factProfileRef &&
    (profile?.constructionRuleId !== record.constructionRuleId ||
      (profile.marks && !profile.marks.includes(product.mark)) ||
      (profile.attributes &&
        JSON.stringify(profile.attributes) !==
          JSON.stringify(record.identity.attributes)))
  )
    return { status: 'needs-review' };
  const facts = (profile?.facts || record.facts).filter(
    (fact) =>
      allowedSpecs.has(fact.label) &&
      fact.status === 'CONFIRMED' &&
      ['A', 'B'].includes(fact.reliability?.category) &&
      fact.sources.length > 0 &&
      (!fact.sections || fact.sections.includes(product.crossSection))
  );
  const conflicts = facts.filter(
    (fact) =>
      product.specs?.[fact.label] != null &&
      String(product.specs[fact.label]).trim() !== fact.value
  );
  if (conflicts.length)
    return { status: 'conflict', labels: conflicts.map((fact) => fact.label) };
  return { status: 'applicable', record, facts };
}

// Reuse only size-independent properties of explicitly reviewed executions.
const familySpecLabels = new Set([
  'Материал жилы',
  'Материал изоляции',
  'Материал оболочки',
  'Назначение',
  'Бронированный',
  'Тип брони',
  'Экранированный',
  'Тип экрана',
]);

const familySpecProfiles = new Set([
  'avvg-base',
  'avvg-nga',
  'avvg-ls',
  'vvg-base',
  'vvg-nga',
  'vvgng-a-ls',
  'vvg-frls',
  'vbshv-base',
  'vbshv-nga',
  'vbshvng-a-ls',
  'vbbshv-base',
  'avbshv-base',
  'avbbshv-base',
  'kvvg-base',
  'kvvg-nga',
  'kvvgng-a-ls',
  'kvbbshv-base',
  'kvbbshv-nga',
  'kg-base',
  'kg-khl',
  'kg-base-single',
  'kg-khl-single',
  'kgn',
  'kgn-single',
  'ppg-hf',
  'ppg-frhf',
  'mksh-base',
  'mkesh-base',
]);

const familySpecsIndexes = new WeakMap();

function familySpecsKey(family, identity) {
  return JSON.stringify([
    family,
    identity.mark,
    identity.attributes,
    identity.cores,
  ]);
}

function getFamilySpecsIndex(dataset) {
  let index = familySpecsIndexes.get(dataset);
  if (index) return index;
  index = new Map();
  for (const record of dataset.records) {
    if (
      record.status !== 'VERIFIED' ||
      !familySpecProfiles.has(record.factProfileRef)
    )
      continue;
    const profile = dataset.factProfiles?.[record.factProfileRef];
    if (!profile || profile.constructionRuleId !== record.constructionRuleId)
      continue;
    const key = familySpecsKey(record.familyRecordId, record.identity);
    const scopes = index.get(key) || new Map();
    scopes.set(record.factProfileRef, profile);
    index.set(key, scopes);
  }
  familySpecsIndexes.set(dataset, index);
  return index;
}

function getFamilySpecs(product, decoded, dataset) {
  if (
    isProductPending(product) ||
    decoded?.status !== 'reviewed' ||
    decoded.warnings?.length ||
    decoded.unknown?.length ||
    product.parsingWarnings?.length
  )
    return null;

  const identity = getEnrichmentIdentity(product);
  const scopes = getFamilySpecsIndex(dataset).get(
    familySpecsKey(decoded.familyRecordId, identity)
  );
  if (!scopes) return null;

  // This size falls outside the original ХКА table. Южкабель's АВБбШв 4x4
  // technical sheet confirms the same common layers and use; no ratings or
  // dimensions from that sheet are transferred.
  // https://www.yuzhcable.info/datasheet/mrr/180101140040100000/lang/ru
  const extraAvbbshvSize =
    decoded.familyRecordId === 'family-0006' &&
    decoded.constructionEvidence?.reason ===
      'construction-combination-not-confirmed' &&
    identity.cores === 4 &&
    identity.crossSection === 4 &&
    identity.voltage == null &&
    /^АВББШВ4[ХX×]4$/u.test(identity.sourceName);

  const values = new Map();
  for (const [id, profile] of scopes) {
    if (
      !(
        decoded.constructionEvidence?.status === 'confirmed' &&
        (decoded.constructionEvidence.ruleId === profile.constructionRuleId ||
          (id === 'vbbshv-base' &&
            decoded.constructionEvidence.ruleId === 'scope-family-0004-hka'))
      ) &&
      !(extraAvbbshvSize && id === 'avbbshv-base')
    )
      continue;
    for (const fact of profile.facts) {
      if (
        !familySpecLabels.has(fact.label) ||
        fact.status !== 'CONFIRMED' ||
        fact.reliability?.category !== 'B' ||
        fact.sections ||
        !['family', 'execution'].includes(fact.scope) ||
        !fact.sources?.length
      )
        continue;
      if (
        (values.has(fact.label) && values.get(fact.label) !== fact.value) ||
        (product.specs?.[fact.label] != null &&
          String(product.specs[fact.label]).trim() !== fact.value)
      )
        return null;
      values.set(fact.label, fact.value);
    }
  }
  const additions = [...values].filter(
    ([label]) => product.specs?.[label] == null
  );
  return additions.length ? Object.fromEntries(additions) : null;
}

export function usesOriginalDesignationForSpecs(
  product,
  decoded,
  dataset = enrichment
) {
  return (
    dataset.contentAssignments?.[product.sku]?.preserveDecodedSpecs === true &&
    Boolean(getCatalogContent(product, decoded, dataset))
  );
}

const unresolvedPlaceholder =
  /\b(?:None|undefined|null|NaN)\b|\$\{[^}]*\}|\{\{[^}]*\}\}|%[sd]\b/iu;

export function isCatalogBlockText(value) {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    !unresolvedPlaceholder.test(value)
  );
}

function getCatalogContent(product, decoded, dataset) {
  const entry = dataset.contentAssignments?.[product.sku];
  const profile = dataset.contentProfiles?.[entry?.profile];
  if (
    !profile ||
    isProductPending(product) ||
    entry.family !== decoded?.familyRecordId ||
    (profile.families && !profile.families.includes(entry.family)) ||
    decoded.status !== 'reviewed' ||
    decoded.warnings?.length ||
    JSON.stringify(entry.identity) !==
      JSON.stringify(getEnrichmentIdentity(product))
  )
    return null;
  const { text, construction, application, selection } = profile;
  if (![text, construction, application, selection].every(isCatalogBlockText))
    return null;
  const fallback = buildDescription(
    product,
    product.category,
    product.unit,
    product.stock
  );
  const hasEditorialDescription =
    product.description && product.description !== fallback;
  const familyMark = {
    'family-0537': 'ЛОУТОКС 20',
    'family-0651': 'АС',
    'family-0652': 'ПАВ',
  }[entry.family];
  return {
    ...(familyMark && { familyMark }),
    ...(hasEditorialDescription ? {} : { text }),
    construction,
    application,
    selection,
  };
}

const fireCode = (code) => {
  const key = code.toUpperCase().replace(/[\s-]/gu, '').replace('(A)', '(А)');
  return /^НГ(?:\([АБВГДСA-D]\))?(?:FR)?(?:LS|HF)?(?:LTX)?(?:ХЛ)?$/u.test(key)
    ? key
    : null;
};

function deduplicateFireTokens(decoded) {
  const tokens = decoded?.tokens;
  if (!tokens) return decoded;
  const keys = tokens.map(({ code }) => fireCode(code));
  const filtered = tokens.filter((token, index) => {
    const key = keys[index];
    if (!key) return true;
    if (keys.indexOf(key) !== index) return false;
    return !keys.some(
      (other) =>
        other &&
        other !== key &&
        other.startsWith(key) &&
        /^(?:LS|HF|LTX|ХЛ)$/u.test(other.slice(key.length))
    );
  });
  return filtered.length === tokens.length
    ? decoded
    : { ...decoded, tokens: filtered };
}

function getMixedThermocoupleSpecs(product, assignment) {
  if (
    assignment?.mixedThermocouplePair !== true ||
    product.cores !== 1 ||
    product.groundCores !== 1 ||
    !product.crossSection ||
    !product.groundSection
  ) {
    return null;
  }
  const specs = { ...product.specs };
  delete specs['Сечение жилы'];
  delete specs['Доп. жила'];
  specs['Количество жил'] = '2';
  const sections = [product.crossSection, product.groundSection].map((value) =>
    value.toLocaleString('ru-RU')
  );
  specs['Сечения жил'] = `${sections.join(' и ')} мм²`;
  return specs;
}

export function enrichProductDetail(product, decoded, dataset = enrichment) {
  const decision = getEnrichmentDecision(product, decoded, dataset);
  if (['conflict', 'needs-review'].includes(decision.status)) return product;
  const content = getCatalogContent(product, decoded, dataset);
  const normalized = dataset.deduplicateDetailFireTokens
    ? deduplicateFireTokens(decoded)
    : decoded;
  const assignment = content ? dataset.contentAssignments?.[product.sku] : null;
  const marking = assignment?.marking;
  const mixedSpecs = getMixedThermocoupleSpecs(product, assignment);
  const published =
    marking?.length &&
    marking.every(
      ({ code, text }) => isCatalogBlockText(code) && isCatalogBlockText(text)
    )
      ? { ...normalized, tokens: marking }
      : normalized;
  const enriched = {
    ...product,
    ...(content && { catalogContent: content }),
    ...(mixedSpecs && {
      specs: mixedSpecs,
      displayDimensions: { kind: 'mixed-section' },
    }),
    ...(published !== decoded && { designationDecoded: published }),
  };
  if (decision.status !== 'applicable') {
    const familySpecs =
      decision.status === 'outside-pilot'
        ? getFamilySpecs(product, decoded, dataset)
        : null;
    if (familySpecs)
      return { ...enriched, specs: { ...enriched.specs, ...familySpecs } };
    return content || published !== decoded ? enriched : product;
  }
  const { record, facts } = decision;
  const sharedDescription = dataset.descriptions?.[record.descriptionRef];
  const description =
    sharedDescription?.constructionRuleId === record.constructionRuleId &&
    (!sharedDescription.factProfileRef ||
      sharedDescription.factProfileRef === record.factProfileRef)
      ? sharedDescription?.text || record.description
      : record.description;
  const fallback = buildDescription(
    product,
    product.category,
    product.unit,
    product.stock
  );
  const replaceDescription =
    description && (!product.description || product.description === fallback);
  const corrections = record.markingReview?.detailCorrections;
  const designationDecoded = corrections && {
    ...published,
    tokens: published.tokens.map((token) =>
      Object.hasOwn(corrections, token.code)
        ? { ...token, text: corrections[token.code] }
        : token
    ),
  };
  return {
    ...enriched,
    ...(content &&
      description && {
        catalogContent: {
          ...content,
          text: undefined,
        },
      }),
    ...(designationDecoded && { designationDecoded }),
    specs: {
      ...enriched.specs,
      ...Object.fromEntries(facts.map((fact) => [fact.label, fact.value])),
    },
    ...(replaceDescription ? { description } : {}),
  };
}
