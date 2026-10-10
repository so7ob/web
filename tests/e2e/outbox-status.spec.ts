import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const) test(`${locale}: outbox states are explicit and payload-free`,async({page},info)=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const db=await createDataSource().initialize(), ids:string[]=[];
 const t=getPortalContent(locale).admin.outbox;
 const states={queued:t.queued,retry:t.retry,leased:t.leased,sending:t.sending,sent:t.sent,failed:t.failed,uncertain:t.uncertain,dev_logged:t.devLogged,historical:t.unknown};
 try{
  for(const state of Object.keys(states)){
   const id=prefix+locale+info.project.name+state;ids.push(id);
   await db.query("INSERT INTO EmailLog(id,`to`,subject,bodyText,status,error,createdAt) VALUES(?,? ,?,'private account token',?,'private link',UTC_TIMESTAMP(3))",[id,'synthetic@example.invalid',state,state]);
  }
  const response=await page.request.get('/api/admin/outbox');expect(response.status()).toBe(200);
  expect(await response.text()).not.toMatch(/private account token|private link/);
  await page.goto(`/${locale}/admin/outbox`,{waitUntil:'networkidle'});
  expect(await page.locator('html').getAttribute('dir')).toBe(locale==='ar'?'rtl':'ltr');
  for(const [state,label] of Object.entries(states)){
   const row=page.getByRole('row').filter({has:page.getByText(state,{exact:true})});
   await expect(row.getByText(label,{exact:true})).toBeVisible();
  }
  await page.getByRole('table',{name:t.title}).focus();
  await expect(page.getByRole('table',{name:t.title})).toBeFocused();
  await page.keyboard.press(locale==='ar'?'ArrowLeft':'ArrowRight');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await test.info().attach('outbox',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 }finally{for(const id of ids)await db.query('DELETE FROM EmailLog WHERE id=?',[id]);await db.destroy();}
});
