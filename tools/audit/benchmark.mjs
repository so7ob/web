// Explicit synthetic-only performance experiment; no existing records are reset.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import {
  createDataSource,
  AuditReader,
  audit,
  transaction,
} from "@so7ob/server";
import { SYSTEM_ROLES } from "@so7ob/contracts";
if (
  !/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? "") ||
  !["127.0.0.1", "::1"].includes(process.env.DATABASE_HOST ?? "")
)
  throw new Error("Synthetic isolated loopback database required");
const db = await createDataSource().initialize();
try {
  await db.runMigrations();
  assert.equal(
    Number((await db.query("SELECT COUNT(*) n FROM AuditLog"))[0].n),
    0,
    "Benchmark requires an empty newly created database",
  );
  const actor = {
    id: "perf-admin",
    email: "perf@example.invalid",
    name: "Synthetic benchmark",
    roleKey: "super_admin",
    status: "active",
    locale: "en",
    emailVerified: true,
    permissions: SYSTEM_ROLES[0].permissions,
  };
  const payload = JSON.stringify({
      changes: [
        {
          path: "priority",
          before: { state: "value", value: "normal" },
          after: { state: "value", value: "high" },
        },
      ],
      safeFields: { priority: { state: "value", value: "high" } },
      context: {},
    }),
    identity = JSON.stringify({
      id: actor.id,
      name: actor.name,
      email: actor.email,
      roleKey: actor.roleKey,
      type: "user",
    });
  for (let offset = 0; offset < 100000; offset += 1000) {
    const values = [];
    for (let n = offset; n < offset + 1000; n++)
      values.push(
        "perf" + String(n).padStart(8, "0"),
        String(n % 1000),
        "REQ-DEMO-" + (n % 1000),
        "actor" + (n % 40),
        identity,
        payload,
      );
    await db.query(
      "INSERT INTO AuditLog(id,entityId,resourceRef,actorId,actorSnapshot,eventPayload,action,eventCode,entityType,category,outcome,source,isSensitive,hasChanges,schemaVersion,recordedAt) VALUES " +
        Array(1000)
          .fill(
            "(?,?,?,?,?,?,'request.priority_changed','request.priority_changed','request','requests','success','api',0,1,1,UTC_TIMESTAMP(3))",
          )
          .join(","),
      values,
    );
  }
  await db.query("ANALYZE TABLE AuditLog");
  const reader = new AuditReader(db);
  async function sample(fn, n = 30) {
    const ms = [];
    for (let i = 0; i < n + 3; i++) {
      const start = performance.now();
      await fn();
      if (i >= 3) ms.push(performance.now() - start);
    }
    ms.sort((a, b) => a - b);
    return {
      samples: n,
      p50: ms[Math.floor(n * 0.5)],
      p95: ms[Math.ceil(n * 0.95) - 1],
      max: ms.at(-1),
    };
  }
  const first = await reader.search(actor, { limit: 50 }),
    cursor = first.nextCursor;
  const results = {
    synthetic: true,
    events: 100000,
    node: process.version,
    cpu: cpus()[0].model,
    cpuCount: cpus().length,
    ramBytes: totalmem(),
    databaseVersion: (await db.query("SELECT VERSION() v"))[0].v,
    oldFirst: await sample(() =>
      db.query(
        "SELECT a.*,u.name FROM AuditLog a LEFT JOIN User u ON u.id=a.actorId ORDER BY a.createdAt DESC LIMIT 30 OFFSET 0",
      ),
    ),
    oldDeep: await sample(() =>
      db.query(
        "SELECT a.*,u.name FROM AuditLog a LEFT JOIN User u ON u.id=a.actorId ORDER BY a.createdAt DESC LIMIT 30 OFFSET 90000",
      ),
    ),
    newFirstIncludingStats: await sample(() =>
      reader.search(actor, { limit: 50 }),
    ),
    newCursorIncludingStats: await sample(() =>
      reader.search(actor, { limit: 50, cursor }),
    ),
    newFiltered: await sample(() =>
      reader.search(actor, { resourceId: "104" }),
    ),
    newDetail: await sample(() => reader.detail(actor, "perf00000104")),
    newSearch: await sample(() => reader.search(actor, { q: "REQ-DEMO-104" })),
    transactionWithoutAudit: await sample(() =>
      transaction(db, (r) =>
        r.query("SELECT id FROM AuditLog WHERE id=?", ["perf00000104"]),
      ),
    ),
    transactionWithAudit: await sample(() =>
      transaction(db, (r) =>
        audit(
          r,
          "request.updated",
          null,
          { ref: "REQ-DEMO-PERF" },
          "request",
          "perf-writer",
          undefined,
          { before: { priority: "normal" }, after: { priority: "high" } },
        ),
      ),
    ),
    explain: await db.query(
      "EXPLAIN SELECT a.* FROM AuditLog a WHERE entityType='request' AND entityId='104' ORDER BY createdAt DESC,id DESC LIMIT 51",
    ),
    storage: await db.query(
      "SELECT TABLE_ROWS,DATA_LENGTH,INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AuditLog'",
    ),
    rssBytes: process.memoryUsage().rss,
    limits:
      "Service/database timing on this host; not production or million-event capacity; run alongside other synthetic checks",
  };
  console.log(JSON.stringify(results, null, 2));
  if (process.env.AUDIT_BENCHMARK_OUTPUT)
    await writeFile(
      process.env.AUDIT_BENCHMARK_OUTPUT,
      JSON.stringify(results, null, 2) + "\n",
    );
} finally {
  await db.destroy();
}
