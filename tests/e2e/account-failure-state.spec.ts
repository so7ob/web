import {test} from './quota-fixture';
import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
import {errorCopy} from '../../apps/web/src/lib/errors/messages';
import AxeBuilder from '@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
async function login(page:Page){const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'owner@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);return prefix;}
for(const locale of ['ar','en'] as const){
 test(`${locale}: cancellation retains its note and dialog until confirmed`,async({page})=>{
  const prefix=await login(page),db=await createDataSource().initialize(),id=prefix+'cancel'+randomBytes(4).toString('hex'),t=getPortalContent(locale).account.requests,endpoint='/api/account/requests/'+id;
  try{
   await db.query("INSERT INTO ProjectRequest(id,refCode,clientId,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,?,'quote','web','Synthetic cancellation','synthetic','unspecified','flexible','Synthetic',?,'email',?)",[id,'TEST-'+id.slice(-6),prefix+'owner',prefix+'owner@example.invalid',locale]);
   await page.goto(`/${locale}/account/requests/${id}`,{waitUntil:'networkidle'});await page.getByRole('button',{name:t.cancelEdit+' · '+t.statuses.new,exact:true}).click();
   const dialog=page.getByRole('dialog'),note=dialog.getByRole('textbox'),send=dialog.getByRole('button',{name:t.cancelEdit+' · '+t.statuses.cancelled,exact:true});await note.fill('Synthetic cancellation note');
   for(const status of [403,500,0]){let calls=0;await page.route('**'+endpoint,async route=>{if(route.request().method()!=='PATCH')return route.continue();calls++;if(!status)return route.abort('failed');return route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:false,code:status===403?'forbidden':'internal_error'})});});
    await send.click();await expect(dialog).toBeVisible();await expect(note).toHaveValue('Synthetic cancellation note');await expect(dialog.getByText(errorCopy[locale][status===403?'authorization':status===500?'internal':'network'],{exact:true})).toBeVisible();expect(calls).toBe(1);expect((await db.query('SELECT status FROM ProjectRequest WHERE id=?',[id]))[0].status).toBe('new');await page.unroute('**'+endpoint);
    if(status===500){await expect(send).toBeDisabled();await dialog.getByRole('button',{name:errorCopy[locale].reload,exact:true}).click();await expect(send).toBeEnabled();await expect(note).toHaveValue('Synthetic cancellation note');}
   }
   await expect(send).toBeDisabled();await dialog.getByRole('button',{name:errorCopy[locale].reload,exact:true}).click();await expect(send).toBeEnabled();
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
   const response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(endpoint));await send.focus();await page.keyboard.press('Enter');expect((await response).status()).toBe(200);await expect(dialog).toHaveCount(0);expect((await db.query('SELECT status FROM ProjectRequest WHERE id=?',[id]))[0].status).toBe('cancelled');
  }finally{await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);await db.query('DELETE FROM ProjectRequest WHERE id=?',[id]);await db.destroy();}
 });
 test(`${locale}: failed notification writes do not change unread state or navigate`,async({page})=>{
  const prefix=await login(page),db=await createDataSource().initialize(),id=prefix+'notice'+randomBytes(4).toString('hex'),t=getPortalContent(locale).account.notifications;
  try{
   await db.query("INSERT INTO Notification(id,userId,type,payload,link) VALUES(?,?,'account',?,?)",[id,prefix+'owner',JSON.stringify({ref:id}),`/${locale}/account/profile`]);await page.goto(`/${locale}/account/notifications`,{waitUntil:'networkidle'});
   const row=page.locator('li').filter({has:page.getByText(id,{exact:true})}),button=row.getByRole('button');let calls=0;
   await page.route('**/api/account/notifications',route=>{if(route.request().method()!=='POST')return route.continue();calls++;return route.abort('failed');});
   await button.click();await expect(page).toHaveURL(new RegExp('/'+locale+'/account/notifications$'));await expect(page.getByText(errorCopy[locale].network,{exact:true})).toBeVisible();await expect(row).toContainText(t.markRead);expect((await db.query('SELECT readAt FROM Notification WHERE id=?',[id]))[0].readAt).toBeNull();expect(calls).toBe(1);
   await page.unroute('**/api/account/notifications');await expect(button).toBeDisabled();await page.getByRole('button',{name:errorCopy[locale].reload,exact:true}).click();await expect(button).toBeEnabled();
   await page.route('**/api/account/notifications',route=>route.fulfill({status:403,contentType:'application/json',body:'{"ok":false,"code":"forbidden"}'}));await page.getByRole('button',{name:t.markAllRead,exact:true}).click();await expect(page.getByText(errorCopy[locale].authorization,{exact:true})).toBeVisible();await expect(row).toContainText(t.markRead);expect((await db.query('SELECT readAt FROM Notification WHERE id=?',[id]))[0].readAt).toBeNull();await page.unroute('**/api/account/notifications');
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});calls=0;await page.route('**/api/account/notifications',async route=>{calls++;await gate;await route.continue();});
   await button.click();await expect(button).toBeDisabled();await expect.poll(()=>calls).toBe(1);release();await expect(page).toHaveURL(new RegExp('/'+locale+'/account/profile$'));expect((await db.query('SELECT readAt FROM Notification WHERE id=?',[id]))[0].readAt).not.toBeNull();
  }finally{await db.query('DELETE FROM Notification WHERE id=?',[id]);await db.destroy();}
 });
}
