import type { DataSource } from "typeorm";
import type { AuthUser } from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { identifier } from "../database/schema.js";
export function pageNumber(value: unknown): number {
  const n = Number(value ?? 1);
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return n;
}
export class AccountService {
  constructor(private readonly db: DataSource) {}
  async profile(actor: AuthUser) {
    const [user] = await this.db.query(
      "SELECT id,email,name,phone,company,locale,roleKey,status,emailVerifiedAt,createdAt,lastLoginAt FROM User WHERE id=?",
      [actor.id],
    );
    if (!user) throw new AuthFault(401, "unauthorized");
    return {
      ok: true,
      user: { ...user, emailVerified: !!user.emailVerifiedAt },
    };
  }
  async updateProfile(actor: AuthUser, body: Record<string, unknown>) {
    const data: Record<string, string> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 100);
      if (name.length < 2)
        throw new AuthFault(400, "invalid", {
          errors: { name: "name_invalid" },
        });
      data.name = name;
    }
    if (typeof body.phone === "string") {
      const phone = body.phone.trim().slice(0, 20);
      if (phone && !/^[+]?[\d\s\-()]{7,20}$/.test(phone))
        throw new AuthFault(400, "invalid", {
          errors: { phone: "phone_invalid" },
        });
      data.phone = phone;
    }
    if (typeof body.company === "string")
      data.company = body.company.trim().slice(0, 120);
    if (body.locale === "ar" || body.locale === "en") data.locale = body.locale;
    if (!Object.keys(data).length) throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      await r.query(
        `UPDATE User SET ${Object.keys(data)
          .map((k) => identifier(k) + "=?")
          .join(",")},updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [...Object.values(data), actor.id],
      );
      await audit(
        r,
        "user.profile_updated",
        actor,
        { fields: Object.keys(data) },
        "user",
        actor.id,
      );
      const [user] = await r.query(
        "SELECT name,phone,company,locale FROM User WHERE id=?",
        [actor.id],
      );
      return { ok: true, user };
    });
  }
  async draft(actor: AuthUser) {
    const [row] = await this.db.query(
      "SELECT data,updatedAt FROM RequestDraft WHERE userId=?",
      [actor.id],
    );
    if (!row) return { ok: true, draft: null };
    try {
      return {
        ok: true,
        draft: JSON.parse(row.data),
        updatedAt: row.updatedAt,
      };
    } catch {
      return { ok: true, draft: null };
    }
  }
  async saveDraft(actor: AuthUser, body: Record<string, unknown>) {
    const allowed = [
      "requestType",
      "serviceType",
      "description",
      "budget",
      "currency",
      "timeline",
      "name",
      "company",
      "phone",
      "preferredContact",
      "referenceUrl",
      "locale",
    ];
    const clean: Record<string, unknown> = {};
    for (const key of allowed)
      if (body[key] !== undefined)
        clean[key] =
          typeof body[key] === "string" ? body[key].slice(0, 5000) : body[key];
    const payload = JSON.stringify(clean);
    // Source truncates JSON to 20k and later discards an unreadable draft. Refuse loss, retaining the prior draft.
    if (payload.length > 20000)
      throw new AuthFault(400, "invalid", { errors: { draft: "tooLong" } });
    await this.db.query(
      "INSERT INTO RequestDraft(id,userId,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updatedAt=UTC_TIMESTAMP(3)",
      [newId(), actor.id, payload],
    );
    return { ok: true };
  }
  async deleteDraft(actor: AuthUser) {
    await this.db.query("DELETE FROM RequestDraft WHERE userId=?", [actor.id]);
    return { ok: true };
  }
  async notifications(
    actor: AuthUser,
    query: { unread?: unknown; page?: unknown },
  ) {
    const page = pageNumber(query.page),
      pageSize = 20,
      unreadOnly = query.unread === "1";
    const where = "userId=?" + (unreadOnly ? " AND readAt IS NULL" : "");
    const [[total], [unread], rows] = await Promise.all([
      this.db.query("SELECT COUNT(*) n FROM Notification WHERE " + where, [
        actor.id,
      ]),
      this.db.query(
        "SELECT COUNT(*) n FROM Notification WHERE userId=? AND readAt IS NULL",
        [actor.id],
      ),
      this.db.query(
        "SELECT id,type,payload,link,readAt,createdAt FROM Notification WHERE " +
          where +
          " ORDER BY createdAt DESC LIMIT ? OFFSET ?",
        [actor.id, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      ok: true,
      total: Number(total.n),
      unread: Number(unread.n),
      page,
      pageSize,
      notifications: rows.map((row: { payload: string }) => {
        let payload: unknown = {};
        try {
          payload = JSON.parse(row.payload);
        } catch {
          /* preserve source fallback */
        }
        return { ...row, payload };
      }),
    };
  }
  async readNotification(
    actor: AuthUser,
    body: { id?: unknown; all?: unknown },
  ) {
    if (body.all === true) {
      await this.db.query(
        "UPDATE Notification SET readAt=UTC_TIMESTAMP(3) WHERE userId=? AND readAt IS NULL",
        [actor.id],
      );
      return { ok: true };
    }
    const id = String(body.id ?? "");
    if (!id) throw new AuthFault(400, "invalid");
    const result = await this.db.query(
      "UPDATE Notification SET readAt=UTC_TIMESTAMP(3) WHERE id=? AND userId=?",
      [id, actor.id],
    );
    if (!result.affectedRows) throw new AuthFault(404, "not_found");
    return { ok: true };
  }
}
