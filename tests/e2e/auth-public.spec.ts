import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createDataSource, PayloadCipher, sha256 } from '@so7ob/server';
const fixture=()=>JSON.parse(readFileSync('.migration/e2e/run.json','utf8')) as {prefix:string;password:string};
for (const locale of ['ar','en']) {
  test(`${locale}: SSR, direct reload, language and authentication navigation`,async({page})=>{
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto(`/${locale}/auth/login`); expect(response?.status()).toBe(200);
    expect(await response!.text()).toContain('login-email'); await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    await page.reload(); await page.locator('#login-email').fill('missing@example.invalid'); await page.locator('#login-password').fill('Wrong-Password-4929'); await page.locator('form button[type=submit]').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.locator('main a[href="/'+locale+'/auth/register"]').click(); await expect(page.locator('h1')).toContainText(locale==='ar'?'حساب':'account');
    await expect(page).toHaveTitle(locale==='ar'?/حساب/:/account/i);
    expect(errors).toEqual([]);
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    const baseline=JSON.parse(readFileSync('tests/e2e/fixtures/auth-axe-baseline.json','utf8'));
    expect(baseline.cases[`${page.viewportSize()!.width}:${locale}`]).toEqual([]);
    expect(audit.violations.map(v=>v.id)).toEqual([]);
  });
  test(`${locale}: login uses the server session and logout clears the local draft`,async({page})=>{
    const {prefix,password}=fixture(); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`/${locale}/auth/login?next=/${locale}`); await page.locator('#login-email').fill(prefix+'owner@example.invalid'); await page.locator('#login-password').fill(password); await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(url=>url.pathname==='/'+locale && url.search===''); const session=await page.request.get('/api/auth/session'); expect((await session.json()).user.id).toBe(prefix+'owner');
    await page.evaluate(owner=>{localStorage.setItem('so7ob-request-draft','synthetic draft');sessionStorage.setItem('so7ob-request-session-draft-v1',JSON.stringify({owner:'user:'+owner,expiresAt:Date.now()+1800000,values:{description:'Synthetic transient draft'}}));},prefix+'owner');
    await page.goto(`/${locale}/auth/logout`); await expect(page).toHaveURL(url=>url.pathname==='/'+locale && url.search==='');
    expect(await page.evaluate(()=>localStorage.getItem('so7ob-request-draft'))).toBeNull();expect(await page.evaluate(()=>sessionStorage.getItem('so7ob-request-session-draft-v1'))).toBeNull(); expect(await (await page.request.get('/api/auth/session')).json()).toEqual({}); expect(errors).toEqual([]);
  });
}
test('registration and one-use verification use the encrypted outbox; no development link in production',async({page},info)=>{
  const {prefix,password}=fixture(); const email=prefix+'registered'+info.project.name+'@example.invalid';
  await page.goto('/en/auth/register');
  const fields=page.locator('form input');
  await fields.nth(0).fill('Synthetic Registered'); await fields.nth(1).fill(email); await fields.nth(2).fill(password); await fields.nth(3).fill(password);
  const submitted=page.waitForResponse(r=>r.url().endsWith('/api/auth/register')&&r.request().method()==='POST'); await page.locator('form button[type=submit]').click();
  const response=await submitted; expect(response.status()).toBe(201); expect(await response.json()).toEqual({ok:true,emailStatus:'queued'});
  const db=await createDataSource().initialize();
  try {
    const [job]=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?',[email]);
    const mail=new PayloadCipher(process.env.OUTBOX_KEY).decrypt(job.payload,job.id); const link=mail.text.match(/https?:\/\/[^\s]+/)![0];
    await page.goto(link); await expect(page).toHaveURL(/auth\/verified\?status=ok$/);
    await page.goto(link); await expect(page).toHaveURL(/auth\/verified\?status=invalid$/);
  } finally { await db.destroy(); }
});
test('404 retains its actual HTTP status and published HTML carries SEO',async({page})=>{
  const missing=await page.goto('/ar/not-an-existing-page'); expect(missing?.status()).toBe(404); await expect(page.getByRole('heading',{name:/الصفحة غير موجودة/})).toBeVisible();
  const response=await page.goto('/ar'); const html=await response!.text(); expect(html).toContain('rel="canonical"'); expect(html).toContain('hreflang="en"'); expect(html).toContain('twitter:title'); expect(html).toContain('سُحُب');
  expect((await page.request.get('/server/entry-server.js')).status()).toBe(404);
});
test('forgot/reset forms preserve one-use tokens and reject a mismatched confirmation',async({page})=>{
  const {prefix}=fixture(); const email=prefix+'recovery@example.invalid'; const password='Synthetic-Reset-5930';
  await page.goto('/en/auth/forgot-password'); await page.locator('#forgot-email').focus(); await expect(page.locator('#forgot-email')).toBeFocused(); await page.keyboard.type(email); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('form')).toHaveCount(0);
  const db=await createDataSource().initialize();let link:string;
  try {
    const [job]=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=? ORDER BY j.createdAt DESC LIMIT 1',[email]);
    link=new PayloadCipher(process.env.OUTBOX_KEY).decrypt(job.payload,job.id).text.match(/https?:\/\/[^\s]+/)![0];
  } finally { await db.destroy(); }
  // Source forgot-password links use the stored account locale (this fixture defaults to ar).
  expect(new URL(link).pathname).toBe('/ar/auth/reset-password');
  await page.goto(link); const fields=page.locator('form input[type="password"]');await fields.nth(0).fill(password);await fields.nth(1).fill('Mismatch-Value-5930');await page.locator('form button[type=submit]').click();await expect(fields.nth(1)).toHaveAttribute('aria-invalid','true');
  await fields.nth(1).fill(password);await page.locator('form button[type=submit]').click();await expect(page).toHaveURL(/\/ar\/auth\/login$/);
  await page.goto(link);await fields.nth(0).fill(password);await fields.nth(1).fill(password);await page.locator('form button[type=submit]').click();await expect(page.getByRole('alert')).toBeVisible();
});

for (const locale of ['ar', 'en'] as const) {
  test(`${locale}: delayed registration hydration retains first keyboard input and validation recovery`, async ({ page }, info) => {
    const { prefix, password } = fixture();
    const email = prefix + 'hydrated-' + locale + '-' + info.project.name + '@example.invalid';
    // Whole-bucket snapshot restoration requires one worker and a database owned
    // exclusively by this test process (each shard must use a different database).
    expect(info.config.workers).toBe(1);
    expect(info.config.fullyParallel).toBe(false);
    const db = await createDataSource().initialize();
    const bucketKey = sha256('register:127.0.0.1');
    const [savedBucket] = await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?', [bucketKey]);
    const savedTimestamps: number[] = savedBucket ? JSON.parse(savedBucket.timestamps) : [];
    const seededTimestamps = [Date.now() - 2 * 86400000, ...savedTimestamps];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let intercepted = 0, registrations = 0;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('/api/auth/register') && request.method() === 'POST') registrations++; });
    await page.route('**/assets/auth-*.js', async route => { intercepted++; await gate; await route.continue(); });
    try {
      // Exercise real daily-window pruning without removing earlier attempts or
      // changing production limits. Finally restores the entire original snapshot.
      await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps) VALUES(?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps)', [bucketKey, JSON.stringify(seededTimestamps)]);
      await page.goto(`/${locale}/auth/register`, { waitUntil: 'commit' });
      const form = page.locator('form');
      const name = page.locator('#register-name'), address = page.locator('#register-email');
      const secret = page.locator('#register-password'), confirm = page.locator('#register-confirm');
      const submit = form.locator('button[type=submit]');
      await expect(name).toBeVisible();
      await expect.poll(() => intercepted).toBeGreaterThan(0);
      for (const field of [name, address, secret, confirm, submit]) await expect(field).toBeDisabled();
      await expect(form).toHaveAttribute('aria-busy', 'true');
      expect(registrations).toBe(0);
      release();
      for (const field of [name, address, secret, confirm, submit]) await expect(field).toBeEnabled();
      await expect(form).toHaveAttribute('aria-busy', 'false');
      await expect(submit).toHaveCSS('opacity', '1');
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      const screenshots = '.migration/design-system/screenshots/registration-hydration';
      mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: `${screenshots}/${locale}-${info.project.name}.png`, fullPage: true });
      await name.focus(); await page.keyboard.type('Synthetic First Input');
      await page.keyboard.press('Tab'); await expect(address).toBeFocused(); await page.keyboard.type(email);
      await page.keyboard.press('Tab'); await expect(secret).toBeFocused(); await page.keyboard.type(password);
      await page.keyboard.press('Tab'); await expect(confirm).toBeFocused(); await page.keyboard.type(password + '-mismatch');
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      await expect(confirm).toHaveAttribute('aria-invalid', 'true');
      expect(registrations).toBe(0);
      await expect(name).toHaveValue('Synthetic First Input'); await expect(address).toHaveValue(email); await expect(secret).toHaveValue(password);
      await confirm.fill(password);
      const submitted = page.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
      const submissionStarted = Date.now();
      await submit.click();
      const response = await submitted;
      const submissionFinished = Date.now();
      expect(response.status()).toBe(201);
      expect(await response.json()).toEqual({ ok: true, emailStatus: 'queued' });
      const payload = response.request().postDataJSON();
      expect(payload).toEqual({ name: 'Synthetic First Input', email, password, locale });
      await expect(form).toHaveCount(0);
      expect(registrations).toBe(1); expect(errors).toEqual([]);
      const [consumed] = await db.query('SELECT timestamps FROM RateLimitBucket WHERE bucketKey=?', [bucketKey]);
      const timestamps: number[] = JSON.parse(consumed.timestamps);
      const chargedAt = timestamps.at(-1)!;
      expect(chargedAt).toBeGreaterThanOrEqual(submissionStarted);
      expect(chargedAt).toBeLessThanOrEqual(submissionFinished);
      // The limiter appends its exact clock value after pruning. Use that value
      // so a saved timestamp expiring during this request cannot cause a false failure.
      expect(timestamps).toEqual([...seededTimestamps.filter(timestamp => chargedAt - timestamp < 86400000), chargedAt]);
    } finally {
      release(); await page.unroute('**/assets/auth-*.js');
      try {
        if (savedBucket) await db.query('UPDATE RateLimitBucket SET timestamps=?,updatedAt=? WHERE bucketKey=?', [savedBucket.timestamps, savedBucket.updatedAt, bucketKey]);
        else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?', [bucketKey]);
      } finally { await db.destroy(); }
    }
  });
}
