import type { DataSource, QueryRunner } from "typeorm";
import { z } from "zod";
import {
  can,
  type AuthUser,
  type WorkflowScope,
  type WorkflowPublicStage,
} from "@so7ob/contracts";
import { AuthFault } from "../auth/persistence.js";
export const names = (scope: WorkflowScope) =>
  scope === "requests"
    ? ({
        table: "ProjectRequest",
        message: "RequestMessage",
        fk: "requestId",
      } as const)
    : ({
        table: "Inquiry",
        message: "InquiryMessage",
        fk: "inquiryId",
      } as const);
const literal = (s: string) =>
  `CONVERT(0x${Buffer.from(s).toString("hex")} USING utf8mb4)`;
/** Parameters cannot be shared across independent aggregate subqueries; hex literals encode identity, never SQL. */
export function workflowAccessSql(
  actor: AuthUser,
  scope: WorkflowScope,
  alias: string,
) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias))
    throw new Error("Invalid static alias");
  if (can(actor, "workflows.supervise")) return "1=1";
  const id = literal(actor.id);
  return `NOT EXISTS(SELECT 1 FROM ConversationWorkflow wa WHERE wa.scope='${scope}' AND wa.recordId=${alias}.id AND wa.visibility='assigned' AND COALESCE(${alias}.assigneeId,'')<>${id} AND NOT EXISTS(SELECT 1 FROM WorkTeamMember wm JOIN WorkTeam wt ON wt.id=wm.teamId AND wt.active=1 WHERE wm.teamId=wa.teamId AND wm.userId=${id}))`;
}
export async function assertWorkflowAccess(
  db: DataSource | QueryRunner,
  actor: AuthUser,
  scope: WorkflowScope,
  id: string,
  allowOwner = false,
) {
  const n = names(scope);
  const lock =
    "isTransactionActive" in db && db.isTransactionActive ? " FOR UPDATE" : "";
  const [row] = await db.query(
    `SELECT p.id FROM ${n.table} p WHERE p.id=? AND (${allowOwner ? "p.clientId=? OR " : ""}${workflowAccessSql(actor, scope, "p")})${lock}`,
    allowOwner ? [id, actor.id] : [id],
  );
  if (!row) throw new AuthFault(404, "not_found");
}
export async function publicWorkflowStage(
  db: DataSource | QueryRunner,
  scope: WorkflowScope,
  id: string,
): Promise<WorkflowPublicStage | null> {
  const [row] = await db.query(
    "SELECT w.stageId,v.definition,v.legacy FROM ConversationWorkflow w JOIN WorkflowVersion v ON v.id=w.versionId WHERE w.scope=? AND w.recordId=?",
    [scope, id],
  );
  if (!row || row.legacy) return null;
  const s = JSON.parse(row.definition).stages.find(
    (s: { id: string }) => s.id === row.stageId,
  );
  return s
    ? { nameAr: s.nameAr, nameEn: s.nameEn, status: s.status }
    : null;
}
export function notificationAccessSql(actor: AuthUser, alias = "Notification") {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias))
    throw new Error("Invalid static alias");
  return (["requests", "inquiries"] as const)
    .map(
      (scope) =>
        `(${alias}.link IS NULL OR ${alias}.link NOT LIKE '%/admin/${scope}/%' OR EXISTS(SELECT 1 FROM ${names(scope).table} np WHERE np.id=SUBSTRING_INDEX(${alias}.link,'/',-1) AND (${workflowAccessSql(actor, scope, "np")})))`,
    )
    .join(" AND ");
}

/** A scalar public projection keeps paginated customer lists at two queries. */
export function publicStageSql(scope: WorkflowScope, alias: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias))
    throw new Error("Invalid static alias");
  return `(SELECT JSON_OBJECT('nameAr',ws.nameAr,'nameEn',ws.nameEn,'status',ws.status) FROM ConversationWorkflow cw JOIN WorkflowVersion v ON v.id=cw.versionId JOIN JSON_TABLE(v.definition,'$.stages[*]' COLUMNS(id VARCHAR(80) PATH '$.id',nameAr VARCHAR(120) PATH '$.nameAr',nameEn VARCHAR(120) PATH '$.nameEn',status VARCHAR(32) PATH '$.status')) ws ON ws.id=cw.stageId WHERE cw.scope='${scope}' AND cw.recordId=${alias}.id AND v.legacy=0 LIMIT 1)`;
}

const publicStageSchema = z.object({
  nameAr: z.string(),
  nameEn: z.string(),
  status: z.string(),
});
/** mysql2 can return a JSON expression as text or an already decoded object. */
export function decodePublicStage(value: unknown): WorkflowPublicStage | null {
  if (value === null) return null;
  return publicStageSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

/** Audit views retain their own permissions but do not disclose a hidden conversation. */
export function auditWorkflowAccessSql(actor: AuthUser, alias = "a") {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(alias))
    throw new Error("Invalid static alias");
  return (["requests", "inquiries"] as const)
    .map(
      (scope) =>
        `(${alias}.entityType NOT IN (${scope === "requests" ? "'request','project_request','ProjectRequest'" : "'inquiry','Inquiry'"}) OR NOT EXISTS(SELECT 1 FROM ${names(scope).table} waudit WHERE (waudit.id=${alias}.entityId OR waudit.refCode=${alias}.entityId) AND NOT (${workflowAccessSql(actor, scope, "waudit")})))`,
    )
    .join(" AND ");
}
