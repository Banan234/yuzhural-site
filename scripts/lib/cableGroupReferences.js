import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { cableFamilyScope } from './cableVisualClassification.js';
import { cableReferenceLayoutId, cableVisibleConstructionKey, cableSharedVisualKey } from './cableReferenceCompatibility.js';
import { cableGenerationClaimKey } from './cableGenerationClaims.js';

const fileFor = root => path.join(root, 'data/cable-approved-results/group-references.json');
const sha = /^[a-f0-9]{64}$/u;
const empty = { primary:'', geometry:'' };

export { cableReferenceLayoutId };

export function cableReferenceGroupId(profile, { familyLocal = false } = {}) {
  const family = cableFamilyScope(profile?.family);
  if (!family) return null;
  const shared = !familyLocal && cableSharedVisualKey(profile);
  const identity = (shared ? JSON.stringify(['shared',shared]) : cableVisibleConstructionKey(profile,{planning:true})) ??
    JSON.stringify([family,cableGenerationClaimKey(profile),cableReferenceLayoutId(profile)]);
  return createHash('sha256').update(identity).digest('hex');
}

export async function readCableGroupReferences(root) {
  const data = await fs.readFile(fileFor(root),'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return { groups:{} };
    throw error;
  });
  if (!data.groups || typeof data.groups !== 'object' || Array.isArray(data.groups))
    throw Error('Неверный формат назначений референсов.');
  return data.groups;
}

export async function cableGroupReferenceChoices(root, profile) {
  const id = cableReferenceGroupId(profile);
  const assignment = id ? (await readCableGroupReferences(root))[id] : null;
  if (assignment?.conflicts?.length)
    throw Error('NEEDS_REVIEW: конфликт ручных референсов. Выберите вариант в галерее группы.');
  return assignment ?? null;
}

export async function saveCableGroupReferences(root, id, choices, previous, validate) {
  if (!sha.test(id) || !choices || ['primary','geometry'].some(role =>
      typeof choices[role] !== 'string' || (choices[role] && !sha.test(choices[role]))))
    throw Error('Выберите утверждённый PNG для каждой назначаемой роли.');
  return updateCableGroupReferences(root, async groups=>{
    const current = groups[id] ?? empty;
    if (!previous || previous.primary !== current.primary || previous.geometry !== current.geometry ||
        JSON.stringify(previous.conflicts ?? []) !== JSON.stringify(current.conflicts ?? []))
      throw Error('Назначение изменилось. Откройте группу заново.');
    const {primary,geometry} = choices;
    if (current.conflicts?.length && !primary && !geometry)
      throw Error('Выберите референсы для разрешения конфликта.');
    if (primary || geometry) {
      await validate({primary,geometry});
      if (current.primary === primary && current.geometry === geometry) return;
      groups[id] = { primary,geometry, updatedAt:new Date().toISOString(),
        ...((current.conflicts || current.alternatives) && { alternatives:current.conflicts ?? current.alternatives }) };
    } else delete groups[id];
  });
}

async function updateCableGroupReferences(root, update) {
  const file = fileFor(root);
  const lockPath = file+'.lock';
  const lock = await fs.open(lockPath,'wx').catch(error => {
    if (error.code === 'EEXIST') throw Error('Назначения обновляются. Повторите сохранение.');
    throw error;
  });
  const temp = file+'.'+randomUUID()+'.tmp';
  try {
    const groups = await readCableGroupReferences(root);
    await update(groups);
    await fs.writeFile(temp,JSON.stringify({groups},null,2)+'\n',{flag:'wx'});
    await fs.rename(temp,file);
  } finally {
    await fs.rm(temp,{force:true});
    await lock.close();
    await fs.unlink(lockPath);
  }
}


/** Move existing assignments to the recomputed groups, keeping each conflicting option. */
export async function migrateCableGroupReferences(root, redirects) {
  return updateCableGroupReferences(root, groups=>{
    const merged = new Map();
    for (const [id,entry] of Object.entries(groups)) {
      const targets = redirects.get(id) ?? [id];
      for (const target of targets) {
        if (!merged.has(target)) merged.set(target,[]);
        merged.get(target).push({id,entry});
      }
    }
    const next = {};
    for (const [id,sources] of merged) {
      if (sources.length===1) { next[id]=sources[0].entry; continue; }
      const variants = sources.flatMap(({id:sourceGroupId,entry})=>entry.conflicts ??
        [{sourceGroupId,primary:entry.primary,geometry:entry.geometry,updatedAt:entry.updatedAt}]);
      const unique = new Set(variants.map(v=>JSON.stringify([v.primary,v.geometry])));
      const latest = variants.reduce((value,v)=>v.updatedAt > value ? v.updatedAt : value,'');
      next[id] = unique.size===1 ? {...sources[0].entry, ...(latest && {updatedAt:latest})} :
        {...empty,updatedAt:new Date().toISOString(),conflicts:variants};
    }
    for (const id of Object.keys(groups)) delete groups[id];
    Object.assign(groups,next);
  });
}
