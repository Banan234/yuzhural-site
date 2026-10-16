import { buildProductDesignation } from './productDesignation.js';
import { DESIGNATION_KNOWLEDGE_REVISION } from './productDesignationReference.js';

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
  };
  const pending = [];
  for (const product of enriched) {
    const d = product.designationDecoded;
    counts[d.status]++;
    if (d.family) counts.familyIdentified++;
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
      pending,
      invariant: 'Все исходные поля позиций сохранены без изменений.',
    },
  };
}
