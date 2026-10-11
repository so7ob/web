import type {DataSource} from 'typeorm';
import type {DiagnosticEvent} from '@so7ob/contracts';
import type {DiagnosticSink} from './logger.js';
export const DIAGNOSTIC_RETENTION={days:30,rows:50000} as const;
/** Separate autocommit connection/query: business rollback cannot erase diagnostics. */
export class DiagnosticStore implements DiagnosticSink {
  private maintenance:Promise<void>|undefined;
  private lastMaintenance=0;
  constructor(private readonly db:DataSource){}
  async write(event:DiagnosticEvent):Promise<void> {
    await this.db.query('INSERT INTO DiagnosticEvent(errorId,requestId,occurredAt,fingerprint,level,component,operation,code,payload) VALUES(?,?,?,?,?,?,?,?,?)',
      [event.errorId,event.requestId??null,new Date(event.at),event.fingerprint,event.level,event.component,event.operation,event.code,JSON.stringify(event)]);
    if(Date.now()-this.lastMaintenance>60000 && !this.maintenance) {
      this.lastMaintenance=Date.now();
      this.maintenance=this.prune().finally(()=>{this.maintenance=undefined;});
      await this.maintenance;
    }
  }
  async prune():Promise<void> {
    await this.db.query('DELETE FROM DiagnosticEvent WHERE occurredAt < DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY)');
    const [cutoff]=await this.db.query('SELECT occurredAt,errorId FROM DiagnosticEvent ORDER BY occurredAt DESC,errorId DESC LIMIT 1 OFFSET ?', [DIAGNOSTIC_RETENTION.rows-1]);
    if(cutoff)await this.db.query('DELETE FROM DiagnosticEvent WHERE occurredAt<? OR (occurredAt=? AND errorId<?)',[cutoff.occurredAt,cutoff.occurredAt,cutoff.errorId]);
    await this.db.query('DELETE r FROM DiagnosticReview r LEFT JOIN DiagnosticEvent e ON e.fingerprint=r.fingerprint WHERE e.errorId IS NULL AND r.updatedAt < DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY)');
  }
}
