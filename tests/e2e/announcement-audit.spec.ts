import { expect } from '@playwright/test';
import { test } from './admin-configuration-fixture';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { auditCopy } from '../../apps/web/src/components/admin/audit/copy';
import { auditTerm } from '@so7ob/contracts';
import { documentAudit, VisualReadiness } from './visual-checks';

test.use({ contextOptions: { reducedMotion: 'reduce' } });
for (const locale of ['ar', 'en'] as const) test(`${locale}: saved public announcement has truthful bilingual before/after in audit details`, async ({ page, configuration }, info) => {
  const { request, headers, db, prefix } = configuration;
  const old = { 'announcement.enabled': 'false', 'announcement.messageAr': 'إعلان سابق اصطناعي 111', 'announcement.messageEn': 'Previous synthetic announcement111' };
  const next = { ar: 'إعلان جديد اصطناعي 111', en: 'Updated synthetic announcement111' };
  expect((await request.patch('/api/admin/settings', { headers, data: old })).status()).toBe(200);
  await page.goto(`/${locale}/admin/settings?section=announcement`);
  await page.locator('#announcement-message-ar').fill(next.ar);
  await page.locator('#announcement-message-en').fill(next.en);
  await page.locator('#announcement-enabled').check();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/admin/settings/checked') && response.request().method() === 'PATCH');
  const save = page.getByRole('button', { name: getPortalContent(locale).admin.settings.save, exact: true });
  await save.focus(); await expect(save).toBeFocused(); await page.keyboard.press('Enter');
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: locale === 'ar' ? 'كل التعديلات محفوظة' : 'All changes saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'ar' ? 'استعادة الافتراضي' : 'Restore defaults', exact: true })).toBeEnabled();
  await expect(save).toBeDisabled();
  expect(await (await request.get('/' + locale)).text()).toContain(next[locale]);
  const rows = await db.query("SELECT * FROM AuditLog WHERE actorId=? AND action='settings.updated' ORDER BY createdAt DESC,id DESC LIMIT 1", [prefix + 'admin']);
  const row = rows[0], payload = JSON.parse(row.eventPayload);
  expect(payload.changes).toHaveLength(3);
  expect(row).toMatchObject({ entityType: 'settings', entityId: null, resourceRef: 'announcement', hasChanges: 1, reasonCode: null });
  const response = await request.get('/api/v1/admin/audit/events/' + row.id);
  expect(response.status()).toBe(200);
  expect((await response.json()).event.changes).toEqual(payload.changes);
  await page.goto(`/${locale}/admin/audit?event=${row.id}`);
  const dialog = page.getByRole('dialog'), t = auditCopy[locale];
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(row.id);
  await expect(dialog).toContainText(t.before); await expect(dialog).toContainText(t.after);
  for (const key of ['announcement.enabled', 'announcement.messageAr', 'announcement.messageEn']) await expect(dialog.getByText(auditTerm(key, locale), { exact: true }).first()).toBeVisible();
  for (const text of [old['announcement.messageAr'], old['announcement.messageEn'], next.ar, next.en, locale === 'ar' ? 'نعم' : 'Yes', locale === 'ar' ? 'لا' : 'No']) await expect(dialog.getByText(text, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(t.noChanges, { exact: true })).toHaveCount(0);
  const readiness = new VisualReadiness(page);
  try {
    await readiness.wait();
    expect((await documentAudit(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach('announcement-before-after-' + locale, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  } finally { readiness.dispose(); }
});
