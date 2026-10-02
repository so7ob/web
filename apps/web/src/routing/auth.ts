// Wire-compatible credentials client; the browser never receives the opaque session token.
export async function signIn(provider: 'credentials', options: { email: string; password: string; redirect?: boolean; callbackUrl?: string }) {
  if (provider !== 'credentials') throw new Error('Unsupported provider');
  const csrf=await (await fetch('/api/auth/csrf',{ credentials:'same-origin',cache:'no-store' })).json();
  const result=await fetch('/api/auth/callback/credentials',{ method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ email:options.email,password:options.password,csrfToken:csrf.csrfToken,callbackUrl:options.callbackUrl ?? window.location.href,json:'true' }) });
  const data=await result.json(); const error=result.ok ? undefined : result.status===429 ? 'rateLimited' : 'CredentialsSignin';
  if (result.ok && options.redirect!==false) window.location.assign(data.url);
  return { ok:result.ok,status:result.status,error,url:data.url ?? null };
}
export async function signOut(options: { callbackUrl?: string; redirect?: boolean } = {}) {
  const csrf=await (await fetch('/api/auth/csrf',{ credentials:'same-origin',cache:'no-store' })).json();
  const response=await fetch('/api/auth/signout',{ method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ csrfToken:csrf.csrfToken,callbackUrl:options.callbackUrl ?? window.location.href,json:'true' }) });
  if (!response.ok) throw new Error('Logout failed'); const result=await response.json();
  if (options.redirect!==false) window.location.assign(result.url); return result as { url:string };
}
