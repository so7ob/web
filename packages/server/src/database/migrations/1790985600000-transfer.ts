import type { MigrationInterface, QueryRunner } from 'typeorm';
export class Transfer1790985600000 implements MigrationInterface {
  name = 'Transfer1790985600000'; transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE MigrationTransfer (
      id CHAR(64) PRIMARY KEY, sqliteHash CHAR(64) NOT NULL, filesHash CHAR(64) NOT NULL,
      targetPathHash CHAR(64) NOT NULL, status VARCHAR(32) NOT NULL,
      completedTables LONGTEXT NOT NULL, startedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
  }
  async down(): Promise<void> { throw new Error('Destructive schema rollback is disabled: restore a verified isolated backup while writes remain paused.'); }
}
