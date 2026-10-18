import fs from 'node:fs/promises';
import path from 'node:path';
import {
  classifyCableVisualProduct,
  compareVisualAsset,
  makeVisualIdentity,
  normalizeCableFamily,
  visualHash,
} from './cableVisualClassification.js';
import {
  classifyPracticalCableVisualProduct,
  comparePracticalVisualAsset,
  isVisualAutoApproved,
} from './familyVisualRules.js';

export function classifyExistingCableAsset(record, context) {
  const d = record.visual_descriptor || {};
  const family = normalizeCableFamily(
    { name: `${d.family || record.family} ${d.cores || record.cores}x1` },
    context
  );
  const rule = context.rules.families[family.baseFamily] || {};
  const profile = {
    family: family.familyId,
    cores: d.cores ?? null,
    primaryCores: d.cores ?? null,
    auxiliaryCores: 0,
    pairedGroupSize: null,
    productType: rule.productType ?? null,
    conductorMaterial: d.material ?? null,
    conductorConstruction: d.strand ?? null,
    conductorShape: 'circular',
    geometry: d.shape ?? null,
    hasOuterJacket: true,
    outerJacket: d.jacket?.split(' ')[0] ?? null,
    outerJacketMaterial: d.jacket?.split(' ').slice(1).join(' ') || null,
    insulation: d.insulation ?? null,
    armor: rule.armor ?? null,
    armorType: rule.armorType ?? null,
    shield: rule.shield ?? null,
    shieldType: rule.shieldType ?? null,
    filler: null,
    specialElements: [...(rule.specialElements || [])].sort(),
    hasPE: d.colors?.includes('yellow-green') ?? null,
    hasN: null,
    coreColors: d.colors || null,
    coreColorScheme: d.colors
      ? `${d.cores}core-${d.colors.includes('yellow-green') ? 'pe' : 'no-pe'}-${d.colors.join('-')}`
      : null,
    sectionKey: d.sectionKey ?? null,
    auxiliarySectionKey: null,
  };
  return {
    legacyVisualKey: record.visualKey || record.visual_key,
    image: record.public_url,
    outputFilename: record.output_filename,
    status: record.status,
    sha256: record.validation?.sha256,
    ...makeVisualIdentity(profile),
    profileCompleteness: context.familyVisualRules
      ? 'user-approved-typage'
      : profile.filler === null
        ? 'partial'
        : 'complete',
    notes: context.familyVisualRules
      ? [
          'Стиль и типаж утверждены пользователем. Сопоставление по критическим видимым признакам.',
          'Неполные старые metadata по заполнителю/точному материалу не запрещают REUSE.',
        ]
      : [
          'Миграция описания существующего изображения. Палитра изображения не подтверждает состав конкретного SKU.',
          'Заполнитель не описан в прежних metadata; соответствие требует проверки.',
        ],
    products: (record.products || []).map((p) => p.sku),
  };
}

export function planCableVisualAudit({
  products,
  context,
  assets,
  currentImages = {},
}) {
  const practical = !!context.familyVisualRules;
  const compare = practical ? comparePracticalVisualAsset : compareVisualAsset;
  const rows = products.map((p) =>
    practical
      ? classifyPracticalCableVisualProduct(p, context)
      : classifyCableVisualProduct(p, context)
  );
  for (const row of rows) {
    row.currentImage = currentImages[row.sku] || null;
    const candidates = assets.filter(
      (a) =>
        a.visualProfile.family === row.familyId &&
        a.visualProfile.cores === row.cores
    );
    row.candidateImages = candidates.map((a) => ({
      image: a.image,
      legacyVisualKey: a.legacyVisualKey,
      ...compare(row, a),
    }));
    const compatible = row.candidateImages.filter((c) => c.compatible);
    const current = assets.find((a) => a.image === row.currentImage);
    row.currentImageAssessment = current ? compare(row, current) : null;
    row.imageStatus =
      row.visualClassification === 'needs_review'
        ? 'NEEDS_REVIEW'
        : compatible.length
          ? 'REUSE'
          : 'MISSING';
    row.proposedImage = compatible[0]?.image || null;
    if (
      row.currentImage &&
      !row.currentImage.includes('placeholder') &&
      (!current || !row.currentImageAssessment?.compatible)
    ) {
      row.imageStatus = 'NEEDS_REVIEW';
      if (practical && isVisualAutoApproved(row)) {
        row.visualClassification = 'needs_review';
        row.classificationConfidence = 'low';
        row.issues.push({
          code: 'current_image_conflict',
          message: `Текущее изображение требует проверки: ${row.currentImageAssessment?.mismatches.join(', ') || 'нет подтверждённого описания критической конструкции'}`,
        });
      }
    }
  }
  const groupMap = new Map();
  for (const row of rows) {
    let group = groupMap.get(row.visualKey);
    if (group && group.visualProfileId !== row.visualProfileId)
      throw new Error('Visual key collision');
    if (!group) {
      group = {
        visualKey: row.visualKey,
        visualProfileId: row.visualProfileId,
        visualProfile: row.visualProfile,
        visualClassification: row.visualClassification,
        classificationConfidence: row.classificationConfidence,
        imageStatus: row.imageStatus,
        proposedImage: row.proposedImage,
        products: [],
        reason: isVisualAutoApproved(row)
          ? 'Одинаковый visualProfile: семейство и определённые видимые конструктивные признаки совпадают. Сечение остаётся metadata, кроме явно заданных визуальных правил.'
          : 'Предварительная группа с одинаковыми известными признаками и неизвестными полями. Это НЕ разрешение использовать одну иллюстрацию: сначала требуется уточнить конструкцию каждого SKU.',
        readyForApproval:
          isVisualAutoApproved(row) && row.imageStatus !== 'NEEDS_REVIEW',
      };
      groupMap.set(row.visualKey, group);
    }
    group.products.push({
      sku: row.sku,
      name: row.originalName,
      section: row.section,
      sectionUnit: row.sectionUnit,
      auxiliarySection: row.auxiliarySection,
      confidence: row.classificationConfidence,
      imageStatus: row.imageStatus,
    });
    if (row.visualClassification === 'needs_review') {
      group.visualClassification = 'needs_review';
      group.classificationConfidence = 'low';
      group.readyForApproval = false;
    }
    if (row.imageStatus === 'NEEDS_REVIEW') {
      group.imageStatus = 'NEEDS_REVIEW';
      group.readyForApproval = false;
    }
  }
  const groups = [...groupMap.values()].sort(
    (a, b) =>
      b.products.length - a.products.length ||
      a.visualKey.localeCompare(b.visualKey)
  );
  if (practical) {
    const bySku = new Map(rows.map((r) => [r.sku, r]));
    for (const group of groups) {
      const eligible = group.products
        .map((p) => bySku.get(p.sku))
        .filter(isVisualAutoApproved);
      group.autoApprovedSkus = eligible.map((r) => r.sku);
      group.reviewSkus = group.products
        .filter((p) => !group.autoApprovedSkus.includes(p.sku))
        .map((p) => p.sku);
      if (eligible.length) {
        group.visualClassification = 'AUTO_APPROVED';
        group.classificationConfidence = 'medium';
        group.readyForApproval = true;
        group.imageStatus = eligible.some((r) => r.imageStatus === 'REUSE')
          ? 'REUSE'
          : 'MISSING';
        group.proposedImage =
          eligible.find((r) => r.proposedImage)?.proposedImage || null;
        group.reason =
          'Совпадают критические видимые признаки и каталоговые familyVisualRules. Автоматически обрабатываются только autoApprovedSkus; reviewSkus остаются на проверке.';
      }
    }
  }
  if (practical)
    for (const asset of assets) {
      asset.matchedVisualKeys = groups
        .filter(
          (g) => g.imageStatus === 'REUSE' && g.proposedImage === asset.image
        )
        .map((g) => g.visualKey);
      asset.matchedSkuCount = rows.filter(
        (r) => r.imageStatus === 'REUSE' && r.proposedImage === asset.image
      ).length;
    }
  const countBy = (items, fn) =>
    Object.fromEntries(
      [
        ...items.reduce((map, x) => {
          const key = fn(x);
          map.set(key, (map.get(key) || 0) + 1);
          return map;
        }, new Map()),
      ].sort((a, b) => b[1] - a[1])
    );
  const reasons = rows.flatMap((r) => [
    ...new Set(r.issues.map((i) => i.code)),
  ]);
  const families = [...new Set(rows.map((r) => r.familyId))];
  const summary = {
    totalProducts: rows.length,
    recognized: rows.filter(isVisualAutoApproved).length,
    needsReview: rows.filter((r) => r.visualClassification === 'needs_review')
      .length,
    familyRecognized: rows.filter((r) => r.familyRecognized).length,
    uniqueFamilyIds: families.length,
    verifiedFamilyIds: new Set(
      rows.filter((r) => r.familyRecognized).map((r) => r.familyId)
    ).size,
    uniqueVisualProfiles: groups.length,
    uniqueVisualKeys: groups.length,
    readyVisualProfiles: groups.filter((g) => g.readyForApproval).length,
    existingApprovedImages: assets.filter((a) => a.status === 'approved')
      .length,
    currentProductsWithImages: rows.filter(
      (r) => r.currentImage && !r.currentImage.includes('placeholder')
    ).length,
    imageStatus: {
      REUSE: 0,
      MISSING: 0,
      NEEDS_REVIEW: 0,
      ...countBy(rows, (r) => r.imageStatus),
    },
    confidence: {
      high: 0,
      medium: 0,
      low: 0,
      ...countBy(rows, (r) => r.classificationConfidence),
    },
    reviewReasons: countBy(reasons, (x) => x),
    apiRequests: 0,
    bindingsChanged: 0,
    imagesGenerated: 0,
  };
  if (practical) {
    summary.autoApproved = rows.filter(isVisualAutoApproved).length;
    summary.reuse = {
      visualKeys: groups.filter(
        (g) => g.imageStatus === 'REUSE' && g.readyForApproval
      ).length,
      products: rows.filter(
        (r) => r.imageStatus === 'REUSE' && isVisualAutoApproved(r)
      ).length,
      existingImagesUsed: new Set(
        rows
          .filter((r) => r.imageStatus === 'REUSE')
          .map((r) => r.proposedImage)
      ).size,
    };
    summary.missing = {
      visualKeys: groups.filter(
        (g) => g.imageStatus === 'MISSING' && g.readyForApproval
      ).length,
      products: rows.filter(
        (r) => r.imageStatus === 'MISSING' && isVisualAutoApproved(r)
      ).length,
    };
    summary.previousNeedsReview = 5404;
    summary.needsReviewReduction = 5404 - summary.needsReview;
    summary.automaticFamilies = [
      ...new Set(rows.filter(isVisualAutoApproved).map((r) => r.baseFamily)),
    ].sort();
  }
  return {
    schemaVersion: 1,
    mode: 'classification-dry-run',
    rulesVersion: context.familyVisualRules?.version || context.rules.version,
    classificationMode: practical ? 'practical' : 'strict',
    generationAllowed: false,
    bindingAllowed: false,
    summary,
    policies: {
      unknownPE: practical
        ? 'Actual PE/N is not inferred. The illustration may use the centralized approved family palette.'
        : 'Never inferred from conductor count or parser hasGroundCore=false',
      unknownConstruction: practical
        ? 'Family visual defaults allowed; known construction and conflicts take precedence.'
        : 'Previous solid render default is not a construction fact',
      normalization:
        'Missing fire category A is not invented; equivalent whitespace/spelling is normalized',
      section:
        'Only explicit family rules may introduce a visual section key or change conductor construction',
      existingImages: practical
        ? '119 existing images approved by user for style/typage; compare critical visible features only.'
        : 'Retained unchanged; partial image metadata requires review',
    },
    rows,
    groups,
    existingAssets: assets,
    needsReview: rows.filter(
      (r) =>
        r.visualClassification === 'needs_review' ||
        r.imageStatus === 'NEEDS_REVIEW'
    ),
  };
}

export async function readCableVisualAssets(root, context) {
  const dir = path.join(root, 'data/product-image-metadata/groups');
  const names = (await fs.readdir(dir))
    .filter((n) => n.endsWith('.json'))
    .sort();
  const assets = [];
  for (const name of names) {
    const record = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
    if (record.status !== 'approved') continue;
    const asset = classifyExistingCableAsset(record, context);
    const filename = path.resolve(root, asset.outputFilename || '');
    if (
      !filename.startsWith(path.join(root, 'public/product-images') + path.sep)
    )
      throw new Error(`Unsafe existing asset path: ${name}`);
    const bytes = await fs.readFile(filename);
    // Same SHA-256 as legacy metadata (byte hash rather than JSON hash).
    const { createHash } = await import('node:crypto');
    const actual = createHash('sha256').update(bytes).digest('hex');
    asset.integrity = actual === asset.sha256 ? 'verified' : 'mismatch';
    if (asset.integrity !== 'verified') asset.status = 'needs_review';
    assets.push(asset);
  }
  return assets;
}

export function auditCsv(rows) {
  const fields = [
    'originalName',
    'sku',
    'familyId',
    'cores',
    'primaryCores',
    'auxiliaryCores',
    'auxiliarySection',
    'section',
    'sectionUnit',
    'construction',
    'geometry',
    'hasPE',
    'hasN',
    'visualKey',
    'classificationConfidence',
    'visualClassification',
    'imageStatus',
    'currentImage',
  ];
  const cell = (v) => {
    const str = String(v ?? '');
    return `"${(/^[=+@\-\t\r]/u.test(str) ? "'" : '') + str.replace(/"/gu, '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      fields.map(cell).join(','),
      ...rows.map((r) => fields.map((k) => cell(r[k])).join(',')),
    ].join('\r\n') +
    '\r\n'
  );
}

export const visualAuditFingerprint = ({
  products,
  rules,
  knowledge,
  assets,
}) =>
  visualHash({
    products,
    rules,
    knowledgeRevision: knowledge.revision,
    assets: assets.map((a) => ({ image: a.image, sha256: a.sha256 })),
  });
