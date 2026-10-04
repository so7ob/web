// Isolated synthetic source/target comparison. Requires owned loopback reference and test servers.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDataSource } from '@so7ob/server';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { baselinePath, sourceSHA } from './reference-paths.mjs';
import {randomBytes,createHash} from 'node:crypto';
if (!['127.0.0.1','localhost'].includes(process.env.DATABASE_HOST??'')) throw new Error('Loopback MariaDB is required');
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME??'')) throw new Error('An isolated MariaDB test database is required');
const reference='http://127.0.0.1:3107', target='https://127.0.0.1:3198';
const out=resolve('.migration/tracking/parity/'+new Date().toISOString().replaceAll(':','-'));
mkdirSync(out,{recursive:true});
const sourceDb=new DatabaseSync(resolve(baselinePath,'data/runtime.db'));
const db=await createDataSource().initialize();
const id='trackvisual'+randomBytes(6).toString('hex'), token=randomBytes(32).toString('base64url');
const digest=createHash('sha256').update(token).digest('hex');
const browser=await chromium.launch({headless:true});
const contexts=[];const pages=[];const results=[];
const stamp=new Date('2026-10-04T00:00:00Z'),expiry=new Date('2030-01-01T00:00:00Z');
try {
 for(const [kind,origin] of [['reference',reference],['target',target]]) {
  const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,locale:'en-US',timezoneId:'Asia/Aden',reducedMotion:'reduce'});contexts.push(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue():route.abort());
  const values=[id,'S7-VISUAL00','quote','web','Synthetic tracking description','unspecified','flexible','Synthetic contact','synthetic@example.invalid','synthetic','email','en',stamp,stamp,stamp];
  const sql='INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,descriptionHash,preferredContact,locale,createdAt,updatedAt,lastActivityAt) VALUES('+values.map(()=>'?').join(',')+')';
  const linkSQL="INSERT INTO TrackLink(id,scope,requestId,tokenHash,expiresAt,createdAt,updatedAt) VALUES(?,'request',?,?,?,?,?)";
  const settingsSQL='INSERT INTO SiteSetting(`key`,value,updatedAt) VALUES(?,?,?)';
  if(kind==='reference'){
   sourceDb.prepare(sql).run(...values.map(v=>v instanceof Date?v.getTime():v));
   sourceDb.prepare(linkSQL).run(id,id,digest,expiry.getTime(),stamp.getTime(),stamp.getTime());
   sourceDb.prepare(settingsSQL).run('track.exception.request.'+id,'link_reply',stamp.getTime());
  }else{
   await db.query(sql,values);await db.query(linkSQL,[id,id,digest,expiry,stamp,stamp]);await db.query(settingsSQL,['track.exception.request.'+id,'link_reply',stamp]);
  }
  pages.push({kind,id});
  for(const locale of ['ar','en'])for(const [device,width,height]of [['desktop',1280,900],['mobile',375,812]]) {
   const page=await context.newPage();await page.setViewportSize({width,height});await page.clock.setFixedTime(new Date('2026-10-04T00:10:00Z'));
   const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)network.push({path:new URL(r.url()).pathname,status:r.status()});});
   const response=await page.goto(`/${locale}/track?t=${token}`,{waitUntil:'networkidle'});
   await page.getByText('Synthetic tracking description',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
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
 for(const {kind,id} of pages){
  const queries=[['DELETE FROM SiteSetting WHERE `key`=?','track.exception.request.'+id],['DELETE FROM TrackLink WHERE id=?',id],['DELETE FROM ProjectRequest WHERE id=?',id],['DELETE FROM AuditLog WHERE entityId=?',id]];
  for(const [sql,value] of queries){if(kind==='reference')sourceDb.prepare(sql).run(value);else await db.query(sql,[value]);}
 }
 for(const c of contexts)await c.close();await browser.close();sourceDb.close();await db.destroy();
}
