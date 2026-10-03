import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { MailQueue, type ClaimedMail } from './mail-queue.js';
import { QueueError } from './crypto.js';
export function smtpTransport(env: NodeJS.ProcessEnv = process.env): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_FROM) throw new QueueError('SMTP_HOST and SMTP_FROM must be configured for the mail worker');
  const local = env.NODE_ENV !== 'production' && ['127.0.0.1','::1','localhost'].includes(env.SMTP_HOST) && env.SMTP_ALLOW_INSECURE_LOCAL === 'true';
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new QueueError('Invalid SMTP port');
  return nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: !local && port !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    tls: { rejectUnauthorized: true }, logger: false, debug: false,
  });
}
export function classifySmtpFailure(error: unknown): { status: 'retry' | 'failed' | 'uncertain'; code: string } {
  const e = error && typeof error === 'object' ? error as { responseCode?: number; command?: string; code?: string } : {};
  if (e.responseCode && e.responseCode >= 500) return { status: 'failed', code: 'smtp_rejected_permanently' };
  if (e.responseCode && e.responseCode >= 400) return { status: 'retry', code: 'smtp_rejected_temporarily' };
  // Nodemailer also labels a disconnect after DATA as CONN; it is not proof of pre-send failure.
  if (['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(e.code ?? '')) return { status: 'retry', code: 'smtp_connection_not_established' };
  if (['EHLO','HELO','STARTTLS','AUTH','MAIL FROM','RCPT TO'].some(c => e.command === c || e.command?.startsWith(c+' '))) return { status: 'retry', code: 'smtp_failed_before_data' };
  return { status: 'uncertain', code: 'smtp_acceptance_unknown' };
}
export async function processMail(queue: MailQueue, job: ClaimedMail, transport: Transporter, from: string): Promise<void> {
  let mail;
  try { mail = queue.cipher.decrypt(job.payload,job.id); }
  catch { await queue.finish(job,'failed','payload_authentication_failed'); return; }
  if (!await queue.beginSend(job)) return;
  let lost = false; let heartbeatRunning = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatRunning) return; heartbeatRunning = true;
    try { if (!await queue.heartbeat(job)) { lost = true; transport.close(); } }
    catch { lost = true; transport.close(); }
    finally { heartbeatRunning = false; }
  }, Math.max(50,Math.floor(queue.policy.leaseMs / 3)));
  try {
    let messageId: string;
    try {
      const sent = await transport.sendMail({ ...mail, from, messageId: `<${job.id}@so7ob.local>` });
      if (!sent.accepted?.length) { if (!lost) await queue.finish(job,'failed','smtp_no_recipient_accepted'); return; }
      messageId = sent.messageId;
    } catch (error) {
      if (!lost) { const failure = classifySmtpFailure(error); await queue.finish(job,failure.status,failure.code); }
      return;
    }
    // A DB failure after SMTP success must never be classified as a send failure/retry.
    if (!lost) await queue.finish(job,'sent',null,messageId);
  } finally { clearInterval(heartbeat); }
}
