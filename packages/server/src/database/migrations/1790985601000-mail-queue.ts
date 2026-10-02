import type { MigrationInterface, QueryRunner } from 'typeorm';
export class MailQueue1790985601000 implements MigrationInterface {
  name = 'MailQueue1790985601000'; transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE MailJob (
      id VARCHAR(64) PRIMARY KEY, dedupeKey CHAR(64) NOT NULL UNIQUE,
      payload LONGTEXT NOT NULL, payloadDigest CHAR(64) NOT NULL,
      emailLogId VARCHAR(255) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'queued',
      attempts INT NOT NULL DEFAULT 0, maxAttempts INT NOT NULL DEFAULT 4,
      availableAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      leaseToken CHAR(64) NULL, leaseUntil DATETIME(3) NULL,
      lastError VARCHAR(80) NULL, providerMessageId VARCHAR(255) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_MailJob_EmailLog FOREIGN KEY (emailLogId) REFERENCES EmailLog(id) ON DELETE RESTRICT,
      KEY ix_MailJob_claim(status,availableAt), KEY ix_MailJob_lease(status,leaseUntil)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
  }
  async down(): Promise<void> { throw new Error('Destructive schema rollback is disabled: restore the matching database/files/queue backup while writes remain paused.'); }
}
