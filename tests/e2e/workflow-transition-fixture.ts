import { expect } from '@playwright/test';
import { test as base } from './quota-fixture';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDataSource, WorkflowEngine, transaction } from '@so7ob/server';
import { legacyWorkflow, type WorkflowScope } from '@so7ob/contracts';
import type { DataSource } from 'typeorm';

export const test = base.extend<{
  transitionScope: WorkflowScope;
  actions: { db: DataSource; version: string; records: string[]; staff: string; definition: ReturnType<typeof legacyWorkflow> };
}>({
  transitionScope: ['requests', { option: true }],
  actions: [async ({ page, transitionScope: scope }, use) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const selector = 'a99' + randomBytes(6).toString('hex');
    const staff = selector + 'staff', role = selector + 'role', records: string[] = [];
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
    const db = await createDataSource().initialize();
    let calendar = '', flow = '';
    try {
      calendar = (await post('calendars', { timezone: 'Asia/Aden', week: Array.from({ length: 7 }, () => [{ start: '08:00', end: '16:00' }]), exceptions: [] })).id;
      const definition = { ...legacyWorkflow(scope), calendarVersionId: calendar, nameAr: 'مسار إجراءات اصطناعي', nameEn: 'Synthetic action workflow' };
      definition.stages[0].nameAr = 'وارد'; definition.stages[0].nameEn = 'Intake';
      const review = definition.stages.find(stage => stage.id === 'in_review')!;
      review.nameAr = 'فحص بشري'; review.nameEn = 'Human review';
      const decisionId = scope === 'requests' ? 'cancelled' : 'closed';
      const decision = definition.stages.find(stage => stage.id === decisionId)!;
      decision.nameAr = 'قائمة القرار'; decision.nameEn = 'Decision queue';
      const inherited = definition.transitions.find(transition => transition.from === 'new' && transition.to === 'in_review')!;
      definition.transitions.push({ ...inherited, id: 'custom-audit', nameAr: 'تدقيق مخصص', nameEn: 'Custom audit' });
      definition.transitions.push({ ...inherited, id: 'assignee-only', nameAr: 'خاص بالمسند إليه', nameEn: 'Assignee only', actors: ['assignee'] });
      definition.transitions.find(transition => transition.from === 'new' && transition.to === decisionId)!.reasonRequired = true;
      flow = (await post('drafts', { definition })).id;
      const version = (await post('publish', { id: flow, revision: 0, selector })).id;
      const draft = structuredClone(definition);
      for (const stage of draft.stages) { stage.nameAr = 'مسودة غير منشورة'; stage.nameEn = 'Unpublished draft'; }
      await post('drafts', { id: flow, revision: 0, definition: draft });
      await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)', [role, 'موظف اصطناعي', 'Synthetic staff', JSON.stringify(['admin.dashboard', `${scope}.view.all`, `${scope}.status`])]);
      await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) SELECT ?,?,'Synthetic action staff',passwordHash,?,'active',UTC_TIMESTAMP(3),'en' FROM User WHERE id=?", [staff, staff + '@example.invalid', role, prefix + 'admin']);
      for (let index = 0; index < 3; index++) {
        const id = selector + index; records.push(id);
        if (scope === 'requests') await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote',?,'Synthetic action destination','synthetic','unspecified','flexible','Synthetic',?,'email','en')", [id, 'A99-' + id, selector, prefix + 'owner@example.invalid']);
        else await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale) VALUES(?,?,'Synthetic action destination','Synthetic',?,?,'en')", [id, 'A99-' + id, prefix + 'owner@example.invalid', selector]);
        await transaction(db, runner => new WorkflowEngine(db).initialize(runner, scope, id));
      }
      await page.context().clearCookies();
      await login(staff + '@example.invalid');
      expect((await page.request.get('/api/admin/workflows')).status()).toBe(403);
      await use({ db, version, records, staff, definition });
    } finally {
      try {
        for (const id of records) {
          for (const table of ['WorkflowJob', 'WorkflowEvent', 'ConversationWorkflow']) await db.query(`DELETE FROM ${table} WHERE recordId=?`, [id]);
          await db.query('DELETE FROM Notification WHERE link LIKE ?', ['%/' + id]);
          await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
          await db.query(`DELETE FROM ${scope === 'requests' ? 'ProjectRequest' : 'Inquiry'} WHERE id=?`, [id]);
        }
        if (flow) {
          await db.query('DELETE b FROM WorkflowBinding b JOIN WorkflowVersion v ON v.id=b.versionId WHERE v.workflowId=?', [flow]);
          await db.query('DELETE FROM WorkflowVersion WHERE workflowId=?', [flow]);
          await db.query('DELETE FROM AuditLog WHERE entityId=?', [flow]);
          await db.query('DELETE FROM Workflow WHERE id=?', [flow]);
        }
        if (calendar) { await db.query('DELETE FROM AuditLog WHERE entityId=?', [calendar]); await db.query('DELETE FROM WorkCalendar WHERE id=?', [calendar]); }
        await db.query('DELETE FROM AuditLog WHERE actorId=?', [staff]);
        await db.query('DELETE FROM User WHERE id=?', [staff]);
        await db.query('DELETE FROM Role WHERE `key`=?', [role]);
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
