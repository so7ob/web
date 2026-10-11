import{randomUUID}from'node:crypto';
import type{DataSource}from'typeorm';
import {can,type AuthUser}from'@so7ob/contracts';
import{AuthFault}from'../auth/persistence.js';
export class WorkerHeartbeat {
 readonly id=randomUUID();
 constructor(private readonly db:DataSource){}
 async start(){await this.db.query('INSERT INTO WorkerHeartbeat(id,startedAt,heartbeatAt) VALUES(?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',[this.id]);}
 async beat(){await this.db.query('UPDATE WorkerHeartbeat SET heartbeatAt=UTC_TIMESTAMP(3) WHERE id=? AND stoppedAt IS NULL',[this.id]);}
 async activity(){await this.db.query('UPDATE WorkerHeartbeat SET lastActivityAt=UTC_TIMESTAMP(3) WHERE id=? AND stoppedAt IS NULL',[this.id]);}
 async stop(){await this.db.query('UPDATE WorkerHeartbeat SET stoppedAt=UTC_TIMESTAMP(3) WHERE id=?',[this.id]);}
}
export async function workerHealth(db:DataSource,actor:AuthUser){
 if(!can(actor,'email.outbox'))throw new AuthFault(403,'forbidden');
 const [worker]=await db.query('SELECT COUNT(*) instances,SUM(stoppedAt IS NULL AND heartbeatAt>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 SECOND)) fresh,MAX(heartbeatAt) lastHeartbeatAt,MAX(lastActivityAt) lastActivityAt FROM WorkerHeartbeat');
 const queues:Record<string,unknown>={};
 for(const [name,table]of [['mail','MailJob'],['webhook','WebhookJob'],['files','FileCleanupJob']]){
  const states:Array<{status:string;count:string|number}>=await db.query(`SELECT status,COUNT(*) count FROM ${table} GROUP BY status`);
  const [ages]=await db.query(`SELECT MAX(CASE WHEN status IN ('queued','retry') THEN TIMESTAMPDIFF(SECOND,createdAt,UTC_TIMESTAMP(3)) END) oldestPendingSeconds,SUM(status IN ('queued','retry') AND availableAt>UTC_TIMESTAMP(3)) delayedCount,SUM(status IN ('queued','retry') AND availableAt<=UTC_TIMESTAMP(3)) due,SUM(status IN ('leased','sending') AND leaseUntil<=UTC_TIMESTAMP(3)) expiredLeases FROM ${table}`);
  // Never serialize arbitrary historical statuses or any job payload metadata.
  const known=['queued','retry','leased','sending','sent','failed','uncertain','done','blocked'];
  const counts:Record<string,number>=Object.fromEntries([...known,'unknown'].map(key=>[key,0]));
  for(const state of states)counts[known.includes(state.status)?state.status:'unknown']+=Number(state.count);
  queues[name]={counts,oldestPendingSeconds:ages.oldestPendingSeconds===null?null:Math.max(0,Number(ages.oldestPendingSeconds)),delayed:Number(ages.delayedCount??0),due:Number(ages.due??0),expiredLeases:Number(ages.expiredLeases??0)};
 }
 return {ok:true,status:Number(worker.fresh)>0?'healthy':'degraded',freshWorkers:Number(worker.fresh??0),freshnessSeconds:30,lastHeartbeatAt:worker.lastHeartbeatAt,lastActivityAt:worker.lastActivityAt,queues};
}
