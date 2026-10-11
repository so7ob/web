import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDataSource, audit, transaction } from "@so7ob/server";
if (
  !/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? "") ||
  !["127.0.0.1", "::1"].includes(process.env.DATABASE_HOST ?? "")
)
  throw new Error("Only an isolated loopback test database is allowed");
const db = await createDataSource().initialize(),
  key = "audit-runtime-" + randomBytes(6).toString("hex");
try {
  for (const sql of [
    "UPDATE AuditLog SET action=action WHERE 1=0",
    "DELETE FROM AuditLog WHERE 1=0",
    'ALTER TABLE AuditLog COMMENT="synthetic"',
  ])
    await assert.rejects(
      () => db.query(sql),
      (e) => e.code === "ER_TABLEACCESS_DENIED_ERROR",
    );
  await assert.rejects(
    () =>
      transaction(db, async (r) => {
        await r.query("INSERT INTO SiteSetting(`key`,value) VALUES(?,?)", [
          key,
          "synthetic",
        ]);
        await audit(
          r,
          "settings.updated",
          null,
          { keys: [key] },
          "settings",
          key,
        );
        const [row] = await r.query(
          "SELECT id FROM AuditLog WHERE entityId=?",
          [key],
        );
        assert(row);
        throw new Error("synthetic rollback");
      }),
    /synthetic rollback/,
  );
  assert.equal(
    (await db.query("SELECT id FROM AuditLog WHERE entityId=?", [key])).length,
    0,
  );
  assert.equal(
    (await db.query("SELECT `key` FROM SiteSetting WHERE `key`=?", [key]))
      .length,
    0,
  );
  console.log(
    "PASS isolated runtime denies evidence UPDATE / DELETE / ALTER; INSERT and business transaction rollback work",
  );
} finally {
  await db.destroy();
}
