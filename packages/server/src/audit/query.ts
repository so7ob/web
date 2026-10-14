import {auditWorkflowAccessSql} from "../workflows/access.js";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AUDIT_CATALOG,
  AUDIT_OUTCOMES,
  can,
  type AuthUser,
  type AuditFilter,
} from "@so7ob/contracts";
import { AuthFault } from "../auth/persistence.js";
export const aliases: Record<string, string[]> = {
  request: ["request", "project_request", "ProjectRequest"],
  inquiry: ["inquiry", "Inquiry"],
  user: ["user", "User"],
  page: ["page", "Page"],
  media: ["media", "MediaItem"],
  template: ["template", "page_template", "PageTemplate"],
};
export function validateFilter(raw: unknown): AuditFilter {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AuthFault(400, "invalid");
  const data = raw as Record<string, unknown>,
    out: Record<string, unknown> = {};
  for (const key of [
    "q",
    "from",
    "to",
    "resourceType",
    "resourceId",
    "action",
    "category",
    "outcome",
    "source",
    "batchId",
    "correlationId",
    "cursor",
  ])
    if (data[key] !== undefined && data[key] !== "") {
      if (
        typeof data[key] !== "string" ||
        data[key].length > (key === "cursor" ? 2048 : key === "q" ? 200 : 255)
      )
        throw new AuthFault(400, "invalid");
      out[key] = data[key];
    }
  for (const key of ["actors", "ids"])
    if (data[key] !== undefined) {
      if (
        !Array.isArray(data[key]) ||
        data[key].length > (key === "actors" ? 20 : 1000) ||
        data[key].some(
          (v) => typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(v),
        )
      )
        throw new AuthFault(400, "invalid");
      out[key] = [...new Set(data[key])].sort();
    }
  for (const key of ["hasChanges", "includeAccess"])
    if (data[key] !== undefined) {
      if (typeof data[key] !== "boolean") throw new AuthFault(400, "invalid");
      out[key] = data[key];
    }
  for (const key of ["from", "to"])
    if (out[key]) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          String(out[key]),
        ) ||
        !z.iso.datetime({ offset: true }).safeParse(String(out[key])).success
      )
        throw new AuthFault(400, "invalid");
      out[key] = new Date(String(out[key])).toISOString();
    }
  if (out.from && out.to && String(out.from) >= String(out.to))
    throw new AuthFault(400, "invalid");
  if (
    out.outcome &&
    !AUDIT_OUTCOMES.includes(out.outcome as (typeof AUDIT_OUTCOMES)[number])
  )
    throw new AuthFault(400, "invalid");
  if (
    out.source &&
    !["api", "worker", "system", "unknown"].includes(String(out.source))
  )
    throw new AuthFault(400, "invalid");
  if (
    data.limit !== undefined &&
    (!Number.isInteger(data.limit) ||
      Number(data.limit) < 1 ||
      Number(data.limit) > 100)
  )
    throw new AuthFault(400, "invalid");
  out.limit = data.limit ?? 50;
  return out as AuditFilter;
}
export function predicate(filter: AuditFilter, actor: AuthUser) {
  const where = [auditWorkflowAccessSql(actor)],
    args: unknown[] = [];
  if (!filter.includeAccess)
    where.push(
      "a.action NOT IN ('audit.opened','audit.detail_viewed','audit.health_probe')",
    );
  for (const [key, column] of [
    ["resourceId", "entityId"],
    ["action", "action"],
    ["outcome", "outcome"],
    ["source", "source"],
    ["batchId", "batchId"],
    ["correlationId", "correlationId"],
  ] as const)
    if (filter[key]) {
      where.push(`a.${column}=?`);
      args.push(filter[key]);
    }
  if (filter.resourceType) {
    const names = Object.hasOwn(aliases, filter.resourceType)
      ? aliases[filter.resourceType]
      : [filter.resourceType];
    where.push(`a.entityType IN (${names.map(() => "?").join(",")})`);
    args.push(...names);
  }
  if (filter.category) {
    const codes = Object.entries(AUDIT_CATALOG)
      .filter(([, e]) => e.category === filter.category)
      .map(([code]) => code);
    where.push(
      `(a.category=?${codes.length ? ` OR (a.schemaVersion=0 AND a.action IN (${codes.map(() => "?").join(",")}))` : ""})`,
    );
    args.push(filter.category, ...codes);
  }
  for (const [key, column] of [
    ["actors", "actorId"],
    ["ids", "id"],
  ] as const)
    if (filter[key]) {
      const values = filter[key]!;
      where.push(
        values.length
          ? `a.${column} IN (${values.map(() => "?").join(",")})`
          : "0=1",
      );
      args.push(...values);
    }
  if (filter.from) {
    where.push("a.createdAt>=?");
    args.push(new Date(filter.from));
  }
  if (filter.to) {
    where.push("a.createdAt<?");
    args.push(new Date(filter.to));
  }
  if (filter.hasChanges !== undefined) {
    where.push("a.hasChanges=?");
    args.push(filter.hasChanges);
  }
  if (filter.q && /^(?:REQ|S7|INQ)-[A-Za-z0-9-]+$/.test(filter.q)) {
    where.push("a.resourceRef LIKE ?");
    args.push(filter.q + "%");
  } else if (
    filter.q &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      filter.q,
    )
  ) {
    where.push("(a.correlationId=? OR a.errorId=?)");
    args.push(filter.q, filter.q);
  } else if (filter.q) {
    const pattern = "%" + filter.q.replace(/[\\%_]/g, "\\$&") + "%";
    const columns = [
      "a.id",
      "a.action",
      "a.entityId",
      "a.resourceRef",
      "a.actorId",
      "a.correlationId",
      "a.batchId",
      "JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(a.actorSnapshot),a.actorSnapshot,'{}'),'$.name'))",
      ...(can(actor, "audit.sensitive.view") ? ["a.actorEmail"] : []),
    ];
    where.push("(" + columns.map((c) => `${c} LIKE ?`).join(" OR ") + ")");
    args.push(...columns.map(() => pattern));
  }
  return { sql: where.join(" AND "), args };
}
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Audit cursors require AUTH_SECRET");
  return secret;
}
const sign = (s: string) =>
  createHmac("sha256", key())
    .update("audit-cursor:v1:" + s)
    .digest("hex");
function binding(f: AuditFilter, a: AuthUser) {
  const { cursor: _c, ...rest } = f;
  return sign(JSON.stringify([a.id, can(a, "audit.sensitive.view"), rest]));
}
export function encodeCursor(
  f: AuditFilter,
  a: AuthUser,
  time: string,
  id: string,
) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      binding: binding(f, a),
      time,
      id,
      expires: Date.now() + 3600000,
    }),
  ).toString("base64url");
  return payload + "." + sign(payload);
}
export function decodeCursor(
  f: AuditFilter,
  a: AuthUser,
): { time: Date; id: string } | null {
  if (!f.cursor) return null;
  try {
    const [p, signature, extra] = f.cursor.split(".");
    if (
      extra ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(sign(p), "hex"),
        Buffer.from(signature, "hex"),
      )
    )
      throw new Error();
    const c = JSON.parse(Buffer.from(p, "base64url").toString());
    if (
      c.v !== 1 ||
      c.binding !== binding(f, a) ||
      c.expires < Date.now() ||
      typeof c.id !== "string" ||
      !Number.isFinite(Date.parse(c.time))
    )
      throw new Error();
    return { time: new Date(c.time), id: c.id };
  } catch {
    throw new AuthFault(400, "invalid");
  }
}
