import { z } from "zod";
import type { DataSource, QueryRunner } from "typeorm";
import type { AuthUser } from "@so7ob/contracts";
import { can } from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { lockOperation } from "../business/persistence.js";
import { permit, AuditReader } from "./reader.js";
import { validateFilter } from "./query.js";
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/);
export function validated<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AuthFault(400, "invalid");
  return parsed.data;
}
const caseInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    ownerId: identifier,
    eventIds: z.array(identifier).min(1).max(100),
  })
  .strict();
export class AuditReviews {
  constructor(private readonly db: DataSource) {}
  async preferences(actor: AuthUser) {
    permit(actor);
    const [row] = await this.db.query(
      "SELECT payload FROM AuditPreference WHERE userId=?",
      [actor.id],
    );
    return {
      ok: true,
      preferences: row
        ? JSON.parse(row.payload)
        : {
            timezone: "UTC",
            density: "comfortable",
            columns: [
              "time",
              "actor",
              "action",
              "resource",
              "outcome",
              "changes",
            ],
          },
    };
  }
  async savePreferences(actor: AuthUser, raw: unknown) {
    permit(actor);
    const data = validated(
      z
        .object({
          timezone: z.string().max(80),
          density: z.enum(["comfortable", "compact"]),
          columns: z
            .array(
              z.enum([
                "time",
                "actor",
                "action",
                "resource",
                "outcome",
                "changes",
                "source",
                "correlation",
              ]),
            )
            .min(1)
            .max(8),
        })
        .strict(),
      raw,
    );
    try {
      new Intl.DateTimeFormat("en", { timeZone: data.timezone });
    } catch {
      throw new AuthFault(400, "invalid");
    }
    await this.db.query(
      "INSERT INTO AuditPreference(userId,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updatedAt=UTC_TIMESTAMP(3)",
      [actor.id, JSON.stringify(data)],
    );
    return { ok: true };
  }
  async views(actor: AuthUser) {
    permit(actor);
    const rows = await this.db.query(
      "SELECT id,name,filters,createdAt FROM AuditView WHERE userId=? ORDER BY createdAt,id",
      [actor.id],
    );
    return {
      ok: true,
      views: rows.map((r: Record<string, unknown>) => ({
        ...r,
        filters: JSON.parse(String(r.filters)),
      })),
    };
  }
  async saveView(actor: AuthUser, raw: unknown) {
    permit(actor);
    const input = validated(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            filters: z.unknown(),
          })
          .strict(),
        raw,
      ),
      filters = validateFilter(input.filters);
    delete filters.cursor;
    delete filters.ids;
    return transaction(this.db, async (r) => {
      await lockOperation(r, "audit-views:" + actor.id);
      const [count] = await r.query(
        "SELECT COUNT(*) n FROM AuditView WHERE userId=?",
        [actor.id],
      );
      if (Number(count.n) >= 30) throw new AuthFault(400, "too_many");
      const id = newId();
      await r.query(
        "INSERT INTO AuditView(id,userId,name,filters) VALUES(?,?,?,?)",
        [id, actor.id, input.name, JSON.stringify(filters)],
      );
      return { ok: true, id };
    });
  }
  async deleteView(actor: AuthUser, id: string) {
    permit(actor);
    await this.db.query("DELETE FROM AuditView WHERE id=? AND userId=?", [
      id,
      actor.id,
    ]);
    return { ok: true };
  }
  async bookmarks(actor: AuthUser) {
    permit(actor, "audit.review");
    return {
      ok: true,
      bookmarks: await this.db.query(
        "SELECT eventId,createdAt FROM AuditBookmark WHERE userId=? ORDER BY createdAt DESC LIMIT 1000",
        [actor.id],
      ),
    };
  }
  async bookmark(actor: AuthUser, id: string, enabled: boolean) {
    permit(actor, "audit.review");
    await new AuditReader(this.db).detail(actor, id);
    return transaction(this.db, async (r) => {
      if (enabled)
        await r.query(
          "INSERT IGNORE INTO AuditBookmark(userId,eventId) VALUES(?,?)",
          [actor.id, id],
        );
      else
        await r.query(
          "DELETE FROM AuditBookmark WHERE userId=? AND eventId=?",
          [actor.id, id],
        );
      await audit(
        r,
        "audit.review_changed",
        actor,
        { state: enabled ? "flagged" : "unflagged" },
        "audit",
        id,
      );
      return { ok: true };
    });
  }
  async cases(actor: AuthUser) {
    permit(actor, "audit.review");
    return {
      ok: true,
      cases: await this.db.query(
        "SELECT c.*,(SELECT COUNT(*) FROM AuditCaseEvent e WHERE e.caseId=c.id) eventCount FROM AuditCase c ORDER BY updatedAt DESC,id DESC LIMIT 100",
      ),
    };
  }
  private async owner(r: QueryRunner, id: string) {
    const [u] = await r.query(
      "SELECT u.id,u.roleKey,u.status,r.permissions FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?",
      [id],
    );
    let permissions = [];
    try {
      permissions = JSON.parse(u?.permissions ?? "[]");
    } catch {
      /* corrupted role fails closed */
    }
    if (
      !u ||
      u.status !== "active" ||
      !can({ ...u, permissions }, "audit.view") ||
      !can({ ...u, permissions }, "audit.review")
    )
      throw new AuthFault(400, "invalid_assignee");
  }
  async createCase(actor: AuthUser, raw: unknown) {
    permit(actor, "audit.cases.manage");
    const input = validated(caseInput, raw);
    return transaction(this.db, async (r) => {
      await this.owner(r, input.ownerId);
      const ids = [...new Set(input.eventIds)];
      const rows = await r.query(
        `SELECT id FROM AuditLog WHERE id IN (${ids.map(() => "?").join(",")}) LOCK IN SHARE MODE`,
        ids,
      );
      if (rows.length !== ids.length) throw new AuthFault(404, "not_found");
      const id = newId();
      await r.query("INSERT INTO AuditCase(id,title,ownerId) VALUES(?,?,?)", [
        id,
        input.title,
        input.ownerId,
      ]);
      for (const eventId of ids)
        await r.query(
          "INSERT INTO AuditCaseEvent(caseId,eventId) VALUES(?,?)",
          [id, eventId],
        );
      await this.history(r, actor, id, "created", input.title);
      await audit(
        r,
        "audit.case_changed",
        actor,
        { caseId: id, state: "new", count: ids.length },
        "audit_case",
        id,
      );
      return { ok: true, id };
    });
  }
  async caseDetail(actor: AuthUser, id: string) {
    permit(actor, "audit.review");
    const [item] = await this.db.query("SELECT * FROM AuditCase WHERE id=?", [
      id,
    ]);
    if (!item) throw new AuthFault(404, "not_found");
    return {
      ok: true,
      case: item,
      events: await this.db.query(
        "SELECT eventId FROM AuditCaseEvent WHERE caseId=? ORDER BY eventId",
        [id],
      ),
      history: await this.db.query(
        "SELECT * FROM AuditCaseHistory WHERE caseId=? ORDER BY createdAt,id",
        [id],
      ),
    };
  }
  private async history(
    r: QueryRunner,
    actor: AuthUser,
    id: string,
    kind: string,
    body: string,
  ) {
    await r.query(
      "INSERT INTO AuditCaseHistory(id,caseId,actorId,actorName,kind,body) VALUES(?,?,?,?,?,?)",
      [newId(), id, actor.id, actor.name.slice(0, 100), kind, body],
    );
  }
  async updateCase(actor: AuthUser, id: string, raw: unknown) {
    permit(actor, "audit.review");
    const input = validated(
      z
        .object({
          revision: z.number().int().nonnegative(),
          state: z.enum(["new", "reviewing", "closed"]).optional(),
          note: z.string().trim().min(1).max(2000).optional(),
          closureReason: z.string().trim().min(1).max(2000).optional(),
          held: z.boolean().optional(),
          ownerId: identifier.optional(),
          eventIds: z.array(identifier).min(1).max(100).optional(),
        })
        .strict(),
      raw,
    );
    if (input.state || input.ownerId || input.eventIds)
      permit(actor, "audit.cases.manage");
    if (input.held !== undefined) permit(actor, "audit.policy.manage");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "audit-retention");
      const [item] = await r.query(
        "SELECT * FROM AuditCase WHERE id=? FOR UPDATE",
        [id],
      );
      if (!item) throw new AuthFault(404, "not_found");
      if (item.revision !== input.revision)
        throw new AuthFault(409, "conflict");
      if (input.state === "closed" && !input.closureReason)
        throw new AuthFault(400, "required");
      if (input.ownerId) await this.owner(r, input.ownerId);
      if (input.eventIds)
        for (const eventId of [...new Set(input.eventIds)]) {
          if (
            !(
              await r.query(
                "SELECT id FROM AuditLog WHERE id=? LOCK IN SHARE MODE",
                [eventId],
              )
            ).length
          )
            throw new AuthFault(404, "not_found");
          await r.query(
            "INSERT IGNORE INTO AuditCaseEvent(caseId,eventId) VALUES(?,?)",
            [id, eventId],
          );
        }
      await r.query(
        "UPDATE AuditCase SET state=?,ownerId=?,held=?,closureReason=?,revision=revision+1,updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [
          input.state ?? item.state,
          input.ownerId ?? item.ownerId,
          input.held ?? item.held,
          input.closureReason ?? item.closureReason,
          id,
        ],
      );
      await this.history(
        r,
        actor,
        id,
        input.note ? "comment" : input.held !== undefined ? "hold" : "changed",
        input.note ??
          JSON.stringify({
            state: input.state ?? item.state,
            ownerId: input.ownerId ?? item.ownerId,
            held: input.held ?? !!item.held,
            closureReason: input.closureReason ?? null,
          }),
      );
      await audit(
        r,
        input.held !== undefined ? "audit.hold_changed" : "audit.case_changed",
        actor,
        {
          caseId: id,
          state: input.state ?? item.state,
          held: input.held ?? !!item.held,
        },
        "audit_case",
        id,
      );
      return { ok: true };
    });
  }
  async assignees(actor: AuthUser) {
    permit(actor, "audit.cases.manage");
    const users = await this.db.query(
      "SELECT u.id,u.name,u.roleKey,r.permissions FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.status='active' AND u.roleKey<>'client' ORDER BY u.name LIMIT 200",
    );
    return {
      ok: true,
      users: users
        .filter((u: Record<string, unknown>) => {
          let permissions = [];
          try {
            permissions = JSON.parse(String(u.permissions));
          } catch {
            /* fail closed */
          }
          return (
            can({ roleKey: String(u.roleKey), permissions }, "audit.view") &&
            can({ roleKey: String(u.roleKey), permissions }, "audit.review")
          );
        })
        .map((u: Record<string, unknown>) => ({ id: u.id, name: u.name })),
    };
  }
}
