import {test} from './quota-fixture';
import {expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
import {errorCopy} from '../../apps/web/src/lib/errors/messages';
import AxeBuilder from '@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: mutation feedback classifies HTTP/transport failures without false saves or replay`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const db=await createDataSource().initialize(),id=prefix+'errors'+randomBytes(4).toString('hex'),t=getPortalContent(locale),copy=errorCopy[locale];
 try{
  await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic error test','synthetic','unspecified','flexible','Synthetic','safe@example.invalid','email',?)",[id,id,locale]);
  await page.goto(`/${locale}/admin/requests/${id}`,{waitUntil:'networkidle'});
  const choose=async()=>{await page.getByRole('combobox',{name:t.admin.requests.priority,exact:true}).click();await page.getByRole('option',{name:t.admin.requests.priorities.high,exact:true}).click();};
  for(const [status,code,category] of [[401,'unauthorized','authentication'],[403,'forbidden','authorization'],[429,'rate_limited','rate_limit'],[500,'internal_error','internal']] as const){
   const trace=randomUUID();let calls=0;
   await page.route('**/api/admin/requests/'+id,async route=>{if(route.request().method()==='PATCH'){calls++;await route.fulfill({status,contentType:'application/json',headers:{'x-request-id':trace,'x-error-id':trace,'retry-after':'7'},body:JSON.stringify({ok:false,code,message:'SYNTHETIC_PRIVATE'})});}else await route.continue();});
   await choose();await expect(page.getByText(copy[category],{exact:true})).toBeVisible();await expect(page.getByText(trace,{exact:false})).toBeVisible();expect(calls).toBe(1);expect(await page.locator('main').innerText()).not.toContain('SYNTHETIC_PRIVATE');await page.unroute('**/api/admin/requests/'+id);
  }
  for(const mode of ['invalid_response','network'] as const){let writes=0;
   await page.route('**/api/admin/requests/'+id,async route=>{if(route.request().method()==='PATCH'){writes++;if(mode==='network')await route.abort('failed');else await route.fulfill({status:200,contentType:'text/html',body:'<html>SYNTHETIC_PRIVATE</html>'});}else await route.continue();});
   await choose();await expect(page.getByText(copy[mode],{exact:true})).toBeVisible();await expect(page.getByText(copy.uncertain,{exact:true})).toBeVisible();
   expect((await db.query('SELECT priority FROM ProjectRequest WHERE id=?',[id]))[0].priority).toBe('normal');expect(writes).toBe(1);expect(await page.locator('[data-sonner-toast][data-type="success"]').count()).toBe(0);
   await page.getByRole('alert').filter({hasText:copy[mode]}).getByRole('button',{name:copy.reload,exact:true}).click();await expect(page.getByText(copy[mode],{exact:true})).toHaveCount(0);expect(writes).toBe(1);await page.unroute('**/api/admin/requests/'+id);
  }
  const draft=page.getByRole('tabpanel').getByRole('textbox');await draft.fill('Synthetic unsent text retained through local errors');
  await page.evaluate(()=>window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new DOMException('Stopped','AbortError'),cancelable:true})));await expect(page.getByText(copy.local,{exact:false})).toHaveCount(0);
  const logs:string[]=[];page.on('console',msg=>logs.push(msg.text()));
  await page.evaluate(()=>{for(let i=0;i<2;i++)window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('SYNTHETIC_PRIVATE'),cancelable:true}));});
  await expect(page.getByText(copy.local,{exact:false})).toHaveCount(1);await expect(draft).toHaveValue('Synthetic unsent text retained through local errors');expect(logs.join('')).not.toContain('SYNTHETIC_PRIVATE');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }finally{await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);await db.query('DELETE FROM ProjectRequest WHERE id=?',[id]);await db.destroy();}
});
