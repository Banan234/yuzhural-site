import { buildProductDesignation } from './productDesignation.js';
import {
  DESIGNATION_KNOWLEDGE_REVISION,
  DESIGNATION_COVERAGE_TARGET,
} from './productDesignationReference.js';

export function enrichPriceDesignations(
  products,
  { generatedAt = new Date().toISOString() } = {}
) {
  if (!Array.isArray(products))
    throw new Error('Прайс должен содержать массив позиций.');
  const enriched = products.map((product) => ({
    ...product,
    designationDecoded: buildProductDesignation(product),
  }));
  // Only the new description field may change, including when refreshing an older revision.
  const unchanged = (value) => {
    const { designationDecoded, ...rest } = value;
    return rest;
  };
  if (
    JSON.stringify(products.map(unchanged)) !==
    JSON.stringify(enriched.map(unchanged))
  )
    throw new Error('Изменились исходные данные прайса.');
  const counts = {
    products: products.length,
    reviewed: 0,
    partial: 0,
    unresolved: 0,
    familyIdentified: 0,
    officialComplete: 0,
  };
  const pending = [];
  const officialPending = [];
  const officialByDocument = {};
  const manufacturerTexts = {
    products: 0,
    productsWithMultipleTexts: 0,
    records: new Set(),
    documents: new Set(),
  };
  for (const product of enriched) {
    const d = product.designationDecoded;
    if (d.manufacturerTexts.length) manufacturerTexts.products++;
    if (d.manufacturerTexts.length > 1)
      manufacturerTexts.productsWithMultipleTexts++;
    for (const text of d.manufacturerTexts) {
      manufacturerTexts.records.add(text.id);
      manufacturerTexts.documents.add(text.documentId);
    }
    counts[d.status]++;
    if (d.family) counts.familyIdentified++;
    if (d.officialComplete) {
      counts.officialComplete++;
      const id = d.evidence.documentId;
      officialByDocument[id] = (officialByDocument[id] || 0) + 1;
    } else {
      officialPending.push({
        sku: product.sku,
        slug: product.slug,
        sourceName: product.sourceName,
        status: d.status,
        family: d.family,
        unknown: d.unknown,
        warnings: d.warnings,
        reason:
          d.status === 'reviewed'
            ? 'Нет полной связи с полученной документацией изготовителя.'
            : 'Обозначение разобрано не полностью.',
      });
    }
    if (d.status !== 'reviewed')
      pending.push({
        sku: product.sku,
        slug: product.slug,
        mark: product.mark,
        sourceName: product.sourceName,
        family: d.family,
        unknown: d.unknown,
        warnings: d.warnings,
        sources: d.sources,
      });
  }
  return {
    products: enriched,
    report: {
      knowledgeRevision: DESIGNATION_KNOWLEDGE_REVISION,
      generatedAt,
      counts,
      manufacturerTextCoverage: {
        products: manufacturerTexts.products,
        productsWithMultipleTexts: manufacturerTexts.productsWithMultipleTexts,
        records: manufacturerTexts.records.size,
        documents: manufacturerTexts.documents.size,
        percent: products.length
          ? Number(
              ((100 * manufacturerTexts.products) / products.length).toFixed(2)
            )
          : 0,
        definition:
          'Есть отдельное краткое изложение технического назначения или описания из документации изготовителя. Это не оценка полноты расшифровки или допуска конкретного исполнения.',
      },
      officialCoverage: {
        numerator: counts.officialComplete,
        denominator: counts.products,
        percent: counts.products
          ? Number(
              ((100 * counts.officialComplete) / counts.products).toFixed(2)
            )
          : 0,
        targetPercent: DESIGNATION_COVERAGE_TARGET,
        targetMet:
          counts.officialComplete >=
          Math.ceil((counts.products * DESIGNATION_COVERAGE_TARGET) / 100),
        definition:
          'Полная расшифровка без неизвестных индексов и предупреждений; конструкция и размерная величина привязаны к полученной документации изготовителя.',
      },
      pending,
      officialPending,
      officialByDocument,
      invariant: 'Все исходные поля позиций сохранены без изменений.',
    },
  };
}
