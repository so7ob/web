import {expect} from '@playwright/test';
import {test} from './quota-fixture';
import AxeBuilder from '@axe-core/playwright';
import{readFileSync}from'node:fs';
import {createDataSource} from '@so7ob/server';
import{getPortalContent}from'../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: stale settings and menu edits survive conflict review and reload`,async({page,context})=>{
 test.setTimeout(60000);
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),t=getPortalContent(locale);
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const other=await context.newPage(),headers={'x-csrf-token':csrfToken};
 const originalSettings=(await(await page.request.get('/api/admin/settings')).json()).settings;
 const db=await createDataSource().initialize();
 const menuSnapshot=await db.query("SELECT * FROM MenuItem WHERE location='header'");
 try{
  for(const kind of ['settings','menus'] as const){
   const path=`/${locale}/admin/${kind}`,field=kind==='settings'?'#contact-address':'#label-en-0';
   await page.goto(path,{waitUntil:'networkidle'});await other.goto(path,{waitUntil:'networkidle'});
   await page.locator(field).fill('Synthetic winner');await other.locator(field).fill('Synthetic preserved draft');
   const first=page.waitForResponse(r=>r.url().endsWith(`/api/v1/admin/${kind}/checked`)&&r.request().method()!=='GET');
   await page.getByRole('button',{name:t.admin[kind].save,exact:true}).click();expect((await first).status()).toBe(200);
   const stale=other.waitForResponse(r=>r.url().endsWith(`/api/v1/admin/${kind}/checked`)&&r.request().method()!=='GET');
   await other.getByRole('button',{name:t.admin[kind].save,exact:true}).click();expect((await stale).status()).toBe(409);
   await expect(other.locator(field)).toHaveValue('Synthetic preserved draft');
   const draft=other.getByLabel(locale==='ar'?'مسودة تعديلاتك المحفوظة':'Your preserved draft');
   await expect(draft).toHaveValue(/Synthetic preserved draft/);
   await other.getByRole('button',{name:locale==='ar'?'مراجعة النسخة الحالية':'Review current version',exact:true}).click();
   await expect(other.locator('pre')).toContainText('Synthetic winner');
   await other.getByRole('button',{name:locale==='ar'?'إعادة تحميل مع الاحتفاظ بالمسودة':'Reload and keep draft',exact:true}).click();
   await expect(other.locator(field)).toHaveValue('Synthetic winner');await expect(draft).toHaveValue(/Synthetic preserved draft/);
   await other.reload({waitUntil:'networkidle'});await expect(draft).toHaveValue(/Synthetic preserved draft/);
   expect((await new AxeBuilder({page:other}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  }
 }finally{
  await page.request.patch('/api/admin/settings',{headers,data:{'contact.address':originalSettings['contact.address']??''}});
  // Restore exact fixture identities; the replacement API would cause the
  // next global setup to reinsert the original seed IDs alongside new IDs.
  try{await db.transaction(async manager=>{
   await manager.query("DELETE FROM MenuItem WHERE location='header'");
   for(const row of menuSnapshot){const keys=Object.keys(row);await manager.query('INSERT INTO MenuItem ('+keys.map(k=>'`'+k+'`').join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));}
  });expect(await db.query("SELECT * FROM MenuItem WHERE location='header' ORDER BY id")).toEqual([...menuSnapshot].sort((a,b)=>a.id.localeCompare(b.id)));}finally{await db.destroy();await other.close();}
 }
});
