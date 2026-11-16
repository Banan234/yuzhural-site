import { exportCableReferenceGroups } from './lib/cableReferenceTransfer.js';
import { listGalleryReferenceGroups, describeGalleryReferenceGroup, updateGalleryReferenceGroup } from './lib/cableGalleryReferenceGroups.js';
import { prepareCableStyleRequest } from './lib/cableImageStyle.js';
import { galleryPlacement, placeGalleryImages, restoreGalleryImages } from './lib/cableGalleryPlacement.js';
import { digest } from './lib/cableStyleBatch.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildCableGallery, describeCableGalleryItem } from './lib/cableGallery.js';
import { commitGalleryReviews, exportGalleryReviews } from './lib/cableGalleryJournal.js';
import { readGalleryPng } from './lib/cableGalleryFiles.js';
import { runCableSkuImage } from './cableSkuImage.js';
import dotenv from 'dotenv';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const {values}=parseArgs({options:{port:{type:'string',default:'4177'},inventory:{type:'boolean'},archive:{type:'boolean'}}});
const fileCache = new Map();
const archive = Boolean(values.archive || values.inventory);
const rebuild = (queueEnabled = false) => buildCableGallery(root, { queueEnabled, fileCache, archive });
let library = await rebuild(Boolean(values.inventory));
const snapshot=()=>({items:library.items,stats:library.stats,families:library.families,work:library.work,archive});
if (values.inventory) {
  console.log(JSON.stringify({...snapshot(),queue:library.queue,held:library.held,
    unresolved:library.unresolved,integrity:library.issues},null,2));
  process.exit(0);
}
const port=Number(values.port);
if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('Choose a local port 1024–65535');
const origin='http://127.0.0.1:'+port;
const token=randomBytes(24).toString('hex');
const page=(await fs.readFile(new URL('./cable-gallery/index.html',import.meta.url),'utf8')).replace('LOCAL_WRITE_TOKEN',token);
const client=await fs.readFile(new URL('./cable-gallery/client.js',import.meta.url));
const assets = new Map(await Promise.all(['standards.html','standards.js','standards.css','references.html','references.js',
  'reference-review.html','reference-review.js'].map(async name => [
  name, (await fs.readFile(new URL('./cable-gallery/'+name,import.meta.url),'utf8')).replace('LOCAL_WRITE_TOKEN',token),
])));
let writing=false;
const server=createServer(async (req,res)=>{
  const send=(status,type,body)=>{
    res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'"}).end(body);
  };
  const json=(value,status=200)=>send(status,'application/json; charset=utf-8',JSON.stringify(value));
  try {
    if (req.headers.host!==new URL(origin).host) return json({error:'Invalid host'},403);
    const url=new URL(req.url,origin);
    if (req.method==='POST') {
      if (req.headers.origin!==origin || req.headers['x-gallery-token']!==token)
        return json({error:'Invalid local write token'},403);
      if (writing) return json({error:'Другое решение сохраняется. Повторите после завершения.'},409);
      writing=true;
      try {
        if (url.pathname==='/api/rescan') {
          fileCache.clear();
          library=await rebuild();
          return json(snapshot());
        }
        if (!['/api/reviews', '/api/import', '/api/placement', '/api/place-approved', '/api/approve-and-place', '/api/restore-placement', '/api/group-references', '/api/generate'].includes(url.pathname)) return json({error:'Действие не найдено.'},404);
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) return json({error:'Слишком большой JSON.'},413);
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks));
        if (url.pathname === '/api/generate') {
          const correction = body.retryFrom && library.files.get(body.retryFrom);
          const eligible = body.retryFrom
            ? correction && describeCableGalleryItem(library, correction).retrySku === body.sku
            : library.work.groups.some(group => group.sku === body.sku);
          if (archive || typeof body.sku !== 'string' || !eligible)
            return json({error:'Группа недоступна. Обновите рабочий список.'},409);
          dotenv.config({ path: path.join(root, '.env'), quiet: true });
          const result = await runCableSkuImage({
            root, sku: body.sku, generate: true, correctionSourceSha: body.retryFrom,
          });
          library = await rebuild();
          return json({ ...snapshot(), status: result.status,
            sha256: result.validation?.sha256 ?? result.sha256, reason: result.reason });
        }
        if (url.pathname === '/api/group-references') {
          await updateGalleryReferenceGroup(library,body);
          return json({saved:true});
        }
        if (url.pathname === '/api/placement') {
          const rows = galleryPlacement(library, body.rows);
          return json({ rows, hash:digest(rows), catalogRevision:library.catalogRevision });
        }
        if (url.pathname === '/api/place-approved') {
          if (archive) return json({error:'Откройте рабочую галерею.'},409);
          const patches = await placeGalleryImages(library, body);
          library = await rebuild();
          return json({ ...snapshot(), placed:patches.reduce((total,patch)=>total+patch.changes.length,0) });
        }
        if (url.pathname === '/api/restore-placement') {
          const patches = await restoreGalleryImages(library, body.rows);
          library = await rebuild();
          return json({ ...snapshot(), restored:patches.reduce((total, patch) => total+patch.changes.length,0) });
        }
        if (url.pathname === '/api/approve-and-place') {
          const rows = galleryPlacement(library, body.rows, { skipAmbiguous:true });
          const preview = body.preview ?? { rows, hash:digest(rows), catalogRevision:library.catalogRevision };
          if (preview.catalogRevision !== library.catalogRevision || preview.hash !== digest(rows))
            throw Error('Охват изменился. Обновите список изображений.');
          const changed = await commitGalleryReviews(library, { ...body, catalog:'APPROVED' }, { directApproval:true });
          let placed = 0, placementError;
          let placements = [];
          try {
            if (rows.some(row => row.skus.length)) {
              const patches = await placeGalleryImages(library, preview, { skipUnapproved:true });
              placed = patches.reduce((total,patch)=>total+patch.changes.length,0);
              placements = patches.map(patch=>({ sha256:patch.pngSha256, hash:digest(patch.changes) }));
            }
          } catch (error) {
            placementError = error.message;
          }
          library = await rebuild();
          return json({ ...snapshot(), changed, placed, placements, placementError,
            visualOnly:rows.map(row=>library.files.get(row.sha256)?.summary.visualApproval?.reason).filter(Boolean) });
        }
        const changed = await commitGalleryReviews(library, body, { importing: url.pathname === '/api/import' });
        if (changed) {
          try { library = await rebuild(); }
          catch (error) {return json({error:'Решение сохранено. Обновите инвентарь. '+error.message},409);}
        }
        return json({ ...snapshot(), changed });
      } finally {writing=false;}
    }
    if (req.method!=='GET') return json({error:'Method not allowed'},405);
    if(url.pathname==='/') return send(200,'text/html; charset=utf-8',page);
    if (url.pathname === '/reference-review') return send(200,'text/html; charset=utf-8',assets.get('reference-review.html'));
    if (url.pathname === '/reference-review.js') return send(200,'text/javascript; charset=utf-8',assets.get('reference-review.js'));
    if (url.pathname === '/api/reference-review') {
      if (library.references instanceof Error) throw library.references;
      const rows = new Map();
      for (const ref of library.references) {
        const item = library.files.get(ref.sha256);
        const source = item?.groups.find(({ dir, group }) =>
          path.join(dir, 'image.png') === ref.path && group.visualKey === ref.visualKey);
        if (!source) throw Error('В галерее отсутствует исходная запись PNG: ' + ref.sha256);
        const { group, request } = source;
        const sku = group.sku ?? group.catalogSource?.sku ?? request?.sku ?? request?.catalogSource?.sku;
        const member = sku ? group.members?.find(row => row.sku === sku) : group.members?.[0];
        const sourceSku = sku ?? member?.sku ?? null;
        if (!rows.has(ref.sha256)) rows.set(ref.sha256, {
          sha256:ref.sha256, bindings:item.summary.bindings, sources:[],
        });
        rows.get(ref.sha256).sources.push({
          sku:sourceSku, name:group.name ?? member?.name ?? library.catalog.get(sourceSku)?.product.name ?? null,
          visualKey:ref.visualKey, type:ref.profile.visualizationType, permission:ref.permission,
          preferredRole:ref.preferredRole, schematic:Boolean(ref.profile.schematicAssumptions),
          groupRepresentative:!sku && (group.members?.length ?? 0) > 1,
        });
      }
      return json({
        references:[...rows.values()].sort((a,b)=>String(a.sources[0].name).localeCompare(String(b.sources[0].name),'ru')),
        protected:Object.entries(library.style.references).map(([type,ref])=>({type,sha256:ref.sha256})),
      });
    }
    if (url.pathname === '/references') return send(200,'text/html; charset=utf-8',assets.get('references.html'));
    if (url.pathname === '/references.js') return send(200,'text/javascript; charset=utf-8',assets.get('references.js'));
    if (url.pathname === '/api/group-reference-export') {
      const query = url.searchParams;
      return json(await exportCableReferenceGroups(library,{family:query.get('family'),
        assignedOnly:query.get('assigned')==='1',since:query.get('since')},{preview:query.get('preview')==='1'}));
    }
    if (url.pathname === '/api/group-references') {
      const family = url.searchParams.get('family'), id = url.searchParams.get('id');
      if (!family) return json(library.families.map(({id,name})=>({id,name})));
      return json(id ? await describeGalleryReferenceGroup(library,family,id) : listGalleryReferenceGroups(library,family));
    }
    if(url.pathname==='/standards') return send(200,'text/html; charset=utf-8',assets.get('standards.html'));
    if(url.pathname==='/standards.js') return send(200,'text/javascript; charset=utf-8',assets.get('standards.js'));
    if(url.pathname==='/standards.css') return send(200,'text/css; charset=utf-8',assets.get('standards.css'));
    if(url.pathname==='/client.js') return send(200,'text/javascript; charset=utf-8',client);
    if (url.pathname === '/api/work-group') {
      const group = !archive && library.work.groups.find(row => row.sku === url.searchParams.get('sku'));
      if (!group) return json({error:'Обновите рабочий список. Группа недоступна.'},404);
      const products = group.skus.map(sku => ({ sku, name:library.catalog.get(sku).product.name }));
      const result = await runCableSkuImage({ root, sku:group.sku })
        .catch(error => ({ reason:error.message }));
      const choices = result.catalogAllowed
        ? [{ sha256:result.sha256, visualKey:result.visualKey }, ...result.alternatives].map(row => {
          const item = library.files.get(row.sha256);
          return { ...row, name:item?.name, count:item?.placement.find(scope => scope.visualKey === row.visualKey)?.skus.length ?? 0 };
        }) : [];
      return json({ products, choices, status:result.status, reason:result.reason });
    }
    if(url.pathname==='/api/inventory') return json(snapshot());
    if(url.pathname==='/api/export') return json(exportGalleryReviews(library.registry));
    if(url.pathname==='/api/issues') return json(library.issues);
    if(url.pathname==='/api/queue') {
      const report = await rebuild(true);
      return json({ queue: report.queue, held: report.held, unresolved: report.unresolved, issues: report.issues });
    }
    const match=/^\/(api\/item|api\/reference-choices|png)\/([a-f0-9]{64})$/u.exec(url.pathname);
    const item=match && library.files.get(match[2]);
    if(!item) return json({error:'PNG не найден'},404);
    if (match[1]==='api/reference-choices') {
      const scope = item.scopes.find(row => row.visualKey === item.visualKey);
      if (!scope) return json({ primary:[], geometry:[] });
      const request = await prepareCableStyleRequest(root, scope.profile);
      return json(request.referenceSelection?.choices ?? { primary:[], geometry:[] });
    }
    if(match[1]==='api/item') return json(describeCableGalleryItem(library,item));
    return send(200,'image/png',await readGalleryPng(library.root,item));
  } catch(error) {return json({error:error.message},400);}
});
server.listen(port,'127.0.0.1',()=>console.log(origin+' · '+JSON.stringify(library.stats)));
