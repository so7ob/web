import type { MigrationInterface, QueryRunner } from "typeorm";
export class Audit1791849600000 implements MigrationInterface {
  name = "Audit1791849600000";
  transaction = false;
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE AuditLog
   ADD COLUMN IF NOT EXISTS schemaVersion INT NOT NULL DEFAULT 0,
   ADD COLUMN IF NOT EXISTS eventCode VARCHAR(128) NULL,
   ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'legacy',
   ADD COLUMN IF NOT EXISTS outcome VARCHAR(16) NOT NULL DEFAULT 'unknown',
   ADD COLUMN IF NOT EXISTS isSensitive BOOLEAN NOT NULL DEFAULT 0,
   ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'unknown',
   ADD COLUMN IF NOT EXISTS reasonCode VARCHAR(80) NULL,
   ADD COLUMN IF NOT EXISTS resourceRef VARCHAR(255) NULL,
   ADD COLUMN IF NOT EXISTS actorSnapshot TEXT NULL,
   ADD COLUMN IF NOT EXISTS eventPayload LONGTEXT NULL,
   ADD COLUMN IF NOT EXISTS correlationId CHAR(36) NULL,
   ADD COLUMN IF NOT EXISTS errorId CHAR(36) NULL,
   ADD COLUMN IF NOT EXISTS batchId VARCHAR(64) NULL,
   ADD COLUMN IF NOT EXISTS hasChanges BOOLEAN NOT NULL DEFAULT 0,
   ADD COLUMN IF NOT EXISTS recordedAt DATETIME(3) NULL`);
    const fk = await r.query(
      "SELECT CONSTRAINT_NAME name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AuditLog' AND COLUMN_NAME='actorId' AND REFERENCED_TABLE_NAME='User'",
    );
    for (const { name } of fk) {
      if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error("Unexpected audit FK");
      await r.query(`ALTER TABLE AuditLog DROP FOREIGN KEY \`${name}\``);
    }
    for (const [name, columns] of [
      ["audit_order", "createdAt,id"],
      ["audit_resource", "entityType,entityId,createdAt,id"],
      ["audit_resource_id", "entityId,createdAt,id"],
      ["audit_reference", "resourceRef,createdAt,id"],
      ["audit_actor", "actorId,createdAt,id"],
      ["audit_action", "eventCode,createdAt,id"],
      ["audit_outcome", "outcome,createdAt,id"],
      ["audit_correlation", "correlationId,createdAt,id"],
      ["audit_error", "errorId,createdAt,id"],
      ["audit_batch", "batchId,createdAt,id"],
    ])
      await r.query(
        `CREATE INDEX IF NOT EXISTS ${name} ON AuditLog(${columns})`,
      );
    const tables: Record<string, string> = {
      AuditWork: `eventId VARCHAR(255) PRIMARY KEY,status VARCHAR(16) NOT NULL DEFAULT 'queued',attempts INT NOT NULL DEFAULT 0,availableAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),leaseToken CHAR(64) NULL,leaseUntil DATETIME(3) NULL,lastError VARCHAR(64) NULL,KEY audit_work_due(status,availableAt)`,
      AuditView: `id VARCHAR(64) PRIMARY KEY,userId VARCHAR(255) NOT NULL,name VARCHAR(100) NOT NULL,filters TEXT NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),KEY audit_view_owner(userId)`,
      AuditPreference: `userId VARCHAR(255) PRIMARY KEY,payload TEXT NOT NULL,updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))`,
      AuditAccess: `userId VARCHAR(255) NOT NULL,resourceId VARCHAR(255) NOT NULL,bucket BIGINT NOT NULL,PRIMARY KEY(userId,resourceId,bucket)`,
      AuditBookmark: `userId VARCHAR(255) NOT NULL,eventId VARCHAR(255) NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),PRIMARY KEY(userId,eventId)`,
      AuditCase: `id VARCHAR(64) PRIMARY KEY,title VARCHAR(160) NOT NULL,ownerId VARCHAR(255) NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'new',closureReason VARCHAR(2000) NULL,held BOOLEAN NOT NULL DEFAULT 0,revision INT NOT NULL DEFAULT 0,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))`,
      AuditCaseEvent: `caseId VARCHAR(64) NOT NULL,eventId VARCHAR(255) NOT NULL,PRIMARY KEY(caseId,eventId),KEY audit_case_event(eventId)`,
      AuditCaseHistory: `id VARCHAR(64) PRIMARY KEY,caseId VARCHAR(64) NOT NULL,actorId VARCHAR(255) NOT NULL,actorName VARCHAR(100) NOT NULL,kind VARCHAR(32) NOT NULL,body TEXT NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),KEY audit_case_history(caseId,createdAt,id)`,
      AuditReport: `id VARCHAR(64) PRIMARY KEY,userId VARCHAR(255) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'queued',format VARCHAR(8) NOT NULL,locale VARCHAR(2) NOT NULL,timezone VARCHAR(80) NOT NULL,scope VARCHAR(16) NOT NULL,filters TEXT NOT NULL,isSensitive BOOLEAN NOT NULL DEFAULT 0,attempts INT NOT NULL DEFAULT 0,availableAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),leaseToken CHAR(64) NULL,leaseUntil DATETIME(3) NULL,eventCount INT NULL,resourceCount INT NULL,bytes BIGINT NULL,checksum CHAR(64) NULL,fileName VARCHAR(100) NULL,errorCode VARCHAR(64) NULL,snapshotAt DATETIME(3) NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),completedAt DATETIME(3) NULL,expiresAt DATETIME(3) NULL,KEY audit_report_owner(userId,createdAt),KEY audit_report_due(status,availableAt)`,
      AuditRule: `id VARCHAR(64) PRIMARY KEY,name VARCHAR(120) NOT NULL,kind VARCHAR(32) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT 0,thresholdValue INT NOT NULL,windowSeconds INT NOT NULL,cooldownSeconds INT NOT NULL,severity VARCHAR(16) NOT NULL,rationale VARCHAR(500) NOT NULL,scope VARCHAR(32) NOT NULL DEFAULT 'all',revision INT NOT NULL DEFAULT 1,activatedAt DATETIME(3) NULL,updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))`,
      AuditAlert: `id VARCHAR(64) PRIMARY KEY,ruleId VARCHAR(64) NOT NULL,ruleRevision INT NOT NULL,scopeKey VARCHAR(128) NOT NULL,windowKey VARCHAR(64) NOT NULL,severity VARCHAR(16) NOT NULL,reason VARCHAR(500) NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),UNIQUE KEY audit_alert_once(ruleId,ruleRevision,scopeKey,windowKey)`,
      AuditAlertEvent: `alertId VARCHAR(64) NOT NULL,eventId VARCHAR(255) NOT NULL,PRIMARY KEY(alertId,eventId)`,
      AuditPolicy: `id INT PRIMARY KEY,retentionDays INT NULL,revision INT NOT NULL DEFAULT 0,updatedAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))`,
      AuditHealth: `component VARCHAR(80) PRIMARY KEY,checkedAt DATETIME(3) NOT NULL,status VARCHAR(16) NOT NULL,failures INT NOT NULL DEFAULT 0,lastFailureAt DATETIME(3) NULL`,
    };
    for (const [table, definition] of Object.entries(tables))
      await r.query(
        `CREATE TABLE IF NOT EXISTS ${table} (${definition}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`,
      );
    await r.query("INSERT IGNORE INTO AuditPolicy(id) VALUES(1)");
    for (const [id, name, kind, threshold, window, severity, rationale] of [
      [
        "privilege",
        "Sensitive privilege changes",
        "privilege",
        1,
        300,
        "high",
        "Administrative role or sensitive permission changed",
      ],
      [
        "security",
        "Repeated security failures",
        "security",
        5,
        300,
        "high",
        "Repeated denied or failed security operations in a fixed UTC window",
      ],
      [
        "export",
        "Large exports",
        "export",
        1000,
        300,
        "medium",
        "Export contains at least the configured number of distinct resources",
      ],
      [
        "health",
        "Audit writer and queue health",
        "health",
        300,
        60,
        "high",
        "Writer probe failed or pending work exceeded the configured age in seconds",
      ],
    ])
      await r.query(
        "INSERT IGNORE INTO AuditRule(id,name,kind,thresholdValue,windowSeconds,cooldownSeconds,severity,rationale) VALUES(?,?,?,?,?,900,?,?)",
        [id, name, kind, threshold, window, severity, rationale],
      );
  }
  async down(): Promise<void> {
    throw new Error(
      "Destructive schema rollback is disabled; audit rollback must preserve evidence; recover forward after writes resume",
    );
  }
}
