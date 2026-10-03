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
  @Get('csrf') csrf(@Res() res:Response) { res.setHeader('Cache-Control','no-store'); res.json({ csrfToken:this.policy.csrf(res) }); }
  @Get('session') async session(@Req() req:Request,@Res() res:Response) {
    res.setHeader('Cache-Control','no-store'); const current=await this.auth.session(this.raw(req));
    res.json(current ? { user:{ id:current.user.id,email:current.user.email,name:current.user.name,roleKey:current.user.roleKey },expires:current.expiresAt.toISOString() } : {});
  }
  @HttpCode(200) @Post(['callback/credentials','login']) async login(@Req() req:Request,@Body() body:LoginDto,@Res() res:Response) {
    this.policy.mutation(req,true); res.setHeader('Cache-Control','no-store');
    const logged=await this.auth.login(body.email,body.password,req.headers['user-agent'] ?? '',req.ip ?? 'unknown');
    if (!logged) { res.status(401).json({ url:new URL('/api/auth/error?error=CredentialsSignin',process.env.SITE_URL).href }); return; }
    this.policy.setSession(res,logged.raw,logged.expiresAt); res.json({ url:this.policy.callback(body.callbackUrl) });
  }
  @Get('error') error(@Res() res:Response) { res.redirect(307,'/ar/auth/login?error=CredentialsSignin'); }
  @HttpCode(200) @Post('signout') async signout(@Req() req:Request,@Body() body:SignoutDto,@Res() res:Response) { this.policy.mutation(req,true); await this.auth.logout(this.raw(req)); this.policy.clearSession(res); res.json({ url:this.policy.callback(body.callbackUrl) }); }
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
