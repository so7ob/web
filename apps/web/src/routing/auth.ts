import {requestJson,ApiError} from '@/lib/errors/transport';
// Wire-compatible credentials client; the browser never receives the opaque session token.
export async function signIn(provider: 'credentials', options: { email: string; password: string; redirect?: boolean; callbackUrl?: string }) {
  if (provider !== 'credentials') throw new Error('Unsupported provider');
  try{
    const {data:csrf}=await requestJson<{csrfToken:string}>('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'});
    const result=await requestJson<{url:string}>('/api/auth/callback/credentials',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:options.email,password:options.password,csrfToken:csrf.csrfToken,callbackUrl:options.callbackUrl??window.location.href,json:'true'})});
    if(typeof result.data.url!=='string')throw new ApiError(result.status,'invalid_response');
    if(options.redirect!==false)window.location.assign(result.data.url);
    return {ok:true,status:result.status,error:undefined,url:result.data.url};
  }catch(error){
    if(error instanceof ApiError&&[401,429].includes(error.status))return {ok:false,status:error.status,error:error.status===429?'rateLimited':'CredentialsSignin',url:null};
    throw error;
  }
}
export async function signOut(options: { callbackUrl?: string; redirect?: boolean } = {}) {
  const {data:csrf}=await requestJson<{csrfToken:string}>('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'});
  const result=await requestJson<{url:string}>('/api/auth/signout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,callbackUrl:options.callbackUrl??window.location.href,json:'true'})});
  if(typeof result.data.url!=='string')throw new ApiError(result.status,'invalid_response');
  if(options.redirect!==false)window.location.assign(result.data.url);return result.data;
}
