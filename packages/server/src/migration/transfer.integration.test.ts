import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { compareSync } from 'bcryptjs';
import { createDataSource } from '../database/data-source.js';
import { schema, identifier as q } from '../database/schema.js';
import { syntheticSnapshot, fixtureInstant } from './fixture.js';
import { readSnapshot, orderedTables, primaryKey } from './snapshot.js';
import { transfer, type TransferOptions } from './transfer.js';
const env = { ...process.env, DATABASE_NAME: process.env.TEST_DATABASE_NAME };
if (!env.DATABASE_NAME || !/^so7ob_[a-z0-9_]+_test$/.test(env.DATABASE_NAME)) throw new Error('An isolated test MariaDB is required');
const db = createDataSource(env); const root = mkdtempSync(join(tmpdir(), 'so7ob-transfer-'));
const fixture = syntheticSnapshot(join(root, 'source')); const targetUploads = join(root, 'target','uploads');
const options: TransferOptions = { ...fixture, targetUploads, expectedDatabase: env.DATABASE_NAME, mode: 'dry-run', writesPaused: true };
let snapshotId = '';
beforeAll(async () => { await db.initialize(); await db.runMigrations(); });
afterAll(async () => {
  if (db.isInitialized) {
    await db.query('DROP TRIGGER IF EXISTS so7ob_test_transfer_failure');
    for (const table of orderedTables().reverse()) await db.query(`DELETE FROM ${q(table)} WHERE ${q(primaryKey(table))}=?`, [`${table}_synthetic`]);
    await db.query("DELETE FROM Role WHERE `key` IN ('Case','case','case ')");
    if (snapshotId) await db.query('DELETE FROM MigrationTransfer WHERE id=?', [snapshotId]);
    await db.destroy();
  }
  rmSync(root, { recursive: true, force: true }); // Only this test's own mkdtemp directory.
});
describe('SQLite + files to real MariaDB', { concurrent: false }, () => {
  it('dry-run inventories all 23 entities and files without writing target data', async () => {
    const report = await transfer(db, options); snapshotId = report.snapshot;
    expect(Object.keys(report.tables)).toHaveLength(23);
    expect(Object.values(report.tables).every(t => t.sourceCount > 0 && t.destinationCount === 0)).toBe(true);
    expect(report.unreferencedFiles).toEqual(['unreferenced.txt']); expect(report.files).toHaveLength(3);
    expect(existsSync(targetUploads)).toBe(false);
    expect(await db.query('SELECT id FROM MigrationTransfer')).toEqual([]);
  });
  it('refuses writes without an offline acknowledgement and refuses a wrong destination', async () => {
    await expect(transfer(db, { ...options, mode: 'apply', writesPaused: false })).rejects.toThrow('writes-paused');
    await expect(transfer(db, { ...options, expectedDatabase: 'wrong' })).rejects.toThrow('confirmation');
  });
  it('rejects missing files, symlinks and orphan message ownership before writing', async () => {
    const path = join(fixture.sourceUploads, 'attachment.pdf'); renameSync(path, path + '.missing');
    await expect(transfer(db, options)).rejects.toThrow('missing'); renameSync(path + '.missing', path);
    const alias = join(root, 'alias'); symlinkSync(fixture.sourceUploads, alias);
    await expect(transfer(db, { ...options, sourceUploads: alias })).rejects.toThrow('symlink');
    const s = new DatabaseSync(fixture.sqlite); s.exec("UPDATE Attachment SET messageId='not-a-message'"); s.close();
    await expect(transfer(db, options)).rejects.toThrow('message link');
    const restore = new DatabaseSync(fixture.sqlite); restore.exec("UPDATE Attachment SET messageId='RequestMessage_synthetic'"); restore.close();
    // SQLite page bytes changed; all subsequent operations pin this exact new snapshot.
    snapshotId = readSnapshot(fixture.sqlite, fixture.sourceUploads).id;
  });
  it('rejects unsupported indexed lengths and a live SQLite journal without altering data', async () => {
    const s = new DatabaseSync(fixture.sqlite); s.prepare('UPDATE User SET email=?').run('x'.repeat(256)); s.close();
    await expect(transfer(db, options)).rejects.toThrow('VARCHAR(255)');
    const restore = new DatabaseSync(fixture.sqlite); restore.exec("UPDATE User SET email='synthetic@example.invalid'"); restore.close();
    writeFileSync(fixture.sqlite + '-wal', 'not-a-closed-snapshot');
    await expect(transfer(db, options)).rejects.toThrow('WAL/journal');
    rmSync(fixture.sqlite + '-wal');
    snapshotId = readSnapshot(fixture.sqlite, fixture.sourceUploads).id;
  });
  it('rejects a competing importer with a database advisory lock', async () => {
    const runner = db.createQueryRunner(); await runner.connect();
    try {
      await runner.query('SELECT GET_LOCK(?,0)', ['so7ob-transfer:' + env.DATABASE_NAME]);
      await expect(transfer(db, options)).rejects.toThrow('Another migration');
    } finally { await runner.query('SELECT RELEASE_LOCK(?)', ['so7ob-transfer:' + env.DATABASE_NAME]); await runner.release(); }
  });
  it('commits completed tables and resumes after a real database failure without duplicates', async () => {
    await db.query("CREATE TRIGGER so7ob_test_transfer_failure BEFORE INSERT ON AuthToken FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic outage'");
    await expect(transfer(db, { ...options, mode: 'apply' })).rejects.toThrow('Synthetic outage');
    const journals = await db.query('SELECT status,completedTables FROM MigrationTransfer WHERE id=?', [snapshotId]);
    expect(journals[0].status).toBe('copying'); expect(JSON.parse(journals[0].completedTables)).toContain('User');
    await db.query('DROP TRIGGER so7ob_test_transfer_failure');
    const result = await transfer(db, { ...options, mode: 'resume' });
    expect(result.status).toBe('verified'); expect(Object.values(result.tables).every(t => t.idsMatch && t.valuesMatch)).toBe(true);
  });
  it('preserves bcrypt, revoked sessions, consumed tokens, expired invites, JSON, NULL and UTC milliseconds', async () => {
    const [user] = await db.query("SELECT * FROM User WHERE id='User_synthetic'");
    expect(compareSync('Synthetic-Only-4829', user.passwordHash)).toBe(true); expect(user.phone).toBeNull(); expect(user.createdAt.valueOf()).toBe(fixtureInstant);
    const [session] = await db.query("SELECT * FROM AuthSession WHERE id='AuthSession_synthetic'"); expect(session.revokedAt.valueOf()).toBe(fixtureInstant - 100); expect(session.fingerprint).toBe('legacy-fingerprint-preserved');
    const [token] = await db.query("SELECT * FROM AuthToken WHERE id='AuthToken_synthetic'"); expect(token.usedAt.valueOf()).toBe(fixtureInstant - 300); expect(token.expiresAt.valueOf()).toBe(fixtureInstant - 200);
    const [invite] = await db.query("SELECT * FROM UserInvite WHERE id='UserInvite_synthetic'"); expect(invite.expiresAt.valueOf()).toBe(fixtureInstant - 1);
    const [draft] = await db.query('SELECT data FROM RequestDraft'); expect(draft.data).toBe('{ "description": "نص 😀", "extra": null }');
    expect(readFileSync(join(targetUploads, 'attachment.pdf'))).toEqual(readFileSync(join(fixture.sourceUploads, 'attachment.pdf')));
    const source = readSnapshot(fixture.sqlite, fixture.sourceUploads);
    for (const table of Object.keys(schema)) expect(Number((await db.query(`SELECT COUNT(*) AS n FROM ${q(table)}`))[0].n)).toBe(source.rows[table].length);
  });
  it('re-applies idempotently and detects changed destination fields and corrupt files', async () => {
    const twice = await transfer(db, { ...options, mode: 'apply' }); expect(twice.status).toBe('verified');
    await db.query("UPDATE Inquiry SET subject='conflicting write' WHERE id='Inquiry_synthetic'");
    await expect(transfer(db, { ...options, mode: 'verify' })).rejects.toThrow('Destination conflict');
    await db.query("UPDATE Inquiry SET subject='Inquiry_subject' WHERE id='Inquiry_synthetic'");
    writeFileSync(join(targetUploads,'attachment.pdf'), 'corrupt');
    await expect(transfer(db, { ...options, mode: 'verify' })).rejects.toThrow('conflicting destination file');
    writeFileSync(join(targetUploads,'attachment.pdf'), readFileSync(join(fixture.sourceUploads,'attachment.pdf')));
    const verified = await transfer(db, { ...options, mode: 'verify' }); expect(verified.status).toBe('verified');
  });
});
