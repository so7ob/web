import {expect} from '@playwright/test';
import {test} from './quota-fixture';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
for(const locale of ['ar','en'])test(`${locale}: legacy auth entry links, native form redirects and explicit logout confirmation`,async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 for(const base of ['/api/auth','/api/v1/auth']){
  for(const [error,status] of [['Configuration',500],['AccessDenied',403],['Verification',403],['unknown',200]] as const){const response=await page.request.get(base+'/error?error='+error+'&locale='+locale);expect(response.status()).toBe(status);expect(await response.text()).toContain('<h1>');}
  await page.goto(base+'/verify-request?locale='+locale);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  const providers=await(await page.request.get(base+'/providers')).json();
  expect((await page.request.get(new URL(providers.credentials.signinUrl).pathname,{maxRedirects:0})).status()).toBe(302);
  await page.goto(base+'/signin/credentials?callbackUrl='+encodeURIComponent('/'+locale+'/account')+'&locale='+locale);
  await expect(page).toHaveURL(new RegExp('/'+locale+'/auth/login\\?next='));
  const {csrfToken}=await(await page.request.get(base+'/csrf')).json();
  const login=await page.request.post(base+'/callback/credentials',{form:{email:prefix+'owner@example.invalid',password,csrfToken,callbackUrl:'/'+locale+'/account'},maxRedirects:0});
  expect(login.status()).toBe(302);expect(new URL(login.headers().location).pathname).toBe('/'+locale+'/account');
  await page.goto(base+'/signout?locale='+locale+'&callbackUrl='+encodeURIComponent('/'+locale));
  expect((await(await page.request.get(base+'/session')).json()).user.id).toBe(prefix+'owner');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:locale==='ar'?'تسجيل الخروج':'Sign out',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url=>url.pathname==='/'+locale);
  expect(await(await page.request.get(base+'/session')).json()).toEqual({});
  const deniedCsrf=(await(await page.request.get(base+'/csrf')).json()).csrfToken;
  const invalid={email:prefix+'owner@example.invalid',password:'Incorrect-Synthetic-4929',csrfToken:deniedCsrf};
  const failedForm=await page.request.post(base+'/callback/credentials',{form:invalid,maxRedirects:0});
  expect(failedForm.status()).toBe(302);expect(new URL(failedForm.headers().location).pathname).toBe('/api/auth/error');
  const failedJson=await page.request.post(base+'/callback/credentials',{form:{...invalid,json:'true'},maxRedirects:0});
  expect(failedJson.status()).toBe(401);expect((await failedJson.json()).url).toContain('CredentialsSignin');
  const external=await page.request.get(base+'/signin?callbackUrl='+encodeURIComponent('https://example.invalid/steal'),{maxRedirects:0});
  expect(external.headers().location).toBe('/ar/auth/login?next=%2Far%2Faccount');
  expect((await page.request.post(base+'/signout',{form:{csrfToken:'0'.repeat(64),callbackUrl:'https://example.invalid'},maxRedirects:0})).status()).toBe(403);
 }
});
