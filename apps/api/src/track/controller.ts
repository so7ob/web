import {Body,Controller,Get,HttpCode,Inject,Post,Query,Req,Res,UseGuards} from '@nestjs/common';
import {ApiPropertyOptional,ApiTags} from '@nestjs/swagger';
import {Allow} from 'class-validator';
import type {Request,Response,NextFunction} from 'express';
import type {DataSource} from 'typeorm';
import type {AuthUser,TrackScope} from '@so7ob/contracts';
import {TrackService,AuthenticationService,AuthFault,consumeRateLimit,TRACK_COOKIE_NAME,TRACK_SESSION_TTL_SEC,createTrackSessionValue,verifyTrackSessionValue} from '@so7ob/server';
import {AuthHttpPolicy} from '../auth/policy.js';
import {AccountGuard} from '../business/controller.js';
class TrackInput {
 @ApiPropertyOptional({enum:['request','inquiry']}) @Allow() scope?:unknown;
 @ApiPropertyOptional({type:String,maxLength:64}) @Allow() id?:unknown;
 @ApiPropertyOptional({type:String,maxLength:128}) @Allow() token?:unknown;
 @ApiPropertyOptional({type:String,maxLength:5000}) @Allow() body?:unknown;
 @ApiPropertyOptional({enum:['renew','revoke','policy']}) @Allow() action?:unknown;
 @ApiPropertyOptional({type:String,maxLength:200}) @Allow() reason?:unknown;
 @ApiPropertyOptional({enum:['inherit','login_required','link_view','link_reply','link_view_login_reply']}) @Allow() mode?:unknown;
}
function cardInput(value:TrackInput):{scope:TrackScope;id:string}{
 if((value.scope!=='request'&&value.scope!=='inquiry')||typeof value.id!=='string'||!value.id||value.id.length>64)throw new AuthFault(400,'invalid');return {scope:value.scope,id:value.id};
}
function privateHeaders(res:Response){res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});}
/** Count malformed attempts before body parsing, using the shared MariaDB quota and trusted proxy IP. */
export function trackAttemptMiddleware(db:DataSource,policy:AuthHttpPolicy){
 return async(req:Request,res:Response,next:NextFunction)=>{
  const path=/^\/api\/(?:v1\/)?(?:admin\/)?track(?:\/([^/]+))?\/?$/.exec(req.path);if(!path)return next();privateHeaders(res);
  if(req.method!=='POST'||!['exchange','reply'].includes(path[1]??''))return next();
  try{
   policy.origin(req);const exchange=path[1]==='exchange';
   const result=await consumeRateLimit(db,(exchange?'track-ex:':'track-rp:')+(req.ip??'unknown'),{shortMax:exchange?10:5,shortWindowMs:600000,dailyMax:exchange?60:30,dailyWindowMs:86400000});
   if(!result.allowed)throw new AuthFault(429,'rate_limited',{retryAfterSec:result.retryAfterSec});next();
  }catch(error){if(error instanceof AuthFault){if(error.status===429)res.setHeader('Retry-After',String(error.extra.retryAfterSec));res.status(error.status).json({ok:false,code:error.code,...error.extra});}else next(error);}
 };
}
@ApiTags('Follow-up links')
@Controller(['api/track','api/v1/track'])
export class TrackController {
 constructor(@Inject(TrackService) private readonly tracks:TrackService,@Inject(AuthenticationService) private readonly auth:AuthenticationService,@Inject(AuthHttpPolicy) private readonly policy:AuthHttpPolicy){}
 private async context(req:Request){return {actor:(await this.auth.session(this.policy.cookie(req,this.policy.sessionCookie)))?.user??null,capability:verifyTrackSessionValue(this.policy.cookie(req,TRACK_COOKIE_NAME))};}
 @Post('exchange') @HttpCode(200) async exchange(@Body() body:TrackInput,@Req() req:Request,@Res() res:Response){
  this.policy.mutation(req);const ex=await this.tracks.exchange(body.token);
  res.cookie(TRACK_COOKIE_NAME,createTrackSessionValue(ex.linkId,ex.generation,ex.expiresAt),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:Math.max(0,Math.min(TRACK_SESSION_TTL_SEC*1000,ex.expiresAt.getTime()-Date.now()))});
  res.json({ok:true,url:`?card=${ex.scope}:${ex.id}`});
 }
 @Get('card') async card(@Query() query:TrackInput,@Req() req:Request,@Res() res:Response){
  const {scope,id}=cardInput(query),ctx=await this.context(req),view=await this.tracks.view(scope,id,ctx);
  if(!view.ok){res.status(view.reason==='not_found'?404:403).json({ok:false,code:view.reason??'denied',policy:view.policy?{mode:view.policy.mode,source:view.policy.source}:undefined});return;}
  res.json({ok:true,card:view.card,policy:view.policy,link:view.link?{expiresAt:view.link.expiresAt.toISOString(),state:view.link.state}:null,access:{via:ctx.actor?'account':'link'}});
 }
 @Post('reply') async reply(@Body() body:TrackInput,@Req() req:Request){this.policy.mutation(req);const {scope,id}=cardInput(body);return this.tracks.reply(scope,id,await this.context(req),body.body);}
}
@ApiTags('Administrative follow-up links')
@Controller(['api/admin/track','api/v1/admin/track'])
@UseGuards(AccountGuard)
export class AdminTrackController {
 constructor(@Inject(TrackService) private readonly tracks:TrackService){}
 @Get() state(@Query() query:TrackInput,@Req() req:Request&{actor:AuthUser}){const {scope,id}=cardInput(query);return this.tracks.adminState(req.actor,scope,id);}
 @Post() @HttpCode(200) mutate(@Body() body:TrackInput,@Req() req:Request&{actor:AuthUser}){
  const {scope,id}=cardInput(body);
  if(body.action==='renew')return this.tracks.renew(req.actor,scope,id);
  if(body.action==='revoke')return this.tracks.revoke(req.actor,scope,id,body.reason);
  if(body.action==='policy')return this.tracks.setException(req.actor,scope,id,body.mode);
  throw new AuthFault(400,'invalid_action');
 }
}
