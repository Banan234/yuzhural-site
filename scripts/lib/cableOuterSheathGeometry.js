/** Outer sheath geometry is independent of the core count and of product title words. */
export function deriveOuterSheathGeometry(p) {
  const derived =
    p?.hasOuterJacket === false
      ? 'NO_COMMON_SHEATH'
      : p?.hasOuterJacket === true && p.geometry === 'flat'
        ? 'FLAT'
        : p?.hasOuterJacket === true && p.geometry === 'round'
          ? 'ROUND'
          : 'UNKNOWN';
  if (p?.outerSheathGeometry && p.outerSheathGeometry !== derived)
    throw Error(
      'NEEDS_TECHNICAL_REVIEW: outer sheath geometry conflicts with confirmed geometry/jacket flags'
    );
  return derived;
}
export function outerSheathGeometryPrompt(p) {
  const g = deriveOuterSheathGeometry(p);
  if (g === 'UNKNOWN')
    throw Error('NEEDS_TECHNICAL_REVIEW: outer sheath geometry unknown');
  return `OUTER_SHEATH_GEOMETRY=${g}. Geometry is determined by the technical profile, NEVER by the number of cores or the word flat in a title. ${g === 'FLAT' ? (p.pairedGroupSize && p.cores > p.pairedGroupSize
      ? 'Use a genuinely FLAT/OVAL common outer sheath around the side-by-side core groups, with the cores clustered inside each group; not a round tube.'
      : 'Use a genuinely FLAT/OVAL common outer sheath closely enclosing the side-by-side insulated cores; not a round tube.') : g === 'ROUND' ? 'Use a ROUND common outer sheath, even with only TWO cores; do not copy the flat SHVVP geometry.' : 'There is NO common outer sheath; individual core insulation is not an extra overall jacket.'}`;
}
