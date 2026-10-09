import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { database, assertSchema, sha256 } from '@so7ob/server';
import { SYSTEM_ROLES } from '@so7ob/contracts';
import { schema, identifier as q } from '../../packages/server/src/database/schema.js';
export default async function setup() {
  const db=await database(); await assertSchema(db);
  const prefix='browser'+randomBytes(8).toString('hex'); const password='Synthetic-Browser-4929'; const passwordHash=await bcrypt.hash(password,12);
  const createdRoles:string[]=[];
  for (const role of SYSTEM_ROLES) {
    if (!(await db.query('SELECT `key` FROM Role WHERE `key`=?',[role.key])).length) {
      await db.query('INSERT INTO Role (`key`,nameAr,nameEn,descriptionAr,descriptionEn,permissions,isSystem) VALUES(?,?,?,?,?,?,1)',[role.key,role.nameAr,role.nameEn,role.descriptionAr,role.descriptionEn,JSON.stringify(role.permissions)]); createdRoles.push(role.key);
    }
  }
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/public-content.json',import.meta.url),'utf8')) as {tables:Record<string,Record<string,unknown>[]>};
  for (const [table,rows] of Object.entries(fixture.tables)) for (const row of rows) {
    const pk=Object.keys(schema[table].columns).find(k=>schema[table].columns[k].primary)!;
    if ((await db.query(`SELECT ${q(pk)} FROM ${q(table)} WHERE ${q(pk)}=?`,[row[pk]])).length) continue;
    const columns=Object.keys(row); await db.query(`INSERT INTO ${q(table)} (${columns.map(q).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(k=>schema[table].columns[k].type==='DateTime'&&row[k]!==null ? new Date(String(row[k])):row[k]));
  }
  for (const [name,role] of [['owner','client'],['other','client'],['recovery','client'],['editor','content_editor'],['admin','super_admin'],['ops','ops_manager'],['support','support'],...['desktop','mobile'].flatMap(size=>['ar','en'].map(locale=>['portal'+size+locale,'client']))]) await db.query('INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,locale) VALUES(?,?,?,?,?,\'active\',UTC_TIMESTAMP(3),?)',[prefix+name,prefix+name+'@example.invalid','Synthetic '+name,passwordHash,role,name.endsWith('en')?'en':'ar']);
  mkdirSync('.migration/e2e',{recursive:true,mode:0o700}); writeFileSync('.migration/e2e/run.json',JSON.stringify({prefix,password}),{mode:0o600});
  await db.destroy();
  return async()=>{
    // A new connection: the process-local singleton deliberately closes after fixture creation.
    const { createDataSource }=await import('@so7ob/server'); const cleanup=await createDataSource().initialize();
    try {
      const requests=await cleanup.query('SELECT id,refCode,email,descriptionHash FROM ProjectRequest WHERE email LIKE ?',[prefix+'%']);
      for(const request of requests){
        const logs=await cleanup.query('SELECT id FROM EmailLog WHERE subject LIKE ?',['%'+request.refCode+'%']);
        for(const log of logs){await cleanup.query('DELETE FROM MailJob WHERE emailLogId=?',[log.id]);await cleanup.query('DELETE FROM EmailLog WHERE id=?',[log.id]);}
        await cleanup.query('DELETE FROM WebhookJob WHERE requestId=?',[request.id]);await cleanup.query('DELETE FROM OperationLock WHERE lockKey=?',[sha256('request-duplicate:'+request.email+':'+request.descriptionHash)]);
        await cleanup.query('DELETE FROM AuditLog WHERE entityId IN (?,?)',[request.id,request.refCode]);await cleanup.query('DELETE FROM Notification WHERE link=?',['/ar/admin/requests/'+request.id]);await cleanup.query('DELETE FROM RequestClaim WHERE requestId=?',[request.id]);await cleanup.query('DELETE FROM Attachment WHERE requestId=?',[request.id]);await cleanup.query('DELETE FROM ProjectRequest WHERE id=?',[request.id]);
      }
      const inquiries=await cleanup.query('SELECT id,refCode FROM Inquiry WHERE email LIKE ?',[prefix+'%']);for(const inquiry of inquiries){await cleanup.query('DELETE FROM AuditLog WHERE entityId=?',[inquiry.id]);await cleanup.query("DELETE FROM Notification WHERE type='new_inquiry' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref'))=?",[inquiry.refCode]);await cleanup.query('DELETE FROM Inquiry WHERE id=?',[inquiry.id]);}
      for(const key of ['request:'+sha256('ip:127.0.0.1'),'inquiry:127.0.0.1'])await cleanup.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256(key)]);
      await cleanup.query('DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?',[prefix+'%']); await cleanup.query('DELETE FROM EmailLog WHERE `to` LIKE ?',[prefix+'%']);
      await cleanup.query('DELETE FROM UserInvite WHERE email LIKE ?',[prefix+'%']);
      const users:Array<{id:string}>=await cleanup.query('SELECT id FROM User WHERE email LIKE ?',[prefix+'%']);
      for (const user of users) { await cleanup.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256('claim:'+user.id+':127.0.0.1')]); await cleanup.query('DELETE FROM MediaItem WHERE uploadedById=?',[user.id]); await cleanup.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256('account-inquiry:'+user.id)]); await cleanup.query('DELETE FROM AuditLog WHERE actorId=?',[user.id]); await cleanup.query('DELETE FROM UserInvite WHERE acceptedUserId=?',[user.id]); await cleanup.query('DELETE FROM User WHERE id=?',[user.id]); }
      for (const flow of ['register','login','forgot']) await cleanup.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256(flow+':127.0.0.1')]);
      await cleanup.query('DELETE FROM AuditLog WHERE ipHash=? AND actorId IS NULL',[sha256('ip:127.0.0.1')]);
      for (const role of createdRoles) if (!(await cleanup.query('SELECT id FROM User WHERE roleKey=?',[role])).length) await cleanup.query('DELETE FROM Role WHERE `key`=?',[role]);
    } finally { await cleanup.destroy(); }
  };
}
