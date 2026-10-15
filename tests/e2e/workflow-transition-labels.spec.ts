import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './workflow-transition-fixture';
import { getPortalContent } from '../../apps/web/src/content/portal';
test.use({ contextOptions: { reducedMotion: 'reduce' } });
for (const scope of ['requests', 'inquiries'] as const) test.describe(scope, () => {
  test.use({ transitionScope: scope });
  const decisionId = scope === 'requests' ? 'cancelled' : 'closed';
  for (const locale of ['ar', 'en'] as const) {
    const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
    const portal = getPortalContent(locale).admin.requests;
    const reviewLabel = t('انتقال إلى فحص بشري', 'Move to Human review');
    const decisionLabel = t('انتقال إلى قائمة القرار', 'Move to Decision queue');
    const customLabel = t('تدقيق مخصص إلى فحص بشري', 'Custom audit to Human review');
    const open = async (page: Page) => {
      await page.bringToFront();
      const control = page.getByRole('combobox', { name: portal.changeStatus, exact: true });
      await control.focus(); await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('option', { name: reviewLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: decisionLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: customLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: t('انتقال', 'Move'), exact: true })).toHaveCount(0);
      await expect(page.getByRole('option', { name: /Assignee only|خاص بالمسند إليه|Unpublished draft|مسودة غير منشورة/ })).toHaveCount(0);
      return control;
    };
    const selectByKeyboard = async (page: Page, label: string) => {
      const option = page.getByRole('option', { name: label, exact: true });
      const options = page.getByRole('option');
      for (let index = 0; index < await options.count(); index++) {
        if (await option.evaluate(element => element === document.activeElement)) break;
        await page.keyboard.press('ArrowDown');
      }
      await expect(option).toBeFocused(); await page.keyboard.press('Enter');
    };
    test(`${locale}: inherited and custom actions expose pinned destinations and execute their own IDs`, async ({ page, actions }, info) => {
      const before = await actions.db.query('SELECT definition FROM WorkflowVersion WHERE id=?', [actions.version]);
      const evidence = [];
      for (const [index, label, transitionId] of [[0, reviewLabel, 'new-in_review'], [1, customLabel, 'custom-audit']] as const) {
        const id = actions.records[index];
        await page.goto(`/${locale}/admin/${scope}/${id}`);
        const [initial] = await actions.db.query('SELECT stageId,revision FROM ConversationWorkflow WHERE recordId=?', [id]);
        expect(initial.stageId).toBe('new');
        const priorEvents = await actions.db.query('SELECT * FROM WorkflowEvent WHERE recordId=? ORDER BY id', [id]);
        const priorAudit = await actions.db.query('SELECT id FROM AuditLog WHERE entityId=?', [id]);
        expect((await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        const control = await open(page);
        // A full-page capture resizes the viewport and Radix dismisses on resize.
        await info.attach('action-options-' + index, { body: await page.screenshot(), contentType: 'image/png' });
        // Scan the active popup separately from Radix's aria-hidden background;
        // the complete page is checked immediately before opening it above.
        // Run in this page: axe's default temporary result page dismisses the popup.
        expect((await new AxeBuilder({ page }).setLegacyMode().include('[role="listbox"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
        const saved = page.waitForResponse(response => response.url().endsWith(`/workflows/${scope}/${id}/transition`) && response.request().method() === 'POST');
        await selectByKeyboard(page, label);
        const response = await saved; expect(response.status()).toBe(201);
        const payload = response.request().postDataJSON().payload;
        expect(payload).toEqual({ transitionId, expectedRevision: initial.revision, operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
        await expect(control).toHaveText(t('فحص بشري', 'Human review'));
        await page.getByText(portal.history, { exact: true }).click();
        await expect(page.getByText(t('وارد → فحص بشري', 'Intake → Human review'), { exact: true })).toBeVisible();
        const [event] = await actions.db.query('SELECT versionId,fromStage,toStage,actorId FROM WorkflowEvent WHERE recordId=? AND operationId=?', [id, payload.operationId]);
        expect(event).toEqual({ versionId: actions.version, fromStage: 'new', toStage: 'in_review', actorId: actions.staff });
        const events = await actions.db.query('SELECT * FROM WorkflowEvent WHERE recordId=? ORDER BY id', [id]);
        expect(events.filter((event: { id: string }) => priorEvents.some((old: { id: string }) => old.id === event.id))).toEqual(priorEvents);
        expect(events).toHaveLength(priorEvents.length + 1);
        expect(await actions.db.query('SELECT id FROM AuditLog WHERE entityId=?', [id])).toHaveLength(priorAudit.length + 1);
        expect(await actions.db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='workflow.transitioned' AND actorId=?", [id, actions.staff])).toHaveLength(1);
        evidence.push({ label, transitionId, ...event });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(await actions.db.query('SELECT definition FROM WorkflowVersion WHERE id=?', [actions.version])).toEqual(before);
      await info.attach('destination-and-history', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    });
    test(`${locale}: required-reason confirmation identifies the destination and cancellation makes no transition`, async ({ page, actions }, info) => {
      const id = actions.records[2];
      await page.goto(`/${locale}/admin/${scope}/${id}`);
      const initial = await actions.db.query('SELECT stageId,revision FROM ConversationWorkflow WHERE recordId=?', [id]);
      const priorEvents = await actions.db.query('SELECT * FROM WorkflowEvent WHERE recordId=? ORDER BY id', [id]);
      const priorAudit = await actions.db.query('SELECT id FROM AuditLog WHERE entityId=?', [id]);
      expect(initial[0].stageId).toBe('new');
      let posts = 0;
      page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/workflows/${scope}/${id}/transition`)) posts++; });
      await open(page); await selectByKeyboard(page, decisionLabel);
      const dialog = page.getByRole('dialog', { name: t('تأكيد الانتقال', 'Confirm transition'), exact: true });
      await expect(dialog).toHaveAccessibleDescription(decisionLabel);
      const apply = dialog.getByRole('button', { name: portal.applyStatus, exact: true });
      await expect(apply).toBeDisabled(); expect(posts).toBe(0);
      await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); expect(posts).toBe(0);
      expect(await actions.db.query('SELECT stageId,revision FROM ConversationWorkflow WHERE recordId=?', [id])).toEqual(initial);
      expect(await actions.db.query('SELECT * FROM WorkflowEvent WHERE recordId=? ORDER BY id', [id])).toEqual(priorEvents);
      expect(await actions.db.query('SELECT id FROM AuditLog WHERE entityId=?', [id])).toEqual(priorAudit);
      await open(page); await selectByKeyboard(page, decisionLabel);
      await expect(dialog).toHaveAccessibleDescription(decisionLabel);
      await dialog.getByRole('textbox', { name: t('سبب الانتقال', 'Transition reason'), exact: true }).fill('Synthetic decision reason');
      expect((await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await info.attach('destination-confirmation', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      const saved = page.waitForResponse(response => response.url().endsWith(`/workflows/${scope}/${id}/transition`) && response.request().method() === 'POST');
      await apply.focus(); await page.keyboard.press('Enter');
      const response = await saved; expect(response.status()).toBe(201);
      expect(response.request().postDataJSON().payload).toEqual({ transitionId: 'new-' + decisionId, expectedRevision: initial[0].revision, operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), reason: 'Synthetic decision reason' });
      await expect(dialog).toBeHidden(); expect(posts).toBe(1);
      await expect(page.getByRole('combobox', { name: portal.changeStatus, exact: true })).toHaveText(t('قائمة القرار', 'Decision queue'));
      await page.getByText(portal.history, { exact: true }).click();
      await expect(page.getByText(t('وارد → قائمة القرار', 'Intake → Decision queue'), { exact: true })).toBeVisible();
      await expect(page.getByText('Synthetic decision reason', { exact: true })).toBeVisible();
      expect(await actions.db.query("SELECT versionId,toStage,reason FROM WorkflowEvent WHERE recordId=? AND kind='transition' AND actorId=?", [id, actions.staff])).toEqual([{ versionId: actions.version, toStage: decisionId, reason: 'Synthetic decision reason' }]);
      const events = await actions.db.query('SELECT * FROM WorkflowEvent WHERE recordId=? ORDER BY id', [id]);
      expect(events.filter((event: { id: string }) => priorEvents.some((old: { id: string }) => old.id === event.id))).toEqual(priorEvents);
      expect(events).toHaveLength(priorEvents.length + 1);
      expect(await actions.db.query('SELECT id FROM AuditLog WHERE entityId=?', [id])).toHaveLength(priorAudit.length + 1);
      expect(await actions.db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='workflow.transitioned' AND actorId=?", [id, actions.staff])).toHaveLength(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
});
