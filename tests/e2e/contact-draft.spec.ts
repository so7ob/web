import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test as scopedTest } from './quota-fixture';
import { createDataSource, sha256 } from '@so7ob/server';
const test = scopedTest.extend<{ preservePublicQuota: void }>({
  preservePublicQuota: [async ({ baseURL }, use) => {
    if (new URL(baseURL!).hostname !== '127.0.0.1' || !/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? '')) throw new Error('Synthetic quota isolation requires loopback and a test database');
    const db = await createDataSource().initialize(), bucket = sha256('request:' + sha256('ip:127.0.0.1'));
    const [original] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [bucket]);
    try { await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [bucket]); await use(); } finally {
      if (original) await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)', [bucket, original.timestamps, original.updatedAt]);
      else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [bucket]);
      await db.destroy();
    }
  }, { auto: true }],
});
import { readFileSync } from 'node:fs';
import { ar } from '../../apps/web/src/content/ar';
import { en } from '../../apps/web/src/content/en';
const key = 'so7ob-request-session-draft-v1';
const note = 'Synthetic multilingual project requirements بيانات اصطناعية\nThe final edit must survive immediately.';
test.use({ trace: 'off', screenshot: 'off' });
const language = (page: Page) => page.locator('a[hreflang]').filter({ visible: true });
async function immediateSwitch(page: Page, text: string) {
  // Native controlled-input update and link activation in one task: no 400ms grace period.
  await page.evaluate(value => {
    const field = document.querySelector<HTMLTextAreaElement>('#description')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    (Array.from(document.querySelectorAll<HTMLAnchorElement>('a[hreflang]')).find(link => link.getBoundingClientRect().width > 0)!).click();
  }, text);
}
for (const locale of ['ar', 'en'] as const) {
  const other = locale === 'ar' ? 'en' : 'ar';
  test(`${locale}: SSR controls wait for hydration and draft recovery before accepting input`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/assets/index-*.js', async route => { await gate; await route.continue(); });
    await page.addInitScript(({ draftKey, draftNote }) => sessionStorage.setItem(draftKey, JSON.stringify({ owner: 'guest', expiresAt: Date.now() + 60000, values: { description: draftNote, serviceType: 'mobile' } })), { draftKey: key, draftNote: note });
    try {
      await page.goto(`/${locale}/contact`, { waitUntil: 'commit' });
      await expect(page.locator('#description')).toBeVisible();
      await expect(page.locator('#description')).toBeDisabled();
      await expect(page.locator('#email')).toBeDisabled();
      await expect(page.locator('form button[type=submit]')).toBeDisabled();
    } finally { release(); }
    await expect(page.locator('#description')).toBeEnabled();
    await expect(page.locator('#description')).toHaveValue(note);
    await expect(page.locator('#serviceType')).toHaveValue('mobile');
    await immediateSwitch(page, note + ' after hydration');
    await expect(page).toHaveURL(new RegExp(`/${other}/contact$`));
    await expect(page.locator('#description')).toHaveValue(note + ' after hydration');
  });
  test(`${locale}: immediate language changes, back and refresh preserve the complete tab draft above CMS defaults`, async ({ page }) => {
    await page.goto(`/${locale}/contact?service=web&type=discussion`);
    await page.locator('#serviceType').selectOption('mobile');
    await page.getByRole('radio', { name: (locale === 'ar' ? ar : en).form.requestTypes.quote, exact: true }).click();
    await page.locator('#budget').selectOption('tier2'); await page.locator('#currency').selectOption('USD');
    await page.locator('#timeline').selectOption('asap');
    const fields = { name: 'Synthetic contact', company: 'Synthetic company', email: 'synthetic@example.invalid', phone: '+12025550123', referenceUrl: 'https://synthetic.invalid/brief' };
    for (const [id, value] of Object.entries(fields)) await page.locator('#' + id).fill(value);
    await page.locator('#preferredContact').selectOption('phone');
    let submissions = 0; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/requests')) submissions++; });
    await immediateSwitch(page, note);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/contact`);
    await expect(page.locator('#description')).toHaveValue(note); await expect(page.locator('#serviceType')).toHaveValue('mobile');
    await expect(page.getByRole('radio', { name: (other === 'ar' ? ar : en).form.requestTypes.quote, exact: true })).toHaveAttribute('aria-checked', 'true');
    expect([...new URL(page.url()).searchParams]).toEqual([]);
    for (const [id, value] of Object.entries(fields)) await expect(page.locator('#' + id)).toHaveValue(value);
    for (const [id, value] of Object.entries({ budget: 'tier2', currency: 'USD', timeline: 'asap', preferredContact: 'phone' })) await expect(page.locator('#' + id)).toHaveValue(value);
    await immediateSwitch(page, note + ' newest');
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${locale}/contact`);
    await expect(page.locator('#description')).toHaveValue(note + ' newest');
    await page.goBack(); await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/contact`); await expect(page.locator('#description')).toHaveValue(note + ' newest');
    await page.reload(); await expect(page.locator('#description')).toHaveValue(note + ' newest');
    await expect(page.locator('#serviceType')).toHaveValue('mobile');
    const stored = await page.evaluate(draftKey => JSON.parse(sessionStorage.getItem(draftKey) ?? '{}'), key);
    expect(stored.values.description).toBe(note + ' newest'); expect(stored.values.serviceType).toBe('mobile'); expect(stored.owner).toBe('guest');
    for (const field of ['locale', 'website', 'startedAt', 'clientId']) expect(stored.values).not.toHaveProperty(field);
    expect(await page.evaluate(() => localStorage.getItem('so7ob-request-draft'))).toBeNull();
    expect(submissions).toBe(0);
    await language(page).focus(); await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${locale}/contact`);
    await expect(page.locator('#description')).toHaveValue(note + ' newest');
    await page.locator('body').evaluate(async root => { await Promise.all(root.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))); });
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });
  test(`${locale}: unavailable storage retains language changes in memory and discloses reload limits`, async ({ page }) => {
    await page.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { configurable: true, value: function(this: Storage, ...args: string[]) { if (this === sessionStorage) throw new Error('Synthetic blocked session storage'); return Reflect.apply(original, this, args); } });
      }
    });
    await page.goto(`/${locale}/contact`); await page.locator('#serviceType').selectOption('mobile');
    await immediateSwitch(page, note);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${other}/contact`);
    await expect(page.locator('#description')).toHaveValue(note); await expect(page.locator('#serviceType')).toHaveValue('mobile');
    await expect(page.getByText(other === 'en' ? /Storage is unavailable/ : /التخزين غير متاح/)).toBeVisible();
    await immediateSwitch(page, note + ' memory');
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${locale}/contact`);
    await expect(page.locator('#description')).toHaveValue(note + ' memory');
    await page.reload(); await expect(page.locator('#description')).toHaveValue('');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });
  test(`${locale}: failure retains input, successful submission and reset clear it without a delayed resurrection`, async ({ page, baseURL }, info) => {
    test.setTimeout(45000);
    const { prefix } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const email = prefix + 'contact' + locale + info.project.name + info.repeatEachIndex + '@example.invalid';
    await page.goto(`/${locale}/contact`);
    await page.locator('#serviceType').selectOption('mobile');
    await page.locator('#description').fill(note); await page.locator('#name').fill('Synthetic contact'); await page.locator('#email').fill(email);
    await page.route('**/api/requests', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false }) }), { times: 1 });
    const rejected = page.waitForResponse(r => r.url().endsWith('/api/requests') && r.request().method() === 'POST');
    await page.locator('form button[type=submit]').click(); expect((await rejected).status()).toBe(503);
    await expect(page.getByRole('alert')).toBeVisible();
    await language(page).click(); await expect(page).toHaveURL(new RegExp(`/${other}/contact$`));
    await expect(page.locator('#description')).toHaveValue(note); await expect(page.locator('#email')).toHaveValue(email);
    await expect(page.locator('#name')).toHaveValue('Synthetic contact'); await expect(page.locator('#serviceType')).toHaveValue('mobile');
    // Realistic typing respects the production form's minimum-fill guard after any remount.
    await page.locator('#description').fill(''); await page.locator('#description').pressSequentially(note, { delay: 25 });
    await expect(page.locator('#name')).toHaveValue('Synthetic contact'); await expect(page.locator('#email')).toHaveValue(email);
    const sent = page.waitForResponse(r => r.url().endsWith('/api/requests') && r.request().method() === 'POST');
    await page.locator('form button[type=submit]').click(); expect((await sent).status()).toBe(201);
    await expect(page.getByRole('status')).toBeVisible();
    expect(await page.evaluate(draftKey => sessionStorage.getItem(draftKey), key)).toBeNull();
    await page.getByRole('button', { name: (other === 'ar' ? ar : en).form.success.another, exact: true }).click();
    await expect(page.locator('#description')).toHaveValue('');
    await language(page).click(); await page.reload(); await expect(page.locator('#description')).toHaveValue('');
    expect(await page.evaluate(draftKey => sessionStorage.getItem(draftKey), key)).toBeNull();
    expect(new URL(page.url()).origin).toBe(baseURL);
  });
}
test('contact drafts remain separate across account identities and never replace server account drafts', async ({ page, baseURL }) => {
  const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
  const login = async (suffix: string) => {
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json();
    expect((await page.request.post('/api/auth/callback/credentials', { form: { email: prefix + suffix + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
  };
  await login('owner'); const original = (await (await page.request.get('/api/account/drafts')).json()).draft;
  const server = { description: 'Synthetic server account draft', serviceType: 'automation' };
  try {
    expect((await page.request.put('/api/account/drafts', { headers: { Origin: baseURL! }, data: server })).status()).toBe(200);
    await page.goto('/ar/contact'); await page.locator('#description').fill('Synthetic private contact draft A');
    await login('other'); await page.goto('/en/contact'); await expect(page.locator('#description')).toHaveValue('');
    await page.locator('#description').fill('Synthetic private contact draft B');
    await login('owner'); await page.goto('/ar/contact'); await expect(page.locator('#description')).toHaveValue('');
    expect((await (await page.request.get('/api/account/drafts')).json()).draft).toMatchObject(server);
  } finally {
    if (original) await page.request.put('/api/account/drafts', { headers: { Origin: baseURL! }, data: original });
    else await page.request.delete('/api/account/drafts', { headers: { Origin: baseURL! } });
  }
});
