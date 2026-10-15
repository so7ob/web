import { test } from './tracking-reply-fixture';
import { expect, type Page } from '@playwright/test';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit } from './visual-checks';

async function audit(page: Page) {
  expect(await page.locator('body').innerText()).not.toContain('PRIVATE');
  expect((await documentAudit(page)).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
// Raw synthetic capabilities must never enter uploaded traces or screenshots.
test.use({ trace: 'off', screenshot: 'off' });
for (const locale of ['ar', 'en'] as const) for (const scope of ['request', 'inquiry'] as const) {
  const message = scope === 'request' ? 'RequestMessage' : 'InquiryMessage', field = scope === 'request' ? 'requestId' : 'inquiryId';
  const t = getPortalContent(locale).track;
  test(`${locale} ${scope}: guests follow all four modes and a signed-in other client cannot use link reply`, async ({ page, baseURL, trackingReply: fixture }) => {
    for (const mode of ['login_required', 'link_view', 'link_view_login_reply', 'link_reply'] as const) {
      const id = await fixture.create(scope), token = await fixture.capability(scope, id, mode);
      await page.context().clearCookies();
      expect((await page.request.post('/api/track/exchange', { headers: { Origin: baseURL! }, data: { token } })).status()).toBe(200);
      await page.goto(`/${locale}/track?card=${scope}:${id}`, { waitUntil: 'networkidle' });
      if (mode === 'login_required') { await expect(page.getByRole('main').getByRole('link', { name: t.signIn, exact: true })).toBeVisible(); continue; }
      if (mode !== 'link_reply') {
        await expect(page.getByText(mode === 'link_view' ? t.replyDisabledView : t.replyDisabledLogin, { exact: true })).toBeVisible();
        await expect(page.getByPlaceholder(t.replyPlaceholder)).toHaveCount(0);
      } else {
        await page.getByPlaceholder(t.replyPlaceholder).fill('Synthetic guest117');
        const sent = page.waitForResponse(r => r.url().endsWith('/api/track/reply') && r.request().method() === 'POST');
        await page.getByRole('button', { name: t.send, exact: true }).click(); expect((await sent).status()).toBe(201);
        expect((await fixture.db.query(`SELECT authorId,authorType FROM ${message} WHERE ${field}=? AND kind='message'`, [id]))[0]).toMatchObject({ authorId: null, authorType: 'client' });
        await fixture.login('other'); await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByText(t.replyDisabledOwner, { exact: true })).toBeVisible();
        await expect(page.getByPlaceholder(t.replyPlaceholder)).toHaveCount(0);
        await expect(page.getByRole('link', { name: t.openStaffWorkspace })).toHaveCount(0);
      }
      await audit(page);
    }
  });

}
