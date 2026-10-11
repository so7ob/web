import {AuditReports,AuditOperations,auditContext} from '@so7ob/server';
import {resolve} from 'node:path';
import {DiagnosticLogger,RotatingDiagnosticFile,DiagnosticStore} from '@so7ob/server';
import { setTimeout as delay } from 'node:timers/promises';
import { database, assertSchema, MailQueue, PayloadCipher, smtpTransport, processMail, WebhookQueue, processWebhook, FileCleanupQueue, PagePublicationService, WorkerHeartbeat } from '@so7ob/server';
const fileLog=new RotatingDiagnosticFile(resolve(process.env.DATA_DIR??'.migration/runtime','diagnostics'),'worker');
let store:DiagnosticStore|undefined;
const diagnostics=new DiagnosticLogger({async write(event){await Promise.all([fileLog.write(event),...(store?[store.write(event)]:[])]);}});
async function main(){
const db = await database().catch(error=>{diagnostics.record({component:'Worker',event:'startup_failed',code:'internal_error',operation:'startup',level:'fatal'},error);throw new Error('Worker database unavailable');}); await assertSchema(db);store=new DiagnosticStore(db);
let stopping = false;
process.once('SIGTERM', () => { stopping = true; }); process.once('SIGINT', () => { stopping = true; });
const queue = new MailQueue(db, new PayloadCipher());
const transport = smtpTransport();
const webhooks = new WebhookQueue(db);
const publication = new PagePublicationService(db);
let lastScheduleCheck = 0,lastAuditProbe=0;
const auditReports=new AuditReports(db),auditOperations=new AuditOperations(db);
const fileCleanup = new FileCleanupQueue(db);
const health = new WorkerHeartbeat(db);
let heartbeat:ReturnType<typeof setInterval>|undefined;let pending:Promise<void>|undefined;let started=false;
try {
  if (!process.argv.includes('--check')) {
    await health.start();started=true;
    heartbeat=setInterval(()=>{if(pending)return;pending=health.beat().catch(error=>{diagnostics.record({component:'Worker',event:'worker_failed',code:'internal_error',operation:'heartbeat'},error);stopping=true;process.exitCode=1;}).finally(()=>{pending=undefined;});},5000);
    heartbeat.unref();
    do {
      const job = await queue.claim();
      if (job) { await processMail(queue, job, transport, process.env.SMTP_FROM!); process.stdout.write(JSON.stringify({ event: 'mail_attempt_finished', jobId: job.id })+'\n'); }
      const webhook = stopping ? null : await webhooks.claim();
      if (webhook) { await processWebhook(webhooks, webhook); process.stdout.write(JSON.stringify({ event: 'webhook_attempt_finished', jobId: webhook.id })+'\n'); }
      let activity=!!job||!!webhook;
      if(!stopping){try{activity=await auditReports.processOne()||activity;for(let n=0;n<25&&!stopping;n++){if(!await auditOperations.processOne())break;activity=true;}}catch(error){diagnostics.record({component:'Worker',event:'worker_failed',code:'internal_error',operation:'audit_processing'},error);}}
      if(!stopping&&Date.now()-lastAuditProbe>60000){lastAuditProbe=Date.now();try{await auditOperations.probe();await auditReports.cleanup();}catch(error){diagnostics.record({component:'Worker',event:'worker_failed',code:'internal_error',operation:'audit_probe'},error);}}
      if (!stopping && Date.now() - lastScheduleCheck >= 1000) { const result=await publication.runDue();activity ||= result.published+result.skipped>0; lastScheduleCheck = Date.now(); }
      const cleaned = stopping ? false : await fileCleanup.processOne();
      if(activity||cleaned)await health.activity();
      if (!job && !webhook && !cleaned && !process.argv.includes('--once') && !stopping) await delay(1000);
      if (process.argv.includes('--once')) break;
    } while (!stopping);
  }
} catch (error) {
  // Provider/DB errors may contain payloads or credentials. Supervisor restarts; leases recover safely.
  diagnostics.record({component:'Worker',event:'worker_failed',code:'internal_error',operation:'process_jobs'},error); process.exitCode = 1;
} finally { if(heartbeat)clearInterval(heartbeat);await pending; if(started)await health.stop().catch(error=>{diagnostics.record({component:'Worker',event:'worker_failed',code:'internal_error',operation:'shutdown'},error);process.exitCode=1;});transport.close();await diagnostics.flush();await db.destroy(); }

}
auditContext.run({source:'worker'},()=>main()).catch(async error=>{diagnostics.record({component:'Worker',event:'startup_failed',code:'internal_error',operation:'startup',level:'fatal'},error);await diagnostics.flush();process.exitCode=1;});
