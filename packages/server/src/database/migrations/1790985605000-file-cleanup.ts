import type { MigrationInterface, QueryRunner } from "typeorm";
export class FileCleanup1790985605000 implements MigrationInterface {
  name = "FileCleanup1790985605000";
  transaction = false;
  async up(r: QueryRunner) {
    await r.query(`CREATE TABLE FileCleanupJob (
    id VARCHAR(64) PRIMARY KEY,storedName VARCHAR(255) NOT NULL UNIQUE,status VARCHAR(32) NOT NULL DEFAULT 'queued',
    attempts INT NOT NULL DEFAULT 0,availableAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),leaseToken CHAR(64) NULL,leaseUntil DATETIME(3) NULL,
    lastError VARCHAR(80) NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
    KEY ix_FileCleanup_claim(status,availableAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
  }
  async down(): Promise<void> {
    throw new Error(
      "Destructive schema rollback is disabled; restore the matching snapshot before reopening writes.",
    );
  }
}
