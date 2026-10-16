// Empty synthetic MariaDB only: upgrade preservation and real worker crash recovery.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  createDataSource,
  WorkflowAdministration,
  WorkflowEngine,
  transaction,
} from "@so7ob/server";
import type { AuthUser, WorkflowDefinition } from "@so7ob/contracts";
if (
  !/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? "") ||
  process.env.DATABASE_HOST !== "127.0.0.1"
)
  throw new Error("Empty isolated loopback test MariaDB required");
const db = await createDataSource().initialize();
const id = "workflow" + randomBytes(6).toString("hex");
const actor: AuthUser = {
  id: id + "actor",
  email: id + "@example.invalid",
  name: "Synthetic workflow admin",
  roleKey: "super_admin",
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions: [],
};
const env = {
  ...process.env,
  NODE_ENV: "test",
  OUTBOX_KEY: randomBytes(32).toString("hex"),
  AUTH_SECRET: randomBytes(32).toString("hex"),
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "9",
  SMTP_FROM: "synthetic@example.invalid",
  SMTP_ALLOW_INSECURE_LOCAL: "true",
  DATA_DIR: process.cwd() + "/.migration/workflows/worker-data",
};
let child: ReturnType<typeof spawn> | undefined;
try {
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
        )
      )[0].n,
    ),
    0,
    "Never resets existing data",
  );
  const migrations = db.migrations;
  const workflowIndex = migrations.findIndex(m => m.name === "Workflows1792108800000");
  assert(workflowIndex > 0, "The historical migration prefix precedes workflows");
  db.migrations = migrations.slice(0, workflowIndex);
  await db.runMigrations();
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES('super_admin','مدير اصطناعي','Synthetic admin','[]')",
  );
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'$2b$12$synthetic-preserved-hash','super_admin','active')",
    [actor.id, actor.email, actor.name],
  );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,status,assigneeId,archivedAt) VALUES(?,?,'quote','web','Synthetic retained request','synthetic','unspecified','flexible','Synthetic',?,'email','ar','awaiting_info',?,UTC_TIMESTAMP(3))",
    [id, id, actor.email, actor.id],
  );
  await db.query(
    "INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,status,assigneeId) VALUES(?,?,'Synthetic retained inquiry','Synthetic',?,'general','en','responded',?)",
    [id, id, actor.email, actor.id],
  );
  await db.query(
    "INSERT INTO RequestMessage(id,requestId,authorType,kind,body) VALUES(?,?,'client','message','Synthetic retained message')",
    [id + "message", id],
  );
  const before = await Promise.all(
    ["User", "ProjectRequest", "Inquiry", "RequestMessage"].map((table) =>
      db.query(`SELECT * FROM ${table}`),
    ),
  );
  db.migrations = migrations;
  await db.runMigrations();
  assert.deepEqual(
    await Promise.all(
      ["User", "ProjectRequest", "Inquiry", "RequestMessage"].map((table) =>
        db.query(`SELECT * FROM ${table}`),
      ),
    ),
    before,
  );
  assert.deepEqual(
    await db.query(
      "SELECT scope,stageId,versionId FROM ConversationWorkflow WHERE recordId=? ORDER BY scope",
      [id],
    ),
    [
      {
        scope: "inquiries",
        stageId: "responded",
        versionId: "legacy-inquiries",
      },
      {
        scope: "requests",
        stageId: "awaiting_info",
        versionId: "legacy-requests",
      },
    ],
  );
  const admin = new WorkflowAdministration(db),
    engine = new WorkflowEngine(db);
  const calendarId = (
    await admin.calendar(actor, {
      timezone: "Asia/Aden",
      week: Array.from({ length: 7 }, () => [{ start: "00:00", end: "24:00" }]),
      exceptions: [],
    })
  ).id;
  const definition: WorkflowDefinition = {
    scope: "requests",
    nameAr: "اختبار العامل",
    nameEn: "Worker test",
    initialStage: "intake",
    calendarVersionId: calendarId,
    stages: ["intake", "review", "done"].map((key, i) => ({
      id: key,
      nameAr: key,
      nameEn: key,
      status: (["new", "in_review", "closed"] as const)[i],
      visibility: "authorized",
      routing: { mode: "keep", teamId: null, userId: null },
      responseHours: 24,
      stageHours: i === 0 ? 1 : null,
      x: i * 250,
      y: 0,
    })),
    transitions: [
      {
        id: "due",
        from: "intake",
        to: "review",
        nameAr: "تصعيد",
        nameEn: "Escalate",
        trigger: "stage_due",
        action: "transition",
        reasonRequired: false,
        actors: ["staff"],
        match: "all",
        conditions: [],
      },
      {
        id: "done",
        from: "review",
        to: "done",
        nameAr: "إغلاق",
        nameEn: "Close",
        trigger: "staff_reply",
        action: "transition",
        reasonRequired: false,
        actors: ["staff"],
        match: "all",
        conditions: [],
      },
    ],
  };
  const flow = (await admin.save(actor, { definition })).id;
  await admin.publish(actor, { id: flow, revision: 0, selector: "web" });
  const active = id + "active";
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic recovery','synthetic','unspecified','flexible','Synthetic',?,'email','en')",
    [active, active, actor.email],
  );
  await transaction(db, (r) => engine.initialize(r, "requests", active));
  await db.query(
    "UPDATE WorkflowJob SET availableAt=UTC_TIMESTAMP(3) WHERE recordId=? AND triggerName='stage_due'",
    [active],
  );
  await db.query(
    "CREATE TRIGGER so7ob_workflow_crash BEFORE INSERT ON WorkflowEvent FOR EACH ROW BEGIN IF NEW.kind='transition' THEN DO SLEEP(4); END IF; END",
  );
  child = spawn(process.execPath, ["apps/worker/dist/main.js", "--once"], {
    env,
    stdio: "ignore",
  });
  const stopped = once(child, "exit");
  let sleeping = false;
  for (let i = 0; i < 150; i++) {
    sleeping =
      (
        await db.query(
          "SELECT ID FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND STATE='User sleep'",
        )
      ).length > 0;
    if (sleeping) break;
    await delay(50);
  }
  assert(sleeping, "Worker reached the transition transaction");
  child.kill("SIGKILL");
  await stopped;
  await db.query("DROP TRIGGER so7ob_workflow_crash");
  assert.equal(
    (await engine.state(actor, "requests", active))!.stage.id,
    "intake",
  );
  assert.equal(
    (
      await db.query(
        "SELECT status FROM WorkflowJob WHERE recordId=? AND triggerName='stage_due'",
        [active],
      )
    )[0].status,
    "queued",
  );
  child = spawn(process.execPath, ["apps/worker/dist/main.js", "--once"], {
    env,
    stdio: "ignore",
  });
  assert.equal(
    (await once(child, "exit"))[0],
    0,
    "Restarted worker must exit successfully",
  );
  assert.equal(
    (await engine.state(actor, "requests", active))!.stage.id,
    "review",
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT COUNT(*) n FROM WorkflowEvent WHERE recordId=? AND fromStage='intake' AND toStage='review'",
          [active],
        )
      )[0].n,
    ),
    1,
  );
  console.log(
    "PASS workflow upgrade preserves legacy rows, assignees, messages and bcrypt; killed worker rolls back and restarted worker executes the durable event once.",
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
  await db
    .query("DROP TRIGGER IF EXISTS so7ob_workflow_crash")
    .catch(() => undefined);
  await db.destroy();
}
