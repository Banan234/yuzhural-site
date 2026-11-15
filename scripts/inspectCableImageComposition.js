import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { inspectMulticoreComposition, measureMulticoreSheathAxis } from './lib/cableMulticoreComposition.js';
import { buildCableTechnicalProfile } from './lib/cableTechnicalProfile.js';
import { validateCableImagePng } from './lib/cableImagePng.js';

const annotationFile = process.argv[2];
if (!annotationFile)
  throw Error('Pass a JSON file containing PNG paths and annotated metal-end centers');
const annotations = JSON.parse(await fs.readFile(annotationFile));
const round = value => Math.round(value * 10) / 10;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const range = values => Math.max(...values) - Math.min(...values);
const measurements = [];
for (const { png, ends, profile, observations } of annotations) {
  const bytes = await fs.readFile(png);
  const decoded = PNG.sync.read(bytes);
  const { width, height } = decoded;
  const validation = validateCableImagePng(bytes, { background: 'transparent', composition: { rightEdgeCrop: true } });
  const { bounds, sha256 } = validation;
  const axis = measureMulticoreSheathAxis(decoded);
  if (!axis) throw Error('Unable to measure the intact body axis: ' + png);
  const { slope, intercept } = axis;
  const group = [mean(ends.map(({ x }) => x)), mean(ends.map(({ y }) => y))];
  const offsets = ends.map(({ x, y }) => (y - slope * x - intercept) / Math.hypot(1, slope));
  measurements.push({
    png, sha256, canvas: [width, height], bounds,
    axis: { slope: round(slope * 1000) / 1000, intercept: round(intercept), tiltDegrees: round(Math.atan(slope) * 180 / Math.PI), diameter: round(axis.diameter) },
    silhouetteCenterY: (bounds.minY + bounds.maxY) / 2,
    occupiedWidthPct: round((bounds.maxX - bounds.minX + 1) * 100 / width),
    groupCenter: group.map(round),
    groupOffsetFromAxisPx: round(mean(offsets)),
    horizontalSpreadPx: range(ends.map(({ x }) => x)),
    verticalSpreadPx: range(ends.map(({ y }) => y)),
    spreadPerpendicularToAxisPx: round(range(offsets)),
    ...(profile ? { pixelReview: inspectMulticoreComposition(decoded, validation, profile, buildCableTechnicalProfile(profile), observations) } : {}),
    ends: ends.map((end, index) => ({ ...end, perpendicularOffsetPx: round(offsets[index]) })),
  });
}
console.log(JSON.stringify(measurements, null, 2));
