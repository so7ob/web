import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthenticationService, AuthFault } from '@so7ob/server';
import { requestAttempt } from './attempts.js';
import { AuthHttpPolicy } from './policy.js';
import { RegisterDto, LoginDto, ForgotDto, ResetDto, ChangePasswordDto, InviteDto, RevokeDto, SignoutDto } from './dto.js';
@ApiTags('Authentication')
@Controller(['api/auth','api/v1/auth'])
@UsePipes(new ValidationPipe({ transform:true,whitelist:true,forbidNonWhitelisted:false,exceptionFactory: errors=>new AuthFault(400,'invalid',{ errors:Object.fromEntries(errors.map(e=>[e.property,Object.values(e.constraints ?? {})[0] ?? 'invalid'])) }) }))
export class AuthController {
  constructor(@Inject(AuthenticationService) private readonly auth:AuthenticationService, @Inject(AuthHttpPolicy) private readonly policy:AuthHttpPolicy) {}
  private raw(req:Request) { return this.policy.cookie(req,this.policy.sessionCookie); }
  private async required(req:Request) { const current=await this.auth.session(this.raw(req)); if (!current) throw new AuthFault(401,'unauthorized'); return current; }
  @Get('providers') providers() {
    const origin=new URL(process.env.SITE_URL!).origin;
    return { credentials:{ id:'credentials',name:'so7ob',type:'credentials',signinUrl:origin+'/api/auth/signin/credentials',callbackUrl:origin+'/api/auth/callback/credentials' } };
  }
  @Get(['signin','signin/credentials']) signin(@Query('callbackUrl') callbackUrl:unknown,@Query('locale') locale:unknown,@Res() res:Response) {
    const target=new URL(this.policy.callback(callbackUrl));
    const language=locale==='en'||target.pathname.startsWith('/en/')?'en':'ar';
    res.setHeader('Cache-Control','no-store');
    res.redirect(302,`/${language}/auth/login?next=${encodeURIComponent(target.pathname+target.search+target.hash)}`);
  }
  @Get('signout') confirmSignout(@Req() req:Request,@Query('callbackUrl') callbackUrl:unknown,@Query('locale') locale:unknown,@Res() res:Response) {
    const target=this.policy.callback(callbackUrl),token=this.policy.csrf(res),en=locale==='en';
    const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
    const label=en?'Sign out':'تسجيل الخروج';
    res.setHeader('Cache-Control','no-store');
    res.type('html').send(`<!doctype html><html lang="${en?'en':'ar'}" dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} — سُحُب</title></head><body><main><h1>${label}</h1><p>${en?'Are you sure you want to sign out?':'هل تريد تسجيل الخروج؟'}</p><form method="post" action="${req.path.startsWith('/api/v1/')?'/api/v1/auth/signout':'/api/auth/signout'}"><input type="hidden" name="csrfToken" value="${token}"><input type="hidden" name="callbackUrl" value="${escape(target)}"><button type="submit">${label}</button></form></main></body></html>`);
  }
  @Get('csrf') csrf(@Res() res:Response) { res.setHeader('Cache-Control','no-store'); res.json({ csrfToken:this.policy.csrf(res) }); }
  @Get('session') async session(@Req() req:Request,@Res() res:Response) {
    res.setHeader('Cache-Control','no-store'); const current=await this.auth.session(this.raw(req));
    res.json(current ? { user:{ id:current.user.id,email:current.user.email,name:current.user.name,roleKey:current.user.roleKey },expires:current.expiresAt.toISOString() } : {});
  }
  @HttpCode(200) @Post(['callback/credentials','login']) async login(@Req() req:Request,@Body() body:LoginDto,@Res() res:Response) {
    this.policy.mutation(req,true); res.setHeader('Cache-Control','no-store');
    const logged=await this.auth.login(body.email,body.password,req.headers['user-agent'] ?? '',req.ip ?? 'unknown');
    if (!logged) { const url=new URL('/api/auth/error?error=CredentialsSignin',process.env.SITE_URL).href; if(req.is('application/x-www-form-urlencoded')&&body.json!=='true')res.redirect(302,url);else res.status(401).json({ url }); return; }
    this.policy.setSession(res,logged.raw,logged.expiresAt); const url=this.policy.callback(body.callbackUrl);
    if(req.is('application/x-www-form-urlencoded')&&body.json!=='true'){res.redirect(302,url);return;}
    res.json({ url });
  }
  @Get('verify-request') verifyRequest(@Query('locale') locale:unknown,@Res() res:Response) {
    const en=locale==='en';this.notice(res,en,200,en?'Check your email':'تحقق من بريدك الإلكتروني',en?'Check your inbox for the verification link.':'تحقق من صندوق بريدك بحثًا عن رابط التحقق.');
  }
  @Get('error') error(@Query('error') error:unknown,@Query('locale') locale:unknown,@Res() res:Response) {
    const en=locale==='en',code=typeof error==='string'?error.toLowerCase():'';
    if(['signin','oauthsignin','oauthcallback','oauthcreateaccount','emailcreateaccount','callback','oauthaccountnotlinked','emailsignin','credentialssignin','sessionrequired'].includes(code)){
      res.setHeader('Cache-Control','no-store');res.redirect(302,`/${en?'en':'ar'}/auth/login?error=${encodeURIComponent(String(error))}`);return;
    }
    const status=code==='configuration'?500:['accessdenied','verification'].includes(code)?403:200;
    const title=code==='configuration'?(en?'Server error':'خطأ في الخادم'):code==='accessdenied'?(en?'Access Denied':'الوصول غير مسموح'):code==='verification'?(en?'Unable to sign in':'تعذر تسجيل الدخول'):(en?'Error':'خطأ');
    this.notice(res,en,status,title,code==='verification'?(en?'The sign in link is no longer valid.':'رابط تسجيل الدخول لم يعد صالحًا.'):(en?'Please return to sign in.':'يرجى العودة إلى تسجيل الدخول.'));
  }
  private notice(res:Response,en:boolean,status:number,title:string,message:string){
    res.setHeader('Cache-Control','no-store');res.status(status).type('html').send(`<!doctype html><html lang="${en?'en':'ar'}" dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — سُحُب</title></head><body><main><h1>${title}</h1><p>${message}</p><a href="/${en?'en':'ar'}/auth/login">${en?'Sign in':'تسجيل الدخول'}</a></main></body></html>`);
  }
  @HttpCode(200) @Post('signout') async signout(@Req() req:Request,@Body() body:SignoutDto,@Res() res:Response) { this.policy.mutation(req,true); await this.auth.logout(this.raw(req)); this.policy.clearSession(res); const url=this.policy.callback(body.callbackUrl);if(req.is('application/x-www-form-urlencoded')&&body.json!=='true')res.redirect(302,url);else res.json({ url }); }
  @HttpCode(200) @Post('register') async register(@Req() req:Request,@Body() body:RegisterDto,@Res() res:Response) { this.policy.mutation(req); res.status(201).json(await this.auth.register(body,req.ip ?? 'unknown',requestAttempt(req))); }
  @Get('verify-email') async verify(@Query('token') token:string|undefined,@Query('locale') locale:string|undefined,@Res() res:Response) {
    const status=await this.auth.verifyEmail(typeof token==='string'?token:''); res.redirect(307,`/${locale==='en'?'en':'ar'}/auth/verified?status=${status}`);
  }
  @HttpCode(200) @Post('forgot-password') async forgot(@Req() req:Request,@Body() body:ForgotDto,@Res() res:Response) { this.policy.mutation(req); res.json(await this.auth.forgot(body.email,req.ip ?? 'unknown',requestAttempt(req))); }
  @HttpCode(200) @Post('reset-password') async reset(@Req() req:Request,@Body() body:ResetDto,@Res() res:Response) { this.policy.mutation(req); await this.auth.reset(body.token,body.password); res.json({ ok:true }); }
  @HttpCode(200) @Post('change-password') async change(@Req() req:Request,@Body() body:ChangePasswordDto,@Res() res:Response) { this.policy.mutation(req); await this.auth.changePassword(await this.required(req),body.currentPassword,body.newPassword); this.policy.clearSession(res); res.json({ ok:true,signedOut:true }); }
  @HttpCode(200) @Post('invite') async invite(@Req() req:Request,@Body() body:InviteDto,@Res() res:Response) { this.policy.mutation(req); await this.auth.acceptInvite(body.token,body.name,body.password); res.status(201).json({ ok:true }); }
  @Get('sessions') async sessions(@Req() req:Request,@Res() res:Response) { res.setHeader('Cache-Control','no-store'); res.json({ ok:true,sessions:await this.auth.sessions(await this.required(req)) }); }
  @HttpCode(200) @Post('sessions') async revoke(@Req() req:Request,@Body() body:RevokeDto,@Res() res:Response) { this.policy.mutation(req); res.json(await this.auth.revoke(await this.required(req),body.id,body.all===true)); }
}
