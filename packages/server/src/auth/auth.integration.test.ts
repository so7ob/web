import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createDataSource } from '../database/data-source.js';
import { AuthenticationService } from './service.js';
import { audit, consumeRateLimit, sha256, transaction } from './persistence.js';
import { issueToken, consumeToken } from './tokens.js';
import { PayloadCipher } from '../queue/crypto.js';
const name=process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name)) throw new Error('Real isolated MariaDB required');
const db=createDataSource({ ...process.env,DATABASE_NAME:name }); const prefix='auth'+randomBytes(8).toString('hex');
const key=randomBytes(32).toString('hex'); const cipher=new PayloadCipher(key);
const auth=new AuthenticationService(db,{ NODE_ENV:'production',SITE_URL:'https://isolated.example.invalid',OUTBOX_KEY:key,EMAIL_DEV_MODE:'true' });
const password='Synthetic-Password-4829'; let hash=''; let createdRole=false;
const ip=(flow:string)=>prefix+'-'+flow; const email=(flow:string)=>prefix+'-'+flow+'@example.invalid';
async function tokenFromMail(recipient:string):Promise<string> {
  const [job]=await db.query('SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=? ORDER BY j.createdAt DESC',[recipient]);
  return new URL(cipher.decrypt(job.payload,job.id).text.match(/https:\/\/[^\s]+/)![0]).searchParams.get('token')!;
}
beforeAll(async()=>{
  await db.initialize(); await db.runMigrations(); hash=await bcrypt.hash(password,12);
  if (!(await db.query("SELECT `key` FROM Role WHERE `key`='client'")).length) { await db.query("INSERT INTO Role (`key`,nameAr,nameEn,permissions) VALUES('client','العميل','Client','[]')"); createdRole=true; }
  for (const suffix of ['login','other','reset','change','legacy']) await db.query("INSERT INTO User(id,email,passwordHash,name,roleKey,status,emailVerifiedAt) VALUES(?,?,?,?,'client','active',UTC_TIMESTAMP(3))",[prefix+suffix,email(suffix),hash,'Synthetic']);
},30000);
afterAll(async()=>{
  if (db.isInitialized) {
    await db.query('DROP TRIGGER IF EXISTS so7ob_test_auth_queue_failure');
    await db.query('DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?',[prefix+'%']);
    await db.query('DELETE FROM EmailLog WHERE `to` LIKE ?',[prefix+'%']);
    const users:Array<{id:string}>=await db.query('SELECT id FROM User WHERE email LIKE ?',[prefix+'%']);
    for (const user of users) { await db.query('DELETE FROM AuditLog WHERE actorId=?',[user.id]); await db.query('DELETE FROM UserInvite WHERE acceptedUserId=?',[user.id]); await db.query('DELETE FROM User WHERE id=?',[user.id]); }
    await db.query('DELETE FROM UserInvite WHERE email LIKE ?',[prefix+'%']);
    for (const flow of ['register','register-failure','login','concurrent','reset','change','legacy','forgot','limit']) {
      await db.query('DELETE FROM AuditLog WHERE ipHash=?',[sha256('ip:'+ip(flow))]);
      for (const operation of ['register','login','forgot','test']) await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[sha256(operation+':'+ip(flow))]);
    }
    if (createdRole) await db.query("DELETE FROM Role WHERE `key`='client'"); await db.destroy();
  }
});
describe('Nest authentication persistence on real MariaDB', { concurrent:false },()=>{
  it('registers only a pending client and commits an encrypted mail job without exposing a production URL',async()=>{
    const result=await auth.register({ name:'عميل اصطناعي',email:email('register'),password,locale:'ar' },ip('register'));
    expect(result).toEqual({ ok:true,emailStatus:'queued' });
    const [user]=await db.query('SELECT * FROM User WHERE email=?',[email('register')]); expect(user.roleKey).toBe('client'); expect(user.status).toBe('pending_verification'); expect(await bcrypt.compare(password,user.passwordHash)).toBe(true);
    const token=await tokenFromMail(email('register'));
    const statuses=await Promise.all([auth.verifyEmail(token),auth.verifyEmail(token)]); expect(statuses.sort()).toEqual(['invalid','ok']);
    expect((await db.query('SELECT status FROM User WHERE email=?',[email('register')]))[0].status).toBe('active');
    await expect(auth.register({ name:'Duplicate',email:email('register'),password,locale:'ar' },ip('register'))).rejects.toMatchObject({status:409});
  });
  it('rolls account, token and email metadata back when transactional enqueue fails',async()=>{
    await db.query("CREATE TRIGGER so7ob_test_auth_queue_failure BEFORE INSERT ON MailJob FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic queue outage'");
    try { await expect(auth.register({ name:'Rollback',email:email('register-failure'),password,locale:'en' },ip('register-failure'))).rejects.toThrow('Synthetic queue outage'); }
    finally { await db.query('DROP TRIGGER so7ob_test_auth_queue_failure'); }
    expect(await db.query('SELECT id FROM User WHERE email=?',[email('register-failure')])).toEqual([]); expect(await db.query('SELECT id FROM EmailLog WHERE `to`=?',[email('register-failure')])).toEqual([]);
  });
  it('preserves bcrypt login, rejects legacy cookies, invalidates logout and never returns password hashes',async()=>{
    const logged=await auth.login(email('login'),password,'Synthetic Browser',ip('login')); expect(logged).not.toBeNull();
    const current=await auth.session(logged!.raw); expect(current?.user.id).toBe(prefix+'login'); expect(JSON.stringify(current)).not.toContain(hash); expect(current?.user.permissions).toEqual([]);
    await db.query('INSERT INTO AuthSession(id,userId,fingerprint,expiresAt) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY))',[prefix+'old',prefix+'legacy',sha256('session:'+prefix+'legacy:1728000000')]);
    expect(await auth.session('legacy.jwt.cookie')).toBeNull(); expect(await auth.session('a'.repeat(64))).toBeNull();
    const migratedLogin=await auth.login(email('legacy'),password,'Synthetic browser',ip('legacy'));const migratedCurrent=await auth.session(migratedLogin!.raw);expect((await auth.sessions(migratedCurrent!)).map(row=>row.id)).toEqual([migratedCurrent!.id]);expect((await db.query('SELECT revokedAt FROM AuthSession WHERE id=?',[prefix+'old']))[0].revokedAt).toBeNull();
    await auth.logout(logged!.raw); expect(await auth.session(logged!.raw)).toBeNull();
  });
  it('serializes five simultaneous failures into a temporary account lock',async()=>{
    const attempts=await Promise.all(Array.from({length:5},()=>auth.login(email('other'),'wrong','Synthetic',ip('concurrent')))); expect(attempts).toEqual([null,null,null,null,null]);
    const [row]=await db.query('SELECT failedLoginCount,lockedUntil FROM User WHERE id=?',[prefix+'other']); expect(row.failedLoginCount).toBe(5); expect(row.lockedUntil.valueOf()).toBeGreaterThan(Date.now());
    expect(await auth.login(email('other'),password,'Synthetic',ip('concurrent'))).toBeNull();
  });
  it('enforces the shared sliding window under concurrent connections',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>consumeRateLimit(db,'test:'+ip('limit'),{shortMax:3,shortWindowMs:600000,dailyMax:10,dailyWindowMs:86400000})));
    expect(results.filter(r=>r.allowed)).toHaveLength(3); expect(results.filter(r=>!r.allowed).every(r=>r.retryAfterSec>0)).toBe(true);
  });
  it('keeps forgot-password responses generic and resets a token once while revoking every session',async()=>{
    const logged=await auth.login(email('reset'),password,'Synthetic',ip('reset'));
    const known=await auth.forgot(email('reset'),ip('forgot')); const missing=await auth.forgot(email('unknown'),ip('forgot')); expect(known).toEqual(missing);
    const token=await tokenFromMail(email('reset')); const results=await Promise.allSettled([auth.reset(token,'New-Synthetic-5930'),auth.reset(token,'New-Synthetic-5930')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(await auth.session(logged!.raw)).toBeNull();
    expect(await auth.login(email('reset'),password,'Synthetic',ip('reset'))).toBeNull(); expect(await auth.login(email('reset'),'New-Synthetic-5930','Synthetic',ip('reset'))).not.toBeNull();
  });
  it('does not consume expired, used, suspended or wrongly scoped claim tokens',async()=>{
    const issued=await transaction(db,r=>issueToken(r,prefix+'legacy','request_claim','request-a'));
    expect(await transaction(db,r=>consumeToken(r,issued.raw,'request_claim',{userId:prefix+'legacy',resourceId:'request-b'}))).toBeNull();
    expect(await transaction(db,r=>consumeToken(r,issued.raw,'request_claim',{userId:prefix+'login',resourceId:'request-a'}))).toBeNull();
    await db.query("UPDATE User SET status='suspended' WHERE id=?",[prefix+'legacy']);
    expect(await transaction(db,r=>consumeToken(r,issued.raw,'request_claim',{userId:prefix+'legacy',resourceId:'request-a'}))).toBeNull();
    await db.query("UPDATE User SET status='active' WHERE id=?",[prefix+'legacy']);
    await db.query('UPDATE AuthToken SET expiresAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE tokenHash=?',[sha256(issued.raw)]);
    expect(await transaction(db,r=>consumeToken(r,issued.raw,'request_claim',{userId:prefix+'legacy',resourceId:'request-a'}))).toBeNull();
    const fresh=await transaction(db,r=>issueToken(r,prefix+'legacy','request_claim','request-a'));
    expect(await transaction(db,r=>consumeToken(r,fresh.raw,'request_claim',{userId:prefix+'legacy',resourceId:'request-a'}))).toBe(prefix+'legacy');
    expect(await transaction(db,r=>consumeToken(r,fresh.raw,'request_claim',{userId:prefix+'legacy',resourceId:'request-a'}))).toBeNull();
  });
  it('checks session ownership and revokes all sessions on a verified password change',async()=>{
    const one=await auth.login(email('change'),password,'One',ip('change')); const two=await auth.login(email('change'),password,'Two',ip('change')); const current=(await auth.session(one!.raw))!;
    const foreign=await auth.login(email('login'),password,'Other user',ip('login')); const other=(await auth.session(foreign!.raw))!;
    await expect(auth.revoke(current,other.id,false)).rejects.toMatchObject({status:404}); expect(await auth.session(foreign!.raw)).not.toBeNull();
    await expect(auth.changePassword(current,'wrong','New-Synthetic-4829')).rejects.toMatchObject({status:400}); expect(await auth.session(one!.raw)).not.toBeNull();
    await auth.changePassword(current,password,'New-Synthetic-4829'); expect(await auth.session(one!.raw)).toBeNull(); expect(await auth.session(two!.raw)).toBeNull();
  });
  it('atomically accepts one invite and preserves the invited role rather than a client-selected role',async()=>{
    const token=randomBytes(32).toString('hex'); await db.query("INSERT INTO UserInvite(id,email,roleKey,tokenHash,expiresAt) VALUES(?,?,'client',?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY))",[prefix+'invite',email('invite'),sha256(token)]);
    const results=await Promise.allSettled([auth.acceptInvite(token,'Invited',password),auth.acceptInvite(token,'Invited',password)]); expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const [row]=await db.query('SELECT roleKey,status,emailVerifiedAt FROM User WHERE email=?',[email('invite')]); expect(row.roleKey).toBe('client'); expect(row.status).toBe('active'); expect(row.emailVerifiedAt).toBeInstanceOf(Date);
  });
  it('keeps audit writes in the same transaction',async()=>{
    await expect(transaction(db,async r=>{ await audit(r,'synthetic.rollback',{id:prefix+'legacy',email:email('legacy')}); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await db.query("SELECT id FROM AuditLog WHERE actorId=? AND action='synthetic.rollback'",[prefix+'legacy'])).toEqual([]);
  });
});
