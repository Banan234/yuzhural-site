/** Natural PNG aspect ratio avoids contain-letterboxing masquerading as a PNG gap.
 * Comparisons must use equal-width columns for equal-size canvases. For different
 * source widths, render the narrower image at width/sourceComparisonWidth.
 * These are display-only rules; never resize, crop or rewrite the PNG bytes.
 */
export const CABLE_REVIEW_IMAGE_CSS = `
.picture{overflow:hidden}
.picture img{display:block;width:100%;height:auto;max-height:none}
.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
@media(max-width:700px){.comparison{grid-template-columns:1fr}}
`;

export function comparisonImageWidth(sourceWidth, comparisonWidth) {
  if (
    !(sourceWidth > 0) ||
    !(comparisonWidth >= sourceWidth) ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(comparisonWidth)
  )
    throw Error('Comparison requires finite positive source widths');
  return `${(sourceWidth / comparisonWidth) * 100}%`;
}
