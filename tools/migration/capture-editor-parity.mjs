// Isolated synthetic source/target comparison. Requires owned loopback reference and test servers.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDataSource } from '@so7ob/server';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { baselinePath, sourceSHA } from './reference-paths.mjs';
import setup from '../../tests/e2e/setup.ts';
if (!['127.0.0.1','localhost'].includes(process.env.DATABASE_HOST??'')) throw new Error('Loopback MariaDB is required');
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME??'')) throw new Error('An isolated MariaDB test database is required');
const reference='http://127.0.0.1:3107', target='https://127.0.0.1:3198';
const out=resolve('.migration/editor-refresh/parity/'+new Date().toISOString().replaceAll(':','-'));
mkdirSync(out,{recursive:true});
const sourceDb=new DatabaseSync(resolve(baselinePath,'data/runtime.db'));
const db=await createDataSource().initialize();
const cleanupFixture=await setup();
const fixture=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
const browser=await chromium.launch({headless:true});
const contexts=[];const pages=[];const results=[];
const stamp=new Date('2026-10-04T00:00:00Z');
try {
 for(const [kind,origin,email,password] of [['reference',reference,'admin@migration.example.invalid','Synthetic-Migration-4829'],['target',target,fixture.prefix+'admin@example.invalid',fixture.password]]) {
  const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,viewport:{width:1280,height:900},locale:'en-US',timezoneId:'Asia/Aden',reducedMotion:'reduce'});contexts.push(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue():route.abort());
  const csrf=await(await context.request.get('/api/auth/csrf')).json();
  const login=await context.request.post('/api/auth/callback/credentials',{form:{email,password,csrfToken:csrf.csrfToken,json:'true'}});
  if(login.status()!==200 || !(await(await context.request.get('/api/auth/session')).json()).user)throw new Error(kind+' login failed');
  const headers={'x-csrf-token':csrf.csrfToken,origin};
  const slug='synthetic-editor-parity-'+Date.now();
  const create=await context.request.post('/api/admin/pages',{headers,data:{slug,titleAr:'شجرة اصطناعية',titleEn:'Synthetic tree'}});const created=await create.json();
  if(!create.ok())throw new Error(kind+' fixture create: '+JSON.stringify(created));
  const id=created.page.id;pages.push({kind,id});
  const content=JSON.stringify({schemaVersion:1,blocks:[{id:'section',type:'section',children:[{id:'container',type:'container',children:[{id:'row',type:'row',props:{columns:2},children:[{id:'column',type:'column',children:[{id:'heading',type:'heading',props:{text:'Nested heading'}}]}]}]}]}]});
  const save=await context.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:content,draftBlocksEn:content}});if(!save.ok())throw new Error(kind+' fixture save: '+save.status());
  // Only the newly created owned page: align data timestamps without masking the UI.
  if(kind==='reference')sourceDb.prepare('UPDATE Page SET draftUpdatedAt=?,updatedAt=?,editorTouchedAt=? WHERE id=?').run(stamp.getTime(),stamp.getTime(),stamp.getTime(),id);
  else await db.query('UPDATE Page SET draftUpdatedAt=?,updatedAt=?,editorTouchedAt=? WHERE id=?',[stamp,stamp,stamp,id]);
  for(const locale of ['ar','en'])for(const [device,width,height]of [['desktop',1280,900],['mobile',375,812]]) {
   const page=await context.newPage();await page.setViewportSize({width,height});await page.clock.setFixedTime(new Date('2026-10-04T00:10:00Z'));
   const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)network.push({path:new URL(r.url()).pathname,status:r.status()});});
   const response=await page.goto(`/${locale}/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:'Nested heading',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   const axe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
   const screenshot=`${kind}-${locale}-${device}.png`;await page.screenshot({path:resolve(out,screenshot),fullPage:true});
   results.push({kind,locale,device,status:response.status(),errors,network,axe,screenshot});await page.close();
  }
 }
 const comparisons=[];
 for(const locale of ['ar','en'])for(const device of ['desktop','mobile']){
  const ref=await sharp(resolve(out,`reference-${locale}-${device}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const next=await sharp(resolve(out,`target-${locale}-${device}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const same=ref.info.width===next.info.width&&ref.info.height===next.info.height;let different=0;
  if(same)for(let i=0;i<ref.data.length;i+=4)if(ref.data[i]!==next.data[i]||ref.data[i+1]!==next.data[i+1]||ref.data[i+2]!==next.data[i+2])different++;
  const fraction=same?different/(ref.info.width*ref.info.height):null;
  comparisons.push({locale,device,referenceSize:[ref.info.width,ref.info.height],targetSize:[next.info.width,next.info.height],differentPixelFraction:fraction,pass:fraction!==null&&fraction<=0.005});
 }
 writeFileSync(resolve(out,'summary.json'),JSON.stringify({sourceSHA,syntheticOnly:true,threshold:0.005,metric:'Exact RGB inequality; full page; no masks',results,comparisons},null,2)+'\n');
 console.log(JSON.stringify({out,comparisons}));if(comparisons.some(c=>!c.pass)||results.some(r=>r.kind==='target'&&(r.errors.length||r.network.length||r.axe.length)))process.exitCode=1;
}finally{
 for(const {kind,id} of pages){if(kind==='reference'){sourceDb.prepare('DELETE FROM PageVersion WHERE pageId=?').run(id);sourceDb.prepare('DELETE FROM Page WHERE id=?').run(id);}else{await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);}}
 for(const c of contexts)await c.close();await browser.close();sourceDb.close();await db.destroy();await cleanupFixture();
}
