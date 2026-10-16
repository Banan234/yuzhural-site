// Значения обозначений задаются внутри семейства. Документы не подтверждают
// изготовителя конкретной складской партии.
import knowledge from './designationKnowledgeBase.json' with { type: 'json' };

export const DESIGNATION_REVIEW_DATE = knowledge.reviewedAt;
export const DESIGNATION_KNOWLEDGE_REVISION = knowledge.revision;
export const DESIGNATION_SOURCES = knowledge.sources;
export const PRODUCT_DESIGNATION_FAMILIES = knowledge.families;
