import {expect} from '@playwright/test';
import {test} from './quota-fixture';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
import {createDataSource,PayloadCipher} from '@so7ob/server';
for(const locale of ['ar','en'])test(`${locale}: invited user accepts through keyboard form and cannot reuse the invitation`,async({page,playwright,baseURL},info)=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),db=await createDataSource().initialize();
 const admin=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true}),email=prefix+'ui-invite-'+locale+'-'+info.project.name+'@example.invalid';
 try{
  const {csrfToken}=await(await admin.get('/api/auth/csrf')).json();
  expect((await admin.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
  expect((await admin.post('/api/admin/users',{headers:{'x-csrf-token':csrfToken},data:{email,roleKey:'support'}})).status()).toBe(201);
  const [job]=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?',[email]);
  const mail=new PayloadCipher().decrypt(job.payload,job.id),link=new URL(mail.text.match(/https?:\/\/[^\s]+/)![0]);
  const path='/'+locale+'/auth/invite'+link.search;
  await page.goto(path,{waitUntil:'networkidle'});
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.locator('#invite-name').focus();await page.keyboard.insertText('Synthetic invited user');
  await page.locator('#invite-password').fill(password);await page.locator('#invite-confirm').fill('Mismatch-1234');
  await page.locator('form button[type=submit]').click();expect(await db.query('SELECT id FROM User WHERE email=?',[email])).toHaveLength(0);
  await page.locator('#invite-confirm').fill(password);
  const accepted=page.waitForResponse(r=>r.url().endsWith('/api/auth/invite')&&r.request().method()==='POST');
  await page.locator('form button[type=submit]').focus();await page.keyboard.press('Enter');expect((await accepted).status()).toBe(201);
  await expect(page).toHaveURL(new RegExp('/'+locale+'/auth/login'));
  expect((await db.query('SELECT name,roleKey FROM User WHERE email=?',[email]))[0]).toEqual({name:'Synthetic invited user',roleKey:'support'});
  await page.goto(path,{waitUntil:'networkidle'});await page.locator('#invite-name').fill('Replay');await page.locator('#invite-password').fill(password);await page.locator('#invite-confirm').fill(password);
  const replay=page.waitForResponse(r=>r.url().endsWith('/api/auth/invite')&&r.request().method()==='POST');await page.locator('form button[type=submit]').click();expect((await replay).status()).toBe(400);await expect(page.getByRole('alert')).toBeVisible();
 }finally{await admin.dispose();await db.destroy();}
});
