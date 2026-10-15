import { test, expect } from '@playwright/test';
import { createDataSource } from '@so7ob/server';
import { createHash, randomBytes } from 'node:crypto';
import { getPortalContent } from '../../apps/web/src/content/portal';

// Capability URLs must never enter trace/screenshot artifacts, even on expected pre-fix failures.
test.use({ trace: 'off', screenshot: 'off' });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function fixture(locale: 'ar' | 'en', scope: 'request' | 'inquiry') {
  const db = await createDataSource().initialize();
  const id = 'langtrack' + randomBytes(8).toString('hex'), token = randomBytes(32).toString('base64url');
  const table = scope === 'request' ? 'ProjectRequest' : 'Inquiry';
  const message = scope === 'request' ? 'RequestMessage' : 'InquiryMessage';
  const field = scope === 'request' ? 'requestId' : 'inquiryId';
  const buckets = await Promise.all(['track-ex:127.0.0.1', 'track-rp:127.0.0.1'].map(async raw => {
    const key = hash(raw), [original] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [key]);
    await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]); return { key, original };
  }));
  if (scope === 'request') await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,descriptionHash,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic language request','unspecified','flexible','Synthetic','synthetic@example.invalid','synthetic','email',?)", [id, id, locale]);
  else await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,locale) VALUES(?,?,'Synthetic language inquiry','Synthetic','synthetic@example.invalid',?)", [id, id, locale]);
  await db.query(`INSERT INTO TrackLink(id,scope,${field},tokenHash,expiresAt) VALUES(?,?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))`, [id, scope, id, hash(token)]);
  await db.query('INSERT INTO SiteSetting(`key`,value) VALUES(?,?)', [`track.exception.${scope}.${id}`, 'link_reply']);
  await db.query(`INSERT INTO ${message}(id,${field},authorType,kind,body) VALUES(?,?,'staff','message','Synthetic public response')`, [id + 'public', id]);
  await db.query(`INSERT INTO ${message}(id,${field},authorType,kind,body) VALUES(?,?,'staff','internal_note','INTERNAL SYNTHETIC NOTE')`, [id + 'private', id]);
  return { db, id, token, table, message, field, async cleanup() {
    await db.query('DELETE FROM SiteSetting WHERE `key`=?', [`track.exception.${scope}.${id}`]);
    await db.query('DELETE FROM TrackLink WHERE id=?', [id]); await db.query(`DELETE FROM ${table} WHERE id=?`, [id]);
    await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
    await db.query("DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref'))=?", [id]);
    for (const { key, original } of buckets) {
      if (original) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [key, original.timestamps, original.updatedAt]);
      else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [key]);
    }
    await db.destroy();
  } };
}
for (const locale of ['ar', 'en'] as const) for (const scope of ['request', 'inquiry'] as const) {
  test(`${locale} ${scope}: language changes retain the canonical card and capability boundaries`, async ({ page, browser, baseURL }) => {
    test.setTimeout(60000);
    const f = await fixture(locale, scope), other = locale === 'ar' ? 'en' : 'ar';
    let exchanges = 0, replies = 0;
    page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/track/exchange')) exchanges++; if (request.method() === 'POST' && request.url().endsWith('/api/track/reply')) replies++; });
    const switcher = () => page.locator('a[hreflang]').filter({ visible: true });
    const visibleCard = async () => {
      await expect(page.getByText(f.id, { exact: true })).toBeVisible();
      await expect(page.getByText('Synthetic public response', { exact: true })).toBeVisible();
      expect((await page.locator('body').innerText()).includes('INTERNAL SYNTHETIC NOTE')).toBe(false);
    };
    try {
      await page.goto(`/${locale}/track?t=${f.token}`).catch(() => { throw new Error('Synthetic capability navigation failed; URL withheld'); });
      await expect.poll(() => new URL(page.url()).searchParams.has('t')).toBe(false);
      await visibleCard();
      const reply = 'Synthetic single reply ' + f.id;
      await page.getByPlaceholder(getPortalContent(locale).track.replyPlaceholder).fill(reply);
      const sent = page.waitForResponse(r => r.url().endsWith('/api/track/reply') && r.request().method() === 'POST');
      await page.getByRole('button', { name: getPortalContent(locale).track.send, exact: true }).click();
      expect((await sent).status()).toBe(201); await expect(page.getByText(reply, { exact: true })).toBeVisible();
      const [identity] = await f.db.query(`SELECT clientId,locale,status FROM ${f.table} WHERE id=?`, [f.id]);
      // Extraneous parameters are deliberately dropped rather than copied to the other locale.
      await page.goto(`/${locale}/track?card=${scope}:${f.id}&debug=untrusted#section`);
      await visibleCard();
      const target = new URL((await switcher().getAttribute('href'))!, baseURL!);
      expect(target.pathname).toBe(`/${other}/track`);
      expect([...target.searchParams]).toEqual([['card', `${scope}:${f.id}`]]);
      expect(target.hash).toBe('');
      await switcher().focus(); await page.keyboard.press('Enter');
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/track`);
      await visibleCard(); await expect(page.getByText(reply, { exact: true })).toBeVisible();
      await page.reload(); await visibleCard();
      await page.goBack(); await visibleCard();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/${locale}/track`);
      await switcher().click(); await visibleCard();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/track`);
      await switcher().click(); await visibleCard();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/${locale}/track`);
      expect(exchanges).toBe(1); expect(replies).toBe(1);
      expect((await f.db.query(`SELECT clientId,locale,status FROM ${f.table} WHERE id=?`, [f.id]))[0]).toEqual(identity);
      expect((await f.db.query('SELECT tokenHash FROM TrackLink WHERE id=?', [f.id]))[0].tokenHash === hash(f.token)).toBe(true);
      expect((await f.db.query(`SELECT id FROM ${f.table} WHERE id=?`, [f.id]))).toHaveLength(1);
      expect((await f.db.query(`SELECT id FROM ${f.message} WHERE ${f.field}=? AND body=?`, [f.id, reply]))).toHaveLength(1);
      expect((await f.db.query('SELECT id FROM TrackLink WHERE id=?', [f.id]))).toHaveLength(1);
      const noCapability = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const denied = await noCapability.request.get(baseURL + '/api/track/card', { params: { scope, id: f.id } });
        expect(denied.status()).toBe(403);
        const clean = await noCapability.newPage(); await clean.goto(baseURL + `/${other}/track?card=${scope}:${f.id}`);
        await expect(clean.getByRole('heading', { name: getPortalContent(other).track.loginRequired, exact: true })).toBeVisible();
        expect((await clean.locator('body').innerText()).includes('Synthetic public response')).toBe(false);
      } finally { await noCapability.close(); }
      await f.db.query('UPDATE TrackLink SET expiresAt=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [f.id]);
      await page.reload(); await expect(page.getByRole('heading', { name: getPortalContent(locale).track.expired, exact: true })).toBeVisible();
      await switcher().click(); await expect(page.getByRole('heading', { name: getPortalContent(other).track.expired, exact: true })).toBeVisible();
      await f.db.query('UPDATE TrackLink SET expiresAt=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)),revokedAt=UTC_TIMESTAMP(3) WHERE id=?', [f.id]);
      await page.reload(); await expect(page.getByRole('heading', { name: getPortalContent(other).track.revoked, exact: true })).toBeVisible();
      await switcher().click(); await expect(page.getByRole('heading', { name: getPortalContent(locale).track.revoked, exact: true })).toBeVisible();
      expect((await page.request.post('/api/track/reply', { headers: { Origin: baseURL! }, data: { scope, id: f.id, body: 'Denied after revoke' } })).status()).toBe(403);
      expect((await page.request.post('/api/track/exchange', { headers: { Origin: baseURL! }, data: { token: 'synthetic-invalid' } })).status()).toBe(403);
      await page.goto(`/${locale}/track?card=wrong:synthetic`); await expect(page.getByRole('heading', { name: getPortalContent(locale).track.invalid, exact: true })).toBeVisible();
      await page.goto(`/${other}/track`); await expect(page.getByRole('heading', { name: getPortalContent(other).track.invalid, exact: true })).toBeVisible();
    } finally { await f.cleanup(); }
  });
  test(`${locale} ${scope}: switching waits until capability exchange replaces the raw URL`, async ({ page }) => {
    const f = await fixture(locale, scope), other = locale === 'ar' ? 'en' : 'ar';
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
    try {
      await page.route('**/api/track/exchange', async route => { started(); await gate; await route.continue(); }, { times: 1 });
      await page.goto(`/${locale}/track?t=${f.token}`).catch(() => { throw new Error('Synthetic capability navigation failed; URL withheld'); });
      await entered;
      const link = page.locator('a[hreflang]').filter({ visible: true });
      await expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(await link.getAttribute('href') === null).toBe(true);
      await link.click({ force: true });
      expect(new URL(page.url()).pathname).toBe(`/${locale}/track`);
      expect(new URL(page.url()).searchParams.has('t')).toBe(true);
      release();
      await expect.poll(() => new URL(page.url()).searchParams.has('t')).toBe(false);
      await expect(page.getByText(f.id, { exact: true })).toBeVisible();
      await expect(link).not.toHaveAttribute('aria-disabled', 'true');
      await link.click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/track`);
      await expect(page.getByText(f.id, { exact: true })).toBeVisible();
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await f.cleanup(); }
  });
}
