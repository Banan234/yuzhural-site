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

function findRecord(dataset, sku) {
  let index = indexes.get(dataset);
  if (!index) {
    index = new Map();
    for (const record of dataset.records) {
      index.set(record.sku, index.has(record.sku) ? null : record);
    }
    indexes.set(dataset, index);
  }
  return index.get(sku);
}

export function getEnrichmentDecision(product, decoded, dataset = enrichment) {
  const record = findRecord(dataset, product.sku);
  if (!record) return { status: 'outside-pilot' };
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

export function enrichProductDetail(product, decoded, dataset = enrichment) {
  const decision = getEnrichmentDecision(product, decoded, dataset);
  if (['conflict', 'needs-review'].includes(decision.status)) return product;
  const content = getCatalogContent(product, decoded, dataset);
  const normalized = dataset.deduplicateDetailFireTokens
    ? deduplicateFireTokens(decoded)
    : decoded;
  const marking = content && dataset.contentAssignments?.[product.sku]?.marking;
  const published = marking
    ? { ...normalized, tokens: marking }
    : normalized;
  const enriched = {
    ...product,
    ...(content && { catalogContent: content }),
    ...(published !== decoded && { designationDecoded: published }),
  };
  if (decision.status !== 'applicable')
    return content || published !== decoded ? enriched : product;
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
      ...product.specs,
      ...Object.fromEntries(facts.map((fact) => [fact.label, fact.value])),
    },
    ...(replaceDescription ? { description } : {}),
  };
}
