import { expect } from '@playwright/test';
import { test } from './quota-fixture';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { createDataSource, sha256 } from '@so7ob/server';

for (const locale of ['ar','en'] as const) test(`${locale}: smoke login, owned request creation, listing and cross-owner denial`, async ({page,browser,baseURL},info) => {
  const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
  const id=prefix+'smoke'+info.project.name+locale, email=id+'@example.invalid';
  const db=await createDataSource().initialize();
  const other=await browser.newContext({baseURL,ignoreHTTPSErrors:true});
  try {
    const hash=await bcrypt.hash(password,12);
    for(const suffix of ['', 'other'])await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) VALUES(?,?,?,?,'client','active',UTC_TIMESTAMP(3),?)",[id+suffix,id+suffix+'@example.invalid','Synthetic smoke client',hash,locale]);
    await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256('request:'+sha256('ip:127.0.0.1'))]);
    await page.goto(`/${locale}/auth/login`);
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
    await page.goto(`/${locale}/account/requests/new?service=web&type=quote`);
    // Exercise the production minimum-fill guard with ordinary typing, not a bypass.
    await page.locator('#description').pressSequentially(`Synthetic smoke request ${info.project.name} ${locale}: preserve ownership and request data.`,{delay:30});
    await page.locator('#name').fill('Synthetic smoke client');
    await page.locator('#email').fill(email);
    const sent=page.waitForResponse(r=>r.url().endsWith('/api/requests')&&r.request().method()==='POST');
    await page.locator('form button[type=submit]').click();
    const response=await sent;expect(response.status()).toBe(201);
    const {ref}=await response.json();
    await expect(page.getByRole('status').filter({hasText:ref})).toBeVisible();
    const [record]=await db.query('SELECT p.id,p.clientId,w.versionId FROM ProjectRequest p JOIN ConversationWorkflow w ON w.recordId=p.id AND w.scope=\'requests\' WHERE p.refCode=?',[ref]);
    expect(record).toMatchObject({clientId:id,versionId:'legacy-requests'});
    await page.goto(`/${locale}/account/requests`);
    const link=page.getByRole('link',{name:ref,exact:true});await expect(link).toBeVisible();
    await link.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:ref,exact:true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    const {csrfToken}=await(await other.request.get('/api/auth/csrf')).json();
    expect((await other.request.post('/api/auth/callback/credentials',{form:{email:id+'other@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
    const list=await(await other.request.get('/api/account/requests')).json();
    expect(list.ok).toBe(true);expect(list.requests).toEqual([]);
    const denied=await other.request.get('/api/account/requests/'+record.id);
    expect([403,404]).toContain(denied.status());expect(await denied.text()).not.toContain(ref);
    expect(Number((await db.query('SELECT COUNT(*) n FROM ProjectRequest WHERE id=? AND clientId=?',[record.id,id]))[0].n)).toBe(1);
  } finally {await other.close();await db.destroy();}
});
