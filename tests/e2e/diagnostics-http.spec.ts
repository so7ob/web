import {test} from './quota-fixture';
import {expect,type APIRequestContext} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
async function login(request:APIRequestContext,role:string){const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await request.get('/api/auth/csrf')).json();expect((await request.post('/api/auth/callback/credentials',{form:{email:prefix+role+'@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);return {'x-csrf-token':csrfToken};}
test('compiled HTTP correlates validation/parser/guards and restricts diagnostics, export and review',async({request,playwright,baseURL})=>{
 const db=await createDataSource().initialize();const recorded:string[]=[];
 const client=await playwright.request.newContext({baseURL,ignoreHTTPSErrors:true});
 try{
  expect((await request.get('/api/admin/diagnostics')).status()).toBe(401);
  const clientHeaders=await login(client,'owner');
  for(const api of ['/api/admin','/api/v1/admin']){expect((await client.get(api+'/diagnostics')).status()).toBe(403);expect((await client.get(api+'/diagnostics/export')).status()).toBe(403);expect((await client.patch(api+'/diagnostics/'+'a'.repeat(64),{headers:clientHeaders,data:{state:'resolved'}})).status()).toBe(403);}
  const headers=await login(request,'admin');
  for(const data of ['{',JSON.stringify({priority:false}),JSON.stringify({priority:'high',status:'closed'})]){
   const res=await request.patch('/api/admin/requests/synthetic-missing?token=SYNTHETIC_SECRET',{headers:{...headers,'content-type':'application/json','x-request-id':'SYNTHETIC_SECRET'},data});const body=await res.json();expect(res.status()).toBe(400);
   expect(body.requestId).toBe(res.headers()['x-request-id']);expect(body.errorId).toBe(res.headers()['x-error-id']);recorded.push(body.errorId);
   await expect.poll(async()=>Number((await db.query('SELECT COUNT(*) n FROM DiagnosticEvent WHERE errorId=?',[body.errorId]))[0].n)).toBe(1);
   const [row]=await db.query('SELECT payload FROM DiagnosticEvent WHERE errorId=?',[body.errorId]);const log=JSON.parse(row.payload);expect(log.requestId).toBe(body.requestId);expect(log.code).toBe(body.code);expect(row.payload).not.toContain('SYNTHETIC_SECRET');expect(row.payload).not.toContain('synthetic-missing');
   const listed=await(await request.get('/api/admin/diagnostics?q='+body.requestId)).json();expect(listed.total).toBe(1);expect(listed.rows[0].event.errorId).toBe(body.errorId);
   expect((await request.patch('/api/admin/diagnostics/'+log.fingerprint,{data:{state:'resolved'}})).status()).toBe(403);
   expect((await request.patch('/api/admin/diagnostics/'+log.fingerprint,{headers,data:{state:'resolved'}})).status()).toBe(200);
   const exported=await(await request.get('/api/v1/admin/diagnostics/export?q='+body.errorId)).json();expect(exported.exportScope).toBe('current_page');expect(exported.rows[0].state).toBe('resolved');expect(JSON.stringify(exported)).not.toContain('SYNTHETIC_SECRET');
  }
  expect((await request.get('/api/admin/diagnostics?page=0')).status()).toBe(400);
 }finally{for(const id of recorded){const [event]=await db.query('SELECT fingerprint FROM DiagnosticEvent WHERE errorId=?',[id]);if(event){await db.query('DELETE FROM AuditLog WHERE entityType=? AND entityId=?',['diagnostic',event.fingerprint]);await db.query('DELETE FROM DiagnosticReview WHERE fingerprint=?',[event.fingerprint]);}await db.query('DELETE FROM DiagnosticEvent WHERE errorId=?',[id]);}await client.dispose();await db.destroy();}
});
