import type {MigrationInterface,QueryRunner} from 'typeorm';
export class Diagnostics1791763200000 implements MigrationInterface {
  name='Diagnostics1791763200000';
  async up(r:QueryRunner):Promise<void> {
    await r.query(`CREATE TABLE IF NOT EXISTS DiagnosticEvent (
      errorId CHAR(36) PRIMARY KEY,requestId CHAR(36) NULL,occurredAt DATETIME(3) NOT NULL,
      fingerprint CHAR(64) NOT NULL,level VARCHAR(8) NOT NULL,component VARCHAR(8) NOT NULL,
      operation VARCHAR(101) NOT NULL,code VARCHAR(64) NOT NULL,payload TEXT NOT NULL,
      INDEX diagnostic_request(requestId),INDEX diagnostic_time(occurredAt),
      INDEX diagnostic_group(fingerprint,occurredAt),INDEX diagnostic_filter(component,level,occurredAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await r.query(`CREATE TABLE IF NOT EXISTS DiagnosticReview (
      fingerprint CHAR(64) PRIMARY KEY,state VARCHAR(16) NOT NULL DEFAULT 'reviewing',
      updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  }
  async down():Promise<void>{throw new Error('Destructive schema rollback is disabled');}
}
