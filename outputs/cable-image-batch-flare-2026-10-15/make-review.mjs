import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const plan=JSON.parse(await fs.readFile(path.join(dir,'dry-run.json'),'utf8'));
const pageNumber=Number(process.argv[2]||1),start=(pageNumber-1)*20;
const entries=await Promise.all(plan.groups.slice(start,start+20).map(async(g,i)=>{
 let stored;try{stored=JSON.parse(await fs.readFile(path.join(root,'data/product-image-metadata/groups',`${g.visualKey}.json`),'utf8'))}catch{}
 const ready=stored&&['needs_review','approved'].includes(stored.status);
 const file=ready?stored.output_filename:g.existing_image?g.output_filename:null;
 return {index:start+i+1,key:g.visualKey,cores:g.cores,strand:g.parameters.strand,colors:g.parameters.colors,material:g.parameters.material,status:stored?.status||g.action,image:file?pathToFileURL(path.join(root,file)).href:null,edge:stored?.validation?.touches_right_edge,legacy:g.legacy_asset};
}));
const escape=(s)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e4e7ec;font:14px Arial;color:#111}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}.tile{background:white;border:1px solid #aab2be}.image{height:250px;background-color:#fff;background-image:linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0px;display:flex;align-items:center;justify-content:center}.image img{width:100%;height:100%;object-fit:contain}.label{padding:8px;height:82px;overflow:hidden}h1{font-size:22px;margin:12px}.key{font-weight:700;word-break:break-all}</style><h1>Flare batch — review page ${pageNumber}; keys ${start+1}–${start+entries.length}</h1><div class="grid">${entries.map(e=>`<div class="tile"><div class="image">${e.image?`<img src="${escape(e.image)}">`:escape(e.status)}</div><div class="label"><div class="key">${e.index}. ${escape(e.key)}</div><div>${e.cores} cores · ${e.strand} · ${e.material} · edge:${e.edge??'legacy'}</div><div>${escape(e.colors.join(' / '))}</div><div>${escape(e.status)}${e.legacy?' · retained approved':''}</div></div></div>`).join('')}</div>`;
const file=path.join(dir,`review-page-${pageNumber}.html`);await fs.writeFile(file,html);
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1600,height:1700},deviceScaleFactor:1});await page.goto(pathToFileURL(file).href);await page.evaluate(async()=>{await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})))});await page.screenshot({path:path.join(dir,`review-page-${pageNumber}.png`),fullPage:true});}finally{await browser.close()}
console.log(JSON.stringify({page:pageNumber,ready:entries.filter(e=>!!e.image).length,entries:entries.map(({image,...e})=>e)}));
