import {describe,it,expect} from 'vitest';
import express from 'express';
import {once} from 'node:events';
import {correlationMiddleware,diagnostics,rememberError} from './diagnostics.js';
import {SafeExceptionFilter,validationCode} from './errors.js';
import {AuthFault} from '@so7ob/server';
import {HttpException,type ArgumentsHost} from '@nestjs/common';
describe('real HTTP error boundaries',()=>{
 it('correlates parser, guards and unexpected errors without reflecting input or provider messages',async()=>{
  const app=express();app.use(correlationMiddleware);app.use(express.json({limit:128}));
  app.post('/api/example/:id',(req,res,next)=>{const status=Number(req.params.id);next(status===500?new Error('SQL SYNTHETIC_SECRET'):status===418?new HttpException('SYNTHETIC_SECRET',418):new AuthFault(status,status===429?'rate_limited':status===401?'unauthorized':status===403?'forbidden':status===409?'conflict':'invalid',status===429?{retryAfterSec:13}:{}));});
  app.get('/api/legacy/:code',(req,res)=>res.status(403).json({ok:false,code:req.params.code}));
  app.use((error:unknown,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(error && typeof error==='object' && 'type' in error && error.type==='entity.parse.failed'){rememberError(req,error);res.status(400).json({ok:false,code:'invalid'});return;}
    new SafeExceptionFilter().catch(error,{switchToHttp:()=>({getRequest:()=>req,getResponse:()=>res})} as ArgumentsHost);
  });
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Expected TCP');
  try{for(const status of [400,401,403,409,429,500,418]){
    const res=await fetch(`http://127.0.0.1:${address.port}/api/example/${status}?token=SYNTHETIC_SECRET`,{method:'POST',headers:{'content-type':'application/json','x-request-id':'SYNTHETIC_SECRET'},body:'{}'});const body=await res.json();
    expect(res.status).toBe(status);expect(body.requestId).toBe(res.headers.get('x-request-id'));expect(body.errorId).toBe(res.headers.get('x-error-id'));expect(JSON.stringify(body)).not.toContain('SYNTHETIC_SECRET');
    if(status===429)expect(res.headers.get('retry-after')).toBe('13');if(status===500)expect(body.code).toBe('internal_error');
  }
  for(const code of ['missing','expired','revoked','owner_required','policy_denied','denied']){const res=await fetch(`http://127.0.0.1:${address.port}/api/legacy/${code}`);expect((await res.json()).code).toBe(code);}
  for(const [body,status] of [['{',400],[JSON.stringify({body:'x'.repeat(200)}),413]] as const){const res=await fetch(`http://127.0.0.1:${address.port}/api/example/400`,{method:'POST',headers:{'content-type':'application/json'},body});expect(res.status).toBe(status);expect((await res.json()).requestId).toBe(res.headers.get('x-request-id'));}
  }finally{await diagnostics.flush();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
});

it('preserves established field codes but never reflects raw validator messages',()=>{for(const code of ['name_invalid','email_invalid','password_short','password_long','password_weak','required','invalidEmail'])expect(validationCode(code)).toBe(code);expect(validationCode('SQL SYNTHETIC_SECRET')).toBe('invalid');});
