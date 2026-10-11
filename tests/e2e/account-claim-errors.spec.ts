import {test} from './quota-fixture';
import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getPortalContent} from '../../apps/web/src/content/portal';
import {errorCopy} from '../../apps/web/src/lib/errors/messages';
import AxeBuilder from '@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: claim feedback requires confirmed acceptance and retains the reference on failure`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'owner@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const t=getPortalContent(locale).account.requests,id=randomUUID();await page.goto(`/${locale}/account/requests?claim=open`,{waitUntil:'networkidle'});const dialog=page.getByRole('dialog'),input=dialog.locator('#claim-ref'),send=dialog.getByRole('button',{name:t.claimButton,exact:true});await input.fill('TEST-SYNTHETIC');
 for(const [status,category] of [[401,'authentication'],[403,'authorization'],[429,'rate_limit'],[500,'internal'],[0,'network'],[200,'invalid_response']] as const){let count=0;await page.route('**/api/account/requests/claim',route=>{count++;return status===0?route.abort('failed'):route.fulfill({status,contentType:status===200?'text/html':'application/json',headers:{'x-error-id':id},body:status===200?'<p>SYNTHETIC_SECRET</p>':JSON.stringify({ok:false,code:status===500?'internal_error':'invalid'})});});await send.click();await expect(input).toHaveValue('TEST-SYNTHETIC');await expect(dialog.getByText(errorCopy[locale][category],{exact:true})).toBeVisible();await expect(dialog.getByText(t.claimSent,{exact:true})).toHaveCount(0);expect(count).toBe(1);expect(await dialog.innerText()).not.toContain('SYNTHETIC_SECRET');await page.unroute('**/api/account/requests/claim');}
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 await page.route('**/api/account/requests/claim',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));await send.focus();await page.keyboard.press('Enter');await expect(dialog.getByText(t.claimSent,{exact:true})).toBeVisible();
});
