import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { classifyPracticalCableVisualProduct } from './lib/familyVisualRules.js';
import { makeVisualIdentity } from './lib/cableVisualClassification.js';
import { digest } from './lib/cableStyleBatch.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  out = path.join(root, 'outputs/cable-visualkey-audit'),
  read = async (f) => JSON.parse(await fs.readFile(path.join(root, f)));
const old = await read('outputs/cable-visualkey-audit/baseline-plan.json'),
  products = await read('data/catalog-current/products.json');
assert.equal(
  digest(products),
  old.catalogHash,
  'Catalogue drift: old plan is not same input'
);
assert.equal(old.groups.length, 3392);
const context = {
  rules: await read('data/cableVisualClassificationRules.json'),
  familyVisualRules: await read('data/familyVisualRules.json'),
  knowledge: await read('shared/designationKnowledgeBase.json'),
  colorRules: await read('data/cableImageColors.json'),
};
const rows = products.map((p) =>
    classifyPracticalCableVisualProduct(p, context)
  ),
  bySku = new Map(rows.map((r) => [r.sku, r])),
  newGroups = new Map();
for (const r of rows) {
  if (!newGroups.has(r.visualKey)) newGroups.set(r.visualKey, []);
  newGroups.get(r.visualKey).push(r);
}
const splits = [],
  changedNotSplit = [],
  checks = [];
const fields = [
  'family',
  'productType',
  'cores',
  'conductorMaterial',
  'conductorConstruction',
  'conductorShape',
  'geometry',
  'hasOuterJacket',
  'outerJacket',
  'armor',
  'armorType',
  'shield',
  'shieldType',
  'coreColors',
  'pairedGroupSize',
  'specialElements',
];
for (const g of old.groups) {
  const current = g.members.map((m) => bySku.get(m.sku));
  assert.ok(current.every(Boolean));
  const variants = new Map();
  for (const r of current) {
    if (!variants.has(r.visualKey)) variants.set(r.visualKey, []);
    variants.get(r.visualKey).push(r);
  }
  const differences = fields.filter(
    (f) =>
      new Set(current.map((r) => JSON.stringify(r.visualProfile[f] ?? null)))
        .size > 1
  );
  checks.push({
    oldVisualKey: g.visualKey,
    skuCount: g.members.length,
    newKeys: [...variants.keys()],
    otherConstructionDifferences: differences,
  });
  const record = {
    oldVisualKey: g.visualKey,
    skuCount: g.members.length,
    variants: [...variants].map(([key, rs]) => ({
      visualKey: key,
      coreLayout: rs[0].visualProfile.coreLayout || { arrangement: 'uniform' },
      needsReview: rs.some((r) => r.visualClassification === 'needs_review'),
      products: rs.map((r) => ({
        sku: r.sku,
        name: r.displayName,
        primaryCores: r.primaryCores,
        auxiliaryCores: r.auxiliaryCores,
        primarySection: r.section,
        auxiliarySection: r.auxiliarySection,
        issues: r.issues,
      })),
    })),
  };
  if (variants.size > 1) splits.push(record);
  else if (current[0].visualKey !== g.visualKey) changedNotSplit.push(record);
}
// Equal new identities may merge historical keys; never merge merely by total count/size.
const newToOld = new Map();
for (const g of old.groups)
  for (const m of g.members) {
    const k = bySku.get(m.sku).visualKey;
    if (!newToOld.has(k)) newToOld.set(k, new Set());
    newToOld.get(k).add(g.visualKey);
  }
const merges = [...newToOld]
  .filter(([, ks]) => ks.size > 1)
  .map(([key, ks]) => ({ visualKey: key, oldKeys: [...ks] }));
const known = new Map();
for (const r of rows) {
  const profile = { ...r.visualProfile };
  delete profile.visualizationType;
  const identity = makeVisualIdentity(profile);
  assert.equal(identity.visualKey, r.visualKey);
  const signature = JSON.stringify(
    fields.map((k) => profile[k] ?? null).concat([profile.coreLayout ?? null])
  );
  if (known.has(r.visualKey))
    assert.equal(
      known.get(r.visualKey),
      signature,
      'Construction collision remains'
    );
  else known.set(r.visualKey, signature);
}
const technicalDivergences = [];
for (const group of old.groups) {
  const members = group.members.map((m) => bySku.get(m.sku));
  for (const field of [
    'conductorMaterial',
    'conductorConstruction',
    'geometry',
    'armor',
    'armorType',
    'shield',
    'shieldType',
    'coreColors',
  ]) {
    const knownValues = members
      .map((r) => r.technicalProfile?.[field])
      .filter((v) => v != null);
    if (new Set(knownValues.map((v) => JSON.stringify(v))).size > 1)
      technicalDivergences.push({
        visualKey: group.visualKey,
        field,
        products: members.map((r) => ({
          sku: r.sku,
          name: r.displayName,
          value: r.technicalProfile?.[field] ?? null,
        })),
      });
  }
}
const mixed = rows.filter((r) => r.visualProfile.coreLayout);
const summary = {
  auditedOldKeys: old.groups.length,
  products: rows.length,
  errorGroups: splits.length,
  keysToSplit: splits.length,
  changedNotSplit: changedNotSplit.length,
  keysParticipatingInMerges: new Set(merges.flatMap((m) => m.oldKeys)).size,
  mergeTargets: merges.length,
  newVisualKeys: newGroups.size,
  mixedSizeProducts: mixed.length,
  additionalCoreProducts: rows.filter((r) => r.auxiliaryCores > 0).length,
  otherKnownConstructionCollisions: checks.filter(
    (c) => c.otherConstructionDifferences.length
  ).length,
  checks: [
    'primary/auxiliary counts and relative size',
    'solid/stranded',
    'copper/aluminium',
    'armour/shield type',
    'round/flat/twisted',
    'palette',
    'family and special layers',
  ],
  knownTechnicalDivergences: technicalDivergences.length,
  unknownsNotCertified: true,
};
await fs.writeFile(
  path.join(out, 'audit.json'),
  JSON.stringify(
    {
      summary,
      technicalDivergences,
      splits,
      changedNotSplit,
      merges,
      checks,
      mixedProducts: mixed.map((r) => ({
        sku: r.sku,
        name: r.displayName,
        visualKey: r.visualKey,
        coreLayout: r.visualProfile.coreLayout,
        issues: r.issues,
      })),
    },
    null,
    2
  )
);
await fs.writeFile(
  path.join(out, 'summary.json'),
  JSON.stringify(summary, null, 2)
);
console.log(JSON.stringify(summary, null, 2));
