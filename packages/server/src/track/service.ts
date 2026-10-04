import type {DataSource,QueryRunner} from 'typeorm';
import {can,DEFAULT_TRACK_POLICY,TRACK_SETTING_KEYS,isTrackMode,isCardClosed,resolveTrackPolicy,type AuthUser,type TrackScope,type TrackPolicySettings,type TrackViewResult,type TrackMessageView} from '@so7ob/contracts';
import type {TrackLink} from '../database/models.js';
import {AuthFault,audit,newId,sha256,transaction} from '../auth/persistence.js';
import {insertRecord} from '../business/persistence.js';
import {trackLinkMail} from '../auth/email-templates.js';
import type {MailQueue} from '../queue/mail-queue.js';
import {generateTrackToken,hashTrackToken,type TrackCapability} from './session.js';
const POLICY_LOCK=sha256('track-policy');
interface Card {id:string;refCode:string;status:string;clientId:string|null;archivedAt:Date|null;createdAt:Date;updatedAt:Date;lastActivityAt:Date;requestType?:string;description?:string;subject?:string;email:string;locale:string}
const names=(scope:TrackScope)=>{
 if(scope==='request')return {table:'ProjectRequest',message:'RequestMessage',field:'requestId',view:'requests.view.all',reply:'requests.reply'} as const;
 if(scope==='inquiry')return {table:'Inquiry',message:'InquiryMessage',field:'inquiryId',view:'inquiries.view.all',reply:'inquiries.reply'} as const;
 throw new AuthFault(400,'invalid');
};
const state=(link:TrackLink)=>link.revokedAt?'revoked' as const:link.expiresAt.getTime()<=Date.now()?'expired' as const:'valid' as const;
export interface TrackContext {actor:AuthUser|null;capability:TrackCapability|null}
export class TrackService {
 private initialized:Promise<unknown>|undefined;
 constructor(private readonly db:DataSource,private readonly queue:MailQueue,private readonly siteURL:string){}
 private async run<T>(work:(r:QueryRunner)=>Promise<T>,writePolicy=false):Promise<T>{
  this.initialized??=this.db.query('INSERT IGNORE INTO OperationLock(lockKey) VALUES(?)',[POLICY_LOCK]).catch(e=>{this.initialized=undefined;throw e;});
  await this.initialized;
  return transaction(this.db,async r=>{
   // Readers share this lock. Settings writers take it exclusively before changing policy.
   await r.query('SELECT lockKey FROM OperationLock WHERE lockKey=? '+(writePolicy?'FOR UPDATE':'LOCK IN SHARE MODE'),[POLICY_LOCK]);
   return work(r);
  });
 }
 async settings(r:QueryRunner):Promise<TrackPolicySettings>{
  const keys=Object.values(TRACK_SETTING_KEYS),rows:Array<{key:string;value:string}>=await r.query('SELECT `key`,value FROM SiteSetting WHERE `key` IN ('+keys.map(()=>'?').join(',')+')',keys);
  const values=new Map(rows.map(x=>[x.key,x.value])),ttl=Number.parseInt(values.get(TRACK_SETTING_KEYS.linkTtlDays)??'',10);
  const requestMode=values.get(TRACK_SETTING_KEYS.requestsMode),inquiryMode=values.get(TRACK_SETTING_KEYS.inquiriesMode);
  return {forceLogin:values.get(TRACK_SETTING_KEYS.forceLogin)==='true',requestsMode:isTrackMode(requestMode)?requestMode:DEFAULT_TRACK_POLICY.requestsMode,inquiriesMode:isTrackMode(inquiryMode)?inquiryMode:DEFAULT_TRACK_POLICY.inquiriesMode,linkTtlDays:Number.isFinite(ttl)&&ttl>=1&&ttl<=3650?ttl:90,allowGuestAttachments:values.get(TRACK_SETTING_KEYS.allowGuestAttachments)==='true'};
 }
 private async card(r:QueryRunner,scope:TrackScope,id:string,lock=false):Promise<Card|null>{
  const n=names(scope);if(!id||id.length>64)throw new AuthFault(400,'invalid');
  const [card]:Card[]=await r.query(`SELECT * FROM ${n.table} WHERE id=?${lock?' FOR UPDATE':''}`,[id]);return card??null;
 }
 private async latest(r:QueryRunner,scope:TrackScope,id:string):Promise<TrackLink|null>{
  const rows:TrackLink[]=await r.query(`SELECT * FROM TrackLink WHERE scope=? AND ${names(scope).field}=? ORDER BY createdAt DESC,id DESC LIMIT 5`,[scope,id]);
  return rows.find(row=>!row.revokedAt)??rows[0]??null;
 }
 private async policy(r:QueryRunner,scope:TrackScope,id:string){
  const settings=await this.settings(r),[exception]:Array<{value:string}>=await r.query('SELECT value FROM SiteSetting WHERE `key`=?',[`track.exception.${scope}.${id}`]);
  return {settings,policy:resolveTrackPolicy(scope,settings,isTrackMode(exception?.value)?exception.value:null)};
 }
 private permit(actor:AuthUser,scope:TrackScope,write=false){if(!['active','pending_verification'].includes(actor.status)||!can(actor,write?names(scope).reply:names(scope).view))throw new AuthFault(403,'forbidden');}
 private async sendLink(r:QueryRunner,card:Card,token:string,days:number,linkId:string):Promise<boolean>{
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(card.email))return false;
  const locale=card.locale==='en'?'en':'ar',url=new URL(`/${locale}/track?t=${encodeURIComponent(token)}`,this.siteURL).href;
  const mail=trackLinkMail(locale,{url,refCode:card.refCode,expiresInDays:days});
  await r.query('SAVEPOINT track_mail');
  try{await this.queue.enqueue(r,{to:card.email.trim().toLowerCase(),...mail},sha256('track-link:'+linkId+':'+hashTrackToken(token)));await r.query('RELEASE SAVEPOINT track_mail');return true;}
  catch{await r.query('ROLLBACK TO SAVEPOINT track_mail');await r.query('RELEASE SAVEPOINT track_mail');return false;}
 }
 async issue(scope:TrackScope,id:string,actor:AuthUser|null=null){
  return this.run(async r=>{
   const card=await this.card(r,scope,id,true);if(!card||card.archivedAt)throw new AuthFault(404,'not_found');
   const settings=await this.settings(r),token=generateTrackToken(),linkId=newId(),expiresAt=new Date(Date.now()+settings.linkTtlDays*86400000);
   await r.query(`UPDATE TrackLink SET revokedAt=UTC_TIMESTAMP(3),revokedReason='superseded',updatedAt=UTC_TIMESTAMP(3) WHERE scope=? AND ${names(scope).field}=? AND revokedAt IS NULL`,[scope,id]);
   await insertRecord(r,'TrackLink',{id:linkId,scope,[names(scope).field]:id,tokenHash:hashTrackToken(token),expiresAt,createdById:actor?.id??null});
   const queued=await this.sendLink(r,card,token,settings.linkTtlDays,linkId);
   await audit(r,'track.link_issued',actor,{linkId,queued},scope,id);
   return {token,linkId,expiresAt,queued};
  });
 }
 async exchange(token:unknown){
  const raw=typeof token==='string'?token.trim():'';if(!raw||raw.length>128)throw new AuthFault(400,'invalid');
  return this.run(async r=>{
   const [link]:TrackLink[]=await r.query('SELECT * FROM TrackLink WHERE tokenHash=?',[hashTrackToken(raw)]);
   if(!link)throw new AuthFault(403,'invalid');const status=state(link);if(status!=='valid')throw new AuthFault(403,status);
   if(link.scope!=='request'&&link.scope!=='inquiry')throw new AuthFault(403,'invalid');
   const id=link.scope==='request'?link.requestId:link.inquiryId;if(!id)throw new AuthFault(403,'invalid');
   return {scope:link.scope,id,linkId:link.id,generation:link.tokenHash,expiresAt:link.expiresAt};
  });
 }
 async adminState(actor:AuthUser,scope:TrackScope,id:string){
  this.permit(actor,scope);return this.run(async r=>{
   if(!await this.card(r,scope,id))throw new AuthFault(404,'not_found');
   const link=await this.latest(r,scope,id),{settings,policy}=await this.policy(r,scope,id);
   return {ok:true,link:link?{id:link.id,state:state(link),expiresAt:link.expiresAt.toISOString(),revokedAt:link.revokedAt?.toISOString()??null,revokedReason:link.revokedReason,createdAt:link.createdAt.toISOString()}:null,policy:{mode:policy.mode,source:policy.source,canReplyViaLink:policy.canReplyViaLink},settings:{forceLogin:settings.forceLogin}};
  });
 }
 async renew(actor:AuthUser,scope:TrackScope,id:string){
  this.permit(actor,scope,true);return this.run(async r=>{
   const card=await this.card(r,scope,id,true);if(!card||card.archivedAt)throw new AuthFault(404,'not_found');
   const link=await this.latest(r,scope,id);if(!link)throw new AuthFault(404,'not_found');
   const settings=await this.settings(r),token=generateTrackToken(),expiresAt=new Date(Date.now()+settings.linkTtlDays*86400000);
   await r.query('UPDATE TrackLink SET tokenHash=?,expiresAt=?,revokedAt=NULL,revokedReason=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[hashTrackToken(token),expiresAt,link.id]);
   const queued=await this.sendLink(r,card,token,settings.linkTtlDays,link.id);
   await audit(r,'track.link_renewed',actor,{linkId:link.id,queued},scope,id);
   return {ok:true,token,emailedTo:queued?card.email:null};
  });
 }
 async revoke(actor:AuthUser,scope:TrackScope,id:string,reason:unknown){
  this.permit(actor,scope,true);return this.run(async r=>{
   if(!await this.card(r,scope,id,true))throw new AuthFault(404,'not_found');const link=await this.latest(r,scope,id);if(!link)throw new AuthFault(404,'not_found');
   if(link.revokedAt)return {ok:false,code:'already_revoked'};
   const text=typeof reason==='string'?reason.slice(0,200):null;
   await r.query('UPDATE TrackLink SET revokedAt=UTC_TIMESTAMP(3),revokedReason=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[text||'admin_revoked',link.id]);
   await audit(r,'track.link_revoked',actor,{linkId:link.id,reason:text},scope,id);return {ok:true};
  });
 }
 async setException(actor:AuthUser,scope:TrackScope,id:string,mode:unknown){
  this.permit(actor,scope,true);if(mode!=='inherit'&&!isTrackMode(mode))throw new AuthFault(400,'invalid_mode');
  return this.run(async r=>{
   if(!await this.card(r,scope,id,true))throw new AuthFault(404,'not_found');
   await r.query('INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updatedById=VALUES(updatedById),updatedAt=UTC_TIMESTAMP(3)',[`track.exception.${scope}.${id}`,mode,actor.id]);
   await audit(r,'track.policy_changed',actor,{exception:mode},scope,id);return {ok:true};
  },true);
 }
 private async access(r:QueryRunner,scope:TrackScope,id:string,ctx:TrackContext,lock=false){
  const card=await this.card(r,scope,id,lock),{policy}=await this.policy(r,scope,id),link=await this.latest(r,scope,id);
  if(!card)return {card,link,policy,reason:'not_found' as const};
  const actor=ctx.actor&&['active','pending_verification'].includes(ctx.actor.status)?ctx.actor:null;
  const owner=!!actor&&!!card.clientId&&actor.id===card.clientId,staff=!!actor&&can(actor,names(scope).view);
  const cap=ctx.capability,matched=!!cap&&!!link&&cap.lid===link.id&&cap.generation===link.tokenHash&&cap.exp*1000>Date.now();
  if(owner||staff)return {card,link,policy,reason:null};
  if(card.archivedAt)return {card,link,policy,reason:'not_found' as const};
  if(link&&state(link)!=='valid')return {card,link,policy,reason:state(link) as 'expired'|'revoked'};
  if(matched&&policy.canViewViaLink)return {card,link,policy,reason:null};
  return {card,link,policy,reason:matched?'policy_denied' as const:'owner_required' as const};
 }
 async view(scope:TrackScope,id:string,ctx:TrackContext):Promise<TrackViewResult>{
  return this.run(async r=>{
   const access=await this.access(r,scope,id,ctx),{card,link,policy,reason}=access;
   const record=link?{id:link.id,expiresAt:link.expiresAt,state:state(link)}:null;
   if(reason||!card)return {ok:false,reason:reason??'not_found',policy,link:record};
   const n=names(scope),messages:Array<{id:string;authorType:string;authorName:string|null;body:string;createdAt:Date}>=await r.query(`SELECT m.id,m.authorType,IF(m.authorType='staff',u.name,NULL) authorName,m.body,m.createdAt FROM ${n.message} m LEFT JOIN User u ON u.id=m.authorId WHERE m.${n.field}=? AND m.kind<>'internal_note' ORDER BY m.createdAt,m.id`,[id]);
   const attachments:Array<{id:string;filename:string;size:number;mimeType:string;messageId:string}>=await r.query(`SELECT a.id,a.filename,a.size,a.mimeType,a.messageId FROM Attachment a JOIN ${n.message} m ON m.id=a.messageId AND m.${n.field}=a.${n.field} WHERE a.${n.field}=? AND m.kind<>'internal_note'`,[id]);
   const byMessage=new Map<string,TrackMessageView['attachments']>();for(const a of attachments){const items=byMessage.get(a.messageId)??[];items.push({id:a.id,filename:a.filename,size:a.size,mimeType:a.mimeType});byMessage.set(a.messageId,items);}
   const events:Array<{toStatus:string;createdAt:Date}>=scope==='request'?await r.query('SELECT toStatus,createdAt FROM RequestStatusEvent WHERE requestId=? ORDER BY createdAt,id',[id]):[{toStatus:card.status,createdAt:card.updatedAt}];
   const closed=isCardClosed(card.status);
   return {ok:true,link:record,policy:{...policy,cardClosed:closed,canReplyViaLink:policy.canReplyViaLink&&!closed,canReplyByOwner:policy.canReplyByOwner&&!closed},card:{scope,id:card.id,refCode:card.refCode,typeLabel:card.requestType??'general',subject:scope==='request'?'#'+card.refCode:card.subject??'#'+card.refCode,description:scope==='request'?card.description??'':card.subject??'',status:card.status,createdAt:card.createdAt.toISOString(),updatedAt:card.lastActivityAt.toISOString(),timeline:events.map(e=>({toStatus:e.toStatus,at:e.createdAt.toISOString()})),messages:messages.map(m=>({...m,createdAt:m.createdAt.toISOString(),attachments:byMessage.get(m.id)??[]}))}};
  });
 }
 async reply(scope:TrackScope,id:string,ctx:TrackContext,body:unknown){
  const text=typeof body==='string'?body.trim():'';if(!text)throw new AuthFault(400,'empty');if(text.length>5000)throw new AuthFault(400,'too_long');
  return this.run(async r=>{
   const {card,policy,reason}=await this.access(r,scope,id,ctx,true);
   if(reason||!card)throw new AuthFault(reason==='not_found'?404:403,reason==='not_found'?'not_found':'policy_denied');
   if(ctx.actor){if(!['active','pending_verification'].includes(ctx.actor.status)||can(ctx.actor,names(scope).reply)||ctx.actor.id!==card.clientId)throw new AuthFault(403,'policy_denied');}
   else if(!policy.canReplyViaLink)throw new AuthFault(403,'policy_denied');
   if(isCardClosed(card.status)||card.archivedAt)throw new AuthFault(403,'closed');
   const n=names(scope),recent:Array<{body:string}>=await r.query(`SELECT body FROM ${n.message} WHERE ${n.field}=? AND createdAt>=TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP(3))`,[id]);
   if(recent.some(m=>m.body.trim()===text))throw new AuthFault(409,'duplicate');
   const mid=newId();await insertRecord(r,n.message,{id:mid,[n.field]:id,authorId:ctx.actor?.id??null,authorType:'client',kind:'message',body:text});
   await r.query(`UPDATE ${n.table} SET lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3)${scope==='request'?',lastClientReplyAt=UTC_TIMESTAMP(3)':''} WHERE id=?`,[id]);
   await audit(r,'track.guest_reply',ctx.actor,{via:ctx.actor?'account_owner':'track_link',messageId:mid},scope,id);
   const staff:Array<{id:string}>=await r.query("SELECT id FROM User WHERE status='active' AND roleKey IN ('super_admin','support') ORDER BY id LIMIT 50");
   if(staff.length)await r.query('INSERT INTO Notification(id,userId,type,payload,link) VALUES '+staff.map(()=>'(?,?,?,?,?)').join(','),staff.flatMap(u=>[newId(),u.id,'reply_received',JSON.stringify({ref:card.refCode}),`/ar/admin/${scope==='request'?'requests':'inquiries'}/${id}`]));
   const [row]:Array<{createdAt:Date}>=await r.query(`SELECT createdAt FROM ${n.message} WHERE id=?`,[mid]);
   return {ok:true,message:{id:mid,authorType:'client',authorName:null,body:text,createdAt:row.createdAt.toISOString(),attachments:[]}};
  });
 }
 async guestAttachment(id:string,ctx:TrackContext):Promise<boolean>{
  if(ctx.actor||!ctx.capability)return false;
  return this.run(async r=>{
   const [attachment]:Array<{requestId:string|null;inquiryId:string|null;messageId:string|null}>=await r.query('SELECT requestId,inquiryId,messageId FROM Attachment WHERE id=?',[id]);
   if(!attachment?.messageId)return false;const scope=attachment.requestId?'request':attachment.inquiryId?'inquiry':null,cardId=attachment.requestId??attachment.inquiryId;
   if(!scope||!cardId)return false;const {reason,link}=await this.access(r,scope,cardId,ctx);if(reason||!link)return false;
   const n=names(scope),[message]=await r.query(`SELECT id FROM ${n.message} WHERE id=? AND ${n.field}=? AND kind<>'internal_note'`,[attachment.messageId,cardId]);
   if(!message)return false;await audit(r,'track.attachment_downloaded',null,{linkId:link.id,attachmentId:id,via:'track_link'},scope,cardId);return true;
  });
 }
}
