import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const origin=process.env.E2E_BASE_URL ?? 'https://127.0.0.1:3198';
if(new URL(origin).hostname!=='127.0.0.1') throw new Error('Visual comparison requires loopback');
const out=resolve('.migration/auth-ui-visual'); mkdirSync(out,{recursive:true});
const baseline=resolve('docs/migration/evidence/reference/screenshots');
const browser=await chromium.launch({headless:true}); const results=[];
try {
  for(const width of [375,1280]) for(const locale of ['ar','en']) for(const [name,suffix] of [['home',''],['contact','/contact'],['works','/works'],['login','/auth/login']]) {
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900},reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(); const errors=[],failedRequests=[]; page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push(new URL(r.url()).pathname));
    const response=await page.goto(origin+'/'+locale+suffix,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    const file=`${locale}-${name}-${width}.png`;await page.screenshot({path:out+'/'+file,fullPage:true});
    const old=await sharp(baseline+'/'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const current=await sharp(out+'/'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let different=0; const sameSize=old.info.width===current.info.width&&old.info.height===current.info.height;
    if(sameSize)for(let i=0;i<old.data.length;i+=4) if(old.data[i]!==current.data[i]||old.data[i+1]!==current.data[i+1]||old.data[i+2]!==current.data[i+2]) different++;
    const metrics=await page.evaluate(()=>({scripts:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').map(r=>({url:new URL(r.name).pathname,encoded:r.encodedBodySize,decoded:r.decodedBodySize}))}));
    const result={file,status:response.status(),baselineSize:[old.info.width,old.info.height],targetSize:[current.info.width,current.info.height],differentPixelFraction:sameSize?different/(old.info.width*old.info.height):null,pass:sameSize&&different/(old.info.width*old.info.height)<=0.005,errors,failedRequests,...metrics};results.push(result);console.log(JSON.stringify(result));await context.close();
  }
} finally { await browser.close();writeFileSync(out+'/comparison.json',JSON.stringify({sourceSHA:'5321b7fd11db421c83290b262f276811e5f04e5f',threshold:0.005,metric:'Exact RGB pixel inequality, no masks; dimension differences fail',results},null,2)); }
// A report is always produced; missing parity is a failing acceptance result.
if(results.some(r=>!r.pass||r.errors.length||r.failedRequests.length))process.exitCode=1;
