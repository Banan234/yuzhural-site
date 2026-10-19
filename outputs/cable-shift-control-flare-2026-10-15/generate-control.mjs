import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import {createImageProvider} from '../../scripts/lib/cableImageProvider.js';
import {validateCableImagePng} from '../../scripts/lib/cableImagePng.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
const env=dotenv.parse(await fs.readFile(path.join(root,'.env')));
const config={...JSON.parse(await fs.readFile(path.join(root,'data/cableImageConfig.json'))),
  provider:'codex-sale',apiBaseUrl:'https://codex.sale/v1',apiKeyEnv:'IMAGE_API_KEY',
  model:'gpt-image-2.5-flare',imageEndpoint:'edits',
  referenceImage:path.join(root,'public/product-images/generated/YU-0000815-dd57341d425b.png'),
  retries:0,concurrency:1,background:'transparent',format:'png',
  normalization:{enabled:false},composition:{rightEdgeCrop:false}};

const prompt=`Use case: precise-object-edit. The attached PNG is the approved existing catalogue image and the edit target. Preserve its successful product appearance.

Make ONE small positional change only: translate the entire existing cable assembly slightly to the RIGHT, by approximately 2 percent of the canvas width (about 31 pixels on the original 1536-pixel-wide canvas). Keep the vertical position identical. Keep the original canvas dimensions and aspect ratio. Preserve exactly the existing object scale, jacket thickness, wire thickness, cable length, conductor spacing, camera distance, camera angle, perspective, gentle diagonal tilt, materials, rendering style, lighting and exposure. A simple small horizontal translation is the whole requested change. Preserve the generous space above and below and the relaxed catalogue composition. Keep comfortable clear space to the LEFT of every exposed copper tip.

The black intact outer jacket remains on the RIGHT. The stripped insulated cores and copper tips remain directed LEFT. Preserve the right-hand shape and length of the jacket from the reference. A small transparent right margin is acceptable; reaching the canvas edge is optional and must never require a change of scale, geometry or angle. Keep all left copper tips fully visible. Keep all three separated insulated cores readable with the same space between them as in the reference.

Exactly THREE insulated cores as in the image: brown, blue, and one yellow-and-green striped PE core. The two PE colors belong to the SAME single wire. Exactly three exposed copper tips. Each core contains one solid round copper conductor; solid-core copper, not stranded copper and not a bundle of thin copper strands. Preserve the original arrangement and construction. No fourth wire or extra conductor.

Keep a genuinely transparent background with real alpha and clean product edges. No text, logos, markings, labels, watermark, scenery or additional objects. Return one PNG. Preserve everything except the small horizontal position adjustment.`;

// Snapshot only; this standalone request never invokes catalogue planning/binding.
async function protectedSnapshot(){
  const files=['shared/generatedProductImages.json','data/catalog-current/products.json','data/cableImageConfig.json'];
  async function walk(relative){
    for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory())await walk(name);else files.push(name);
    }
  }
  await walk('public/product-images');await walk('data/product-image-metadata');
  const hashes={};
  for(const file of files.sort())hashes[file]=createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  return hashes;
}
const before=await protectedSnapshot();
await fs.writeFile(path.join(dir,'prompt.txt'),prompt+'\n',{flag:'wx'});
// An exclusive persistent claim prevents accidentally sending this paid request twice.
await fs.writeFile(path.join(dir,'request-claimed.json'),JSON.stringify({model:config.model,endpoint:'/v1/images/edits',reference:config.referenceImage,maximumRequests:1,retries:0,claimedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
let httpStatus=null;
try{
  const result=await createImageProvider(config,{env}).generate({prompt});
  httpStatus=result.httpStatus;
  const imageFile=path.join(dir,'control-flare-shift-right.png');
  await fs.writeFile(imageFile,result.buffer,{flag:'wx'});
  const validation=validateCableImagePng(result.buffer,config);
  const unchanged=JSON.stringify(before)===JSON.stringify(await protectedSnapshot());
  const report={model:result.model,httpStatus,apiRequests:result.attempts,file:imageFile,
    endpoint:'/v1/images/edits',reference:config.referenceImage,
    ...validation,objectWidthPercent:validation.bounds?Number(((validation.bounds.maxX-validation.bounds.minX+1)/validation.width*100).toFixed(1)):0,
    objectHeightPercent:validation.bounds?Number(((validation.bounds.maxY-validation.bounds.minY+1)/validation.height*100).toFixed(1)):0,
    catalogFilesUnchanged:unchanged,normalizationApplied:false};
  await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(!unchanged)throw new Error('Protected catalogue snapshot changed during test');
}catch(error){
  await fs.writeFile(path.join(dir,'failure.json'),JSON.stringify({model:config.model,httpStatus:error.httpStatus??httpStatus,message:error.name==='ImageProviderError'?error.message:'Control generation or local validation failed',retryPerformed:false},null,2)+'\n');
  console.error('Control test failed; request will not be repeated. See failure.json.');
  process.exitCode=1;
}
