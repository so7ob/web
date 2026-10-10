import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthFault } from '@so7ob/server';
import {rememberError} from './diagnostics.js';
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error:unknown, host:ArgumentsHost):void {
    const context=host.switchToHttp(),res=context.getResponse<Response>(),req=context.getRequest<Request>();
    rememberError(req,error);res.setHeader('Cache-Control','no-store');
    if(res.headersSent){res.end();return;}
    if (error instanceof AuthFault) {
      if(error.status===429 && typeof error.extra.retryAfterSec==='number')res.setHeader('Retry-After',error.extra.retryAfterSec);
      res.status(error.status).json({ok:false,code:error.code,...error.extra});return;
    }
    if(error instanceof HttpException){
      const status=error.getStatus();
      res.status(status).json({ok:false,code:status>=500?'internal_error':status===401?'unauthorized':status===403?'forbidden':status===404?'not_found':status===429?'rate_limited':status===413?'too_large':'invalid'});return;
    }
    if(error && typeof error==='object' && 'type' in error && error.type==='entity.too.large'){
      res.status(413).json({ok:false,code:'too_large'});return;
    }
    res.status(500).json({ok:false,code:'internal_error'});
  }
}
