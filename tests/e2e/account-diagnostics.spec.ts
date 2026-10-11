import {test} from './quota-fixture';
import {expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {getPortalContent} from '../../apps/web/src/content/portal';
import {errorCopy} from '../../apps/web/src/lib/errors/messages';
import AxeBuilder from '@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: account server failures are not missing resources and profile fields survive`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'owner@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const id=randomUUID(),t=getPortalContent(locale),failure={status:500,contentType:'application/json',headers:{'x-error-id':id},body:'{"ok":false,"code":"internal_error"}'};
 await page.route('**/api/account/inquiries/synthetic-diagnostics',route=>route.fulfill(failure));
 await page.goto(`/${locale}/account/inquiries/synthetic-diagnostics`,{waitUntil:'networkidle'});
 await expect(page.getByText(errorCopy[locale].internal,{exact:true})).toBeVisible();await expect(page.getByText(t.account.inquiries.notFound,{exact:true})).toHaveCount(0);
 await page.goto(`/${locale}/account/profile`,{waitUntil:'networkidle'});const name=page.locator('#profile-name');await name.fill('Synthetic unsaved profile');
 await page.route('**/api/account/profile',route=>route.request().method()==='PATCH'?route.fulfill(failure):route.continue());await page.locator('form button[type=submit]').click();
 await expect(page.getByText(errorCopy[locale].internal,{exact:true})).toBeVisible();await expect(page.getByText(id,{exact:false})).toBeVisible();await expect(name).toHaveValue('Synthetic unsaved profile');
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
});
