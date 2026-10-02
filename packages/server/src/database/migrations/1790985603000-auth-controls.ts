import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AuthControls1790985603000 implements MigrationInterface {
  name = 'AuthControls1790985603000'; transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE RateLimitBucket (bucketKey CHAR(64) PRIMARY KEY, timestamps LONGTEXT NOT NULL, updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
    await r.query(`CREATE TABLE AuthorizationLock (name VARCHAR(64) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
    await r.query("INSERT INTO AuthorizationLock(name) VALUES('active_super_admin')");
  }
  async down(): Promise<void> { throw new Error('Destructive schema rollback is disabled; restore the matching release snapshot before reopening writes.'); }
}
