import type {DataSource} from 'typeorm';
import {can,TRACE_ID,DIAGNOSTIC_COMPONENTS,DIAGNOSTIC_LEVELS,type AuthUser,type DiagnosticEvent} from '@so7ob/contracts';
import {AuthFault,audit,transaction} from '../auth/persistence.js';
import {safeStoredEvent} from './logger.js';
import {DIAGNOSTIC_RETENTION} from './store.js';
export interface DiagnosticQuery {q?:string;from?:string;to?:string;level?:string;component?:string;operation?:string;code?:string;page?:string;}
export class DiagnosticAdministration {
  constructor(private readonly db:DataSource){}
  async list(actor:AuthUser,q:DiagnosticQuery){
    if(!can(actor,'diagnostics.view'))throw new AuthFault(403,'forbidden');
    const where=['1=1'],args:unknown[]=[];
    if(q.q){if(!TRACE_ID.test(q.q))throw new AuthFault(400,'invalid',{errors:{q:'invalid'}});where.push('(errorId=? OR requestId=?)');args.push(q.q,q.q);}
    for(const key of ['level','component','operation','code'] as const){
      const v=q[key];if(!v)continue;
      if(key==='level'?!DIAGNOSTIC_LEVELS.includes(v as typeof DIAGNOSTIC_LEVELS[number]):key==='component'?!DIAGNOSTIC_COMPONENTS.includes(v as typeof DIAGNOSTIC_COMPONENTS[number]):! /^[a-zA-Z][a-zA-Z0-9_.:-]{0,100}$/.test(v))throw new AuthFault(400,'invalid',{errors:{[key]:'invalid'}});
      where.push(`${key}=?`);args.push(v);
    }
    for(const key of ['from','to'] as const){if(!q[key])continue;const date=new Date(q[key]);if(!/^\d{4}-\d\d-\d\dT/.test(q[key])||!Number.isFinite(date.getTime()))throw new AuthFault(400,'invalid',{errors:{[key]:'invalid'}});where.push(`occurredAt${key==='from'?'>=':'<='}?`);args.push(date);}
    if(q.from&&q.to&&new Date(q.from)>new Date(q.to))throw new AuthFault(400,'invalid');
    const page=q.page===undefined?1:Number(q.page),pageSize=20;
    if(!Number.isSafeInteger(page)||page<1||page>2500)throw new AuthFault(400,'invalid');
    const sql=where.join(' AND ');
    const [count]=await this.db.query(`SELECT COUNT(DISTINCT fingerprint) total FROM DiagnosticEvent WHERE ${sql}`,args);
    const groups:Array<{fingerprint:string;occurrences:string;firstAt:Date;lastAt:Date}>=await this.db.query(`SELECT fingerprint,COUNT(*) occurrences,MIN(occurredAt) firstAt,MAX(occurredAt) lastAt FROM DiagnosticEvent WHERE ${sql} GROUP BY fingerprint ORDER BY lastAt DESC,fingerprint LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]);
    // Bounded to 20 groups; indexed lookup gives the latest matching event, never all payloads.
    const rows=await Promise.all(groups.map(async group=>{
      const [row]=await this.db.query(`SELECT payload FROM DiagnosticEvent WHERE ${sql} AND fingerprint=? ORDER BY occurredAt DESC,errorId DESC LIMIT 1`,[...args,group.fingerprint]);
      const [review]=await this.db.query('SELECT state,updatedAt FROM DiagnosticReview WHERE fingerprint=?',[group.fingerprint]);
      const event=safeStoredEvent(JSON.parse(row.payload)) as DiagnosticEvent;
      return {...group,occurrences:Number(group.occurrences),event,state:review?.state==='resolved'?'resolved':'reviewing',reviewedAt:review?.updatedAt??null};
    }));
    return {ok:true as const,rows,total:Number(count.total),page,pageSize,retention:DIAGNOSTIC_RETENTION,countScope:'retained_matching_events' as const};
  }
  async review(actor:AuthUser,fingerprint:string,state:unknown){
    if(!can(actor,'diagnostics.view')||!can(actor,'diagnostics.manage'))throw new AuthFault(403,'forbidden');
    if(!/^[a-f0-9]{64}$/.test(fingerprint)||!['reviewing','resolved'].includes(String(state))||typeof state!=='string')throw new AuthFault(400,'invalid');
    return transaction(this.db,async r=>{
      const [exists]=await r.query('SELECT errorId FROM DiagnosticEvent WHERE fingerprint=? LIMIT 1',[fingerprint]);
      if(!exists)throw new AuthFault(404,'not_found');
      await r.query('INSERT INTO DiagnosticReview(fingerprint,state) VALUES(?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),updatedAt=UTC_TIMESTAMP(3)',[fingerprint,state]);
      await audit(r,'diagnostics.classified',actor,{state},'diagnostic',fingerprint);
      return {ok:true};
    });
  }
}
