// Значения обозначений задаются внутри семейства. Документы не подтверждают
// изготовителя конкретной складской партии.
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };

export const DESIGNATION_REVIEW_DATE = knowledge.reviewedAt;
export const DESIGNATION_KNOWLEDGE_REVISION = knowledge.revision;
export const DESIGNATION_SOURCES = knowledge.sources;
export const PRODUCT_DESIGNATION_FAMILIES = knowledge.families;
export const DESIGNATION_DOCUMENTS = knowledge.documents;
export const DESIGNATION_CROSS_CHECKS = knowledge.crossChecks || [];
export const DESIGNATION_COVERAGE_TARGET =
  knowledge.coverageTargetPercent || 70;
