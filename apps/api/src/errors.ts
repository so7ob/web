import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthFault } from '@so7ob/server';
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error:unknown, host:ArgumentsHost):void {
    const res=host.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control','no-store');
    if (error instanceof AuthFault) { if (error.status===429 && typeof error.extra.retryAfterSec==='number') res.setHeader('Retry-After',error.extra.retryAfterSec); res.status(error.status).json({ ok:false,code:error.code,...error.extra }); return; }
    if (error instanceof HttpException) { res.status(error.getStatus()).json(error.getResponse()); return; }
    // Do not log SQL bindings, tokenized URLs, message bodies or provider exceptions.
    process.stderr.write('request_failed: internal_error\n'); res.status(500).json({ ok:false,code:'storage' });
  }
}
