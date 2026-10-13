import {auditWorkflowAccessSql} from "../workflows/access.js";
import {
  AUDIT_CATALOG,
  can,
  type AuditEventV1,
  type AuthUser,
  type AuditSearchResponse,
  type AuditStats,
  type AuditFilter,
} from "@so7ob/contracts";
import type { DataSource, QueryRunner } from "typeorm";
import { AuthFault, audit, transaction } from "../auth/persistence.js";
import {
  aliases,
  validateFilter,
  predicate,
  decodeCursor,
  encodeCursor,
} from "./query.js";
import {
  catalog,
  parse,
  safeChanges,
  safeContext,
  text,
  diff,
} from "./redaction.js";
export function permit(
  actor: AuthUser,
  permission: Parameters<typeof can>[1] = "audit.view",
) {
  if (!can(actor, "audit.view") || !can(actor, permission))
    throw new AuthFault(403, "forbidden");
}
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
export function project(
  row: Record<string, unknown>,
  actor: AuthUser,
  detail = true,
): AuditEventV1 {
  const action = String(row.action),
    entry = catalog(action),
    legacy = Number(row.schemaVersion) !== 1;
  const payload = parse(row.eventPayload),
    identity = parse(row.actorSnapshot),
    old = parse(row.details);
  const resourceType =
    Object.entries(aliases).find(([, names]) =>
      names.includes(String(row.entityType)),
    )?.[0] ?? String(row.entityType);
  const field = action.endsWith("priority_changed")
    ? "priority"
    : action.endsWith("status_changed")
      ? "status"
      : action.endsWith(".assigned")
        ? "assigneeId"
        : null;
  let changes = safeChanges(action, payload?.changes);
  if (legacy && field && old) {
    changes = diff(
      action,
      Object.hasOwn(old, "from") ? { [field]: old.from } : {},
      Object.hasOwn(old, "to") ? { [field]: old.to } : {},
    ).changes.map((c) => ({
      ...c,
      before: Object.hasOwn(old, "from")
        ? c.before
        : { state: "unrecorded" as const },
      after: Object.hasOwn(old, "to")
        ? c.after
        : { state: "unrecorded" as const },
    }));
  }
  const event: AuditEventV1 = {
    id: String(row.id),
    schemaVersion: legacy ? 0 : 1,
    occurredAt: iso(row.createdAt),
    recordedAt: row.recordedAt ? iso(row.recordedAt) : null,
    actor: {
      id: row.actorId ? String(row.actorId) : null,
      type: legacy
        ? "unknown"
        : identity?.type === "user"
          ? "user"
          : identity?.type === "worker"
            ? "worker"
            : identity?.type === "system"
              ? "system"
              : identity?.type === "anonymous"
                ? "anonymous"
                : "unknown",
      name: legacy ? null : text(identity?.name, 100),
      roleKey: legacy ? null : text(identity?.roleKey, 80),
    },
    resource: {
      type: resourceType,
      id: row.entityId ? String(row.entityId) : null,
      reference: text(row.resourceRef ?? old?.ref ?? old?.requestRef),
    },
    action: entry ? action : "legacy.unknown",
    category: legacy ? (entry?.category ?? "legacy") : String(row.category),
    sensitive: !!row.isSensitive || !!entry?.sensitive,
    outcome: legacy
      ? "unknown"
      : ["success", "denied", "failure"].includes(String(row.outcome))
        ? (row.outcome as "success")
        : "unknown",
    reasonCode: text(row.reasonCode, 80),
    changes: detail ? changes : changes.slice(0, 3),
    changesTruncated:
      payload?.changesTruncated === true || (!detail && changes.length > 3),
    safeFields: detail
      ? Object.fromEntries(
          safeChanges(
            action,
            Object.entries(parse(payload?.safeFields) ?? {}).map(
              ([path, after]) => ({
                path,
                before: { state: "unrecorded" },
                after,
              }),
            ),
          ).map((c) => [c.path, c.after]),
        )
      : {},
    context: detail ? safeContext(action, legacy ? old : payload?.context) : {},
    correlationId: text(row.correlationId, 36),
    errorId: text(row.errorId, 36),
    batchId: text(row.batchId, 64),
    source:
      legacy || !["api", "worker", "system"].includes(String(row.source))
        ? "unknown"
        : String(row.source),
    historical: legacy,
    malformed: legacy ? !!row.details && !old : !payload || !identity,
  };
  if (can(actor, "audit.sensitive.view")) {
    event.actor.email = text(legacy ? row.actorEmail : identity?.email, 200);
    event.ipHash =
      typeof row.ipHash === "string" && /^[a-f0-9]{64}$/.test(row.ipHash)
        ? row.ipHash
        : null;
  }
  if (event.resource.id && /^[a-zA-Z0-9_-]{1,255}$/.test(event.resource.id)) {
    const links = {
      request: ["requests.view.all", "requests"],
      inquiry: ["inquiries.view.all", "inquiries"],
      user: ["users.view", "users"],
      page: ["pages.view", "pages"],
    } as const;
    if (Object.hasOwn(links, resourceType)) {
      const [permission, path] = links[resourceType as keyof typeof links];
      if (can(actor, permission))
        event.resourceUrl = `/admin/${path}/${encodeURIComponent(event.resource.id)}`;
    }
  }
  if (event.errorId && can(actor, "diagnostics.view"))
    event.diagnosticUrl =
      "/admin/diagnostics?q=" + encodeURIComponent(event.errorId);
  return event;
}
export class AuditReader {
  constructor(readonly db: DataSource) {}
  async search(actor: AuthUser, raw: unknown): Promise<AuditSearchResponse> {
    permit(actor);
    const filter = validateFilter(raw),
      { sql, args } = predicate(filter, actor),
      cursor = decodeCursor(filter, actor);
    const r = this.db.createQueryRunner();
    await r.connect();
    await r.startTransaction("REPEATABLE READ");
    try {
      const stats = await this.stats(r, sql, args);
      const rows = await r.query(
        `SELECT a.* FROM AuditLog a WHERE ${sql}${cursor ? " AND (a.createdAt<? OR (a.createdAt=? AND a.id<?))" : ""} ORDER BY a.createdAt DESC,a.id DESC LIMIT ?`,
        [
          ...args,
          ...(cursor ? [cursor.time, cursor.time, cursor.id] : []),
          filter.limit! + 1,
        ],
      );
      const next = rows.length > filter.limit!;
      if (next) rows.pop();
      await r.commitTransaction();
      const last = rows.at(-1);
      return {
        ok: true,
        rows: rows.map((row: Record<string, unknown>) =>
          project(row, actor, false),
        ),
        stats,
        nextCursor: next
          ? encodeCursor(filter, actor, iso(last.createdAt), last.id)
          : null,
        measuredAt: new Date().toISOString(),
      };
    } catch (e) {
      await r.rollbackTransaction();
      throw e;
    } finally {
      await r.release();
    }
  }
  async stats(
    r: Pick<QueryRunner, "query">,
    sql: string,
    args: unknown[],
  ): Promise<AuditStats> {
    const sensitiveCodes = Object.entries(AUDIT_CATALOG)
      .filter(([, entry]) => entry.sensitive)
      .map(([code]) => code);
    const [v] = await r.query(
      `SELECT COUNT(*) events,SUM(a.isSensitive OR a.action IN (${sensitiveCodes.map(() => "?").join(",")})) sensitiveCount,SUM(a.outcome='denied') denied,SUM(a.outcome='failure') failed,SUM(a.outcome='unknown' OR a.schemaVersion=0) unknown,COUNT(DISTINCT a.actorId) actors,COUNT(DISTINCT CASE WHEN a.entityType NOT IN ('batch','audit','audit_report','auth_flow') THEN CONCAT(a.entityType,':',a.entityId) END) resources,COUNT(DISTINCT a.batchId) batches FROM AuditLog a WHERE ${sql}`,
      [...sensitiveCodes, ...args],
    );
    return Object.fromEntries(
      Object.entries(v).map(([k, v]) => [
        k === "sensitiveCount" ? "sensitive" : k,
        Number(v ?? 0),
      ]),
    ) as unknown as AuditStats;
  }
  /** A polling hint exposes no event bodies and does not create access evidence. */
  async check(actor: AuthUser, raw: unknown) {
    permit(actor);
    const filter = validateFilter(raw),
      { sql, args } = predicate(filter, actor);
    const [head] = await this.db.query(
      `SELECT a.id FROM AuditLog a WHERE ${sql} ORDER BY a.createdAt DESC,a.id DESC LIMIT 1`,
      args,
    );
    const [count] = await this.db.query(
      `SELECT COUNT(*) n FROM AuditLog a WHERE ${sql}`,
      args,
    );
    return {
      ok: true as const,
      latestId: head?.id ?? null,
      count: Number(count.n),
    };
  }
  async detail(actor: AuthUser, id: string) {
    permit(actor);
    if (!/^[a-zA-Z0-9_-]{1,255}$/.test(id)) throw new AuthFault(400, "invalid");
    const [row] = await this.db.query(`SELECT a.* FROM AuditLog a WHERE a.id=? AND (${auditWorkflowAccessSql(actor)})`, [
      id,
    ]);
    if (!row) throw new AuthFault(404, "not_found");
    const event = project(row, actor);
    if (event.resourceUrl) {
      const table = {
        request: "ProjectRequest",
        inquiry: "Inquiry",
        user: "User",
        page: "Page",
      }[event.resource.type];
      if (table) {
        event.resourceState = (
          await this.db.query(`SELECT id FROM ${table} WHERE id=?`, [
            event.resource.id,
          ])
        ).length
          ? "present"
          : "deleted";
        if (event.resourceState === "deleted") delete event.resourceUrl;
      }
    }
    return { ok: true, event };
  }
  async related(
    actor: AuthUser,
    id: string,
    kind: "resource" | "batch" | "correlation",
    cursor?: string,
  ) {
    const { event } = await this.detail(actor, id);
    const filter: AuditFilter =
      kind === "resource"
        ? {
            resourceType: event.resource.type,
            resourceId: event.resource.id ?? "__none__",
          }
        : kind === "batch"
          ? { batchId: event.batchId ?? "__none__" }
          : { correlationId: event.correlationId ?? "__none__" };
    return this.search(actor, { ...filter, cursor, includeAccess: true });
  }
  async access(actor: AuthUser, id?: string) {
    permit(actor);
    if (id) await this.detail(actor, id);
    return transaction(this.db, async (r) => {
      const key = id ?? "audit",
        bucket = Math.floor(Date.now() / 300000);
      const result = await r.query(
        "INSERT IGNORE INTO AuditAccess(userId,resourceId,bucket) VALUES(?,?,?)",
        [actor.id, key, bucket],
      );
      if (result.affectedRows)
        await audit(
          r,
          id ? "audit.detail_viewed" : "audit.opened",
          actor,
          null,
          "audit",
          id ?? null,
        );
      return { ok: true };
    });
  }
  async legacy(
    actor: AuthUser,
    q: { q?: string; entity?: string; page?: string },
  ) {
    const page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 100)
      throw new AuthFault(400, "invalid");
    const filter = validateFilter({
        q: q.q,
        resourceType: q.entity,
        includeAccess: true,
      }),
      { sql, args } = predicate(filter, actor);
    permit(actor);
    await this.access(actor);
    const rows = await this.db.query(
      `SELECT a.* FROM AuditLog a WHERE ${sql} ORDER BY a.createdAt DESC,a.id DESC LIMIT 30 OFFSET ?`,
      [...args, (page - 1) * 30],
    );
    const [count] = await this.db.query(
      `SELECT COUNT(*) n FROM AuditLog a WHERE ${sql}`,
      args,
    );
    return {
      ok: true,
      total: Number(count.n),
      page,
      pageSize: 30,
      logs: rows.map((row: Record<string, unknown>) => {
        const e = project(row, actor);
        return {
          id: e.id,
          actor: e.actor.name ?? "Unknown",
          actorEmail: e.actor.email ?? null,
          action: e.action,
          entityType: e.resource.type,
          entityId: e.resource.id,
          createdAt: e.occurredAt,
          details: {
            ...e.context,
            changes: e.changes,
            historical: e.historical,
          },
        };
      }),
    };
  }
}
