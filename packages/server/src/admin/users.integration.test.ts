import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { SYSTEM_ROLES, type AuthUser, type Permission } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { UserAdministrationService } from "./users.js";
import { PayloadCipher } from "../queue/crypto.js";
import { AuthenticationService } from "../auth/service.js";
import { sha256 } from "../auth/persistence.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated actual MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "admin" + randomBytes(6).toString("hex");
const env = {
  NODE_ENV: "production",
  SITE_URL: "https://migration.example.invalid",
  OUTBOX_KEY: randomBytes(32).toString("hex"),
};
const service = new UserAdministrationService(db, env),
  createdRoles: string[] = [];
const actor = (
  id: string,
  roleKey: string,
  permissions: Permission[] = [],
): AuthUser => ({
  id: prefix + id,
  email: prefix + id + "@example.invalid",
  name: "Synthetic " + id,
  roleKey,
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions,
});
const admin = actor("one", "super_admin"),
  second = actor("two", "super_admin"),
  owner = actor("client", "client"),
  ops = actor(
    "ops",
    "ops_manager",
    SYSTEM_ROLES.find((r) => r.key === "ops_manager")!.permissions,
  ),
  manager = actor("manager", prefix, [
    "users.view",
    "users.update",
    "users.roles",
    "users.suspend",
    "users.create",
  ]);
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  const [{ n }] = await db.query(
    "SELECT COUNT(*) n FROM User WHERE roleKey='super_admin' AND status='active'",
  );
  if (Number(n) !== 0)
    throw new Error(
      "Last-admin test requires an empty isolated admin fixture; existing accounts will not be changed",
    );
  for (const role of [
    ...SYSTEM_ROLES,
    {
      key: prefix,
      nameAr: "اختبار",
      nameEn: "Synthetic delegated user manager",
      permissions: manager.permissions,
    },
  ]) {
    if (
      !(await db.query("SELECT `key` FROM Role WHERE `key`=?", [role.key]))
        .length
    ) {
      await db.query(
        "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
        [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)],
      );
      createdRoles.push(role.key);
    }
  }
  for (const [i, user] of [admin, second, owner, ops, manager].entries())
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt,createdAt) VALUES(?,?,?,'never-return-this-secret',?,'active',UTC_TIMESTAMP(3),?)",
      [
        user.id,
        user.email,
        user.name,
        user.roleKey,
        new Date(Date.UTC(2025, 0, 1, 0, i)),
      ],
    );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,assigneeId) VALUES(?,?,'quote','web','Synthetic description','hash','unspecified','flexible','Owner',?,'email','en',?,?)",
    [prefix + "request", prefix + "ref", owner.email, owner.id, ops.id],
  );
});
beforeEach(async () => {
  for (const user of [admin, second, owner, ops, manager])
    await db.query("UPDATE User SET roleKey=?,status='active' WHERE id=?", [
      user.roleKey,
      user.id,
    ]);
  await db.query("DELETE FROM RateLimitBucket WHERE bucketKey IN (?,?)", [
    sha256("invite:" + admin.id),
    sha256("invite:" + manager.id),
  ]);
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DELETE FROM ProjectRequest WHERE id=?", [prefix + "request"]);
  await db.query(
    "DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?",
    [prefix + "%"],
  );
  await db.query("DELETE FROM EmailLog WHERE `to` LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM UserInvite WHERE email LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM AuditLog WHERE actorId LIKE ? OR actorEmail LIKE ?", [prefix + "%", prefix + "%"]);
  await db.query("DELETE FROM User WHERE email LIKE ?", [prefix + "%"]);
  for (const role of createdRoles)
    await db.query("DELETE FROM Role WHERE `key`=?", [role]);
  for (const user of [admin, manager])
    await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
      sha256("invite:" + user.id),
    ]);
  await db.destroy();
});
it("preserves list search, filters, safe projection, counts, pagination and rejected sort fallback", async () => {
  const result = await service.list(ops, {
    q: prefix.toUpperCase(),
    role: "client",
    sort: "email",
    dir: "asc",
  });
  expect(result).toMatchObject({
    ok: true,
    total: 1,
    page: 1,
    pageSize: 20,
    users: [
      { id: owner.id, requestsCount: 1, assignedCount: 0, emailVerified: true },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /passwordHash|never-return|fingerprint/,
  );
  expect((await service.list(admin, { q: prefix, page: "2" })).users).toEqual(
    [],
  );
  expect(
    (
      await service.list(admin, { q: prefix, sort: "not-a-column", dir: "asc" })
    ).users.map((u) => u.id),
  ).toEqual([manager.id, ops.id, owner.id, second.id, admin.id]);
  expect((await service.list(admin, { q: "' OR 1=1 --" })).total).toBe(0);
});
it("denies unauthorized reads and modifications independently of client UI", async () => {
  await expect(service.list(owner, {})).rejects.toMatchObject({ status: 403 });
  await expect(service.detail(owner, admin.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    service.update(owner, owner.id, { name: "Changed" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.invite(ops, { email: prefix + "deny@example.invalid" }, "local"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(service.detail(admin, "absent")).rejects.toMatchObject({
    status: 404,
    code: "not_found",
  });
});
it("returns safe detail, original request statistics, and only operational sessions", async () => {
  await db.query(
    "INSERT INTO AuthSession(id,userId,fingerprint,expiresAt) VALUES(?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3))),(?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))",
    [
      prefix + "old",
      owner.id,
      sha256("historical"),
      prefix + "new",
      owner.id,
      "opaque-v1:" + sha256("operational"),
    ],
  );
  const result = await service.detail(ops, owner.id);
  expect(result.stats).toEqual({ totalRequests: 1, openRequests: 1 });
  expect(result.sessions.activeCount).toBe(1);
  expect(result.requests[0].assigneeName).toBe(ops.name);
  expect(JSON.stringify(result)).not.toMatch(
    /passwordHash|never-return|fingerprint|opaque-v1/,
  );
  expect(
    (
      await db.query(
        "SELECT id FROM AuthSession WHERE id=? AND revokedAt IS NULL",
        [prefix + "old"],
      )
    ).length,
  ).toBe(1);
});
it("permits profile fields but rejects separate role/status powers atomically", async () => {
  await expect(
    service.update(ops, owner.id, {
      name: "Should roll back",
      roleKey: "support",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await service.detail(admin, owner.id)).user.name).toBe(owner.name);
  await expect(
    service.update(ops, owner.id, { status: "active" }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await service.update(ops, owner.id, {
      name: "  Updated client  ",
      phone: " ",
      company: " Synthetic ",
      passwordHash: "injected",
    }),
  ).toMatchObject({
    ok: true,
    user: { name: "Updated client", phone: null, company: "Synthetic" },
  });
  const [row] = await db.query("SELECT passwordHash FROM User WHERE id=?", [
    owner.id,
  ]);
  expect(row.passwordHash).toBe("never-return-this-secret");
  await expect(
    service.update(admin, owner.id, { passwordHash: "injected", name: "x" }),
  ).rejects.toMatchObject({ status: 400, code: "invalid" });
});
it("serializes concurrent administrator demotion/suspension and preserves one active administrator", async () => {
  const results = await Promise.allSettled([
    service.update(manager, admin.id, { roleKey: "client" }),
    service.update(manager, second.id, { status: "suspended" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    results.filter((r) => r.status === "rejected").map((r) => r.reason.code),
  ).toEqual(["last_admin"]);
  const [{ n }] = await db.query(
    "SELECT COUNT(*) n FROM User WHERE roleKey='super_admin' AND status='active'",
  );
  expect(Number(n)).toBe(1);
});
it("protects the last active administrator from pending-verification as well as suspension or demotion", async () => {
  await service.update(manager, second.id, { roleKey: "client" });
  for (const body of [
    { status: "suspended" },
    { status: "pending_verification" },
    { roleKey: "client" },
  ])
    await expect(service.update(manager, admin.id, body)).rejects.toMatchObject(
      { status: 409, code: "last_admin" },
    );
  expect((await service.detail(manager, admin.id)).user.status).toBe("active");
});
it("revokes sessions and audits suspension in the same transaction, without reviving on reactivation", async () => {
  await service.update(admin, owner.id, { status: "suspended" });
  const [session] = await db.query(
    "SELECT revokedAt,revokedReason FROM AuthSession WHERE id=?",
    [prefix + "new"],
  );
  expect(session.revokedAt).toBeInstanceOf(Date);
  expect(session.revokedReason).toBe("suspended");
  expect(
    (await service.detail(admin, owner.id)).user.suspendedAt,
  ).toBeInstanceOf(Date);
  await service.update(admin, owner.id, { status: "active" });
  expect((await service.detail(admin, owner.id)).sessions.activeCount).toBe(0);
});
it("rechecks a stale actor role inside the serialized write transaction", async () => {
  await service.update(admin, manager.id, { roleKey: "client" });
  await expect(
    service.update(manager, owner.id, { roleKey: "super_admin" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.invite(
      manager,
      { email: prefix + "stale@example.invalid" },
      "local",
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("persists one invitation under concurrency, queues encrypted single-use proof and records no token in audit/outbox", async () => {
  const email = prefix + "invite@example.invalid",
    body = {
      email: email.toUpperCase(),
      roleKey: "support",
      name: "Ignored until acceptance",
    };
  const result = await Promise.allSettled([
    service.invite(admin, body, "local"),
    service.invite(manager, body, "local"),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    result.filter((r) => r.status === "rejected").map((r) => r.reason.code),
  ).toEqual(["invite_pending"]);
  const [job] = await db.query(
    "SELECT j.id,j.payload,e.bodyText,e.status FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
    [email],
  );
  expect(job.bodyText).toBe("");
  expect(job.status).toBe("queued");
  const mail = new PayloadCipher(env.OUTBOX_KEY).decrypt(job.payload, job.id),
    raw = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get(
      "token",
    )!;
  const [invite] = await db.query("SELECT * FROM UserInvite WHERE email=?", [
    email,
  ]);
  expect(invite.tokenHash).toBe(sha256(raw));
  expect(invite.expiresAt.getTime() - Date.now()).toBeGreaterThan(
    7 * 86400000 - 10000,
  );
  expect(
    JSON.stringify(
      await db.query("SELECT details FROM AuditLog WHERE entityId=?", [email]),
    ),
  ).not.toContain(raw);
  const auth = new AuthenticationService(db, env);
  await auth.acceptInvite(raw, "Accepted user", "Synthetic-password-123");
  await expect(
    auth.acceptInvite(raw, "Repeated", "Synthetic-password-123"),
  ).rejects.toMatchObject({ code: "invalid_token" });
  const [account] = await db.query(
    "SELECT name,roleKey,emailVerifiedAt FROM User WHERE email=?",
    [email],
  );
  expect(account.name).toBe("Accepted user");
  expect(account.roleKey).toBe("support");
  expect(account.emailVerifiedAt).toBeInstanceOf(Date);
});
it("counts invalid invitation attempts once and preserves exact five-attempt short quota", async () => {
  for (let n = 0; n < 5; n++) {
    const permit = await service.reserveInvitation(admin);
    await expect(
      service.invite(admin, { email: "bad" }, "local", permit),
    ).rejects.toMatchObject({ status: 400, code: "invalid" });
  }
  await expect(service.reserveInvitation(admin)).rejects.toMatchObject({
    status: 429,
    code: "rate_limited",
  });
});
it("rejects existing accounts and unknown roles and rolls back invitation when encrypted outbox fails", async () => {
  await expect(
    service.invite(admin, { email: owner.email }, "local"),
  ).rejects.toMatchObject({ code: "email_taken" });
  await expect(
    service.invite(
      admin,
      { email: prefix + "invalid@example.invalid", roleKey: "unknown" },
      "local",
    ),
  ).rejects.toMatchObject({ code: "invalid" });
  const broken = new UserAdministrationService(db, {
      ...env,
      OUTBOX_KEY: "invalid",
    }),
    email = prefix + "rollback@example.invalid";
  await expect(broken.invite(admin, { email }, "local")).rejects.toThrow(
    "OUTBOX_KEY",
  );
  expect(
    await db.query("SELECT id FROM UserInvite WHERE email=?", [email]),
  ).toEqual([]);
  expect(
    await db.query("SELECT id FROM AuditLog WHERE entityId=?", [email]),
  ).toEqual([]);
});
it("keeps expired invitation history without extending its token and permits a fresh invitation", async () => {
  const email = prefix + "expired@example.invalid",
    raw = randomBytes(32).toString("hex"),
    oldId = prefix + "expiredinvite",
    expiry = new Date("2025-01-01");
  await db.query(
    "INSERT INTO UserInvite(id,email,roleKey,tokenHash,invitedById,expiresAt) VALUES(?,?,'client',?,?,?)",
    [oldId, email, sha256(raw), admin.id, expiry],
  );
  const auth = new AuthenticationService(db, env);
  await expect(
    auth.acceptInvite(raw, "Expired", "Synthetic-password-123"),
  ).rejects.toMatchObject({ code: "invalid_token" });
  expect(await service.invite(admin, { email }, "local")).toEqual({
    ok: true,
    emailStatus: "queued",
  });
  const rows = await db.query(
    "SELECT id,expiresAt,acceptedAt FROM UserInvite WHERE email=?",
    [email],
  );
  expect(rows).toHaveLength(2);
  expect(rows.find((r: { id: string }) => r.id === oldId)).toMatchObject({
    expiresAt: expiry,
    acceptedAt: null,
  });
});
it("rolls status and session revocation back when the audit write fails", async () => {
  const trigger = prefix + "auditfailure";
  // Real database failure, scoped to this fixture; no mock of the transaction.
  await db.query(
    `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorId='${admin.id}' AND NEW.action='user.suspended' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic_audit_failure'; END IF; END`,
  );
  try {
    await db.query(
      "INSERT INTO AuthSession(id,userId,fingerprint,expiresAt) VALUES(?,?,?,TIMESTAMPADD(DAY,1,UTC_TIMESTAMP(3)))",
      [prefix + "atomic", ops.id, "opaque-v1:" + sha256(prefix + "atomic")],
    );
    await expect(
      service.update(admin, ops.id, { status: "suspended" }),
    ).rejects.toThrow("synthetic_audit_failure");
    expect(
      (
        await db.query("SELECT status,sessionsRevokedAt FROM User WHERE id=?", [
          ops.id,
        ])
      )[0],
    ).toEqual({ status: "active", sessionsRevokedAt: null });
    expect(
      (
        await db.query("SELECT revokedAt FROM AuthSession WHERE id=?", [
          prefix + "atomic",
        ])
      )[0].revokedAt,
    ).toBeNull();
  } finally {
    await db.query(`DROP TRIGGER \`${trigger}\``);
  }
});
