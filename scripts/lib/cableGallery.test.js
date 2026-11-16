import { galleryPlacement, placeGalleryImages, restoreGalleryImages } from './cableGalleryPlacement.js';
import { galleryPngLocations } from './cableGalleryFiles.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import { createImageProvider } from './cableImageProvider.js';
import { buildCableGallery, describeCableGalleryItem, saveCableGalleryAction } from './cableGallery.js';
import { catalogCableSpecs, writeCatalogImageFixture } from './fixtures/cableCatalogFixture.js';
import { readCableCatalogProfile } from './cableCatalogProfile.js';
import { prepareCableStyleRequest } from './cableImageStyle.js';
import { commitGalleryReviews, exportGalleryReviews, galleryRevision } from './cableGalleryJournal.js';
import { loadApprovedStyleReferences } from './cableApprovedStyleReference.js';
import { digest } from './cableStyleBatch.js';

const project=fileURLToPath(new URL('../..',import.meta.url));
test('gallery review persists by SHA, changes reuse without binding, and records reference permissions independently',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cable-gallery-'));
  try {
    for (const dir of ['assets','shared','data/cable-approved-results','outputs/cable-draft','public/product-images/generated','data/product-image-metadata'])
      await fs.mkdir(path.join(root,dir),{recursive:true});
    await fs.cp(path.join(project,'assets/cable-style-reference'),path.join(root,'assets/cable-style-reference'),{recursive:true});
    await fs.copyFile(path.join(project,'cable-image-style.json'),path.join(root,'cable-image-style.json'));
    const bindings=JSON.stringify({bySku:{}},null,2)+'\n';
    await fs.writeFile(path.join(root,'shared/generatedProductImages.json'),bindings);
    await fs.writeFile(path.join(root,'data/cable-approved-results/registry.json'),JSON.stringify({byVisualKey:{}}));
    const product={id:1,sku:'TEST-A',slug:'test-a',name:'ВВГ 2х1.5',mark:'ВВГ',markFamily:'ВВГ',
      catalogSection:'Кабель и провод',catalogSectionSlug:'kabel-i-provod',cores:2,crossSection:1.5,price:100,stock:10,unit:'м',specs:catalogCableSpecs};
    const other={...product,id:2,sku:'TEST-B',slug:'test-b',name:'ВВГ 2х2.5',crossSection:2.5};
    await writeCatalogImageFixture(root,[product,other]);
    const catalog=readCableCatalogProfile(product);
    const png=await fs.readFile(path.join(project,'assets/cable-style-reference/simple.png'));
    // JPEG-free PNG test fixture derived from a protected source but distinct by SHA.
    const { PNG }=await import('pngjs');
    const decoded=PNG.sync.read(png);
    const draft=PNG.sync.write(decoded);
    const sha=digest(draft);
    const request=await prepareCableStyleRequest(root,catalog.profile);
    await fs.writeFile(path.join(root,'outputs/cable-draft/image.png'),draft);
    await fs.writeFile(path.join(root,'outputs/cable-draft/group.json'),JSON.stringify({
      profile:catalog.profile,visualKey:catalog.visualKey,standardVersion:request.standardVersion,status:'NEEDS_REVIEW',
      members:[{sku:product.sku,name:product.name,productHash:digest(product),oldBinding:null}],
    }));
    await fs.writeFile(path.join(root,'outputs/cable-draft/request.json'),JSON.stringify(request));
    let library=await buildCableGallery(root);
    let item=library.files.get(sha);
    let view=describeCableGalleryItem(library,item);
    expect(view.canApprove).toBe(true);
    expect(view.compatibleCandidates).toEqual(['TEST-A','TEST-B']);
    const base={reviewer:'Fixture',revision:view.revision};
    await expect(saveCableGalleryAction(library,item,{...base,action:'APPROVE',checks:{},catalog:true}))
      .rejects.toThrow(/manual checks/);
    await fs.writeFile(path.join(root,'outputs/cable-draft/image.png'),png);
    await expect(saveCableGalleryAction(library,item,{...base,action:'NEEDS_CORRECTION',note:'Fixture'}))
      .rejects.toThrow(/PNG изменился/);
    await fs.writeFile(path.join(root,'outputs/cable-draft/image.png'),draft);
    const registryFile = path.join(root,'data/cable-approved-results/registry.json');
    const originalRegistry = await fs.readFile(registryFile);
    const row = { sha256: sha, revision: view.reviewRevision, visualKey: catalog.visualKey,
      checks: Object.fromEntries(view.requirements.required.map(key => [key, true])) };
    await expect(commitGalleryReviews(library, { reviewer:'Fixture', catalog:'APPROVED',
      rows:[{ ...row, checks:{} }] })).rejects.toThrow(/manual checks/);
    const scopes = item.scopes;
    item.scopes = [];
    const unconfirmedRows = galleryPlacement(library,[row]);
    const unconfirmedPreview = {rows:unconfirmedRows,hash:digest(unconfirmedRows),catalogRevision:library.catalogRevision};
    expect(await commitGalleryReviews(library,{reviewer:'Fixture',catalog:'APPROVED',rows:[{...row,revision:galleryRevision(item),checks:undefined}]},
      {directApproval:true})).toBe(1);
    expect(await placeGalleryImages(library,unconfirmedPreview,{skipUnapproved:true})).toEqual([]);
    const visual = await buildCableGallery(root,{queueEnabled:false});
    expect(visual.files.get(sha).summary).toMatchObject({status:'APPROVED',catalogStatus:'UNDECIDED',
      visualApproval:{status:'APPROVED'},referenceAllowed:false});
    expect(visual.registry.byVisualKey[catalog.visualKey]).toBeUndefined();
    expect(digest(await fs.readFile(path.join(root,'data/product-image-metadata/review-decisions',sha,'image.png')))).toBe(sha);
    await commitGalleryReviews(visual,{reviewer:'Fixture',undo:true,
      rows:[{...row,revision:visual.files.get(sha).summary.reviewRevision}]});
    const undone = await buildCableGallery(root,{queueEnabled:false});
    expect(undone.files.get(sha).summary.visualApproval).toBeNull();
    await fs.writeFile(registryFile,originalRegistry);
    item.scopes = scopes;
    expect(await commitGalleryReviews(library, { reviewer:'Fixture', catalog:'APPROVED',
      rows:[{...row,checks:undefined}] },{directApproval:true})).toBe(1);
    let journal = await buildCableGallery(root, {queueEnabled:false});
    expect(journal.files.get(sha).summary.catalogStatus).toBe('APPROVED');
    expect(journal.registry.byVisualKey[catalog.visualKey].APPROVED_FOR_CATALOG).toBe(true);
    expect(journal.registry.byVisualKey[catalog.visualKey].APPROVED_AS_REFERENCE).toBe(false);
    expect(await loadApprovedStyleReferences(root)).toEqual([]);
    expect((await prepareCableStyleRequest(root,catalog.profile)).referenceInputs).toHaveLength(1);
    await commitGalleryReviews(journal, { reviewer:'Fixture', reference:'PRIMARY', preferReferenceRole:true,
      rows:[{...row,revision:journal.files.get(sha).summary.reviewRevision}] });
    journal = await buildCableGallery(root, {queueEnabled:false});
    const backup = exportGalleryReviews(journal.registry);
    expect((await loadApprovedStyleReferences(root))[0]).toMatchObject({permission:'PRIMARY',preferredRole:'FAMILY_PRIMARY'});
    const planned = await prepareCableStyleRequest(root, catalog.profile);
    expect(planned.config.additionalReferenceImages.map(ref => ref.sha256)).toContain(sha);
    const fetchImpl = vi.fn();
    const provider = createImageProvider(planned.config, { env:{ IMAGE_API_KEY:'fixture' }, fetchImpl });
    await expect(commitGalleryReviews(journal, { reviewer:'Fixture', reference:'DENIED', rows:[row] }))
      .rejects.toThrow('Решение изменилось');
    await commitGalleryReviews(journal, { reviewer:'Fixture',catalog:'NEEDS_CORRECTION',resolve:true, correction:{reason:'Расположение жил'},
      rows:[{...row,revision:journal.files.get(sha).summary.reviewRevision}] });
    expect(await loadApprovedStyleReferences(root)).toEqual([]);
    await expect(provider.generate({ prompt:'fixture' })).rejects.toThrow(/permission changed/);
    expect(fetchImpl).not.toHaveBeenCalled();
    journal = await buildCableGallery(root, {queueEnabled:false});
    expect(journal.files.get(sha).journal.at(-1).after.correction).toMatchObject({reason:'Расположение жил'});
    await expect(commitGalleryReviews(journal, backup, {importing:true})).rejects.toThrow(/устарел/);
    await commitGalleryReviews(journal, { reviewer:'Fixture', undo:true,
      rows:[{...row,revision:journal.files.get(sha).summary.reviewRevision}] });
    expect((await loadApprovedStyleReferences(root))[0]).toMatchObject({permission:'PRIMARY',preferredRole:'FAMILY_PRIMARY'});
    journal = await buildCableGallery(root, {queueEnabled:false});
    const placementRows = galleryPlacement(journal, [row]);
    expect(placementRows[0].skus).toEqual(['TEST-A','TEST-B']);
    expect(journal.families).toContainEqual(expect.objectContaining({id:'vvg',total:2,covered:0,expected:2}));
    const preview = {rows:placementRows,hash:digest(placementRows),catalogRevision:journal.catalogRevision};
    const [patch] = await placeGalleryImages(journal, preview);
    expect(patch.changes.map(change=>change.sku)).toEqual(['TEST-A','TEST-B']);
    const published = await buildCableGallery(root, {queueEnabled:false});
    expect(published.families[0].covered).toBe(2);
    expect(published.files.get(sha).summary.canRestore).toBe(true);
    await expect(placeGalleryImages(published, preview)).rejects.toThrow(/Охват изменился/);
    await expect(commitGalleryReviews(published, {reviewer:'Fixture',undo:true,
      rows:[{...row,revision:published.files.get(sha).summary.reviewRevision}]})).rejects.toThrow(/используется в каталоге/);
    const undoRow = { ...row, placementHash:digest(patch.changes), head:published.files.get(sha).summary.journalHead };
    await expect(restoreGalleryImages(published,[{...undoRow,placementHash:'superseded'}])).rejects.toThrow(/новые привязки/);
    await expect(restoreGalleryImages(published,[{...undoRow,head:'superseded'}])).rejects.toThrow(/новые решения/);
    const [restored] = await restoreGalleryImages(published,[undoRow]);
    expect(restored.changes).toHaveLength(2);
    journal = await buildCableGallery(root, {queueEnabled:false});
    expect(journal.families[0].covered).toBe(0);
    expect(journal.files.get(sha).summary.canRestore).toBe(false);
    expect(journal.files.get(sha).summary.catalogStatus).toBe('APPROVED');
    await fs.writeFile(registryFile, originalRegistry);

    await saveCableGalleryAction(library,item,{...base,action:'APPROVE',catalog:true,
      checks:Object.fromEntries(view.requirements.required.map(key=>[key,true]))});
    library=await buildCableGallery(root);
    item=library.files.get(sha);
    view=describeCableGalleryItem(library,item);
    expect(view.status).toBe('APPROVED');
    expect(library.stats.reuseSku).toBe(2);
    expect(library.stats.missingProfiles).toBe(0);
    expect(library.stats.coveredSku).toBe(0);
    await saveCableGalleryAction(library,item,{reviewer:'Fixture',revision:view.revision,action:'ALLOW_REFERENCE'});
    library=await buildCableGallery(root);
    expect(library.files.get(sha).referenceAllowed).toBe(true);
    item=library.files.get(sha);
    view=describeCableGalleryItem(library,item);
    await saveCableGalleryAction(library,item,{reviewer:'Fixture',revision:view.revision,action:'DENY_REFERENCE'});
    library=await buildCableGallery(root);
    expect(library.files.get(sha).referenceAllowed).toBe(false);
    expect(library.files.get(sha).history.filter(row=>typeof row.enabled==='boolean').map(row=>row.enabled)).toEqual([true,false]);
    expect(await fs.readFile(path.join(root,'shared/generatedProductImages.json'),'utf8')).toBe(bindings);
  } finally {await fs.rm(root,{recursive:true,force:true});}
},25000);

test('gallery skips report screenshots while retaining draft and catalog PNG paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-gallery-paths-'));
  const paths = [
    'outputs/cable-review/catalog-1.png',
    'outputs/cable-review/gallery-dark.png',
    'outputs/cable-review/qa-screen-3.png',
    'outputs/cable-review/image.png',
    'outputs/cable-review/variant-A.png',
    'outputs/cable-review/white.png',
    'public/product-images/generated/catalog-1.png',
  ];
  try {
    for (const file of paths) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), '');
    }
    const found = [];
    for await (const location of galleryPngLocations(root, [], new Set())) found.push(location.file);
    expect(found.sort()).toEqual(paths.slice(3).sort());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
