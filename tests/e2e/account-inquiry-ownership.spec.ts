import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import { createDataSource, sha256 } from '@so7ob/server';
import { readFileSync } from 'node:fs';
import { getPortalContent } from '../../apps/web/src/content/portal';

for (const locale of ['ar', 'en'] as const) {
  for (const actor of ['admin', 'owner']) {
    test(`${locale}: ${actor} follows their new inquiry after reload`, async ({ page }, info) => {
      const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
      const db = await createDataSource().initialize();
      const quotaKey = sha256('account-inquiry:' + prefix + actor);
      const [quota] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
      try {
      await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
      const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
      expect((await page.request.post('/api/auth/callback/credentials', {
        form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' },
      })).status()).toBe(200);
      const t = getPortalContent(locale).account;
      const subject = `Synthetic owner inquiry ${actor} ${locale} ${info.project.name}`;
      const message = 'Synthetic inquiry content بيانات اختبار معزولة';
      await page.goto(`/${locale}/account/inquiries`);
      await page.getByRole('button', { name: t.inquiries.create, exact: true }).first().click();
      await page.locator('#inquiry-subject').fill(subject);
      await page.locator('#inquiry-message').fill(message);
      const created = page.waitForResponse(r => r.url().endsWith('/api/account/inquiries') && r.request().method() === 'POST');
      await page.getByRole('dialog').locator('button[type=submit]').click();
      const response = await created;
      expect(response.status()).toBe(201);
      const { id, ref } = await response.json();
      await page.getByRole('button', { name: t.inquiries.createdOkOpen, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/account/inquiries/${id}$`));
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await page.goto(`/${locale}/account/inquiries`);
      await expect(page.getByText(subject, { exact: true })).toBeVisible();
      const list = await (await page.request.get('/api/account/inquiries')).json();
      expect(list.inquiries.filter((row: {id:string}) => row.id === id)).toHaveLength(1);
      if (actor === 'admin') {
        await page.goto(`/${locale}/admin/inquiries/${id}`);
        await expect(page.getByText(message, { exact: true })).toBeVisible();
        await expect(page.getByText(ref, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      }
      } finally {
        if (quota) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [quotaKey, quota.timestamps, quota.updatedAt]);
        else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [quotaKey]);
        await db.destroy();
      }
    });
  }
}
