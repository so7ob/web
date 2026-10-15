import { test } from './tracking-reply-fixture';
import { expect, type Page } from '@playwright/test';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit } from './visual-checks';

async function audit(page: Page) {
  expect(await page.locator('body').innerText()).not.toContain('PRIVATE');
  expect((await documentAudit(page)).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const locale of ['ar', 'en'] as const) for (const scope of ['request', 'inquiry'] as const) {
  const table = scope === 'request' ? 'ProjectRequest' : 'Inquiry';
  const message = scope === 'request' ? 'RequestMessage' : 'InquiryMessage', field = scope === 'request' ? 'requestId' : 'inquiryId';
  const t = getPortalContent(locale).track;
  test(`${locale} ${scope}: eligibility change refuses a staff reply and keeps an accessible unsent draft`, async ({ page, baseURL, trackingReply: fixture }, info) => {
    const { db, prefix, login } = fixture, id = await fixture.create(scope), draft = 'Synthetic retained unsent draft117\nنص غير مرسل';
    await page.goto(`/${locale}/track?card=${scope}:${id}`, { waitUntil: 'networkidle' });
    await expect(page.getByPlaceholder(t.replyPlaceholder)).toBeVisible();
    await page.getByPlaceholder(t.replyPlaceholder).fill(draft);
    await login('admin');
    expect((await db.query('SELECT roleKey FROM User WHERE id=?', [prefix + 'admin']))[0].roleKey).toBe('super_admin');
    const view = await page.request.get('/api/track/card', { params: { scope, id } });
    expect(view.status()).toBe(200); const payload = await view.json();
    let posts = 0; page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/track/reply') posts++; });
    const denied = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/track/reply'));
    await page.getByPlaceholder(t.replyPlaceholder).press('Tab'); await expect(page.getByRole('button', { name: t.send, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    const response = await denied; expect(response.status()).toBe(403); expect(await response.json()).toMatchObject({ code: 'policy_denied', replyReason: 'staff' });
    expect(await db.query(`SELECT id FROM ${message} WHERE ${field}=? AND kind='message'`, [id])).toHaveLength(0);
    expect(await db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='track.guest_reply'", [id])).toHaveLength(0);
    expect(posts).toBe(1); expect(new URL(page.url()).origin).toBe(baseURL);
    await expect(page.getByText(t.replyDisabledStaff, { exact: true })).toBeVisible();
    const unsent = page.getByRole('textbox', { name: t.unsentReply, exact: true });
    await expect(unsent).toHaveValue(draft); await expect(unsent).toHaveAttribute('readonly', ''); await expect(unsent).toBeEnabled();
    await expect(unsent).toBeFocused(); await unsent.press('Control+a');
    expect(await unsent.evaluate(e => (e as HTMLTextAreaElement).selectionEnd - (e as HTMLTextAreaElement).selectionStart)).toBe(draft.length);
    await expect(page.getByText(t.replyDisabledLogin, { exact: true })).toHaveCount(0);
    expect(payload.policy).toMatchObject({ canReplyByOwner: false, canReplyViaLink: false, replyDenial: 'staff' });
    await expect(page.getByRole('link', { name: t.openStaffWorkspace })).toHaveAttribute('href', `/${locale}/admin/${scope === 'request' ? 'requests' : 'inquiries'}/${id}`);
    await audit(page); await info.attach('recoverable-draft-' + locale, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    expect(posts).toBe(1);
  });

  test(`${locale} ${scope}: staff owners and nonowners see accurate guidance while the client owner can reply`, async ({ page, trackingReply: fixture }) => {
    const { db, login } = fixture, id = await fixture.create(scope), staffId = await fixture.create(scope, true);
    await login('admin');
    for (const card of [id, staffId]) {
      await page.goto(`/${locale}/track?card=${scope}:${card}`, { waitUntil: 'networkidle' });
      await expect(page.getByText(t.replyDisabledStaff, { exact: true })).toBeVisible();
      await expect(page.getByPlaceholder(t.replyPlaceholder)).toHaveCount(0);
      await expect(page.getByRole('link', { name: t.openStaffWorkspace })).toBeVisible();
    }
    await audit(page);
    await page.getByRole('link', { name: t.openStaffWorkspace }).focus(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${locale}/admin/${scope === 'request' ? 'requests' : 'inquiries'}/${staffId}$`));
    await expect(page.getByText('S7-' + staffId.slice(-8), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await login('owner');
    await page.goto(`/${locale}/track?card=${scope}:${id}`, { waitUntil: 'networkidle' });
    const body = 'Synthetic authorized owner117'; await page.getByPlaceholder(t.replyPlaceholder).fill(body);
    const sent = page.waitForResponse(r => r.url().endsWith('/api/track/reply') && r.request().method() === 'POST');
    await page.getByRole('button', { name: t.send, exact: true }).click(); expect((await sent).status()).toBe(201);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(t.replyPlaceholder)).toHaveValue('');
    expect(await db.query(`SELECT authorId,authorType FROM ${message} WHERE ${field}=? AND body=?`, [id, body])).toEqual([expect.objectContaining({ authorId: fixture.prefix + 'owner', authorType: 'client' })]);
    await page.reload({ waitUntil: 'networkidle' }); await expect(page.getByText(body, { exact: true })).toBeVisible();
    await audit(page);
  });

  test(`${locale} ${scope}: unknown rejection keeps a selectable draft and closed race has its own reason`, async ({ page, trackingReply: fixture }) => {
    const id = await fixture.create(scope), draft = 'Synthetic recoverable unknown117';
    await page.goto(`/${locale}/track?card=${scope}:${id}`, { waitUntil: 'networkidle' });
    await page.route('**/api/track/reply', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'unknown', replyReason: 'untrusted', canOpenStaffWorkspace: true }) }), { times: 1 });
    await page.getByPlaceholder(t.replyPlaceholder).fill(draft); await page.getByRole('button', { name: t.send, exact: true }).click();
    await expect(page.getByText(t.replyDisabledUnavailable, { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: t.unsentReply })).toHaveValue(draft);
    await expect(page.getByRole('link', { name: t.openStaffWorkspace })).toHaveCount(0);
    await expect(page.getByText(t.replyDisabledLogin, { exact: true })).toHaveCount(0);
    await audit(page);
    // Another card must not inherit the preceding card's unsent text or refusal.
    const second = await fixture.create(scope); await page.goto(`/${locale}/track?card=${scope}:${second}`, { waitUntil: 'networkidle' });
    await expect(page.getByPlaceholder(t.replyPlaceholder)).toHaveValue('');
    await page.getByPlaceholder(t.replyPlaceholder).fill(draft);
    await fixture.db.query(`UPDATE ${table} SET status='closed' WHERE id=?`, [second]);
    const denied = page.waitForResponse(r => r.url().endsWith('/api/track/reply') && r.request().method() === 'POST');
    await page.getByRole('button', { name: t.send, exact: true }).click();
    const response = await denied; expect(response.status()).toBe(403); expect(await response.json()).toMatchObject({ code: 'closed', replyReason: 'closed' });
    await expect(page.getByText(t.replyDisabledClosed, { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: t.unsentReply })).toHaveValue(draft);
    expect(await fixture.db.query(`SELECT id FROM ${message} WHERE ${field}=? AND kind='message'`, [second])).toHaveLength(0);
    await audit(page);
  });
}
