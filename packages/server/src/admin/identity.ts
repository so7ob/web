import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { DataSource } from "typeorm";
import {
  can,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  type AuthUser,
  type Permission,
} from "@so7ob/contracts";
import {
  AuthFault,
  audit,
  consumeRateLimit,
  newId,
  sha256,
  transaction,
} from "../auth/persistence.js";
import { lockOperation } from "../business/persistence.js";
import { issueToken } from "../auth/tokens.js";
import { MailQueue } from "../queue/mail-queue.js";
import { PayloadCipher } from "../queue/crypto.js";
import {
  currentIdentity,
  freshIdentity,
  assignableRole,
  manageableTarget,
  permissionList,
} from "./identity-policy.js";
import { project } from "../audit/reader.js";
const required = (actor: AuthUser, p: Permission) => {
  if (!can(actor, p)) throw new AuthFault(403, "forbidden");
};
const field = (body: Record<string, unknown>, key: string, max = 120) => {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new AuthFault(400, "invalid", { errors: { [key]: "invalid" } });
  return value.trim();
};
const reason = (body: Record<string, unknown>) => {
  const value = field(body, "reason", 64);
  if (
    ![
      "account_support",
      "security_response",
      "staff_change",
      "requested_by_user",
    ].includes(value)
  )
    throw new AuthFault(400, "invalid", { errors: { reason: "invalid" } });
  return value;
};
export class IdentityAdministrationService {
  constructor(
    private readonly db: DataSource,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async reserve(actor: AuthUser) {
    const limit = await consumeRateLimit(this.db, "identity:" + actor.id, {
      shortMax: 20,
      shortWindowMs: 600000,
      dailyMax: 100,
      dailyWindowMs: 86400000,
    });
    if (!limit.allowed)
      throw new AuthFault(429, "rate_limited", {
        retryAfterSec: limit.retryAfterSec,
      });
  }
  async roles(
    actor: AuthUser,
    query: { q?: string; page?: string } = {},
    options = false,
  ) {
    if (options) {
      if (!can(actor, "users.view") && !can(actor, "pages.edit"))
        throw new AuthFault(403, "forbidden");
    } else required(actor, "roles.view");
    const page = Math.max(
        1,
        Math.min(100000, Number.parseInt(query.page ?? "1") || 1),
      ),
      q =
        "%" +
        (typeof query.q === "string" ? query.q : "").trim().slice(0, 100) +
        "%";
    const rows = await this.db.query(
      `SELECT r.*, (SELECT COUNT(*) FROM User u WHERE u.roleKey=r.\`key\`) userCount FROM Role r WHERE (r.nameAr LIKE ? OR r.nameEn LIKE ? OR r.\`key\` LIKE ?) ${options ? "AND r.status='active'" : ""} ORDER BY r.isSystem DESC,r.\`key\` LIMIT 100 OFFSET ?`,
      [q, q, q, (page - 1) * 100],
    );
    const [{ n }] = await this.db.query(
      "SELECT COUNT(*) n FROM Role WHERE nameAr LIKE ? OR nameEn LIKE ? OR `key` LIKE ?",
      [q, q, q],
    );
    const [ownRole] = await this.db.query(
      "SELECT grantablePermissions FROM Role WHERE `key`=?",
      [actor.roleKey],
    );
    const ceiling = permissionList(ownRole?.grantablePermissions ?? "[]");
    return {
      ok: true,
      roles: rows.map((r: Record<string, unknown>) => ({
        ...r,
        assignable:
          r.status === "active" &&
          (actor.roleKey === "super_admin" ||
            (r.key !== "super_admin" &&
              (r.key === "client" || can(actor, "users.roles")) &&
              [
                ...permissionList(r.permissions),
                ...permissionList(r.grantablePermissions),
              ].every((p) => can(actor, p) && ceiling.includes(p)))),
        permissions: permissionList(r.permissions),
        grantablePermissions: permissionList(r.grantablePermissions),
        userCount: Number(r.userCount),
      })),
      total: Number(n),
      page,
      pageSize: 100,
    };
  }
  catalog(actor: AuthUser) {
    required(actor, "roles.view");
    return { ok: true, permissions: PERMISSION_CATALOG };
  }
  async roleDetail(actor: AuthUser, key: string, page = 1) {
    required(actor, "roles.view");
    const [role] = await this.db.query("SELECT * FROM Role WHERE `key`=?", [
      key,
    ]);
    if (!role) throw new AuthFault(404, "not_found");
    const users = can(actor, "users.view")
      ? await this.db.query(
          "SELECT id,name,email,status FROM User WHERE roleKey=? ORDER BY id LIMIT 20 OFFSET ?",
          [key, (Math.max(1, page) - 1) * 20],
        )
      : [];
    const events = can(actor, "audit.view")
      ? await this.db.query(
          "SELECT * FROM AuditLog WHERE entityType='role' AND entityId=? ORDER BY createdAt DESC,id DESC LIMIT 20",
          [key],
        )
      : [];
    return {
      ok: true,
      role: {
        ...role,
        permissions: permissionList(role.permissions),
        grantablePermissions: permissionList(role.grantablePermissions),
      },
      users,
      events: events.map((row: Record<string, unknown>) =>
        project(row, actor, false),
      ),
    };
  }
  async saveRole(
    actor: AuthUser,
    key: string | undefined,
    body: Record<string, unknown>,
  ) {
    const permission = key ? "roles.update" : "roles.create";
    required(actor, permission);
    return transaction(this.db, async (r) => {
      await lockOperation(r, "user-administration");
      const current = await currentIdentity(r, actor, permission);
      const [old] = key
        ? await r.query("SELECT * FROM Role WHERE `key`=? FOR UPDATE", [key])
        : [];
      if (key && !old) throw new AuthFault(404, "not_found");
      if (old && (old.key === "super_admin" || current.roleKey === old.key))
        throw new AuthFault(403, "protected_role");
      if (old && body.version !== old.version)
        throw new AuthFault(409, "version_conflict");
      const roleKey = key ?? field(body, "key", 60);
      if (
        !/^[a-z][a-z0-9_]{2,59}$/.test(roleKey) ||
        (!old && SYSTEM_ROLES.some((role) => role.key === roleKey))
      )
        throw new AuthFault(400, "invalid_role");
      let permissions =
        body.permissions === undefined
          ? permissionList(old?.permissions ?? "[]")
          : permissionList(body.permissions);
      if (body.copyFrom !== undefined && !old) {
        const source = await assignableRole(r, current, String(body.copyFrom));
        if (source.key === "super_admin")
          throw new AuthFault(403, "protected_role");
        permissions = permissionList(source.permissions);
      }
      const grants =
        body.grantablePermissions === undefined
          ? permissionList(old?.grantablePermissions ?? "[]")
          : permissionList(body.grantablePermissions);
      if (
        body.permissions !== undefined &&
        (!old || JSON.stringify(permissions) !== old.permissions)
      )
        required(current, "roles.permissions");
      if (body.grantablePermissions !== undefined) {
        required(current, "roles.delegate");
        if (current.roleKey !== "super_admin")
          throw new AuthFault(403, "forbidden");
      }
      if (current.roleKey !== "super_admin") {
        required(current, "roles.delegate");
        const ceiling = [
          ...permissions,
          ...grants,
          ...permissionList(old?.permissions ?? "[]"),
          ...permissionList(old?.grantablePermissions ?? "[]"),
        ];
        if (
          ceiling.some(
            (p) =>
              !can(current, p) || !current.grantablePermissions.includes(p),
          )
        )
          throw new AuthFault(403, "delegation_denied");
      }
      if (grants.some((p) => !permissions.includes(p)))
        throw new AuthFault(400, "invalid_permissions");
      const status =
        body.status === undefined ? (old?.status ?? "active") : body.status;
      if (!["active", "archived"].includes(String(status)))
        throw new AuthFault(400, "invalid");
      if (status === "archived") {
        required(current, "roles.archive");
        if (old?.isSystem || SYSTEM_ROLES.some((role) => role.key === roleKey))
          throw new AuthFault(403, "protected_role");
        const [[users], [invites], [pages]] = await Promise.all([
          r.query("SELECT COUNT(*) n FROM User WHERE roleKey=?", [roleKey]),
          r.query(
            "SELECT COUNT(*) n FROM UserInvite WHERE roleKey=? AND acceptedAt IS NULL AND cancelledAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)",
            [roleKey],
          ),
          r.query(
            "SELECT COUNT(*) n FROM Page WHERE JSON_CONTAINS(allowedRoles,JSON_QUOTE(?)) OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(draftSettings,'$.allowedRoles'),'[]'),JSON_QUOTE(?)) OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(publishedSettings,'$.allowedRoles'),'[]'),JSON_QUOTE(?))",
            [roleKey, roleKey, roleKey],
          ),
        ]);
        if (Number(users.n) + Number(invites.n) + Number(pages.n))
          throw new AuthFault(409, "role_in_use");
      }
      const next = {
        nameAr: field(body, "nameAr"),
        nameEn: field(body, "nameEn"),
        descriptionAr:
          typeof body.descriptionAr === "string"
            ? body.descriptionAr.slice(0, 500)
            : (old?.descriptionAr ?? ""),
        descriptionEn:
          typeof body.descriptionEn === "string"
            ? body.descriptionEn.slice(0, 500)
            : (old?.descriptionEn ?? ""),
        permissions,
        grantablePermissions: grants,
        status,
        version: (old?.version ?? 0) + 1,
      };
      try {
        if (old)
          await r.query(
            "UPDATE Role SET nameAr=?,nameEn=?,descriptionAr=?,descriptionEn=?,permissions=?,grantablePermissions=?,status=?,version=?,updatedAt=UTC_TIMESTAMP(3) WHERE `key`=?",
            [
              next.nameAr,
              next.nameEn,
              next.descriptionAr,
              next.descriptionEn,
              JSON.stringify(permissions),
              JSON.stringify(grants),
              status,
              next.version,
              roleKey,
            ],
          );
        else
          await r.query(
            "INSERT INTO Role(`key`,nameAr,nameEn,descriptionAr,descriptionEn,permissions,grantablePermissions,status,isSystem) VALUES(?,?,?,?,?,?,?,?,0)",
            [
              roleKey,
              next.nameAr,
              next.nameEn,
              next.descriptionAr,
              next.descriptionEn,
              JSON.stringify(permissions),
              JSON.stringify(grants),
              status,
            ],
          );
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY")
          throw new AuthFault(409, "role_exists");
        throw error;
      }
      await audit(
        r,
        old ? "role.updated" : "role.created",
        current,
        null,
        "role",
        roleKey,
        undefined,
        {
          before: old
            ? {
                ...old,
                permissions: permissionList(old.permissions),
                grantablePermissions: permissionList(old.grantablePermissions),
              }
            : {},
          after: next,
        },
      );
      return { ok: true, role: { key: roleKey, ...next } };
    });
  }
  async direct(actor: AuthUser, body: Record<string, unknown>) {
    required(actor, "users.provision");
    const email = field(body, "email", 200).toLowerCase(),
      name = field(body, "name", 100),
      roleKey = field(body, "roleKey", 60),
      mode = body.method;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      throw new AuthFault(400, "invalid", {
        errors: { email: "email_invalid" },
      });
    if (
      !["temporary", "link"].includes(String(mode)) ||
      !["ar", "en"].includes(String(body.locale))
    )
      throw new AuthFault(400, "invalid");
    const temporaryPassword =
      mode === "temporary"
        ? "S7!" + randomBytes(24).toString("base64url")
        : null;
    const passwordHash = await bcrypt.hash(
      temporaryPassword ?? randomBytes(48).toString("hex"),
      12,
    );
    const id = newId(),
      expiresAt = mode === "temporary" ? new Date(Date.now() + 86400000) : null;
    try {
      await transaction(this.db, async (r) => {
        await lockOperation(r, "user-administration");
        const current = await currentIdentity(r, actor, "users.provision");
        if (roleKey !== "client") required(current, "users.roles");
        await assignableRole(r, current, roleKey, body.currentPassword);
        if (
          (
            await r.query("SELECT id FROM User WHERE normalizedEmail=?", [
              email,
            ])
          ).length
        )
          throw new AuthFault(409, "email_taken", {
            errors: { email: "email_taken" },
          });
        if (
          (
            await r.query(
              "SELECT id FROM UserInvite WHERE LOWER(TRIM(email))=? AND acceptedAt IS NULL AND cancelledAt IS NULL AND expiresAt>UTC_TIMESTAMP(3)",
              [email],
            )
          ).length
        )
          throw new AuthFault(409, "invite_pending");
        const status = body.status ?? "active";
        if (!["active", "suspended"].includes(String(status)))
          throw new AuthFault(400, "invalid");
        await r.query(
          "INSERT INTO User(id,email,name,passwordHash,phone,company,locale,roleKey,status,credentialState,credentialExpiresAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            email,
            name,
            passwordHash,
            typeof body.phone === "string"
              ? body.phone.trim().slice(0, 20)
              : null,
            typeof body.company === "string"
              ? body.company.trim().slice(0, 120)
              : null,
            body.locale,
            roleKey,
            status,
            mode === "temporary" ? "temporary" : "setup_pending",
            expiresAt,
          ],
        );
        await audit(
          r,
          "user.created",
          current,
          { roleKey },
          "user",
          id,
          undefined,
          {
            after: {
              roleKey,
              status,
              credentialState:
                mode === "temporary" ? "temporary" : "setup_pending",
            },
          },
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY")
        throw new AuthFault(409, "email_taken", {
          errors: { email: "email_taken" },
        });
      throw error;
    }
    const emailStatus =
      mode === "link"
        ? await this.setupMail(actor, id, body.currentPassword)
        : "not_requested";
    return {
      ok: true,
      user: {
        id,
        email,
        name,
        roleKey,
        credentialState: mode === "temporary" ? "temporary" : "setup_pending",
      },
      emailStatus,
      ...(temporaryPassword ? { temporaryPassword, expiresAt } : {}),
    };
  }
  private async setupMail(
    actor: AuthUser,
    id: string,
    password?: unknown,
  ): Promise<string> {
    // Independent transaction: failure must never misrepresent a committed account as absent.
    try {
      return await transaction(this.db, async (r) => {
        await lockOperation(r, "user-administration");
        const current = await currentIdentity(
          r,
          actor,
          can(actor, "users.credentials.reset")
            ? "users.credentials.reset"
            : "users.provision",
        );
        const [user] = await r.query(
          "SELECT * FROM User WHERE id=? FOR UPDATE",
          [id],
        );
        if (!user) throw new AuthFault(404, "not_found");
        await manageableTarget(r, current, user, password);
        if (
          !this.env.SMTP_HOST ||
          !this.env.SMTP_FROM ||
          !this.env.OUTBOX_KEY ||
          !this.env.SITE_URL
        ) {
          await audit(
            r,
            "user.setup_requested",
            current,
            { emailStatus: "needs_retry" },
            "user",
            id,
            undefined,
            { outcome: "failure", reasonCode: "email_unavailable" },
          );
          return "needs_retry";
        }
        const token = await issueToken(r, id, "password_reset"),
          url = new URL(
            `/${user.locale}/auth/reset-password?token=${token.raw}`,
            this.env.SITE_URL,
          ).href;
        await new MailQueue(
          this.db,
          new PayloadCipher(this.env.OUTBOX_KEY),
        ).enqueue(
          r,
          {
            to: user.email,
            subject:
              user.locale === "ar" ? "إعداد كلمة المرور" : "Set your password",
            text:
              user.locale === "ar"
                ? `اضبط كلمة المرور خلال 30 دقيقة: ${url}`
                : `Set your password within 30 minutes: ${url}`,
          },
          sha256("setup:" + token.raw),
        );
        await audit(
          r,
          "user.setup_requested",
          current,
          { emailStatus: "queued" },
          "user",
          id,
        );
        return "queued";
      });
    } catch {
      return "needs_retry";
    }
  }
  async userOperation(
    actor: AuthUser,
    id: string,
    operation: string,
    body: Record<string, unknown>,
  ) {
    const permission: Permission =
      operation === "temporary"
        ? "users.credentials.temporary"
        : operation === "setup"
          ? "users.credentials.reset"
          : "users.sessions.manage";
    required(actor, permission);
    if (!["temporary", "setup", "revoke"].includes(operation))
      throw new AuthFault(404, "not_found");
    const why = reason(body);
    const temporaryPassword =
      operation === "temporary"
        ? "S7!" + randomBytes(24).toString("base64url")
        : null;
    const hash = temporaryPassword
      ? await bcrypt.hash(temporaryPassword, 12)
      : null;
    await transaction(this.db, async (r) => {
      await lockOperation(r, "user-administration");
      const current = await currentIdentity(r, actor, permission);
      const [user] = await r.query("SELECT * FROM User WHERE id=? FOR UPDATE", [
        id,
      ]);
      if (!user) throw new AuthFault(404, "not_found");
      if (id === actor.id && operation !== "revoke")
        throw new AuthFault(403, "self_change_denied");
      await manageableTarget(r, current, user, body.currentPassword);
      if (operation === "temporary" || user.roleKey === "super_admin")
        await freshIdentity(r, current, body.currentPassword);
      if (operation !== "revoke" && user.roleKey === "super_admin") {
        const [{ n }] = await r.query(
          "SELECT COUNT(*) n FROM User WHERE roleKey='super_admin' AND status='active' AND credentialState='ready' AND id<>?",
          [id],
        );
        if (!Number(n)) throw new AuthFault(409, "last_admin");
      }
      if (operation === "temporary") {
        await r.query(
          "UPDATE User SET passwordHash=?,credentialState='temporary',credentialExpiresAt=?,sessionsRevokedAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [hash, new Date(Date.now() + 86400000), id],
        );
        await r.query(
          "UPDATE AuthToken SET usedAt=UTC_TIMESTAMP(3) WHERE userId=? AND usedAt IS NULL",
          [id],
        );
      }
      let revokedCount = 0;
      if (operation !== "setup") {
        const sessionId =
          operation === "revoke" && typeof body.sessionId === "string"
            ? body.sessionId
            : null;
        const result = await r.query(
          "UPDATE AuthSession SET revokedAt=UTC_TIMESTAMP(3),revokedReason='admin_revoke' WHERE userId=? AND revokedAt IS NULL" +
            (sessionId ? " AND id=?" : ""),
          sessionId ? [id, sessionId] : [id],
        );
        revokedCount = Number(result.affectedRows);
        if (sessionId && !result.affectedRows)
          throw new AuthFault(404, "not_found");
      }
      await audit(
        r,
        operation === "temporary"
          ? "user.credential_issued"
          : operation === "setup"
            ? "user.setup_requested"
            : "user.sessions_revoked",
        current,
        { reason: why, count: revokedCount },
        "user",
        id,
        undefined,
        operation === "temporary"
          ? {
              before: { credentialState: user.credentialState },
              after: { credentialState: "temporary" },
            }
          : {},
      );
    });
    return {
      ok: true,
      ...(temporaryPassword
        ? { temporaryPassword, expiresAt: new Date(Date.now() + 86400000) }
        : {}),
      ...(operation === "setup"
        ? { emailStatus: await this.setupMail(actor, id, body.currentPassword) }
        : {}),
    };
  }
  async sessions(actor: AuthUser, id: string) {
    required(actor, "users.sessions.manage");
    return {
      ok: true,
      sessions: await this.db.query(
        "SELECT s.id,s.userAgent,s.createdAt,s.lastSeenAt,s.expiresAt FROM AuthSession s JOIN User u ON u.id=s.userId JOIN Role r ON r.`key`=u.roleKey WHERE s.userId=? AND s.revokedAt IS NULL AND s.expiresAt>UTC_TIMESTAMP(3) AND s.fingerprint LIKE 'opaque-v1:%' AND (u.sessionsRevokedAt IS NULL OR s.createdAt>u.sessionsRevokedAt) AND u.status IN ('active','pending_verification') AND r.status='active' ORDER BY s.lastSeenAt DESC LIMIT 100",
        [id],
      ),
    };
  }
  async invitations(actor: AuthUser, page = 1) {
    required(actor, "invitations.manage");
    const [{ n }] = await this.db.query("SELECT COUNT(*) n FROM UserInvite");
    return {
      ok: true,
      total: Number(n),
      page,
      pageSize: 20,
      invitations: await this.db.query(
        "SELECT i.id,i.email,i.roleKey,i.createdAt,i.expiresAt,i.acceptedAt,i.cancelledAt,u.name sender,CASE WHEN i.cancelledAt IS NOT NULL THEN 'cancelled' WHEN i.acceptedAt IS NOT NULL THEN 'accepted' WHEN i.expiresAt<=UTC_TIMESTAMP(3) THEN 'expired' ELSE 'pending' END status FROM UserInvite i LEFT JOIN User u ON u.id=i.invitedById ORDER BY i.createdAt DESC LIMIT 20 OFFSET ?",
        [(Math.max(1, page) - 1) * 20],
      ),
    };
  }
  async invitation(
    actor: AuthUser,
    id: string,
    operation: string,
    body: Record<string, unknown>,
  ) {
    required(actor, "invitations.manage");
    if (!["cancel", "resend"].includes(operation))
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "user-administration");
      const current = await currentIdentity(r, actor, "invitations.manage");
      const [invite] = await r.query(
        "SELECT * FROM UserInvite WHERE id=? FOR UPDATE",
        [id],
      );
      if (!invite) throw new AuthFault(404, "not_found");
      if (invite.acceptedAt || invite.cancelledAt)
        throw new AuthFault(409, "invalid_transition");
      await assignableRole(r, current, invite.roleKey, body.currentPassword);
      if (operation === "cancel") {
        await r.query(
          "UPDATE UserInvite SET cancelledAt=UTC_TIMESTAMP(3) WHERE id=?",
          [id],
        );
        await audit(
          r,
          "invitation.cancelled",
          current,
          null,
          "user_invite",
          id,
        );
        return { ok: true };
      }
      required(current, "users.create");
      const raw = randomBytes(32).toString("hex");
      await r.query(
        "UPDATE UserInvite SET tokenHash=?,expiresAt=?,invitedById=? WHERE id=?",
        [sha256(raw), new Date(Date.now() + 7 * 86400000), current.id, id],
      );
      if (!this.env.SITE_URL) throw new AuthFault(503, "email_unavailable");
      const url = new URL(
        `/${current.locale}/auth/invite?token=${raw}`,
        this.env.SITE_URL,
      ).href;
      await new MailQueue(
        this.db,
        new PayloadCipher(this.env.OUTBOX_KEY),
      ).enqueue(
        r,
        {
          to: invite.email,
          subject: current.locale === "ar" ? "دعوة سحب" : "so7ob invitation",
          text: url,
        },
        sha256("resend:" + raw),
      );
      await audit(
        r,
        "invitation.resent",
        current,
        { emailStatus: "queued" },
        "user_invite",
        id,
      );
      return { ok: true, emailStatus: "queued" };
    });
  }
}
