import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { createDataSource } from "../database/data-source.js";
import { SubmissionService } from "./submissions.js";
import { RequestService } from "./requests.js";
import { InquiryService } from "./inquiries.js";
import { DatabaseSync } from "node:sqlite";
import { AccountService } from "./account.js";
import { PayloadCipher } from "../queue/crypto.js";
import { WebhookCipher } from "../queue/webhook.js";
import { sha256 } from "../auth/persistence.js";
import { fingerprint } from "../auth/rate-policy.js";
import { SYSTEM_ROLES, type AuthUser } from "@so7ob/contracts";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated real MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const prefix = "business" + randomBytes(7).toString("hex");
const key = randomBytes(32).toString("hex");
const ips = new Set<string>();
const roles: string[] = [];
const actor: AuthUser = {
  id: prefix + "owner",
  email: prefix + "owner@example.invalid",
  name: "Account owner",
  roleKey: "client",
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions: [],
};
const other = {
  ...actor,
  id: prefix + "other",
  email: prefix + "other@example.invalid",
};
const env = {
  ...process.env,
  NODE_ENV: "production",
  OUTBOX_KEY: key,
  EMAIL_DEV_MODE: "false",
  NOTIFY_WEBHOOK_URL: "http://127.0.0.1:9998/synthetic-webhook",
};
const service = new SubmissionService(db, env),
  account = new AccountService(db),
  requestsService = new RequestService(db),
  inquiriesService = new InquiryService(db);
const staff: AuthUser = {
  ...actor,
  id: prefix + "staff",
  email: prefix + "staff@example.invalid",
  roleKey: "support",
  permissions: SYSTEM_ROLES.find((r) => r.key === "support")!.permissions,
};
const input = (suffix: string) => ({
  requestType: "quote",
  serviceType: "web",
  description: "Synthetic project requirements with Arabic بيانات 😀 " + suffix,
  budget: "unspecified",
  currency: "",
  timeline: "flexible",
  name: "Submitted contact",
  company: "Synthetic company",
  email: prefix + suffix + "@example.invalid",
  phone: "",
  preferredContact: "email",
  referenceUrl: "",
  locale: "en",
  website: "",
  startedAt: Date.now() - 10000,
});
const ip = (suffix: string) => {
  const value = prefix + suffix;
  ips.add(value);
  return value;
};
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  for (const role of SYSTEM_ROLES.filter((r) =>
    ["client", "support"].includes(r.key),
  )) {
    if (
      !(await db.query("SELECT `key` FROM Role WHERE `key`=?", [role.key]))
        .length
    ) {
      await db.query(
        "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
        [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)],
      );
      roles.push(role.key);
    }
  }
  for (const [id, role] of [
    ["owner", "client"],
    ["other", "client"],
    ["staff", "support"],
  ])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,?,?,'active')",
      [
        prefix + id,
        prefix + id + "@example.invalid",
        "Synthetic " + id,
        "synthetic-unused",
        role,
      ],
    );
}, 30000);
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query(
    "DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?",
    [prefix + "%"],
  );
  await db.query("DELETE FROM EmailLog WHERE `to` LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM Attachment WHERE id LIKE ?", [prefix + "%"]);
  const requests = await db.query(
    "SELECT id,refCode,email,descriptionHash FROM ProjectRequest WHERE email LIKE ?",
    [prefix + "%"],
  );
  for (const r of requests) {
    await db.query("DELETE FROM OperationLock WHERE lockKey=?", [
      sha256("request-duplicate:" + r.email + ":" + r.descriptionHash),
    ]);
    await db.query("DELETE FROM WebhookJob WHERE requestId=?", [r.id]);
    await db.query("DELETE FROM AuditLog WHERE entityId IN (?,?)", [
      r.id,
      r.refCode,
    ]);
    await db.query("DELETE FROM ProjectRequest WHERE id=?", [r.id]);
  }
  const inquiries = await db.query(
    "SELECT id FROM Inquiry WHERE email LIKE ?",
    [prefix + "%"],
  );
  for (const i of inquiries) {
    await db.query("DELETE FROM AuditLog WHERE entityId=?", [i.id]);
    await db.query("DELETE FROM Inquiry WHERE id=?", [i.id]);
  }
  await db.query("DELETE FROM AuditLog WHERE actorId LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM User WHERE id LIKE ?", [prefix + "%"]);
  for (const role of roles)
    await db.query("DELETE FROM Role WHERE `key`=?", [role]);
  await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
    sha256("account-inquiry:" + actor.id),
  ]);
  for (const value of ips)
    for (const bucket of [
      "request:" + fingerprint("ip:" + value),
      "inquiry:" + value,
    ])
      await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
        sha256(bucket),
      ]);
  await db.destroy();
});
describe("submissions and account data on actual MariaDB", () => {
  it("preserves validation and bot rejection before consuming submission quota", async () => {
    const addr = ip("invalid");
    for (let n = 0; n < 4; n++)
      await expect(
        service.request(
          { ...input("invalid"), website: "bot" },
          null,
          addr,
          "test",
        ),
      ).rejects.toMatchObject({ status: 400, code: "invalid" });
    expect(
      (await service.request(input("valid-after-bot"), null, addr, "test")).ok,
    ).toBe(true);
  });
  it("commits ownership, contact values, staff notification, encrypted mail and webhook together", async () => {
    const result = await service.request(
      { ...input("owned"), clientId: other.id, roleKey: "super_admin" },
      actor,
      ip("owned"),
      "synthetic-agent",
    );
    expect(result.ref).toMatch(/^S7-[A-Z0-9]{8}$/);
    const [stored] = await db.query(
      "SELECT * FROM ProjectRequest WHERE refCode=?",
      [result.ref],
    );
    expect(stored.clientId).toBe(actor.id);
    expect(stored.name).toBe("Submitted contact");
    expect(stored.email).toBe(input("owned").email);
    expect(stored.notifiedAt).toBeNull();
    const [notice] = await db.query(
      "SELECT payload FROM Notification WHERE userId=? AND type='new_request' AND link=?",
      [prefix + "staff", "/ar/admin/requests/" + stored.id],
    );
    expect(JSON.parse(notice.payload)).toEqual({
      ref: result.ref,
      name: actor.name,
    });
    const [mail] = await db.query(
      "SELECT j.id,j.payload,e.bodyText,e.status FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=? AND j.dedupeKey=?",
      [
        prefix + "staff@example.invalid",
        sha256("request:" + stored.id + ":staff:" + prefix + "staff"),
      ],
    );
    expect(mail.status).toBe("queued");
    expect(mail.bodyText).toBe("");
    expect(
      new PayloadCipher(key).decrypt(mail.payload, mail.id).text,
    ).toContain(result.ref);
    const [job] = await db.query(
      "SELECT id,payload FROM WebhookJob WHERE requestId=?",
      [stored.id],
    );
    expect(job.payload).not.toContain(stored.email);
    expect(
      JSON.parse(new WebhookCipher(key).decrypt(job.payload, job.id).body)
        .payload.email,
    ).toBe(stored.email);
  });
  it("serializes duplicate submissions across concurrent connections and independent IP buckets", async () => {
    const raw = input("concurrent");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        service.request(raw, null, ip("concurrent" + i), "test"),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ status: 409, code: "duplicate" });
    expect(
      (
        await db.query("SELECT id FROM ProjectRequest WHERE email=?", [
          raw.email,
        ])
      ).length,
    ).toBe(1);
  });
  it("retains short-window limits across service instances", async () => {
    const addr = ip("rate");
    for (let n = 0; n < 3; n++)
      await new SubmissionService(db, env).request(
        input("rate" + n),
        null,
        addr,
        "test",
      );
    await expect(
      service.request(input("rate4"), null, addr, "test"),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });
  it("rolls back the request and notifications if transactional enqueue fails", async () => {
    const trigger = prefix + "fail";
    await db.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON MailJob FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic enqueue outage'`,
    );
    try {
      await expect(
        service.request(input("rollback"), null, ip("rollback"), "test"),
      ).rejects.toThrow();
      expect(
        await db.query("SELECT id FROM ProjectRequest WHERE email=?", [
          input("rollback").email,
        ]),
      ).toEqual([]);
    } finally {
      await db.query(`DROP TRIGGER ${trigger}`);
    }
  });
  it("creates an inquiry and its first message atomically, using only session ownership", async () => {
    const result = await service.inquiry(
      {
        subject: "Synthetic inquiry",
        message: "A sufficiently detailed synthetic inquiry",
        name: "Guest name",
        email: prefix + "inquiry@example.invalid",
        category: "unknown",
        locale: "en",
        ...{ clientId: other.id },
      },
      actor,
      ip("inquiry"),
    );
    expect(result.ref).toMatch(/^IQ-[A-Z0-9]{8}$/);
    const [row] = await db.query(
      "SELECT id,clientId,category FROM Inquiry WHERE refCode=?",
      [result.ref],
    );
    expect(row.clientId).toBe(actor.id);
    expect(row.category).toBe("general");
    const [message] = await db.query(
      "SELECT authorId,body FROM InquiryMessage WHERE inquiryId=?",
      [row.id],
    );
    expect(message.authorId).toBe(actor.id);
    expect(message.body).toContain("synthetic inquiry");
  });
  it("preserves request ownership, private notes, awaiting filters and concurrent message idempotence", async () => {
    const submitted = await service.request(
      input("conversation"),
      actor,
      ip("conversation"),
      "test",
    );
    const [stored] = await db.query(
      "SELECT id FROM ProjectRequest WHERE refCode=?",
      [submitted.ref],
    );
    const id = stored.id;
    await expect(requestsService.detail(other, id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      requestsService.message(actor, id, {
        body: "Private injection",
        kind: "internal_note",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const internal = await requestsService.message(staff, id, {
      body: "STAFF ONLY NOTE",
      kind: "internal_note",
    });
    await db.query(
      "INSERT INTO Attachment(id,filename,storedName,mimeType,size,requestId,messageId) VALUES(?,?,?,?,?,?,?)",
      [
        prefix + "privatefile",
        "staff-only.pdf",
        prefix + "private.pdf",
        "application/pdf",
        10,
        id,
        internal.message.id,
      ],
    );
    const visible = await requestsService.detail(actor, id);
    expect(JSON.stringify(visible)).not.toContain("STAFF ONLY NOTE");
    expect(JSON.stringify(visible)).not.toContain("staff-only.pdf");
    expect(
      (await requestsService.detail(staff, id)).request.messages.some(
        (m: Record<string, unknown>) => m.kind === "internal_note",
      ),
    ).toBe(true);
    await db.query(
      "UPDATE ProjectRequest SET status='awaiting_info' WHERE id=?",
      [id],
    );
    await requestsService.message(staff, id, {
      body: "Please provide more detail.",
    });
    expect(
      (
        await requestsService.list(actor, {
          awaiting: "you",
          status: "closed",
          q: submitted.ref,
        })
      ).total,
    ).toBe(1);
    const replies = await Promise.all(
      Array.from({ length: 6 }, () =>
        requestsService.message(actor, id, {
          body: "Here are the requested details.",
        }),
      ),
    );
    expect(new Set(replies.map((r) => r.message.id)).size).toBe(1);
    const [changed] = await db.query(
      "SELECT status,lastClientReplyAt FROM ProjectRequest WHERE id=?",
      [id],
    );
    expect(changed.status).toBe("in_review");
    expect(changed.lastClientReplyAt).toBeInstanceOf(Date);
    expect(
      (
        await db.query(
          "SELECT id FROM RequestStatusEvent WHERE requestId=? AND fromStatus='awaiting_info'",
          [id],
        )
      ).length,
    ).toBe(1);
    await requestsService.patch(actor, id, {
      description: "Updated project description",
    });
    await requestsService.patch(actor, id, {
      action: "cancel",
      note: "Synthetic cancellation",
    });
    await expect(
      requestsService.message(actor, id, { body: "Closed conversation" }),
    ).rejects.toMatchObject({ status: 409, code: "locked" });
  });
  it("preserves inquiry ownership and duplicate response codes while excluding internal messages", async () => {
    const submitted = await service.inquiry(
      {
        subject: "Portal inquiry",
        message: "Portal synthetic initial message",
        name: "Untrusted",
        email: "untrusted@example.invalid",
      },
      actor,
      ip("portal"),
      true,
    );
    const id = submitted.id!;
    const [record] = await db.query(
      "SELECT name,email FROM Inquiry WHERE id=?",
      [id],
    );
    expect(record.email).toBe(actor.email);
    expect(record.name).toBe(actor.name);
    await expect(inquiriesService.detail(other, id)).rejects.toMatchObject({
      status: 404,
    });
    await db.query(
      "INSERT INTO InquiryMessage(id,inquiryId,authorId,authorType,kind,body) VALUES(?,?,?,'staff','internal_note','PRIVATE INQUIRY NOTE')",
      [prefix + "inquirynote", id, staff.id],
    );
    expect(
      JSON.stringify(await inquiriesService.detail(actor, id)),
    ).not.toContain("PRIVATE INQUIRY NOTE");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        inquiriesService.message(actor, id, "Additional inquiry details"),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(4);
    expect(new Set(results.map((r) => r.result.message.id)).size).toBe(1);
    await db.query("UPDATE Inquiry SET status='closed' WHERE id=?", [id]);
    await expect(
      inquiriesService.message(actor, id, "Cannot reply"),
    ).rejects.toMatchObject({ status: 400, code: "closed" });
  });
  it("matches SQLite ASCII LIKE semantics on real MariaDB without accent folding", async () => {
    const subject = "AbC Café Äpfel a\\xb";
    const submitted = await service.inquiry(
      {
        subject,
        message: "Synthetic search comparison message",
        email: prefix + "search@example.invalid",
      },
      actor,
      ip("search"),
    );
    const [row] = await db.query("SELECT id FROM Inquiry WHERE refCode=?", [
      submitted.ref,
    ]);
    const sqlite = new DatabaseSync(":memory:");
    try {
      for (const q of ["abc", "CAFÉ", "café", "Äp", "äp", "a\\_b", "%_"]) {
        const expected = sqlite
          .prepare("SELECT ? LIKE ? AS matched")
          .get(subject, "%" + q + "%") as { matched: number };
        const actual = await inquiriesService.list(actor, { q });
        expect(
          actual.inquiries.some(
            (r: Record<string, unknown>) => r.id === row.id,
          ),
          q,
        ).toBe(Boolean(expected.matched));
      }
    } finally {
      sqlite.close();
    }
  });
  it('keeps list query counts constant as the page fills',async()=>{
    const create=async(index:number)=>db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote','web','Synthetic query count',?,'unspecified','flexible','Synthetic',?,'email','en',?)",[prefix+'count'+index,'QCOUNT'+prefix+index,'synthetic',actor.email,actor.id]);
    await create(0);const original=db.logger.logQuery;let queries=0;db.logger.logQuery=()=>{queries++;};
    try{const one=await requestsService.list(actor,{q:'QCOUNT'+prefix});expect(one.total).toBe(1);expect(queries).toBe(2);db.logger.logQuery=original;for(let n=1;n<21;n++)await create(n);queries=0;db.logger.logQuery=()=>{queries++;};const full=await requestsService.list(actor,{q:'QCOUNT'+prefix});expect(full.total).toBe(21);expect(full.requests).toHaveLength(20);expect(queries).toBe(2);}finally{db.logger.logQuery=original;}
  });
  it("keeps profiles and drafts account-scoped and rejects oversized JSON without losing a saved draft", async () => {
    const response = await account.profile(actor);
    expect(response.user).not.toHaveProperty("passwordHash");
    await account.updateProfile(actor, {
      name: " Updated Name ",
      phone: "+123456789",
      company: " Acme ",
      roleKey: "super_admin",
    });
    expect((await account.profile(actor)).user.roleKey).toBe("client");
    await account.saveDraft(actor, {
      description: "unfinished",
      email: "excluded",
      clientId: other.id,
    });
    expect((await account.draft(actor)).draft).toEqual({
      description: "unfinished",
    });
    expect((await account.draft(other)).draft).toBeNull();
    await expect(
      account.saveDraft(actor, {
        description: "x".repeat(5000),
        name: "x".repeat(5000),
        company: "x".repeat(5000),
        phone: "x".repeat(5000),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await account.draft(actor)).draft).toEqual({
      description: "unfinished",
    });
    await account.deleteDraft(other);
    expect((await account.draft(actor)).draft).toEqual({
      description: "unfinished",
    });
  });
  it("does not disclose or mark another account notifications and retains pagination/read-all behavior", async () => {
    const before = (await account.notifications(actor, {})).unread;
    await db.query(
      "INSERT INTO Notification(id,userId,type,payload) VALUES(?,?,'account',?)",
      [prefix + "notice", actor.id, JSON.stringify({ message: "Synthetic" })],
    );
    expect((await account.notifications(other, {})).total).toBe(0);
    await expect(
      account.readNotification(other, { id: prefix + "notice" }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await account.notifications(actor, { unread: "1" })).unread).toBe(
      before + 1,
    );
    await account.readNotification(actor, { all: true });
    expect((await account.notifications(actor, { unread: "1" })).total).toBe(0);
  });
});
