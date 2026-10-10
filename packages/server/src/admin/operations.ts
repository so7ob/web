import {workerHealth} from '../queue/monitor.js';
import {snapshot,revisions,advance} from "./revisions.js";
import { OUTBOX_STATUSES, type OutboxResponse, type OutboxStatus } from "@so7ob/contracts";
import type { DataSource } from "typeorm";
import { can, isTrackMode, type AuthUser, type Permission } from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { insertRecord, lockOperation } from "../business/persistence.js";
import { sqliteLike } from "../business/requests.js";
const allowedSettings = [
  "track.forceLogin",
  "track.requestsMode",
  "track.inquiriesMode",
  "track.linkTtlDays",
  "track.allowGuestAttachments",
  "contact.email",
  "contact.phone",
  "contact.address",
  "social.github",
  "site.nameAr",
  "site.nameEn",
  "announcement.enabled",
  "announcement.messageAr",
  "announcement.messageEn",
  "announcement.ctaLabelAr",
  "announcement.ctaLabelEn",
  "announcement.ctaUrl",
  "announcement.variant",
  "announcement.startAt",
  "announcement.endAt",
];
export const requirePermission = (actor: AuthUser, p: Permission) => {
  if (!can(actor, p)) throw new AuthFault(403, "forbidden");
};
export const pageNumber = (value?: string) => {
  const n = Number(value ?? 1);
  return Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1;
};
export class AdminOperationsService {
  constructor(private readonly db: DataSource) {}
  async workerHealth(actor:AuthUser){return workerHealth(this.db,actor);}
  async settings(actor: AuthUser) {
    requirePermission(actor, "settings.manage");
    return snapshot(this.db,async r=>{
      const rows:Array<{key:string;value:string}>=await r.query('SELECT `key`,value FROM SiteSetting');
      const versions=await revisions(r);
      return {ok:true,settings:Object.fromEntries(rows.map(row=>[row.key,row.value])),
        revisions:Object.fromEntries(allowedSettings.map(key=>[key,versions['setting:'+key]??'0']))};
    });
  }

  async updateSettings(actor: AuthUser, body: Record<string, unknown>, checked=false) {
    requirePermission(actor, "settings.manage");
    const updates: Array<{ key: string; value: string }> = [];
    for (const key of allowedSettings)
      if (body[key] !== undefined) {
        const value = String(body[key] ?? "").slice(0, 300);
        if (
          key === "contact.email" &&
          value &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
        )
          throw new AuthFault(400, "invalid_email");
        if (key === "social.github" && value && !/^https?:\/\//.test(value))
          throw new AuthFault(400, "invalid_url");
        if (
          key === "contact.phone" &&
          value &&
          !/^[+]?[\d\s\-()]{7,20}$/.test(value)
        )
          throw new AuthFault(400, "invalid_phone");
        if (
          (["announcement.messageAr", "announcement.messageEn"].includes(key) &&
            value.length > 280) ||
          (["announcement.ctaLabelAr", "announcement.ctaLabelEn"].includes(
            key,
          ) &&
            value.length > 60)
        )
          throw new AuthFault(400, "invalid");
        if (
          key === "announcement.ctaUrl" &&
          (value.length > 200 || (value && !/^(\/|https?:\/\/)/.test(value)))
        )
          throw new AuthFault(400, "invalid_url");
        if (
          (key === "announcement.variant" &&
            !["info", "warning", "success", "brand"].includes(value)) ||
          (key === "announcement.enabled" && !["true", "false"].includes(value))
        )
          throw new AuthFault(400, "invalid");
        if (
          ["announcement.startAt", "announcement.endAt"].includes(key) &&
          value &&
          !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
            value,
          )
        )
          throw new AuthFault(400, "invalid");
        if (["track.forceLogin", "track.allowGuestAttachments"].includes(key) && !["true", "false"].includes(value)) throw new AuthFault(400, "invalid");
        if (["track.requestsMode", "track.inquiriesMode"].includes(key) && !isTrackMode(value)) throw new AuthFault(400, "invalid_track_mode");
        if (key === "track.linkTtlDays") {
          const ttl = Number.parseInt(value, 10);
          if (!Number.isFinite(ttl) || String(ttl) !== value || ttl < 1 || ttl > 3650) throw new AuthFault(400, "invalid_track_ttl");
        }
        updates.push({ key, value });
      }
    if (!updates.length) throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "site-settings");
      const bases=body.baseRevisions && typeof body.baseRevisions==='object' ? body.baseRevisions as Record<string,unknown> : {};
      for(const update of updates) await advance(r,'setting:'+update.key,Object.hasOwn(bases,update.key)?bases[update.key]:undefined,checked);
      if (updates.some(u => u.key.startsWith("track."))) await lockOperation(r, "track-policy");
      if (updates.some((u) => u.key.startsWith("announcement.")))
        updates.push({
          key: "announcement.revision",
          value: String(Date.now()),
        });
      for (const u of updates)
        await r.query(
          "INSERT INTO SiteSetting(`key`,value,updatedById) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updatedById=VALUES(updatedById),updatedAt=UTC_TIMESTAMP(3)",
          [u.key, u.value, actor.id],
        );
      await audit(
        r,
        "settings.updated",
        actor,
        { keys: updates.map((u) => u.key) },
        "settings",
      );
      return { ok: true };
    });
  }
  async menus(actor: AuthUser) {
    requirePermission(actor, "menus.manage");
    return snapshot(this.db,async r=>{
    const [header, footer, pages] = await Promise.all([
      r.query(
        "SELECT id,location,labelAr,labelEn,url,pageSlug,enabled,`order` FROM MenuItem WHERE location='header' ORDER BY `order`",
      ),
      r.query(
        "SELECT id,location,labelAr,labelEn,url,pageSlug,enabled,`order` FROM MenuItem WHERE location='footer' ORDER BY `order`",
      ),
      r.query(
        "SELECT slug,titleAr,titleEn FROM Page WHERE status<>'archived' ORDER BY `order`",
      ),
    ]);
    const normalize = (rows: Array<Record<string, unknown>>) =>
      rows.map((r) => ({ ...r, enabled: !!r.enabled }));
    return {
      ok: true,
      header: normalize(header),
      footer: normalize(footer),
      pages,
      revisions: Object.fromEntries(Object.entries(await revisions(r)).filter(([key])=>key.startsWith('menu:'))),
    };
    });
  }
  async updateMenu(actor: AuthUser, body: Record<string, unknown>, checked=false) {
    requirePermission(actor, "menus.manage");
    const location = String(body.location ?? ""),
      items = Array.isArray(body.items) ? body.items : [];
    if (!["header", "footer"].includes(location))
      throw new AuthFault(400, "invalid");
    if (items.length > 12) throw new AuthFault(400, "too_many");
    const clean = items
      .map((raw, index) => {
        if (!raw || typeof raw !== "object")
          throw new AuthFault(400, "invalid");
        const item = raw as Record<string, unknown>;
        return {
          id: newId(),
          location,
          labelAr: String(item.labelAr ?? "").slice(0, 120),
          labelEn: String(item.labelEn ?? "").slice(0, 120),
          url:
            typeof item.url === "string" &&
            (item.url.startsWith("/") || /^https?:\/\//.test(item.url))
              ? item.url.slice(0, 200)
              : null,
          pageSlug:
            typeof item.pageSlug === "string"
              ? item.pageSlug === "/"
                ? ""
                : item.pageSlug.slice(0, 60) || null
              : null,
          enabled: item.enabled !== false,
          order: index,
        };
      })
      .filter((i) => i.labelAr || i.labelEn);
    if (!clean.length) throw new AuthFault(400, "empty");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "menu:" + location);
      await advance(r,'menu:'+location,body.baseRevision,checked);
      await r.query("DELETE FROM MenuItem WHERE location=?", [location]);
      for (const item of clean) await insertRecord(r, "MenuItem", item);
      await audit(
        r,
        "menu.updated",
        actor,
        { count: clean.length },
        "menu",
        location,
      );
      return { ok: true };
    });
  }
  async logs(
    actor: AuthUser,
    query: { q?: string; entity?: string; page?: string },
  ) {
    requirePermission(actor, "audit.view");
    const q = (query.q ?? "").trim().toLowerCase().slice(0, 80),
      page = pageNumber(query.page),
      values: unknown[] = [],
      where = ["1=1"];
    if (query.entity) {
      where.push("a.entityType=?");
      values.push(query.entity);
    }
    if (q) {
      const terms = ["a.action", "a.actorEmail", "a.entityId"].map((f) =>
        sqliteLike(f, q),
      );
      where.push("(" + terms.map((t) => t.sql).join(" OR ") + ")");
      values.push(...terms.map((t) => t.value));
    }
    const [counts, rows] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) n FROM AuditLog a WHERE ${where.join(" AND ")}`,
        values,
      ),
      this.db.query(
        `SELECT a.id,a.actorEmail,a.action,a.entityType,a.entityId,a.details,a.createdAt,u.name actorName,u.email userEmail FROM AuditLog a LEFT JOIN User u ON u.id=a.actorId WHERE ${where.join(" AND ")} ORDER BY a.createdAt DESC LIMIT 30 OFFSET ?`,
        [...values, (page - 1) * 30],
      ),
    ]);
    return {
      ok: true,
      total: Number(counts[0].n),
      page,
      pageSize: 30,
      logs: rows.map((r: Record<string, unknown>) => {
        const { actorName, userEmail, details, ...safe } = r;
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(String(details));
        } catch {
          /* historical malformed audit */
        }
        return {
          ...safe,
          actor: actorName ?? r.actorEmail ?? "—",
          actorEmail: userEmail ?? r.actorEmail,
          details: parsed,
        };
      }),
    };
  }
  async outbox(actor: AuthUser, raw?: string): Promise<OutboxResponse> {
    requirePermission(actor, "email.outbox");
    const page = pageNumber(raw),
      [counts, emails] = await Promise.all([
        this.db.query("SELECT COUNT(*) n FROM EmailLog"),
        this.db.query(
          "SELECT e.id,e.`to`,e.subject,COALESCE(j.status,e.status) status,e.createdAt,j.attempts,j.availableAt,j.lastError FROM EmailLog e LEFT JOIN MailJob j ON j.emailLogId=e.id ORDER BY e.createdAt DESC,e.id DESC LIMIT 20 OFFSET ?",
          [(page - 1) * 20],
        ),
      ]);
    return {
      ok: true,
      total: Number(counts[0].n),
      page,
      pageSize: 20,
      emails: emails.map((r: Record<string, unknown>) => ({
        id: String(r.id), to: String(r.to), subject: String(r.subject),
        status: OUTBOX_STATUSES.includes(r.status as OutboxStatus) ? r.status as OutboxStatus : 'unknown',
        createdAt: (r.createdAt as Date).toISOString(),
        attempts: r.attempts === null ? null : Number(r.attempts),
        nextAttemptAt: ['queued','retry'].includes(String(r.status)) && r.availableAt instanceof Date ? r.availableAt.toISOString() : null,
        errorCode: r.lastError === null ? null : [
          'smtp_rejected_permanently','smtp_rejected_temporarily','smtp_connection_not_established',
          'smtp_failed_before_data','smtp_acceptance_unknown','smtp_no_recipient_accepted',
          'payload_authentication_failed','worker_lost_after_send_started','worker_lost_before_send',
        ].includes(String(r.lastError)) ? String(r.lastError) : 'unavailable',
        bodyText: "",
        bodyHtml: null,
        error: null,
      })),
    };
  }
  async savedReplies(actor: AuthUser) {
    requirePermission(actor, "requests.view.all");
    return {
      ok: true,
      replies: await this.db.query(
        "SELECT s.id,s.name,s.content,s.createdBy,s.createdAt,s.updatedAt,u.name creatorName FROM SavedReply s LEFT JOIN User u ON u.id=s.createdBy ORDER BY s.updatedAt DESC",
      ),
    };
  }
  async saveReply(
    actor: AuthUser,
    body: Record<string, unknown>,
    id?: string,
    remove = false,
  ) {
    requirePermission(actor, "requests.reply");
    const values: Record<string, string> = {};
    for (const [key, max] of [
      ["name", 80],
      ["content", 2000],
    ] as const)
      if (!id || typeof body[key] === "string") {
        const value = String(body[key] ?? "")
          .trim()
          .slice(0, max);
        if (!value) throw new AuthFault(400, "invalid");
        values[key] = value;
      }
    if (!remove && !Object.keys(values).length)
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      let action = "saved_reply.created";
      if (id) {
        const [existing] = await r.query(
          "SELECT id,name FROM SavedReply WHERE id=? FOR UPDATE",
          [id],
        );
        if (!existing) throw new AuthFault(404, "not_found");
        if (remove) {
          await r.query("DELETE FROM SavedReply WHERE id=?", [id]);
          await audit(
            r,
            "saved_reply.deleted",
            actor,
            { name: existing.name },
            "saved_reply",
            id,
          );
          return { ok: true };
        }
        await r.query(
          `UPDATE SavedReply SET ${Object.keys(values)
            .map((k) => "`" + k + "`=?")
            .join(",")},updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
          [...Object.values(values), id],
        );
        action = "saved_reply.updated";
      } else {
        id = newId();
        await insertRecord(r, "SavedReply", {
          id,
          name: values.name,
          content: values.content,
          createdBy: actor.id,
        });
      }
      await audit(
        r,
        action,
        actor,
        { fields: Object.keys(values) },
        "saved_reply",
        id,
      );
      const [reply] = await r.query(
        "SELECT id,name,content,createdAt,updatedAt FROM SavedReply WHERE id=?",
        [id],
      );
      return { ok: true, reply };
    });
  }
}
