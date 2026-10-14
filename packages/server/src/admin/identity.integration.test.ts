import { beforeAll, afterAll, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  SYSTEM_ROLES,
  type AuthUser,
  type Permission,
  can,
} from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { IdentityAdministrationService } from "./identity.js";
import { UserAdministrationService } from "./users.js";
import { AuthenticationService, validPassword } from "../auth/service.js";
import { PayloadCipher } from "../queue/crypto.js";
const databaseName = process.env.TEST_DATABASE_NAME;
if (!databaseName || !/^so7ob_[a-z0-9_]+_test$/.test(databaseName))
  throw new Error("Isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: databaseName }),
  prefix = "iam" + randomBytes(6).toString("hex"),
  password = "Synthetic-IAM-password-4831";
const env = {
  NODE_ENV: "production",
  SITE_URL: "https://synthetic.example.invalid",
  OUTBOX_KEY: randomBytes(32).toString("hex"),
};
const service = new IdentityAdministrationService(db, env),
  users = new UserAdministrationService(db, env),
  auth = new AuthenticationService(db, env);
const actor = (
  suffix: string,
  roleKey = "super_admin",
  permissions: Permission[] = [],
): AuthUser => ({
  id: prefix + suffix,
  email: prefix + suffix + "@example.invalid",
  name: "Synthetic actor",
  roleKey,
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions,
});
const root = actor("root"),
  other = actor("other"),
  limited = actor("limited", prefix + "_limited", [
    "users.view",
    "users.update",
    "users.roles",
    "users.provision",
    "roles.create",
    "roles.update",
    "roles.permissions",
    "roles.delegate",
  ]);
const roleInput = (key: string, permissions: Permission[] = []) => ({
  key,
  nameAr: "دور اصطناعي",
  nameEn: "Synthetic role",
  descriptionAr: "اختبار",
  descriptionEn: "Test",
  permissions,
});
const account = (suffix: string, roleKey = "client", method = "temporary") => ({
  name: "Synthetic account",
  email: prefix + suffix + "@example.invalid",
  roleKey,
  method,
  locale: "en",
  status: "active",
});
const createdRoles: string[] = [];
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  for (const role of [
    ...SYSTEM_ROLES,
    { ...roleInput(limited.roleKey, limited.permissions) },
  ]) {
    const [existing] = await db.query("SELECT `key` FROM Role WHERE `key`=?", [
      role.key,
    ]);
    if (!existing) {
      await db.query(
        "INSERT INTO Role(`key`,nameAr,nameEn,permissions,isSystem) VALUES(?,?,?,?,?)",
        [
          role.key,
          role.nameAr,
          role.nameEn,
          JSON.stringify(role.permissions),
          SYSTEM_ROLES.some((r) => r.key === role.key) ? 1 : 0,
        ],
      );
      createdRoles.push(role.key);
    }
  }
  const hash = await bcrypt.hash(password, 12);
  for (const user of [root, other, limited])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt) VALUES(?,?,?,?,?,'active',UTC_TIMESTAMP(3))",
      [user.id, user.email, user.name, hash, user.roleKey],
    );
});
afterAll(async () => {
  await db.query(
    "DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?",
    [prefix + "%"],
  );
  await db.query("DELETE FROM EmailLog WHERE `to` LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM UserInvite WHERE email LIKE ?", [prefix + "%"]);
  // Direct accounts receive random IDs; their authentication events are owned
  // by those IDs, not by the fixture's actor prefix. Remove only this run's data.
  await db.query(
    "DELETE a FROM AuditLog a JOIN User u ON a.actorId=u.id OR a.entityId=u.id WHERE u.email LIKE ?",
    [prefix + "%"],
  );
  const loginIps = ['login','changed','setup','reader','reader2','suspend','suspend2','expire','expired','old'];
  await db.query(
    `DELETE FROM AuditLog WHERE ipHash IN (${loginIps.map(() => '?').join(',')})`,
    loginIps.map(suffix => createHash('sha256').update('ip:' + prefix + suffix).digest('hex')),
  );
  await db.query(
    "DELETE FROM AuditLog WHERE actorId LIKE ? OR entityId LIKE ?",
    [prefix + "%", prefix + "%"],
  );
  await db.query("DELETE FROM User WHERE email LIKE ?", [prefix + "%"]);
  for (const key of createdRoles)
    await db.query("DELETE FROM Role WHERE `key`=?", [key]);
  await db.query("DELETE FROM Role WHERE `key` LIKE ?", [prefix + "%"]);
  await db.destroy();
});
it("creates without SMTP, never replays the temporary secret, enforces normalized database uniqueness concurrently", async () => {
  const input = account("duplicate");
  const outcomes = await Promise.allSettled([
    service.direct(root, input),
    service.direct(root, {
      ...input,
      email: " " + input.email.toUpperCase() + " ",
    }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const success = outcomes.find((r) => r.status === "fulfilled")!;
  if (success.status !== "fulfilled")
    throw new Error("Missing successful create");
  const result = success.value;
  expect(result.temporaryPassword).toBeTruthy();
  expect(result.emailStatus).toBe("not_requested");
  expect(JSON.stringify(result)).not.toContain("passwordHash");
  const [row] = await db.query("SELECT * FROM User WHERE id=?", [
    result.user.id,
  ]);
  expect(row.emailVerifiedAt).toBeNull();
  expect(row.credentialState).toBe("temporary");
  expect(
    await bcrypt.compare(result.temporaryPassword!, row.passwordHash),
  ).toBe(true);
  await expect(service.direct(root, input)).rejects.toMatchObject({
    code: "email_taken",
  });
  const login = await auth.login(
    input.email,
    result.temporaryPassword!,
    "synthetic",
    prefix + "login",
  );
  expect(login).not.toBeNull();
  const session = await auth.session(login!.raw);
  expect(session!.user.credentialState).toBe("temporary");
  await auth.changePassword(session!, result.temporaryPassword!, password);
  expect(await auth.session(login!.raw)).toBeNull();
  const changed = await auth.login(
    input.email,
    password,
    "synthetic",
    prefix + "changed",
  );
  expect((await auth.session(changed!.raw))!.user.credentialState).toBe(
    "ready",
  );
  const events = await db.query(
    "SELECT details,eventPayload FROM AuditLog WHERE entityId=?",
    [row.id],
  );
  expect(JSON.stringify(events)).not.toContain(result.temporaryPassword);
  expect(JSON.stringify(events)).not.toContain(row.passwordHash);
});
it("commits setup-pending account when mail unavailable and consumes queued setup proof once", async () => {
  const result = await service.direct(root, account("setup", "client", "link"));
  expect(result.emailStatus).toBe("needs_retry");
  expect((await users.list(root, { q: prefix + "setup" })).total).toBe(1);
  expect(
    await auth.login(
      result.user.email,
      password,
      "synthetic",
      prefix + "setup",
    ),
  ).toBeNull();
  const mailService = new IdentityAdministrationService(db, {
    ...env,
    SMTP_HOST: "synthetic.invalid",
    SMTP_FROM: "sender@example.invalid",
  });
  const sent = await mailService.userOperation(root, result.user.id, "setup", {
    reason: "account_support",
  });
  expect(sent.emailStatus).toBe("queued");
  const [job] = await db.query(
    "SELECT j.* FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
    [result.user.email],
  );
  const mail = new PayloadCipher(env.OUTBOX_KEY).decrypt(job.payload, job.id);
  const raw = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get(
    "token",
  )!;
  const results = await Promise.allSettled([
    auth.reset(raw, password),
    auth.reset(raw, password),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const [row] = await db.query(
    "SELECT emailVerifiedAt,credentialState FROM User WHERE id=?",
    [result.user.id],
  );
  expect(row).toMatchObject({
    emailVerifiedAt: null,
    credentialState: "ready",
  });
});
it("persists custom roles, detects version conflicts and revokes live session permission on next read", async () => {
  const key = prefix + "_reader";
  const made = await service.saveRole(
    root,
    undefined,
    roleInput(key, ["admin.dashboard", "users.view"]),
  );
  const created = await service.direct(root, account("reader", key));
  const login = await auth.login(
    created.user.email,
    created.temporaryPassword!,
    "synthetic",
    prefix + "reader",
  );
  await auth.changePassword(
    (await auth.session(login!.raw))!,
    created.temporaryPassword!,
    password,
  );
  const real = await auth.login(
    created.user.email,
    password,
    "synthetic",
    prefix + "reader2",
  );
  expect(can((await auth.session(real!.raw))!.user, "users.view")).toBe(true);
  const changes = await Promise.allSettled([
    service.saveRole(root, key, {
      ...roleInput(key, ["admin.dashboard"]),
      version: made.role.version,
    }),
    service.saveRole(root, key, {
      ...roleInput(key, []),
      version: made.role.version,
    }),
  ]);
  expect(changes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(changes.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "version_conflict" },
  });
  expect(can((await auth.session(real!.raw))!.user, "users.view")).toBe(false);
  expect(
    (await service.roles(root)).roles.some(
      (r: { key: string }) => r.key === key,
    ),
  ).toBe(true);
  expect(
    (await users.list(root, { role: key })).users.map((u) => u.id),
  ).toContain(created.user.id);
  const detail = await service.roleDetail(root, key);
  await expect(
    service.saveRole(root, key, { ...detail.role, status: "archived" }),
  ).rejects.toMatchObject({ code: "role_in_use" });
});
it("denies self-escalation, protected profile and credential takeover and implicit delegation", async () => {
  await expect(
    service.saveRole(
      limited,
      undefined,
      roleInput(prefix + "_escalate", ["settings.manage"]),
    ),
  ).rejects.toMatchObject({ code: "delegation_denied" });
  await expect(
    service.saveRole(limited, limited.roleKey, {
      ...roleInput(limited.roleKey, []),
      version: 1,
    }),
  ).rejects.toMatchObject({ code: "protected_role" });
  await expect(
    users.update(limited, limited.id, { roleKey: "super_admin" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    users.update(limited, root.id, {
      name: "Stolen",
      email: "attacker@example.invalid",
    }),
  ).rejects.toMatchObject({ code: "protected_account" });
  await expect(
    service.userOperation(limited, root.id, "temporary", {
      reason: "account_support",
      currentPassword: password,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.direct(limited, account("bad", "super_admin")),
  ).rejects.toMatchObject({ code: "role_not_assignable" });
  await expect(
    service.userOperation(root, other.id, "temporary", {
      reason: "account_support",
    }),
  ).rejects.toMatchObject({ code: "reauth_required" });
  await expect(
    service.saveRole(root, undefined, {
      ...roleInput(prefix + "_clone"),
      copyFrom: "super_admin",
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("revokes sessions on suspension and never revives them on reactivation", async () => {
  const made = await service.direct(root, account("suspend"));
  const first = await auth.login(
    made.user.email,
    made.temporaryPassword!,
    "synthetic",
    prefix + "suspend",
  );
  await auth.changePassword(
    (await auth.session(first!.raw))!,
    made.temporaryPassword!,
    password,
  );
  const login = await auth.login(
    made.user.email,
    password,
    "synthetic",
    prefix + "suspend2",
  );
  await users.update(root, made.user.id, {
    status: "suspended",
    reason: "security_response",
  });
  expect(await auth.session(login!.raw)).toBeNull();
  await users.update(root, made.user.id, {
    status: "active",
    reason: "account_support",
  });
  expect(await auth.session(login!.raw)).toBeNull();
});
it("invitation cancellation and sender authority are checked atomically at acceptance", async () => {
  const email = prefix + "invite@example.invalid";
  await users.invite(root, { email, roleKey: "client" }, prefix + "invite");
  const [invite] = await db.query("SELECT * FROM UserInvite WHERE email=?", [
    email,
  ]);
  const [job] = await db.query(
    "SELECT j.* FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
    [email],
  );
  const raw = new URL(
    new PayloadCipher(env.OUTBOX_KEY)
      .decrypt(job.payload, job.id)
      .text.match(/https:\/\/\S+/)![0],
  ).searchParams.get("token")!;
  await service.invitation(root, invite.id, "cancel", {});
  await expect(
    auth.acceptInvite(raw, "Synthetic invite", password),
  ).rejects.toMatchObject({ code: "invalid_token" });
  const email2 = prefix + "staleinvite@example.invalid";
  await users.invite(
    other,
    { email: email2, roleKey: "client" },
    prefix + "invite2",
  );
  const [job2] = await db.query(
    "SELECT j.* FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
    [email2],
  );
  const raw2 = new URL(
    new PayloadCipher(env.OUTBOX_KEY)
      .decrypt(job2.payload, job2.id)
      .text.match(/https:\/\/\S+/)![0],
  ).searchParams.get("token")!;
  await users.update(root, other.id, {
    roleKey: "client",
    currentPassword: password,
  });
  await expect(
    auth.acceptInvite(raw2, "Synthetic invite", password),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects bcrypt truncation including Arabic byte length", () => {
  expect(validPassword("Ab1" + "ع".repeat(35))).toBe(false);
  expect(validPassword("Ab1" + "ع".repeat(34))).toBe(true);
  expect(validPassword("A1" + "x".repeat(71))).toBe(false);
});
it("refuses archived roles and archives only unreferenced roles", async () => {
  const key = prefix + "_archived";
  const made = await service.saveRole(root, undefined, roleInput(key));
  await service.saveRole(root, key, { ...made.role, status: "archived" });
  await expect(
    service.direct(root, account("archived", key)),
  ).rejects.toMatchObject({ code: "role_disabled" });
});
it("records role changes without credential secrets", async () => {
  const rows = await db.query(
    "SELECT action,eventPayload FROM AuditLog WHERE actorId=? AND entityType='role'",
    [root.id],
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.some((r: { eventPayload: string }) =>
      r.eventPayload.includes("permissions"),
    ),
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toContain(password);
});
it("rolls back account creation and role mutation if success audit fails", async () => {
  const key = prefix + "_rollback",
    made = await service.saveRole(root, undefined, roleInput(key));
  await db.query(
    "CREATE TRIGGER iam84_audit_failure BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.action IN ('user.created','role.updated') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic identity audit outage'; END IF; END",
  );
  try {
    await expect(service.direct(root, account("rollback"))).rejects.toThrow(
      "Synthetic identity audit outage",
    );
    expect(
      await db.query("SELECT id FROM User WHERE email=?", [
        account("rollback").email,
      ]),
    ).toEqual([]);
    await expect(
      service.saveRole(root, key, { ...made.role, nameEn: "Must roll back" }),
    ).rejects.toThrow("Synthetic identity audit outage");
    expect((await service.roleDetail(root, key)).role.nameEn).toBe(
      made.role.nameEn,
    );
  } finally {
    await db.query("DROP TRIGGER iam84_audit_failure");
  }
});
it("refuses role archiving while referenced by an invitation or draft page", async () => {
  const key = prefix + "_referenced",
    made = await service.saveRole(root, undefined, roleInput(key));
  await users.invite(
    root,
    { email: prefix + "reference@example.invalid", roleKey: key },
    prefix + "reference",
  );
  await expect(
    service.saveRole(root, key, { ...made.role, status: "archived" }),
  ).rejects.toMatchObject({ code: "role_in_use" });
  const [invite] = await db.query("SELECT id FROM UserInvite WHERE email=?", [
    prefix + "reference@example.invalid",
  ]);
  await service.invitation(root, invite.id, "cancel", {});
  const { PageAdministrationService } = await import("./pages.js");
  const page = await new PageAdministrationService(db).create(root, {
    slug: prefix + "-restricted",
    titleAr: "صفحة اصطناعية",
    titleEn: "Synthetic restricted",
    template: "blank-section",
  });
  try {
    await db.query("UPDATE Page SET draftSettings=? WHERE id=?", [
      JSON.stringify({ allowedRoles: [key] }),
      page.page.id,
    ]);
    await expect(
      service.saveRole(root, key, { ...made.role, status: "archived" }),
    ).rejects.toMatchObject({ code: "role_in_use" });
  } finally {
    await db.query("DELETE FROM PageVersion WHERE pageId=?", [page.page.id]);
    await db.query("DELETE FROM Page WHERE id=?", [page.page.id]);
  }
  await service.saveRole(root, key, { ...made.role, status: "archived" });
});
it("temporary credentials expire and administrative reissue invalidates tokens and sessions", async () => {
  const made = await service.direct(root, account("expire"));
  const login = await auth.login(
    made.user.email,
    made.temporaryPassword!,
    "synthetic",
    prefix + "expire",
  );
  await db.query(
    "UPDATE User SET credentialExpiresAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
    [made.user.id],
  );
  expect(await auth.session(login!.raw)).toBeNull();
  expect(
    await auth.login(
      made.user.email,
      made.temporaryPassword!,
      "synthetic",
      prefix + "expired",
    ),
  ).toBeNull();
  const renewed = await service.userOperation(root, made.user.id, "temporary", {
    reason: "account_support",
    currentPassword: password,
  });
  expect(renewed.temporaryPassword).toBeTruthy();
  expect(renewed.temporaryPassword).not.toBe(made.temporaryPassword);
  expect(await auth.session(login!.raw)).toBeNull();
  expect(
    await auth.login(
      made.user.email,
      made.temporaryPassword!,
      "synthetic",
      prefix + "old",
    ),
  ).toBeNull();
});
it("rechecks delegation after a concurrent role revocation releases the administration lock", async () => {
  const { lockOperation } = await import("../business/persistence.js");
  const r = db.createQueryRunner();
  await r.connect();
  await r.startTransaction();
  try {
    await lockOperation(r, "user-administration");
    await r.query("UPDATE Role SET permissions='[]' WHERE `key`=?", [
      limited.roleKey,
    ]);
    const attempt = service.direct(limited, account("racing"));
    const rejection = expect(attempt).rejects.toMatchObject({ status: 403 });
    await r.commitTransaction();
    await rejection;
    expect(
      await db.query("SELECT id FROM User WHERE email=?", [
        account("racing").email,
      ]),
    ).toEqual([]);
  } finally {
    if (r.isTransactionActive) await r.rollbackTransaction();
    await r.release();
    await db.query("UPDATE Role SET permissions=? WHERE `key`=?", [
      JSON.stringify(limited.permissions),
      limited.roleKey,
    ]);
  }
});
