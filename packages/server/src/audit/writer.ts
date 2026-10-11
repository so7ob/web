import { randomBytes, createHash } from "node:crypto";
import type { QueryRunner } from "typeorm";
import type { AuditOutcome } from "@so7ob/contracts";
import { auditContext, auditWriterHealth } from "./context.js";
import { catalog, diff, safeContext, text } from "./redaction.js";
export interface AuditWriteOptions {
  actorType?: "system" | "worker" | "anonymous";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  outcome?: AuditOutcome;
  reasonCode?: string;
  batchId?: string;
  resourceRef?: string;
  source?: "api" | "worker" | "system";
}
export async function writeAudit(
  r: QueryRunner,
  action: string,
  user: { id: string; email: string; name?: string; roleKey?: string } | null,
  details: Record<string, unknown> | null,
  entityType: string,
  entityId: string | null,
  ip?: string,
  options: AuditWriteOptions = {},
): Promise<string> {
  if (!r.isTransactionActive)
    throw new Error("Audit writes require an active transaction");
  const entry = catalog(action),
    id = "c" + randomBytes(15).toString("hex"),
    ctx = auditContext.getStore();
  if (!entry) throw new Error("Unregistered audit event");
  const source = options.source ?? ctx?.source ?? "system";
  let identity = user;
  if (user && (!user.name || !user.roleKey)) {
    const [row] = await r.query(
      "SELECT id,email,name,roleKey FROM User WHERE id=?",
      [user.id],
    );
    identity = row ?? user;
  }
  const actor = {
    id: user?.id ?? null,
    type: user
      ? "user"
      : (options.actorType ?? (source === "worker" ? "worker" : "anonymous")),
    name: text(identity?.name, 100),
    roleKey: text(identity?.roleKey, 80),
    email: text(identity?.email, 200),
  };
  let before = options.before ?? {},
    after = options.after ?? {};
  const field = action.endsWith("priority_changed")
    ? "priority"
    : action.endsWith("status_changed")
      ? "status"
      : action.endsWith(".assigned")
        ? "assigneeId"
        : null;
  if (field && !options.before && !options.after && details) {
    before = Object.hasOwn(details, "from") ? { [field]: details.from } : {};
    after = Object.hasOwn(details, "to") ? { [field]: details.to } : {};
  }
  if (action === "user.role_changed" && details && !options.before) {
    before = { roleKey: details.fromRole };
    after = { roleKey: details.toRole };
  }
  const changes = diff(action, before, after),
    context = safeContext(action, details);
  const outcome =
    options.outcome ??
    (action === "user.login_failed" || action === "media.delete_blocked"
      ? "denied"
      : action === "page.schedule_skipped"
        ? "failure"
        : "success");
  const reason =
    options.reasonCode ??
    (options.before &&
    options.after &&
    JSON.stringify(options.before) === JSON.stringify(options.after)
      ? "no_change"
      : field &&
          Object.hasOwn(before, field) &&
          Object.hasOwn(after, field) &&
          JSON.stringify(before[field]) === JSON.stringify(after[field])
        ? "no_change"
        : null);
  const reference = text(
    options.resourceRef ?? details?.ref ?? details?.requestRef,
    255,
  );
  // Legacy details remain a redacted compatibility projection; raw bodies never reach either column.
  const legacy = {
    ...context,
    ...(field
      ? {
          ...(Object.hasOwn(before, field) ? { from: before[field] } : {}),
          ...(Object.hasOwn(after, field) ? { to: after[field] } : {}),
        }
      : {}),
  };
  const payload = JSON.stringify({ ...changes, context });
  if (Buffer.byteLength(payload) > 32768)
    throw new Error("Audit safe payload exceeds limit");
  try {
    await r.query(
      "INSERT INTO AuditLog(id,actorId,actorEmail,action,entityType,entityId,details,ipHash,schemaVersion,eventCode,category,outcome,isSensitive,source,reasonCode,resourceRef,actorSnapshot,eventPayload,correlationId,errorId,batchId,hasChanges,recordedAt) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))",
      [
        id,
        user?.id ?? null,
        actor.email,
        action,
        entityType,
        entityId,
        JSON.stringify(legacy),
        ip
          ? createHash("sha256")
              .update("ip:" + ip)
              .digest("hex")
          : null,
        entry ? action : null,
        entry?.category ?? "legacy",
        outcome,
        entry?.sensitive ?? false,
        source,
        reason,
        reference,
        JSON.stringify(actor),
        payload,
        ctx?.correlationId ?? null,
        outcome === "failure" || outcome === "denied"
          ? (ctx?.errorId ?? null)
          : null,
        options.batchId ?? null,
        changes.changes.length > 0,
      ],
    );
    await r.query("INSERT INTO AuditWork(eventId) VALUES(?)", [id]);
    return id;
  } catch (error) {
    auditWriterHealth.failures++;
    auditWriterHealth.lastFailureAt = new Date().toISOString();
    throw error;
  }
}
