import { randomBytes, randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import { PayloadCipher, QueueError, type MailInput } from './crypto.js';
export interface ClaimedMail { id: string; emailLogId: string; payload: string; leaseToken: string; attempts: number; maxAttempts: number }
export interface QueuePolicy { leaseMs: number; retryBaseMs: number }
export class MailQueue {
  constructor(private readonly db: DataSource, readonly cipher: PayloadCipher, readonly policy: QueuePolicy = { leaseMs: 60000, retryBaseMs: 30000 }) {
    if (policy.leaseMs < 100 || policy.retryBaseMs < 0) throw new QueueError('Invalid queue timing policy');
  }
  async enqueue(r: QueryRunner, mail: MailInput, dedupeKey: string): Promise<{ id: string; emailLogId: string; status: string }> {
    if (!r.isTransactionActive) throw new QueueError('Enqueue must participate in the business transaction');
    if (!/^[a-f0-9]{64}$/.test(dedupeKey)) throw new QueueError('Dedupe key must be a SHA-256 identifier, never a raw token');
    const digest = this.cipher.digest(mail);
    const id = randomUUID(); const emailLogId = randomUUID();
    // Fast path for a committed job; the unique insert below serializes concurrent enqueues.
    const existing = await r.query('SELECT id,emailLogId,status,payloadDigest FROM MailJob WHERE dedupeKey=?', [dedupeKey]);
    if (existing.length) {
      if (existing[0].payloadDigest !== digest) throw new QueueError('Dedupe key conflicts with another payload');
      return { id: existing[0].id, emailLogId: existing[0].emailLogId, status: existing[0].status };
    }
    // Original outbox intentionally stores metadata only; links/tokens remain encrypted.
    await r.query('INSERT INTO EmailLog(id,`to`,subject,bodyText,bodyHtml,status) VALUES(?,?,?,\'\',NULL,\'queued\')', [emailLogId, mail.to, mail.subject]);
    await r.query('INSERT INTO MailJob(id,dedupeKey,payload,payloadDigest,emailLogId) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [id,dedupeKey,this.cipher.encrypt(mail,id),digest,emailLogId]);
    const [winner] = await r.query('SELECT id,emailLogId,status,payloadDigest FROM MailJob WHERE dedupeKey=? FOR UPDATE', [dedupeKey]);
    if (winner.payloadDigest !== digest) throw new QueueError('Dedupe key conflicts with another payload');
    if (winner.id !== id) await r.query('DELETE FROM EmailLog WHERE id=?', [emailLogId]); // Only the metadata row this transaction just created.
    return { id: winner.id, emailLogId: winner.emailLogId, status: winner.status };
  }
  async claim(): Promise<ClaimedMail | null> {
    const r = this.db.createQueryRunner(); await r.connect(); await r.startTransaction('READ COMMITTED');
    try {
      // A crash after dispatch began is ambiguous. Never automatically send it again.
      await r.query("UPDATE EmailLog e JOIN MailJob j ON e.id=j.emailLogId SET e.status='uncertain',e.error='worker_lost_after_send_started' WHERE j.status='sending' AND j.leaseUntil<=UTC_TIMESTAMP(3)");
      await r.query("UPDATE MailJob SET status='uncertain',lastError='worker_lost_after_send_started',leaseToken=NULL,leaseUntil=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE status='sending' AND leaseUntil<=UTC_TIMESTAMP(3)");
      await r.query("UPDATE MailJob SET status=IF(attempts>=maxAttempts,'failed','retry'),lastError='worker_lost_before_send',leaseToken=NULL,leaseUntil=NULL,availableAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE status='leased' AND leaseUntil<=UTC_TIMESTAMP(3)");
      await r.query("UPDATE EmailLog e JOIN MailJob j ON e.id=j.emailLogId SET e.status=j.status,e.error=j.lastError WHERE j.status IN ('retry','failed') AND e.status<>j.status");
      const jobs: ClaimedMail[] = await r.query("SELECT id,emailLogId,payload,attempts,maxAttempts FROM MailJob WHERE status IN ('queued','retry') AND availableAt<=UTC_TIMESTAMP(3) AND attempts<maxAttempts ORDER BY availableAt,createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED");
      if (!jobs.length) { await r.commitTransaction(); return null; }
      const job = { ...jobs[0], attempts: jobs[0].attempts + 1, leaseToken: randomBytes(32).toString('hex') };
      await r.query("UPDATE MailJob SET status='leased',attempts=attempts+1,leaseToken=?,leaseUntil=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=?", [job.leaseToken,this.policy.leaseMs * 1000,job.id]);
      await r.commitTransaction(); return job;
    } catch (error) { await r.rollbackTransaction(); throw error; } finally { await r.release(); }
  }
  async heartbeat(job: ClaimedMail): Promise<boolean> {
    const result = await this.db.query("UPDATE MailJob SET leaseUntil=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=? AND status IN ('leased','sending') AND leaseUntil>UTC_TIMESTAMP(3)", [this.policy.leaseMs * 1000,job.id,job.leaseToken]);
    return result.affectedRows === 1;
  }
  async beginSend(job: ClaimedMail): Promise<boolean> {
    const result = await this.db.query("UPDATE MailJob SET status='sending',updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=? AND status='leased' AND leaseUntil>UTC_TIMESTAMP(3)", [job.id,job.leaseToken]);
    return result.affectedRows === 1;
  }
  async finish(job: ClaimedMail, outcome: 'sent' | 'retry' | 'failed' | 'uncertain', code: string | null, providerMessageId: string | null = null): Promise<boolean> {
    if (code !== null && !/^[a-z0-9_]{1,80}$/.test(code)) throw new QueueError('Only redacted error codes may be persisted');
    const status = outcome === 'retry' && job.attempts >= job.maxAttempts ? 'failed' : outcome;
    const delay = Math.min(3600000, this.policy.retryBaseMs * 2 ** (job.attempts - 1));
    const r = this.db.createQueryRunner(); await r.connect(); await r.startTransaction();
    try {
      const result = await r.query("UPDATE MailJob SET status=?,lastError=?,providerMessageId=?,leaseToken=NULL,leaseUntil=NULL,availableAt=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(3)),updatedAt=UTC_TIMESTAMP(3) WHERE id=? AND leaseToken=? AND status IN ('leased','sending') AND (?<>'sent' OR status='sending') AND leaseUntil>UTC_TIMESTAMP(3)", [status,code,providerMessageId?.slice(0,255) ?? null,delay * 1000,job.id,job.leaseToken,status]);
      if (result.affectedRows !== 1) { await r.rollbackTransaction(); return false; }
      await r.query('UPDATE EmailLog SET status=?,error=? WHERE id=?', [status,code,job.emailLogId]);
      await r.commitTransaction(); return true;
    } catch (error) { await r.rollbackTransaction(); throw error; } finally { await r.release(); }
  }
}
