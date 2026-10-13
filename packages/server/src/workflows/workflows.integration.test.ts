import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { AdminOperationsService } from "../admin/operations.js";
import { FileStore } from "../files/storage.js";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  SYSTEM_ROLES,
  type AuthUser,
  type WorkflowDefinition,
  type BusinessCalendar,
  type WorkflowScope,
  type Permission,
} from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { transaction } from "../auth/persistence.js";
import { WorkflowAdministration } from "./admin.js";
import { WorkflowEngine } from "./engine.js";
import { AdminConversationService } from "../admin/conversations.js";
import { RequestService } from "../business/requests.js";
import { FileService } from "../files/service.js";
import { AccountService } from "../business/account.js";
import { AdminDashboardService } from "../admin/dashboard.js";
import { assertWorkflowAccess, publicWorkflowStage } from "./access.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "wf" + randomBytes(5).toString("hex"),
  admin = new WorkflowAdministration(db),
  engine = new WorkflowEngine(db),
  threads = new AdminConversationService(db);
const permissions: Permission[] = [
  "admin.dashboard",
  "requests.view.all",
  "requests.reply",
  "requests.assign",
  "requests.status",
  "requests.archive",
  "requests.export",
  "inquiries.view.all",
  "inquiries.reply",
  "inquiries.assign",
  "inquiries.status",
  "inquiries.archive",
  "inquiries.export",
];
const actor = (id: string, root = false): AuthUser => ({
  id: prefix + id,
  email: prefix + id + "@example.invalid",
  name: "Synthetic " + id,
  roleKey: root ? "super_admin" : prefix + "role",
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions: root ? [] : permissions,
});
const root = actor("root", true),
  a = actor("a"),
  b = actor("b"),
  outside = actor("outside");
let teamId = "",
  calendarId = "",
  flowId = "",
  versionId = "";
const records: string[] = [];
let createdRootRole = false;
const flows: string[] = [];
const calendar: BusinessCalendar = {
  timezone: "Asia/Aden",
  week: Array.from({ length: 7 }, () => [{ start: "00:00", end: "24:00" }]),
  exceptions: [],
};
function definition(scope: WorkflowScope = "requests"): WorkflowDefinition {
  return {
    scope,
    nameAr: "مسار اصطناعي",
    nameEn: "Synthetic workflow",
    initialStage: "intake",
    calendarVersionId: calendarId,
    stages: [
      {
        id: "intake",
        nameAr: "استقبال",
        nameEn: "Intake",
        status: "new",
        visibility: "assigned",
        routing: { mode: "team_queue", teamId, userId: null },
        responseHours: 1,
        stageHours: 2,
        x: 0,
        y: 0,
      },
      {
        id: "review",
        nameAr: "فحص",
        nameEn: "Review",
        status: "in_review",
        visibility: "assigned",
        routing: { mode: "round_robin", teamId, userId: null },
        responseHours: 1,
        stageHours: 2,
        x: 250,
        y: 0,
      },
      {
        id: "done",
        nameAr: "مكتمل",
        nameEn: "Complete",
        status: "closed",
        visibility: "assigned",
        routing: { mode: "person", teamId, userId: a.id },
        responseHours: null,
        stageHours: null,
        x: 500,
        y: 0,
      },
    ],
    transitions: [
      {
        id: "start",
        from: "intake",
        to: "review",
        nameAr: "بدء",
        nameEn: "Start",
        trigger: "manual",
        action: "transition",
        actors: ["team"],
        reasonRequired: true,
        match: "all",
        conditions: [],
      },
      {
        id: "reply",
        from: "review",
        to: "done",
        nameAr: "إنجاز",
        nameEn: "Finish",
        trigger: "staff_reply",
        action: "transition",
        actors: ["staff"],
        reasonRequired: false,
        match: "all",
        conditions: [],
      },
      {
        id: "reopen",
        from: "done",
        to: "review",
        nameAr: "إعادة فتح",
        nameEn: "Reopen",
        trigger: "manual",
        action: "transition",
        actors: ["staff"],
        reasonRequired: false,
        match: "all",
        conditions: [],
      },
      {
        id: "timeout",
        from: "intake",
        to: "review",
        nameAr: "تصعيد",
        nameEn: "Escalate",
        trigger: "stage_due",
        action: "transition",
        actors: ["staff"],
        reasonRequired: false,
        match: "all",
        conditions: [],
      },
    ],
  };
}
async function record(scope: WorkflowScope = "requests") {
  const id = prefix + randomBytes(5).toString("hex");
  records.push(id);
  if (scope === "requests")
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote',?,'Synthetic workflow','synthetic','unspecified','flexible','Synthetic','synthetic@example.invalid','email','en')",
      [id, id, prefix],
    );
  else
    await db.query(
      "INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale) VALUES(?,?,'Synthetic','Synthetic','synthetic@example.invalid',?,'en')",
      [id, id, prefix],
    );
  await transaction(db, (r) => engine.initialize(r, scope, id));
  return id;
}
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  createdRootRole = !(
    await db.query("SELECT `key` FROM Role WHERE `key`='super_admin'")
  ).length;
  await db.query(
    "INSERT IGNORE INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
    [
      "super_admin",
      "مدير",
      "Admin",
      JSON.stringify(SYSTEM_ROLES[0].permissions),
    ],
  );
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
    [prefix + "role", "فريق", "Team", JSON.stringify(permissions)],
  );
  for (const person of [root, a, b, outside])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic',?,'active')",
      [person.id, person.email, person.name, person.roleKey],
    );
  teamId = (
    await admin.team(root, {
      nameAr: "فريق اختبار",
      nameEn: "Synthetic team",
      members: [a.id, b.id],
      active: true,
    })
  ).id;
  calendarId = (await admin.calendar(root, calendar)).id;
  flowId = (await admin.save(root, { definition: definition() })).id;
  flows.push(flowId);
  versionId = (
    await admin.publish(root, { id: flowId, revision: 0, selector: prefix })
  ).id;
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DELETE FROM WorkflowTransfer WHERE actorId=?", [root.id]);
  for (const id of records) {
    for (const table of [
      "WorkflowEvent",
      "WorkflowJob",
      "ConversationWorkflow",
    ])
      await db.query(`DELETE FROM ${table} WHERE recordId=?`, [id]);
    await db.query("DELETE FROM Notification WHERE link LIKE ?", ["%/" + id]);
    await db.query("DELETE FROM AuditLog WHERE entityId=?", [id]);
    await db.query("DELETE FROM ProjectRequest WHERE id=?", [id]);
    await db.query("DELETE FROM Inquiry WHERE id=?", [id]);
  }
  await db.query("DELETE FROM WorkTeamMember WHERE teamId=?", [teamId]);
  await db.query("DELETE FROM WorkflowBinding WHERE selector=?", [prefix]);
  for (const id of flows) {
    await db.query("DELETE FROM WorkflowVersion WHERE workflowId=?", [id]);
    await db.query("DELETE FROM Workflow WHERE id=?", [id]);
  }
  await db.query("DELETE FROM WorkCalendar WHERE id=?", [calendarId]);
  await db.query("DELETE FROM WorkTeam WHERE id=?", [teamId]);
  await db.query("DELETE FROM AuditLog WHERE actorId LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM User WHERE id LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM Role WHERE `key`=?", [prefix + "role"]);
  if (createdRootRole)
    await db.query("DELETE FROM Role WHERE `key`='super_admin'");
  await db.destroy();
});
it("initializes a pinned restricted team queue and hides it on all administrative surfaces", async () => {
  const id = await record();
  const state = await engine.state(a, "requests", id);
  expect(state).toMatchObject({ versionId, stage: { id: "intake" }, teamId });
  await expect(
    assertWorkflowAccess(db, outside, "requests", id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(threads.detail(outside, "requests", id)).rejects.toMatchObject({
    status: 404,
  });
  expect((await threads.list(outside, "requests", { q: id })).total).toBe(0);
  expect(
    (await threads.list(a, "requests", { q: id, team: teamId })).total,
  ).toBe(1);
  expect(
    (
      (await new AdminDashboardService(db).search(outside, id)) as {
        requests: unknown[];
      }
    ).requests,
  ).toEqual([]);
  const stage = await publicWorkflowStage(db, "requests", id);
  expect(stage).toEqual({
    nameAr: "استقبال",
    nameEn: "Intake",
    status: "new",
  });
  await expect(
    threads.patch(outside, "requests", id, { assigneeId: outside.id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    threads.bulk(outside, "requests", { ids: [id], action: "archive" }),
  ).rejects.toMatchObject({ status: 404 });
});
it("requires a reason and serializes competing transitions and round-robin assignments", async () => {
  const first = await record(),
    second = await record();
  const s = (await engine.state(a, "requests", first))!;
  await expect(
    engine.transition(a, "requests", first, {
      transitionId: "start",
      expectedRevision: s.revision,
      operationId: "missing-reason",
    }),
  ).rejects.toMatchObject({ code: "workflow_reason_required" });
  const responses = await Promise.allSettled(
    [a, b].map((actor, i) =>
      engine.transition(actor, "requests", first, {
        transitionId: "start",
        expectedRevision: s.revision,
        operationId: "concurrent-" + i,
        reason: "Synthetic reason",
      }),
    ),
  );
  expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(responses.filter((r) => r.status === "rejected")).toHaveLength(1);
  const s2 = (await engine.state(a, "requests", second))!;
  await engine.transition(a, "requests", second, {
    transitionId: "start",
    expectedRevision: s2.revision,
    operationId: "second",
    reason: "Synthetic reason",
  });
  const assignments = await db.query(
    "SELECT assigneeId FROM ProjectRequest WHERE id IN (?,?)",
    [first, second],
  );
  expect(
    new Set(assignments.map((r: { assigneeId: string }) => r.assigneeId)).size,
  ).toBe(2);
});
it("retains a public reply and applies its automatic transition exactly once", async () => {
  const id = await record();
  let s = (await engine.state(a, "requests", id))!;
  await engine.transition(a, "requests", id, {
    transitionId: "start",
    expectedRevision: s.revision,
    operationId: "start",
    reason: "Synthetic reason",
  });
  const requests = new RequestService(db);
  await requests.message(a, id, {
    body: "Synthetic automatic reply",
    kind: "message",
  });
  for (let n = 0; n < 30; n++) {
    if (!(await engine.processOne())) break;
  }
  s = (await engine.state(a, "requests", id))!;
  expect(s.stage.id).toBe("done");
  expect(s.responseDueAt).toBeNull();
  const [row] = await db.query(
    "SELECT closedAt FROM ProjectRequest WHERE id=?",
    [id],
  );
  expect(row.closedAt).not.toBeNull();
  expect(
    await db.query(
      "SELECT id FROM WorkflowEvent WHERE recordId=? AND operationId LIKE 'reply-%'",
      [id],
    ),
  ).toHaveLength(1);
  await expect(
    requests.message(a, id, {
      body: "Synthetic private note",
      kind: "internal_note",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("done");
});
it("executes due jobs transactionally and invalidates old stage timers", async () => {
  const id = await record();
  await db.query(
    "UPDATE WorkflowJob SET availableAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE recordId=? AND triggerName='stage_due'",
    [id],
  );
  await engine.processOne();
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("review");
  await db.query(
    "UPDATE WorkflowJob SET availableAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE recordId=? AND triggerName='response_due'",
    [id],
  );
  for (let n = 0; n < 30; n++) {
    if (!(await engine.processOne())) break;
  }
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("review");
});
it("pins running instances while publication changes new records, and verifies transfer previews", async () => {
  const id = await record();
  const changed = definition();
  changed.stages[0].nameEn = "New intake";
  await admin.save(root, { id: flowId, revision: 0, definition: changed });
  const v2 = (
    await admin.publish(root, { id: flowId, revision: 1, selector: prefix })
  ).id;
  expect((await engine.state(a, "requests", id))!.versionId).toBe(versionId);
  expect((await engine.state(a, "requests", await record()))!.versionId).toBe(
    v2,
  );
  const preview = await admin.previewTransfer(root, {
    scope: "requests",
    ids: [id],
    versionId: v2,
    mapping: { intake: "intake" },
  });
  await admin.transfer(root, { previewId: preview.previewId });
  await admin.transfer(root, { previewId: preview.previewId });
  expect((await engine.state(a, "requests", id))!.versionId).toBe(v2);
  await expect(
    admin.publish(a, { id: flowId, revision: 1, selector: prefix }),
  ).rejects.toMatchObject({ status: 403 });
});
it("supports inquiry routing, attachments authorization and independent staff options", async () => {
  const flow = (await admin.save(root, { definition: definition("inquiries") }))
    .id;
  flows.push(flow);
  await admin.publish(root, { id: flow, revision: 0, selector: prefix });
  const id = await record("inquiries");
  expect((await engine.state(a, "inquiries", id))!.stage.nameEn).toBe("Intake");
  await expect(
    new FileService(db).uploadAttachment(
      outside,
      id,
      new File(["synthetic"], "fixture.txt", { type: "text/plain" }),
      "inquiries",
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await admin.options(a, "inquiries")).staff.some(
      (s: { id: string }) => s.id === a.id,
    ),
  ).toBe(true);
  await db.query(
    "INSERT INTO Notification(id,userId,type,payload,link) VALUES(?,?,?,?,?)",
    [
      prefix + "hidden",
      outside.id,
      "reply_received",
      JSON.stringify({ ref: id }),
      "/en/admin/inquiries/" + id,
    ],
  );
  expect(
    (
      await new AccountService(db).notifications(outside, {})
    ).notifications.some((n: { id: string }) => n.id === prefix + "hidden"),
  ).toBe(false);
});

it("atomically claims a team queue and retains queued reply events across assignment changes", async () => {
  const id = await record(),
    state = (await engine.state(a, "requests", id))!;
  const replies = await Promise.allSettled(
    [a, b].map((person) =>
      admin.assign(person, "requests", id, {
        assigneeId: person.id,
        expectedRevision: state.revision,
      }),
    ),
  );
  expect(replies.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(replies.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409, code: "workflow_conflict" },
  });
  const current = (await engine.state(a, "requests", id))!;
  await engine.transition(a, "requests", id, {
    transitionId: "start",
    expectedRevision: current.revision,
    operationId: "claim-start",
    reason: "Start",
  });
  await new RequestService(db).message(a, id, {
    body: "Reply before reassignment",
    kind: "message",
  });
  const next = (await engine.state(a, "requests", id))!;
  await admin.assign(a, "requests", id, {
    assigneeId: b.id,
    expectedRevision: next.revision,
  });
  for (let n = 0; n < 50; n++) {
    if (!(await engine.processOne())) break;
  }
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("done");
});
it("rolls back manual routing failures and keeps an automatic triggering reply with a supervisor alert", async () => {
  const id = await record(),
    state = (await engine.state(a, "requests", id))!;
  await db.query("UPDATE User SET status='suspended' WHERE id IN (?,?)", [
    a.id,
    b.id,
  ]);
  try {
    await expect(
      engine.transition(root, "requests", id, {
        transitionId: "start",
        expectedRevision: state.revision,
        operationId: "empty",
        reason: "Start",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      engine.transition(a, "requests", id, {
        transitionId: "start",
        expectedRevision: state.revision,
        operationId: "empty",
        reason: "Start",
      }),
    ).rejects.toMatchObject({ code: "workflow_destination_unavailable" });
    expect((await engine.state(root, "requests", id))!.stage.id).toBe("intake");
    expect(
      await db.query(
        "SELECT id FROM WorkflowEvent WHERE recordId=? AND operationId='empty'",
        [id],
      ),
    ).toHaveLength(0);
  } finally {
    await db.query("UPDATE User SET status='active' WHERE id IN (?,?)", [
      a.id,
      b.id,
    ]);
  }
  await engine.transition(a, "requests", id, {
    transitionId: "start",
    expectedRevision: state.revision,
    operationId: "recover",
    reason: "Start",
  });
  await db.query("UPDATE User SET status='suspended' WHERE id=?", [a.id]);
  try {
    await new RequestService(db).message(b, id, {
      body: "Reply must survive unavailable target",
      kind: "message",
    });
    for (let n = 0; n < 50; n++) {
      if (!(await engine.processOne())) break;
    }
    expect((await engine.state(root, "requests", id))!.stage.id).toBe("review");
    expect(
      await db.query(
        "SELECT id FROM RequestMessage WHERE requestId=? AND body='Reply must survive unavailable target'",
        [id],
      ),
    ).toHaveLength(1);
    expect(
      await db.query(
        "SELECT id FROM WorkflowEvent WHERE recordId=? AND kind='failed'",
        [id],
      ),
    ).toHaveLength(1);
    expect(
      await db.query(
        "SELECT id FROM Notification WHERE userId=? AND type='workflow_blocked' AND link=?",
        [root.id, "/ar/admin/requests/" + id],
      ),
    ).toHaveLength(1);
  } finally {
    await db.query("UPDATE User SET status='active' WHERE id=?", [a.id]);
  }
});
it("cancels timers on archive, recreates them on restore, and fences stale stage jobs after reopening", async () => {
  const id = await record();
  await threads.patch(a, "requests", id, { action: "archive" });
  expect(
    await db.query(
      "SELECT id FROM WorkflowJob WHERE recordId=? AND status='queued'",
      [id],
    ),
  ).toHaveLength(0);
  await threads.patch(a, "requests", id, { action: "restore" });
  expect(
    await db.query(
      "SELECT id FROM WorkflowJob WHERE recordId=? AND status='queued'",
      [id],
    ),
  ).toHaveLength(2);
  const state = (await engine.state(a, "requests", id))!;
  const operation = {
    transitionId: "start",
    expectedRevision: state.revision,
    operationId: "repeat",
    reason: "Start",
  };
  await engine.transition(a, "requests", id, operation);
  await engine.transition(a, "requests", id, operation);
  expect(
    await db.query(
      "SELECT id FROM WorkflowEvent WHERE recordId=? AND operationId='repeat'",
      [id],
    ),
  ).toHaveLength(1);
  await new RequestService(db).message(a, id, {
    body: "Close for reopening",
    kind: "message",
  });
  for (let n = 0; n < 50; n++) {
    if (!(await engine.processOne())) break;
  }
  const closed = (await engine.state(a, "requests", id))!;
  await engine.transition(a, "requests", id, {
    transitionId: "reopen",
    expectedRevision: closed.revision,
    operationId: "reopen",
  });
  const current = (await engine.state(a, "requests", id))!;
  expect(current.stage.id).toBe("review");
  expect(current.stageDueAt).not.toBeNull();
  await db.query(
    "UPDATE WorkflowJob SET status='queued',availableAt=UTC_TIMESTAMP(3) WHERE recordId=? AND triggerName='staff_reply'",
    [id],
  );
  for (let n = 0; n < 50; n++) {
    if (!(await engine.processOne())) break;
  }
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("review");
});
it("rejects a stale transfer preview without rewriting the pinned version", async () => {
  const id = await record(),
    s = (await engine.state(a, "requests", id))!;
  const preview = await admin.previewTransfer(root, {
    scope: "requests",
    ids: [id],
    versionId: s.versionId,
    mapping: { intake: "review" },
  });
  expect(preview.rows[0]).toMatchObject({
    targetStatus: "in_review",
    visibility: "assigned",
    route: { teamId },
  });
  expect(preview.rows[0].stageDueAt).not.toBeNull();
  await admin.assign(a, "requests", id, {
    assigneeId: a.id,
    expectedRevision: s.revision,
  });
  await expect(
    admin.transfer(root, { previewId: preview.previewId }),
  ).rejects.toMatchObject({ code: "workflow_conflict" });
  expect((await engine.state(a, "requests", id))!.stage.id).toBe("intake");
});

it("allows inquiry-only staff to manage replies, assign and upload without request permissions", async () => {
  const restricted: AuthUser = {
    ...outside,
    permissions: [
      "admin.dashboard",
      "inquiries.view.all",
      "inquiries.reply",
      "inquiries.assign",
      "inquiries.status",
    ],
  };
  const role = prefix + "inquiry";
  const directory = resolve(".migration/workflows", prefix + "uploads");
  mkdirSync(directory, { recursive: true });
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
    [role, "استفسارات", "Inquiries", JSON.stringify(restricted.permissions)],
  );
  await db.query("UPDATE User SET roleKey=? WHERE id=?", [role, outside.id]);
  restricted.roleKey = role;
  await db.query("INSERT INTO WorkTeamMember(teamId,userId) VALUES(?,?)", [
    teamId,
    outside.id,
  ]);
  const ops = new AdminOperationsService(db);
  let replyId = "";
  try {
    const id = await record("inquiries"),
      files = new FileService(
        db,
        new FileStore({ NODE_ENV: "test", DATA_DIR: directory }),
      );
    expect(
      (await admin.options(restricted, "inquiries")).staff.some(
        (p: { id: string }) => p.id === outside.id,
      ),
    ).toBe(true);
    await expect(admin.options(restricted, "requests")).rejects.toMatchObject({
      status: 403,
    });
    const state = (await engine.state(restricted, "inquiries", id))!;
    await admin.assign(restricted, "inquiries", id, {
      assigneeId: outside.id,
      expectedRevision: state.revision,
    });
    const saved = await ops.saveReply(restricted, {
      name: "Synthetic inquiry reply",
      content: "Synthetic text",
    });
    replyId = saved.reply.id;
    expect(
      (await ops.savedReplies(restricted)).replies.some(
        (r: { id: string }) => r.id === replyId,
      ),
    ).toBe(true);
    const uploaded = await files.uploadAttachment(
      restricted,
      id,
      new File(["Synthetic upload"], "synthetic.txt", { type: "text/plain" }),
      "inquiries",
    );
    expect(
      (await files.attachment(restricted, uploaded.attachment.id)).filename,
    ).toBe("synthetic.txt");
    await threads.inquiryMessage(restricted, id, {
      kind: "internal_note",
      body: "Synthetic note",
    });
    expect(
      await db.query(
        "SELECT id FROM WorkflowJob WHERE recordId=? AND triggerName='staff_reply'",
        [id],
      ),
    ).toHaveLength(0);
    await db.query("DELETE FROM Attachment WHERE inquiryId=?", [id]);
  } finally {
    if (replyId) await db.query("DELETE FROM SavedReply WHERE id=?", [replyId]);
    await db.query("DELETE FROM WorkTeamMember WHERE teamId=? AND userId=?", [
      teamId,
      outside.id,
    ]);
    await db.query("UPDATE User SET roleKey=? WHERE id=?", [
      prefix + "role",
      outside.id,
    ]);
    await db.query("DELETE FROM Role WHERE `key`=?", [role]);
    rmSync(directory, { recursive: true });
  }
});

it("uses the site reply policy for both original workflows and stops it on archive", async () => {
  const settings = await db.query(
    "SELECT value FROM SiteSetting WHERE `key`='response.hours'",
  );
  try {
    await db.query(
      "INSERT INTO SiteSetting(`key`,value) VALUES('response.hours','6') ON DUPLICATE KEY UPDATE value='6'",
    );
    for (const scope of ["requests", "inquiries"] as const) {
      const id = await record(scope);
      const table = scope === "requests" ? "ProjectRequest" : "Inquiry";
      await db.query(
        "UPDATE ConversationWorkflow SET versionId=?,stageId='new',visibility='authorized' WHERE scope=? AND recordId=?",
        ["legacy-" + scope, scope, id],
      );
      await db.query(
        `UPDATE ${table} SET createdAt='2026-10-12 00:00:00',status='new' WHERE id=?`,
        [id],
      );
      expect((await engine.state(root, scope, id))?.responseDueAt).toBe(
        "2026-10-12T06:00:00.000Z",
      );
      await db.query(
        `UPDATE ${table} SET archivedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [id],
      );
      expect((await engine.state(root, scope, id))?.responseDueAt).toBeNull();
    }
  } finally {
    if (settings.length)
      await db.query(
        "UPDATE SiteSetting SET value=? WHERE `key`='response.hours'",
        [settings[0].value],
      );
    else await db.query("DELETE FROM SiteSetting WHERE `key`='response.hours'");
  }
});
