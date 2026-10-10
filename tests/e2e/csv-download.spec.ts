import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {getPortalContent} from '../../apps/web/src/content/portal';
for(const locale of ['ar','en'] as const)for(const kind of ['requests','inquiries'] as const)test(`${locale}: ${kind} CSV reports only verified download readiness`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 await page.goto(`/${locale}/admin/${kind}`,{waitUntil:'networkidle'});
 const t=getPortalContent(locale).admin[kind];
 const button=page.getByRole('button',{name:t.export,exact:true});
 const download=page.waitForEvent('download');await button.click();
 expect((await download).suggestedFilename()).toBe(`so7ob-${kind}.csv`);
 await expect(page.getByText(t.exportOk,{exact:true})).toBeVisible();
 // Let the first notification exit normally before testing failure feedback.
 await expect(page.getByText(t.exportOk,{exact:true})).toHaveCount(0,{timeout:15000});
 await page.route(`**/api/admin/${kind}/export*`,route=>route.fulfill({status:403,contentType:'application/json',body:'{"code":"forbidden"}'}));
 const unexpected:string[]=[];page.on('download',d=>unexpected.push(d.suggestedFilename()));
 await button.click();await expect(page.getByText(t.exportFailed,{exact:true})).toBeVisible();
 expect(unexpected).toEqual([]);await expect(page.getByText(t.exportOk,{exact:true})).toHaveCount(0);
});
