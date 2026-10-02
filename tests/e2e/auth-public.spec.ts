import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createDataSource, PayloadCipher } from '@so7ob/server';
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
    await page.evaluate(()=>localStorage.setItem('so7ob-request-draft','synthetic draft'));
    await page.goto(`/${locale}/auth/logout`); await expect(page).toHaveURL(url=>url.pathname==='/'+locale && url.search==='');
    expect(await page.evaluate(()=>localStorage.getItem('so7ob-request-draft'))).toBeNull(); expect(await (await page.request.get('/api/auth/session')).json()).toEqual({}); expect(errors).toEqual([]);
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
