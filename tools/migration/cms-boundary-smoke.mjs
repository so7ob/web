// Real HTTP/MariaDB byte-boundary acceptance. Only owned synthetic rows and loopback are used.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import { database, assertSchema, AuthenticationService, PageAdministrationService, sha256 } from '@so7ob/server';
import { validateContent, validateBlocks } from '@so7ob/contracts';
import { contentAtBytes } from './cms-boundary-fixture.mjs';
assert(/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? ''));
assert(['127.0.0.1','::1'].includes(process.env.DATABASE_HOST));
const db=await database();await assertSchema(db);
const [packet]=await db.query('SELECT @@session.max_allowed_packet bytes');
assert(Number(packet.bytes)>=256*1024*1024,'CMS stress requires a separately configured isolated MariaDB packet >=256MiB; script never changes global settings');
const prefix='boundary'+randomBytes(6).toString('hex'),ids=[],measurements=[];
const keys={AUTH_SECRET:randomBytes(32).toString('hex'),OUTBOX_KEY:randomBytes(32).toString('hex')};
const actor={id:prefix,email:prefix+'@example.invalid',name:'Synthetic CMS',roleKey:prefix,status:'active',locale:'en',emailVerified:true,permissions:['pages.view','pages.edit','pages.publish','pages.restore']};
const pages=new PageAdministrationService(db);let child;
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
let cookie='';
async function send(path,body,{totalBytes,authenticated=true}={}) {
 const first=Buffer.from(JSON.stringify(body));const size=totalBytes??first.length;assert(size>=first.length);
 return new Promise((resolve,reject)=>{
  let done=false,sent=0;const req=http.request(origin+path,{method:'PATCH',headers:{'Content-Type':'application/json','Content-Length':size,Origin:origin,...(authenticated?{Cookie:cookie}:{})}},res=>{
   let text='';res.on('data',b=>text+=b);res.on('end',()=>{done=true;resolve({status:res.statusCode,body:JSON.parse(text),sent});req.destroy();});
  });req.setTimeout(120000,()=>req.destroy(new Error('CMS HTTP timeout')));req.on('error',e=>{if(!done){done=true;reject(e);}});
  const padding=Buffer.alloc(65536,32);
  function write(){if(done)return;while(sent<size){const chunk=sent===0?first:padding.subarray(0,Math.min(padding.length,size-sent));sent+=chunk.length;if(!req.write(chunk)){req.once('drain',write);return;}}req.end();}write();
 });
}
async function page(){const result=await pages.create(actor,{slug:prefix+'-'+ids.length,titleAr:'حدود اصطناعية',titleEn:'Synthetic boundary'});ids.push(result.page.id);return result.page.id;}
async function state(id){return (await db.query('SELECT draftRevision,SHA2(draftBlocksAr,256) hash,OCTET_LENGTH(draftBlocksAr) bytes FROM Page WHERE id=?',[id]))[0];}
try{
 await db.query('INSERT INTO Role (`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)',[prefix,'اختبار','Test',JSON.stringify(actor.permissions)]);
 const password='Synthetic-CMS-4829';await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,?,?,'active')",[prefix,actor.email,actor.name,await bcrypt.hash(password,12),prefix]);
 const auth=new AuthenticationService(db,{...process.env,...keys});const login=await auth.login(actor.email,password,'cms-boundary','127.0.0.1');assert(login);cookie='__Host-so7ob.session='+login.raw;
 child=spawn(process.execPath,['--max-old-space-size=3072','apps/api/dist/main.js'],{env:{...process.env,...keys,NODE_ENV:'production',PORT:String(port),BIND_HOST:'127.0.0.1',SITE_URL:origin,WEB_ORIGIN:origin},stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();
 const deadline=Date.now()+20000;for(;;){try{if((await fetch(origin+'/api/health/ready')).ok)break;}catch{/* starting */}assert(Date.now()<deadline&&child.exitCode===null,'API startup failed');await delay(30);}
 for(const route of ['/api/admin/pages/','/api/v1/admin/pages/']){
  const id=await page(),raw=contentAtBytes(300000),valid=validateContent(raw);assert(valid.ok);assert.equal(Buffer.byteLength(valid.json),300000);
  const saved=await send(route+id,{baseRevision:0,draftBlocksAr:raw});assert.equal(saved.status,200);
  const before=await state(id);assert.equal(Number(before.bytes),300000);assert.equal(before.hash,createHash('sha256').update(valid.json).digest('hex'));
  for(const input of [contentAtBytes(300001),contentAtBytes(300000,false)]){
   const rejected=await send(route+id,{baseRevision:before.draftRevision,draftBlocksAr:input});assert.equal(rejected.status,400);assert.equal(rejected.body.error,'content_too_large');assert.deepEqual(await state(id),before);
  }
  const races=await Promise.all([send(route+id,{baseRevision:before.draftRevision,draftBlocksEn:raw}),send(route+id,{baseRevision:before.draftRevision,draftBlocksEn:raw})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  const pub=await fetch(origin+route+id+'/publish',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({baseRevision:before.draftRevision+1})});assert.equal(pub.status,200);
  const [published]=await db.query('SELECT OCTET_LENGTH(publishedBlocksAr) bytes,SHA2(publishedBlocksAr,256) hash FROM Page WHERE id=?',[id]);assert.equal(Number(published.bytes),300000);assert.equal(published.hash,before.hash);
  const rendered=await fetch(origin+'/en/'+prefix+'-'+(ids.length-1));assert.equal(rendered.status,200);assert((await rendered.text()).includes('ع'));
  measurements.push({route,canonicalBytes:300000,overBoundary:400,normalizationOverflow:400,concurrentStatuses:[200,409],publishedAndRendered:true});
 }
 const id=await page(),route='/api/admin/pages/'+id,limit=160*1024*1024;
 // Transport cap is tested at exactly 160MiB. Whitespace is valid JSON, not stored content.
 const full=await send(route,{draftBlocksAr:'[]'},{totalBytes:limit});assert.equal(full.status,200);assert.equal(full.sent,limit);
 const before=await state(id);const tooLarge=await send(route,{draftBlocksAr:'[]'},{totalBytes:limit+1});assert.equal(tooLarge.status,413);assert.deepEqual(await state(id),before);
 const anonymous=await send(route,{draftBlocksAr:'[]'},{totalBytes:limit+1,authenticated:false});assert.equal(anonymous.status,401);assert.deepEqual(await state(id),before);
 measurements.push({transportBytes:limit,accepted:full.status,overByOne:tooLarge.status,anonymous:anonymous.status,storedBytes:Number(before.bytes),paddingIsNotStorageEvidence:true});
 // Max columns/paragraph counts and lengths in 60 legacy blocks. Escaped control text
 // exercises SQL escaping/packet overhead; unlike padding it persists tens of MiB.
 let raw=JSON.stringify(Array.from({length:60},(_,i)=>({id:'legacy'+i,type:'columns',props:{columns:Array.from({length:4},()=>({heading:'ع'.repeat(200),paragraphs:Array(10).fill('\u0001'.repeat(4000))}))}})));
 let normalized=validateBlocks(raw);assert(normalized.ok);const canonical=JSON.stringify(normalized.blocks),bytes=Buffer.byteLength(canonical),hash=createHash('sha256').update(canonical).digest('hex');normalized=null;
 const big=await send(route,{draftBlocksAr:raw,draftBlocksEn:raw});assert.equal(big.status,200);raw=null;
 const saved=await state(id);assert.equal(Number(saved.bytes),bytes);assert.equal(saved.hash,hash);
 await pages.publish(actor,id);
 const [live]=await db.query('SELECT OCTET_LENGTH(publishedBlocksAr) bytes,SHA2(publishedBlocksAr,256) hash,SHA2(publishedBlocksEn,256) enHash,OCTET_LENGTH(publishedBlocksEn) enBytes FROM Page WHERE id=?',[id]);assert.equal(Number(live.bytes),bytes);assert.equal(live.hash,hash);assert.equal(Number(live.enBytes),bytes);assert.equal(live.enHash,hash);
 const [version]=await db.query("SELECT OCTET_LENGTH(blocks) bytes,SHA2(blocks,256) hash FROM PageVersion WHERE pageId=? AND locale='ar' ORDER BY version DESC LIMIT 1",[id]);assert.equal(Number(version.bytes),bytes);assert.equal(version.hash,hash);
 const [enVersion]=await db.query("SELECT SHA2(blocks,256) hash FROM PageVersion WHERE pageId=? AND locale='en' ORDER BY version DESC LIMIT 1",[id]);assert.equal(enVersion.hash,hash);
 measurements.push({legacyStoredBytes:bytes,localeCount:2,totalDocumentBytes:bytes*2,hash,publishAndVersionMatch:true,allBlockKindsMaximized:false});
 console.log(JSON.stringify({passed:true,sourceSHA:'dddf8cd00a19cf7d562f503549f4c000109057d1',packetBytes:Number(packet.bytes),measurements}));
}finally{
 if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await exited;clearTimeout(timer);}
 for(const id of ids){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);}
 await db.query('DELETE FROM AuditLog WHERE actorId=?',[prefix]);await db.query('DELETE FROM User WHERE id=?',[prefix]);await db.query('DELETE FROM Role WHERE `key`=?',[prefix]);
 await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256('login:127.0.0.1')]);await db.destroy();
}
