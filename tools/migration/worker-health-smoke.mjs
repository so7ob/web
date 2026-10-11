// Synthetic loopback-only worker/API liveness acceptance; no external SMTP.
import{spawn}from'node:child_process';import{once}from'node:events';import{randomBytes}from'node:crypto';import{setTimeout as delay}from'node:timers/promises';import assert from'node:assert/strict';
import{database,workerHealth}from'@so7ob/server';
if(!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME??'')||process.env.DATABASE_HOST!=='127.0.0.1')throw Error('Isolated loopback MariaDB required');
const db=await database(),actor={roleKey:'super_admin',permissions:['email.outbox']};
const env={...process.env,NODE_ENV:'test',BIND_HOST:'127.0.0.1',PORT:'3217',SITE_URL:'http://127.0.0.1:3217',WEB_ORIGIN:'http://127.0.0.1:3217',AUTH_SECRET:randomBytes(32).toString('hex'),OUTBOX_KEY:randomBytes(32).toString('hex'),SMTP_HOST:'127.0.0.1',SMTP_PORT:'9',SMTP_FROM:'synthetic@example.invalid',SMTP_ALLOW_INSECURE_LOCAL:'true'};
const start=path=>spawn(process.execPath,[path],{env,stdio:'ignore'});
const api=start('apps/api/dist/main.js');let worker;
const initial=(await db.query('SELECT id FROM WorkerHeartbeat')).map(row=>row.id);
async function until(test){const end=Date.now()+15000;while(!await test()){if(Date.now()>end)throw Error('Liveness smoke timed out');await delay(50);}}
try{
 await until(async()=>{try{return(await fetch(env.SITE_URL+'/api/health/ready')).status===200;}catch{return false;}});
 // No jobs are enqueued by this smoke. Other worker tests clean their own synthetic jobs.
 worker=start('apps/worker/dist/main.js');await until(async()=>(await workerHealth(db,actor)).status==='healthy');
 const exit=once(worker,'exit');worker.kill('SIGTERM');await exit;
 assert.equal((await fetch(env.SITE_URL+'/api/health/ready')).status,200);
 assert.equal((await workerHealth(db,actor)).status,'degraded');
 assert.equal((await fetch(env.SITE_URL+'/api/admin/worker-health')).status,401);
 console.log('PASS independent worker stop is degraded while API remains ready; unauthenticated monitor rejected');
}finally{
 if(worker&&worker.exitCode===null)worker.kill('SIGTERM');api.kill('SIGTERM');await once(api,'exit').catch(()=>{});
 for(const row of await db.query('SELECT id FROM WorkerHeartbeat'))if(!initial.includes(row.id))await db.query('DELETE FROM WorkerHeartbeat WHERE id=?',[row.id]);await db.destroy();
}
