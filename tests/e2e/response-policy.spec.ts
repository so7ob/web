import{expect}from'@playwright/test';import{test}from'./quota-fixture';import{readFileSync}from'node:fs';import{getPortalContent}from'../../apps/web/src/content/portal';import AxeBuilder from'@axe-core/playwright';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en']as const)test(`${locale}: response policy requires explicit existing-request acknowledgement`,async({page})=>{
 const{prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),t=getPortalContent(locale);
 const{csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken};const original=(await(await page.request.get('/api/admin/settings')).json()).settings['response.hours']??'24';
 try{
  await page.goto(`/${locale}/admin/settings`,{waitUntil:'networkidle'});await page.locator('#response-hours').fill(original==='2'?'3':'2');
  const save=page.getByRole('button',{name:t.admin.settings.save,exact:true});await expect(save).toBeDisabled();
  await page.getByRole('checkbox',{name:locale==='ar'?'أوافق على تطبيق المهلة الجديدة على الطلبات الحالية':'Apply the new window to existing requests'}).check();
  const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/settings/checked'));await save.click();expect((await saved).status()).toBe(200);
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('#response-hours')).toHaveValue(original==='2'?'3':'2');
  await expect(page.locator('time')).toBeVisible();expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }finally{await page.request.patch('/api/admin/settings',{headers,data:{'response.hours':original,'response.applyToExisting':true}});}
});
