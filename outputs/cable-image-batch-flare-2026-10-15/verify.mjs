import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import {getGeneratedProductImage} from '../../shared/productImages.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const read=async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'));
const run=JSON.parse(await fs.readFile(path.join(dir,'run.json'),'utf8'));
const initial=JSON.parse(await fs.readFile(path.join(dir,'baseline/hashes.json'),'utf8'));
const originalManifest=JSON.parse(await fs.readFile(path.join(dir,'baseline/generatedProductImages.json'),'utf8'));
for(const file of ['data/catalog-current/products.json','public/product-images/generated/YU-0000815-dd57341d425b.png'])
 if(createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')!==initial[file])throw new Error(`Protected original changed: ${file}`);
const products=await read('data/catalog-current/products.json'),manifest=await read('shared/generatedProductImages.json');
const productBySku=new Map(products.map(p=>[p.sku,p]));
const records=await Promise.all((await fs.readdir(path.join(root,'data/product-image-metadata/groups'))).filter(n=>n.endsWith('.json')).map(n=>read(`data/product-image-metadata/groups/${n}`)));
const linked=new Set(), mapping=[];
for(const record of records){
 if(!['approved','needs_review'].includes(record.status))continue;
 const bytes=await fs.readFile(path.join(root,record.output_filename));
 if(createHash('sha256').update(bytes).digest('hex')!==record.validation.sha256)throw new Error(`Checksum mismatch: ${record.visualKey}`);
 if(record.status==='approved')for(const member of record.products.filter(p=>p.binding_allowed)){
  const product=productBySku.get(member.sku),entry=manifest.bySku[member.sku];
  if(!product||getGeneratedProductImage(product,manifest)!==record.public_url||entry.section!==member.parameters.section||entry.cores!==member.parameters.cores||entry.sha256!==record.validation.sha256)throw new Error(`Broken binding: ${member.sku}`);
  linked.add(member.sku);
 }
 mapping.push({visualKey:record.visualKey,image:record.output_filename,status:record.status,cores:record.cores,family:record.family,model:record.model,template:record.template_version,retainedExistingStyle:!!record.retained_existing_style,products:record.products.map(p=>({sku:p.sku,name:p.product_name,section:p.section,groundSection:p.groundSection})),validation:record.validation});
}
if(manifest.bySku['YU-0000815'].image!==originalManifest.bySku['YU-0000815'].image)throw new Error('Original approved image binding changed');
const secret=dotenv.parse(await fs.readFile(path.join(root,'.env'))).IMAGE_API_KEY;
const scan=['shared/generatedProductImages.json','data/cableImageConfig.json','scripts/lib/cableImageSpec.js','scripts/lib/cableImagePipeline.js','scripts/lib/cableImageProvider.js','scripts/lib/cableImagePng.js','scripts/generateCableImages.js',path.relative(root,path.join(dir,'run.json')),path.relative(root,path.join(dir,'progress.jsonl'))];
for(const file of scan)if(secret&&(await fs.readFile(path.join(root,file))).includes(Buffer.from(secret)))throw new Error(`Secret leaked outside local env: ${file}`);
const result={Generated:run.results.filter(r=>r.action==='generate'&&r.status==='needs_review').length,'Reused existing':run.results.filter(r=>r.action==='reuse'&&r.status==='approved').length,Failed:run.results.filter(r=>r.status==='failed').length,'Total visual groups':run.summary.unique_visual_groups,'Products linked':linked.size,ApiRequests:run.summary.api_requests_executed,PendingReview:records.filter(r=>r.status==='needs_review').length,UnsupportedSkus:run.summary.unsupported_skus,CatalogAndOriginalImageUnchanged:true,SecretScanPassed:true};
await fs.writeFile(path.join(dir,'verification.json'),JSON.stringify(result,null,2)+'\n');
await fs.writeFile(path.join(dir,'mapping.json'),JSON.stringify(mapping,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
