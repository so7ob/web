import { afterAll, beforeAll, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { publicStageSql } from "../workflows/access.js";
import { RequestService } from "./requests.js";

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated real MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const textDb = createDataSource({ ...process.env, DATABASE_NAME: name });
// Exercise a text representation through the real driver, without mocking query results.
textDb.options.extra.typeCast = (field: { name: string; string: (encoding: string) => string | null }, next: () => unknown) =>
    field.name === "workflowStage" ? field.string("utf8") : next();
const prefix = "list107" + randomBytes(6).toString("hex");
const owner: AuthUser = {
  id: prefix + "owner", email: prefix + "@example.invalid", name: "Synthetic owner",
  roleKey: "client", status: "active", locale: "ar", emailVerified: true, permissions: [],
};
const stage = { nameAr: "مراجعة اصطناعية", nameEn: "Synthetic review", status: "new" };
let createdRole = false;
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  await textDb.initialize();
  createdRole = !(await db.query("SELECT `key` FROM Role WHERE `key`='client'")).length;
  if (createdRole) await db.query("INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES('client','عميل','Client','[]')");
  await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey) VALUES(?,?,?,'unused','client')", [owner.id, owner.email, owner.name]);
  const definition = JSON.stringify({ stages: [{ id: "review", ...stage, visibility: "assigned", routing: { userId: "private-routing" } }] });
  await db.query("INSERT INTO Workflow(id,scope,draft) VALUES(?,'requests',?)", [prefix, definition]);
  await db.query("INSERT INTO WorkflowVersion(id,workflowId,definition) VALUES(?,?,?)", [prefix, prefix, definition]);
  for (const suffix of ["custom", "old", "legacy", "foreign"])
    await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote','web','Private body','synthetic','unspecified','flexible','Synthetic',?,'email','ar',?)", [prefix + suffix, prefix + suffix, owner.email, suffix === "foreign" ? null : owner.id]);
  for (const suffix of ["custom", "foreign", "legacy"])
    await db.query("INSERT INTO ConversationWorkflow(scope,recordId,versionId,stageId,visibility) VALUES('requests',?,?,?,'assigned')", [prefix + suffix, suffix === "legacy" ? "legacy-requests" : prefix, suffix === "legacy" ? "new" : "review"]);
});
afterAll(async () => {
  if (textDb.isInitialized) await textDb.destroy();
  if (!db.isInitialized) return;
  await db.query("DELETE FROM ConversationWorkflow WHERE recordId LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM ProjectRequest WHERE id LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM WorkflowVersion WHERE id=?", [prefix]);
  await db.query("DELETE FROM Workflow WHERE id=?", [prefix]);
  await db.query("DELETE FROM User WHERE id=?", [owner.id]);
  if (createdRole) await db.query("DELETE FROM Role WHERE `key`='client'");
  await db.destroy();
});

for (const [mode, connection, expectedType] of [["default mysql2", db, "object"], ["text typeCast mysql2", textDb, "string"]] as const) {
  it(`reads mixed customer requests with ${mode}, preserving public stages and ownership`, async () => {
    const [raw] = await connection.query(`SELECT ${publicStageSql("requests", "r")} workflowStage FROM ProjectRequest r WHERE r.id=?`, [prefix + "custom"]);
    expect(typeof raw.workflowStage).toBe(expectedType);
    const service = new RequestService(connection);
    const result = await service.list(owner, {});
    expect(result.total).toBe(3);
    expect(result.requests).toHaveLength(3);
    expect(result.requests.find((r: { id: string; workflowStage: unknown }) => r.id === prefix + "custom")?.workflowStage).toEqual(stage);
    for (const suffix of ["old", "legacy"])
      expect(result.requests.find((r: { id: string; workflowStage: unknown }) => r.id === prefix + suffix)?.workflowStage).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/private-routing|Private body|versionId|teamId|visibility/);
    expect((await service.list({ ...owner, id: prefix + "other" }, {})).total).toBe(0);
    await expect(service.detail({ ...owner, id: prefix + "other" }, prefix + "custom")).rejects.toMatchObject({ status: 404 });
    // Staff still see only assigned records; a client can see their own restricted stage.
    expect((await service.list({ ...owner, permissions: ["requests.view.all"] }, {})).total).toBe(0);
    expect((await service.detail(owner, prefix + "custom")).request.workflowStage).toEqual(stage);
    expect((await service.list(owner, {})).requests).toEqual(result.requests);
  });
}
