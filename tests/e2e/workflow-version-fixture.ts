import { expect } from '@playwright/test';
import { test as base } from './quota-fixture';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDataSource, WorkflowEngine, transaction } from '@so7ob/server';
import { legacyWorkflow } from '@so7ob/contracts';
import type { DataSource } from 'typeorm';

export const test = base.extend<{ versions: {
  first: string; flow: string; record: string; ref: string;
  db: DataSource;
  addVersions: () => Promise<{ second: string; other: string }>;
} }>({
  versions: [async ({ page }, use) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const suffix = randomBytes(6).toString('hex'), selector = prefix + 'version' + suffix;
    const record = selector, ref = 'V121-' + suffix;
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + 'admin@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    const headers = { 'x-csrf-token': csrfToken };
    const post = async (path: string, payload: unknown): Promise<{ id: string }> => {
      const response = await page.request.post('/api/admin/workflows/' + path, { headers, data: { payload } });
      expect(response.status(), await response.text()).toBe(201);
      return response.json();
    };
    const db = await createDataSource().initialize(), flows: string[] = [];
    let calendar = '';
    try {
      calendar = (await post('calendars', { timezone: 'Asia/Aden', week: Array.from({ length: 7 }, () => [{ start: '08:00', end: '16:00' }]), exceptions: [] })).id;
      const definition = { ...legacyWorkflow('requests'), calendarVersionId: calendar, nameAr: 'مسار إصدارات اصطناعي ' + suffix, nameEn: 'Synthetic version workflow ' + suffix };
      const flow = (await post('drafts', { definition })).id; flows.push(flow);
      const first = (await post('publish', { id: flow, revision: 0, selector })).id;
      await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote',?,'Synthetic version identity','synthetic','unspecified','flexible','Synthetic',?,'email','en',?)", [record, ref, selector, prefix + 'owner@example.invalid', prefix + 'owner']);
      await transaction(db, runner => new WorkflowEngine(db).initialize(runner, 'requests', record));
      const addVersions = async () => {
        const next = structuredClone(definition);
        next.stages[0].nameAr = 'وارد الإصدار الأحدث'; next.stages[0].nameEn = 'Newest published intake';
        await post('drafts', { id: flow, revision: 0, definition: next });
        const second = (await post('publish', { id: flow, revision: 1, selector })).id;
        const otherFlow = (await post('drafts', { definition })).id; flows.push(otherFlow);
        const other = (await post('publish', { id: otherFlow, revision: 0, selector: selector + '-other' })).id;
        return { second, other };
      };
      await use({ first, flow, record, ref, db, addVersions });
    } finally {
      try {
        await db.query("DELETE FROM WorkflowTransfer WHERE JSON_CONTAINS(JSON_EXTRACT(payload,'$.ids'),JSON_QUOTE(?))", [record]);
        for (const table of ['WorkflowJob', 'WorkflowEvent', 'ConversationWorkflow']) await db.query(`DELETE FROM ${table} WHERE recordId=?`, [record]);
        await db.query('DELETE FROM Notification WHERE link LIKE ?', ['%/' + record]);
        await db.query('DELETE FROM AuditLog WHERE entityId=?', [record]);
        await db.query('DELETE FROM ProjectRequest WHERE id=?', [record]);
        for (const flow of flows) {
          await db.query('DELETE b FROM WorkflowBinding b JOIN WorkflowVersion v ON v.id=b.versionId WHERE v.workflowId=?', [flow]);
          await db.query('DELETE FROM WorkflowVersion WHERE workflowId=?', [flow]);
          await db.query('DELETE FROM AuditLog WHERE entityId=?', [flow]);
          await db.query('DELETE FROM Workflow WHERE id=?', [flow]);
        }
        if (calendar) {
          await db.query('DELETE FROM AuditLog WHERE entityId=?', [calendar]);
          await db.query('DELETE FROM WorkCalendar WHERE id=?', [calendar]);
        }
      } finally { await db.destroy(); }
    }
  }, { timeout: 30000 }],
});
