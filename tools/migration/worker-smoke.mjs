// Actual process crash/restart acceptance using only synthetic mail and a local SMTP socket.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { database, assertSchema, MailQueue, PayloadCipher } from '@so7ob/server';
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? '')) throw new Error('Worker smoke requires an isolated so7ob_*_test database');
const db = await database(); await assertSchema(db);
const secret = randomBytes(32).toString('hex'); const queue = new MailQueue(db,new PayloadCipher(secret));
const created = []; const children = new Set(); const sockets = new Set();
let accepted = 0; let mode = 'accept';
const server = createServer(socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.write('220 local.test ESMTP\r\n');
  let pending = ''; let data = false;
  socket.on('data', chunk => {
    pending += chunk.toString();
    while (pending.includes('\r\n')) {
      const at = pending.indexOf('\r\n'); const line = pending.slice(0,at); pending = pending.slice(at+2);
      if (data) { if (line === '.') { accepted++; data = false; if (mode === 'accept') socket.write('250 accepted\r\n'); } continue; }
      if (/^(EHLO|HELO|MAIL FROM|RCPT TO)/.test(line)) socket.write('250 OK\r\n');
      else if (line === 'DATA') { data = true; socket.write('354 send data\r\n'); }
      else if (line === 'QUIT') socket.end('221 bye\r\n');
    }
  });
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const port = server.address().port;
function worker() {
  const child = spawn(process.execPath,['apps/worker/dist/main.js','--once'], { env: { ...process.env, OUTBOX_KEY:secret, NODE_ENV:'test', SMTP_HOST:'127.0.0.1', SMTP_PORT:String(port), SMTP_FROM:'test@example.invalid', SMTP_ALLOW_INSECURE_LOCAL:'true' }, stdio:['ignore','pipe','pipe'] });
  children.add(child); child.once('exit',()=>children.delete(child));
  // Drain without logging any provider data.
  child.stdout.resume(); child.stderr.resume();
  return child;
}
async function enqueue() {
  const r = db.createQueryRunner(); await r.connect(); await r.startTransaction();
  try { const job = await queue.enqueue(r,{ to:'test@example.invalid', subject:'Synthetic process test', text:'No real mail or account token.' },createHash('sha256').update(randomBytes(32)).digest('hex')); await r.commitTransaction(); created.push(job); return job; }
  catch(e) { await r.rollbackTransaction(); throw e; } finally { await r.release(); }
}
async function until(condition) { const deadline = Date.now()+15000; while (!await condition()) { if (Date.now()>deadline) throw new Error('Worker smoke timed out'); await delay(25); } }
try {
  const sent = await enqueue(); const normal = worker(); assert.equal((await once(normal,'exit'))[0],0);
  assert.equal((await db.query('SELECT status FROM MailJob WHERE id=?',[sent.id]))[0].status,'sent'); assert.equal(accepted,1);
  mode = 'hold'; const ambiguous = await enqueue(); const doomed = worker();
  await until(() => accepted === 2); const exit = once(doomed,'exit'); doomed.kill('SIGKILL'); await exit;
  assert.equal((await db.query('SELECT status FROM MailJob WHERE id=?',[ambiguous.id]))[0].status,'sending');
  // Advance only this synthetic lease instead of delaying the suite for a minute.
  await db.query('UPDATE MailJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?',[ambiguous.id]);
  mode = 'accept'; const restarted = worker(); assert.equal((await once(restarted,'exit'))[0],0);
  assert.equal((await db.query('SELECT status FROM MailJob WHERE id=?',[ambiguous.id]))[0].status,'uncertain'); assert.equal(accepted,2);
  process.stdout.write(JSON.stringify({ test:'actual worker process', smtpAccepted:1, killedAfterData:1, restart:'uncertain without resend', database:'real MariaDB', passed:true })+'\n');
} finally {
  for (const child of children) child.kill('SIGTERM');
  for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
  for (const job of created) { await db.query('DELETE FROM MailJob WHERE id=?',[job.id]); await db.query('DELETE FROM EmailLog WHERE id=?',[job.emailLogId]); }
  await db.destroy();
}
