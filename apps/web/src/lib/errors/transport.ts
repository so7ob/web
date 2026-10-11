import {errorCategory,TRACE_ID,type ErrorCategory} from '@so7ob/contracts';
export function localReference(){return 'local-'+(globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2));}
export class ApiError extends Error {
 readonly category:ErrorCategory;readonly requestId?:string;readonly errorId?:string;readonly localId?:string;
 readonly retryAfterSec?:number;readonly uncertain:boolean;
 constructor(readonly status:number,readonly code:string,readonly body:Record<string,unknown>|null=null,headers?:Headers,write=false){
  super(code);this.name='ApiError';this.category=errorCategory(status,code);
  const id=(key:string,header:string)=>{const value=headers?.get(header)??body?.[key];return typeof value==='string'&&TRACE_ID.test(value)?value:undefined;};
  this.requestId=id('requestId','x-request-id');this.errorId=id('errorId','x-error-id');
  if(!this.requestId&&!this.errorId)this.localId=localReference();
  const retry=headers?.get('retry-after');const seconds=retry===null||retry===undefined?Number(body?.retryAfterSec):/^\d+$/.test(retry)?Number(retry):Math.ceil((Date.parse(retry)-Date.now())/1000);
  if(Number.isFinite(seconds)&&seconds>=0)this.retryAfterSec=seconds;
  this.uncertain=write&&(['network','timeout','invalid_response'].includes(code)||status>=500);
 }
}
export function asApiError(error:unknown):ApiError {return error instanceof ApiError?error:new ApiError(0,error instanceof Error&&error.name==='AbortError'?'cancelled':'internal_error');}
/** One attempt only. A transport failure after a write may mean the write was committed. */
export async function requestJson<T>(url:string,init:RequestInit={},options:{requireOk?:boolean;timeoutMs?:number}={}):Promise<{data:T;status:number}> {
 const controller=new AbortController(),write=!['GET','HEAD'].includes(init.method??'GET');let timedOut=false;
 const cancel=()=>controller.abort();if(init.signal?.aborted)cancel();else init.signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},options.timeoutMs??30000);
 try{
  const res=await fetch(url,{...init,signal:controller.signal});let data:unknown;
  try{data=await res.json();}catch(error){if(controller.signal.aborted)throw error;throw new ApiError(res.status,'invalid_response',null,res.headers,write);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError(res.status,'invalid_response',null,res.headers,write);
  const body=data as Record<string,unknown>;
  if(!res.ok||body.ok===false){const code=typeof body.code==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(body.code)?body.code:res.status===401?'unauthorized':res.status===403?'forbidden':res.status===409?'conflict':res.status===429?'rate_limited':res.status===404?'not_found':res.status>=500?'internal_error':'invalid';throw new ApiError(res.status,code,body,res.headers,write);}
  if(options.requireOk&&body.ok!==true)throw new ApiError(res.status,'invalid_response',null,res.headers,write);
  return {data:body as T,status:res.status};
 }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(0,timedOut?'timeout':init.signal?.aborted?'cancelled':'network',null,undefined,write);}
 finally{clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
}
