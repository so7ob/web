import { chromium } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { mkdirSync,writeFileSync } from 'node:fs';
const sites={reference:'http://127.0.0.1:3107',target:'https://127.0.0.1:3198'};
const routes=['/ar','/en','/ar/contact','/en/works','/ar/auth/login','/en/auth/login'];
const browser=await chromium.launch({headless:true});const report={conditions:{rounds:5,requestsPerRound:50,concurrency:1,viewport:[1280,900],compression:'gzip level 6 applied to initial script response bodies for both runtimes',latencyThreshold:'larger of 10% and 20ms',javascriptThreshold:1.05,scope:'public and login only; isolated synthetic snapshot, same host, warm servers'},runs:[],comparison:[]};
try {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},reducedMotion:'reduce'});
  for(const route of routes) {
    for(const origin of Object.values(sites))for(let n=0;n<5;n++)await context.request.get(origin+route);
    for(let round=0;round<5;round++)for(const [site,origin] of (round%2 ? Object.entries(sites).reverse():Object.entries(sites))) {
      const times=[];
      for(let n=0;n<50;n++) { const start=performance.now();const response=await context.request.get(origin+route);await response.body();if(response.status()!==200)throw new Error('Unexpected status');times.push(performance.now()-start);await response.dispose(); }
      times.sort((a,b)=>a-b);
      const fresh=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},reducedMotion:'reduce'});await fresh.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await fresh.newPage();const scriptBodies=[];
      page.on('response',r=>{if(r.request().resourceType()==='script')scriptBodies.push(r.body());});await page.goto(origin+route,{waitUntil:'networkidle'});const bodies=await Promise.all(scriptBodies);const compressed=bodies.reduce((n,b)=>n+gzipSync(b,{level:6}).length,0);await fresh.close();
      const row={site,route,round:round+1,p50:times[24],p95:times[47],initialJavaScriptGzipBytes:compressed};report.runs.push(row);console.log(JSON.stringify(row));
    }
  }
  for(const route of routes) {
    const average=(site,key)=>{const rows=report.runs.filter(r=>r.site===site&&r.route===route);return rows.reduce((n,r)=>n+r[key],0)/rows.length;};
    const row={route};for(const metric of ['p50','p95','initialJavaScriptGzipBytes']) {const reference=average('reference',metric),target=average('target',metric);row[metric]={reference,target,pass:metric==='initialJavaScriptGzipBytes'?target<=reference*1.05:target-reference<=Math.max(reference*0.1,20)};}report.comparison.push(row);
  }
  await context.close();
} finally { await browser.close();mkdirSync('.migration/auth-ui-performance',{recursive:true});writeFileSync('.migration/auth-ui-performance/comparison.json',JSON.stringify(report,null,2)); }
if(report.comparison.some(r=>Object.values(r).some(v=>typeof v==='object'&&!v.pass)))process.exitCode=1;
