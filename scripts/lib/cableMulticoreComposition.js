import rules from '../../data/cableMulticoreCompositionRules.json' with { type: 'json' };

export function deriveMulticoreComposition(profile, { historicalTargetedEdit = false } = {}) {
  if (historicalTargetedEdit || !rules.types.includes(profile.visualizationType))
    return null;
  return {
    version: rules.version,
    frame: rules.frame,
    bundle: rules.bundle,
    stripping: rules.stripping,
    review: rules.review,
  };
}

export function multicoreCompositionPrompt(contract) {
  if (!contract) return '';
  return ` MULTICORE GEOMETRY ${contract.version}: ${contract.frame} ${contract.bundle} ${contract.stripping} Verify manually: ${contract.review.join(', ')}.`;
}

export function multicoreCompositionReviewChecks(contract) {
  return contract?.version === rules.version ? rules.review : [];
}

/** Silhouette is measured from pixels; conductor and layer findings are observed separately. */
export function inspectMulticoreComposition(png, validation, profile, technical, observations) {
  const { width, height, data } = png;
  const { bounds, sha256 } = validation;
  const limits = rules.reviewLimits;
  const findings = [];
  const missing = [];
  const observed = observations?.sha256 === sha256 ? observations : null;
  const report = (code, condition) => { if (condition) findings.push(code); };
  if (!bounds) return { status: 'NEEDS_REVIEW', findings: ['empty-silhouette'], missing };
  const silhouetteCenter = (bounds.minY + bounds.maxY) / 2 / height;
  report('off-center-silhouette', Math.abs(silhouetteCenter - 0.5) > limits.centerOffsetCanvasHeight);
  report('possible-clipped-tips', bounds.minX < width * limits.minTipMarginCanvasWidth ||
    bounds.minY <= 0 || bounds.maxY >= height - 1);
  report('right-sheath-edge-missing', validation.compositionCheck.rightEdge.status !== 'EDGE_EVIDENCE_PRESENT');

  const tips = observed?.ends;
  if (!Array.isArray(tips) || !tips.every(tip =>
    Number.isFinite(tip.x) && Number.isFinite(tip.y) &&
    tip.x >= 0 && tip.x < width && tip.y >= 0 && tip.y < height)) {
    missing.push('annotated-metal-end-centers');
  } else {
    report('wrong-metal-end-count', tips.length !== technical.coreMetalEndCount);
    report('duplicate-metal-end-centers', new Set(tips.map(tip => tip.x + ':' + tip.y)).size !== tips.length);
    if (!tips.every(tip => typeof tip.complete === 'boolean')) missing.push('metal-end-visibility');
    report('incomplete-metal-end', tips.some(tip => tip.complete === false));
  }

  for (const [field, expected] of Object.entries({
    insulatedCoreCount: technical.insulatedCoreCount,
    conductorMaterial: profile.conductorMaterial,
    conductorConstruction: profile.conductorConstruction,
    conductorShape: profile.conductorShape,
    additionalConductorCount: technical.additionalConductors.length,
  })) {
    if (observed?.[field] == null) missing.push(field);
    else report('profile-mismatch-' + field, observed[field] !== expected);
  }
  const colors = observed?.coreColors;
  if (!Array.isArray(colors)) missing.push('coreColors');
  else report('profile-mismatch-coreColors',
    JSON.stringify([...colors].sort()) !== JSON.stringify([...profile.coreColors].sort()));
  const roles = observed?.layerRoles;
  if (!Array.isArray(roles)) missing.push('layerRoles');
  else {
    const expected = new Set(technical.layers.map(layer => layer.role));
    for (const role of roles) if (!expected.has(role)) findings.push('unexpected-layer-' + role);
    for (const role of expected) if (!roles.includes(role)) findings.push('layer-not-visible-' + role);
  }

  let measurements;
  if (Array.isArray(tips) && tips.length === 4 && !missing.includes('annotated-metal-end-centers') &&
      profile.cores === 4 && profile.geometry === 'round' && profile.conductorShape === 'circular' && !profile.coreLayout) {
    const axis = measureMulticoreSheathAxis(png);
    if (!axis) missing.push('sheath-axis');
    else {
      const offsets = tips.map(({ x, y }) => (y - axis.slope * x - axis.intercept) / Math.hypot(1, axis.slope));
      const along = tips.map(({ x, y }) => (x + axis.slope * y) / Math.hypot(1, axis.slope));
      const spread = (Math.max(...offsets) - Math.min(...offsets)) / axis.diameter;
      const center = Math.abs(mean(offsets)) / axis.diameter;
      const staircaseOrder = orderedPairAgreement(along, offsets);
      const depthSpread = (Math.max(...along) - Math.min(...along)) / axis.diameter;
      measurements = {
        tipSpreadPerSheathDiameter: spread, tipCenterOffsetPerSheathDiameter: center,
        tipDepthSpreadPerSheathDiameter: depthSpread, staircaseOrder,
      };
      const threshold = limits.fourEqualRound;
      report('excessive-tip-spread', spread > threshold.maxTipSpreadSheathDiameter);
      report('core-group-off-axis', center > threshold.maxTipCenterOffsetSheathDiameter);
      report('diagonal-tip-staircase', staircaseOrder >= threshold.staircaseOrder &&
        depthSpread >= threshold.minStaircaseDepthPerSheathDiameter &&
        spread > threshold.maxTipSpreadSheathDiameter);
    }
  }
  return { status: 'NEEDS_REVIEW', findings, missing, measurements };
}

const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
function orderedPairAgreement(a, b) {
  let concordant = 0, discordant = 0, pairs = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      pairs++;
      const direction = (a[i] - a[j]) * (b[i] - b[j]);
      if (direction > 0) concordant++;
      if (direction < 0) discordant++;
    }
  return Math.max(concordant, discordant) / pairs;
}

export function measureMulticoreSheathAxis({ width, height, data }) {
  const xs = [], ys = [], diameters = [];
  for (let x = Math.ceil(width * 0.76); x < width * 0.98; x += Math.max(1, Math.floor(width / 400))) {
    let top = height, bottom = -1;
    for (let y = 0; y < height; y++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue;
      top = Math.min(top, y);
      bottom = y;
    }
    if (bottom <= top) continue;
    xs.push(x);
    ys.push((top + bottom) / 2);
    diameters.push(bottom - top + 1);
  }
  if (xs.length < 2) return null;
  const x = mean(xs), y = mean(ys);
  const slope = xs.reduce((sum, value, i) => sum + (value - x) * (ys[i] - y), 0) /
    xs.reduce((sum, value) => sum + (value - x) ** 2, 0);
  return { slope, intercept: y - slope * x, diameter: mean(diameters) / Math.hypot(1, slope) };
}
