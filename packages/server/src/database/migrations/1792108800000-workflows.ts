import type { MigrationInterface, QueryRunner } from "typeorm";
import { legacyWorkflow } from "@so7ob/contracts";
export class Workflows1792108800000 implements MigrationInterface {
  name = "Workflows1792108800000";
  transaction = false;
  async up(r: QueryRunner) {
    const tables: Record<string, string> = {
      WorkTeam:
        "id VARCHAR(80) PRIMARY KEY,nameAr VARCHAR(120) NOT NULL,nameEn VARCHAR(120) NOT NULL,active BOOLEAN NOT NULL DEFAULT 1,revision INT NOT NULL DEFAULT 0,cursorUserId VARCHAR(255) NULL",
      WorkTeamMember:
        "teamId VARCHAR(80) NOT NULL,userId VARCHAR(255) NOT NULL,PRIMARY KEY(teamId,userId),KEY team_user(userId),FOREIGN KEY(teamId) REFERENCES WorkTeam(id),FOREIGN KEY(userId) REFERENCES User(id)",
      WorkCalendar:
        "id VARCHAR(80) PRIMARY KEY,definition LONGTEXT NOT NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))",
      Workflow:
        "id VARCHAR(80) PRIMARY KEY,scope VARCHAR(16) NOT NULL,draft LONGTEXT NOT NULL,revision INT NOT NULL DEFAULT 0,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))",
      WorkflowVersion:
        "id VARCHAR(80) PRIMARY KEY,workflowId VARCHAR(80) NOT NULL,definition LONGTEXT NOT NULL,legacy BOOLEAN NOT NULL DEFAULT 0,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),FOREIGN KEY(workflowId) REFERENCES Workflow(id)",
      WorkflowBinding:
        "scope VARCHAR(16) NOT NULL,selector VARCHAR(255) NOT NULL,versionId VARCHAR(80) NOT NULL,PRIMARY KEY(scope,selector),FOREIGN KEY(versionId) REFERENCES WorkflowVersion(id)",
      ConversationWorkflow:
        "scope VARCHAR(16) NOT NULL,recordId VARCHAR(255) NOT NULL,versionId VARCHAR(80) NOT NULL,stageId VARCHAR(80) NOT NULL,teamId VARCHAR(80) NULL,visibility VARCHAR(16) NOT NULL DEFAULT 'authorized',revision INT NOT NULL DEFAULT 0,stageEpoch INT NOT NULL DEFAULT 0,enteredAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),responseAnchor DATETIME(3) NULL,responseDueAt DATETIME(3) NULL,stageDueAt DATETIME(3) NULL,PRIMARY KEY(scope,recordId),KEY workflow_team(teamId,visibility),FOREIGN KEY(versionId) REFERENCES WorkflowVersion(id),FOREIGN KEY(teamId) REFERENCES WorkTeam(id)",
      WorkflowEvent:
        "id VARCHAR(80) PRIMARY KEY,scope VARCHAR(16) NOT NULL,recordId VARCHAR(255) NOT NULL,versionId VARCHAR(80) NOT NULL,operationId VARCHAR(100) NOT NULL,kind VARCHAR(32) NOT NULL,fromStage VARCHAR(80) NULL,toStage VARCHAR(80) NULL,actorId VARCHAR(255) NULL,reason VARCHAR(500) NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),UNIQUE KEY workflow_once(scope,recordId,operationId),KEY workflow_history(scope,recordId,createdAt,id)",
      WorkflowJob:
        "id VARCHAR(80) PRIMARY KEY,scope VARCHAR(16) NOT NULL,recordId VARCHAR(255) NOT NULL,versionId VARCHAR(80) NOT NULL,stageId VARCHAR(80) NOT NULL,revision INT NOT NULL,stageEpoch INT NOT NULL,triggerName VARCHAR(32) NOT NULL,eventId VARCHAR(100) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'queued',availableAt DATETIME(3) NOT NULL,attempts INT NOT NULL DEFAULT 0,errorCode VARCHAR(80) NULL,createdAt DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),UNIQUE KEY workflow_job_once(scope,recordId,eventId),KEY workflow_job_due(status,availableAt),KEY workflow_job_record(scope,recordId,status)",
      WorkflowTransfer:
        "id VARCHAR(80) PRIMARY KEY,actorId VARCHAR(255) NOT NULL,payload LONGTEXT NOT NULL,usedAt DATETIME(3) NULL,expiresAt DATETIME(3) NOT NULL",
    };
    for (const [name, columns] of Object.entries(tables))
      await r.query(
        `CREATE TABLE IF NOT EXISTS ${name} (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`,
      );
    for (const scope of ["requests", "inquiries"] as const) {
      const id = "legacy-" + scope,
        definition = JSON.stringify(legacyWorkflow(scope));
      await r.query(
        "INSERT IGNORE INTO Workflow(id,scope,draft) VALUES(?,?,?)",
        [id, scope, definition],
      );
      await r.query(
        "INSERT IGNORE INTO WorkflowVersion(id,workflowId,definition,legacy) VALUES(?,?,?,1)",
        [id, id, definition],
      );
      await r.query(
        "INSERT IGNORE INTO WorkflowBinding(scope,selector,versionId) VALUES(?,'*',?)",
        [scope, id],
      );
      await r.query(
        `INSERT IGNORE INTO ConversationWorkflow(scope,recordId,versionId,stageId) SELECT ?,id,?,status FROM ${scope === "requests" ? "ProjectRequest" : "Inquiry"}`,
        [scope, id],
      );
    }
  }
  async down() {
    throw new Error(
      "Destructive schema rollback is disabled; workflow history must be preserved; recover forward.",
    );
  }
}
