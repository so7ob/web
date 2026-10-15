import { expect } from '@playwright/test';
import { test } from './client-original-description-fixture';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { documentAudit, VisualReadiness } from './visual-checks';

test.use({ contextOptions: { reducedMotion: 'reduce' } });
for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: actual client creates, follows and reloads the original request with replies and attachments`, async ({ page, baseURL, originalRequest: fixture }, info) => {
    const t = getPortalContent(locale).account;
    const description = 'طلب أصلي اصطناعي متعدد الأسطر\nOriginal synthetic client request108 ' + locale + ' ' + info.project.name + ', preserving the text I submitted.';
    await page.goto(`/${locale}/account/requests/new?service=web&type=quote`, { waitUntil: 'networkidle' });
    // Human typing keeps the real two-second minimum-fill protection active.
    await page.locator('#description').pressSequentially(description, { delay: 25 });
    await page.locator('#name').fill('Synthetic original request client');
    await page.locator('#email').fill(fixture.email);
    const submitted = page.waitForResponse(response => response.url().endsWith('/api/requests') && response.request().method() === 'POST');
    await page.locator('form button[type=submit]').focus(); await page.keyboard.press('Enter');
    const response = await submitted; expect(response.status()).toBe(201);
    const { ref } = await response.json();
    await expect(page.getByRole('status').filter({ hasText: ref })).toBeVisible();
    const [stored] = await fixture.db.query('SELECT * FROM ProjectRequest WHERE refCode=?', [ref]);
    expect(stored.clientId).toBe(fixture.prefix + 'owner'); expect(stored.description).toBe(description);
    const messages = await fixture.db.query('SELECT * FROM RequestMessage WHERE requestId=? ORDER BY id', [stored.id]);
    const workflows = await fixture.db.query("SELECT * FROM ConversationWorkflow WHERE scope='requests' AND recordId=?", [stored.id]);
    const open = page.getByRole('link', { name: t.requests.viewDetails, exact: true });
    await open.focus(); await expect(open).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/account/requests/${stored.id}$`));
    const original = page.getByRole('region', { name: t.detail.originalRequest, exact: true });
    for (const reload of [false, true]) {
      if (reload) await page.reload({ waitUntil: 'networkidle' });
      await expect(original).toBeVisible(); expect(await original.locator('p').textContent()).toBe(description);
      const detail = await page.request.get('/api/account/requests/' + stored.id);
      expect(detail.status()).toBe(200); expect((await detail.json()).request.description).toBe(description);
    }
    // Reading the new section adds no opening message and changes no SLA/history.
    expect(await fixture.db.query('SELECT * FROM RequestMessage WHERE requestId=? ORDER BY id', [stored.id])).toEqual(messages);
    expect(await fixture.db.query("SELECT * FROM ConversationWorkflow WHERE scope='requests' AND recordId=?", [stored.id])).toEqual(workflows);
    const [afterRead] = await fixture.db.query('SELECT * FROM ProjectRequest WHERE id=?', [stored.id]);
    for (const key of Object.keys(stored).filter(key => !['clientReadAt', 'updatedAt'].includes(key))) expect(afterRead[key], key).toEqual(stored[key]);
    const reply = 'Synthetic follow-up reply108 ' + locale;
    await page.getByRole('textbox', { name: t.detail.replyPlaceholder }).fill(reply);
    const replied = page.waitForResponse(response => response.url().endsWith(`/api/account/requests/${stored.id}/messages`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: t.detail.send, exact: true }).click(); expect((await replied).status()).toBe(201);
    await expect(page.getByText(reply, { exact: true })).toBeVisible();
    const bytes = Buffer.from('%PDF-1.4\nSynthetic original request108 attachment\n%%EOF\n');
    const upload = await page.request.post('/api/attachments', { headers: { Origin: baseURL! }, multipart: { requestId: stored.id, file: { name: 'original108.pdf', mimeType: 'application/pdf', buffer: bytes } } });
    expect(upload.status()).toBe(201);
    const { attachment } = await upload.json();
    expect(await (await page.request.get('/api/attachments/' + attachment.id)).body()).toEqual(bytes);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(original).toBeVisible(); expect(await original.locator('p').textContent()).toBe(description);
    await expect(page.getByText(reply, { exact: true })).toBeVisible();
    await expect(page.getByText('original108.pdf', { exact: true })).toBeVisible();
    expect((await fixture.db.query("SELECT body FROM RequestMessage WHERE requestId=? AND authorType='client' AND kind='message'", [stored.id])).map((row: { body: string }) => row.body)).toEqual([reply]);
    expect((await fixture.db.query('SELECT description FROM ProjectRequest WHERE id=?', [stored.id]))[0].description).toBe(description);
  });

  test(`${locale}: original text stays accessible, wrapped and private for long and empty legacy requests`, async ({ page, request, originalRequest: fixture }, info) => {
    const t = getPortalContent(locale).account.detail;
    const description = 'وصف أصلي طويل\nLong original108\n' + 'نص عربي وEnglish preserved. '.repeat(70) + '\n' + 'unbroken108'.repeat(65) + '\n<strong data-origin108>Literal markup108</strong>';
    const own = await fixture.legacy(description), empty = await fixture.legacy(''), other = await fixture.legacy('Another client original108 must remain private', 'other');
    const admin = await fixture.apiFor('admin');
    for (const data of [{ body: 'Synthetic public staff reply108' }, { body: 'Synthetic private internal note108', kind: 'internal_note' }]) expect((await admin.request.post('/api/account/requests/' + own.id + '/messages', { headers: admin.headers, data })).status()).toBe(201);
    expect((await page.request.post('/api/account/requests/' + own.id + '/messages', { headers: fixture.headers, data: { body: 'Synthetic public client reply108' } })).status()).toBe(201);
    const before = (await fixture.db.query('SELECT * FROM ProjectRequest WHERE id=?', [own.id]))[0];
    const messages = await fixture.db.query('SELECT * FROM RequestMessage WHERE requestId=? ORDER BY id', [own.id]);
    expect((await request.get('/api/account/requests/' + own.id)).status()).toBe(401);
    expect((await page.request.get('/api/account/requests/' + other.id)).status()).toBe(403);
    const otherClient = await fixture.apiFor('other');
    expect((await otherClient.request.get('/api/account/requests/' + own.id)).status()).toBe(403);
    const detail = await page.request.get('/api/account/requests/' + own.id);
    expect(detail.status()).toBe(200);
    const exposed = (await detail.json()).request;
    expect(exposed.description).toBe(description);
    expect(JSON.stringify(exposed)).not.toContain('Synthetic private internal note108');
    await page.goto(`/${locale}/account/requests/${own.id}`, { waitUntil: 'networkidle' });
    const original = page.getByRole('region', { name: t.originalRequest, exact: true });
    await expect(original).toBeVisible(); expect(await original.locator('p').textContent()).toBe(description);
    await expect(original.locator('p')).toHaveAttribute('dir', 'auto');
    await expect(original.locator('p')).toHaveCSS('white-space', 'pre-wrap');
    await expect(page.locator('[data-origin108]')).toHaveCount(0);
    for (const text of ['Synthetic public staff reply108', 'Synthetic public client reply108']) await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic private internal note108', { exact: true })).toHaveCount(0);
    const readiness = new VisualReadiness(page);
    try {
      await readiness.wait();
      expect((await documentAudit(page)).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach('client-original-' + locale, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.emulateMedia({ media: 'print' }); await expect(original).toBeVisible(); await page.emulateMedia({ media: 'screen' });
      await page.goto(`/${locale}/account/requests/${empty.id}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('region', { name: t.originalRequest, exact: true })).toContainText(t.originalDescriptionUnavailable);
      await expect(page.getByText(description, { exact: true })).toHaveCount(0);
      const [after] = await fixture.db.query('SELECT * FROM ProjectRequest WHERE id=?', [own.id]);
      for (const key of Object.keys(before).filter(key => !['clientReadAt', 'updatedAt'].includes(key))) expect(after[key], key).toEqual(before[key]);
      expect(await fixture.db.query('SELECT * FROM RequestMessage WHERE requestId=? ORDER BY id', [own.id])).toEqual(messages);
    } finally { readiness.dispose(); }
  });
}
