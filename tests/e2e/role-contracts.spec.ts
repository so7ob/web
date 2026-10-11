import {expect} from '@playwright/test';
import {test} from './quota-fixture';
import {readFileSync} from 'node:fs';
import {SYSTEM_ROLES,TRACE_ID} from '@so7ob/contracts';
const reads:Record<string,string>={dashboard:'admin.dashboard',search:'admin.dashboard',users:'users.view',requests:'requests.view.all',inquiries:'inquiries.view.all',pages:'pages.view',templates:'pages.view',media:'media.manage',menus:'menus.manage',settings:'settings.manage',audit:'audit.view',outbox:'email.outbox','saved-replies':'requests.view.all','requests/export':'requests.export','inquiries/export':'inquiries.export'};
for(const [suffix,role] of [['admin','super_admin'],['ops','ops_manager'],['support','support'],['editor','content_editor'],['owner','client']])test(`${role}: every administrative read preserves permission and v1 response contract`,async({request})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await request.get('/api/auth/csrf')).json();
 expect((await request.post('/api/auth/callback/credentials',{form:{email:prefix+suffix+'@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const permissions=SYSTEM_ROLES.find(r=>r.key===role)!.permissions;
 for(const [path,permission] of Object.entries(reads)){
  const allowed=permissions.includes(permission as typeof permissions[number]);
  const legacy=await request.get('/api/admin/'+path),versioned=await request.get('/api/v1/admin/'+path);
  expect(legacy.status(),role+' '+path).toBe(allowed?200:403);expect(versioned.status(),role+' v1 '+path).toBe(legacy.status());
  if(!allowed){
   const first=await legacy.json(),second=await versioned.json();
   for(const [response,body] of [[legacy,first],[versioned,second]] as const){expect(body).toEqual({ok:false,code:'forbidden',category:'authorization',messageKey:'errors.authorization',requestId:expect.stringMatching(TRACE_ID),errorId:expect.stringMatching(TRACE_ID)});expect(body.requestId).toBe(response.headers()['x-request-id']);expect(body.errorId).toBe(response.headers()['x-error-id']);}
   expect(first.requestId).not.toBe(second.requestId);expect(first.errorId).not.toBe(second.errorId);continue;
  }
  if(!path.endsWith('/export'))expect(await versioned.json(),role+' '+path).toEqual(await legacy.json());
  else expect(await versioned.text()).toBe(await legacy.text());
 }
});
test('all inventoried protected handlers reject unauthenticated legacy and v1 requests',async({request})=>{
 const inventory=JSON.parse(readFileSync('tests/fixtures/api-inventory.json','utf8')) as Array<{method:string;path:string}>;
 for(const row of inventory.filter(r=>/^\/api\/(admin|account)\//.test(r.path)&&!r.path.endsWith('/claim-verify'))){
  for(const prefix of ['/api/','/api/v1/']){
   const path=row.path.replace('/api/',prefix).replace(/\[[^\]]+\]/g,'missing-synthetic-id');
   const response=await request.fetch(path,{method:row.method,...(row.method==='GET'?{}:{data:{}})});
   expect(response.status(),row.method+' '+path).toBe(401);
   expect(await response.json()).toMatchObject({ok:false,code:'unauthorized'});
  }
 }
});
