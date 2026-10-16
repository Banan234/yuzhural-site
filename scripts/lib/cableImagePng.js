import { PNG } from 'pngjs';
import { hashImageData } from './cableImageSpec.js';

/** Decode pixels and CRCs. Requested API dimensions are advisory, never a validity gate. */
export function validateCableImagePng(buffer, config) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 33 ||
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error('Expected a PNG file');
  const widthHeader = buffer.readUInt32BE(16),
    heightHeader = buffer.readUInt32BE(20);
  if (widthHeader <= 0 || heightHeader <= 0)
    throw new Error('PNG dimensions must be positive');
  if (widthHeader * heightHeader > 16_000_000)
    throw new Error('PNG exceeds the pixel limit');
  let png;
  try {
    png = PNG.sync.read(buffer, { checkCRC: true });
  } catch {
    throw new Error('PNG cannot be decoded or has invalid CRC');
  }
  let hasTransparencyChunk = false;
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'tRNS')
      hasTransparencyChunk = true;
    offset += length + 12;
  }
  const hasAlphaChannel = !!png.alpha || hasTransparencyChunk;
  if (config.background === 'transparent' && !hasAlphaChannel)
    throw new Error(
      'PNG has no alpha channel for requested transparent background'
    );
  let transparent = 0,
    nonOpaque = 0,
    foreground = 0;
  let minX = png.width,
    minY = png.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha <= 8) transparent++;
      if (alpha < 255) nonOpaque++;
      if (alpha >= 32) {
        foreground++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  const count = png.width * png.height;
  const warnings = [];
  const limits = config.validation || {};
  if (
    config.background === 'transparent' &&
    transparent / count < (limits.minimumTransparentRatio ?? 0.15)
  )
    warnings.push(
      'PNG lacks sufficient real background transparency; visual review required'
    );
  if (foreground / count < (limits.minimumForegroundRatio ?? 0.04))
    warnings.push('PNG subject is empty or too small; visual review required');
  const margin = limits.minimumMarginRatio ?? 0.02;
  if (
    foreground &&
    (minX < png.width * margin ||
      minY < png.height * margin ||
      (!config.composition?.rightEdgeCrop &&
        maxX >= png.width * (1 - margin)) ||
      maxY >= png.height * (1 - margin))
  )
    warnings.push('PNG subject touches the frame margin; review cropping');
  if (config.composition?.rightEdgeCrop && foreground && maxX < png.width - 1)
    warnings.push(
      'Intact jacket does not reach the right edge; visual review required'
    );
  let rightEdgeForeground = 0;
  for (let y = 0; y < png.height; y++)
    if (png.data[(y * png.width + png.width - 1) * 4 + 3] >= 32)
      rightEdgeForeground++;
  return {
    width: png.width,
    height: png.height,
    requested_size: config.size,
    has_alpha_channel: hasAlphaChannel,
    touches_right_edge: rightEdgeForeground > 0,
    right_edge_foreground_ratio: rightEdgeForeground / png.height,
    has_transparency: nonOpaque > 0,
    transparent_ratio: transparent / count,
    non_opaque_ratio: nonOpaque / count,
    foreground_ratio: foreground / count,
    bounds: foreground ? { minX, minY, maxX, maxY } : null,
    warnings,
    sha256: hashImageData(buffer),
    bytes: buffer.length,
  };
}

/** Optional local transparent canvas: contain, center, preserve proportions and premultiplied alpha. */
export function prepareCableImagePng(buffer, config) {
  const source = validateCableImagePng(buffer, config);
  if (!config.normalization?.enabled)
    return {
      buffer,
      validation: source,
      source_validation: source,
      normalization: { applied: false },
    };
  const { width, height } = config.normalization;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 16_000_000
  )
    throw new Error('Invalid normalization canvas');
  const original = PNG.sync.read(buffer),
    output = new PNG({ width, height });
  const scale = Math.min(width / original.width, height / original.height);
  const targetWidth = Math.max(1, Math.round(original.width * scale));
  const targetHeight = Math.max(1, Math.round(original.height * scale));
  const left = config.composition?.rightEdgeCrop
      ? width - targetWidth
      : Math.floor((width - targetWidth) / 2),
    top = Math.floor((height - targetHeight) / 2);
  for (let y = 0; y < targetHeight; y++)
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.max(
        0,
        Math.min(
          original.width - 1,
          ((x + 0.5) * original.width) / targetWidth - 0.5
        )
      );
      const sy = Math.max(
        0,
        Math.min(
          original.height - 1,
          ((y + 0.5) * original.height) / targetHeight - 0.5
        )
      );
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(x0 + 1, original.width - 1),
        y1 = Math.min(y0 + 1, original.height - 1);
      const dx = sx - x0,
        dy = sy - y0;
      const samples = [
        [x0, y0, (1 - dx) * (1 - dy)],
        [x1, y0, dx * (1 - dy)],
        [x0, y1, (1 - dx) * dy],
        [x1, y1, dx * dy],
      ];
      let alpha = 0;
      const channels = [0, 0, 0];
      for (const [px, py, weight] of samples) {
        const offset = (py * original.width + px) * 4,
          a = original.data[offset + 3];
        alpha += a * weight;
        for (let c = 0; c < 3; c++)
          channels[c] += original.data[offset + c] * a * weight;
      }
      const offset = ((top + y) * width + left + x) * 4;
      for (let c = 0; c < 3; c++)
        output.data[offset + c] =
          alpha > 0 ? Math.round(channels[c] / alpha) : 0;
      output.data[offset + 3] = Math.round(alpha);
    }
  const normalized = PNG.sync.write(output);
  return {
    buffer: normalized,
    validation: validateCableImagePng(normalized, config),
    source_validation: source,
    normalization: {
      applied: true,
      method: 'contain',
      alignment: config.composition?.rightEdgeCrop ? 'right' : 'center',
      sourceWidth: original.width,
      sourceHeight: original.height,
      width,
      height,
      targetWidth,
      targetHeight,
      left,
      top,
    },
  };
}
