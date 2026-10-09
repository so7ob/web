import {expect} from '@playwright/test';
import {test} from './quota-fixture';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
for(const locale of ['ar','en'] as const)test(`${locale}: administrator saves menu labels and announcement settings, observes public HTML and audit`,async({page},info)=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),t=getPortalContent(locale),db=await createDataSource().initialize();
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken},original=(await(await page.request.get('/api/admin/settings')).json()).settings;
 const menus=(await(await page.request.get('/api/admin/menus')).json()).header;
 const menuSnapshot=await db.query("SELECT * FROM MenuItem WHERE location='header'");
 expect(menus).toHaveLength(menuSnapshot.length);
 const marker='Synthetic '+locale+' '+info.project.name;
 try{
  await page.goto('/'+locale+'/admin/settings',{waitUntil:'networkidle'});
  await page.locator('#contact-phone').focus();await page.keyboard.press('Control+a');await page.keyboard.insertText('+967 123456789');
  await page.locator('#announcement-message-ar').fill(marker+' عربي');await page.locator('#announcement-message-en').fill(marker+' English');
  if((await page.locator('#announcement-enabled').getAttribute('aria-checked'))!=='true')await page.locator('#announcement-enabled').click();
  const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/api/admin/settings'));
  await page.getByRole('button',{name:t.admin.settings.save,exact:true}).click();expect((await saved).status()).toBe(200);
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('#contact-phone')).toHaveValue('+967 123456789');
  expect((await db.query("SELECT value FROM SiteSetting WHERE `key`='announcement.messageAr'"))[0].value).toBe(marker+' عربي');
  expect(await(await page.request.get('/'+locale)).text()).toContain(marker+(locale==='ar'?' عربي':' English'));
  await page.goto('/'+locale+'/admin/menus',{waitUntil:'networkidle'});
  await page.locator('#label-ar-0').fill(marker+' قائمة');await page.locator('#label-en-0').fill(marker+' Menu');
  const menuSaved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/admin/menus'));
  await page.getByRole('button',{name:t.admin.menus.save,exact:true}).click();expect((await menuSaved).status()).toBe(200);
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('#label-en-0')).toHaveValue(marker+' Menu');
  expect(await(await page.request.get('/'+locale)).text()).toContain(marker+(locale==='ar'?' قائمة':' Menu'));
  expect((await db.query('SELECT id FROM AuditLog WHERE actorId=?',[prefix+'admin'])).length).toBeGreaterThan(1);
 }finally{
  try{
   expect((await page.request.patch('/api/admin/settings',{headers,data:Object.fromEntries(['contact.phone','announcement.enabled','announcement.messageAr','announcement.messageEn'].map(k=>[k,original[k]??(k==='announcement.enabled'?'false':'')]))})).status()).toBe(200);
   // The menu API deliberately replaces IDs. Restore exact fixture rows so the
   // next setup cannot reinsert seed IDs alongside our replacement rows.
   await db.transaction(async manager=>{
    await manager.query("DELETE FROM MenuItem WHERE location='header'");
    for(const row of menuSnapshot){const columns=Object.keys(row);await manager.query('INSERT INTO MenuItem ('+columns.map(k=>'`'+k+'`').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')',columns.map(k=>row[k]));}
   });
   expect(await db.query("SELECT * FROM MenuItem WHERE location='header' ORDER BY id")).toEqual([...menuSnapshot].sort((a,b)=>a.id.localeCompare(b.id)));
  }finally{await db.destroy();}
 }
});
