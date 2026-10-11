import {afterEach,it,expect,vi} from 'vitest';
import {requestJson,ApiError} from './transport';
import {apiFetch} from '@/components/account/api';
import {apiSend} from '@/components/admin/helpers';
afterEach(()=>vi.unstubAllGlobals());
for(const [status,category] of [[401,'authentication'],[403,'authorization'],[409,'conflict'],[429,'rate_limit'],[500,'internal']] as const)it(`preserves HTTP ${status}, trace and retry information`,async()=>{
 const id='e14cb2f9-4851-49af-902e-4779d87622c4';vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:false,code:status===500?'internal_error':'invalid'}),{status,headers:{'X-Request-Id':id,'X-Error-Id':id,'Retry-After':'12'}})));
 await expect(requestJson('/api/test')).rejects.toMatchObject({status,category,requestId:id,errorId:id,retryAfterSec:12});
});
it('neither adapter accepts non-JSON success; write is uncertain and attempted once',async()=>{
 const fetch=vi.fn(async()=>new Response('<html>SYNTHETIC_SECRET</html>',{status:200}));vi.stubGlobal('fetch',fetch);
 await expect(apiSend('/api/test','PATCH',{priority:'high'})).rejects.toMatchObject({code:'invalid_response',status:200,uncertain:true});expect(fetch).toHaveBeenCalledTimes(1);
 const result=await apiFetch('/api/test');expect(result.ok).toBe(false);expect(result.error?.code).toBe('invalid_response');expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
});
it('retains false, zero, empty and null in the outgoing PATCH',async()=>{const fetch=vi.fn(async(_url:string,_init:RequestInit)=>new Response('{"ok":true}',{status:200}));vi.stubGlobal('fetch',fetch);const body={a:false,b:0,c:'',assigneeId:null};await apiSend('/api/test','PATCH',body);expect(fetch.mock.calls[0][1]?.body).toBe(JSON.stringify(body));});
it('rejects empty or false success envelopes',async()=>{for(const data of ['{}','null','[]','{"ok":false,"code":"invalid"}']){vi.stubGlobal('fetch',vi.fn(async()=>new Response(data,{status:200})));await expect(apiSend('/api/test','POST',{})).rejects.toBeInstanceOf(ApiError);}});
it('distinguishes network, deadline and deliberate cancellation without retry',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('SYNTHETIC_SECRET');}));await expect(requestJson('/api/test',{method:'POST'})).rejects.toMatchObject({code:'network',uncertain:true,localId:expect.stringMatching(/^local-/)});
 vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>{if(init.signal?.aborted)reject(new DOMException('Aborted','AbortError'));init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));} )));
 await expect(requestJson('/api/test',{}, {timeoutMs:5})).rejects.toMatchObject({code:'timeout'});
 const controller=new AbortController();controller.abort();await expect(requestJson('/api/test',{signal:controller.signal})).rejects.toMatchObject({code:'cancelled'});
});

it('keeps the server trace on logout failure and never claims a redirect succeeded',async()=>{
 const {signOut}=await import('@/routing/auth');const id='e14cb2f9-4851-49af-902e-4779d87622c4';const fetch=vi.fn().mockResolvedValueOnce(new Response('{"csrfToken":"synthetic"}')).mockResolvedValueOnce(new Response('{"ok":false,"code":"internal_error"}',{status:500,headers:{'X-Error-Id':id}}));vi.stubGlobal('fetch',fetch);
 await expect(signOut({redirect:false,callbackUrl:'/'})).rejects.toMatchObject({status:500,errorId:id,uncertain:true});expect(fetch).toHaveBeenCalledTimes(2);
});
