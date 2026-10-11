import { createHash, randomUUID } from 'node:crypto';
import { mkdir, appendFile, rename, stat, unlink, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DiagnosticEvent } from '@so7ob/contracts';
import { TRACE_ID } from '@so7ob/contracts';

const reasons: Record<string,string> = { ECONNREFUSED:'connection_refused',ETIMEDOUT:'connection_timeout',ECONNRESET:'connection_reset',ENOSPC:'disk_full',EACCES:'access_denied',ER_LOCK_DEADLOCK:'transaction_deadlock',ER_LOCK_WAIT_TIMEOUT:'transaction_timeout',ER_DUP_ENTRY:'duplicate_key',ER_NO_SUCH_TABLE:'schema_missing',ER_BAD_FIELD_ERROR:'schema_mismatch' };
const exceptionNames = new Set(['Error','TypeError','RangeError','SyntaxError','QueryFailedError','AuthFault','BadRequestException','ForbiddenException','UnauthorizedException','PayloadTooLargeException']);
const fieldNames = new Set(['status','priority','assigneeId','action','note','body','kind','email','password','currentPassword','newPassword','name','phone','locale','subject','message','category','description','baseRevision','baseRevisions','items','location','blocksAr','blocksEn','settings','title','altText','folder','ids','file','roleKey']);
const codes = new Set(['actor_inactive', 'archived', 'bad_origin', 'builtin_readonly', 'cancelled', 'closed', 'conflict', 'csrf', 'duplicate', 'email_taken', 'empty', 'empty_page', 'export_busy', 'export_incomplete', 'export_limit', 'export_timeout', 'forbidden', 'home_slug', 'internal_error', 'invalid', 'invalid_action', 'invalid_assignee', 'invalid_blocks', 'invalid_email', 'invalid_folder', 'invalid_mode', 'invalid_phone', 'invalid_response', 'invalid_settings', 'invalid_slug', 'invalid_title', 'invalid_token', 'invalid_track_mode', 'invalid_track_ttl', 'invalid_transition', 'invalid_url', 'invite_pending', 'is_home', 'last_admin', 'locale_required', 'locked', 'media_in_use', 'media_not_found', 'network', 'no_file', 'not_discardable', 'not_found', 'nothing_scheduled', 'nothing_to_discard', 'page_not_found', 'payload_too_large', 'policy_denied', 'rate_limited', 'redirect_loop', 'response_policy_ack_required', 'revision_required', 'slug_taken', 'storage', 'template_locale_missing', 'timeout', 'too_large', 'too_long', 'too_many', 'unauthorized', 'unavailable', 'version_not_found']);
export const safeCode = (value: unknown, fallback = 'internal_error') => typeof value === 'string' && codes.has(value) ? value : fallback;
/** Never read messages, SQL, params, request values, arbitrary URL segments or causes into logs. */
export function exceptionDiagnostic(error: unknown): {exception:string;reason:string;frames:string[]} {
 try {
  let reason = 'unexpected_exception';
  const visited = new Set<unknown>();
  let current = error;
  for (let depth=0;depth<4 && current && typeof current==='object' && !visited.has(current);depth++) {
    visited.add(current);
    const value = current as {code?:unknown;cause?:unknown;driverError?:unknown};
    if (typeof value.code==='string' && Object.hasOwn(reasons,value.code)) { reason=reasons[value.code];break; }
    current = value.cause ?? value.driverError;
  }
  const exception = error instanceof Error && exceptionNames.has(error.name) ? error.name : 'Error';
  // Keep only source locations in our code, never the exception message or function arguments.
  const frames = error instanceof Error ? (error.stack ?? '').split('\n').slice(1,16).flatMap(line=>{
    const match = /\b((?:apps|packages)\/[a-zA-Z0-9_./-]+\.(?:js|ts|tsx)):(\d+):(\d+)\)?$/.exec(line);
    return match && !match[1].includes('..') && existsSync(resolve(match[1])) ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
  }).slice(0,8) : [];
  return {exception,reason,frames};
 } catch {return {exception:'Error',reason:'unreadable_exception',frames:[]};}
}
function readRevision(component: DiagnosticEvent['component']): string {
  try { const value=JSON.parse(readFileSync(resolve(`apps/${component==='Worker'?'worker':'api'}/dist/build-info.json`),'utf8'));return /^[a-f0-9]{40}$/.test(value.sha) ? value.sha+(value.dirty?'+dirty':'') : 'unavailable'; } catch { return 'unavailable'; }
}
const revisions = {API:readRevision('API'),Web:readRevision('Web'),Worker:readRevision('Worker')};
export function runtimeRevision(component:DiagnosticEvent['component']){return revisions[component];}
export function diagnosticEvent(input: Partial<DiagnosticEvent>, error?:unknown): DiagnosticEvent {
  const component = ['API','Web','Worker'].includes(input.component ?? '') ? input.component! : 'API';
  const code = safeCode(input.code);
  const operation = typeof input.operation==='string' && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,100}$/.test(input.operation) ? input.operation : 'unknown';
  const route = typeof input.route==='string' && /^\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z]+)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z]+))*\/?$/.test(input.route) ? input.route : undefined;
  const details = exceptionDiagnostic(error);
  return {
    at:new Date().toISOString(),component,level:input.level==='warn'||input.level==='fatal'?input.level:'error',
    event:['request_failed','render_failed','worker_failed','startup_failed','logging_degraded'].includes(input.event??'')?input.event!:'request_failed',
    code,operation,...(route?{route}:{}),
    ...(input.method && ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(input.method)?{method:input.method}:{}),
    ...(input.requestId && TRACE_ID.test(input.requestId)?{requestId:input.requestId}:{}),
    errorId:input.errorId && TRACE_ID.test(input.errorId)?input.errorId:randomUUID(),
    ...(Number.isInteger(input.status)&&input.status!>=100&&input.status!<=599?{status:input.status}:{}),
    ...(Number.isFinite(input.durationMs)?{durationMs:Math.max(0,Math.round(input.durationMs!))}:{}),
    revision:runtimeRevision(component),...details,
    fields:Array.from(new Set((input.fields??[]).filter(field=>fieldNames.has(field)))).slice(0,30),
    fingerprint:createHash('sha256').update(JSON.stringify([component,operation,code,input.status,details.exception,details.reason,details.frames[0]])).digest('hex'),
  };
}
export interface DiagnosticSink { write(event:DiagnosticEvent): Promise<void> }
/** Per-process bounded files; rotation is diagnostic-only, never AuditLog or business files. */
export class RotatingDiagnosticFile implements DiagnosticSink {
  private chain:Promise<void>=Promise.resolve();
  private pending=0;
  private lastCleanup=0;
  constructor(private readonly directory:string,private readonly component:string,private readonly bytes=5*1024*1024,private readonly copies=4) {}
  async write(event:DiagnosticEvent):Promise<void> {
    if(this.pending>=128)throw new Error('Diagnostic file backlog full');
    this.pending++;
    const work=this.chain.catch(()=>{}).then(async()=>{
      await mkdir(this.directory,{recursive:true,mode:0o700});
      const file=resolve(this.directory,`${this.component}-${process.pid}.jsonl`);
      const line=JSON.stringify(event)+'\n';
      const current=await stat(file).catch(()=>null);
      if(current && (current.size+Buffer.byteLength(line)>this.bytes || Date.now()-current.mtimeMs>7*86400000)) {
        for(let n=this.copies;n>=1;n--) {
          const target=file+'.'+n,source=n===1?file:file+'.'+(n-1);
          if(n===this.copies)await unlink(target).catch(()=>{});
          await rename(source,target).catch(error=>{if(error.code!=='ENOENT')throw error;});
        }
      }
      await appendFile(file,line,{mode:0o600});
      if(Date.now()-this.lastCleanup>60000){
        this.lastCleanup=Date.now();
        const files=await Promise.all((await readdir(this.directory)).filter(name=>/^(api|worker)-[0-9]+\.jsonl(?:\.[1-4])?$/.test(name)).map(async name=>({path:resolve(this.directory,name),info:await stat(resolve(this.directory,name)).catch(()=>null)})));
        files.sort((a,b)=>(b.info?.mtimeMs??0)-(a.info?.mtimeMs??0));let total=0;
        for(const item of files){total+=item.info?.size??0;if(item.path!==file && (total>50*1024*1024 || Date.now()-(item.info?.mtimeMs??0)>7*86400000))await unlink(item.path).catch(()=>{});}
      }
    });
    this.chain=work;try{await work;}finally{this.pending--;}
  }
  async flush(){await this.chain.catch(()=>{});}
}
export class DiagnosticLogger {
  private pending=new Set<Promise<void>>();
  private dropped=0;
  private fallbackDropped=0;
  constructor(private readonly sink?:DiagnosticSink,private readonly fallback:(line:string)=>void=(line)=>{if(process.stderr.writableLength>1024*1024)throw new Error('Diagnostic stderr backlog full');process.stderr.write(line);}) {}
  record(input:Partial<DiagnosticEvent>,error?:unknown):DiagnosticEvent {
    const event=diagnosticEvent(input,error);
    // stdout/stderr survives DB rollback and is the fallback when both DB and disk are unavailable.
    try{this.fallback(JSON.stringify(event)+'\n');}catch{this.fallbackDropped++; /* Never replace the original error. */}
    if(this.sink && this.pending.size<256) {
      const work=Promise.resolve().then(()=>this.sink!.write(event)).catch(()=>{this.dropped++;}).finally(()=>{this.pending.delete(work);});
      this.pending.add(work);
    } else if(this.sink) this.dropped++;
    return event;
  }
  get lostPersistenceCount(){return this.dropped;}
  get lostFallbackCount(){return this.fallbackDropped;}
  async flush(){await Promise.allSettled([...this.pending]);}
}

/** Re-project persisted rows before sending them to a browser; never return arbitrary payload keys. */
export function safeStoredEvent(value:Partial<DiagnosticEvent>):DiagnosticEvent {
  const safe=diagnosticEvent(value);
  const reasonValues=new Set([...Object.values(reasons),'unexpected_exception','unreadable_exception']);
  return {...safe,
    at:typeof value.at==='string'&&Number.isFinite(Date.parse(value.at))?new Date(value.at).toISOString():safe.at,
    revision:typeof value.revision==='string'&&/^[a-f0-9]{40}(?:\+dirty)?$/.test(value.revision)?value.revision:'unavailable',
    exception:exceptionNames.has(value.exception??'')?value.exception!:'Error',
    reason:reasonValues.has(value.reason??'')?value.reason!:'unexpected_exception',
    frames:Array.isArray(value.frames)?value.frames.filter(x=>typeof x==='string'&&/^(apps|packages)\/[a-zA-Z0-9_./-]+\.(js|ts|tsx):\d+:\d+$/.test(x)&&!x.includes('..')&&existsSync(resolve(x.replace(/:\d+:\d+$/, '')))).slice(0,8):[],
    fingerprint:typeof value.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(value.fingerprint)?value.fingerprint:safe.fingerprint,
  };
}
