import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCableStyleRequest, generateCableStyleDraft } from './lib/cableImageStyle.js';
import { createImageProvider } from './lib/cableImageProvider.js';
import { digest, cableStyleReviewRequirements } from './lib/cableStyleBatch.js';
import { loadCableReviewDecisions } from './lib/cableReviewDecisions.js';
import { cableGenerationClaimKey, readCableGenerationClaims } from './lib/cableGenerationClaims.js';
import { classifyPracticalCableVisualProduct } from './lib/familyVisualRules.js';
import { getVvgProductIllustrationProfile, getVvgIllustrationSignature } from './lib/cableVvgIllustration.js';
import { compareCableReferenceProfile, loadApprovedStyleReferences } from './lib/cableApprovedStyleReference.js';
import { makeVisualIdentity } from './lib/cableVisualClassification.js';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/u, '');
const out = path.join(root, 'outputs/cable-vvg-contracts-2026-11-15');
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file)));
const decisions = await read(path.join(out, 'decisions.json'));
const archived = new Map((await loadCableReviewDecisions(root)).map(entry => [entry.decision.sha256, entry]));
const claims = await readCableGenerationClaims(root);
const bindings = await read('shared/generatedProductImages.json');
const products = new Map((await read('data/catalog-current/products.json')).map(p => [p.sku,p]));
const contextFiles = { rules: 'data/cableVisualClassificationRules.json', familyVisualRules: 'data/familyVisualRules.json',
  knowledge: 'shared/designationKnowledgeBase.json', colorRules: 'data/cableImageColors.json' };
const context = Object.fromEntries(await Promise.all(Object.entries(contextFiles).map(async ([key,file])=>[key,await read(file)])));
const classify = sku => classifyPracticalCableVisualProduct(products.get(sku), context);
const effective = sku => getVvgProductIllustrationProfile(products.get(sku), classify(sku));
const plain = effective('YU-0000919');
const filled = effective('YU-0000920');
assert.notEqual(makeVisualIdentity(plain).visualKey, makeVisualIdentity(filled).visualKey);
assert.notEqual(getVvgIllustrationSignature(plain), getVvgIllustrationSignature(filled));
assert.equal(compareCableReferenceProfile(filled, plain), null);
assert.notEqual(compareCableReferenceProfile(plain, filled)?.role, 'GEOMETRY_MATCH');

const allowed = new Set((await loadApprovedStyleReferences(root)).map(row=>row.sha256));
const checks = [];
for (const row of decisions.filter(row=>row.status !== 'CONFLICT')) {
  const entry = archived.get(row.sha256);
  assert.equal(entry.decision.disposition, row.disposition);
  assert.equal(digest(await fs.readFile(path.join(entry.decisionDir, 'image.png'))), row.sha256);
  assert.equal(allowed.has(row.sha256), false);
  assert.ok(!Object.values(bindings.bySku).some(binding=>binding.sha256===row.sha256));
  assert.equal(claims.get(entry.claimKey)?.status, row.disposition === 'REJECT' ? 'REJECTED' : 'HELD_DEFECT');
  checks.push({sku:row.sku, status:claims.get(entry.claimKey).status, sha256:row.sha256});
}

let localRequests = 0;
const controls=[];
let providerInstantiationsOnResume=0;
const blockedProvider = () => {
  providerInstantiationsOnResume++;
  throw Error('Unexpected provider');
};
{
  const screenedFour = effective('YU-0000982');
  const fourKey = makeVisualIdentity(screenedFour).visualKey;
  const fourRequest = await prepareCableStyleRequest(root, screenedFour);
  assert.match(fourRequest.prompt, /compact staggered two-by-two arrangement/);
  assert.ok(cableStyleReviewRequirements({ profile: screenedFour }, fourRequest)
    .required.includes('no-diagonal-staircase'));
  const rejected = await generateCableStyleDraft({root, profile:screenedFour, visualKey:fourKey,
    outputDir:path.join(out,'resume','YU-0000982'),providerFactory:blockedProvider});
  assert.equal(rejected.status,'REJECTED');
  for (const row of decisions.filter(row=>row.disposition === 'NEEDS_CORRECTION')) {
    const entry=archived.get(row.sha256);
    const group=await read(path.join(entry.decisionDir,'group.json'));
    // Draft metadata is the exact target identity. Catalog identity is also recorded
    // because a typical historical draft may cover more than one raw family key.
    const current=effective(row.sku);
    assert.equal(getVvgIllustrationSignature(current), getVvgIllustrationSignature(group.profile));
    const editTarget=path.join(entry.decisionDir,'image.png');
    const request=await prepareCableStyleRequest(root,group.profile,{editTarget,vvgReviewRevision:true});
    assert.match(request.prompt,/TECHNICAL_CONTRACT/);
    assert.match(request.prompt,/VISUAL_COMPOSITION_CONTRACT/);
    if (group.profile.shield) {
      assert.match(request.prompt,/SCREENED VVG COMPACT STRIPPING/);
      assert.doesNotMatch(request.prompt,/FUTURE COMMON-SHEATH COMPOSITION PREFERENCE/);
    } else {
      assert.deepEqual(request.technicalProfile.layers.map(layer=>layer.role),
        ['outer-jacket','inner-sheath','individual-insulation','fire-barrier']);
    }
    await assert.rejects(createImageProvider(request.config, {
      env:{IMAGE_API_KEY:'local-verification-only'},
      fetchImpl:async () => { localRequests++; throw Error('Unexpected upload'); },
    }).generate({prompt:request.prompt}), /Supplemental reference permission required/);
    const occupied=await generateCableStyleDraft({root,profile:group.profile,visualKey:group.visualKey,
      outputDir:path.join(out,'resume',row.sku),providerFactory:blockedProvider});
    assert.equal(occupied.status,'HELD_DEFECT');
    assert.equal(claims.has(cableGenerationClaimKey(group.profile,request.cutRevision)),false);
    controls.push({sku:row.sku,name:row.name,classifiedKey:makeVisualIdentity(current).visualKey,
      draftKey:group.visualKey,revision:request.cutRevision,referenceInputs:request.referenceInputs,
      technicalProfile:request.technicalProfile,composition:request.visualCompositionContract,
      ruleTrace:request.ruleTrace,manualChecks:cableStyleReviewRequirements(group,request).required,
      mockStatus:'UPLOAD_BLOCKED'});
  }
}
assert.equal(providerInstantiationsOnResume,0);
assert.equal(localRequests,0);
await fs.writeFile(path.join(out,'control.json'),JSON.stringify({
  node:process.version,localRequests,providerInstantiationsOnResume,paidRequests:0,checks,controls,
},null,2)+'\n');
console.log({localRequests,providerInstantiationsOnResume,paidRequests:0});
