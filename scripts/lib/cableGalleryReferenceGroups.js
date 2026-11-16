import fs from 'node:fs/promises';
import path from 'node:path';
import { cableFamilyScope } from './cableVisualClassification.js';
import { cableReferenceGroupId, readCableGroupReferences, saveCableGroupReferences } from './cableGroupReferences.js';
import { prepareCableStyleRequest } from './cableImageStyle.js';
import { digest } from './cableStyleBatch.js';

export function galleryReferenceGroups(library, family) {
  const groups = new Map();
  for (const { product, profile, visualKey, issues } of library.catalog.values()) {
    const familyId = cableFamilyScope(profile?.family);
    if (!visualKey || issues.length || !familyId || !library.listed.has(product.sku)) continue;
    const id = cableReferenceGroupId(profile);
    if (!groups.has(id)) {
      groups.set(id,{id, family:familyId, name:product.name, skus:[], families:new Set(), profiles:new Map()});
    }
    const group = groups.get(id);
    if (familyId === family && !group.families.has(familyId)) group.name = product.name;
    group.families.add(familyId);
    group.skus.push({sku:product.sku,name:product.name});
    group.profiles.set(digest(profile),profile);
  }
  if (family) for (const [id,group] of groups) if (!group.families.has(family)) groups.delete(id);
  return groups;
}

export function listGalleryReferenceGroups(library, family) {
  const coveredSkus = new Set([...library.files.values()].flatMap(item=>item.bindings));
  return [...galleryReferenceGroups(library,family).values()]
    .filter(({skus})=>skus.some(({sku})=>!coveredSkus.has(sku)))
    .map(({id,name,skus})=>({id,name,count:skus.length}))
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,'ru'));
}

export async function describeGalleryReferenceGroup(library, family, id) {
  const group = galleryReferenceGroups(library,family).get(id);
  if (!group) throw Error('Визуальная группа отсутствует в актуальном каталоге.');
  const [saved, choices] = await Promise.all([
    readCableGroupReferences(library.root),
    Promise.all([...group.profiles.values()].map(profile=>prepareCableStyleRequest(library.root,profile,
      { referenceChoices:{} }).then(request=>request.referenceSelection?.groupChoices ?? {},()=>({})))),
  ]);
  const references = Object.fromEntries(['primary','geometry'].map(role=>[role,(choices[0]?.[role] ?? [])
    .filter(sha=>choices.every(choice=>choice[role]?.includes(sha)))
    .flatMap(sha=>{
      const item = library.files.get(sha)?.summary;
      return item ? [{sha,name:item.name,family:item.familyId}] : [];
    })]));
  return { id, name:group.name, skus:group.skus, references, assignment:saved[id] ?? {primary:'',geometry:''} };
}

export async function updateGalleryReferenceGroup(library, {family,id,choices,previous}) {
  const group = galleryReferenceGroups(library,family).get(id);
  if (!group) throw Error('Визуальная группа отсутствует в актуальном каталоге.');
  const current = JSON.parse(await fs.readFile(path.join(library.root,'data/catalog-current/products.json'),'utf8'));
  if (digest(current) !== library.referenceCatalogHash)
    throw Error('Каталог изменился. Обновите галерею и выберите группу заново.');
  await saveCableGroupReferences(library.root,id,choices,previous,async preferred=>{
    for (const profile of group.profiles.values())
      await prepareCableStyleRequest(library.root,profile,{referenceChoices:preferred});
  });
}
