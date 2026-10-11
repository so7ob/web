import {randomUUID} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import {errorCategory} from '@so7ob/contracts';
import {DiagnosticLogger,RotatingDiagnosticFile,DiagnosticStore,safeCode} from '@so7ob/server';
import {resolve} from 'node:path';
import type {DataSource} from 'typeorm';

const fileSink=new RotatingDiagnosticFile(resolve(process.env.DATA_DIR ?? '.migration/runtime','diagnostics'),'api');
let store:DiagnosticStore|undefined;
export function initializeDiagnostics(db:DataSource){store=new DiagnosticStore(db);}
export const diagnostics = new DiagnosticLogger({async write(event){
  const results=await Promise.allSettled([fileSink.write(event),...(store?[store.write(event)]:[])]);
  if(results.some(r=>r.status==='rejected'))throw new Error('Diagnostic persistence degraded');
}});
const requestContext = new WeakMap<Request,{requestId:string;errorId:string;started:number;error?:unknown;code?:string;event?:'request_failed'|'render_failed'}>();
export function rememberError(req:Request,error:unknown,event:'request_failed'|'render_failed'='request_failed') {
  const context=requestContext.get(req);if(context){context.error=error;context.event=event;}
}
const segments = new Set(['api','v1','auth','admin','account','requests','inquiries','messages','attachments','files','media','users','pages','templates','notifications','settings','menus','audit','outbox','dashboard','track','claim','health','ready','csrf','callback','credentials','register','login','logout','forgot-password','reset-password','verify-email','resend-verification','password','profile','draft','bulk','export','publish','versions','restore','archive','schedule','preview','invite','accept-invite','session','signout','diagnostics','groups','events']);
function routeTemplate(req:Request):string {
  if(typeof req.route?.path==='string') return req.route.path;
  // Before routing (parser/guard/middleware): keep only known structural segments, never tokens.
  return req.path.split('/').map(part=>!part?'':segments.has(part)?part:':id').join('/').slice(0,180);
}
/** Runs before parsers and middleware. IDs are generated here; client-supplied IDs are ignored. */
export function correlationMiddleware(req:Request,res:Response,next:NextFunction) {
  const context={requestId:randomUUID(),errorId:randomUUID(),started:performance.now(),code:undefined as string|undefined,error:undefined as unknown,event:undefined as 'request_failed'|'render_failed'|undefined};
  requestContext.set(req,context);res.setHeader('X-Request-Id',context.requestId);
  const json=res.json.bind(res),writeHead=res.writeHead;
  res.writeHead=function(...args:Parameters<Response['writeHead']>){
    if(res.statusCode>=400 || Number(args[0])>=400){res.setHeader('X-Error-Id',context.errorId);res.setHeader('Cache-Control','no-store');}
    return writeHead.apply(res,args);
  } as Response['writeHead'];
  res.json=function(body:unknown){
    if(res.statusCode>=400) {
      const previous=body && typeof body==='object' && !Array.isArray(body)?body as Record<string,unknown>:{};
      const code=safeCode(previous.code,res.statusCode>=500?'internal_error':res.statusCode===401?'unauthorized':res.statusCode===403?'forbidden':res.statusCode===404?'not_found':res.statusCode===429?'rate_limited':'invalid');
      context.code=code;
      // Domain extra fields have already passed service authorization/validation; no raw HttpException response reaches here.
      const category=errorCategory(res.statusCode,code);
      body={...(res.statusCode>=500?{}:previous),ok:false,code,category,messageKey:`errors.${category}`,requestId:context.requestId,errorId:context.errorId};
    }
    return json(body);
  };
  res.once('finish',()=>{
    if(res.statusCode<400)return;
    const route=routeTemplate(req);
    diagnostics.record({component:context.event==='render_failed'?'Web':'API',event:context.event??'request_failed',level:res.statusCode>=500?'error':'warn',
      code:context.code??(res.statusCode>=500?'internal_error':'unavailable'),requestId:context.requestId,errorId:context.errorId,
      operation:req.method.toLowerCase()+'.'+route.split('/').filter(Boolean).map(s=>s.startsWith(':')?'resource':s).join('.'),
      method:req.method,route,status:res.statusCode,durationMs:performance.now()-context.started,
      fields:req.body && typeof req.body==='object'?Object.keys(req.body):[],
    },context.error);
  });
  next();
}
