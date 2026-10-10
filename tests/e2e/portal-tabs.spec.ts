import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import{readFileSync}from'node:fs';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: portal tabs own their visible panel and support keyboard navigation`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'owner@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 for(const route of ['requests','inquiries']){
  await page.goto(`/${locale}/account/${route}`,{waitUntil:'networkidle'});
  const tabs=page.getByRole('tab');await tabs.first().focus();
  await page.keyboard.press(locale==='ar'?'ArrowLeft':'ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();await expect(tabs.nth(1)).toHaveAttribute('aria-selected','true');
  const active=page.getByRole('tab',{selected:true});const panel=page.getByRole('tabpanel');
  await expect(panel).toBeVisible();expect(await active.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
  expect(await panel.getAttribute('aria-labelledby')).toBe(await active.getAttribute('id'));
  await page.keyboard.press('Home');await expect(tabs.first()).toBeFocused();await expect(tabs.first()).toHaveAttribute('aria-selected','true');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 }
});
