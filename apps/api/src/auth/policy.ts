import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthFault } from '@so7ob/server';
export class AuthHttpPolicy {
  private readonly secret: string;
  private readonly secure: boolean;
  readonly sessionCookie: string;
  readonly csrfCookie: string;
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length<32 || env.AUTH_SECRET.startsWith('replace-')) throw new Error('An independent AUTH_SECRET of at least 32 characters is required');
    if (!env.SITE_URL) throw new Error('SITE_URL is required');
    this.secret=env.AUTH_SECRET; this.secure=env.NODE_ENV==='production'; this.sessionCookie=this.secure?'__Host-so7ob.session':'so7ob.session'; this.csrfCookie=this.secure?'__Host-so7ob.csrf':'so7ob.csrf';
  }
  cookie(req: Request, name: string): string | undefined {
    const found = (req.headers.cookie ?? '').split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='));
    if (!found) return; try { return decodeURIComponent(found.slice(name.length+1)); } catch { return; }
  }
  setSession(res: Response, raw: string, expires: Date): void { res.cookie(this.sessionCookie,raw,{ httpOnly:true,secure:this.secure,sameSite:'lax',path:'/',expires }); }
  clearSession(res: Response): void { res.clearCookie(this.sessionCookie,{ httpOnly:true,secure:this.secure,sameSite:'lax',path:'/' }); }
  private sign(value: string): string { return createHmac('sha256',this.secret).update('csrf:v1:'+value).digest('hex'); }
  csrf(res: Response): string {
    const raw=randomBytes(32).toString('hex'); const content=raw+'.'+Date.now();
    res.cookie(this.csrfCookie,content+'.'+this.sign(content),{ httpOnly:true,secure:this.secure,sameSite:'lax',path:'/',maxAge:3600000 }); return raw;
  }
  validCsrf(req: Request, raw: unknown): boolean {
    if (typeof raw!=='string' || !/^[a-f0-9]{64}$/.test(raw)) return false;
    const parts=this.cookie(req,this.csrfCookie)?.split('.'); if (!parts || parts.length!==3 || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
    const timestamp=Number(parts[1]); if (!Number.isFinite(timestamp) || Date.now()-timestamp>3600000 || timestamp>Date.now()) return false;
    const expected=this.sign(parts[0]+'.'+parts[1]);
    return parts[0]===raw && timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(parts[2],'hex'));
  }
  mutation(req: Request, requireToken=false): void {
    const origin=req.headers.origin;
    if (origin) {
      const allowed=(this.env.WEB_ORIGIN ?? this.env.SITE_URL!).split(',').map(s=>new URL(s.trim()).origin);
      if (!allowed.includes(origin)) throw new AuthFault(403,'bad_origin');
    }
    if (req.headers['sec-fetch-site']==='cross-site') throw new AuthFault(403,'bad_origin');
    const token=req.headers['x-csrf-token'] ?? (req.body as { csrfToken?: unknown } | undefined)?.csrfToken;
    if ((requireToken || !origin) && !this.validCsrf(req,token)) throw new AuthFault(403,'csrf');
  }
  callback(value: unknown): string {
    const origin=new URL(this.env.SITE_URL!).origin;
    try { const url=new URL(typeof value==='string'?value:'/ar/account',origin); if (url.origin===origin && ['http:','https:'].includes(url.protocol)) return url.href; } catch { /* fail closed */ }
    return origin+'/ar/account';
  }
}
