import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {SYSTEM_ROLES,TRACK_SETTING_KEYS,type AuthUser,type TrackScope} from '@so7ob/contracts';
import {createDataSource} from '../database/data-source.js';
import {RequestService} from '../business/requests.js';
import {AdminConversationService} from '../admin/conversations.js';
import {TrackService} from './service.js';
import {AdminOperationsService} from '../admin/operations.js';
import {MailQueue} from '../queue/mail-queue.js';
import {PayloadCipher} from '../queue/crypto.js';
import {createTrackSessionValue,verifyTrackSessionValue} from './session.js';
const name=process.env.TEST_DATABASE_NAME;
if(!name||!/^so7ob_[a-z0-9_]+_test$/.test(name))throw new Error('Real isolated MariaDB required');
const db=createDataSource({...process.env,DATABASE_NAME:name}),prefix='track'+randomBytes(6).toString('hex');
const cipher=new PayloadCipher(randomBytes(32).toString('hex')),queue=new MailQueue(db,cipher),svc=new TrackService(db,queue,'https://synthetic.example.invalid'),ops=new AdminOperationsService(db);
const user=(suffix:string,roleKey:string):AuthUser=>({id:prefix+suffix,email:prefix+suffix+'@example.invalid',name:suffix,status:'active',roleKey,locale:'en',emailVerified:true,permissions:SYSTEM_ROLES.find(r=>r.key===roleKey)!.permissions});
const admin=user('admin','super_admin'),owner=user('owner','client'),other=user('other','client'),editor=user('editor','content_editor');
let serial=0;const oldRoles=new Set<string>(),oldSettings:Array<{key:string;value:string;updatedById:string|null}>=[];const oldSecret=process.env.AUTH_SECRET;
async function card(scope:TrackScope='request'){
 const id=prefix+String(++serial),refCode=prefix+'REF'+serial;
 if(scope==='request')await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,budget,timeline,name,email,descriptionHash,preferredContact,clientId,locale) VALUES(?,?,'quote','web','Public description','unspecified','flexible','Private contact',?,'synthetic','email',?,'en')",[id,refCode,owner.email,owner.id]);
 else await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,clientId,locale) VALUES(?,?,'Public subject','Private contact',?,?,'en')",[id,refCode,owner.email,owner.id]);
 return id;
}
async function guest(scope:TrackScope,id:string){const issued=await svc.issue(scope,id);const ex=await svc.exchange(issued.token);const capability=verifyTrackSessionValue(createTrackSessionValue(ex.linkId,ex.generation,ex.expiresAt));return {issued,ctx:{actor:null,capability}};}
beforeAll(async()=>{
 process.env.AUTH_SECRET='Synthetic-Track-Session-Only-492900';await db.initialize();await db.runMigrations();
 for(const r of await db.query('SELECT `key` FROM Role'))oldRoles.add(r.key);
 for(const r of SYSTEM_ROLES)await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE `key`=`key`',[r.key,r.nameAr,r.nameEn,JSON.stringify(r.permissions)]);
 for(const u of [admin,owner,other,editor])await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,locale) VALUES(?,?,?,'synthetic',?,'active','en')",[u.id,u.email,u.name,u.roleKey]);
 const keys=Object.values(TRACK_SETTING_KEYS);oldSettings.push(...await db.query('SELECT `key`,value,updatedById FROM SiteSetting WHERE `key` IN ('+keys.map(()=>'?').join(',')+')',keys));
});
beforeEach(async()=>{await ops.updateSettings(admin,{'track.forceLogin':'false','track.requestsMode':'login_required','track.inquiriesMode':'login_required','track.linkTtlDays':'90','track.allowGuestAttachments':'false'});});
afterAll(async()=>{
 if(oldSecret===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=oldSecret;
 if(!db.isInitialized)return;
 await db.query('DROP TRIGGER IF EXISTS `'+prefix+'audit`');
 const keys=Object.values(TRACK_SETTING_KEYS);await db.query('DELETE FROM SiteSetting WHERE `key` IN ('+keys.map(()=>'?').join(',')+') OR `key` LIKE ?',[...keys,'track.exception.%.'+prefix+'%']);
 for(const row of oldSettings)await db.query('INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?)',[row.key,row.value,row.updatedById]);
 await db.query('DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?',[prefix+'%']);await db.query('DELETE FROM EmailLog WHERE `to` LIKE ?',[prefix+'%']);
 await db.query('DELETE FROM Attachment WHERE id LIKE ?',[prefix+'%']);await db.query('DELETE FROM TrackLink WHERE requestId LIKE ? OR inquiryId LIKE ?',[prefix+'%',prefix+'%']);
 await db.query('DELETE FROM ProjectRequest WHERE id LIKE ?',[prefix+'%']);await db.query('DELETE FROM Inquiry WHERE id LIKE ?',[prefix+'%']);
 await db.query("DELETE FROM Notification WHERE userId LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref')) LIKE ?",[prefix+'%',prefix+'%']);
 await db.query('DELETE FROM AuditLog WHERE actorId LIKE ? OR entityId LIKE ?',[prefix+'%',prefix+'%']);await db.query('DELETE FROM User WHERE id LIKE ?',[prefix+'%']);
 for(const r of SYSTEM_ROLES)if(!oldRoles.has(r.key)&&!(await db.query('SELECT id FROM User WHERE roleKey=? LIMIT 1',[r.key])).length)await db.query('DELETE FROM Role WHERE `key`=?',[r.key]);
 await db.destroy();
});
it('defaults to account ownership and keeps account access independent of link revocation',async()=>{
 const id=await card(),{ctx}=await guest('request',id);
 expect(await svc.view('request',id,ctx)).toMatchObject({ok:false,reason:'policy_denied'});
 expect(await svc.view('request',id,{actor:other,capability:null})).toMatchObject({ok:false,reason:'owner_required'});
 expect(await svc.view('request',id,{actor:owner,capability:null})).toMatchObject({ok:true});
 await svc.revoke(admin,'request',id,'synthetic');
 expect(await svc.view('request',id,{actor:owner,capability:null})).toMatchObject({ok:true});
 expect(await svc.view('request',id,ctx)).toMatchObject({ok:false,reason:'revoked'});
});
it('policy mode, exception and force-login are reevaluated for an existing session',async()=>{
 const id=await card(),{ctx}=await guest('request',id);
 await ops.updateSettings(admin,{'track.requestsMode':'link_view'});expect(await svc.view('request',id,ctx)).toMatchObject({ok:true,policy:{canReplyViaLink:false}});
 await expect(svc.reply('request',id,ctx,'Blocked reply')).rejects.toMatchObject({code:'policy_denied'});
 await svc.setException(admin,'request',id,'link_reply');expect(await svc.adminState(admin,'request',id)).toMatchObject({policy:{mode:'link_reply',source:'card_exception'}});
 expect(await svc.reply('request',id,ctx,'Allowed guest reply')).toMatchObject({ok:true,message:{authorType:'client',authorName:null}});
 await ops.updateSettings(admin,{'track.forceLogin':'true'});expect(await svc.view('request',id,ctx)).toMatchObject({ok:false,policy:{source:'platform_force_login'}});
 await expect(svc.reply('request',id,ctx,'Force login denied')).rejects.toMatchObject({code:'policy_denied'});
});
it('renewal invalidates previously exchanged capabilities and raw tokens without restoring revoked sessions',async()=>{
 const id=await card();await svc.setException(admin,'request',id,'link_reply');const {issued,ctx}=await guest('request',id);
 await svc.revoke(admin,'request',id,null);const renewed=await svc.renew(admin,'request',id);
 await expect(svc.exchange(issued.token)).rejects.toMatchObject({code:'invalid'});expect(await svc.view('request',id,ctx)).toMatchObject({ok:false});
 const ex=await svc.exchange(renewed.token),fresh={actor:null,capability:verifyTrackSessionValue(createTrackSessionValue(ex.linkId,ex.generation,ex.expiresAt))};expect(await svc.view('request',id,fresh)).toMatchObject({ok:true});
 const row=(await db.query('SELECT * FROM TrackLink WHERE id=?',[issued.linkId]))[0];expect(JSON.stringify(row)).not.toContain(renewed.token);
 const logs=await db.query('SELECT details FROM AuditLog WHERE entityId=?',[id]);expect(JSON.stringify(logs)).not.toContain(renewed.token);
 const jobs=await db.query('SELECT j.* FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?',[owner.email]);expect(jobs.some((j:{id:string;payload:string})=>cipher.decrypt(j.payload,j.id).text.includes(renewed.token))).toBe(true);
 expect(JSON.stringify(await db.query('SELECT * FROM EmailLog WHERE `to`=?',[owner.email]))).not.toContain(renewed.token);
});
it('a second issue revokes previous links atomically and link sessions cannot cross cards',async()=>{
 const id=await card(),second=await card();await svc.setException(admin,'request',id,'link_view');await svc.setException(admin,'request',second,'link_view');const old=await guest('request',id);await svc.issue('request',id);
 await expect(svc.exchange(old.issued.token)).rejects.toMatchObject({code:'revoked'});expect(await svc.view('request',id,old.ctx)).toMatchObject({ok:false});expect(await svc.view('request',second,old.ctx)).toMatchObject({ok:false});
 expect((await db.query('SELECT id FROM TrackLink WHERE requestId=? AND revokedAt IS NULL',[id]))).toHaveLength(1);
});
for(const scope of ['request','inquiry'] as const)it(`${scope}: public projection excludes internal messages, contact data, and unrelated attachments`,async()=>{
 const id=await card(scope),n=scope==='request'?{table:'RequestMessage',field:'requestId'}:{table:'InquiryMessage',field:'inquiryId'};await svc.setException(admin,scope,id,'link_view');const {ctx}=await guest(scope,id);
 for(const [suffix,kind,body] of [['public','message','Visible reply'],['private','internal_note','Secret staff note']]){
  await db.query(`INSERT INTO ${n.table}(id,${n.field},authorId,authorType,kind,body) VALUES(?,?,?,'staff',?,?)`,[id+suffix,id,admin.id,kind,body]);
  await db.query(`INSERT INTO Attachment(id,${n.field},messageId,filename,storedName,mimeType,size,uploaderId) VALUES(?,?,?,?,?,'text/plain',1,?)`,[id+suffix,id,id+suffix,suffix+'.txt',id+suffix+'.txt',owner.id]);
 }
 const view=await svc.view(scope,id,ctx);expect(view.card?.messages).toHaveLength(1);expect(view.card?.messages[0].attachments).toHaveLength(1);expect(JSON.stringify(view)).not.toContain('Secret staff note');expect(JSON.stringify(view)).not.toContain(owner.email);expect(JSON.stringify(view)).not.toContain('Private contact');expect(JSON.stringify(view)).not.toContain('tokenHash');
 expect(await svc.guestAttachment(id+'public',ctx)).toBe(true);expect(await svc.guestAttachment(id+'private',ctx)).toBe(false);
 await svc.setException(admin,scope,id,'login_required');expect(await svc.guestAttachment(id+'public',ctx)).toBe(false);
});
it('serializes duplicate concurrent replies and never creates a guest account',async()=>{
 const id=await card('inquiry');await svc.setException(admin,'inquiry',id,'link_reply');const {ctx}=await guest('inquiry',id);const before=(await db.query('SELECT COUNT(*) n FROM User'))[0].n;
 const results=await Promise.allSettled([svc.reply('inquiry',id,ctx,'Same reply'),svc.reply('inquiry',id,ctx,'Same reply')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'duplicate'}});
 expect((await db.query('SELECT COUNT(*) n FROM User'))[0].n).toBe(before);expect((await db.query('SELECT authorId FROM InquiryMessage WHERE inquiryId=?',[id]))[0].authorId).toBeNull();
});
it('denies closed/archived cards, expired links, nonowners and staff replies through the guest channel',async()=>{
 const id=await card();await svc.setException(admin,'request',id,'link_reply');const {ctx,issued}=await guest('request',id);
 await expect(svc.reply('request',id,{...ctx,actor:other},'Nonowner')).rejects.toMatchObject({code:'policy_denied'});await expect(svc.reply('request',id,{...ctx,actor:admin},'Staff')).rejects.toMatchObject({code:'policy_denied'});
 await db.query("UPDATE ProjectRequest SET status='closed' WHERE id=?",[id]);await expect(svc.reply('request',id,ctx,'Closed')).rejects.toMatchObject({status:403});
 await db.query("UPDATE ProjectRequest SET status='new',archivedAt=UTC_TIMESTAMP(3) WHERE id=?",[id]);expect(await svc.view('request',id,ctx)).toMatchObject({ok:false,reason:'not_found'});
 await db.query('UPDATE ProjectRequest SET archivedAt=NULL WHERE id=?',[id]);await db.query('UPDATE TrackLink SET expiresAt=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?',[issued.linkId]);await expect(svc.exchange(issued.token)).rejects.toMatchObject({code:'expired'});expect(await svc.view('request',id,ctx)).toMatchObject({ok:false,reason:'expired'});
});
it('requires admin permissions, validates settings and preserves omitted DTO values',async()=>{
 const id=await card();await guest('request',id);
 for(const work of [()=>svc.adminState(owner,'request',id),()=>svc.renew(editor,'request',id),()=>svc.revoke(owner,'request',id,null),()=>svc.setException(owner,'request',id,'link_reply')])await expect(work()).rejects.toMatchObject({status:403});
 for(const value of ['0','3651','2.0','12days'])await expect(ops.updateSettings(admin,{'track.linkTtlDays':value})).rejects.toMatchObject({code:'invalid_track_ttl'});
 await expect(ops.updateSettings(admin,{'track.requestsMode':'unknown'})).rejects.toMatchObject({code:'invalid_track_mode'});
 await ops.updateSettings(admin,{'track.requestsMode':'link_view','track.forceLogin':undefined});expect((await ops.settings(admin)).settings['track.forceLogin']).toBe('false');
});
it('rolls back reply and renewal on audit failure, while mail queue failure leaves a valid issued link',async()=>{
 const id=await card();await svc.setException(admin,'request',id,'link_reply');const {ctx,issued}=await guest('request',id);
 await db.query(`CREATE TRIGGER \`${prefix}audit\` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.entityId='${id}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic_audit_failure'; END IF; END`);
 try{await expect(svc.reply('request',id,ctx,'Rollback reply')).rejects.toThrow();await expect(svc.renew(admin,'request',id)).rejects.toThrow();expect(await svc.exchange(issued.token)).toMatchObject({linkId:issued.linkId});expect(await db.query('SELECT id FROM RequestMessage WHERE requestId=?',[id])).toHaveLength(0);}finally{await db.query('DROP TRIGGER `'+prefix+'audit`');}
 const failing=new class extends MailQueue{async enqueue():Promise<never>{throw new Error('synthetic_queue_failure');}}(db,cipher);
 const noMail=new TrackService(db,failing,'https://synthetic.example.invalid'),link=await noMail.issue('request',id);expect(link.queued).toBe(false);expect(await noMail.exchange(link.token)).toMatchObject({linkId:link.linkId});
});

for(const scope of ['request','inquiry'] as const)it(`${scope}: staff mail uses encrypted queue, excludes internal notes and never renews a revoked capability`,async()=>{
 const key=randomBytes(32).toString('hex'),mailCipher=new PayloadCipher(key),env={SITE_URL:'https://synthetic.example.invalid',OUTBOX_KEY:key};
 const id=await card(scope),{issued}=await guest(scope,id);await svc.revoke(admin,scope,id,'private');
 // An unregistered contact still receives a public reply, without a new login capability.
 const table=scope==='request'?'ProjectRequest':'Inquiry';await db.query(`UPDATE ${table} SET clientId=NULL WHERE id=?`,[id]);
 const reply=(body:string,kind='message')=>scope==='request'?new RequestService(db,env).message(admin,id,{body,kind}):new AdminConversationService(db,env).inquiryMessage(admin,id,{body,kind});
 const before=(await db.query('SELECT COUNT(*) n FROM MailJob'))[0].n;
 await reply('Private staff-only note','internal_note');expect((await db.query('SELECT COUNT(*) n FROM MailJob'))[0].n).toBe(before);
 const result=await reply('Public staff reply '+ 'x'.repeat(300));
 const jobs=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=? ORDER BY j.createdAt DESC',[owner.email]);
 const decoded=jobs.flatMap((j:{id:string;payload:string})=>{try{return [mailCipher.decrypt(j.payload,j.id)];}catch{return [];}});
 expect(decoded).toHaveLength(1);expect(decoded[0].text).toContain('https://synthetic.example.invalid/en/track');expect(decoded[0].text).not.toContain('?t=');expect(decoded[0].text).not.toContain('?card=');expect(decoded[0].text).not.toContain('x'.repeat(241));expect(decoded[0].text).not.toContain('Private staff-only note');
 expect((await db.query('SELECT revokedAt,tokenHash FROM TrackLink WHERE id=?',[issued.linkId]))[0].revokedAt).not.toBeNull();
 expect(JSON.stringify(await db.query('SELECT * FROM EmailLog WHERE `to`=?',[owner.email]))).not.toContain('Public staff reply');
 expect(result.ok).toBe(true);
});
it('a committed force-login change wins over a reply waiting behind the policy lock',async()=>{
 const id=await card();await svc.setException(admin,'request',id,'link_reply');const {ctx}=await guest('request',id);
 const r=db.createQueryRunner();await r.connect();await r.startTransaction('READ COMMITTED');let pending:Promise<unknown>|undefined;
 try{
  await r.query('SELECT lockKey FROM OperationLock WHERE lockKey=SHA2(?,256) FOR UPDATE',['track-policy']);
  await r.query("UPDATE SiteSetting SET value='true' WHERE `key`='track.forceLogin'");
  let settled=false;pending=svc.reply('request',id,ctx,'Reply behind changed policy').then(value=>{settled=true;return {status:'fulfilled',value};},reason=>{settled=true;return {status:'rejected',reason};});
  // Hold a real uncommitted policy writer. Readers may not bypass its lock.
  await new Promise(resolve=>setTimeout(resolve,30));expect(settled).toBe(false);
  await r.commitTransaction();await expect(pending).resolves.toMatchObject({status:'rejected',reason:{code:'policy_denied'}});
  expect(await db.query('SELECT id FROM RequestMessage WHERE requestId=?',[id])).toHaveLength(0);
 }finally{if(r.isTransactionActive)await r.rollbackTransaction();await pending?.catch(()=>{});await r.release();}
});
