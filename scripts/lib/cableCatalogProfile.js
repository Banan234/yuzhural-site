import { withCableVisualization } from './cableVisualizationType.js';
import reviewedConstructions from '../../data/cableGenerationReviewedConstructions.json' with { type: 'json' };
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';
import { buildCableTechnicalProfile } from './cableTechnicalProfile.js';
import { getVvgProductIllustrationProfile } from './cableVvgIllustration.js';
import rules from '../../data/cableVisualClassificationRules.json' with { type: 'json' };
import familyVisualRules from '../../data/familyVisualRules.json' with { type: 'json' };
import knowledge from '../../shared/designationKnowledgeBase.json' with { type: 'json' };
import colorRules from '../../data/cableImageColors.json' with { type: 'json' };
import { collectCableCardEvidence } from './cableCatalogEvidence.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getEnrichmentDecision } from '../../lib/catalogEnrichment.js';
import { prepareProductDetail } from '../../lib/productPresentation.js';
import { makeVisualIdentity } from './cableVisualClassification.js';

export const CATALOG_CABLE_VERSION = 'catalog-construction-1';
const lookup = (options, value) => {
  const key = typeof value === 'string' ? value.trim() : value;
  return Object.hasOwn(options, key) ? options[key] : null;
};
const bool = value => lookup({ 'Да': true, 'Нет': false }, value);
const text = value => typeof value === 'string' && value.trim() &&
  !/https?:\/\/|www\.|уточняется|неизвестно|не указано|не подтверждено/iu.test(value) ? value.trim() : null;
const density = { 'Однопроволочная': 'solid', 'Многопроволочная': 'stranded' };
const shape = { 'Круглая': 'circular', 'Секторная': 'sector' };
const geometry = { 'Круглый': 'round', 'Круглая': 'round', 'Плоский': 'flat', 'Плоская': 'flat' };
const metals = { 'Медь': 'copper', 'Лужёная медь': 'copper', 'Луженая медь': 'copper', 'Алюминий': 'aluminium' };
const fireExecution = value => /(?:FR(?=LS|HF|[\s-]|$)|^FE)/iu.test(value);
const screenTypes = { 'Медная лента': 'copper-tape', 'Медные ленты': 'copper-tape',
  'Медная фольга': 'copper-foil', 'Алюминиевая фольга': 'aluminium-foil',
  'Алюмофлекс': 'alumoflex', 'Медная оплётка': 'copper-wire-braid' };
const armorTypes = { 'Стальные ленты': 'steel-tapes', 'Стальные оцинкованные ленты': 'steel-tapes',
  'Стальная гофрированная лента': 'corrugated-steel-tape',
  'Оплётка из стальных оцинкованных проволок': 'steel-wires',
  'Условная броня': 'schematic-armor', 'Стальные проволоки': 'steel-wires', 'Стальные оцинкованные проволоки': 'steel-wires' };
const missing = field => 'catalog-missing-or-ambiguous: ' + field;
const conflict = field => 'catalog-conflict: ' + field;

const schematicPolymerFields = new Set([
  'Материал изоляции', 'Материал оболочки', 'Материал внутренней оболочки', 'Материал заполнения',
]);

// Catalog cores counts groups for N×M×S records; image cores always counts metal ends.
function catalogCoreLayout(product) {
  let primary = Number(product.cores);
  const groupSize = Number(product.groupCores || 1);
  let auxiliary = Number(product.groundCores ?? product.neutralCores ?? 0);
  let auxiliarySection = Number(product.groundSection ?? product.neutralSection);
  let section = Number(product.crossSection);
  const configuration = product.conductorConfiguration?.replace(/[xх×]/giu, '×').replace(/,/gu, '.').replace(/\s/gu, '');
  const decoded = product.designationDecoded;
  const tokens = decoded?.tokens ?? [];
  if (!primary && !configuration && !auxiliary && groupSize === 1) {
    const singleWire = product.catalogCategorySlug === 'provoda' && decoded?.status === 'reviewed' &&
      (decoded.family === 'ПАВ' || /^Одножильный /iu.test(decoded.description ?? '') ||
        tokens.some(token => /^(?:Одна жила;|1 жила;)/iu.test(token.text)));
    if (singleWire) return { count: 1, singleWire: true };
    const description = [decoded?.description, ...tokens.map(token => token.text)].join(' ');
    if (product.catalogCategorySlug === 'kabeli-peredachi-dannykh' &&
        /коаксиальн/iu.test(description) && !/двухкоаксиальн|триаксиальн|жил[аы][^.;]{0,35}(?:сталь|медно-никел)|стальн[^.;]{0,35}жил/iu.test(description))
      return { count: 1, coaxial: true };
  }
  if (product.catalogCategorySlug === 'kabeli-peredachi-dannykh' && !primary && !auxiliary) {
    const counts = new Set(tokens.map(({ text: phrase }) => {
      const match = /^(?:Количество витых пар:\s*(\d+)|(?:(Четыре)|(Две)|([1-9]\d*)\s+)(?:витые )?пар[ыа]?)(?=\s|[.,;:]|$)/iu.exec(phrase);
      return match ? Number(match[1] ?? (match[2] ? 4 : match[3] ? 2 : match[4])) : null;
    }).filter(Boolean));
    const mark = [product.sourceName, product.name].filter(Boolean).join(' ');
    for (const match of mark.matchAll(/(?<![\p{L}\d])(?:пар[ыа]?\s*(\d+)|(\d+)\s*PR)(?![\p{L}\d])/giu))
      counts.add(Number(match[1] ?? match[2]));
    if (/(?:CAT\.?|кат\.?|[UFS]\/[UF]TP)/iu.test(mark))
      for (const match of mark.matchAll(/(?<![\p{L}\d])(\d+)\s*P(?![\p{L}\d])/giu))
        counts.add(Number(match[1]));
    if (counts.size > 1) return { issue: conflict('число витых пар') };
    const [pairs] = counts;
    if (pairs >= 1 && pairs <= 50)
      return { count: pairs * 2, groupSize: 2, grouped: true, networkPairs: true };
  }
  const paired = /^(\d+)×(?:\((\d+)×(\d+(?:\.\d+)?)\)|(\d+)×(\d+(?:\.\d+)?))$/u.exec(configuration ?? '');
  const awgGroup = product.catalogCategorySlug === 'kabeli-peredachi-dannykh' &&
    /^(\d+)×(\d+)×(?:AWG\d+|\d+AWG)$/iu.exec(configuration ?? '');
  const evidence = product.designationDecoded?.constructionEvidence;
  if (groupSize > 1 || paired || awgGroup) {
    const declaredSize = paired ? Number(paired[2] ?? paired[4]) : awgGroup ? +awgGroup[2] : groupSize;
    const declaredCount = paired ? Number(paired[1]) : awgGroup ? +awgGroup[1] : primary;
    const declaredSection = paired ? Number(paired[3] ?? paired[5]) : section;
    const reviewed = evidence?.status === 'confirmed' && evidence.configuration?.cores === primary &&
      evidence.configuration?.group === groupSize;
    if ((paired || awgGroup) && ((primary && primary !== declaredCount) || (product.groupCores && groupSize !== declaredSize) ||
        (section && section !== declaredSection)))
      return { issue: conflict('количество или сечение жил в группе') };
    if ((paired || awgGroup || (reviewed && !configuration)) && declaredCount > 0 && [2, 3, 4].includes(declaredSize) &&
        !auxiliary && !auxiliarySection && !product.hasGroundCore)
      return { count: declaredCount * declaredSize, groupSize: declaredSize, grouped: true };
    return { issue: 'catalog-unsupported: неподтверждённый состав групп жил' };
  }
  const compound = /^(\d+)×(\d+(?:\.\d+)?)(?:\(([СсCc])\))?\+(\d+)×(\d+(?:\.\d+)?)$/u.exec(configuration ?? '');
  if (compound) {
    const [, n, area, , extra, extraArea] = compound;
    if ((primary && primary !== +n) || (section && section !== +area) ||
        (auxiliary && auxiliary !== +extra) || (auxiliarySection && auxiliarySection !== +extraArea))
      return { issue: conflict('число или сечение составных жил') };
    [primary, section, auxiliary, auxiliarySection] = [+n, +area, +extra, +extraArea];
  }
  if (auxiliary || auxiliarySection || product.hasGroundCore) {
    if (!Number.isInteger(primary) || primary < 1 || !Number.isInteger(auxiliary) || auxiliary < 1 ||
        !Number.isFinite(section) || !Number.isFinite(auxiliarySection) || Math.min(section, auxiliarySection) <= 0 || (configuration && !compound))
      return { issue: 'catalog-unsupported: неизвестно количество или сечение дополнительных жил' };
    const role = product.hasPE === true && product.hasN !== true ? 'PE' :
      product.hasN === true && product.hasPE !== true ? 'N' : null;
    const maximum = Math.max(section, auxiliarySection);
    return { count: primary + auxiliary, mixed: true, parsedCompound: Boolean(compound), sectionGroups: [
      { count: primary, section: section / maximum, ...(compound?.[3] && { conductorShape: 'sector' }) },
      { count: auxiliary, section: auxiliarySection / maximum, ...(role && auxiliary === 1 && { role }) },
    ] };
  }
  const screenNotation = /^\d+×\d+(?:\.\d+)?(?:[ом][ксж])?\/(\d+(?:\.\d+)?)$/iu.exec(configuration ?? '');
  const screenSection = Number(product.screenCrossSection);
  if (screenNotation && +screenNotation[1] === screenSection && screenSection > 0 &&
      product.designationDecoded?.tokens?.some(token => /^Сечение металлического экрана /u.test(token.text)))
    return {};
  return configuration ? { issue: 'catalog-unsupported: неоднозначная составная маркировка жил' } : {};

}

// Rendering templates extend the existing rule library. The saved evidence
// scope ties the template to a reviewed marking and size, not to a bare label.
function selectReviewedVisualTemplate(product) {
  const resolved = product.designationDecoded?.constructionEvidence;
  const rule = familyVisualRules.reviewedVisualTemplates?.[resolved?.ruleId];
  const document = knowledge.documents.find(item => item.id === (rule?.documentId ?? 'hka'));
  if (!rule || resolved.status !== 'confirmed' || rule.family !== product.markFamily ||
      !document?.sha256 || resolved.evidence?.documentId !== document.id ||
      resolved.evidence?.sha256 !== document.sha256)
    return null;
  const { cores, group, section } = resolved.configuration ?? {};
  if (!Number.isFinite(section) || section <= 0 || Number(product.crossSection) !== section ||
      Number(product.cores) !== cores || Number(product.groupCores ?? 1) !== group)
    return null;
  const fields = Object.fromEntries(Object.entries(rule.fields).map(([label, value]) =>
    [label, typeof value === 'string' ? value : value[cores + ':' + group] ?? value[cores]]));
  const fire = (product.attributes ?? []).some(value => /FR/iu.test(value));
  if (fire && rule.fireBarrier === 'mica-under-insulation') {
    fields['Огнестойкий барьер'] = 'Да';
    fields['Материал огнестойкого барьера'] = 'Слюдосодержащие ленты';
    fields['Расположение огнестойкого барьера'] = 'Под индивидуальной изоляцией каждой жилы';
  }
  return { fields, source: rule.source, ruleId: resolved.ruleId, integratedFilling: rule.integratedFilling };
}

function readExplicitCableCatalogProfile(product, layout, schematic = null) {
  const decoded = product.designationDecoded;
  const detail = decoded ? prepareProductDetail(product, '', { designationDecoded: decoded }) : product;
  const specs = { ...detail.specs };
  const template = selectReviewedVisualTemplate(product);
  const catalogEvidence = collectCableCardEvidence(detail);
  const provenance = {};
  const recovered = {};
  const fields = {};
  const requirements = { critical: [], conditional: [], optional: [] };
  const issues = [];
  const assumptions = {};
  if (decoded) {
    const enrichment = getEnrichmentDecision(product, decoded);
    if (enrichment.status === 'conflict') issues.push(...enrichment.labels.filter(label => !schematicPolymerFields.has(label)).map(conflict));
  }
  const get = (label, decode = text, category = 'critical') => {
    requirements[category].push(label);
    const visualConflict = !schematicPolymerFields.has(label);
    const explicit = product.specs?.[label];
    if (visualConflict && explicit != null && specs[label] != null && (decode(explicit) !== decode(specs[label]) || (decode(explicit) == null && explicit !== specs[label])))
      issues.push(conflict(label));
    const cardValue = specs[label];
    const supporting = (catalogEvidence.get(label) ?? []).filter(row => decode(row.value) != null);
    const stated = decode(cardValue);
    const distinct = new Set(supporting.map(row => decode(row.value)));
    if (visualConflict && (distinct.size > 1 || (stated != null && !distinct.has(stated) && distinct.size > 0)))
      issues.push(conflict(label));
    if (cardValue == null && distinct.size === 1) {
      specs[label] = supporting[0].value;
      recovered[label] = supporting;
    }
    const templateValue = template?.fields[label];
    const inferred = specs[label] == null && templateValue != null && decode(templateValue) != null;
    if (['Бронированный', 'Экранированный', 'Форма кабеля', 'Форма токопроводящей жилы',
         'Конструкция токопроводящей жилы', 'Внутренняя оболочка', 'Расположение экрана',
         'Заполнение сердечника', 'Разделительный слой', 'Дренажный проводник'].includes(label) && templateValue != null &&
        decode(specs[label]) != null && decode(specs[label]) !== decode(templateValue))
      issues.push(conflict(label + ' и подтверждённое исполнение семейства'));
    if (inferred) {
      specs[label] = template.fields[label];
      recovered[label] = [{ value: specs[label], source: template.ruleId, statement: template.source }];
    }
    const value = !visualConflict && (distinct.size > 1 || (distinct.size === 1 && stated != null && !distinct.has(stated)))
      ? null : decode(specs[label]);
    if (value == null || (value === false && decode === text)) {
      const fallback = schematic?.[label];
      if (fallback != null && decode(fallback) != null &&
          (specs[label] == null || !text(specs[label])) && !issues.includes(conflict(label))) {
        assumptions[label] = { value: fallback, status: 'UNCONFIRMED', basis: 'schematic-default' };
        return decode(fallback);
      }
      if (category !== 'optional') issues.push(missing(label));
      return null;
    }
    if (specs[label] != null) fields[label] = specs[label];
    provenance[label] = [
      ...(cardValue != null ? [{ value: cardValue, source: 'specs.' + label }] : []),
      ...supporting,
      ...(inferred ? recovered[label] : []),
    ];
    return value;
  };
  requirements.critical.push('Количество жил', 'markFamily');
  const cores = layout.count ?? product.cores;
  if (!Number.isInteger(cores) || cores < 1 || cores > 100) issues.push(missing('Количество жил'));
  // Detail presentation may display the primary count beside a separate group/
  // auxiliary field. A number explicitly supplied as a total is still checked.
  const displayedCount = product.specs?.['Количество жил'] ??
    (layout.count == null ? specs['Количество жил'] : null);
  if (displayedCount != null && Number(displayedCount) !== cores)
    issues.push(conflict('Количество жил'));
  if (layout.issue) issues.push(layout.issue);
  // These published notes address material of the jacket, which already has
  // a neutral rendering when its presence and geometry are known.
  const jacketMaterialNotes = new Set([
    'Описание полиэтиленовой оболочки базового исполнения не подтверждает материал оболочки исполнения HF.',
    'Индекс HF изменяет требования к материалам. Базовое описание марки не подтверждает материал этого исполнения.',
  ]);
  if (product.parsingWarnings?.length || (!schematic && decoded?.unknown?.length) ||
      decoded?.warnings?.some(note => !jacketMaterialNotes.has(note) &&
        !(layout.parsedCompound && note.startsWith('Сложная конфигурация жил разобрана не полностью;'))))
    issues.push('catalog-conflict: неразрешённые параметры расшифровки');
  const conductorMaterial = get('Материал жилы', value => lookup(metals, value));
  const conductorFinish = /^луж[её]ная медь$/iu.test(fields['Материал жилы'] ?? '') ? 'tinned' : null;
  const conductorConstruction = get('Конструкция токопроводящей жилы', value => lookup(density, value));
  const conductorShape = get('Форма токопроводящей жилы', value => lookup(shape, value));
  const cableGeometry = get('Форма кабеля', value => lookup(geometry, value));
  const insulationMaterial = get('Материал изоляции', text, 'optional');
  const outer = get('Наружная оболочка', value => value == null && text(specs['Материал оболочки'])
    ? true : bool(value));
  // An explicitly confirmed jacket can be shown in neutral presentation.
  // Missing material does not say anything about the existence of that layer.
  const outerMaterial = outer === true ? get('Материал оболочки', text, 'optional') : null;
  const shield = get('Экранированный', bool);
  const armor = get('Бронированный', bool);
  const armorType = armor ? get('Тип брони', value => lookup(armorTypes, value), 'conditional') : null;
  if (shield) get('Тип экрана', value => lookup(screenTypes, value), 'optional');
  // Actual screen material stays in catalogSource.fields. All supported screens
  // use the same symbolic rendering, so this field does not split visual keys.
  const shieldType = null;
  const screenPlacement = shield ? get('Расположение экрана', value => ({'Под наружной оболочкой': 'under-outer-jacket', 'Вокруг каждой пары': 'each-pair',
    'Общий и вокруг каждой пары': 'overall-and-each-pair'})[value] ?? null, 'conditional') : null;
  const attrs = Array.isArray(product.attributes) ? product.attributes : [];
  const filled = get('Заполнение сердечника', value => lookup({ 'Предусмотрено': true, 'Не предусмотрено': false, 'Да': true, 'Нет': false }, value), attrs.includes('З') ? 'critical' : 'optional');
  const fillingMaterial = filled ? get('Материал заполнения', value => value === 'ПВХ' ? 'ПВХ-пластикат' : text(value), 'optional') : null;
  const fillingPlacement = filled ? get('Расположение заполнения', value => value === 'Между изолированными жилами' ? 'between-insulated-cores' : null, 'conditional') : null;
  const specialFire = specs['Огнестойкое исполнение'] === 'Да' || attrs.some(value => fireExecution(value));
  const directContact = bool(specs['Непосредственный контакт оболочки с изоляцией']);
  const inner = get('Внутренняя оболочка', bool,
    (shield || armor || specialFire) && directContact !== true ? 'conditional' : 'optional');
  const innerMaterial = inner ? get('Материал внутренней оболочки', text, 'optional') : null;
  const fire = get('Огнестойкий барьер', bool, specialFire && !schematic ? 'conditional' : 'optional');
  const barrierMaterial = fire ? get('Материал огнестойкого барьера', value => value === 'Слюдосодержащие ленты' ? 'mica-containing-tapes' : null, schematic ? 'optional' : 'conditional') : null;
  const barrierPlacement = fire ? get('Расположение огнестойкого барьера', value => value === 'Под индивидуальной изоляцией каждой жилы' ? 'around-each-conductor-under-individual-insulation' : null, schematic ? 'optional' : 'conditional') : null;
  const visibleFire = fire === true && Boolean(barrierMaterial && barrierPlacement);
  const omittedFire = Boolean(schematic && !visibleFire && ((specialFire && fire !== false) || fire));
  if (omittedFire)
    assumptions.fireBarrier = { value: 'not-exposed', status: 'UNCONFIRMED', basis: 'unknown-barrier-construction' };
  const drainWire = get('Дренажный проводник', bool, 'optional');
  const separator = get('Разделительный слой', bool, 'optional');
  const separatorDetails = separator ? get('Конструкция разделительного слоя', text, 'conditional') : null;
  if (directContact !== null) fields['Непосредственный контакт оболочки с изоляцией'] =
    specs['Непосредственный контакт оболочки с изоляцией'];
  if (directContact && (!outer || inner || filled || shield || armor || separator))
    issues.push(conflict('Непосредственный контакт оболочки с изоляцией'));
  if ((attrs.includes('Э') || Number(product.screenCrossSection) > 0) && shield === false ||
      (attrs.includes('З') && filled === false) ||
      (filled === true && cores === 1) || (inner !== true && Boolean(specs['Материал внутренней оболочки'])) ||
      (filled !== true && Boolean(specs['Материал заполнения'] || specs['Расположение заполнения'])) ||
      (fire === false && Boolean(specs['Материал огнестойкого барьера'] || specs['Расположение огнестойкого барьера'])) ||
      (separator !== true && Boolean(specs['Конструкция разделительного слоя'])) ||
      (shield === false && (specs['Тип экрана'] || drainWire)) ||
      (armor === false && specs['Тип брони']) ||
      (outer === false && (specs['Материал оболочки'] || inner || filled || shield || armor)))
    issues.push(conflict('слои и флаги исполнения'));
  if (!schematic && !text(product.markFamily)) issues.push(missing('markFamily'));
  const source = { version: CATALOG_CABLE_VERSION, sku: product.sku,
    family: product.markFamily, fields: { cores, ...fields },
    ...(schematic && { renderingAssumptions: assumptions }),
    ...(template && { renderingBasis: template.ruleId }),
    provenance: { cores: [{value:cores, source: layout.count == null ? 'product.cores' : 'parsed grouping and auxiliary conductors'}], ...provenance }, recovered,
    ...(outer === true && specs['Наружная оболочка'] == null && { derivations: { hasOuterJacket: 'Материал оболочки' } }) };
  const known = { cores: Number.isInteger(cores) ? cores : null, conductorMaterial, conductorConstruction,
    ...(conductorFinish && { conductorFinish }),
    conductorShape, geometry: cableGeometry, hasOuterJacket: outer, shield, armor, armorType,
    filling: filled, innerSheath: inner, fireBarrier: fire, drainWire, separator };
  const identity = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const diagnosticKey = 'catalog-review:' + identity([
    source.family, source.fields, [...attrs].sort(),
    product.groupCores, product.conductorConfiguration, product.groundSection, product.neutralSection,
    product.hasGroundCore, [...new Set(issues)].sort(),
  ]);
  if (issues.length) return { source, known, requirements, issues: [...new Set(issues)], profile: null, diagnosticKey };

  // Family labels select visual rules only. They never supply technical facts.
  const family = product.markFamily === 'ВВГ' ? (fire ? 'vvg-catalog-frls' : 'vvg-catalog')
    : (product.markFamily || 'universal-schematic').toLowerCase().normalize('NFC');
  const layered = shield || armor || visibleFire || inner || separator;
  const technicalConstruction = {
    source: CATALOG_CABLE_VERSION, insulationMaterial, outerMaterial,
    screen: shield, screenType: shieldType, screenPlacement,
    armor, armorType, fireBarrier: visibleFire, fireBarrierMaterial: barrierMaterial,
    fireBarrierPlacement: barrierPlacement, innerSheath: inner === false ? false : innerMaterial,
    ...(inner === true && !innerMaterial && { innerSheathPresent: true }),
    interstitialFilling: filled ? { status: 'present', material: fillingMaterial, placement: fillingPlacement }
      : { status: filled === false ? 'absent' : 'unknown' },
    drainWire, separator: separatorDetails,
    ...(template?.integratedFilling && filled === true && inner === true && { integratedFilling: true }),
    ...(template?.fields['Форма кабеля'] === 'Плоский' && cableGeometry === 'flat' && { reviewedFlatLayout: true }),
    ...(omittedFire ? { fireBarrierStatus: fire ? 'present-not-exposed' : 'unknown' } :
      fire == null ? { fireBarrierStatus: 'unknown' } : {}),
    ...(separator == null && { separatorStatus: 'unknown' }),
    ...(directContact === true && { directJacketInsulationContact: true }),
  };
  // Neutral rendering palette is visual and does not claim manufacturer colors.
  const coreColors = Array.from({ length: cores }, () => 'neutral grey');
  if (layout.mixed) {
    const role = layout.sectionGroups[1].role;
    if (role) coreColors[cores - 1] = role === 'PE' ? 'yellow-green' : 'blue';
  }
  const qualitativeSections = layout.mixed && (conductorShape !== 'circular' ||
    layout.sectionGroups.some(group => group.conductorShape && group.conductorShape !== 'circular') ||
    assumptions['Форма токопроводящей жилы'] || assumptions['Конструкция токопроводящей жилы']);
  const profile = {
    family, productType: product.catalogCategorySlug === 'silovoy-kabel' || product.markFamily === 'ВВГ' ? 'power-cable' : 'cable',
    cores, conductorMaterial, conductorConstruction, conductorShape, geometry: cableGeometry,
    hasOuterJacket: outer, armor, armorType, shield, shieldType, coreColors,
    specialElements: [...(visibleFire ? ['fire-barrier'] : []), ...(drainWire ? ['drain-wire'] : [])],
    technicalConstruction,
    ...(schematic && { schematicAssumptions: assumptions }),
    ...(conductorFinish && { conductorFinish }),
    ...(layout.coaxial && { coaxial: true }),
    ...(layout.grouped && { pairedGroupSize: layout.groupSize }),
    ...(layout.mixed && { coreLayout: { sectionGroups: layout.sectionGroups, ...(qualitativeSections && { qualitative: true }) } }),
    visualizationType: layered ? (cores > 1 ? 'MULTICORE + LAYERED' : 'LAYERED') : cores > 2 ? 'MULTICORE' : 'SIMPLE',
  };
  const { coreColors: palette, visualizationType: renderingType, ...construction } = profile;
  const technicalProfileId = identity(construction);
  const { visualKey, visualProfileId } = makeVisualIdentity(profile);
  return { source, known, requirements, issues: [], profile, technicalProfileId, visualProfileId, visualKey };
}

const visualContext = { rules, familyVisualRules, knowledge, colorRules };

function resolveConfirmedCableProfile(product) {
  const statedCount = Number(product.specs?.['Количество жил']);
  if (product.cores == null && Number.isInteger(statedCount) && statedCount >= 1 && statedCount <= 100)
    product = { ...product, cores: statedCount };
  const layout = catalogCoreLayout(product);
  const catalog = readExplicitCableCatalogProfile(product, layout);
  if (catalog.issues.some(reason => !reason.startsWith('catalog-missing-or-ambiguous:'))) return catalog;

  const knownVisual = Object.fromEntries(Object.entries(catalog.known)
    .filter(([field,value]) => value != null && ['conductorMaterial','conductorConstruction',
      'conductorShape','geometry','hasOuterJacket','shield','armor','armorType'].includes(field)));
  const disagreement = Object.entries(knownVisual).find(([field,value]) =>
    product.visualCharacteristics?.[field] != null && product.visualCharacteristics[field] !== value);
  if (disagreement) return { ...catalog, profile: null, visualKey: undefined, issues: [conflict(disagreement[0])] };
  if (catalog.profile) return catalog;
  // Preserve the established normalized key where the existing profile already
  // fits. Pass known card facts to the same classifier only to resolve gaps.
  let classified = classifyPracticalCableVisualProduct(product, { ...visualContext, catalogCoreLayout: layout });
  const needsCardFacts = classified.issues.some(issue => issue.code.startsWith('unknown_')) ||
    Object.entries(knownVisual).some(([field,value]) => classified.visualProfile[field] !== value);
  if (classified.appliedFamilyVisualRule && needsCardFacts) {
    const supplemented = classifyPracticalCableVisualProduct({
      ...product, visualCharacteristics: { ...product.visualCharacteristics, ...knownVisual },
    }, { ...visualContext, catalogCoreLayout: layout });
    if (supplemented.visualClassification === 'AUTO_APPROVED' ||
        supplemented.issues.length < classified.issues.length) classified = supplemented;
  }
  // The flat modifier has already been proved by the card. Its duplicate
  // unresolved token is not a conflicting execution.
  const flat = classified.visualProfile;
  if (catalog.known.geometry === 'flat' && flat.geometry === 'flat' &&
      flat.unresolvedModifiers?.length === 1 && flat.unresolvedModifiers[0].toLowerCase() === 'плоский' &&
      classified.issues.length && classified.issues.every(issue => issue.code === 'unverified_modifier')) {
    classified = withCableVisualization({ ...classified, issues: [], visualClassification: 'AUTO_APPROVED',
      visualProfile: { ...flat, unresolvedModifiers: [] } }, visualContext);
  }
  const familyProfile = classified.visualProfile;
  const knownThermoplastic = classified.baseFamily === 'КГ' && product.cores >= 1 && familyProfile.hasOuterJacket === true &&
    familyProfile.shield === false && familyProfile.armor === false && !familyProfile.specialElements.length &&
    familyProfile.unresolvedModifiers?.length === 1 && familyProfile.unresolvedModifiers[0] === 'ТП' &&
    product.designationDecoded?.tokens?.some(token => token.code?.toLowerCase() === 'тп' &&
      token.text === 'Изоляция и оболочка из термоэластопласта') &&
    classified.issues.length && classified.issues.every(issue => issue.code === 'unverified_modifier');
  if (knownThermoplastic) {
    // The resolved modifier changes the polymer, not the arrangement or layer roles.
    classified = withCableVisualization({
      ...classified, issues: [], visualClassification: 'AUTO_APPROVED',
      visualProfile: { ...familyProfile, unresolvedModifiers: [], technicalConstruction: {
        source: 'catalog-designation', insulationMaterial: 'термоэластопласт',
        outerMaterial: 'термоэластопласт', screen: false, armor: false, fireBarrier: false,
      } },
    }, visualContext);
  }
  const section = Number(product.crossSection);
  const voltage = Number(product.voltage);
  const typicalVvg = getVvgProductIllustrationProfile(product, classified);
  const review = reviewedConstructions[classified.visualKey];
  const member = review?.members[product.sku];
  const exactReview = member && member.id === product.id && member.sourceName === product.sourceName &&
    member.section === section && classified.visualClassification === 'AUTO_APPROVED';
  const profile = (exactReview ? review.profile : null) ?? typicalVvg ??
    (classified.visualClassification === 'AUTO_APPROVED' && classified.visualProfile);
  if (!profile && classified.issues.length && classified.familyRecognized && classified.appliedFamilyVisualRule)
    return { ...catalog, issues: [...new Set(classified.issues.map(issue => issue.message))] };
  if (!profile?.visualizationType || profile.cores !== catalog.known.cores || (profile.coreLayout && !profile.coreLayout.sectionGroups) ||
      !['round', 'flat'].includes(profile.geometry) ||
      (classified.baseFamily === 'ВВГ' && !typicalVvg) ||
      (profile.productType === 'power-cable' && !profile.shield && (voltage >= 6 || (!profile.armor && voltage >= 3))) ||
      (profile.productType === 'power-cable' && profile.conductorConstruction === 'solid' && section > 50 &&
        catalog.known.conductorConstruction !== 'solid') ||
      (profile.productType === 'power-cable' && profile.conductorMaterial === 'aluminium' &&
        profile.conductorShape === 'circular' && profile.cores > 1 && section >= 25 &&
        catalog.known.conductorShape !== 'circular')) return catalog;
  let technical;
  try {
    technical = buildCableTechnicalProfile(profile);
  } catch {
    return catalog;
  }
  const present = status => status === 'unknown' ? null : status === 'present';
  const visible = { ...profile, filling: present(technical.interstitialFilling.status),
    innerSheath: present(technical.innerSheath.status), fireBarrier: technical.fireBarrier,
    drainWire: technical.additionalConductors.length > 0, separator: Boolean(technical.separator) };
  const conflicts = Object.entries(catalog.known)
    .filter(([field, known]) => known != null && visible[field] != null && known !== visible[field]);
  if (conflicts.length) return { ...catalog, issues: conflicts.map(([field, value]) =>
    `catalog-conflict: ${field} (${value} в карточке; ${visible[field]} в профиле)`) };
  const lostLayers = ['filling', 'innerSheath'].filter(field =>
    catalog.known[field] === true && visible[field] == null);
  if (lostLayers.length) return { ...catalog, issues: lostLayers.map(field =>
    'catalog-unsupported: известный слой не описан в семейном профиле: ' + field) };
  const attributes = product.attributes ?? [];
  const requiredByMarking = [
    [attributes.includes('З'), visible.filling === true, 'заполнение сердечника'],
    [attributes.includes('Э') || Number(product.screenCrossSection) > 0, profile.shield, 'экран'],
    [attributes.some(value => fireExecution(value)), technical.fireBarrier, 'огнестойкий барьер'],
  ].filter(([required, shown]) => required && !shown);
  if (requiredByMarking.length) return { ...catalog, issues: requiredByMarking.map(([, , field]) =>
    'catalog-conflict: маркировка требует слой, которого нет в профиле: ' + field) };

  // This is a rendering profile, not an enrichment of the source card.
  const { visualKey, visualProfileId } = makeVisualIdentity(profile);
  return { ...catalog, profile, visualKey, visualProfileId, issues: [],
    source: { ...catalog.source, renderingBasis: knownThermoplastic ? 'designationDecoded:тп + ' + classified.appliedFamilyVisualRule : exactReview ? 'reviewed-construction:' + classified.visualKey :
        classified.appliedFamilyVisualRule ?? classified.familyId,
      unspecifiedCardFields: catalog.issues } };
}

export function readCableCatalogProfile(product) {
  const confirmed = resolveConfirmedCableProfile(product);
  if (confirmed.profile) return confirmed;

  // Explicit contradictions, unresolved grouping and the documented FR contract
  // remain authoritative. A schematic only fills gaps in the rendering.
  const layout = catalogCoreLayout(product);
  if (layout.issue || confirmed.issues.some(reason =>
      reason.startsWith('catalog-conflict:') && reason !== 'catalog-conflict: неразрешённые параметры расшифровки'))
    return confirmed;

  const classified = classifyPracticalCableVisualProduct(product, { ...visualContext, catalogCoreLayout: layout });
  if (classified.issues.some(({ code }) => ['structured_conflict', 'construction_conflict', 'family_structure_conflict'].includes(code)))
    return confirmed;
  const variant = classified.visualProfile;
  const attrs = (product.attributes ?? []).map(value => value.toUpperCase());
  const known = confirmed.known;
  const networkScreen = layout.networkPairs &&
    /(?:^|[^A-Z])([UFS]|SF)\/([UF])TP(?:[^A-Z]|$)/iu.exec(product.sourceName ?? product.name ?? '');
  const networkPlacement = networkScreen?.[2].toUpperCase() === 'F'
    ? networkScreen[1].toUpperCase() === 'U' ? 'Вокруг каждой пары' : 'Общий и вокруг каждой пары'
    : 'Под наружной оболочкой';
  const networkShield = Boolean(networkScreen &&
    (networkScreen[1].toUpperCase() !== 'U' || networkScreen[2].toUpperCase() !== 'U'));
  if (networkScreen && known.shield != null && known.shield !== networkShield)
    return { ...confirmed, issues: [conflict('экран и обозначение витой пары')] };
  if (layout.coaxial && known.shield === false)
    return { ...confirmed, issues: [conflict('коаксиальная конструкция без внешнего проводника')] };
  const jacket = known.hasOuterJacket ?? (layout.singleWire ? false : variant.hasOuterJacket ?? true);
  const shield = known.shield ?? (layout.coaxial || (networkScreen ? networkShield : (variant.shield === true || attrs.includes('Э') || Number(product.screenCrossSection) > 0)));
  const armor = known.armor ?? (variant.armor === true);
  const armorType = known.armorType ?? variant.armorType;
  const shape = known.conductorShape ?? variant.conductorShape ?? 'circular';
  const construction = known.conductorConstruction ?? variant.conductorConstruction ?? 'solid';
  const material = known.conductorMaterial ?? variant.conductorMaterial ?? 'copper';
  const geometry = known.geometry ?? variant.geometry ?? 'round';
  if (!['round', 'flat'].includes(geometry))
    return { ...confirmed, issues: ['catalog-unsupported: схема оболочки ' + geometry] };
  const yesNo = value => value ? 'Да' : 'Нет';
  const fallback = {
    'Материал жилы': material === 'aluminium' ? 'Алюминий' : 'Медь',
    'Конструкция токопроводящей жилы': construction === 'stranded' ? 'Многопроволочная' : 'Однопроволочная',
    'Форма токопроводящей жилы': shape === 'sector' ? 'Секторная' : 'Круглая',
    'Форма кабеля': geometry === 'flat' ? 'Плоский' : 'Круглый',
    'Наружная оболочка': yesNo(jacket),
    'Экранированный': yesNo(shield),
    'Бронированный': yesNo(armor),
    'Тип брони': armorType === 'steel-wires' ? 'Стальные проволоки' :
      armorType === 'steel-tapes' ? 'Стальные ленты' : 'Условная броня',
    'Расположение экрана': networkPlacement,
    'Внутренняя оболочка': 'Нет',
    'Заполнение сердечника': attrs.includes('З') ? 'Предусмотрено' : 'Не предусмотрено',
    'Расположение заполнения': 'Между изолированными жилами',
  };
  const resolved = readExplicitCableCatalogProfile(product, layout, fallback);
  return resolved.profile ? { ...resolved, known: confirmed.known } : { ...confirmed, issues: resolved.issues };
}

export async function loadCableCatalogItem(root, sku) {
  if (!sku) throw Error('NEEDS_TECHNICAL_REVIEW: catalog SKU is required');
  const products = JSON.parse(await fs.readFile(path.join(root, 'data/catalog-current/products.json')));
  const matches = products.filter(product => product.sku === sku);
  if (matches.length !== 1) throw Error('NEEDS_TECHNICAL_REVIEW: catalog SKU missing or ambiguous: ' + sku);
  return { ...readCableCatalogProfile(matches[0]), product: matches[0] };
}

export async function requireCableCatalogProfile(root, sku) {
  const result = await loadCableCatalogItem(root, sku);
  if (result.issues.length) throw Error('NEEDS_TECHNICAL_REVIEW: ' + result.issues.join(' | '));
  return result;
}
