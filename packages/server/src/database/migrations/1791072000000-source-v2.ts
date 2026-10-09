import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive Website fc4a959 schema. MariaDB DDL is not transactionally atomic.
 * Each statement is restartable; existing values, IDs, hashes and expiry stay intact.
 * Run with application writes paused, as for every release schema migration. */
export class SourceV21791072000000 implements MigrationInterface {
  name = 'SourceV21791072000000';
  transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE Page
      ADD COLUMN IF NOT EXISTS draftSettings LONGTEXT NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS draftRevision INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS publishedRevision INT NULL,
      ADD COLUMN IF NOT EXISTS publishedSettings LONGTEXT NULL,
      ADD COLUMN IF NOT EXISTS scheduledPublishAt DATETIME(3) NULL,
      ADD COLUMN IF NOT EXISTS scheduledRevision INT NULL,
      ADD COLUMN IF NOT EXISTS scheduledPublishById LONGTEXT NULL,
      ADD INDEX IF NOT EXISTS ix_Page_schedule (scheduledPublishAt)`);
    await r.query(`CREATE TABLE IF NOT EXISTS PageTemplate (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      \`key\` VARCHAR(255) NULL UNIQUE,
      nameAr LONGTEXT NOT NULL, nameEn LONGTEXT NOT NULL,
      descAr LONGTEXT NULL, descEn LONGTEXT NULL,
      kind VARCHAR(255) NOT NULL DEFAULT 'custom',
      blocksAr LONGTEXT NULL, blocksEn LONGTEXT NULL,
      usageCount INT NOT NULL DEFAULT 0,
      createdById VARCHAR(255) NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
      updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
      KEY ix_PageTemplate_kind_updated (kind,updatedAt),
      CONSTRAINT fk_PageTemplate_createdBy FOREIGN KEY (createdById) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
    await r.query(`CREATE TABLE IF NOT EXISTS TrackLink (
      id VARCHAR(255) NOT NULL PRIMARY KEY,
      tokenHash VARCHAR(255) NOT NULL UNIQUE,
      scope VARCHAR(255) NOT NULL,
      requestId VARCHAR(255) NULL, inquiryId VARCHAR(255) NULL,
      expiresAt DATETIME(3) NOT NULL, revokedAt DATETIME(3) NULL,
      revokedReason LONGTEXT NULL, createdById LONGTEXT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
      updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
      KEY ix_TrackLink_request (requestId), KEY ix_TrackLink_inquiry (inquiryId),
      KEY ix_TrackLink_scope_expiry (scope,expiresAt),
      CONSTRAINT fk_TrackLink_request FOREIGN KEY (requestId) REFERENCES ProjectRequest(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_TrackLink_inquiry FOREIGN KEY (inquiryId) REFERENCES Inquiry(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
    // Preserve the source migration's legacy settings representation, including
    // allowedRoles as serialized JSON and the original published snapshot rule.
    await r.query(`UPDATE Page SET draftSettings=JSON_COMPACT(JSON_OBJECT(
      'slug',slug,'visibility',visibility,'allowedRoles',allowedRoles,
      'titleAr',titleAr,'titleEn',titleEn,'seoTitleAr',seoTitleAr,'seoTitleEn',seoTitleEn,
      'seoDescAr',seoDescAr,'seoDescEn',seoDescEn,'order',\`order\`))
      WHERE draftSettings='{}'`);
    await r.query(`UPDATE Page SET publishedSettings=draftSettings
      WHERE publishedSettings IS NULL AND status='published' AND publishedBlocksAr IS NOT NULL`);
  }
  async down(): Promise<void> {
    throw new Error('Destructive schema rollback is disabled; restore the verified full backup while writes remain paused.');
  }
}
