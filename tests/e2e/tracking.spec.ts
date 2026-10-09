import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createDataSource} from '@so7ob/server';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {getPortalContent} from '../../apps/web/src/content/portal';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
for(const locale of ['ar','en'] as const)test(`${locale}: guest tracking exchanges a private capability, replies and observes revocation`,async({page},info)=>{
 const db=await createDataSource().initialize(),id='track'+randomBytes(8).toString('hex'),token=randomBytes(32).toString('base64url'),scope=locale==='ar'?'request':'inquiry',t=getPortalContent(locale).track;
 const table=scope==='request'?'ProjectRequest':'Inquiry',message=scope==='request'?'RequestMessage':'InquiryMessage',field=scope==='request'?'requestId':'inquiryId';
 const {dataDir}=JSON.parse(readFileSync('.migration/e2e/storage.json','utf8'));const bytes=Buffer.from('Synthetic guest attachment');const filename=id+'.txt';
 const errors:string[]=[],failed:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url().split('?')[0]));
 try{
  for(const k of ['track-ex:127.0.0.1','track-rp:127.0.0.1'])await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[hash(k)]);
  if(scope==='request')await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,descriptionHash,preferredContact,locale) VALUES(?,?,'quote','web','Public synthetic description','unspecified','flexible','PRIVATE CONTACT','synthetic@example.invalid','synthetic','email',?)",[id,id,locale]);
  else await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,locale) VALUES(?,?,'Public synthetic subject','PRIVATE CONTACT','synthetic@example.invalid',?)",[id,id,locale]);
  await db.query(`INSERT INTO TrackLink(id,scope,${field},tokenHash,expiresAt) VALUES(?,?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))`,[id,scope,id,hash(token)]);
  await db.query('INSERT INTO SiteSetting(`key`,value) VALUES(?,?)',[`track.exception.${scope}.${id}`,'link_reply']);
  await db.query(`INSERT INTO ${message}(id,${field},authorType,kind,body) VALUES(?,?,'staff','internal_note','PRIVATE INTERNAL NOTE')`,[id+'note',id]);
  mkdirSync(dataDir+'/uploads',{recursive:true});writeFileSync(dataDir+'/uploads/'+filename,bytes);
  await db.query(`INSERT INTO ${message}(id,${field},authorType,kind,body) VALUES(?,?,'staff','message','Public attachment reply')`,[id+'public',id]);
  for(const suffix of ['public','note'])await db.query(`INSERT INTO Attachment(id,${field},messageId,filename,storedName,mimeType,size) VALUES(?,?,?,?,?,'text/plain',?)`,[id+suffix,id,id+suffix,'synthetic.txt',suffix==='public'?filename:id+'secret.txt',bytes.length]);
  const response=await page.goto(`/${locale}/track?t=${token}`);expect(response?.status()).toBe(200);expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page).toHaveURL(new RegExp('/'+locale+'/track\\?card='+scope+'%3A'+id+'$|/'+locale+'/track\\?card='+scope+':'+id+'$'));
  await expect(page.getByPlaceholder(t.replyPlaceholder)).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('PRIVATE');
  const cookie=(await page.context().cookies()).find(c=>c.name==='so7ob_track');expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax'});expect(cookie?.value).not.toContain(token);
  const dto=await page.request.get('/api/v1/track/card',{params:{scope,id}});expect(dto.status()).toBe(200);expect(dto.headers()['cache-control']).toBe('private, no-store');expect(await dto.text()).not.toContain('PRIVATE');
  const download=await page.request.get('/api/attachments/'+id+'public');expect(download.status()).toBe(200);expect(await download.body()).toEqual(bytes);expect(download.headers()['cache-control']).toBe('private, no-store');
  expect((await page.request.get('/api/v1/attachments/'+id+'note')).status()).toBe(403);
  const body='Synthetic guest reply '+id;await page.getByPlaceholder(t.replyPlaceholder).fill(body);await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:t.send,exact:true})).toBeFocused();
  const sent=page.waitForResponse(r=>r.url().endsWith('/api/track/reply')&&r.request().method()==='POST');await page.keyboard.press('Enter');expect((await sent).status()).toBe(201);await expect(page.getByText(body,{exact:true})).toBeVisible();
  expect((await db.query(`SELECT authorId FROM ${message} WHERE ${field}=? AND body=?`,[id,body]))[0].authorId).toBeNull();
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(axe.violations).toEqual([]);expect(errors).toEqual([]);expect(failed).toEqual([]);
  const directory='.migration/tracking/browser';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/${locale}-${info.project.name}.png`,fullPage:true});writeFileSync(`${directory}/${locale}-${info.project.name}.json`,JSON.stringify({locale,viewport:info.project.name,axe:axe.violations,errors,failed},null,2));
  await db.query("UPDATE TrackLink SET revokedAt=UTC_TIMESTAMP(3) WHERE id=?",[id]);
  expect((await page.request.get('/api/track/card',{params:{scope,id}})).status()).toBe(403);
  const denied=await page.request.post('/api/v1/track/reply',{headers:{origin:new URL(page.url()).origin},data:{scope,id,body:'Denied after revoke'}});expect(denied.status()).toBe(403);expect((await page.request.get('/api/attachments/'+id+'public')).status()).toBe(403);
 }finally{
  await db.query('DELETE FROM Attachment WHERE id IN (?,?)',[id+'public',id+'note']);try{unlinkSync(dataDir+'/uploads/'+filename);}catch{/* Fixture may fail before bytes are created. */}
  await db.query('DELETE FROM SiteSetting WHERE `key`=?',[`track.exception.${scope}.${id}`]);await db.query('DELETE FROM TrackLink WHERE id=?',[id]);await db.query(`DELETE FROM ${table} WHERE id=?`,[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);await db.query("DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref'))=?",[id]);for(const k of ['track-ex:127.0.0.1','track-rp:127.0.0.1'])await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[hash(k)]);await db.destroy();
 }
});
test('tracking exchange counts malformed bodies and rejects cross-origin attempts',async({page})=>{
 const db=await createDataSource().initialize(),key=hash('track-ex:127.0.0.1');
 try{
  await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[key]);const origin=new URL(test.info().project.use.baseURL??'https://127.0.0.1:3198').origin;
  expect((await page.request.post('/api/track/exchange',{headers:{origin:'https://attacker.invalid'},data:{token:'invalid'}})).status()).toBe(403);
  for(let i=0;i<10;i++)expect((await page.request.post('/api/track/exchange',{headers:{origin,'content-type':'application/json'},data:'{'})).status()).toBe(400);
  const limited=await page.request.post('/api/v1/track/exchange',{headers:{origin},data:{token:'invalid'}});expect(limited.status()).toBe(429);expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
 }finally{await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[key]);await db.destroy();}
});
for(const locale of ['ar','en'] as const)test(`${locale}: staff renews and revokes through the tracking panel`,async({page})=>{
 const db=await createDataSource().initialize(),id='trackadmin'+randomBytes(7).toString('hex'),token=randomBytes(32).toString('base64url'),{prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),t=getPortalContent(locale).admin.track;
 try{
  await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,descriptionHash,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic tracking administration','unspecified','flexible','Synthetic contact',?,'synthetic','email',?)",[id,id,id+'@example.invalid',locale]);
  await db.query("INSERT INTO TrackLink(id,scope,requestId,tokenHash,expiresAt) VALUES(?,'request',?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))",[id,id,hash(token)]);
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
  const headers={'x-csrf-token':csrfToken};expect((await page.request.post('/api/v1/admin/track',{headers,data:{scope:'request',id,action:'policy',mode:'link_reply'}})).status()).toBe(200);
  await page.goto(`/${locale}/admin/requests/${id}`);const panel=page.getByRole('region',{name:t.section});await expect(panel.getByText(t.mode.link_reply,{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:t.renew,exact:true}).click();const revealed=panel.getByRole('textbox',{name:t.section});await expect(revealed).toBeVisible();const path=await revealed.inputValue();expect(path).toContain(`/${locale}/track?t=`);expect(path).not.toContain(token);
  expect((await db.query('SELECT tokenHash FROM TrackLink WHERE id=?',[id]))[0].tokenHash).toBe(hash(new URL(path,'https://example.invalid').searchParams.get('t')!));
  expect((await new AxeBuilder({page}).include('section[aria-label="'+t.section+'"]').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.reload();await expect(panel.getByRole('textbox',{name:t.section})).toHaveCount(0);page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:t.revoke,exact:true}).click();await expect(panel.getByText(t.stateRevoked,{exact:true})).toBeVisible();
  expect((await db.query('SELECT revokedAt FROM TrackLink WHERE id=?',[id]))[0].revokedAt).not.toBeNull();
 }finally{
  await db.query('DELETE FROM SiteSetting WHERE `key`=?',[`track.exception.request.${id}`]);await db.query('DELETE FROM TrackLink WHERE id=?',[id]);await db.query('DELETE FROM ProjectRequest WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);await db.query('DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?',[id+'@example.invalid']);await db.query('DELETE FROM EmailLog WHERE `to`=?',[id+'@example.invalid']);await db.destroy();
 }
});
