import fs from 'node:fs/promises';
import path from 'node:path';
import { galleryReferenceGroups, updateGalleryReferenceGroup } from './cableGalleryReferenceGroups.js';
import { readCableGroupReferences } from './cableGroupReferences.js';
import { loadApprovedStyleReferences } from './cableApprovedStyleReference.js';
import { prepareCableStyleRequest } from './cableImageStyle.js';
import { digest } from './cableStyleBatch.js';

const formatVersion = 'cable-group-references-1';
const roles = { primary:'FAMILY_PRIMARY', geometry:'GEOMETRY_MATCH' };
const empty = {primary:'',geometry:''};
const same = (a,b) => Object.keys(roles).every(role=>(a?.[role] ?? '')===(b?.[role] ?? ''));
const keys = group => group.skus.map(({sku})=>sku).sort();

export async function exportCableReferenceGroups(library, {family, assignedOnly, since}, {preview=false}={}) {
  const exportedAt = new Date().toISOString();
  if (since && !Number.isFinite(Date.parse(since))) throw Error('Некорректная дата экспорта.');
  const {root} = library;
  const saved = await readCableGroupReferences(root);
  const groups = [...galleryReferenceGroups(library,family).values()].filter(({id})=>
    (!(assignedOnly || since) || saved[id]) && (!since || !saved[id]?.updatedAt || saved[id].updatedAt > since));
  const counts = { groups:groups.length, skus:groups.reduce((total,group)=>total+group.skus.length,0),
    assigned:Object.keys(saved).length };
  if (preview) return counts;
  const approved = groups.some(group=>saved[group.id]) ? await loadApprovedStyleReferences(root) : [];
  const references = new Map(approved.map(row=>[row.sha256,row]));
  const result = groups.map(group=>{
    const current = saved[group.id];
    const row = {family:group.family,groupId:group.id,skus:keys(group),updatedAt:current?.updatedAt ?? null, ...(current?.conflicts && {conflicts:current.conflicts})};
    for (const [role, label] of Object.entries(roles)) {
      const sha256 = current?.[role];
      row[role] = null;
      if (!sha256) continue;
      const image = references.get(sha256);
      if (!image) throw Error('Назначенный PNG недоступен для экспорта: '+sha256);
      row[role] = {imageId:sha256,sha256,path:path.relative(root,image.path),role:label};
    }
    return row;
  });
  return {formatVersion,exportedAt,groups:result};
}

export async function importCableReferenceGroups(library, snapshot, {apply=false, replaceConflicts=false}={}) {
  if (snapshot?.formatVersion!==formatVersion || !Array.isArray(snapshot.groups))
    throw Error('Неподдерживаемый формат снимка назначений.');
  const report = {mode:apply?'apply':'dry-run',imported:[], wouldImport:[], skipped:[], conflicts:[], errors:[]};
  const groups = galleryReferenceGroups(library);
  const saved = await readCableGroupReferences(library.root);
  const approved = new Map((await loadApprovedStyleReferences(library.root)).map(row=>[row.sha256,row]));
  const duplicates = new Set();
  const seen = new Set();
  for (const row of snapshot.groups) {
    if (seen.has(row?.groupId)) duplicates.add(row?.groupId);
    seen.add(row?.groupId);
  }
  for (const row of snapshot.groups) {
    const id = row?.groupId;
    try {
      if (duplicates.has(id)) throw Error('Группа повторяется в снимке.');
      const group = groups.get(id);
      if (!group || group.family!==row.family || !Array.isArray(row.skus) ||
          digest(keys(group))!==digest([...row.skus].sort()))
        throw Error('Семейство, группа или состав SKU отличается от текущего каталога.');
      if (row.conflicts?.length || saved[id]?.conflicts?.length) {
        report.conflicts.push({id,family:group.family,current:saved[id],incoming:row});
        continue;
      }
      const choices = {...empty};
      for (const [role,label] of Object.entries(roles)) {
        const image = row[role];
        if (image === null) continue;
        const entry = approved.get(image?.sha256);
        if (!entry || image.imageId!==image.sha256 || image.role!==label ||
            image.path!==path.relative(library.root,entry.path) ||
            digest(await fs.readFile(entry.path))!==image.sha256)
          throw Error('PNG, SHA-256 или право использования не подтверждены для роли '+label+'.');
        choices[role] = image.sha256;
      }
      if (!choices.primary && !choices.geometry) { report.skipped.push({id,reason:'Группа без назначения'}); continue; }
      const previous = saved[id] ?? empty;
      if (same(previous,choices)) { report.skipped.push({id,reason:'Назначение уже совпадает'}); continue; }
      for (const profile of group.profiles.values())
        await prepareCableStyleRequest(library.root,profile,{referenceChoices:choices});
      if ((previous.primary || previous.geometry) && !replaceConflicts) {
        report.conflicts.push({id,family:group.family,current:{primary:previous.primary,geometry:previous.geometry}, incoming:choices});
        continue;
      }
      if (apply) {
        await updateGalleryReferenceGroup(library,{family:group.family,id,choices,previous});
        report.imported.push(id);
      } else report.wouldImport.push(id);
    } catch (error) { report.errors.push({id,error:error.message}); }
  }
  return report;
}
