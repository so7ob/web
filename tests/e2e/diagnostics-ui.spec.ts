import {test} from './quota-fixture';
import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {createDataSource,DiagnosticStore,diagnosticEvent} from '@so7ob/server';
import {diagnosticsCopy} from '../../apps/web/src/content/diagnostics';
import {errorCopy} from '../../apps/web/src/lib/errors/messages';
import AxeBuilder from '@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: diagnostic console filters, reviews, copies and exports only a safe page`,async({page,context})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const db=await createDataSource().initialize(),store=new DiagnosticStore(db),code='diag'+randomBytes(4).toString('hex'),ids:string[]=[],prints:string[]=[];const t=diagnosticsCopy[locale];
 try{
  for(let i=0;i<22;i++){const e=diagnosticEvent({operation:code+'.'+i,code:'internal_error',requestId:randomUUID()},new Error('SYNTHETIC_PRIVATE'));ids.push(e.errorId);prints.push(e.fingerprint);await store.write(e);}
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto(`/${locale}/admin/diagnostics`,{waitUntil:'networkidle'});await expect(page.getByRole('heading',{name:t.title,exact:true,level:1})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  const search=page.getByLabel(t.q,{exact:true});await search.fill(ids[0]);await search.press('Enter');await expect(page.locator('article')).toHaveCount(1);
  await page.getByText(t.details,{exact:true}).click();await expect(page.getByText(ids[0],{exact:false}).last()).toBeVisible();expect(await page.locator('main').innerText()).not.toContain('SYNTHETIC_PRIVATE');
  await page.getByRole('button',{name:t.copy,exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain(ids[0]);
  const classified=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/diagnostics/'));await page.getByRole('button',{name:t.resolved,exact:true}).click();expect((await classified).status()).toBe(200);await expect(page.getByRole('button',{name:t.resolved,exact:true})).toBeDisabled();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:t.export,exact:true}).click();const file=await download;const payload=JSON.parse(readFileSync((await file.path())!,'utf8'));expect(payload.exportScope).toBe('current_page');expect(payload.rows).toHaveLength(1);expect(payload.rows[0].event.errorId).toBe(ids[0]);expect(JSON.stringify(payload)).not.toContain('SYNTHETIC_PRIVATE');
  await search.fill('invalid');await search.press('Enter');await expect(search).toHaveAttribute('aria-invalid','true');await expect(page.locator('#diagnostic-error-q')).toBeVisible();await expect(search).toHaveValue('invalid');
  await search.fill('');await search.press('Enter');await expect(page.getByRole('button',{name:t.next,exact:true})).toBeEnabled();await page.getByRole('button',{name:t.next,exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('navigation',{name:t.page,exact:true})).toContainText('2');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }finally{for(const id of ids)await db.query('DELETE FROM DiagnosticEvent WHERE errorId=?',[id]);for(const id of prints){await db.query('DELETE FROM DiagnosticReview WHERE fingerprint=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityType=? AND entityId=?',['diagnostic',id]);}await db.destroy();}
});
for(const locale of ['ar','en'] as const)test(`${locale}: login internal errors retain credentials and display a safe server reference`,async({page})=>{
 const t=errorCopy[locale],id=randomUUID();await page.goto(`/${locale}/auth/login`,{waitUntil:'networkidle'});
 await page.locator('input[type=email]').fill('synthetic@example.invalid');await page.locator('input[type=password]').fill('Synthetic123!');
 await page.route('**/api/auth/callback/credentials',r=>r.fulfill({status:500,contentType:'application/json',headers:{'x-request-id':id,'x-error-id':id},body:JSON.stringify({ok:false,code:'internal_error',message:'SYNTHETIC_PRIVATE'})}));
 await page.locator('button[type=submit]').click();await expect(page.getByText(t.internal,{exact:true})).toBeVisible();await expect(page.getByText(id,{exact:false})).toBeVisible();await expect(page.locator('input[type=password]')).toHaveValue('Synthetic123!');expect(await page.locator('main').innerText()).not.toContain('SYNTHETIC_PRIVATE');
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
