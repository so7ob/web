import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SYSTEM_ROLES,
  type AuthUser,
  type AuditEventV1,
} from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { audit, transaction } from "../auth/persistence.js";
import { AdminConversationService } from "../admin/conversations.js";
import { AuditReader } from "./reader.js";
import { AuditReports, csvCell } from "./reports.js";
import { AuditReviews } from "./reviews.js";
import { AuditOperations } from "./operations.js";
import { auditContext } from "./context.js";
import { validateFilter } from "./query.js";
import { diff, safeContext } from "./redaction.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "audit" + randomBytes(6).toString("hex");
const actor: AuthUser = {
  id: prefix,
  email: prefix + "@example.invalid",
  name: "مراجع اصطناعي",
  roleKey: "super_admin",
  status: "active",
  locale: "ar",
  emailVerified: true,
  permissions: SYSTEM_ROLES[0].permissions,
};
const reader = new AuditReader(db),
  reviews = new AuditReviews(db),
  ops = new AuditOperations(db),
  threads = new AdminConversationService(db);
let reportRoot: string,
  reports: AuditReports,
  createdRole = false;
beforeAll(async () => {
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("hex"));
  await mkdir(resolve(".migration/audit-implementation"), { recursive: true });
  await db.initialize();
  await db.runMigrations();
  createdRole = !(
    await db.query("SELECT `key` FROM Role WHERE `key`='super_admin'")
  ).length;
  await db.query(
    "INSERT IGNORE INTO Role(`key`,nameAr,nameEn,permissions) VALUES('super_admin','مدير','Admin','[]')",
  );
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic','super_admin','active')",
    [actor.id, actor.email, actor.name],
  );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','synthetic','synthetic','unspecified','flexible','Synthetic',?,'email','ar')",
    [prefix + "req", "REQ-DEMO-104-" + prefix, actor.email],
  );
  await db.query(
    "INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale) VALUES(?,?,'synthetic','Synthetic',?,'general','ar')",
    [prefix + "inq", prefix + "inq", actor.email],
  );
  reportRoot = await mkdtemp(
    resolve(".migration/audit-implementation/report-test-"),
  );
  reports = new AuditReports(db, { ...process.env, DATA_DIR: reportRoot });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.query(
    "DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=?",
    [actor.email],
  );
  await db.query("DELETE FROM EmailLog WHERE `to`=?", [actor.email]);
  await db.query("DELETE FROM AuditCaseHistory WHERE actorId=?", [prefix]);
  await db.query(
    "DELETE ce FROM AuditCaseEvent ce JOIN AuditCase c ON c.id=ce.caseId WHERE c.ownerId=?",
    [prefix],
  );
  await db.query("DELETE FROM AuditCase WHERE ownerId=?", [prefix]);
  await db.query("DELETE FROM AuditBookmark WHERE userId=?", [prefix]);
  await db.query("DELETE FROM AuditView WHERE userId=?", [prefix]);
  await db.query("DELETE FROM AuditPreference WHERE userId=?", [prefix]);
  await db.query("DELETE FROM AuditReport WHERE userId=?", [prefix]);
  await db.query(
    "DELETE w FROM AuditWork w JOIN AuditLog a ON a.id=w.eventId WHERE a.actorId=? OR a.entityId LIKE ? OR a.correlationId=?",
    [prefix, prefix + "%", prefix],
  );
  await db.query("DELETE FROM AuditLog WHERE actorId=? OR entityId LIKE ? OR correlationId=?", [
    prefix,
    prefix + "%",
    prefix,
  ]);
  await db.query("DELETE FROM ProjectRequest WHERE id=?", [prefix + "req"]);
  await db.query("DELETE FROM Inquiry WHERE id=?", [prefix + "inq"]);
  await db.query("DELETE FROM User WHERE id=?", [prefix]);
  if (createdRole)
    await db.query(
      "DELETE FROM Role WHERE `key`='super_admin' AND NOT EXISTS(SELECT 1 FROM User WHERE roleKey='super_admin')",
    );
  await db.destroy();
  if (reportRoot) await rm(reportRoot, { recursive: true, force: true });
});
it("records accurate concurrent changes without changing sparse mutation semantics", async () => {
  await Promise.all([
    threads.patch(actor, "requests", prefix + "req", { priority: "high" }),
    threads.patch(actor, "requests", prefix + "req", { status: "in_review" }),
  ]);
  const result = await reader.search(actor, { resourceId: prefix + "req" });
  expect(result.stats.events).toBe(2);
  expect(
    result.rows.every(
      (e) =>
        e.actor.name === actor.name &&
        e.resource.reference?.startsWith("REQ-DEMO-104"),
    ),
  ).toBe(true);
  const priority = result.rows.find(
    (e) => e.action === "request.priority_changed",
  )!;
  expect(priority.changes).toEqual([
    {
      path: "priority",
      before: { state: "value", value: "normal" },
      after: { state: "value", value: "high" },
    },
  ]);
  await expect(
    threads.patch(actor, "requests", prefix + "req", { status: "in_review" }),
  ).rejects.toMatchObject({ status: 409 });
  await threads.patch(actor, "requests", prefix + "req", { priority: "high" });
  const repeated = await reader.search(actor, { resourceId: prefix + "req" });
  expect(
    repeated.rows.find((e) => e.reasonCode === "no_change")?.changes,
  ).toEqual([]);
});
it("keeps actor history stable and denies independent permissions", async () => {
  await db.query("UPDATE User SET name=? WHERE id=?", [
    "Changed later",
    prefix,
  ]);
  const result = await reader.search(actor, { resourceId: prefix + "req" });
  expect(result.rows.every((e) => e.actor.name === actor.name)).toBe(true);
  const limited = {
    ...actor,
    roleKey: "custom",
    permissions: ["audit.view"] as AuthUser["permissions"],
  };
  expect(
    (await reader.detail(limited, result.rows[0].id)).event.actor.email,
  ).toBeUndefined();
  await expect(reports.create(limited, {})).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    reviews.bookmark(limited, result.rows[0].id, true),
  ).rejects.toMatchObject({ status: 403 });
  await expect(ops.rules(limited)).rejects.toMatchObject({ status: 403 });
});
it("rolls back business and success event when mandatory writer fails", async () => {
  const id = prefix + "req";
  await db.query(
    `CREATE TRIGGER ${prefix}fail BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.entityId='${id}' AND NEW.action='request.priority_changed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END`,
  );
  try {
    await expect(
      threads.patch(actor, "requests", id, { priority: "urgent" }),
    ).rejects.toThrow();
    expect(
      (
        await db.query("SELECT priority FROM ProjectRequest WHERE id=?", [id])
      )[0].priority,
    ).toBe("high");
  } finally {
    await db.query(`DROP TRIGGER ${prefix}fail`);
  }
  const count = (await reader.search(actor, { resourceId: id })).stats.events;
  await expect(
    transaction(db, async (r) => {
      await audit(r, "request.updated", actor, null, "request", id);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await reader.search(actor, { resourceId: id })).stats.events).toBe(
    count,
  );
});
it("tracks inquiry archive and every affected bulk resource with explicit batch identity", async () => {
  await threads.patch(actor, "inquiries", prefix + "inq", {
    action: "archive",
  });
  expect(
    (await reader.search(actor, { resourceId: prefix + "inq" })).rows[0]
      .changes[0].path,
  ).toBe("archivedAt");
  await threads.bulk(actor, "requests", {
    ids: [prefix + "req"],
    action: "archive",
  });
  const rows = (await reader.search(actor, { resourceId: prefix + "req" }))
    .rows;
  const archived = rows.find((e) => e.action === "request.archived")!;
  expect(archived.batchId).toBeTruthy();
  const batch = await reader.related(actor, archived.id, "batch");
  expect(batch.rows).toHaveLength(2);
  expect(
    batch.rows.find((e) => e.action === "batch.completed")?.resource.id,
  ).toBe(archived.batchId);
});
it("binds cursors to filters and principal and orders equal timestamps", async () => {
  const first = await reader.search(actor, {
    resourceId: prefix + "req",
    limit: 1,
  });
  expect(first.nextCursor).toBeTruthy();
  const second = await reader.search(actor, {
    resourceId: prefix + "req",
    limit: 1,
    cursor: first.nextCursor!,
  });
  expect(second.rows[0].id).not.toBe(first.rows[0].id);
  await expect(
    reader.search(actor, {
      resourceId: "other",
      limit: 1,
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    reader.search(actor, {
      resourceId: prefix + "req",
      limit: 1,
      cursor: first.nextCursor! + "x",
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("redacts historical payloads and never turns unknown outcomes into success", async () => {
  const id = prefix + "legacy";
  await db.query(
    "INSERT INTO AuditLog(id,action,entityType,entityId,details) VALUES(?,?,?,?,?)",
    [
      id,
      "request.updated",
      "ProjectRequest",
      prefix + "req",
      JSON.stringify({
        password: "SYNTHETIC_SECRET",
        before: JSON.stringify({ description: "SYNTHETIC_SECRET" }),
        nested: { authorization: "SYNTHETIC_SECRET" },
      }),
    ],
  );
  const result = await reader.detail(actor, id);
  expect(result.event.outcome).toBe("unknown");
  expect(result.event.actor.type).toBe("unknown");
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
  await db.query("UPDATE AuditLog SET details='{' WHERE id=?", [id]);
  expect((await reader.detail(actor, id)).event.malformed).toBe(true);
  expect(safeContext("request.updated", { token: "SYNTHETIC_SECRET" })).toEqual(
    {},
  );
  const changes = diff(
    "request.updated",
    { description: "before" },
    { description: "SYNTHETIC_SECRET" },
  );
  expect(changes.changes).toEqual([
    {
      path: "description",
      before: { state: "redacted" },
      after: { state: "redacted" },
    },
  ]);
});
it("review comments, closure and hold preserve the original event", async () => {
  const event = (await reader.search(actor, { resourceId: prefix + "req" }))
    .rows[0];
  const [before] = await db.query("SELECT * FROM AuditLog WHERE id=?", [
    event.id,
  ]);
  const review = await reviews.createCase(actor, {
    title: "Synthetic investigation",
    ownerId: prefix,
    eventIds: [event.id],
  });
  await reviews.updateCase(actor, review.id, {
    revision: 0,
    note: "ملاحظة تحقيق آمنة",
  });
  await expect(
    reviews.updateCase(actor, review.id, { revision: 1, state: "closed" }),
  ).rejects.toMatchObject({ status: 400 });
  await reviews.updateCase(actor, review.id, {
    revision: 1,
    state: "closed",
    closureReason: "Reviewed evidence",
    held: true,
  });
  expect((await reviews.caseDetail(actor, review.id)).case.held).toBe(1);
  expect(
    (await db.query("SELECT * FROM AuditLog WHERE id=?", [event.id]))[0],
  ).toEqual(before);
});
it("prepares complete CSV/JSON reports and checks current permission at download", async () => {
  const rows = await reader.search(actor, { resourceId: prefix + "req" }),
    ids = rows.rows.map((e) => e.id);
  const job = await reports.create(actor, {
    format: "json",
    scope: "selected",
    locale: "ar",
    timezone: "Asia/Aden",
    filters: { ids, includeAccess: true },
  });
  await reports.processOne();
  const detail = await reports.authorized(actor, job.id);
  expect(detail.status).toBe("completed");
  const file = JSON.parse(
    await readFile((await reports.download(actor, job.id)).path, "utf8"),
  );
  expect(file.events.map((e: AuditEventV1) => e.id).sort()).toEqual(ids.sort());
  expect(JSON.stringify(file)).not.toContain("SYNTHETIC_SECRET");
  const manifest = (await reports.verify(actor, job.id)).manifest;
  expect(manifest.eventCount).toBe(ids.length);
  expect(manifest.eventIds.sort()).toEqual(ids.sort());
  const otherId = prefix + "reportOwner";
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,'Other authorized reporter','synthetic','super_admin','active')",
    [otherId, otherId + "@example.invalid"],
  );
  try {
    await expect(
      reports.download({ ...actor, id: otherId }, job.id),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    await db.query("DELETE FROM User WHERE id=?", [otherId]);
  }

  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,'محدود','Limited',?)",
    [prefix + "role", JSON.stringify(["audit.view", "audit.export"])],
  );
  await db.query("UPDATE User SET roleKey=? WHERE id=?", [
    prefix + "role",
    prefix,
  ]);
  try {
    await expect(reports.download(actor, job.id)).rejects.toMatchObject({
      status: 403,
    });
    await db.query("UPDATE Role SET permissions=? WHERE `key`=?", [
      JSON.stringify(["audit.view"]),
      prefix + "role",
    ]);
    await expect(reports.download(actor, job.id)).rejects.toMatchObject({
      status: 403,
    });
  } finally {
    await db.query("UPDATE User SET roleKey='super_admin' WHERE id=?", [
      prefix,
    ]);
    await db.query("DELETE FROM Role WHERE `key`=?", [prefix + "role"]);
  }
  expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
  expect(csvCell('عربي، "نص"\nثان')).toContain('""نص""');
});
it("survives account deletion without rewriting the historical identity", async () => {
  const uid = prefix + "deleted";
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,'Historical name','synthetic','super_admin','active')",
    [uid, uid + "@example.invalid"],
  );
  await transaction(db, (r) =>
    audit(
      r,
      "user.profile_updated",
      { id: uid, email: uid + "@example.invalid" },
      null,
      "user",
      uid,
    ),
  );
  const [original] = await db.query("SELECT * FROM AuditLog WHERE actorId=?", [
    uid,
  ]);
  await db.query("DELETE FROM User WHERE id=?", [uid]);
  expect(
    (await db.query("SELECT * FROM AuditLog WHERE id=?", [original.id]))[0],
  ).toEqual(original);
  expect((await reader.detail(actor, original.id)).event.actor.name).toBe(
    "Historical name",
  );
});
it("cancels jobs, fences lost leases, expires files, and preserves original evidence", async () => {
  const ids = (
    await reader.search(actor, { resourceId: prefix + "req" })
  ).rows.map((e) => e.id);
  const input = {
    format: "csv",
    scope: "selected",
    locale: "ar",
    timezone: "UTC",
    filters: { ids, includeAccess: true },
  };
  const cancelled = await reports.create(actor, input);
  await reports.cancel(actor, cancelled.id);
  expect(
    (
      await db.query("SELECT status FROM AuditReport WHERE id=?", [
        cancelled.id,
      ])
    )[0].status,
  ).toBe("cancelled");
  const recovered = await reports.create(actor, input);
  const lease = await reports.claim();
  expect(lease.id).toBe(recovered.id);
  await db.query(
    "UPDATE AuditReport SET leaseUntil=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?",
    [lease.id],
  );
  await reports.processOne();
  expect((await reports.authorized(actor, recovered.id)).attempts).toBe(2);
  const output = await reports.download(actor, recovered.id);
  expect(await readFile(output.path, "utf8")).toContain("eventId");
  await db.query(
    "UPDATE AuditReport SET expiresAt=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?",
    [recovered.id],
  );
  await expect(reports.download(actor, recovered.id)).rejects.toMatchObject({
    status: 410,
  });
  await reports.cleanup();
  await expect(readFile(output.path)).rejects.toMatchObject({ code: "ENOENT" });
  expect(
    (await reader.search(actor, { resourceId: prefix + "req" })).stats.events,
  ).toBe(ids.length);
});
it("creates deterministic security alerts once and probes independently of business volume", async () => {
  const [rule] = await db.query(
    "SELECT * FROM AuditRule WHERE kind='security'",
  );
  await ops.updateRule(actor, rule.id, {
    revision: rule.revision,
    enabled: true,
    thresholdValue: 2,
    windowSeconds: 86400,
    cooldownSeconds: 900,
    severity: "high",
    rationale: "Synthetic repeated denial",
    scope: "security",
  });
  try {
    for (let n = 0; n < 2; n++)
      await transaction(db, (r) =>
        audit(
          r,
          "security.operation_denied",
          actor,
          { operation: "post.api.admin", status: 403 },
          "api_operation",
          prefix + "denial" + n,
          undefined,
          { outcome: "denied", reasonCode: "forbidden" },
        ),
      );
    for (let n = 0; n < 300 && (await ops.processOne()); n++) {
      /* finite worker batch */
    }
    const alerts = (await ops.alerts(actor)).alerts.filter(
      (a: { ruleId: string; scopeKey: string }) =>
        a.ruleId === rule.id && a.scopeKey === actor.id,
    );
    expect(alerts).toHaveLength(1);
    expect((await ops.alertEvents(actor, alerts[0].id)).events).toHaveLength(2);
    await db.query(
      "UPDATE AuditWork w JOIN AuditLog a ON a.id=w.eventId SET w.status='queued' WHERE a.actorId=?",
      [actor.id],
    );
    for (let n = 0; n < 300 && (await ops.processOne()); n++) {
      /* reprocess */
    }
    expect(
      (await ops.alerts(actor)).alerts.filter(
        (a: { scopeKey: string }) => a.scopeKey === actor.id,
      ),
    ).toHaveLength(1);
    const before = Number(
      (
        await db.query(
          "SELECT COUNT(*) n FROM AuditLog WHERE action='audit.health_probe'",
        )
      )[0].n,
    );
    await ops.probe(prefix);
    expect(
      (await ops.health(actor)).probes.some(
        (p: { component: string; status: string }) =>
          p.component === prefix && p.status === "healthy",
      ),
    ).toBe(true);
    expect(
      Number(
        (
          await db.query(
            "SELECT COUNT(*) n FROM AuditLog WHERE action='audit.health_probe'",
          )
        )[0].n,
      ),
    ).toBe(before);
  } finally {
    await db.query(
      "UPDATE AuditRule SET enabled=?,revision=?,activatedAt=?,thresholdValue=?,windowSeconds=?,cooldownSeconds=?,severity=?,rationale=?,scope=? WHERE id=?",
      [
        rule.enabled,
        rule.revision,
        rule.activatedAt,
        rule.thresholdValue,
        rule.windowSeconds,
        rule.cooldownSeconds,
        rule.severity,
        rule.rationale,
        rule.scope,
        rule.id,
      ],
    );
    await db.query(
      "DELETE ae FROM AuditAlertEvent ae JOIN AuditAlert a ON a.id=ae.alertId WHERE a.scopeKey=?",
      [actor.id],
    );
    await db.query("DELETE FROM AuditAlert WHERE scopeKey=?", [actor.id]);
    await db.query("DELETE FROM AuditHealth WHERE component=?", [prefix]);
  }
});
it("retention is opt-in, bounded, and respects independent case holds", async () => {
  const [policy] = await db.query("SELECT * FROM AuditPolicy WHERE id=1");
  try {
    await db.query("UPDATE AuditPolicy SET retentionDays=NULL WHERE id=1");
    expect((await ops.retention(actor)).configured).toBe(false);
    const kept = prefix + "held",
      removed = prefix + "retained";
    for (const id of [kept, removed])
      await db.query(
        "INSERT INTO AuditLog(id,action,entityType,entityId,createdAt) VALUES(?,'request.updated','request',?,TIMESTAMPADD(DAY,-1000,UTC_TIMESTAMP(3)))",
        [id, prefix + "req"],
      );
    const item = await reviews.createCase(actor, {
      title: "Synthetic legal hold",
      ownerId: prefix,
      eventIds: [kept],
    });
    await reviews.updateCase(actor, item.id, { revision: 0, held: true });
    await ops.updatePolicy(actor, {
      revision: policy.revision,
      retentionDays: 900,
    });
    const dry = await ops.retention(actor);
    expect(dry.held).toBeGreaterThanOrEqual(1);
    expect(dry.candidates).toBeGreaterThanOrEqual(1);
    expect(dry.deleted).toBe(0);
    await auditContext.run({source: "system", correlationId: prefix}, () => ops.retention(actor, true, 250, policy.revision + 1));
    expect(
      await db.query("SELECT id FROM AuditLog WHERE id=?", [kept]),
    ).toHaveLength(1);
    expect(
      await db.query("SELECT id FROM AuditLog WHERE id=?", [removed]),
    ).toHaveLength(0);
  } finally {
    await db.query(
      "UPDATE AuditPolicy SET retentionDays=?,revision=? WHERE id=1",
      [policy.retentionDays, policy.revision],
    );
  }
});
it("isolates saved views and rejects unregistered event codes and unsafe nested values", async () => {
  const v = await reviews.saveView(actor, {
    name: "Private investigation",
    filters: { q: "SYNTHETIC PRIVATE SEARCH", resourceType: "request" },
  });
  const other = {
    ...actor,
    id: prefix + "other",
    roleKey: "custom",
    permissions: ["audit.view"] as AuthUser["permissions"],
  };
  expect((await reviews.views(other)).views).toEqual([]);
  await reviews.deleteView(other, v.id);
  expect(
    (await reviews.views(actor)).views.some(
      (view: { id?: unknown }) => view.id === v.id,
    ),
  ).toBe(true);
  await expect(
    transaction(db, (r) =>
      audit(r, "unregistered.event", actor, null, "user", actor.id),
    ),
  ).rejects.toThrow("Unregistered");
  expect(
    diff(
      "menu.updated",
      { items: [{ labelEn: "One", password: "SYNTHETIC_SECRET" }] },
      { items: [{ labelEn: "Two", password: "SYNTHETIC_SECRET_2" }] },
    ).changes,
  ).toEqual([
    {
      path: "items.0.labelEn",
      before: { state: "value", value: "One" },
      after: { state: "value", value: "Two" },
    },
  ]);
});

it("exports a real consistent snapshot despite a transaction committing after snapshot start", async () => {
  const initial = await reader.search(actor, { resourceId: prefix + "req" });
  const job = await reports.create(actor, {
    format: "json",
    scope: "all",
    locale: "en",
    timezone: "UTC",
    filters: { resourceId: prefix + "req" },
  });
  const late = db.createQueryRunner();
  await late.connect();
  await late.startTransaction();
  await late.query(
    "INSERT INTO AuditLog(id,action,entityType,entityId) VALUES(?,'request.updated','request',?)",
    [prefix + "late", prefix + "req"],
  );
  const original = db.createQueryRunner.bind(db);
  const spy = vi.spyOn(db, "createQueryRunner").mockImplementation(() => {
    const r = original(),
      query = r.query.bind(r);
    r.query = (async (...args: Parameters<typeof r.query>) => {
      const result = await query(...args);
      if (args[0] === "START TRANSACTION WITH CONSISTENT SNAPSHOT")
        await late.commitTransaction();
      return result;
    }) as typeof r.query;
    return r;
  });
  try {
    await reports.processOne();
  } finally {
    spy.mockRestore();
    if (late.isTransactionActive) await late.rollbackTransaction();
    await late.release();
  }
  const report = JSON.parse(
    await readFile((await reports.download(actor, job.id)).path, "utf8"),
  );
  expect(report.events).toHaveLength(initial.stats.events);
  expect(
    report.events.some((e: { id: string }) => e.id === prefix + "late"),
  ).toBe(false);
  expect(
    (await reader.search(actor, { resourceId: prefix + "req" })).stats.events,
  ).toBe(initial.stats.events + 1);
});

it("alerts on newly granted sensitive permissions in custom roles using historical grants", async () => {
  const { UserAdministrationService } = await import("../admin/users.js");
  const [original] = await db.query(
    "SELECT * FROM AuditRule WHERE id='privilege'",
  );
  const roleKey = prefix + "customSensitive",
    targetId = prefix + "customTarget";
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,'مخصص','Custom',?)",
    [roleKey, JSON.stringify(["audit.view", "audit.export"])],
  );
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,'بداية','Baseline','[]')",
    [roleKey + "base"],
  );
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,'Synthetic target','synthetic',?,'active')",
    [targetId, targetId + "@example.invalid", roleKey + "base"],
  );
  let eventId: string | undefined;
  try {
    await ops.updateRule(actor, original.id, {
      revision: original.revision,
      enabled: true,
      thresholdValue: 1,
      windowSeconds: 300,
      cooldownSeconds: 0,
      severity: "high",
      rationale: "Synthetic custom permission grant",
      scope: "identity",
    });
    // A combined role/status mutation must not hide the grant behind the status action.
    await new UserAdministrationService(db).update(actor, targetId, {
      roleKey,
      status: "suspended",
    });
    const result = await reader.search(actor, { resourceId: targetId });
    eventId = result.rows[0].id;
    expect(result.rows[0].action).toBe("user.suspended");
    expect(
      (await reader.detail(actor, eventId)).event.context.grantedPermissions,
    ).toEqual(["audit.export"]);
    // Subsequent role edits must not change evaluation of the historical grant.
    await db.query("UPDATE Role SET permissions='[]' WHERE `key`=?", [roleKey]);
    for (let n = 0; n < 500 && (await ops.processOne()); n++) {
      /* bounded outbox drain */
    }
    expect(
      await db.query("SELECT eventId FROM AuditAlertEvent WHERE eventId=?", [
        eventId,
      ]),
    ).toHaveLength(1);
    await db.query("UPDATE AuditWork SET status='queued' WHERE eventId=?", [
      eventId,
    ]);
    await ops.processOne();
    expect(
      await db.query("SELECT eventId FROM AuditAlertEvent WHERE eventId=?", [
        eventId,
      ]),
    ).toHaveLength(1);
  } finally {
    if (eventId) {
      const links = await db.query(
        "SELECT alertId FROM AuditAlertEvent WHERE eventId=?",
        [eventId],
      );
      for (const link of links) {
        await db.query("DELETE FROM AuditAlertEvent WHERE alertId=?", [
          link.alertId,
        ]);
        await db.query("DELETE FROM AuditAlert WHERE id=?", [link.alertId]);
      }
    }
    await db.query(
      "UPDATE AuditRule SET enabled=?,revision=?,activatedAt=?,thresholdValue=?,windowSeconds=?,cooldownSeconds=?,severity=?,rationale=?,scope=? WHERE id=?",
      [
        original.enabled,
        original.revision,
        original.activatedAt,
        original.thresholdValue,
        original.windowSeconds,
        original.cooldownSeconds,
        original.severity,
        original.rationale,
        original.scope,
        original.id,
      ],
    );
    await db.query("DELETE FROM User WHERE id=?", [targetId]);
    await db.query("DELETE FROM Role WHERE `key` IN (?,?)", [
      roleKey,
      roleKey + "base",
    ]);
  }
});

it("uses explicit UTC half-open periods across DST offsets and preserves safe CSV text", async () => {
  const period = validateFilter({
    from: "2026-11-01T01:30:00-04:00",
    to: "2026-11-01T01:30:00-05:00",
  });
  expect(period.from).toBe("2026-11-01T05:30:00.000Z");
  expect(period.to).toBe("2026-11-01T06:30:00.000Z");
  expect(() => validateFilter({ from: "2026-11-01T01:30:00" })).toThrow();
  expect(() => validateFilter({ from: "2026-02-30T00:00:00Z" })).toThrow();
  const [sample] = (await reader.search(actor, { resourceId: prefix + "req" }))
    .rows;
  const from = sample.occurredAt,
    to = new Date(Date.parse(from) + 1).toISOString();
  const exact = await reader.search(actor, {
    resourceId: prefix + "req",
    from,
    to,
  });
  expect(exact.rows.some((e) => e.id === sample.id)).toBe(true);
  expect(exact.rows.every((e) => e.occurredAt === from)).toBe(true);
  const previous = await reader.search(actor, {
    resourceId: prefix + "req",
    to: from,
  });
  expect(previous.rows.some((e) => e.id === sample.id)).toBe(false);
  expect(csvCell('عربي, "نص"\nالسطر الثاني')).toBe(
    '"عربي, ""نص""\nالسطر الثاني"',
  );
  expect(csvCell("@SUM(1,2)")).toBe('"\'@SUM(1,2)"');
});
