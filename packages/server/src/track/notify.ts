import type {DataSource,QueryRunner} from 'typeorm';
import type {TrackScope} from '@so7ob/contracts';
import {MailQueue} from '../queue/mail-queue.js';
import {PayloadCipher} from '../queue/crypto.js';
import {staffReplyMail} from '../auth/email-templates.js';
import {sha256} from '../auth/persistence.js';
/** Queue only a public staff reply. Never mint a capability or revive a revoked link. */
export async function enqueueTrackStaffReply(db:DataSource,r:QueryRunner,scope:TrackScope,card:{id:string;refCode:string;email:string;locale:string;clientId:string|null},messageId:string,body:string,env:NodeJS.ProcessEnv=process.env):Promise<boolean>{
 await r.query('SAVEPOINT track_staff_mail');
 try{
  if(!env.SITE_URL)throw new Error('Missing independent site origin');
  const locale=card.locale==='en'?'en':'ar',path=`/${locale}/track${card.clientId?`?card=${scope}:${card.id}`:''}`;
  const mail=staffReplyMail(locale,{refCode:card.refCode,url:new URL(path,env.SITE_URL).href,preview:body.trim().slice(0,240)||undefined});
  await new MailQueue(db,new PayloadCipher(env.OUTBOX_KEY)).enqueue(r,{to:card.email.trim().toLowerCase(),...mail},sha256('track-staff-reply:'+scope+':'+messageId));
  await r.query('RELEASE SAVEPOINT track_staff_mail');return true;
 }catch{await r.query('ROLLBACK TO SAVEPOINT track_staff_mail');await r.query('RELEASE SAVEPOINT track_staff_mail');return false;}
}
