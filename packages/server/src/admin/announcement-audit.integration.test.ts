import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES, type AuthUser } from '@so7ob/contracts';
import { createDataSource } from '../database/data-source.js';
import { AdminOperationsService } from './operations.js';

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name)) throw new Error('Real isolated MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name }), ops = new AdminOperationsService(db);
const prefix = 'ann111' + randomBytes(5).toString('hex');
const actor: AuthUser = { id: prefix, email: prefix + '@example.invalid', name: 'Synthetic announcement manager', roleKey: 'super_admin', status: 'active', locale: 'en', emailVerified: true, permissions: [] };
let createdRole = false;
const keys = ['announcement.enabled', 'announcement.messageAr', 'announcement.messageEn', 'announcement.revision'];
let original: Array<Record<string, unknown>> = [];
beforeAll(async () => {
  await db.initialize(); await db.runMigrations();
  original = await db.query('SELECT * FROM SiteSetting WHERE `key` IN (?,?,?,?)', keys);
  const role = SYSTEM_ROLES.find(role => role.key === 'super_admin')!;
  createdRole = !(await db.query('SELECT `key` FROM Role WHERE `key`=?', [role.key])).length;
  if (createdRole) await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)', [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)]);
  await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'unusable-synthetic-fixture','super_admin','active')", [actor.id, actor.email, actor.name]);
});
afterAll(async () => {
  if (!db.isInitialized) return;
  try {
    await db.query('DELETE FROM SiteSetting WHERE `key` IN (?,?,?,?)', keys);
    for (const row of original) {
      const columns = Object.keys(row);
      await db.query('INSERT INTO SiteSetting (' + columns.map(key => '`' + key + '`').join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')', columns.map(key => row[key]));
    }
    await db.query('DELETE FROM AuditLog WHERE actorId=?', [actor.id]); await db.query('DELETE FROM User WHERE id=?', [actor.id]);
    if (createdRole && !(await db.query("SELECT id FROM User WHERE roleKey='super_admin'")).length) await db.query("DELETE FROM Role WHERE `key`='super_admin'");
  } finally { await db.destroy(); }
});

it('records the confirmed announcement toggle and bilingual text before/after inside the successful save', async () => {
  const previous = { 'announcement.enabled': 'false', 'announcement.messageAr': 'إعلان قديم اصطناعي', 'announcement.messageEn': 'Old synthetic announcement' };
  for (const [key, value] of Object.entries(previous)) await db.query('INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updatedById=VALUES(updatedById)', [key, value, actor.id]);
  const { revisions } = await ops.settings(actor);
  await ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.messageAr': 'إعلان جديد اصطناعي', 'announcement.messageEn': 'New synthetic announcement', baseRevisions: revisions }, true);
  const events = await db.query("SELECT * FROM AuditLog WHERE actorId=? AND action='settings.updated'", [actor.id]);
  expect(events).toHaveLength(1);
  const payload = JSON.parse(events[0].eventPayload);
  expect(payload.changes).toEqual(expect.arrayContaining([
    { path: 'announcement.enabled', before: { state: 'value', value: false }, after: { state: 'value', value: true } },
    { path: 'announcement.messageAr', before: { state: 'value', value: previous['announcement.messageAr'] }, after: { state: 'value', value: 'إعلان جديد اصطناعي' } },
    { path: 'announcement.messageEn', before: { state: 'value', value: previous['announcement.messageEn'] }, after: { state: 'value', value: 'New synthetic announcement' } },
  ]));
  expect(payload.changes).toHaveLength(3);
});
