import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {it,expect} from 'vitest';
import {selectCableGenerationReferences} from './cableApprovedStyleReference.js';
import {digest} from './cableStyleBatch.js';
import {cableReferencePermission} from './cableReviewPolicy.js';
const profile={family:'vvg',cores:1,coreColors:['black'],visualizationType:'SIMPLE',geometry:'round',hasOuterJacket:true,conductorMaterial:'copper',conductorConstruction:'solid',shield:false,armor:false,specialElements:[]};
it('requires separate explicit reference approval and compatible anatomy',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reference-permissions-'));
 const dir=path.join(root,'data/cable-approved-results/example');
 await fs.mkdir(dir,{recursive:true});
 const png=Buffer.from('fixture-bytes'),sha=digest(png),key='example';
 await fs.writeFile(dir+'/image.png',png);
 await fs.writeFile(dir+'/group.json',JSON.stringify({profile,visualKey:key}));
 async function state(registryFlag,approvalFlag,status='APPROVED',reviewedRules){
  await fs.writeFile(path.join(root,'data/cable-approved-results/registry.json'),JSON.stringify({byVisualKey:{[key]:{status,visualKey:key,sha256:sha,profileHash:digest(profile),draftDir:'data/cable-approved-results/example',APPROVED_FOR_CATALOG:true,APPROVED_AS_REFERENCE:registryFlag}}}));
  await fs.writeFile(dir+'/approval.json',JSON.stringify({status,sha256:sha,visualKey:key,APPROVED_AS_REFERENCE:approvalFlag,reviewedRules}));
 }
 try{
  for(const [a,b]of [[false,false],[undefined,undefined],[true,false],[false,true]]){
   await state(a,b);await expect(selectCableGenerationReferences(root,profile)).resolves.toMatchObject({selected:[]});
  }
  await state(true,true,'READY_FOR_MANUAL_REVIEW');
  await expect(selectCableGenerationReferences(root,profile)).resolves.toMatchObject({selected:[]});
  await state(true,true,'APPROVED',{sha256:'older-rules'});
  expect((await selectCableGenerationReferences(root,profile)).selected[0].visualKey).toBe(key);
  await state(true,true);
  expect((await selectCableGenerationReferences(root,profile)).selected[0].visualKey).toBe(key);
  await expect(selectCableGenerationReferences(root,{...profile,cores:3})).resolves.toMatchObject({selected:[]});
  const shielded = await selectCableGenerationReferences(root,{...profile,shield:true});
  expect(shielded.selected.every(reference => reference.role === 'GEOMETRY_MATCH')).toBe(true);
  const tombstone = path.join(root, 'data/product-image-metadata/review-decisions', sha);
  await fs.mkdir(tombstone, { recursive: true });
  await fs.writeFile(path.join(tombstone, 'decision.json'), JSON.stringify({
    decision: {sha256: sha, status: 'REJECTED'}, previous: [],
  }));
  await expect(selectCableGenerationReferences(root, profile)).resolves.toMatchObject({selected: []});
  await fs.rm(tombstone, { recursive: true });
  await fs.writeFile(dir+'/group.json',JSON.stringify({profile:{...profile,family:'different'},visualKey:key}));
  await expect(selectCableGenerationReferences(root,profile)).rejects.toThrow('integrity mismatch');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

it('requires explicit consent for legacy approvals that granted both permissions together', () => {
  const entry = { sha256:'a'.repeat(64), visualKey:'key', profileHash:digest(profile), APPROVED_AS_REFERENCE:true };
  const approval = { APPROVED_AS_REFERENCE:true };
  const before = { catalog:null, reference:null, referenceScope:null };
  const after = { catalog:'APPROVED', reference:'ADDITIONAL', referenceScope:{
    visualKey:entry.visualKey, profileHash:entry.profileHash, APPROVED_AS_REFERENCE:true,
  } };
  const append = (events, details) => {
    const event = { sha256:entry.sha256, ...details };
    return [...events, { ...event, hash:digest(event) }];
  };
  const implicit = append([], {before,after});
  const permission = events => cableReferencePermission({ reviewBySha256:{ [entry.sha256]:events } }, entry, approval);
  expect(permission(implicit)).toBeNull();
  const explicit = append(implicit, {before:after, after, referenceExplicit:true});
  expect(permission(explicit)).toBe('ADDITIONAL');
  expect(permission(append(explicit, {before:after, after, undoOf:explicit.at(-1).hash}))).toBeNull();
  expect(permission(append([], {before,after:{...after,catalog:null}}))).toBe('ADDITIONAL');
});
