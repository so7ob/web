import { expect } from '@playwright/test';
import { test as base } from './quota-fixture';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDataSource, WorkflowEngine, transaction } from '@so7ob/server';
import { legacyWorkflow, type WorkflowScope } from '@so7ob/contracts';
import type { DataSource } from 'typeorm';
interface RecordDeadline { id: string; ref: string; response: string; stage: string; responseHour: string; stageHour: string }
export const test = base.extend<{
  deadlineScope: WorkflowScope; deadlineAdmin: boolean;
  deadlines: { db: DataSource; version: string; selector: string; records: RecordDeadline[] };
}>({
  deadlineScope: ['requests', { option: true }], deadlineAdmin: [false, { option: true }],
  deadlines: [async ({ page, deadlineScope: scope, deadlineAdmin }, use) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const selector = 'd100' + randomBytes(5).toString('hex'), staff = selector + 'staff', role = selector + 'role';
    const records: RecordDeadline[] = [], calendars: string[] = [];
    const login = async (email: string) => {
      const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
      expect((await page.request.post('/api/auth/callback/credentials', { form: { email, password, csrfToken, json: 'true' } })).status()).toBe(200);
      return { 'x-csrf-token': csrfToken };
    };
    const headers = await login(prefix + 'admin@example.invalid');
    const post = async (path: string, payload: unknown): Promise<{ id: string }> => {
      const response = await page.request.post('/api/admin/workflows/' + path, { headers, data: { payload } });
      expect(response.status(), await response.text()).toBe(201); return response.json();
    };
    const db = await createDataSource().initialize(); let flow = '', version = '';
    try {
      const calendar = { timezone: 'Asia/Aden', week: Array.from({ length: 7 }, (_, day) => day < 5 ? [{ start: '08:00', end: '16:00' }] : []), exceptions: [] };
      const calendarId = (await post('calendars', calendar)).id; calendars.push(calendarId);
      const definition = { ...legacyWorkflow(scope), calendarVersionId: calendarId, nameAr: 'مسار توقيت اصطناعي', nameEn: 'Synthetic timezone workflow' };
      definition.stages[0].responseHours = 2; definition.stages[0].stageHours = 4;
      flow = (await post('drafts', { definition })).id;
      version = (await post('publish', { id: flow, revision: 0, selector })).id;
      const draftCalendar = (await post('calendars', { ...calendar, timezone: 'America/New_York' })).id; calendars.push(draftCalendar);
      await post('drafts', { id: flow, revision: 0, definition: { ...definition, calendarVersionId: draftCalendar } });
      for (const [index, anchor, response, stage, responseHour, stageHour] of [
        [0, '2026-10-15T05:00:00.000Z', '2026-10-15T07:00:00.000Z', '2026-10-15T09:00:00.000Z', '10:00', '12:00'],
        [1, '2026-10-15T12:00:00.000Z', '2026-10-18T06:00:00.000Z', '2026-10-18T08:00:00.000Z', '09:00', '11:00'],
      ] as const) {
        const id = selector + index, ref = 'T100-' + id;
        records.push({ id, ref, response, stage, responseHour, stageHour });
        if (scope === 'requests') await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,createdAt) VALUES(?,?,'quote',?,'Synthetic timezone','synthetic','unspecified','flexible','Synthetic',?,'email','en',?)", [id, ref, selector, prefix + 'owner@example.invalid', new Date(anchor)]);
        else await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,createdAt) VALUES(?,?,'Synthetic timezone','Synthetic',?,?,'en',?)", [id, ref, prefix + 'owner@example.invalid', selector, new Date(anchor)]);
        await transaction(db, async runner => {
          const engine = new WorkflowEngine(db); await engine.initialize(runner, scope, id);
          await runner.query('UPDATE ConversationWorkflow SET enteredAt=? WHERE scope=? AND recordId=?', [new Date(anchor), scope, id]);
          const state = (await engine.instance(runner, scope, id))!;
          const [record] = await runner.query(`SELECT * FROM ${scope === 'requests' ? 'ProjectRequest' : 'Inquiry'} WHERE id=?`, [id]);
          await engine.timers(runner, state, state.definition.stages[0], record, true);
        });
        const [stored] = await db.query('SELECT responseDueAt,stageDueAt FROM ConversationWorkflow WHERE scope=? AND recordId=?', [scope, id]);
        expect(stored.responseDueAt.toISOString()).toBe(response); expect(stored.stageDueAt.toISOString()).toBe(stage);
      }
      if (!deadlineAdmin) {
        await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)', [role, 'قراءة اصطناعية', 'Synthetic reader', JSON.stringify(['admin.dashboard', `${scope}.view.all`])]);
        await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) SELECT ?,?,'Synthetic reader',passwordHash,?,'active',UTC_TIMESTAMP(3),'en' FROM User WHERE id=?", [staff, staff + '@example.invalid', role, prefix + 'admin']);
        await page.context().clearCookies(); await login(staff + '@example.invalid');
        expect((await page.request.get('/api/admin/workflows')).status()).toBe(403);
      }
      await use({ db, version, selector, records });
    } finally {
      try {
        for (const { id } of records) {
          await db.query("DELETE FROM WorkflowTransfer WHERE JSON_CONTAINS(JSON_EXTRACT(payload,'$.ids'),JSON_QUOTE(?))", [id]);
          for (const table of ['WorkflowJob', 'WorkflowEvent', 'ConversationWorkflow']) await db.query(`DELETE FROM ${table} WHERE scope=? AND recordId=?`, [scope, id]);
          await db.query('DELETE FROM Notification WHERE link LIKE ?', ['%/' + id]); await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
          await db.query(`DELETE FROM ${scope === 'requests' ? 'ProjectRequest' : 'Inquiry'} WHERE id=?`, [id]);
        }
        if (flow) {
          await db.query('DELETE b FROM WorkflowBinding b JOIN WorkflowVersion v ON v.id=b.versionId WHERE v.workflowId=?', [flow]);
          await db.query('DELETE FROM WorkflowVersion WHERE workflowId=?', [flow]);
          await db.query('DELETE FROM AuditLog WHERE entityId IN (?,?)', [flow, version]); await db.query('DELETE FROM Workflow WHERE id=?', [flow]);
        }
        for (const id of calendars) { await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]); await db.query('DELETE FROM WorkCalendar WHERE id=?', [id]); }
        if (!deadlineAdmin) { await db.query('DELETE FROM AuditLog WHERE actorId=?', [staff]); await db.query('DELETE FROM User WHERE id=?', [staff]); await db.query('DELETE FROM Role WHERE `key`=?', [role]); }
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
