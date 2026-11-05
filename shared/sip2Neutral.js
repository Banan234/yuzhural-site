import knowledge from './designationKnowledgeBase.json' with { type: 'json' };
import { checkDesignationConstruction } from './designationConstructionEvidence.js';

// Migrate only the generic parser's exact, documented SIP-2 additional pair.
// Other constructions (including lighting auxiliaries) remain untouched.
export function normalizeSip2Neutral(
  product,
  designation = product.sourceName
) {
  if (
    !/^СИП-2\s/iu.test(designation || '') ||
    product.parsingWarnings?.length ||
    ['mark', 'markFamily'].some(
      (key) =>
        product[key] != null &&
        String(product[key]).trim().toUpperCase() !== 'СИП-2'
    )
  )
    return product;
  const match =
    /^СИП-2\s+\d+\s*[хx×]\s*\d+(?:[.,]\d+)?\s*\+\s*(\d+)\s*[хx×]\s*(\d+(?:[.,]\d+)?)(?:\s+0[.,]6\/1(?:\s*кВ)?)?\s*$/iu.exec(
      designation
    );
  if (!match) return product;
  const count = Number(match[1]);
  const section = Number(match[2].replace(',', '.'));
  if (
    (product.groundCores != null && Number(product.groundCores) !== count) ||
    (product.groundSection != null &&
      Number(product.groundSection) !== section) ||
    (product.hasGroundCore === true &&
      (product.groundCores == null || product.groundSection == null))
  )
    return product;
  const candidate = {
    ...product,
    hasGroundCore: false,
    groundCores: null,
    groundSection: null,
    neutralCores: product.neutralCores ?? count,
    neutralSection: product.neutralSection ?? section,
  };
  const proof = checkDesignationConstruction({
    product: candidate,
    designation,
    family: knowledge.families.find((f) => f.mark === 'СИП-2'),
    documents: knowledge.documents,
  });
  return proof.status === 'confirmed' ? candidate : product;
}
