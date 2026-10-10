import type{MigrationInterface,QueryRunner}from'typeorm';
export class WorkerHeartbeat1791676801000 implements MigrationInterface{
 name='WorkerHeartbeat1791676801000';
 async up(r:QueryRunner):Promise<void>{await r.query('CREATE TABLE IF NOT EXISTS WorkerHeartbeat (id CHAR(36) PRIMARY KEY,startedAt DATETIME(3) NOT NULL,heartbeatAt DATETIME(3) NOT NULL,lastActivityAt DATETIME(3) NULL,stoppedAt DATETIME(3) NULL,INDEX heartbeat_fresh(stoppedAt,heartbeatAt)) ENGINE=InnoDB');}
 async down():Promise<void>{throw new Error('Destructive schema rollback is disabled');}
}
