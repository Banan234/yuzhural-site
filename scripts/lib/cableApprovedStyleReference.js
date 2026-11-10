import { isCableReferenceCompatible } from './cableReferenceCompatibility.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Rank the entire durable approved library for style transfer, never technical identity reuse. */
export async function selectApprovedStyleReference(root,target){
 let librarySize=0; const registry=JSON.parse(await fs.readFile(path.join(root,'data/cable-approved-results/registry.json'))), candidates=[];
 for(const e of Object.values(registry.byVisualKey)){
  if(e.status!=='APPROVED'||e.APPROVED_AS_REFERENCE!==true)continue; librarySize++;
  const dir=path.resolve(root,e.draftDir);if(!dir.startsWith(path.join(root,'data/cable-approved-results')+path.sep))throw Error('Invalid approved path');
  const image=await fs.readFile(path.join(dir,'image.png')),approval=JSON.parse(await fs.readFile(path.join(dir,'approval.json'))),group=JSON.parse(await fs.readFile(path.join(dir,'group.json')));
  if(approval.APPROVED_AS_REFERENCE!==true)continue;
  if(hash(image)!==e.sha256||approval.status!=='APPROVED'||approval.sha256!==e.sha256||approval.visualKey!==e.visualKey)throw Error('Approved reference integrity mismatch');
  const p=group.profile; if(!isCableReferenceCompatible(p,target))continue; let score=0;
  // Family preference applies only within compatible construction layers.
  const sameLayers=p.armor===target.armor && p.shield===target.shield && !!p.family?.includes('frls')===!!target.family?.includes('frls');
  if(sameLayers){
   if(p.family===target.family)score+=60;
   else if(p.productType===target.productType)score+=8;
  }
  // A single-core reference is preferable for single-core anatomy even if a
  // second reference must supply the common jacket/style separately.
  if(target.cores===1 && p.cores===1)score+=85;
for(const [field,weight]of Object.entries({geometry:12,hasOuterJacket:18,conductorMaterial:12,conductorConstruction:18,shield:target.shield ? 60 : 24,armor:20,cores:10,outerJacket:2}))if(p[field]===target[field])score+=weight;
  const fr=x=>x.family?.includes('frls')||x.specialElements?.some(s=>String(s).includes('fire'));if(fr(p)===fr(target))score+=30;
  const differences=Object.keys(target).filter(k=>JSON.stringify(target[k])!==JSON.stringify(p[k]));candidates.push({path:path.join(dir,'image.png'),sha256:e.sha256,visualKey:e.visualKey,profile:p,score,differences});
 }
 candidates.sort((a,b)=>b.score-a.score||a.visualKey.localeCompare(b.visualKey));if(!candidates.length)throw Error('No compatible manually APPROVED reference');return{...candidates[0],librarySize, compatibleReferenceCount:candidates.length,ranking:candidates.map(c=>({visualKey:c.visualKey,score:c.score}))};
}
