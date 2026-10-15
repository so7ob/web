import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES, auditTerm, auditDisplayValue, type AuthUser } from '@so7ob/contracts';
import { createDataSource } from '../database/data-source.js';
import { AdminOperationsService } from './operations.js';
import { AuditReader, permit, project } from '../audit/reader.js';
import { diff, safeChanges } from '../audit/redaction.js';

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name)) throw new Error('Real isolated MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name }), ops = new AdminOperationsService(db);
const prefix = 'ann111' + randomBytes(5).toString('hex');
const actor: AuthUser = { id: prefix, email: prefix + '@example.invalid', name: 'Synthetic announcement manager', roleKey: 'super_admin', status: 'active', locale: 'en', emailVerified: true, permissions: [] };
let createdRole = false;
const keys = ['announcement.enabled', 'announcement.messageAr', 'announcement.messageEn', 'announcement.revision', 'announcement.ctaUrl', 'contact.email', 'response.hours', 'response.effectiveAt'];
const placeholders = keys.map(() => '?').join(',');
const scopes = keys.map(key => 'setting:' + key);
const trigger = prefix + '_audit_failure';
const previous = { 'announcement.enabled': 'false', 'announcement.messageAr': 'إعلان قديم اصطناعي', 'announcement.messageEn': 'Old synthetic announcement' };
let originalRevisions: Array<Record<string, unknown>> = [];
const events = () => db.query("SELECT * FROM AuditLog WHERE actorId=? AND action='settings.updated' ORDER BY createdAt,id", [actor.id]);
const seed = async (settings: Record<string, string>) => {
  for (const [key, value] of Object.entries(settings)) await db.query('INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updatedById=VALUES(updatedById)', [key, value, actor.id]);
};
async function restore(table: 'SiteSetting' | 'AdminRevision', column: 'key' | 'scope', values: string[], rows: Array<Record<string, unknown>>) {
  await db.query('DELETE FROM ' + table + ' WHERE `' + column + '` IN (' + placeholders + ')', values);
  for (const row of rows) {
    const columns = Object.keys(row);
    await db.query('INSERT INTO ' + table + ' (' + columns.map(key => '`' + key + '`').join(',') + ') VALUES (' + columns.map(() => '?').join(',') + ')', columns.map(key => row[key]));
  }
}
let original: Array<Record<string, unknown>> = [];
beforeAll(async () => {
  await db.initialize(); await db.runMigrations();
  original = await db.query('SELECT * FROM SiteSetting WHERE `key` IN (' + placeholders + ')', keys);
  originalRevisions = await db.query('SELECT * FROM AdminRevision WHERE scope IN (' + placeholders + ')', scopes);
  const role = SYSTEM_ROLES.find(role => role.key === 'super_admin')!;
  createdRole = !(await db.query('SELECT `key` FROM Role WHERE `key`=?', [role.key])).length;
  if (createdRole) await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)', [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)]);
  await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'unusable-synthetic-fixture','super_admin','active')", [actor.id, actor.email, actor.name]);
});
beforeEach(async () => {
  await db.query('DELETE FROM AuditLog WHERE actorId=?', [actor.id]);
  await restore('SiteSetting', 'key', keys, original);
  await seed(previous);
});
afterAll(async () => {
  if (!db.isInitialized) return;
  try {
    await db.query('DROP TRIGGER IF EXISTS `' + trigger + '`');
    await restore('SiteSetting', 'key', keys, original);
    await restore('AdminRevision', 'scope', scopes, originalRevisions);
    await db.query('DELETE FROM AuditLog WHERE actorId=?', [actor.id]);
    await db.query('DELETE FROM User WHERE id=?', [actor.id]);
    if (createdRole && !(await db.query("SELECT id FROM User WHERE roleKey='super_admin'")).length) await db.query("DELETE FROM Role WHERE `key`='super_admin'");
  } finally { await db.destroy(); }
});

it('records the confirmed announcement toggle and bilingual text before/after inside the successful save', async () => {
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
  expect(events[0]).toMatchObject({ entityType: 'settings', entityId: null, resourceRef: 'announcement', hasChanges: 1, reasonCode: null });
  expect((await new AuditReader(db).detail(actor, events[0].id)).event.changes).toEqual(payload.changes);
});

it('records a single field, disabling and empty text with localized field and boolean labels', async () => {
  await seed({ 'announcement.enabled': 'true' });
  await ops.updateSettings(actor, { 'announcement.enabled': 'false' });
  let [row] = await events();
  expect(JSON.parse(row.eventPayload).changes).toEqual([{ path: 'announcement.enabled', before: { state: 'value', value: true }, after: { state: 'value', value: false } }]);
  expect(auditTerm('announcement.enabled', 'ar')).toBe('تفعيل الإعلان');
  expect(auditTerm('announcement.messageAr', 'en')).toBe('Arabic announcement text');
  expect(auditTerm('announcement.messageEn', 'ar')).toBe('نص الإعلان الإنجليزي');
  expect(auditDisplayValue({ state: 'value', value: false }, 'ar')).toBe('لا');
  expect(auditDisplayValue({ state: 'value', value: true }, 'en')).toBe('Yes');
  await db.query('DELETE FROM AuditLog WHERE actorId=?', [actor.id]);
  await ops.updateSettings(actor, { 'announcement.messageEn': '' });
  [row] = await events();
  expect(JSON.parse(row.eventPayload).changes).toEqual([{ path: 'announcement.messageEn', before: { state: 'value', value: previous['announcement.messageEn'] }, after: { state: 'empty' } }]);
});

it('uses effective defaults for previously absent settings without inventing missing historical values', async () => {
  await db.query('DELETE FROM SiteSetting WHERE `key` IN (?,?,?)', Object.keys(previous));
  await ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.messageAr': 'إعلان افتراضي اصطناعي' });
  const [row] = await events(), payload = JSON.parse(row.eventPayload);
  expect(payload.changes).toEqual([
    { path: 'announcement.enabled', before: { state: 'value', value: false }, after: { state: 'value', value: true } },
    { path: 'announcement.messageAr', before: { state: 'empty' }, after: { state: 'value', value: 'إعلان افتراضي اصطناعي' } },
  ]);
});

it('truthfully distinguishes unchanged public values from a change to excluded settings', async () => {
  await ops.updateSettings(actor, { ...previous });
  let [row] = await events();
  expect(row).toMatchObject({ hasChanges: 0, reasonCode: 'no_change' });
  expect(JSON.parse(row.eventPayload)).toMatchObject({ changes: [], safeFields: { 'announcement.enabled': { state: 'value', value: false } } });
  await db.query('DELETE FROM AuditLog WHERE actorId=?', [actor.id]);
  await ops.updateSettings(actor, { ...previous, 'announcement.ctaUrl': '/synthetic111?token=private111' });
  [row] = await events();
  expect(row).toMatchObject({ hasChanges: 0, reasonCode: null });
  expect(JSON.parse(row.eventPayload)).toMatchObject({ changes: [], safeFields: {} });
  expect(row.eventPayload + row.details).not.toContain('private111');
});

it('excludes unrelated settings, URL tokens and unexpected sensitive fields from both stored and read projections', async () => {
  await ops.updateSettings(actor, { 'announcement.messageEn': 'Allowed public copy', 'contact.email': 'private111@example.invalid', 'announcement.ctaUrl': '/synthetic111?token=private111', 'auth.secret': 'unregistered-secret111' });
  const [row] = await events(), visible = (await new AuditReader(db).detail(actor, row.id)).event;
  expect(visible.changes.map(change => change.path)).toEqual(['announcement.messageEn']);
  expect(row.resourceRef).toBeNull();
  for (const value of ['private111@example.invalid', 'token=private111', 'unregistered-secret111']) expect(row.eventPayload + row.details + JSON.stringify(visible)).not.toContain(value);
  const forged = ['announcement.enabled.secret', 'announcement.messageAr.token', 'announcement.ctaUrl', 'contact.email', 'password'].map(path => ({ path, before: { state: 'value', value: 'private111' }, after: { state: 'value', value: 'private112' } }));
  expect(safeChanges('settings.updated', forged)).toEqual([]);
  expect(diff('settings.updated', {}, { 'announcement.ctaUrl': 'private111', 'contact.email': 'private111', password: 'private111' }).changes).toEqual([]);
  expect(safeChanges('page.created', [{ path: 'announcement.messageEn', before: { state: 'empty' }, after: { state: 'value', value: 'private111' } }])).toEqual([]);
});

it('does not claim no change when an equal response-hours save refreshes the effective policy time', async () => {
  await seed({ 'response.hours': '24' });
  await ops.updateSettings(actor, { ...previous, 'response.hours': '24', 'response.applyToExisting': true });
  const [row] = await events();
  expect(row.reasonCode).toBeNull();
  expect(JSON.parse(row.eventPayload).changes).toEqual([]);
  expect(JSON.parse(row.eventPayload).context).toMatchObject({ responseHours: '24', appliesToExisting: true });
});

it('rejects invalid, oversized and stale saves without partial settings, revisions or success events', async () => {
  const baseline = await ops.settings(actor);
  await expect(ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.messageEn': 'x'.repeat(281) })).rejects.toMatchObject({ status: 400 });
  await expect(ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.ctaUrl': 'javascript:alert(1)' })).rejects.toMatchObject({ status: 400 });
  expect(await ops.settings(actor)).toEqual(baseline);
  expect(await events()).toHaveLength(0);
  await ops.updateSettings(actor, { 'announcement.messageAr': 'حفظ ناجح اصطناعي', baseRevisions: baseline.revisions }, true);
  const saved = await ops.settings(actor);
  // The first field advances before the stale second field; both must roll back.
  await expect(ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.messageAr': 'stale111', baseRevisions: baseline.revisions }, true)).rejects.toMatchObject({ status: 409, code: 'conflict' });
  expect(await ops.settings(actor)).toEqual(saved);
  expect(await events()).toHaveLength(1);
});

it('serializes competing checked writes and records only the committed before/after', async () => {
  const { revisions } = await ops.settings(actor);
  const results = await Promise.allSettled(['Winner A111', 'Winner B111'].map(value => ops.updateSettings(actor, { 'announcement.messageEn': value, baseRevisions: revisions }, true)));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'conflict' } });
  const rows = await events();
  expect(rows).toHaveLength(1);
  const settings = await ops.settings(actor);
  expect(JSON.parse(rows[0].eventPayload).changes).toEqual([{ path: 'announcement.messageEn', before: { state: 'value', value: previous['announcement.messageEn'] }, after: { state: 'value', value: settings.settings['announcement.messageEn'] } }]);
});

it('rolls back settings and revisions if the actor-scoped audit insert fails', async () => {
  const baseline = await ops.settings(actor);
  await db.query("CREATE TRIGGER `" + trigger + "` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorId='" + actor.id + "' AND NEW.action='settings.updated' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic announcement111 audit fault'; END IF; END");
  try {
    await expect(ops.updateSettings(actor, { 'announcement.enabled': 'true', 'announcement.messageEn': 'Must roll back111', baseRevisions: baseline.revisions }, true)).rejects.toThrow('synthetic announcement111 audit fault');
    expect(await ops.settings(actor)).toEqual(baseline);
    expect(await events()).toHaveLength(0);
  } finally { await db.query('DROP TRIGGER IF EXISTS `' + trigger + '`'); }
});

it('preserves settings, audit and export permission boundaries', async () => {
  const client = { ...actor, roleKey: 'client', permissions: [] }, baseline = await ops.settings(actor);
  await expect(ops.updateSettings(client, { 'announcement.enabled': 'true' })).rejects.toMatchObject({ status: 403 });
  expect(await ops.settings(actor)).toEqual(baseline);
  expect(await events()).toHaveLength(0);
  await ops.updateSettings(actor, { 'announcement.enabled': 'true' });
  const [row] = await events();
  await expect(new AuditReader(db).detail(client, row.id)).rejects.toMatchObject({ status: 403 });
  expect(() => permit({ ...actor, roleKey: 'audit_reader111', permissions: ['audit.view'] }, 'audit.export')).toThrow('forbidden');
});

it('does not reconstruct absent before/after in old schema-zero or schema-one events from current settings', async () => {
  await ops.updateSettings(actor, { 'announcement.enabled': 'true' });
  const [row] = await events();
  for (const schemaVersion of [0, 1]) {
    const historical = project({ ...row, schemaVersion, reasonCode: null, hasChanges: 0, eventPayload: JSON.stringify({ changes: [], safeFields: {}, context: { keys: Object.keys(previous) } }), details: JSON.stringify({ keys: Object.keys(previous) }) }, actor);
    expect(historical.changes).toEqual([]);
    expect(historical.safeFields).toEqual({});
    expect(historical.reasonCode).toBeNull();
    expect(historical.historical).toBe(schemaVersion === 0);
  }
});
