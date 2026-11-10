/** Reusable style references require compatible anatomy as well as approval. */
export function isCableReferenceCompatible(reference, target) {
  return (reference.cores === 1) === (target.cores === 1) &&
    ['geometry', 'hasOuterJacket', 'conductorMaterial', 'conductorConstruction',
      'shield', 'armor'].every(key => reference[key] === target[key]) &&
    Boolean(reference.specialElements?.includes('fire-barrier')) ===
      Boolean(target.specialElements?.includes('fire-barrier'));
}
