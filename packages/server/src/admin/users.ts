import { randomBytes } from "node:crypto";
import type { DataSource, QueryRunner } from "typeorm";
import {
  can,
  ROLE_KEYS,
  type AuthUser,
  type Permission,
} from "@so7ob/contracts";
import type { User } from "../database/models.js";
import {
  AuthFault,
  audit,
  consumeRateLimit,
  newId,
  sha256,
  transaction,
} from "../auth/persistence.js";
import { lockOperation } from "../business/persistence.js";
import { sqliteLike } from "../business/requests.js";
import { pageNumber } from "../business/account.js";
import { MailQueue } from "../queue/mail-queue.js";
import { PayloadCipher } from "../queue/crypto.js";
type UserListRecord = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "phone"
  | "company"
  | "roleKey"
  | "status"
  | "emailVerifiedAt"
  | "createdAt"
  | "lastLoginAt"
> & { requestsCount: string | number; assignedCount: string | number };
const requirePermission = (actor: AuthUser, permission: Permission) => {
  if (!can(actor, permission)) throw new AuthFault(403, "forbidden");
};
export class UserAdministrationService {
  private readonly attempts = new WeakMap<object, string>();
  constructor(
    private readonly db: DataSource,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async list(
    actor: AuthUser,
    query: {
      q?: string;
      role?: string;
      status?: string;
      sort?: string;
      dir?: string;
      page?: string;
    },
  ) {
    requirePermission(actor, "users.view");
    const search = (query.q ?? "").trim().toLowerCase().slice(0, 100),
      page = pageNumber(query.page),
      pageSize = 20;
    const clauses = ["1=1"],
      values: unknown[] = [];
    if (search) {
      const a = sqliteLike("u.name", search),
        b = sqliteLike("u.email", search);
      clauses.push(`(${a.sql} OR ${b.sql})`);
      values.push(a.value, b.value);
    }
    if (query.role && ROLE_KEYS.includes(query.role)) {
      clauses.push("u.roleKey=?");
      values.push(query.role);
    }
    if (query.status) {
      clauses.push("u.status=?");
      values.push(query.status);
    }
    const valid = [
      "createdAt",
      "lastLoginAt",
      "name",
      "email",
      "roleKey",
    ].includes(query.sort ?? "createdAt");
    const sort = valid ? (query.sort ?? "createdAt") : "createdAt",
      dir = valid && query.dir === "asc" ? "ASC" : "DESC";
    const where = clauses.join(" AND ");
    const [[count], rows] = await Promise.all([
      this.db.query(`SELECT COUNT(*) n FROM User u WHERE ${where}`, values),
      this.db.query<UserListRecord[]>(
        `SELECT u.id,u.name,u.email,u.phone,u.company,u.roleKey,u.status,u.emailVerifiedAt,u.createdAt,u.lastLoginAt,(SELECT COUNT(*) FROM ProjectRequest r WHERE r.clientId=u.id) requestsCount,(SELECT COUNT(*) FROM ProjectRequest r WHERE r.assigneeId=u.id) assignedCount FROM User u WHERE ${where} ORDER BY u.\`${sort}\` ${dir} LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      ok: true,
      total: Number(count.n),
      page,
      pageSize,
      users: rows.map((row) => {
        const { emailVerifiedAt, ...safe } = row;
        return {
          ...safe,
          emailVerified: !!emailVerifiedAt,
          requestsCount: Number(row.requestsCount),
          assignedCount: Number(row.assignedCount),
        };
      }),
    };
  }
  async detail(actor: AuthUser, id: string) {
    requirePermission(actor, "users.view");
    const [user]: User[] = await this.db.query(
      "SELECT id,email,name,phone,company,locale,roleKey,status,emailVerifiedAt,createdAt,updatedAt,lastLoginAt FROM User WHERE id=?",
      [id],
    );
    if (!user) throw new AuthFault(404, "not_found");
    const [sessions, [counts], requests, auditLogs, [suspendedEvent]] =
      await Promise.all([
        this.db.query(
          "SELECT s.createdAt,s.lastSeenAt,s.userAgent,s.ipHash FROM AuthSession s JOIN User u ON u.id=s.userId WHERE s.userId=? AND s.fingerprint LIKE 'opaque-v1:%' AND s.revokedAt IS NULL AND s.expiresAt>UTC_TIMESTAMP(3) AND (u.sessionsRevokedAt IS NULL OR s.createdAt>u.sessionsRevokedAt) ORDER BY s.lastSeenAt DESC",
          [id],
        ),
        this.db.query(
          "SELECT COUNT(*) totalRequests,COALESCE(SUM(status NOT IN ('closed','cancelled')),0) openRequests FROM ProjectRequest WHERE clientId=?",
          [id],
        ),
        this.db.query(
          "SELECT r.id,r.refCode,r.status,r.serviceType,r.createdAt,r.lastActivityAt,u.name assigneeName FROM ProjectRequest r LEFT JOIN User u ON u.id=r.assigneeId WHERE r.clientId=? ORDER BY r.createdAt DESC LIMIT 20",
          [id],
        ),
        this.db.query(
          "SELECT action,entityType,entityId,createdAt FROM AuditLog WHERE actorId=? ORDER BY createdAt DESC LIMIT 10",
          [id],
        ),
        this.db.query(
          "SELECT createdAt FROM AuditLog WHERE action='user.suspended' AND entityType='user' AND entityId=? ORDER BY createdAt DESC LIMIT 1",
          [id],
        ),
      ]);
    const { emailVerifiedAt, ...safe } = user;
    return {
      ok: true,
      user: {
        id: safe.id,
        email: safe.email,
        name: safe.name,
        phone: safe.phone,
        company: safe.company,
        locale: safe.locale,
        roleKey: safe.roleKey,
        status: safe.status,
        createdAt: safe.createdAt,
        updatedAt: safe.updatedAt,
        lastLoginAt: safe.lastLoginAt,
        emailVerified: !!emailVerifiedAt,
        suspendedAt: suspendedEvent?.createdAt ?? null,
        lastSeen: sessions[0]?.lastSeenAt ?? user.lastLoginAt,
      },
      stats: {
        totalRequests: Number(counts.totalRequests),
        openRequests: Number(counts.openRequests),
      },
      requests,
      sessions: { activeCount: sessions.length, last5: sessions.slice(0, 5) },
      auditLog: auditLogs,
    };
  }
  private async currentActor(
    r: QueryRunner,
    actor: AuthUser,
    permission: Permission,
  ): Promise<AuthUser> {
    // Role/status changes serialize on the same lock, then permissions are read again.
    const [row] = await r.query(
      "SELECT u.roleKey,u.status,r.permissions FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?",
      [actor.id],
    );
    if (!row || row.status === "suspended")
      throw new AuthFault(401, "unauthorized");
    const current = {
      ...actor,
      roleKey: row.roleKey,
      status: row.status,
      permissions: JSON.parse(row.permissions),
    };
    requirePermission(current, permission);
    return current;
  }
  async update(actor: AuthUser, id: string, body: Record<string, unknown>) {
    requirePermission(actor, "users.update");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "user-administration");
      const current = await this.currentActor(r, actor, "users.update");
      const [target]: User[] = await r.query(
        "SELECT * FROM User WHERE id=? FOR UPDATE",
        [id],
      );
      if (!target) throw new AuthFault(404, "not_found");
      const updates: Record<string, unknown> = {},
        details: Record<string, unknown> = {};
      if (typeof body.name === "string") {
        const name = body.name.trim().slice(0, 100);
        if (name.length >= 2) updates.name = name;
      }
      if (typeof body.phone === "string")
        updates.phone = body.phone.trim().slice(0, 20) || null;
      if (typeof body.company === "string")
        updates.company = body.company.trim().slice(0, 120) || null;
      if (typeof body.roleKey === "string" && body.roleKey !== target.roleKey) {
        requirePermission(current, "users.roles");
        const [role] = await r.query("SELECT `key` FROM Role WHERE `key`=?", [
          body.roleKey,
        ]);
        if (!role) throw new AuthFault(400, "invalid");
        updates.roleKey = role.key;
        details.fromRole = target.roleKey;
        details.toRole = role.key;
      }
      if (
        typeof body.status === "string" &&
        ["active", "suspended", "pending_verification"].includes(body.status)
      ) {
        requirePermission(current, "users.suspend");
        updates.status = body.status;
        if (body.status === "suspended" && target.status !== "suspended")
          details.suspended = true;
        if (body.status === "active" && target.status !== "active")
          details.reactivated = true;
      }
      if (!Object.keys(updates).length) throw new AuthFault(400, "invalid");
      if (
        target.roleKey === "super_admin" &&
        ((updates.roleKey && updates.roleKey !== "super_admin") ||
          (updates.status && updates.status !== "active"))
      ) {
        const [{ n }] = await r.query(
          "SELECT COUNT(*) n FROM User WHERE roleKey='super_admin' AND status='active' AND id<>?",
          [id],
        );
        if (Number(n) === 0) throw new AuthFault(409, "last_admin");
      }
      if (details.suspended) {
        await r.query(
          "UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='suspended' WHERE userId=? AND revokedAt IS NULL",
          [id],
        );
        await r.query(
          "UPDATE User SET sessionsRevokedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [id],
        );
      }
      await r.query(
        `UPDATE User SET ${Object.keys(updates)
          .map((key) => "`" + key + "`=?")
          .join(",")},updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [...Object.values(updates), id],
      );
      const [updated] = await r.query(
        "SELECT id,name,email,roleKey,status,phone,company FROM User WHERE id=?",
        [id],
      );
      await audit(
        r,
        details.suspended
          ? "user.suspended"
          : details.reactivated
            ? "user.reactivated"
            : details.toRole
              ? "user.role_changed"
              : "user.updated",
        current,
        { ...details, fields: Object.keys(updates) },
        "user",
        id,
      );
      return { ok: true, user: updated };
    });
  }
  async reserveInvitation(actor: AuthUser) {
    requirePermission(actor, "users.create");
    const result = await consumeRateLimit(this.db, "invite:" + actor.id, {
      shortMax: 5,
      shortWindowMs: 600000,
      dailyMax: 20,
      dailyWindowMs: 86400000,
    });
    if (!result.allowed)
      throw new AuthFault(429, "rate_limited", {
        retryAfterSec: result.retryAfterSec,
      });
    const permit = {};
    this.attempts.set(permit, actor.id);
    return permit;
  }
  async invite(
    actor: AuthUser,
    body: Record<string, unknown>,
    ip: string,
    permit?: object,
  ) {
    requirePermission(actor, "users.create");
    if (permit && this.attempts.get(permit) === actor.id)
      this.attempts.delete(permit);
    else await this.reserveInvitation(actor);
    const email = String(body.email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 200),
      roleKey = String(body.roleKey ?? "client");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
      !ROLE_KEYS.includes(roleKey)
    )
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "user-administration");
      const current = await this.currentActor(r, actor, "users.create");
      if (roleKey !== "client") requirePermission(current, "users.roles");
      if ((await r.query("SELECT id FROM User WHERE email=?", [email])).length)
        throw new AuthFault(409, "email_taken");
      if (
        (
          await r.query(
            "SELECT id FROM UserInvite WHERE email=? AND acceptedAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)",
            [email],
          )
        ).length
      )
        throw new AuthFault(409, "invite_pending");
      const raw = randomBytes(32).toString("hex"),
        tokenHash = sha256(raw),
        id = newId();
      await r.query(
        "INSERT INTO UserInvite(id,email,roleKey,tokenHash,invitedById,expiresAt) VALUES(?,?,?,?,?,?)",
        [
          id,
          email,
          roleKey,
          tokenHash,
          current.id,
          new Date(Date.now() + 7 * 86400000),
        ],
      );
      const locale = current.locale === "en" ? "en" : "ar",
        base = this.env.SITE_URL;
      if (!base) throw new Error("SITE_URL required");
      const acceptUrl =
        base.replace(/\/+$/, "") + `/${locale}/auth/invite?token=${raw}`;
      const subject =
        locale === "en"
          ? `You are invited to so7ob — ${roleKey} account`
          : `دعوة إلى سُحُب التقنية — حساب ${roleKey}`;
      const text =
        locale === "en"
          ? `You were invited to join so7ob with the role "${roleKey}".\n\nAccept and set your password via this link (valid 7 days, single use):\n${acceptUrl}\n\nIf you were not expecting this, ignore this email.`
          : `دُعيت للانضمام إلى سُحُب التقنية بدور «${roleKey}».\n\nاقبل الدعوة واضبط كلمة المرور عبر الرابط (صالح 7 أيام، يعمل مرة واحدة):\n${acceptUrl}\n\nإن لم تكن تتوقعها فتجاهل الرسالة.`;
      const queue = new MailQueue(
        this.db,
        new PayloadCipher(this.env.OUTBOX_KEY),
      );
      await queue.enqueue(
        r,
        { to: email, subject, text },
        sha256("invite:" + id),
      );
      await audit(
        r,
        "user.invited",
        current,
        { roleKey, emailStatus: "queued" },
        "user_invite",
        email,
        ip,
      );
      return {
        ok: true,
        emailStatus: "queued",
        ...(this.env.NODE_ENV !== "production" &&
        this.env.EMAIL_DEV_MODE === "true"
          ? { devInviteUrl: acceptUrl }
          : {}),
      };
    });
  }
}
