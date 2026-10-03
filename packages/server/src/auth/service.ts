import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DataSource, QueryRunner } from 'typeorm';
import type { AuthUser, Permission } from '@so7ob/contracts';
import type { User } from '../database/models.js';
import { MailQueue } from '../queue/mail-queue.js';
import { PayloadCipher, type MailInput } from '../queue/crypto.js';
import { AuthFault, audit, consumeRateLimit, newId, sha256, transaction } from './persistence.js';
import { issueToken, consumeToken } from './tokens.js';
import { verifyEmailMail, resetPasswordMail } from './email-templates.js';
export interface AuthenticatedSession { user: AuthUser; id: string; fingerprint: string; expiresAt: Date }
export interface RegisterInput { name: string; email: string; password: string; locale: 'ar' | 'en' }
export const validPassword = (p: string): boolean => p.length >= 8 && p.length <= 100 && /[A-Za-z]/.test(p) && /\d/.test(p);
const limits = { shortMax: 3, shortWindowMs: 600000, dailyMax: 10, dailyWindowMs: 86400000 };
const opaqueFingerprint = (raw: string) => sha256('so7ob-opaque-session:v1:'+raw);
export class AuthenticationService {
  private readonly queue: MailQueue;
  private readonly attempts=new WeakMap<object,{flow:string;ip:string}>();
  constructor(private readonly db: DataSource, private readonly env: NodeJS.ProcessEnv = process.env) { this.queue = new MailQueue(db,new PayloadCipher(env.OUTBOX_KEY)); }
  private get dev(): boolean { return this.env.NODE_ENV !== 'production' && this.env.EMAIL_DEV_MODE === 'true'; }
  private absolute(path: string): string {
    if (!this.env.SITE_URL) throw new Error('SITE_URL is required');
    const base = new URL(this.env.SITE_URL); if (!['http:','https:'].includes(base.protocol)) throw new Error('Invalid SITE_URL'); return new URL(path,base.origin).href;
  }
  private async email(r: QueryRunner, mail: MailInput, key: string): Promise<string> {
    if (this.dev) { await r.query("INSERT INTO EmailLog(id,`to`,subject,bodyText,status) VALUES(?,?,?,'','dev_logged')",[newId(),mail.to,mail.subject]); return 'dev_logged'; }
    await this.queue.enqueue(r,mail,sha256(key)); return 'queued';
  }
  private async rate(flow: string, ip: string): Promise<void> {
    const result = await consumeRateLimit(this.db,flow+':'+ip,limits);
    if (!result.allowed) throw new AuthFault(429,'rate_limited',{ retryAfterSec:result.retryAfterSec });
  }
  async reserveAttempt(flow:'register'|'forgot',ip:string):Promise<object>{await this.rate(flow,ip);const permit={};this.attempts.set(permit,{flow,ip});return permit;}
  private async takeAttempt(flow:string,ip:string,permit?:object){const stored=permit?this.attempts.get(permit):undefined;if(stored?.flow===flow&&stored.ip===ip){this.attempts.delete(permit!);return;}await this.rate(flow,ip);}
  async register(input: RegisterInput, ip: string, permit?:object) {
    await this.takeAttempt('register',ip,permit);
    if (!validPassword(input.password)) throw new AuthFault(400,'invalid',{ errors:{ password: input.password.length<8 ? 'password_short' : input.password.length>100 ? 'password_long' : 'password_weak' } });
    const passwordHash = await bcrypt.hash(input.password,12);
    try {
      return await transaction(this.db,async r => {
        const user = { id:newId(), email:input.email };
        await r.query('INSERT INTO User(id,email,name,passwordHash,locale,roleKey,status) VALUES(?,?,?,?,?,\'client\',\'pending_verification\')',[user.id,input.email,input.name,passwordHash,input.locale]);
        const token = await issueToken(r,user.id,'email_verify');
        const url = this.absolute(`/api/auth/verify-email?token=${token.raw}&locale=${input.locale}`);
        const mail = verifyEmailMail(input.locale,{ url }); const emailStatus = await this.email(r,{ to:input.email,...mail },'email_verify:'+sha256(token.raw));
        await audit(r,'user.register',user,null,'user',user.id,ip);
        return { ok:true,emailStatus,...(this.dev ? { devVerifyUrl:url } : {}) };
      });
    } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new AuthFault(409,'invalid',{ errors:{ email:'email_taken' } }); throw error; }
  }
  async login(email: string, password: string, userAgent: string, ip: string) {
    // Additional network bound protects unknown-account bcrypt work across processes.
    const limit = await consumeRateLimit(this.db,'login:'+ip,{ shortMax:30,shortWindowMs:600000,dailyMax:200,dailyWindowMs:86400000 });
    if (!limit.allowed) throw new AuthFault(429,'rate_limited',{ retryAfterSec:limit.retryAfterSec });
    return transaction(this.db,async r => {
      const rows: User[] = await r.query('SELECT * FROM User WHERE email=? FOR UPDATE',[email.trim().toLowerCase()]); const user = rows[0];
      if (!user || !['active','pending_verification'].includes(user.status) || (user.lockedUntil && user.lockedUntil.valueOf()>Date.now())) return null;
      const valid = await bcrypt.compare(password,user.passwordHash);
      if (!valid) {
        const recent = user.failedLoginCount>0 && Date.now()-user.updatedAt.valueOf()<900000;
        const count = recent || user.failedLoginCount === 0 ? user.failedLoginCount+1 : 1;
        await r.query('UPDATE User SET failedLoginCount=?,lockedUntil=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[count,count>=5 ? new Date(Date.now()+900000) : null,user.id]);
        await audit(r,'user.login_failed',null,{ flow:'credentials' },'user',null,ip); return null;
      }
      await r.query('UPDATE User SET failedLoginCount=0,lockedUntil=NULL,lastLoginAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[user.id]);
      const raw = randomBytes(32).toString('hex'); const expiresAt = new Date(Date.now()+30*86400000); const id = newId();
      await r.query('INSERT INTO AuthSession(id,userId,fingerprint,userAgent,ipHash,expiresAt) VALUES(?,?,?,?,?,?)',[id,user.id,opaqueFingerprint(raw),userAgent.slice(0,500) || null,sha256('ip:'+ip),expiresAt]);
      await audit(r,'user.login',user,null,'user',user.id,ip);
      return { raw,expiresAt,user:{ id:user.id,email:user.email,name:user.name,roleKey:user.roleKey } };
    });
  }
  async session(raw: string | undefined): Promise<AuthenticatedSession | null> {
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const rows = await this.db.query(`SELECT s.id AS sessionId,s.fingerprint,s.expiresAt,u.id,u.email,u.name,u.roleKey,u.status,u.locale,u.emailVerifiedAt,r.permissions
      FROM AuthSession s JOIN User u ON u.id=s.userId JOIN Role r ON r.\`key\`=u.roleKey
      WHERE s.fingerprint=? AND s.revokedAt IS NULL AND s.expiresAt>UTC_TIMESTAMP(3)
      AND u.status IN ('active','pending_verification') AND (u.sessionsRevokedAt IS NULL OR s.createdAt>u.sessionsRevokedAt)`,[opaqueFingerprint(raw)]);
    if (!rows.length) return null; const row = rows[0];
    let permissions: Permission[] = []; try { const parsed: unknown = JSON.parse(row.permissions); if (Array.isArray(parsed) && parsed.every(p => typeof p === 'string')) permissions = parsed as Permission[]; } catch { /* corrupt permissions fail closed */ }
    await this.db.query('UPDATE AuthSession SET lastSeenAt=UTC_TIMESTAMP(3) WHERE id=? AND lastSeenAt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)',[row.sessionId]);
    return { id:row.sessionId,fingerprint:row.fingerprint,expiresAt:row.expiresAt,user:{ id:row.id,email:row.email,name:row.name,roleKey:row.roleKey,status:row.status,locale:row.locale,emailVerified:!!row.emailVerifiedAt,permissions } };
  }
  async logout(raw: string | undefined): Promise<void> {
    const current = await this.session(raw); if (!current) return;
    await transaction(this.db, async r => { await r.query("UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='user_logout' WHERE id=? AND revokedAt IS NULL",[current.id]); await audit(r,'user.logout',current.user); });
  }
  async verifyEmail(raw: string): Promise<'invalid' | 'ok' | 'already'> {
    return transaction(this.db,async r => {
      const id = await consumeToken(r,raw,'email_verify'); if (!id) return 'invalid';
      const [user]: User[] = await r.query('SELECT * FROM User WHERE id=? FOR UPDATE',[id]); const already = !!user.emailVerifiedAt;
      if (!already) await r.query("UPDATE User SET emailVerifiedAt=UTC_TIMESTAMP(3),status=IF(status='pending_verification','active',status),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",[id]);
      await audit(r,'user.email_verified',user); return already ? 'already' : 'ok';
    });
  }
  async forgot(email: string, ip: string, permit?:object) {
    await this.takeAttempt('forgot',ip,permit); const generic = { ok:true,message:'if_account_exists' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return generic;
    return transaction(this.db,async r => {
      const [user]: User[] = await r.query('SELECT * FROM User WHERE email=? FOR UPDATE',[email]);
      if (!user || user.status === 'suspended') { await audit(r,'user.login_failed',null,{ flow:'forgot_password',emailHint:'not_found' },'user',null,ip); return generic; }
      const token = await issueToken(r,user.id,'password_reset'); const url = this.absolute(`/${user.locale}/auth/reset-password?token=${token.raw}`);
      const status = await this.email(r,{ to:user.email,...resetPasswordMail(user.locale,{ url }) },'password_reset:'+sha256(token.raw));
      await audit(r,'user.password_reset',user,{ stage:'requested',emailStatus:status },'user',user.id,ip);
      return { ...generic,...(this.dev ? { devResetUrl:url } : {}) };
    });
  }
  async reset(raw: string, password: string): Promise<void> {
    if (!validPassword(password)) throw new AuthFault(400,'invalid',{ errors:{ password:'password_weak' } });
    if (!/^[a-f0-9]{64}$/.test(raw) || !(await this.db.query("SELECT t.id FROM AuthToken t JOIN User u ON u.id=t.userId WHERE t.tokenHash=? AND t.type='password_reset' AND t.usedAt IS NULL AND t.expiresAt>UTC_TIMESTAMP(3) AND u.status<>'suspended'",[sha256(raw)])).length) throw new AuthFault(400,'invalid_token');
    const passwordHash = await bcrypt.hash(password,12);
    await transaction(this.db,async r => {
      const id = await consumeToken(r,raw,'password_reset'); if (!id) throw new AuthFault(400,'invalid_token');
      await r.query('UPDATE User SET passwordHash=?,sessionsRevokedAt=UTC_TIMESTAMP(3),failedLoginCount=0,lockedUntil=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[passwordHash,id]);
      await r.query("UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='password_reset' WHERE userId=? AND revokedAt IS NULL",[id]);
      const [user]: User[] = await r.query('SELECT id,email FROM User WHERE id=?',[id]); await audit(r,'user.password_reset',user,{ stage:'completed' });
    });
  }
  private async activeInTransaction(r: QueryRunner, current: AuthenticatedSession): Promise<User> {
    const [user]: User[] = await r.query(`SELECT u.* FROM User u JOIN AuthSession s ON s.userId=u.id
      WHERE u.id=? AND s.id=? AND s.fingerprint=? AND s.revokedAt IS NULL AND s.expiresAt>UTC_TIMESTAMP(3)
      AND u.status IN ('active','pending_verification') AND (u.sessionsRevokedAt IS NULL OR s.createdAt>u.sessionsRevokedAt) FOR UPDATE`,[current.user.id,current.id,current.fingerprint]);
    if (!user) throw new AuthFault(401,'unauthorized'); return user;
  }
  async changePassword(current: AuthenticatedSession, oldPassword: string, newPassword: string): Promise<void> {
    if (!validPassword(newPassword)) throw new AuthFault(400,'invalid',{ errors:{ newPassword:'password_weak' } });
    await transaction(this.db,async r => {
      const user = await this.activeInTransaction(r,current);
      if (!await bcrypt.compare(oldPassword,user.passwordHash)) throw new AuthFault(400,'invalid',{ errors:{ currentPassword:'wrong_password' } });
      if (oldPassword === newPassword) throw new AuthFault(400,'invalid',{ errors:{ newPassword:'same_password' } });
      const hash = await bcrypt.hash(newPassword,12);
      await r.query('UPDATE User SET passwordHash=?,sessionsRevokedAt=UTC_TIMESTAMP(3),failedLoginCount=0,lockedUntil=NULL,updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[hash,user.id]);
      await r.query("UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='password_changed' WHERE userId=? AND revokedAt IS NULL",[user.id]);
      await audit(r,'user.password_changed',user);
    });
  }
  async acceptInvite(raw: string, name: string, password: string): Promise<void> {
    if (!validPassword(password)) throw new AuthFault(400,'invalid',{ errors:{ password:'password_weak' } });
    if (!/^[a-f0-9]{64}$/.test(raw) || !(await this.db.query('SELECT id FROM UserInvite WHERE tokenHash=? AND acceptedAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)',[sha256(raw)])).length) throw new AuthFault(400,'invalid_token');
    const passwordHash = await bcrypt.hash(password,12);
    try {
      await transaction(this.db,async r => {
        const changed = await r.query('UPDATE UserInvite SET acceptedAt=UTC_TIMESTAMP(3) WHERE tokenHash=? AND acceptedAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)',[sha256(raw)]);
        if (changed.affectedRows !== 1) throw new AuthFault(400,'invalid_token');
        const [invite] = await r.query('SELECT * FROM UserInvite WHERE tokenHash=?',[sha256(raw)]); const id = newId();
        await r.query("INSERT INTO User(id,email,name,passwordHash,locale,roleKey,status,emailVerifiedAt) VALUES(?,?,?,?,'ar',?,'active',UTC_TIMESTAMP(3))",[id,invite.email,name,passwordHash,invite.roleKey]);
        await r.query('UPDATE UserInvite SET acceptedUserId=? WHERE id=?',[id,invite.id]); await audit(r,'user.invite_accepted',{ id,email:invite.email },{ roleKey:invite.roleKey });
      });
    } catch(error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new AuthFault(409,'email_taken'); throw error; }
  }
  async sessions(current: AuthenticatedSession) {
    const rows = await this.db.query('SELECT id,fingerprint,userAgent,createdAt,lastSeenAt FROM AuthSession WHERE userId=? AND revokedAt IS NULL AND expiresAt>UTC_TIMESTAMP(3) ORDER BY lastSeenAt DESC',[current.user.id]);
    return rows.map((row: { id:string; fingerprint:string; userAgent:string|null; createdAt:Date; lastSeenAt:Date }) => ({ id:row.id,current:row.id===current.id,userAgent:row.userAgent,createdAt:row.createdAt,lastSeenAt:row.lastSeenAt }));
  }
  async revoke(current: AuthenticatedSession, id: string | undefined, all: boolean) {
    return transaction(this.db,async r => {
      await this.activeInTransaction(r,current);
      if (all) {
        const result = await r.query("UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='user_revoke_all' WHERE userId=? AND revokedAt IS NULL AND id<>?",[current.user.id,current.id]);
        // Preserve actual source semantics: the global cutoff also invalidates the current login.
        await r.query('UPDATE User SET sessionsRevokedAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?',[current.user.id]); await audit(r,'sessions.revoked_all',current.user,{ count:result.affectedRows });
        return { ok:true,revoked:result.affectedRows };
      }
      if (!id) throw new AuthFault(400,'invalid');
      const [target] = await r.query('SELECT id FROM AuthSession WHERE id=? AND userId=? FOR UPDATE',[id,current.user.id]); if (!target) throw new AuthFault(404,'not_found');
      await r.query("UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='user_revoke' WHERE id=?",[id]); await audit(r,'session.revoked',current.user,{ current:id===current.id },'auth_session',id);
      return { ok:true,currentRevoked:id===current.id };
    });
  }
}
