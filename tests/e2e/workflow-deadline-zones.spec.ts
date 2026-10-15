import { expect, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './workflow-deadline-fixture';
import { getPortalContent } from '../../apps/web/src/content/portal';
test.use({ contextOptions: { reducedMotion: 'reduce' } });
const checkTime = async (time: Locator, hour?: string) => {
  await expect(time).toBeVisible(); await expect(time).toContainText('Asia/Aden · UTC+03:00');
  if (hour) await expect(time).toContainText(hour);
  await expect(time.locator('bdi')).toHaveAttribute('dir', 'ltr');
};
for (const scope of ['requests', 'inquiries'] as const) for (const zone of ['Asia/Aden', 'America/New_York']) test.describe(`${scope}/${zone}`, () => {
  test.use({ deadlineScope: scope, timezoneId: zone });
  for (const locale of ['ar', 'en'] as const) test(`${locale}: pinned deadline zone is stable across browser zones and weekend boundaries in details and list`, async ({ page, deadlines }, info) => {
    const before = await deadlines.db.query('SELECT * FROM ConversationWorkflow WHERE versionId=? ORDER BY recordId', [deadlines.version]);
    const immutable = await deadlines.db.query('SELECT definition FROM WorkflowVersion WHERE id=?', [deadlines.version]);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    for (const record of deadlines.records) {
      await page.goto(`/${locale}/admin/${scope}/${record.id}`);
      await checkTime(page.locator(`time[datetime="${record.response}"]`), record.responseHour);
      await checkTime(page.locator(`time[datetime="${record.stage}"]`), record.stageHour);
      await expect(page.getByRole('combobox', { name: getPortalContent(locale).admin.requests.changeStatus, exact: true })).toHaveCount(0);
      const detail = await (await page.request.get(`/api/admin/${scope}/${record.id}`)).json();
      expect(detail.workflow).toMatchObject({ versionId: deadlines.version, responseDueAt: record.response, stageDueAt: record.stage, calendarTimezone: 'Asia/Aden' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await info.attach('deadline-detail', { body: await page.screenshot(), contentType: 'image/png' });
    const back = page.locator(`main a[href="/${locale}/admin/${scope}"]`);
    await expect(back).toHaveCount(1); await back.focus(); await expect(back).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/${scope}$`));
    await page.getByPlaceholder(getPortalContent(locale).admin.requests.searchPlaceholder, { exact: true }).fill(deadlines.selector);
    for (const record of deadlines.records) {
      await expect(page.getByRole('link', { name: record.ref, exact: true })).toBeVisible();
      await checkTime(page.locator(`time[datetime="${record.response}"]`), record.responseHour);
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await deadlines.db.query('SELECT * FROM ConversationWorkflow WHERE versionId=? ORDER BY recordId', [deadlines.version])).toEqual(before);
    expect(await deadlines.db.query('SELECT definition FROM WorkflowVersion WHERE id=?', [deadlines.version])).toEqual(immutable);
    expect(errors).toEqual([]);
    await info.attach('deadline-list', { body: await page.screenshot(), contentType: 'image/png' });
    await info.attach('deadline-instants', { body: JSON.stringify({ browserZone: zone, calendarZone: 'Asia/Aden', records: deadlines.records, storedStateUnchanged: true }, null, 2), contentType: 'application/json' });
  });
});
for (const zone of ['Asia/Aden', 'America/New_York']) test.describe(`preview/${zone}`, () => {
  test.use({ deadlineAdmin: true, timezoneId: zone });
  for (const locale of ['ar', 'en'] as const) test(`${locale}: transfer preview names the target calendar zone without changing the stored deadlines`, async ({ page, deadlines }, info) => {
    const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
    const record = deadlines.records[0];
    const before = await deadlines.db.query('SELECT * FROM ConversationWorkflow WHERE versionId=? ORDER BY recordId', [deadlines.version]);
    await page.goto(`/${locale}/admin/workflows`);
    await page.getByRole('tab', { name: t('نقل المعاملات', 'Transfer conversations'), exact: true }).click();
    await page.getByRole('combobox', { name: t('الإصدار الهدف', 'Target version'), exact: true }).selectOption(deadlines.version);
    await page.getByRole('textbox', { name: t('البحث عن معاملة', 'Find conversation'), exact: true }).fill(record.ref);
    await page.getByRole('button', { name: t('تحميل المعاملات', 'Load conversations'), exact: true }).click();
    await page.getByRole('checkbox', { name: record.ref, exact: true }).check();
    await page.getByRole('combobox', { name: t('ربط المرحلة', 'Map stage') + ' new', exact: true }).selectOption('new');
    const saved = page.waitForResponse(response => response.url().endsWith('/workflows/transfer/preview') && response.request().method() === 'POST');
    await page.getByRole('button', { name: t('معاينة النقل', 'Preview transfer'), exact: true }).focus(); await page.keyboard.press('Enter');
    const response = await saved; expect(response.status()).toBe(201);
    const preview = await response.json(); expect(preview.rows).toHaveLength(1);
    const row = preview.rows[0]; expect(row.calendarTimezone).toBe('Asia/Aden');
    for (const instant of [row.responseDueAt, row.stageDueAt]) {
      expect(instant).not.toBeNull(); await checkTime(page.locator(`time[datetime="${instant}"]`));
    }
    await expect(page.getByRole('button', { name: t('تأكيد النقل المعاين', 'Confirm previewed transfer'), exact: true })).toBeVisible();
    expect(await deadlines.db.query('SELECT * FROM ConversationWorkflow WHERE versionId=? ORDER BY recordId', [deadlines.version])).toEqual(before);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach('deadline-preview', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
