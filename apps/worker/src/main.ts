import { setTimeout as delay } from 'node:timers/promises';
import { database, assertSchema, MailQueue, PayloadCipher, smtpTransport, processMail, WebhookQueue, processWebhook } from '@so7ob/server';
const db = await database(); await assertSchema(db);
let stopping = false;
process.once('SIGTERM', () => { stopping = true; }); process.once('SIGINT', () => { stopping = true; });
const queue = new MailQueue(db, new PayloadCipher());
const transport = smtpTransport();
const webhooks = new WebhookQueue(db);
try {
  if (!process.argv.includes('--check')) {
    do {
      const job = await queue.claim();
      if (job) { await processMail(queue, job, transport, process.env.SMTP_FROM!); process.stdout.write(JSON.stringify({ event: 'mail_attempt_finished', jobId: job.id })+'\n'); }
      const webhook = stopping ? null : await webhooks.claim();
      if (webhook) { await processWebhook(webhooks, webhook); process.stdout.write(JSON.stringify({ event: 'webhook_attempt_finished', jobId: webhook.id })+'\n'); }
      if (!job && !webhook && !process.argv.includes('--once') && !stopping) await delay(1000);
      if (process.argv.includes('--once')) break;
    } while (!stopping);
  }
} catch {
  // Provider/DB errors may contain payloads or credentials. Supervisor restarts; leases recover safely.
  process.stderr.write('Worker failed; inspect queue state using redacted diagnostics.\n'); process.exitCode = 1;
} finally { transport.close(); await db.destroy(); }
