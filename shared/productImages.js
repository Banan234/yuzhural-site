import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { CABLE_STYLE_REVIEW_CHECKS } from '../scripts/lib/cableCoreGeometry.js';
import { classifyPracticalCableVisualProduct } from '../scripts/lib/familyVisualRules.js';
import imageStyle from '../cable-image-style.json' with { type: 'json' };
import responsiveImages from './responsiveImageManifest.json' with { type: 'json' };
import rules from '../data/cableVisualClassificationRules.json' with { type: 'json' };
import familyVisualRules from '../data/familyVisualRules.json' with { type: 'json' };
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import colorRules from '../data/cableImageColors.json' with { type: 'json' };
import { matchesProductImageBinding } from './productImageIdentity.js';
import { isGeneratedCableImage } from './generatedCableImagePath.js';
import {
  isGenericProductImage,
  getProductImageFallback,
} from './productImageFallbacks.js';

export { PRODUCT_IMAGE_FALLBACKS } from './productImageFallbacks.js';

const context = { rules, familyVisualRules, knowledge, colorRules };
const clean = (value) => String(value || '').trim();
const mappingFile = new URL('./generatedProductImages.json', import.meta.url);
const registryFile = new URL(
  '../data/cable-approved-results/registry.json',
  import.meta.url
);
let snapshot;
const stagedPolicy = new AsyncLocalStorage();
const classifications = new WeakMap();
const sourcePhotos = new Map(
  Object.entries(responsiveImages.images)
    .filter(([image]) => !isGeneratedCableImage(image))
    .flatMap(([image, data]) => data.variants.map(variant => [variant.src, image]))
);

function readImageFile(file) {
  try {
    const { ino, size, mtimeMs, ctimeMs } = statSync(file);
    const revision = [ino, size, mtimeMs, ctimeMs].join(':');
    return { revision, file };
  } catch {
    return { revision: 'missing', file };
  }
}

export function withCatalogImagePolicy(policy, callback) {
  return stagedPolicy.run(policy ?? readImageSnapshot(), callback);
}

function readImageSnapshot() {
  const staged = stagedPolicy.getStore();
  if (staged) return staged;
  const mapping = readImageFile(mappingFile);
  const registry = readImageFile(registryFile);
  const revision = mapping.revision + '/' + registry.revision;
  if (snapshot?.revision === revision) return snapshot;
  try {
    snapshot = {
      revision,
      manifest: JSON.parse(readFileSync(mapping.file, 'utf8')),
      registry: JSON.parse(readFileSync(registry.file, 'utf8')),
    };
  } catch {
    // A missing or unreadable policy must not fall back to an older approval.
    snapshot = { revision, manifest: {}, registry: {} };
  }
  return snapshot;
}

export function getCatalogImageRevision() {
  return readImageSnapshot().revision;
}

export function getCatalogPhoto(value) {
  const image = clean(value);
  if (isGenericProductImage(image)) return '';
  if (isGeneratedCableImage(image)) return sourcePhotos.get(image) || '';
  return image;
}

export function approvedCableImagePath(approval) {
  return /^[a-f0-9]{64}$/u.test(approval?.draftKey || '')
    ? '/product-images/generated/style1_' + approval.draftKey + '.png'
    : '';
}

export function matchesApprovedCableConstruction(product, approval) {
  let result = classifications.get(product);
  if (!result) {
    result = classifyPracticalCableVisualProduct(product, context);
    classifications.set(product, result);
  }
  const profile = result.visualProfile;
  if (
    result.visualClassification !== 'AUTO_APPROVED' ||
    result.visualKey !== approval.visualKey ||
    createHash('sha256').update(JSON.stringify(profile)).digest('hex') !==
      approval.profileHash
  )
    return false;

  if (profile.productType !== 'power-cable') return true;
  const section = Number(product.crossSection);
  const voltage = Number(product.voltage);
  if (!profile.shield && (voltage >= 6 || (!profile.armor && voltage >= 3)))
    return false;
  if (
    profile.conductorConstruction === 'solid' &&
    profile.conductorMaterial === 'copper' &&
    section > 50
  )
    return false;
  if (
    profile.conductorMaterial === 'aluminium' &&
    profile.conductorShape === 'circular' &&
    profile.cores > 1 &&
    section >= 25
  )
    return false;
  // The reviewed simple three-core aluminium images have no separate inner sheath.
  return !(
    profile.conductorMaterial === 'aluminium' &&
    profile.cores === 3 &&
    ['avvg', 'avvgng-a-ls'].includes(profile.family) &&
    section > 10
  );
}

export function getGeneratedProductImage(product, manifest, registry) {
  const current = readImageSnapshot();
  const entry = (manifest ?? current.manifest).bySku?.[clean(product?.sku)];
  const approval = (registry ?? current.registry).byVisualKey?.[
    entry?.visualKey
  ];
  if (
    entry?.status !== 'approved' ||
    entry.kind !== 'generated-illustration' ||
    entry.APPROVED_FOR_CATALOG === false ||
    approval?.status !== 'APPROVED' ||
    approval.APPROVED_FOR_CATALOG !== true ||
    approval.standardVersion !== imageStyle.version ||
    approval.standardVersion !== entry.styleVersion ||
    approval.sha256 !== entry.sha256 ||
    !/^[a-f0-9]{64}$/u.test(approval.sha256 || '') ||
    approval.referenceSha256 !== entry.referenceSha256 ||
    !entry.image ||
    entry.image !== approvedCableImagePath(approval) ||
    entry.manualReview?.status !== 'APPROVED' ||
    entry.manualReview.sha256 !== approval.sha256 ||
    !CABLE_STYLE_REVIEW_CHECKS.every(
      (check) => entry.manualReview.checks?.[check] === true
    ) ||
    !matchesProductImageBinding(product, entry) ||
    !matchesApprovedCableConstruction(product, approval)
  )
    return '';
  return entry.image;
}

export function getProductImage(product, manifest, registry) {
  return (
    getCatalogPhoto(product?.image) ||
    getGeneratedProductImage(product, manifest, registry) ||
    getProductImageFallback(product)
  );
}

export function getProductImageAlt(product, image = getProductImage(product)) {
  const title = clean(
    product?.title || product?.fullName || product?.name || product?.mark
  );
  const category =
    clean(
      product?.catalogCategory || product?.category || product?.catalogSection
    ) || 'категория товара';
  if (!title) return `Изображение товара: ${category}`;
  return isGeneratedCableImage(image)
    ? `${title} — иллюстрация конструкции кабеля`
    : `${title} — ${category}`;
}
