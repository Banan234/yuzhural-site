import { cableFamilyScope } from './cableVisualClassification.js';
import { cableRegistryReview } from './cableReviewPolicy.js';
import { cableReusableConstructionKey } from './cableReferenceCompatibility.js';
import { galleryPngLocations, galleryPngSha } from './cableGalleryFiles.js';
import { galleryRevision, validateGalleryHistory } from './cableGalleryJournal.js';
import { vvgCutHold } from './cableVvgCutQuality.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, cableStyleReviewRequirements, recordCableStyleReview } from './cableStyleBatch.js';
import { indexCableSkuCards, readCableSkuImageFacts } from './cableSkuImageFacts.js';
import { loadCableReviewDecisions, persistCableReviewDecision } from './cableReviewDecisions.js';
import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { createCatalogStore } from '../../lib/catalog.js';
import { getCatalogPhoto, matchesApprovedCableConstruction } from '../../shared/productImages.js';
import { approvedCableVerificationContext, findReusableCableResult, findHistoricalCatalogApproval } from './cableApprovedResults.js';
import { loadApprovedStyleReferences } from './cableApprovedStyleReference.js';
import { loadCableImageStyle, prepareCableStyleRequest } from './cableImageStyle.js';
import { findCableGenerationClaim, readCableGenerationClaims, findHistoricalCatalogClaim } from './cableGenerationClaims.js';
import { cableIllustrationHold } from './cableIllustrationDefects.js';
import { setCableGalleryReferencePermission } from './cableGalleryPermissions.js';
import { validateCableImagePng } from './cableImagePng.js';

const optional = async promise => promise.catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const read = file => optional(fs.readFile(file, 'utf8').then(JSON.parse));
export async function buildCableGallery(root, { queueEnabled = true, fileCache = new Map(), archive = true } = {}) {
  root = await fs.realpath(root);
  const at = file => path.join(root,file);
  const style = await loadCableImageStyle(root);
  const [registry, bindings, overrides, products, visible, decisions, references, legacy, claims] = await Promise.all([
    read(at('data/cable-approved-results/registry.json')), read(at('shared/generatedProductImages.json')),
    read(at('data/priceOverrides.json')), read(at('data/catalog-current/products.json')),
    createCatalogStore({ productsFile: at('data/catalog-current/products.json') }).loadCatalogProducts(),
    loadCableReviewDecisions(root), loadApprovedStyleReferences(root).catch(error => error),
    archive && read(at('outputs/cable-first-mass-archive-review/inventory.json')),
    (queueEnabled || !archive) && readCableGenerationClaims(root),
  ]);
  const relative = file => path.relative(root,file);
  const assets = new Map(Object.values(style.references).map(ref=>[ref.sha256,ref.path]));
  const listed = indexCableSkuCards(visible);
  const cableProducts = products.filter(p=>p.catalogSectionSlug === 'kabel-i-provod' || listed.has(p.sku) && registry &&
    bindings.bySku?.[p.sku]?.kind === 'generated-illustration');
  const catalog = new Map(cableProducts.map(product=>[product.sku,{ product, ...readCableCatalogProfile(product) }]));
  const registryEntries = [...Object.values(registry.byVisualKey), ...Object.values(registry.alternativesBySha256 ?? {})];
  const files = new Map();
  const issues = [];
  if (references instanceof Error) issues.push({ reason: references.message });
  const catalogImages = new Map();
  for (const { product } of catalog.values()) {
    const card = listed.get(product.sku);
    for (const value of [product.image, card?.image, overrides?.overrides?.[product.sku]?.image]) {
      const image = getCatalogPhoto(value);
      if (typeof image !== 'string' || !/^\/(?!\/)[^?#]+\.png$/iu.test(image) || image.split('/').includes('..')) continue;
      const file = 'public' + image;
      const manual = Object.values(overrides?.overrides ?? {}).some(row => row.image === image) ||
        (overrides?.matchers ?? []).some(row => row.image === image);
      const source = catalogImages.get(file) ?? {file, origin: manual ? 'manual' : 'catalog-photo', skus: new Set()};
      if (card) source.skus.add(product.sku);
      catalogImages.set(file, source);
    }
  }
  const historicalFiles = new Set();
  const activeFiles = archive ? [] : [
    ...Object.values(bindings.bySku ?? {}).map(({ image }) => image)
      .filter(image => /^\/product-images\/generated\/[a-z0-9_.-]+\.png$/iu.test(image))
      .map(image => 'public' + image),
    ...[...claims.values()].filter(claim => ['PENDING_REVIEW', 'HELD_DEFECT'].includes(claim.status) &&
      (claim.authoritative || !relative(claim.draftDir).startsWith('outputs/catalog-')))
      .map(claim => relative(path.join(claim.draftDir, 'image.png'))),
  ];
  for await (const {file: location, origin, error} of galleryPngLocations(root, catalogImages.values(), historicalFiles, { archive, activeFiles })) {
    if (error) { issues.push({file: location, reason: error}); continue; }
    let sha256;
    try { sha256 = await galleryPngSha(root, location, fileCache); }
    catch (error) { issues.push({file: location, reason: error.message}); continue; }
    let item = files.get(sha256);
    if (!item) {
      item = {sha256, locations:[], origins:new Set(), groups:[], archived:[], bindings:[], photoBindings:[],
        candidates:[], members:new Set(), history:[], metadata:[]};
      files.set(sha256,item);
    }
    if (item.locations.includes(location)) continue;
    const file = at(location);
    item.locations.push(location);
    item.origins.add(origin);
    if (catalogImages.has(location)) {
      item.photoBindings.push(...catalogImages.get(location).skus);
      for (const sku of catalogImages.get(location).skus) item.members.add(sku);
    }
    if (location.includes('!/')) continue;
    if (path.basename(file) === 'image.png') {
      const dir = path.dirname(file);
      const [group, request, approval, report] = await Promise.all(
        ['group.json', 'request.json', 'approval.json', 'review.json'].map(name => read(path.join(dir, name))));
      if (request || group?.profile) item.origins.add('generated');
      if (approval?.sha256 === sha256) item.history.push(approval);
      if (report?.validation?.sha256 === sha256)
        item.metadata.push({ date: report.createdAt ?? request?.createdAt, references: request?.referenceInputs ?? request?.reference,
          visualKey: group?.visualKey });
      if (group?.profile && group.visualKey) {
        const recorded = group.validation?.sha256 ?? group.manualReview?.sha256;
        if (recorded && recorded !== sha256) issues.push({file:relative(file),reason:'draft SHA mismatch'});
        else {
          item.groups.push({dir,group,request,modified:(await fs.stat(path.join(dir,'group.json'))).mtimeMs});
          for (const row of group.members ?? []) item.members.add(row.sku);
        }
      }
    }
  }
  for (const location of historicalFiles) {
    try {
      const data = await read(at(location));
      for (const row of Array.isArray(data) ? data : [data]) {
        const image = files.get(row?.sha256);
        if (!image || !(row.status || row.disposition)) continue;
        if (row.sku) image.members.add(row.sku);
        image.legacyName ??= row.name;
        const event = { ...row, source: row.source ?? location, note: row.note ?? row.reason };
        if (!image.history.some(existing => digest(existing) === digest(row))) image.history.push(event);
      }
    } catch (error) { issues.push({file: location, reason: error.message}); }
  }
  const metadataDir = at('data/product-image-metadata');
  for (const name of (archive ? await optional(fs.readdir(metadataDir)) ?? [] : []).filter(name => /^YU-.*\.json$/u.test(name))) {
    const metadata = await read(path.join(metadataDir, name));
    const image = files.get(metadata?.validation?.sha256);
    if (!image) continue;
    if (metadata.sku) image.members.add(metadata.sku);
    image.origins.add('generated');
    image.legacyName ??= metadata.product_name;
    image.metadata.push({ date: metadata.created_at ?? metadata.createdAt, visualKey: metadata.visualKey,
      family: metadata.family, references: { path: metadata.style_reference, sha256: metadata.style_reference_hash } });
    if (metadata.visual_review || metadata.status)
      image.history.push({ source: 'data/product-image-metadata/' + name, status: metadata.status,
        note: metadata.visual_review?.notes ?? metadata.reason, reviewedAt: metadata.updated_at,
        reviewer: metadata.visual_review?.reviewer });
  }
  for (const row of legacy?.rows ?? []) {
    const image = files.get(row.sha256);
    if (!image?.locations.includes(row.path)) continue;
    if (row.sku) image.members.add(row.sku);
    image.legacyName ??= row.name;
    image.origins.add('generated');
    image.metadata.push({ visualKey: row.archiveKey });
    if (row.historyStatus) image.history.push({status: row.historyStatus, source: 'Архив первой партии'});
  }
  for (const entry of registryEntries) {
    const image = files.get(entry.sha256);
    if (image) for (const sku of entry.skus ?? []) image.members.add(sku);
    const source = image?.groups.find(candidate=>relative(candidate.dir)===entry.draftDir && candidate.group.visualKey===entry.visualKey);
    const approval = source && await read(path.join(source.dir,'approval.json'));
    if (!source || approval?.sha256!==entry.sha256 || approval.visualKey!==entry.visualKey ||
        approval.status!=='APPROVED' || digest(source.group.profile)!==entry.profileHash) {
      issues.push({file:entry.draftDir,reason:'approval integrity mismatch'});
      continue;
    }
    const transaction = await read(path.join(source.dir,'binding-transaction.json'));
    const canRestore = transaction?.galleryPlacement === true && ['APPLIED','PREPARED'].includes(transaction.status) &&
      transaction.patch.pngSha256 === entry.sha256 && transaction.patch.changes.length > 0 &&
      transaction.patch.changes.every(({ sku, before, after }) => before === null && digest(bindings.bySku?.[sku] ?? null) === digest(after));
    image.archived.push({...entry,approval,canRestore});
    image.history.push(approval, ...(approval.referencePermissionHistory ?? []));
  }
  for (const record of decisions) {
    const image = files.get(record.decision.sha256);
    const decisionImage = path.join(record.decisionDir, 'image.png');
    if (!image?.locations.includes(relative(decisionImage))) {
      if (!image && record.decision.status === 'REJECTED' && record.imageRemovedAt &&
          !await optional(fs.stat(decisionImage))) continue;
      issues.push({file:relative(record.decisionDir),reason:'review PNG SHA mismatch'});
      continue;
    }
    image.decision = record;
    image.history.push(...record.previous, record.decision);
  }
  let photoCount = 0;
  const familyRows = new Map(), eligible = new Map();
  const familyFor = ({ product, profile }) => cableFamilyScope(profile?.family ?? product.markFamily) || 'unknown';
  const uncoveredByKey = new Map();
  const unresolved = [];
  for (const value of catalog.values()) {
    const { product, visualKey } = value;
    const card = listed.get(product.sku);
    if (!card) continue;
    const family = familyFor(value);
    if (!familyRows.has(family)) familyRows.set(family, { id:family, name: family === 'unknown' ? 'Без семейства' :
      String(product.markFamily ?? family).replace(/нг(?:\(А\))?(?:[-–][A-ZА-Я]+)*/iu, ''),
      total:0, covered:0, approved:0, pending:0, potential:new Set() });
    const progress = familyRows.get(family);
    progress.total++;
    const facts = readCableSkuImageFacts(product, card, bindings, registry, overrides ?? {});
    if (facts.hasPhoto) {photoCount++;progress.covered++;continue;}
    const published = facts.generatedImage;
    const binding = facts.binding;
    if (published) {
      progress.covered++;
      const item = files.get(binding.sha256);
      if (item?.locations.includes('public'+published)) item.bindings.push(product.sku);
      else issues.push({file:'public'+published,reason:'published binding SHA mismatch'});
      continue;
    }
    if (facts.protected) continue;
    if (!binding && visualKey) {
      const stamp = digest(value.profile);
      const signature = cableReusableConstructionKey(value.profile);
      for (const key of [family + ':' + visualKey + ':' + stamp, ...(signature ? [signature] : [])]) {
        if (!eligible.has(key)) eligible.set(key, new Set());
        eligible.get(key).add(product.sku);
      }
    }
    if (!visualKey) unresolved.push({sku:product.sku,name:product.name,family:product.markFamily,diagnosticKey:value.diagnosticKey,reasons:value.issues});
    else {
      if (!uncoveredByKey.has(visualKey)) uncoveredByKey.set(visualKey,[]);
      uncoveredByKey.get(visualKey).push(value);
    }
  }
  const queue = [], held = [], reusable = new Set();
  for (const [visualKey, members] of queueEnabled ? uncoveredByKey : []) {
    const { profile, product } = members[0];
    const skus = members.map(row=>row.product.sku);
    try {
      const current = await findReusableCableResult({root,visualKey,profile,
        request:approvedCableVerificationContext(style,profile)});
      if (current?.APPROVED_FOR_CATALOG && current.technicalSourceVersion==='catalog-construction-1' &&
          !cableIllustrationHold(current.sha256)) {
        skus.forEach(sku=>reusable.add(sku));
        continue;
      }
      let historic;
      for (const sku of skus) {
        historic = await findHistoricalCatalogClaim(sku,profile,claims) ?? await findHistoricalCatalogApproval(root,sku,profile);
        if (historic) break;
      }
      const blocker = current ? 'APPROVED_ARCHIVE' : historic ? 'HISTORICAL_PROFILE_REVIEW_REQUIRED' :
        findCableGenerationClaim(claims, profile)?.status;
      if (blocker) held.push({ visualKey,skus,reason:blocker });
      else {
        const request = await prepareCableStyleRequest(root, profile);
        queue.push({visualKey,skus,family:product.markFamily,name:product.name,
          status:'READY',
          technical:request.technicalProfile,composition:request.visualCompositionContract,references:request.referenceInputs});
      }
    } catch(error) {held.push({visualKey,skus,reason:error.message});}
  }
  const referenceShas = new Map((Array.isArray(references) ? references : []).map(ref => [ref.sha256, ref.permission]));
  const catalogScopes = new Map();
  const catalogFamilies = new Map();
  for (const [sku, value] of catalog) {
    const family = value.product.markFamily;
    if (!catalogFamilies.has(family)) catalogFamilies.set(family, []);
    catalogFamilies.get(family).push([sku, value]);
    if (!value.visualKey || !value.profile) continue;
    const key = value.visualKey + ':' + digest(value.profile);
    if (!catalogScopes.has(key)) catalogScopes.set(key, []);
    catalogScopes.get(key).push(sku);
  }
  for (const item of files.values()) {
    const selected = item.groups.find(row=>row.dir===item.decision?.decisionDir) ??
      item.groups.find(row=>row.dir.startsWith(at('outputs')+path.sep)) ?? item.groups[0];
    item.selected = selected;
    const group = selected?.group;
    const archived = item.archived[0];
    const hold = cableIllustrationHold(item.sha256) ?? vvgCutHold(item.sha256);
    const decision = item.decision?.decision;
    item.approved = Boolean(archived);
    item.protected = assets.has(item.sha256);
    item.hold = hold?.defectId ?? (hold ? 'VVG_CUT_REVIEW' : null);
    item.durableStatus = decision?.status === 'REJECTED' ? 'REJECTED' : decision?.disposition === 'NEEDS_CORRECTION' ? 'NEEDS_CORRECTION' : null;
    item.journal = registry.reviewBySha256?.[item.sha256] ?? [];
    let review;
    try {
      if (item.journal.length) validateGalleryHistory(item.sha256, item.journal);
      review = item.journal.at(-1)?.after;
    } catch (error) { issues.push({file:item.sha256, reason:error.message}); }
    const observed = item.history.filter(row => !row.manualGallery);
    const historicalNegatives = observed.filter(row => /^REJECTED$|^NEEDS_(?:CORRECTION|REVISION)$/iu.test(row.disposition ?? row.status ?? ''));
    const negative = historicalNegatives.find(row => /^REJECTED$/iu.test(row.disposition ?? row.status)) ??
      historicalNegatives[0];
    item.legacyCatalog = item.durableStatus ?? (item.hold ? 'NEEDS_CORRECTION' :
      item.archived.some(entry => entry.APPROVED_FOR_CATALOG && !entry.approval.manualGallery) ? 'APPROVED' :
      negative ? (/^REJECTED$/iu.test(negative.disposition ?? negative.status) ? 'REJECTED' : 'NEEDS_CORRECTION') : 'UNDECIDED');
    item.legacyRevision = digest({ durable: decision ?? null,
      approvals: item.archived.filter(entry => !entry.approval.manualGallery).map(entry => entry.approval),
      historicalNegative: [...new Set(historicalNegatives.map(row => row.sha256 + ':' + (row.disposition ?? row.status) + ':' + (row.note ?? '')))].sort() });
    const catalogStatus = review?.catalog ?? item.legacyCatalog;
    item.referenceAllowed = referenceShas.has(item.sha256) || item.protected;
    item.referenceConfigured = item.archived.some(entry=>entry.APPROVED_AS_REFERENCE === true);
    item.legacyReference = item.protected ? 'PROTECTED' : item.referenceConfigured ? 'ADDITIONAL' :
      (item.history.some(event => event.enabled === false) ? 'DENIED' : 'UNDECIDED');
    const referenceStatus = review?.reference ?? item.legacyReference;
    item.status = item.protected ? 'PROTECTED' : review?.visualApproval ? 'APPROVED' : catalogStatus === 'UNDECIDED' ?
      (group || decision ? 'PENDING' : 'ARCHIVED') : catalogStatus;
    const resolved = item.journal.some(event => event.resolved && event.legacyRevision === item.legacyRevision);
    item.conflict = !resolved && ((item.legacyCatalog === 'APPROVED' && review?.catalog && ['NEEDS_CORRECTION','REJECTED','UNDECIDED'].includes(review.catalog))
      || (Boolean(item.durableStatus) && item.approved && review?.supersedes !== digest(decision))
      || (item.approved && historicalNegatives.length > 0 && review?.supersedes !== digest(decision ?? null))
      || (referenceStatus !== 'PROTECTED' && ['PRIMARY', 'ADDITIONAL'].includes(referenceStatus) && !item.referenceAllowed)
      || (item.referenceConfigured && !item.referenceAllowed && !review?.reference)
      || (item.journal.length > 0 && item.journal.at(-1).legacyRevision !== item.legacyRevision));
    item.scopes = [...new Map(item.groups.map(({group}) => {
      const profileHash = digest(group.profile);
      const key = group.visualKey + ':' + profileHash;
      const archive = item.archived.find(entry => entry.visualKey === group.visualKey && entry.profileHash === profileHash);
      const memberFamilies = new Set((group.members ?? []).map(({sku}) => catalog.get(sku)?.product.markFamily).filter(Boolean));
      const current = new Set(catalogScopes.get(key) ?? []);
      if (group.profile.technicalConstruction?.source !== 'catalog-construction-1') {
        const legacyEntry = archive ?? { visualKey: group.visualKey, profileHash };
        for (const family of memberFamilies) for (const [sku, { product }] of catalogFamilies.get(family) ?? []) {
          const binding = bindings.bySku?.[sku];
          const typical = binding?.sha256 === item.sha256 ? binding.typicalIllustration : null;
          if (matchesApprovedCableConstruction(product, legacyEntry, typical)) current.add(sku);
        }
      }
      return [key, { visualKey: group.visualKey, profileHash, profile: group.profile, skus: [...current] }];
    })).values()].filter(scope => scope.skus.length ||
      eligible.has(cableReusableConstructionKey(scope.profile)));
    item.family = group?.profile.family ?? [...item.members].map(sku=>catalog.get(sku)?.product.markFamily).find(Boolean) ??
      item.metadata.find(row => row.family)?.family ?? review?.visualApproval?.family ?? 'Без подтверждённого профиля';
    item.visualKey = group?.visualKey ?? archived?.visualKey ?? item.metadata.find(row => row.visualKey)?.visualKey ?? review?.visualApproval?.visualKey ?? null;
    item.name = [...item.members].map(sku=>catalog.get(sku)?.product.name).find(Boolean) ?? item.legacyName ?? review?.visualApproval?.name ?? path.basename(item.locations[0]);
    item.candidates = [...new Set(item.scopes.flatMap(scope => scope.skus))].filter(sku => !item.bindings.includes(sku));
    item.history = [...new Map(item.history.map(event => [digest(event), event])).values()];
    const familyId = cableFamilyScope(item.family);
    const profile = group?.profile;
    item.placement = item.scopes.flatMap(scope => {
      if (scope.profile.schematicAssumptions || (cableFamilyScope(scope.profile.family) !== familyId &&
          !item.archived.some(entry => entry.visualKey === scope.visualKey && entry.APPROVED_FOR_CATALOG))) return [];
      const signature = cableReusableConstructionKey(scope.profile);
      const exact = eligible.get(familyId + ':' + scope.visualKey + ':' + scope.profileHash) ?? [];
      const members = [...new Set([...exact, ...(signature ? eligible.get(signature) ?? [] : [])])].sort();
      return [{ visualKey:scope.visualKey, profileHash:scope.profileHash, skus:members }];
    });
    const primaryPlacement = item.placement.find(row => row.visualKey === item.visualKey);
    const progress = familyRows.get(familyId);
    if (progress && !item.protected) {
      if (['APPROVED','WITH_NOTES'].includes(item.status)) progress.approved++;
      if (item.status === 'PENDING') progress.pending++;
      if (['APPROVED','WITH_NOTES','PENDING'].includes(item.status) && !item.hold && !review?.visualApproval)
        for (const sku of primaryPlacement?.skus ?? []) progress.potential.add(sku);
    }
    const origins = [...item.origins].filter(origin => origin !== 'unknown' || item.origins.size === 1);
    const activeBindings = new Set([...item.bindings, ...item.photoBindings]);
    item.summary = {sha256:item.sha256, family:item.family, visualKey:item.visualKey,name:item.name,status:item.status,
      catalogStatus, referenceStatus, visualApproval:review?.visualApproval ?? null, origins, conflict:Boolean(item.conflict), unknown: !item.scopes.length,
      approved:item.approved, referenceAllowed:item.referenceAllowed, referenceConfigured:item.referenceConfigured,
      protected:item.protected, count:item.candidates.length, familyId, coverage:primaryPlacement?.skus.length ?? 0,
      modified:item.selected?.modified ?? 0, cores:profile?.cores ?? null, shield:profile?.shield ?? false, armor:profile?.armor ?? false,
      geometry:profile?.geometry ?? null, canRestore:item.archived.some(entry=>entry.canRestore), bindings:activeBindings.size,
      copies:item.locations.length, reviewRevision:galleryRevision(item), journalHead:item.journal.at(-1)?.hash ?? null,
      families:[...new Set([item.family, ...item.scopes.map(scope => scope.profile.family),
        ...[...item.members].map(sku => catalog.get(sku)?.product.markFamily)].filter(Boolean))],
      visualKeys:[...new Set([item.visualKey, ...item.scopes.map(scope => scope.visualKey), ...item.metadata.map(row => row.visualKey)].filter(Boolean))],
      skus:[...new Set([...item.members,...activeBindings,...item.candidates])]};
  }
  for (const sha of Object.keys(registry.reviewBySha256 ?? {}))
    if (!files.has(sha)) issues.push({file:sha, reason:'Для записи журнала отсутствует PNG.'});
  const items = [...files.values()].map(item=>item.summary).sort((a,b)=>a.family.localeCompare(b.family)||String(a.visualKey).localeCompare(String(b.visualKey))||a.name.localeCompare(b.name));
  const families = [...familyRows.values()].map(({ potential, ...row }) => ({
    ...row, missing:row.total-row.covered, expected:row.covered+potential.size,
  })).sort((a,b) => b.missing-a.missing || a.name.localeCompare(b.name,'ru'));
  const workGroups = new Map();
  for (const rows of uncoveredByKey.values()) for (const { product, profile, visualKey } of rows) {
    if (profile.schematicAssumptions || bindings.bySku?.[product.sku]) continue;
    const key = cableReusableConstructionKey(profile) ?? visualKey;
    if (!workGroups.has(key)) workGroups.set(key, { sku: product.sku, name: product.name, count: 0, skus: [] });
    const group = workGroups.get(key);
    group.count++;
    group.skus.push(product.sku);
  }
  const total = families.reduce((sum, family) => sum + family.total, 0);
  const attached = new Set([...files.values()].flatMap(item=>item.bindings)).size;
  const work = {
    total, approved: attached, photo: photoCount,
    missing: total - attached - photoCount,
    pending: items.filter(item => item.status === 'PENDING').length,
    groups: [...workGroups.values()].sort((a,b) => b.count-a.count || a.name.localeCompare(b.name, 'ru')),
  };
  return {root, files, items, families, catalog, visibleProducts:visible, listed, bindings, overrides, queue, held, unresolved, issues, style, registry, work, references,
    referenceCatalogHash:digest(products), catalogRevision:digest({products,bindings,overrides}),
    stats:{uniquePng:items.length,approved:items.filter(i=>['APPROVED','WITH_NOTES'].includes(i.catalogStatus)).length,
      primary:items.filter(i=>i.referenceAllowed && i.referenceStatus==='PRIMARY').length,
      additional:items.filter(i=>i.referenceAllowed && i.referenceStatus==='ADDITIONAL').length,
      catalogOnly:items.filter(i=>['APPROVED','WITH_NOTES'].includes(i.catalogStatus) && !i.referenceAllowed).length,
      pending:items.filter(i=>i.catalogStatus==='UNDECIDED' && !i.protected).length,
      archived:items.filter(i=>i.status==='ARCHIVED' && !i.bindings).length,
      duplicates:items.filter(i=>i.copies>1).length, conflicts:items.filter(i=>i.conflict).length, unknown:items.filter(i=>i.unknown).length,
      locations:items.reduce((sum,i)=>sum+i.copies,0),
      correction:items.filter(i=>i.status==='NEEDS_CORRECTION').length,
      rejected:items.filter(i=>i.status==='REJECTED').length,coveredSku:new Set([...files.values()].flatMap(i=>i.bindings)).size,photoSku:photoCount,
      reuseSku:reusable.size,missingProfiles:queue.length,readyProfiles:queue.filter(row=>row.status==='READY').length,
      unresolvedSku:unresolved.length,unresolvedGroups:new Set(unresolved.map(row=>row.diagnosticKey)).size,heldProfiles:held.length,
      integrityIssues:issues.length}};
}

export function describeCableGalleryItem(library, item) {
  const group = item.selected?.group;
  const correction = cableRegistryReview(library.registry, item.sha256)?.correction;
  const retrySku = correction && item.scopes
    .find(scope => scope.visualKey === correction.visualKey && scope.profileHash === correction.profileHash)?.skus
    .find(sku => library.listed.has(sku) && !library.bindings.bySku?.[sku] &&
      library.catalog.get(sku)?.visualKey === correction.visualKey);
  const validations = item.groups.filter(({ dir }) => !dir.startsWith(path.join(library.root,'data/cable-approved-results')+path.sep))
    .flatMap(({ group, request }) => {
      if (group.standardVersion !== library.style.version ||
          !item.scopes.some(scope => scope.visualKey === group.visualKey && scope.profileHash === digest(group.profile))) return [];
      try {
        const { required, technical, composition } = cableStyleReviewRequirements(group, request);
        return [{ visualKey: group.visualKey, required, technical, needsObservations: Boolean(composition) }];
      } catch { return []; }
    });
  let requirements = null, reviewBlocker = null;
  if (!group || group.standardVersion !== library.style.version)
    reviewBlocker = 'Для утверждения нужен сохранённый технический профиль текущего стандарта.';
  else try {
    const { required, technical, composition } = cableStyleReviewRequirements(group,item.selected.request);
    requirements = {required, technical, needsObservations:Boolean(composition)};
  } catch(error) { reviewBlocker = error.message; }
  return {...item.summary, placement:item.placement, paths:item.locations, history:item.history, hold:item.hold, retrySku,
    needsRecertification:Boolean(item.durableStatus && !item.journal.at(-1)?.after.supersedes),
    journal:item.journal, legacyCatalog:item.legacyCatalog, validations,
    createdAt:item.metadata.map(row => row.date).filter(Boolean).sort()[0] ?? null,
    referenceSources:[...new Map([...item.metadata.map(row => row.references),
      ...item.groups.map(row => row.request?.referenceInputs ?? row.request?.reference)].filter(Boolean).map(ref => [digest(ref),ref])).values()],
    scopes:item.scopes.map(({ profile, ...scope }) => ({ ...scope, family: profile.family, visualizationType: profile.visualizationType })),
    catalogArchived:item.archived.some(entry=>entry.APPROVED_FOR_CATALOG),
    referenceArchived:item.archived.map(entry=>entry.visualKey),
    revision:digest({decision:item.decision?.decision??null, history:item.history}),
    profile:group?.profile??null, requirements, reviewBlocker,
    canApprove:!reviewBlocker && !item.protected && !item.approved && !item.hold,
    canChangeReference:item.approved && !item.protected && item.archived.length===1,
    currentBindings:[...new Set([...item.bindings,...item.photoBindings])], compatibleCandidates:item.candidates,
    catalog:item.summary.skus.map(sku=>{
      const value=library.catalog.get(sku);
      return {sku,name:value?.product.name,fields:value?.source.fields,issues:value?.issues};
    })};
}

export async function saveCableGalleryAction(library, item, body) {
  const detail = describeCableGalleryItem(library,item);
  if (body.revision!==detail.revision) throw Error('Решение изменилось. Откройте карточку заново.');
  if (typeof body.reviewer!=='string' || !body.reviewer.trim()) throw Error('Укажите имя проверяющего.');
  const reviewer=body.reviewer.trim().slice(0,120);
  if (body.action==='ALLOW_REFERENCE' || body.action==='DENY_REFERENCE') {
    if (!detail.canChangeReference) throw Error('Нужна однозначная запись ручного утверждения.');
    await setCableGalleryReferencePermission({root:library.root,sha:item.sha256,
      visualKey:item.archived[0].visualKey,enabled:body.action==='ALLOW_REFERENCE',reviewer});
    return;
  }
  if (item.protected || item.approved) throw Error('Для снятия утверждения действует отдельная процедура.');
  const status = {APPROVE:'APPROVED',REJECT:'REJECTED',NEEDS_CORRECTION:'NEEDS_REVIEW'}[body.action];
  if (!status) throw Error('Неизвестное действие.');
  const note = typeof body.note==='string' ? body.note.trim().slice(0,2000) : '';
  if (status==='APPROVED' && (!detail.canApprove || (item.status==='REJECTED' && body.reopen!==true)))
    throw Error('Текущий PNG требует явного повторного открытия или подтверждения профиля.');
  if (status!=='APPROVED' && !note) throw Error('Укажите замечание.');
  const decision={sha256:item.sha256,reviewer,status,disposition:body.action,note,checks:body.checks,
    observations:body.observations,preserveExistingApproval:true,APPROVED_AS_REFERENCE:false};
  if (item.selected) {
    const { dir, group }=item.selected;
    const png=await fs.readFile(path.join(dir,'image.png'));
    if (digest(png)!==item.sha256) throw Error('PNG изменился. Пересканируйте галерею.');
    const canonical=group.profile.technicalConstruction?.source==='catalog-construction-1';
    await recordCableStyleReview({root:library.root,draftDir:dir,decision:{...decision,
      archiveOnly:status==='APPROVED' && (!canonical || body.catalog!==true),
      APPROVED_FOR_CATALOG:canonical && body.catalog===true}});
  } else {
    const file=path.join(library.root,item.locations[0]);
    const image=await fs.readFile(file);
    validateCableImagePng(image,{});
    await persistCableReviewDecision({root:library.root,draftDir:path.dirname(file),image,
      group:{visualKey:null,profile:null},decision:{...decision,visualKey:null}});
  }
}
