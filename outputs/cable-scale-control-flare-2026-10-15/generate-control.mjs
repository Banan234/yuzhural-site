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
  model:'gpt-image-2.5-flare',imageEndpoint:'generations',referenceImage:null,
  retries:0,concurrency:1,background:'transparent',format:'png',
  normalization:{enabled:false},composition:{rightEdgeCrop:true}};

const prompt=`Use case: product-mockup. A single realistic professional catalogue product render of a black round electrical power cable with a stripped end, on a genuinely transparent background with an alpha channel. Realistic black PVC, smooth colored insulation, realistic copper and soft studio lighting. No scene, floor, text, logo, watermark or jacket markings.

COMPOSITION AND SCALE: A close, large view designed to read clearly as a small online-store thumbnail. The visible cable including its stripped conductors occupies approximately 80–90 percent of the full canvas width. The leftmost copper tip starts about 10 percent of canvas width from the LEFT boundary; the intact black body continues through the RIGHT boundary. Enlarge the cable diameter and the exposed three-core assembly so the object also has a substantial vertical presence, with modest safe space above and below. Avoid the small narrow cable floating in a large empty canvas. Keep natural proportions. All left copper tips and all three insulated cores are fully visible. Only the continuing black jacket at the right is intentionally cropped.

DIRECTION: The intact black outer cable jacket extends all the way to and beyond the RIGHT edge of the image. The cable enters the image directly through the RIGHT frame boundary. The right end of the cable is intentionally cropped by the image boundary. No visible end cap or termination of the outer jacket on the right. No empty transparent space between the cable and the right edge. The stripped opening is towards the LEFT. Three insulated cores emerge towards the LEFT, with exposed copper at their LEFT tips. Do not mirror this arrangement. Do not put the intact cable on the left. Do not point the exposed ends rightwards.

VIEW: A shallow three-quarter product view with the same gentle natural diagonal tilt throughout, approximately 8 degrees rising towards the right. Predominantly horizontal but not perfectly horizontal; no steep diagonal or vertical view. Make a stable, clean product illustration rather than a dramatic perspective.

EXACT CONSTRUCTION: Exactly 3 insulated conductors. Exactly three. One yellow-and-green striped insulated core (both colors on the SAME single core), one blue insulated core, one brown insulated core. No fourth conductor, no additional wires. Each core contains ONE continuous solid round copper conductor with a smooth circular end face. Solid-core copper conductors. Single solid round copper conductor inside each insulated core. Not stranded copper, not a bundle of thin copper strands. Show all three separate copper tips clearly and completely at the left with a small safe margin. No cuts of the left tips, upper edge or lower edge. The outer jacket is black. Transparent PNG; do not draw a checkerboard or a white background.`;

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
await fs.writeFile(path.join(dir,'request-claimed.json'),JSON.stringify({model:config.model,maximumRequests:1,retries:0,claimedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
let httpStatus=null;
try{
  const result=await createImageProvider(config,{env}).generate({prompt});
  httpStatus=result.httpStatus;
  const imageFile=path.join(dir,'control-flare-large.png');
  await fs.writeFile(imageFile,result.buffer,{flag:'wx'});
  const validation=validateCableImagePng(result.buffer,config);
  const unchanged=JSON.stringify(before)===JSON.stringify(await protectedSnapshot());
  const report={model:result.model,httpStatus,apiRequests:result.attempts,file:imageFile,
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
