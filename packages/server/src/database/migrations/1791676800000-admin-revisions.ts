import type {MigrationInterface,QueryRunner} from 'typeorm';
export class AdminRevisions1791676800000 implements MigrationInterface {
 name='AdminRevisions1791676800000';
 async up(r:QueryRunner):Promise<void>{await r.query('CREATE TABLE IF NOT EXISTS AdminRevision (scope VARCHAR(255) PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin');}
 async down():Promise<void>{throw new Error('Destructive schema rollback is disabled');}
}
