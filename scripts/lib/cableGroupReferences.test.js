import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect,test} from 'vitest';
import {cableGroupReferenceChoices,cableReferenceGroupId,migrateCableGroupReferences,readCableGroupReferences,saveCableGroupReferences} from './cableGroupReferences.js';

test('migrates conflicting manual references without choosing one and keeps both after resolution',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cable-reference-conflict-'));
  try {
    const dir=path.join(root,'data/cable-approved-results');
    await fs.mkdir(dir,{recursive:true});
    const profile={family:'КВВГ',visualizationType:'SIMPLE',geometry:'round',cores:2,
      hasOuterJacket:true,conductorMaterial:'copper',conductorConstruction:'solid',
      conductorShape:'circular',coreColors:['brown','blue'],armor:false,shield:false,specialElements:[]};
    const id=cableReferenceGroupId(profile);
    const old=['1'.repeat(64),'2'.repeat(64)], refs=['a'.repeat(64),'b'.repeat(64)];
    await fs.writeFile(path.join(dir,'group-references.json'),JSON.stringify({groups:{
      [old[0]]:{primary:refs[0],geometry:''},
      [old[1]]:{primary:refs[1],geometry:''},
    }}));
    await migrateCableGroupReferences(root,new Map(old.map(key=>[key,[id]])));
    const current=(await readCableGroupReferences(root))[id];
    expect(current.conflicts.map(x=>x.primary)).toEqual(refs);
    await expect(cableGroupReferenceChoices(root,profile)).rejects.toThrow(/конфликт ручных/);
    await saveCableGroupReferences(root,id,{primary:refs[1],geometry:''},current,async()=>{});
    const saved=await cableGroupReferenceChoices(root,profile);
    expect(saved.primary).toBe(refs[1]);
    expect(saved.alternatives.map(x=>x.primary)).toEqual(refs);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
