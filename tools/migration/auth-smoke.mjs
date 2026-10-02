// HTTP contract checks against the compiled Nest server and real isolated MariaDB.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { database, assertSchema, PayloadCipher, sha256 } from '@so7ob/server';
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? '')) throw new Error('HTTP smoke requires isolated MariaDB');
const db=await database(); await assertSchema(db); const prefix='http'+randomBytes(8).toString('hex');
const key=randomBytes(32).toString('hex'); const origin='http://127.0.0.1:3199'; const cookies=new Map();
const password='Synthetic-HTTP-4829'; let child; let createdRole=false;
async function request(path,options={}) {
  const response=await fetch(origin+path,{ ...options,redirect:'manual',headers:{ ...(options.method==='POST'?{ Origin:origin }:{}),Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...options.headers } });
  for (const cookie of response.headers.getSetCookie()) { const pair=cookie.split(';')[0]; const at=pair.indexOf('='); cookies.set(pair.slice(0,at),pair.slice(at+1)); }
  return response;
}
async function post(path,body,headers={}) { return request(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}); }
async function csrf() { return (await (await request('/api/auth/csrf')).json()).csrfToken; }
async function login() {
  const response=await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:prefix+'@example.invalid',password,csrfToken:await csrf(),callbackUrl:origin+'/ar/account',json:'true'})});
  assert.equal(response.status,200); assert.equal((await response.json()).url,origin+'/ar/account'); return response;
}
try {
  if (!(await db.query("SELECT `key` FROM Role WHERE `key`='client'")).length) { await db.query("INSERT INTO Role (`key`,nameAr,nameEn,permissions) VALUES('client','العميل','Client','[]')"); createdRole=true; }
  await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,?,'client','active')",[prefix,prefix+'@example.invalid','HTTP Synthetic',await bcrypt.hash(password,12)]);
  child=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,NODE_ENV:'production',PORT:'3199',BIND_HOST:'127.0.0.1',SITE_URL:origin,WEB_ORIGIN:origin,AUTH_SECRET:randomBytes(32).toString('hex'),OUTBOX_KEY:key,EMAIL_DEV_MODE:'false'},stdio:['ignore','pipe','pipe']}); child.stdout.resume(); child.stderr.resume();
  const deadline=Date.now()+15000;
  for (;;) { try { if ((await fetch(origin+'/api/health/ready')).ok) break; } catch { /* startup */ } if (Date.now()>deadline || child.exitCode!==null) throw new Error('Nest startup failed'); await delay(50); }
  const providers=await (await request('/api/auth/providers')).json(); assert.equal(providers.credentials.type,'credentials'); assert.equal(providers.credentials.name,'so7ob');
  const unauthorized=await request('/api/auth/sessions'); assert.equal(unauthorized.status,401);
  const rejected=await post('/api/auth/callback/credentials',{email:prefix+'@example.invalid',password,csrfToken:'bad'}); assert.equal(rejected.status,403);
  const logged=await login(); assert(logged.headers.getSetCookie().some(c=>c.startsWith('__Host-so7ob.session=')&&c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Lax')));
  const session=await (await request('/api/v1/auth/session')).json(); assert.equal(session.user.id,prefix); assert(!JSON.stringify(session).includes('password'));
  const listed=await (await request('/api/auth/sessions')).json(); assert(listed.sessions.some(s=>s.current)); assert(!JSON.stringify(listed).includes('fingerprint'));
  const foreign=await post('/api/v1/auth/sessions',{id:'someone-elses-session'}); assert.equal(foreign.status,404);
  const cross=await post('/api/auth/sessions',{all:true},{Origin:'https://attacker.example.invalid'}); assert.equal(cross.status,403);
  const invalid=await post('/api/auth/register',{name:'x',email:'invalid',password:'short'}); assert.equal(invalid.status,400); assert.deepEqual((await invalid.json()).errors,{name:'name_invalid',email:'email_invalid',password:'password_short'});
  const register=await post('/api/auth/register',{name:'Synthetic Client',email:prefix+'-registered@example.invalid',password,locale:'en',roleKey:'super_admin'}); assert.equal(register.status,201); assert.deepEqual(await register.json(),{ok:true,emailStatus:'queued'});
  // One invalid DTO + one successful registration consumed two attempts. Malformed JSON is the third.
  const malformed=await request('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{ok:false,code:'invalid'});
  const throttled=await post('/api/v1/auth/register',{name:'Never Created',email:prefix+'-limited@example.invalid',password});assert.equal(throttled.status,429);
  for(let n=0;n<3;n++){const bad=await request('/api/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(bad.status,400);}
  assert.equal((await post('/api/v1/auth/forgot-password',{email:'missing@example.invalid'})).status,429);
  const [registered]=await db.query('SELECT id,roleKey FROM User WHERE email=?',[prefix+'-registered@example.invalid']); assert.equal(registered.roleKey,'client');
  const [job]=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?',[prefix+'-registered@example.invalid']);
  const link=new PayloadCipher(key).decrypt(job.payload,job.id).text.match(/http:\/\/[^\s]+/)[0]; const parsed=new URL(link);
  const verified=await request(parsed.pathname+parsed.search); assert.equal(verified.status,307); assert.equal(verified.headers.get('location'),'/en/auth/verified?status=ok');
  const repeated=await request(parsed.pathname+parsed.search); assert.equal(repeated.headers.get('location'),'/en/auth/verified?status=invalid');
  await db.query("UPDATE User SET status='suspended' WHERE id=?",[prefix]); assert.deepEqual(await (await request('/api/auth/session')).json(),{});
  await db.query("UPDATE User SET status='active' WHERE id=?",[prefix]); await login();
  const logout=await post('/api/auth/signout',{csrfToken:await csrf(),callbackUrl:origin+'/ar/auth/login',json:'true'}); assert.equal(logout.status,200); assert.deepEqual(await (await request('/api/auth/session')).json(),{});
  const legacy=await request('/api/auth/session',{headers:{Cookie:'next-auth.session-token=legacy.jwt.cookie'}}); assert.deepEqual(await legacy.json(),{});
  process.stdout.write(JSON.stringify({test:'compiled Nest HTTP authentication',passed:true,checks:['legacy + v1 routes','DTO field errors','invalid and malformed attempts counted once before validation','secure HttpOnly cookie','CSRF/origin','record ownership','fixed registration role','encrypted queued verification','single-use redirect','suspension','logout','legacy cookie rejected']})+'\n');
} finally {
  if (child && child.exitCode===null) { const exited=once(child,'exit'); child.kill('SIGTERM'); await Promise.race([exited,delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]); }
  await db.query('DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?',[prefix+'%']); await db.query('DELETE FROM EmailLog WHERE `to` LIKE ?',[prefix+'%']);
  const users=await db.query('SELECT id FROM User WHERE email LIKE ?',[prefix+'%']); for (const user of users) { await db.query('DELETE FROM AuditLog WHERE actorId=?',[user.id]); await db.query('DELETE FROM User WHERE id=?',[user.id]); }
  for (const flow of ['register','login','forgot']) await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256(flow+':127.0.0.1')]);
  await db.query('DELETE FROM AuditLog WHERE ipHash=? AND actorId IS NULL',[sha256('ip:127.0.0.1')]);
  if (createdRole) await db.query("DELETE FROM Role WHERE `key`='client'"); await db.destroy();
}
