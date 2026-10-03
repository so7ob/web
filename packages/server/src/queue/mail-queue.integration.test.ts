import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { createDataSource } from '../database/data-source.js';
import { hash } from '../migration/snapshot.js';
import { PayloadCipher, type MailInput } from './crypto.js';
import { MailQueue } from './mail-queue.js';
import { processMail, smtpTransport } from './worker.js';
const env = { ...process.env, DATABASE_NAME: process.env.TEST_DATABASE_NAME };
if (!env.DATABASE_NAME || !/^so7ob_[a-z0-9_]+_test$/.test(env.DATABASE_NAME)) throw new Error('Real isolated test MariaDB required');
const db = createDataSource(env); const cipher = new PayloadCipher(randomBytes(32).toString('hex'));
const queue = new MailQueue(db,cipher,{ leaseMs: 2000, retryBaseMs: 0 });
const prefix = randomBytes(8).toString('hex'); const jobIds = new Set<string>(); const logIds = new Set<string>();
const mail: MailInput = { to: 'synthetic@example.invalid', subject: 'اختبار تسليم', text: 'https://example.invalid/reset?token=synthetic-secret-token' };
async function enqueue(label: string, input = mail) {
  const r = db.createQueryRunner(); await r.connect(); await r.startTransaction('READ COMMITTED');
  try { const result = await queue.enqueue(r,input,hash(prefix+label)); await r.commitTransaction(); jobIds.add(result.id); logIds.add(result.emailLogId); return result; }
  catch (e) { await r.rollbackTransaction(); throw e; } finally { await r.release(); }
}
async function expire(id: string) { await db.query('UPDATE MailJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?', [id]); }
async function smtp(mode: 'accept' | 'temporary' | 'permanent' | 'disconnect') {
  const messages: string[] = []; const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.write('220 isolated.test ESMTP\r\n');
    let pending = ''; let inData = false; let message = '';
    socket.on('data', bytes => {
      pending += bytes.toString();
      while (pending.includes('\r\n')) {
        const index = pending.indexOf('\r\n'); const line = pending.slice(0,index); pending = pending.slice(index+2);
        if (inData) {
          if (line === '.') { messages.push(message); inData = false; if (mode === 'disconnect') socket.destroy(); else socket.write('250 2.0.0 accepted\r\n'); }
          else message += line+'\n';
          continue;
        }
        if (/^(EHLO|HELO)/.test(line)) socket.write('250 isolated.test\r\n');
        else if (/^(MAIL FROM|RCPT TO|RSET)/.test(line)) socket.write('250 OK\r\n');
        else if (line === 'DATA') {
          if (mode === 'temporary') socket.write('450 temporarily rejected\r\n');
          else if (mode === 'permanent') socket.write('550 permanently rejected\r\n');
          else { inData = true; socket.write('354 end with dot\r\n'); }
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
      }
    });
  });
  await new Promise<void>(ok => server.listen(0,'127.0.0.1',ok));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No TCP address');
  const transport = smtpTransport({ NODE_ENV:'test', SMTP_HOST:'127.0.0.1', SMTP_PORT:String(address.port), SMTP_FROM:'sender@example.invalid', SMTP_ALLOW_INSECURE_LOCAL:'true' });
  return { transport, messages, close: async () => { transport.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(ok => server.close(() => ok())); } };
}
beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
afterAll(async () => {
  if (db.isInitialized) {
    await db.query('DROP TRIGGER IF EXISTS so7ob_test_queue_ack_failure');
    for (const id of jobIds) await db.query('DELETE FROM MailJob WHERE id=?', [id]);
    for (const id of logIds) await db.query('DELETE FROM EmailLog WHERE id=?', [id]);
    await db.destroy();
  }
});
describe('durable mail queue on MariaDB and local SMTP', { concurrent: false }, () => {
  it('requires a business transaction and rolls back metadata/payload with it', async () => {
    const r = db.createQueryRunner(); await r.connect();
    try {
      await expect(queue.enqueue(r,mail,hash(prefix+'rollback'))).rejects.toThrow('business transaction');
      await r.startTransaction(); const result = await queue.enqueue(r,mail,hash(prefix+'rollback')); await r.rollbackTransaction();
      expect(await db.query('SELECT id FROM MailJob WHERE id=?',[result.id])).toEqual([]); expect(await db.query('SELECT id FROM EmailLog WHERE id=?',[result.emailLogId])).toEqual([]);
    } finally { await r.release(); }
  });
  it('deduplicates concurrent enqueues, rejects conflicting payload and encrypts secrets', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => enqueue('concurrent')));
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    await expect(enqueue('concurrent',{ ...mail,text:'different' })).rejects.toThrow('conflicts');
    const [row] = await db.query('SELECT payload FROM MailJob WHERE id=?',[results[0].id]); expect(row.payload).not.toContain('synthetic-secret-token'); expect(cipher.decrypt(row.payload,results[0].id)).toEqual(mail);
    expect(() => cipher.decrypt(row.payload,'different-id')).toThrow('authenticated');
    const [log] = await db.query('SELECT bodyText,bodyHtml,status FROM EmailLog WHERE id=?',[results[0].emailLogId]); expect(log).toMatchObject({ bodyText:'',bodyHtml:null,status:'queued' });
    const job = await queue.claim(); expect(job?.id).toBe(results[0].id); await queue.finish(job!,'failed','synthetic_cleanup');
  });
  it('atomically claims competing jobs and fences a dead worker before dispatch', async () => {
    const a = await enqueue('claim-a'); const b = await enqueue('claim-b');
    const [first,second] = await Promise.all([queue.claim(),queue.claim()]); expect(new Set([first?.id,second?.id])).toEqual(new Set([a.id,b.id]));
    await queue.finish(second!,'failed','synthetic_cleanup'); await expire(first!.id);
    const recovered = await queue.claim(); expect(recovered?.id).toBe(first!.id); expect(recovered?.leaseToken).not.toBe(first?.leaseToken);
    expect(await queue.beginSend(first!)).toBe(false); expect(await queue.finish(first!,'retry','stale_worker')).toBe(false);
    expect(await queue.heartbeat(recovered!)).toBe(true); await queue.finish(recovered!,'failed','synthetic_cleanup');
  });
  it('does not retry a crashed worker after SMTP dispatch could have started', async () => {
    const row = await enqueue('crash-during-send'); const job = await queue.claim(); expect(job?.id).toBe(row.id);
    expect(await queue.beginSend(job!)).toBe(true); await expire(row.id); expect(await queue.claim()).toBeNull();
    expect((await db.query('SELECT status FROM MailJob WHERE id=?',[row.id]))[0].status).toBe('uncertain');
    expect((await db.query('SELECT status FROM EmailLog WHERE id=?',[row.emailLogId]))[0].status).toBe('uncertain');
  });
  it('marks sent only after real SMTP acceptance and keeps logs free of mail bodies', async () => {
    const local = await smtp('accept');
    try {
      const row = await enqueue('accept'); const job = await queue.claim(); await processMail(queue,job!,local.transport,'sender@example.invalid');
      expect(local.messages).toHaveLength(1); expect(local.messages[0]).toContain('synthetic-secret-token');
      const [result] = await db.query('SELECT status,providerMessageId FROM MailJob WHERE id=?',[row.id]); expect(result.status).toBe('sent'); expect(result.providerMessageId).toContain(row.id);
      expect((await db.query('SELECT bodyText FROM EmailLog WHERE id=?',[row.emailLogId]))[0].bodyText).toBe('');
    } finally { await local.close(); }
  });
  it('retries explicit temporary rejections up to the finite attempt limit', async () => {
    const local = await smtp('temporary');
    try {
      const row = await enqueue('temporary');
      for (let attempt = 1; attempt <= 4; attempt++) { const job = await queue.claim(); expect(job?.attempts).toBe(attempt); await processMail(queue,job!,local.transport,'sender@example.invalid'); }
      expect(await queue.claim()).toBeNull(); expect((await db.query('SELECT status,attempts FROM MailJob WHERE id=?',[row.id]))[0]).toMatchObject({ status:'failed', attempts:4 }); expect(local.messages).toHaveLength(0);
    } finally { await local.close(); }
  });
  it('does not resend after the SMTP connection drops after receiving DATA', async () => {
    const local = await smtp('disconnect');
    try {
      const row = await enqueue('disconnect'); const job = await queue.claim(); await processMail(queue,job!,local.transport,'sender@example.invalid');
      expect(local.messages).toHaveLength(1); expect((await db.query('SELECT status FROM MailJob WHERE id=?',[row.id]))[0].status).toBe('uncertain'); expect(await queue.claim()).toBeNull();
    } finally { await local.close(); }
  });
  it('keeps SMTP acceptance ambiguous when the database acknowledgment fails', async () => {
    const local = await smtp('accept');
    try {
      const row = await enqueue('ack-failure'); const job = await queue.claim();
      await db.query("CREATE TRIGGER so7ob_test_queue_ack_failure BEFORE UPDATE ON MailJob FOR EACH ROW BEGIN IF NEW.status='sent' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic acknowledgment failure'; END IF; END");
      await expect(processMail(queue,job!,local.transport,'sender@example.invalid')).rejects.toThrow('Synthetic acknowledgment failure');
      await db.query('DROP TRIGGER so7ob_test_queue_ack_failure');
      expect(local.messages).toHaveLength(1); expect((await db.query('SELECT status FROM MailJob WHERE id=?',[row.id]))[0].status).toBe('sending');
      await expire(row.id); expect(await queue.claim()).toBeNull(); expect((await db.query('SELECT status FROM MailJob WHERE id=?',[row.id]))[0].status).toBe('uncertain');
    } finally { await local.close(); }
  });
});
