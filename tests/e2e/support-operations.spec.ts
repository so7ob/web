import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
async function login(api:APIRequestContext,email:string,password:string){
 const {csrfToken}=await (await api.get('/api/auth/csrf')).json();
 expect((await api.post('/api/auth/callback/credentials',{form:{email,password,csrfToken,json:'true'}})).status()).toBe(200);
 return {'x-csrf-token':csrfToken};
}
for(const locale of ['ar','en'] as const)test(`${locale}: operations assigns, support replies privately and publicly, client sees only public messages`,async({page,playwright,baseURL},info)=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const id=prefix+'-roles-'+locale+'-'+info.project.name,t=getPortalContent(locale),db=await createDataSource().initialize();
 const ops=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true}),client=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true});
 try{
  await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,status) VALUES(?,?,'quote','web','Synthetic role journey','role-fixture','unspecified','flexible','Synthetic owner',?,'email',?,?,'awaiting_info')",[id,id,prefix+'owner@example.invalid',locale,prefix+'owner']);
  const opsHeaders=await login(ops,prefix+'ops@example.invalid',password),supportHeaders=await login(page.request,prefix+'support@example.invalid',password);
  await login(client,prefix+'owner@example.invalid',password);
  expect((await ops.patch('/api/v1/admin/requests/'+id,{headers:opsHeaders,data:{assigneeId:prefix+'support'}})).status()).toBe(200);
  expect((await page.request.patch('/api/admin/requests/'+id,{headers:supportHeaders,data:{assigneeId:prefix+'ops'}})).status()).toBe(403);
  expect((await db.query('SELECT assigneeId FROM ProjectRequest WHERE id=?',[id]))[0].assigneeId).toBe(prefix+'support');
  await page.goto(`/${locale}/admin/requests/${id}`,{waitUntil:'networkidle'});
  const publicBody='Public support reply '+id,privateBody='Internal support note '+id;
  for(const [label,body] of [[t.admin.requests.reply,publicBody],[t.admin.requests.internalNote,privateBody]]){
   await page.getByRole('tab',{name:label,exact:true}).click();
   await page.getByRole('textbox',{name:label,exact:true}).fill(body);
   const sent=page.waitForResponse(r=>r.url().includes('/messages')&&r.request().method()==='POST');
   await page.getByRole('textbox',{name:label,exact:true}).press('Control+Enter');
   expect((await sent).status()).toBe(201); // Source account message creation returns 201.
   await expect(page.getByText(body,{exact:true})).toBeVisible();
  }
  await page.reload({waitUntil:'networkidle'});
  await expect(page.getByText(privateBody,{exact:true})).toBeVisible();
  const owner=await client.get('/api/account/requests/'+id);expect(owner.status()).toBe(200);
  const projection=JSON.stringify(await owner.json());expect(projection).toContain(publicBody);expect(projection).not.toContain(privateBody);
  const messages=await db.query('SELECT body,kind,authorId FROM RequestMessage WHERE requestId=?',[id]);
  expect(messages).toEqual(expect.arrayContaining([{body:publicBody,kind:'message',authorId:prefix+'support'},{body:privateBody,kind:'internal_note',authorId:prefix+'support'}]));
  expect((await page.request.post('/api/admin/requests/bulk',{headers:supportHeaders,data:{ids:[id],action:'archive'}})).status()).toBe(403);
  expect((await ops.post('/api/v1/admin/requests/bulk',{headers:opsHeaders,data:{ids:[id],action:'archive'}})).status()).toBe(200);
  expect((await db.query('SELECT archivedAt FROM ProjectRequest WHERE id=?',[id]))[0].archivedAt).not.toBeNull();
 }finally{await ops.dispose();await client.dispose();await db.destroy();}
});
