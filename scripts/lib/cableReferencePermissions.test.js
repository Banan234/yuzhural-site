import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {it,expect} from 'vitest';
import {selectApprovedStyleReference} from './cableApprovedStyleReference.js';
import {digest} from './cableStyleBatch.js';
const profile={family:'vvg',cores:1,geometry:'round',hasOuterJacket:true,conductorMaterial:'copper',conductorConstruction:'solid',shield:false,armor:false,specialElements:[]};
it('requires separate explicit reference approval and compatible anatomy',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reference-permissions-'));
 const dir=path.join(root,'data/cable-approved-results/example');
 await fs.mkdir(dir,{recursive:true});
 const png=Buffer.from('fixture-bytes'),sha=digest(png),key='example';
 await fs.writeFile(dir+'/image.png',png);
 await fs.writeFile(dir+'/group.json',JSON.stringify({profile}));
 async function state(registryFlag,approvalFlag,status='APPROVED'){
  await fs.writeFile(path.join(root,'data/cable-approved-results/registry.json'),JSON.stringify({byVisualKey:{[key]:{status,visualKey:key,sha256:sha,draftDir:'data/cable-approved-results/example',APPROVED_FOR_CATALOG:true,APPROVED_AS_REFERENCE:registryFlag}}}));
  await fs.writeFile(dir+'/approval.json',JSON.stringify({status,sha256:sha,visualKey:key,APPROVED_AS_REFERENCE:approvalFlag}));
 }
 try{
  for(const [a,b]of [[false,false],[undefined,undefined],[true,false],[false,true]]){
   await state(a,b);await expect(selectApprovedStyleReference(root,profile)).rejects.toThrow('No compatible');
  }
  await state(true,true,'READY_FOR_MANUAL_REVIEW');
  await expect(selectApprovedStyleReference(root,profile)).rejects.toThrow('No compatible');
  await state(true,true);
  expect((await selectApprovedStyleReference(root,profile)).visualKey).toBe(key);
  await expect(selectApprovedStyleReference(root,{...profile,cores:3})).rejects.toThrow('No compatible');
  await expect(selectApprovedStyleReference(root,{...profile,shield:true})).rejects.toThrow('No compatible');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
