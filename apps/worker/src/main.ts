import { setTimeout as delay } from 'node:timers/promises';
import { database, assertSchema, MailQueue, PayloadCipher, smtpTransport, processMail, WebhookQueue, processWebhook, FileCleanupQueue, PagePublicationService, WorkerHeartbeat } from '@so7ob/server';
const db = await database(); await assertSchema(db);
let stopping = false;
process.once('SIGTERM', () => { stopping = true; }); process.once('SIGINT', () => { stopping = true; });
const queue = new MailQueue(db, new PayloadCipher());
const transport = smtpTransport();
const webhooks = new WebhookQueue(db);
const publication = new PagePublicationService(db);
let lastScheduleCheck = 0;
const fileCleanup = new FileCleanupQueue(db);
const health = new WorkerHeartbeat(db);
let heartbeat:ReturnType<typeof setInterval>|undefined;let pending:Promise<void>|undefined;let started=false;
try {
  if (!process.argv.includes('--check')) {
    await health.start();started=true;
    heartbeat=setInterval(()=>{if(pending)return;pending=health.beat().catch(()=>{stopping=true;process.exitCode=1;}).finally(()=>{pending=undefined;});},5000);
    heartbeat.unref();
    do {
      const job = await queue.claim();
      if (job) { await processMail(queue, job, transport, process.env.SMTP_FROM!); process.stdout.write(JSON.stringify({ event: 'mail_attempt_finished', jobId: job.id })+'\n'); }
      const webhook = stopping ? null : await webhooks.claim();
      if (webhook) { await processWebhook(webhooks, webhook); process.stdout.write(JSON.stringify({ event: 'webhook_attempt_finished', jobId: webhook.id })+'\n'); }
      let activity=!!job||!!webhook;
      if (!stopping && Date.now() - lastScheduleCheck >= 1000) { const result=await publication.runDue();activity ||= result.published+result.skipped>0; lastScheduleCheck = Date.now(); }
      const cleaned = stopping ? false : await fileCleanup.processOne();
      if(activity||cleaned)await health.activity();
      if (!job && !webhook && !cleaned && !process.argv.includes('--once') && !stopping) await delay(1000);
      if (process.argv.includes('--once')) break;
    } while (!stopping);
  }
} catch {
  // Provider/DB errors may contain payloads or credentials. Supervisor restarts; leases recover safely.
  process.stderr.write('Worker failed; inspect queue state using redacted diagnostics.\n'); process.exitCode = 1;
} finally { if(heartbeat)clearInterval(heartbeat);await pending; if(started)await health.stop().catch(()=>{process.exitCode=1;});transport.close();await db.destroy(); }
