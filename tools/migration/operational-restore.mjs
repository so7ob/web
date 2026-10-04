// Destructive fault injection is restricted to newly created synthetic databases and owned children.
// No existing database, process, secret file, development data or production endpoint is used.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, realpathSync, createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { createDataSource, assertSchema, AuthenticationService, MailQueue, PayloadCipher, WebhookCipher, sha256, transaction } from '@so7ob/server';
import { verifyRecoveryKeys } from '../../packages/server/dist/migration/recovery.js';
import { backup, restore } from '../../packages/server/dist/migration/backup.js';

const host = process.env.DATABASE_HOST;
assert(['127.0.0.1', '::1'].includes(host), 'Explicit loopback MariaDB required');
assert.equal(process.env.RESTORE_REHEARSAL, 'synthetic-only', 'Explicit synthetic rehearsal opt-in required');
assert.notEqual(process.env.NODE_ENV, 'production');
assert(process.env.DATABASE_USER && process.env.DATABASE_PORT, 'Explicit test database credentials/port required');
const run = randomBytes(6).toString('hex');
const sourceName = `so7ob_restore_${run}_source_test`, targetName = `so7ob_restore_${run}_target_test`;
const root = resolve('.migration/operational-restore', run);
mkdirSync(root, { recursive: true, mode: 0o700 });
const sourceEnv = { ...process.env, DATABASE_NAME: sourceName, MIGRATION_WRITES_PAUSED: 'yes' };
const targetEnv = { ...sourceEnv, DATABASE_NAME: targetName };
const source = createDataSource(sourceEnv), target = createDataSource(targetEnv);
const children = new Set(), sockets = new Set();
const phases = [];
const mark = name => { phases.push(name); process.stdout.write(`PASS ${name}\n`); };
const hashFile = async path => { const h = createHash('sha256'); for await (const b of createReadStream(path)) h.update(b); return h.digest('hex'); };
async function command(binary, args, options = {}) {
  const child = spawn(binary, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const [code] = await once(child, 'exit'); assert.equal(code, 0, `${binary} failed (output intentionally redacted)`);
}
function worker(env, cwd) {
  const child = spawn(process.execPath, ['apps/worker/dist/main.js', '--once'], {
    cwd, env: { ...env, NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_FROM: 'restore@example.invalid', SMTP_ALLOW_INSECURE_LOCAL: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child); child.once('exit', () => children.delete(child)); child.stdout.resume(); child.stderr.resume(); return child;
}
async function stop(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}
async function until(check, label) {
  const limit = Date.now() + 20000;
  while (!await check()) { assert(Date.now() < limit, label); await delay(25); }
}
// Never log synthetic credentials or queue bodies; a separate vault models separately protected key recovery.
const keys = { OUTBOX_KEY: randomBytes(32).toString('hex'), AUTH_SECRET: randomBytes(32).toString('hex') };
const vault = join(root, 'vault'); mkdirSync(vault, { mode: 0o700 });
writeFileSync(join(vault, 'keys.json'), JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
const sourceData = join(root, 'source-data'), targetData = join(root, 'restored-data');
mkdirSync(join(sourceData, 'uploads'), { recursive: true, mode: 0o700 });
const release = join(root, 'restored-release');
const mail = { to: 'restore@example.invalid', subject: 'Synthetic operational restore', text: 'استعادة تجريبية — not a real account token.' };
let smtpMode = 'hold', smtpAccepted = 0;
const smtp = createServer(socket => {
  sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
  socket.write('220 restore.invalid ESMTP\r\n'); let pending = '', data = false;
  socket.on('data', chunk => {
    pending += chunk.toString();
    while (pending.includes('\r\n')) {
      const n = pending.indexOf('\r\n'), line = pending.slice(0, n); pending = pending.slice(n + 2);
      if (data) { if (line === '.') { smtpAccepted++; data = false; if (smtpMode === 'accept') socket.write('250 accepted\r\n'); } continue; }
      if (/^(EHLO|HELO|MAIL FROM|RCPT TO)/.test(line)) socket.write('250 OK\r\n');
      else if (line === 'DATA') { data = true; socket.write('354 data\r\n'); }
      else if (line === 'QUIT') socket.end('221 bye\r\n');
    }
  });
});
async function rows(db) {
  const tables = await db.query('SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [db.options.database]);
  const result = {};
  for (const { name } of tables) {
    assert(/^[A-Za-z0-9_]+$/.test(name));
    result[name] = (await db.query('SELECT * FROM `' + name + '`')).map(row => JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(k => [k, row[k]])))).sort();
  }
  return result;
}
let failure;
try {
  const admin = await mysql.createConnection({ host, port: Number(process.env.DATABASE_PORT), user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
  try {
    // No IF NOT EXISTS: existing names are a hard failure. No DROP, reset or automatic cleanup.
    await admin.query(`CREATE DATABASE \`${sourceName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin`);
    await admin.query(`CREATE DATABASE \`${targetName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin`);
  } finally { await admin.end(); }
  await source.initialize(); await source.runMigrations(); await assertSchema(source); await target.initialize();
  const auth = new AuthenticationService(source, { ...sourceEnv, ...keys });
  await source.query("INSERT INTO Role (`key`,nameAr,nameEn,permissions) VALUES('client','العميل','Client','[]')");
  const password = 'Synthetic-Restore-4829';
  await source.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES('restore-user','restore@example.invalid','عميل تجريبي',?,'client','active')", [await bcrypt.hash(password, 12)]);
  const active = await auth.login(mail.to, password, 'restore-rehearsal', '127.0.0.1');
  const revoked = await auth.login(mail.to, password, 'restore-rehearsal', '127.0.0.1');
  const expired = await auth.login(mail.to, password, 'restore-rehearsal', '127.0.0.1');
  assert(active && revoked && expired); await auth.logout(revoked.raw);
  await source.query('UPDATE AuthSession SET expiresAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE fingerprint=?', ['opaque-v1:' + sha256('so7ob-opaque-session:v1:' + expired.raw)]);
  const filename = 'synthetic.png', bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  writeFileSync(join(sourceData, 'uploads', 'arabic.txt'), 'استعادة UTF-8', { mode: 0o600 });
  writeFileSync(join(sourceData, 'uploads', filename), bytes, { mode: 0o600 });
  // Include a referenced public file and an unreferenced durable cleanup job in the same snapshot.
  await source.query("INSERT INTO MediaItem(id,filename,storedName,mimeType,size,folder) VALUES('restoremedia','تجريبي.png',?,'image/png',?,'general')", [filename, bytes.length]);
  writeFileSync(join(sourceData, 'uploads', 'orphan.txt'), 'synthetic orphan', { mode: 0o600 });
  const queue = new MailQueue(source, new PayloadCipher(keys.OUTBOX_KEY));
  const enqueue = label => transaction(source, r => queue.enqueue(r, mail, sha256('restore:' + run + ':' + label)));
  const ambiguous = await enqueue('ambiguous');
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  const crashed = worker({ ...sourceEnv, ...keys, DATA_DIR: sourceData }, process.cwd());
  await until(async () => smtpAccepted === 1, 'SMTP did not receive DATA');
  await stop(crashed, 'SIGKILL');
  assert.equal((await source.query('SELECT status FROM MailJob WHERE id=?', [ambiguous.id]))[0].status, 'sending');
  // Advance only the killed synthetic job's lease; acceptance is unknown, never retry it.
  await source.query('UPDATE MailJob SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?', [ambiguous.id]);
  const pending = await enqueue('pending');
  const webhookCipher = new WebhookCipher(keys.OUTBOX_KEY);
  const hook = { url: 'http://127.0.0.1:1/synthetic-unused', body: 'synthetic restored historical webhook' };
  await source.query("INSERT INTO WebhookJob(id,dedupeKey,payload,payloadDigest,status) VALUES('restorehook',?,?,?,'sent')", [sha256('restorehook:' + run), webhookCipher.encrypt(hook, 'restorehook'), webhookCipher.digest(hook)]);
  for (let i = 1; i <= 101; i++) {
    const id = 'restorehook' + String(i).padStart(3, '0');
    await source.query("INSERT INTO WebhookJob(id,dedupeKey,payload,payloadDigest,status) VALUES(?,?,?,?,'sent')", [id, sha256(id + run), webhookCipher.encrypt(hook, id), webhookCipher.digest(hook)]);
  }
  await source.query("INSERT INTO FileCleanupJob(id,storedName) VALUES('restore-cleanup','orphan.txt')");
  mark('actual worker killed after SMTP DATA; sending state retained');

  const archive = join(root, 'release.tar');
  const paths = ['package.json', 'package-lock.json', 'node_modules', 'public', 'ops'];
  for (const workspace of ['apps/api', 'apps/worker', 'apps/web', 'packages/server', 'packages/contracts']) {
    paths.push(workspace + '/package.json', workspace + '/dist');
    if (existsSync(workspace + '/node_modules')) paths.push(workspace + '/node_modules');
  }
  await command('tar', ['-cf', archive, ...paths]);
  const releaseHash = await hashFile(archive);
  mkdirSync(release, { mode: 0o700 }); await command('tar', ['-xf', archive, '-C', release]);
  // Every archived path (including dependency bytes and workspace links) must match its recovered copy.
  await command('tar', ['--compare', '-f', archive, '-C', release]);
  assert.equal(await hashFile(join(release, 'package-lock.json')), await hashFile('package-lock.json'));
  for (const workspace of ['server', 'contracts']) assert.equal(realpathSync(join(release, 'node_modules/@so7ob', workspace)), join(release, 'packages', workspace));
  mark('offline release including locked dependencies copied and byte-verified');
  const before = await rows(source);
  const snapshot = join(root, 'backup');
  await backup(sourceEnv, join(sourceData, 'uploads'), snapshot, sourceName);
  assert(!existsSync(join(snapshot, 'keys.json'))); assert.equal(statSync(join(vault, 'keys.json')).mode & 0o777, 0o600);
  await restore(target, targetEnv, snapshot, join(targetData, 'uploads'), targetName); await assertSchema(target);
  const restored = await rows(target); assert.deepEqual(restored, before, 'All tables/IDs/values/dates/queue state must match before application writes');
  assert.deepEqual(readFileSync(join(targetData, 'uploads', filename)), bytes);
  await assert.rejects(restore(target, targetEnv, snapshot, join(root, 'overwrite-attempt'), targetName), /empty database/);
  assert.deepEqual(await rows(target), restored);
  mark('all MariaDB tables and files restored; occupied target rejected without mutation');
  const recoveredKeys = JSON.parse(readFileSync(join(vault, 'keys.json'), 'utf8'));
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, OUTBOX_KEY: '' }, targetName));
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, sourceName));
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, OUTBOX_KEY: randomBytes(32).toString('hex') }, targetName));
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys, MIGRATION_WRITES_PAUSED: 'no' }, targetName));
  assert.deepEqual(await verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, targetName), { ok: true, checked: { MailJob: 2, WebhookJob: 102 } });
  const [job] = await target.query('SELECT id,payload FROM MailJob WHERE id=?', [pending.id]);
  assert.throws(() => new PayloadCipher(randomBytes(32).toString('hex')).decrypt(job.payload, job.id), /authenticated/);
  assert.deepEqual(new PayloadCipher(recoveredKeys.OUTBOX_KEY).decrypt(job.payload, job.id), mail);
  assert.deepEqual(await rows(target), restored, 'Key preflight must not consume or fail queued jobs');
  const [savedHook] = await target.query("SELECT payload FROM WebhookJob WHERE id='restorehook101'");
  await target.query("UPDATE WebhookJob SET payload='corrupt' WHERE id='restorehook101'");
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, targetName), /invalid/);
  await target.query("UPDATE WebhookJob SET payload=? WHERE id='restorehook101'", [savedHook.payload]);
  await target.query("INSERT INTO WebhookJob(id,dedupeKey,payload,payloadDigest,status) VALUES('',?,'corrupt',?,'sent')", [sha256('empty' + run), sha256('invalid')]);
  await assert.rejects(verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, targetName), /invalid/);
  await target.query("DELETE FROM WebhookJob WHERE id=''");
  const preflights = await Promise.all([verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, targetName), verifyRecoveryKeys(target, { ...targetEnv, ...recoveredKeys }, targetName)]);
  assert(preflights.every(result => result.ok)); assert.deepEqual(await rows(target), restored);
  mark('separate key recovery; missing/wrong key rejected before worker and without mutation');

  // Start the recovered application from recovered code/dependencies; no runtime symlink to the old release.
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: release, env: { ...targetEnv, ...recoveredKeys, NODE_ENV: 'production', DATA_DIR: targetData, PORT: String(port), BIND_HOST: '127.0.0.1', SITE_URL: origin, WEB_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(api); api.once('exit', () => children.delete(api)); api.stdout.resume(); api.stderr.resume();
  await until(async () => { assert.equal(api.exitCode, null, 'Recovered API exited'); try { return (await fetch(origin + '/api/health/ready')).ok; } catch { return false; } }, 'Recovered API startup timed out');
  const session = async raw => (await fetch(origin + '/api/auth/session', { headers: { Cookie: '__Host-so7ob.session=' + raw } })).json();
  assert.equal((await session(active.raw)).user.id, 'restore-user'); assert.deepEqual(await session(revoked.raw), {}); assert.deepEqual(await session(expired.raw), {});
  const file = await fetch(origin + '/api/media/restoremedia'); assert.equal(file.status, 200); assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  await stop(api);
  mark('recovered Nest reads files and live session; revoked/expired sessions stay rejected');
  smtpMode = 'accept';
  const recoveredWorker = worker({ ...targetEnv, ...recoveredKeys, DATA_DIR: targetData }, release); assert.equal((await once(recoveredWorker, 'exit'))[0], 0);
  assert.equal((await target.query('SELECT status FROM MailJob WHERE id=?', [ambiguous.id]))[0].status, 'uncertain');
  assert.equal((await target.query('SELECT status FROM MailJob WHERE id=?', [pending.id]))[0].status, 'sent');
  assert.equal(smtpAccepted, 2, 'Recovered worker must send only the previously queued job');
  assert(!existsSync(join(targetData, 'uploads', 'orphan.txt'))); assert(existsSync(join(targetData, 'uploads', filename)));
  const repeated = worker({ ...targetEnv, ...recoveredKeys, DATA_DIR: targetData }, release); assert.equal((await once(repeated, 'exit'))[0], 0); assert.equal(smtpAccepted, 2);
  mark('recovered worker marks ambiguous mail uncertain; pending mail sent once; cleanup resumes; repeat sends nothing');
  // Opening writes ends rollback: prove restore refuses to overwrite subsequent data.
  await target.query("INSERT INTO SiteSetting (`key`,value) VALUES('restore-post-open','كتابة جديدة')");
  await assert.rejects(restore(target, targetEnv, snapshot, join(root, 'after-open-attempt'), targetName), /empty database/);
  assert.equal((await target.query("SELECT value FROM SiteSetting WHERE `key`='restore-post-open'"))[0].value, 'كتابة جديدة');
  assert.deepEqual(await rows(source), before, 'The original synthetic database must remain frozen');
  mark('post-open writes protected; original snapshot remains unchanged');
  const summary = { syntheticOnly: true, productionMigration: false, codeBaseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), at: new Date().toISOString(), node: process.version, releaseSha256: releaseHash, lockSha256: await hashFile('package-lock.json'), sourceDatabase: sourceName, targetDatabase: targetName, tables: Object.fromEntries(Object.entries(before).map(([name, values]) => [name, { rows: values.length, sha256: sha256(JSON.stringify(values)) }])), phases, smtpDataReceived: smtpAccepted, recipientDeliveryProven: false, scope: 'synthetic host-local recovery; not off-host disaster recovery or production cutover' };
  writeFileSync(join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ passed: true, summary: join(root, 'summary.json') }) + '\n');
} catch (error) { failure = error; }
finally {
  for (const child of children) await stop(child);
  for (const socket of sockets) socket.destroy();
  if (smtp.listening) await new Promise(resolve => smtp.close(resolve));
  if (source.isInitialized) await source.destroy(); if (target.isInitialized) await target.destroy();
}
if (failure) { process.stderr.write(`Operational restore failed: ${failure.message}\n`); process.exitCode = 1; }
