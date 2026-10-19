import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root='/Users/Shared/yuzhural-site',out=root+'/outputs/cable-image-production-2026-10-16';
const v=JSON.parse(await fs.readFile(out+'/verification.json'));
const products=JSON.parse(await fs.readFile(root+'/data/catalog-current/products.json'));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
try{
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1050});
 for(const s of v.samples){
 const p=products.find(p=>p.sku===s.product.sku);assert.ok(p?.slug);const response=await page.goto('http://localhost:5173/product/'+p.slug,{waitUntil:'networkidle'});assert.equal(response.status(),200);
 const img=page.locator('img.product-page__image');await img.waitFor();await img.evaluate(el=>el.decode());
 const state=await img.evaluate(el=>({src:el.getAttribute('src'),width:el.naturalWidth,height:el.naturalHeight,viewport:window.innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(state.src,s.image);assert.ok(state.width>0);assert.ok(state.scroll<=width+1,JSON.stringify(state));
 results.push({type:s.type,sku:p.sku,viewport:width,...state});
 if(s.type==='3 жилы'||s.type==='СИП')await page.screenshot({path:out+`/product-${s.type==='СИП'?'sip':'3core'}-${width}.png`,fullPage:false});
 }
}
await page.goto('file://'+out+'/gallery.html',{waitUntil:'load'});
await page.evaluate(()=>{const sections=[...document.querySelectorAll('section')];for(const section of sections.slice(1))section.remove();document.querySelectorAll('pre,small').forEach(e=>e.remove());document.querySelectorAll('img').forEach(e=>e.loading='eager');document.querySelectorAll('h2').forEach((e,i)=>{if(i>0)e.remove()});});
await page.setViewportSize({width:1440,height:1000});await page.addStyleTag({content:'.picture{height:180px}body{margin:16px}h3{font-size:16px;margin:4px 0 12px}article p{font-size:12px}'});await page.locator('img').evaluateAll(els=>Promise.all(els.map(e=>e.decode())));await page.screenshot({path:out+'/catalogue-structures.png',fullPage:true});assert.deepEqual(errors,[]);
await fs.writeFile(out+'/ui-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),pageErrors:errors,checks:results},null,2)+'\n');console.log(JSON.stringify({pages:results.length,errors,types:v.samples.map(s=>s.type)}));
}finally{await browser.close();}
