import type { MigrationInterface, QueryRunner } from "typeorm";
export class BusinessControls1790985604000 implements MigrationInterface {
  name = "BusinessControls1790985604000";
  transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      `CREATE TABLE OperationLock (lockKey CHAR(64) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`,
    );
    await r.query(`CREATE TABLE WebhookJob (
      id VARCHAR(64) PRIMARY KEY,dedupeKey CHAR(64) NOT NULL UNIQUE,payload LONGTEXT NOT NULL,payloadDigest CHAR(64) NOT NULL,
      requestId VARCHAR(255) NULL,status VARCHAR(32) NOT NULL DEFAULT 'queued',attempts INT NOT NULL DEFAULT 0,maxAttempts INT NOT NULL DEFAULT 4,
      availableAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),leaseToken CHAR(64) NULL,leaseUntil DATETIME(3) NULL,lastError VARCHAR(80) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
      CONSTRAINT fk_WebhookJob_Request FOREIGN KEY(requestId) REFERENCES ProjectRequest(id) ON DELETE SET NULL,
      KEY ix_WebhookJob_claim(status,availableAt),KEY ix_WebhookJob_lease(status,leaseUntil)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
  }
  async down(): Promise<void> {
    throw new Error(
      "Destructive schema rollback is disabled; restore the matching release snapshot before reopening writes.",
    );
  }
}
