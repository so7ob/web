import {readFile} from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { SYSTEM_ROLES, type AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { AdminOperationsService } from "./operations.js";
import { AdminDashboardService } from "./dashboard.js";
import { AdminConversationService } from "./conversations.js";
import { InquiryService } from "../business/inquiries.js";
const originalRoles = new Set<string>();
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Actual isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "ops" + randomBytes(6).toString("hex"),
  ops = new AdminOperationsService(db),
  dash = new AdminDashboardService(db),
  threads = new AdminConversationService(db);
const actor = (suffix: string, roleKey: string): AuthUser => ({
  id: prefix + suffix,
  email: prefix + suffix + "@example.invalid",
  name: "Synthetic " + suffix,
  roleKey,
  status: "active",
  locale: "ar",
  emailVerified: true,
  permissions: SYSTEM_ROLES.find((r) => r.key === roleKey)!.permissions,
});
const admin = actor("admin", "super_admin"),
  client = actor("client", "client"),
  support = actor("support", "support"),
  editor = actor("editor", "content_editor");
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  for (const row of await db.query("SELECT `key` FROM Role"))
    originalRoles.add(row.key);
  for (const role of SYSTEM_ROLES)
    await db.query(
      "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE `key`=`key`",
      [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)],
    );
  for (const user of [admin, client, support, editor])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'private synthetic hash',?,'active')",
      [user.id, user.email, user.name, user.roleKey],
    );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,createdAt) VALUES(?,?,'quote','web','Synthetic searchable description','hash','unspecified','flexible',? ,?,'email','ar',?,DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY))",
    [
      prefix + "request",
      prefix + "ref",
      '=HYPERLINK("https://example.invalid")',
      client.email,
      client.id,
    ],
  );
  await db.query(
    "INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,clientId) VALUES(?,?,?,'Synthetic owner',?,'general','ar',?)",
    [
      prefix + "inquiry",
      prefix + "inqref",
      prefix + " inquiry",
      client.email,
      client.id,
    ],
  );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DROP TRIGGER IF EXISTS `" + prefix + "audit`");
  await db.query("DELETE FROM ProjectRequest WHERE id=?", [prefix + "request"]);
  await db.query("DELETE FROM Inquiry WHERE id=?", [prefix + "inquiry"]);
  await db.query("DELETE FROM SavedReply WHERE createdBy IN (?,?)", [
    admin.id,
    support.id,
  ]);
  await db.query("DELETE FROM AuditLog WHERE actorEmail LIKE ?", [
    prefix + "%",
  ]);
  await db.query("DELETE FROM MenuItem WHERE labelAr=?", [prefix]);
  await db.query("DELETE FROM SiteSetting WHERE updatedById IN (?,?)", [
    admin.id,
    support.id,
  ]);
  await db.query("DELETE FROM EmailLog WHERE id=?", [prefix + "mail"]);
  await db.query("DELETE FROM User WHERE id LIKE ?", [prefix + "%"]);
  for (const row of await db.query("SELECT `key` FROM Role"))
    if (
      !originalRoles.has(row.key) &&
      !(
        await db.query("SELECT id FROM User WHERE roleKey=? LIMIT 1", [row.key])
      ).length
    )
      await db.query("DELETE FROM Role WHERE `key`=?", [row.key]);
  await db.destroy();
});
it("excludes forbidden dashboard/search datasets per role and calculates real overdue/range indicators", async () => {
  await expect(dash.dashboard(client, null)).rejects.toMatchObject({
    status: 403,
  });
  const d = await dash.dashboard(admin, "90");
  expect(d.rangeDays).toBe(90);
  expect(d.overdueReplies).toBe(1);
  expect(d.openRequests).toBe(1);
  const limited = await dash.dashboard(editor, "bad");
  expect(limited.rangeDays).toBe(7);
  expect(limited.access).toMatchObject({
    users: false,
    requests: false,
    inquiries: false,
    audit: false,
  });
  expect(limited.recentRequests).toEqual([]);
  expect(limited.recentAudit).toEqual([]);
  expect((await dash.search(editor, prefix)).users).toEqual([]);
  const search = await dash.search(admin, prefix);
  expect(search.users.length).toBeGreaterThan(0);
  expect(JSON.stringify(search)).not.toContain("passwordHash");
});
it("rejects unauthorized operations and per-section reads", async () => {
  for (const task of [
    () => ops.settings(client),
    () => ops.menus(client),
    () => ops.logs(client, {}),
    () => ops.outbox(client),
    () => ops.savedReplies(client),
    () => threads.list(client, "requests", {}),
    () => threads.list(client, "inquiries", {}),
    () => threads.detail(client, "requests", prefix + "request"),
    () => threads.detail(client, "inquiries", prefix + "inquiry"),
    () =>
      threads.bulk(client, "requests", {
        ids: [prefix + "request"],
        action: "archive",
      }),
    () => threads.csv(client, "requests", {}),
  ])
    await expect(task()).rejects.toMatchObject({ status: 403 });
  await expect(
    ops.updateSettings(editor, { "site.nameAr": "Forbidden" }),
  ).rejects.toMatchObject({ status: 403 });
});
it("validates all settings before committing and raises announcement revision in the same transaction", async () => {
  await expect(
    ops.updateSettings(admin, {
      "site.nameAr": "must not commit",
      "contact.email": "bad",
    }),
  ).rejects.toMatchObject({ code: "invalid_email" });
  expect((await ops.settings(admin)).settings["site.nameAr"]).toBeUndefined();
  await ops.updateSettings(admin, {
    "site.nameAr": prefix,
    "announcement.enabled": "true",
    "announcement.messageAr": "إعلان اصطناعي",
  });
  const stored = await ops.settings(admin);
  expect(stored.settings["site.nameAr"]).toBe(prefix);
  expect(stored.settings["announcement.revision"]).toMatch(/^\d+$/);
});
it("replaces ordered menus atomically, preserves the home slug and refuses empty/excessive lists", async () => {
  await ops.updateMenu(admin, {
    location: "header",
    items: [{ labelAr: prefix, labelEn: "Home", pageSlug: "/", enabled: true }],
  });
  const menus = await ops.menus(admin);
  expect(menus.header).toMatchObject([
    { labelAr: prefix, pageSlug: "", enabled: true, order: 0 },
  ]);
  await expect(
    ops.updateMenu(admin, { location: "header", items: [] }),
  ).rejects.toMatchObject({ code: "empty" });
  await expect(
    ops.updateMenu(admin, {
      location: "header",
      items: Array.from({ length: 13 }, () => ({ labelAr: "x" })),
    }),
  ).rejects.toMatchObject({ code: "too_many" });
  expect((await ops.menus(admin)).header).toHaveLength(1);
});
it("creates, edits and deletes team saved replies with an audit trail and validates empty input", async () => {
  await expect(
    ops.saveReply(support, { name: "", content: "x" }),
  ).rejects.toMatchObject({ status: 400 });
  const result = await ops.saveReply(support, {
    name: "  Synthetic reply  ",
    content: " Thank you ",
  });
  expect(result.reply.name).toBe("Synthetic reply");
  expect(
    (await ops.savedReplies(support)).replies.find(
      (r: { id: string }) => r.id === result.reply.id,
    ).creatorName,
  ).toBe(support.name);
  await ops.saveReply(admin, { content: "Updated reply" }, result.reply.id);
  expect(
    (await ops.savedReplies(admin)).replies.find(
      (r: { id: string }) => r.id === result.reply.id,
    ).content,
  ).toBe("Updated reply");
  await ops.saveReply(admin, {}, result.reply.id, true);
  await expect(
    ops.saveReply(admin, { name: "Missing" }, result.reply.id),
  ).rejects.toMatchObject({ status: 404 });
});
it("preserves request filters/overdue, validates assignees and records staff transitions atomically", async () => {
  const before = await threads.list(admin, "requests", {
    q: prefix,
    overdue: "1",
  });
  expect(before.requests).toHaveLength(1);
  await expect(
    threads.patch(admin, "requests", prefix + "request", {
      assigneeId: client.id,
    }),
  ).rejects.toMatchObject({ code: "invalid_assignee" });
  await threads.patch(admin, "requests", prefix + "request", {
    assigneeId: support.id,
  });
  await threads.patch(support, "requests", prefix + "request", {
    priority: "urgent",
  });
  await expect(
    threads.patch(support, "requests", prefix + "request", {
      status: "closed",
    }),
  ).rejects.toMatchObject({ status: 409, code: "invalid_transition" });
  await threads.patch(support, "requests", prefix + "request", {
    status: "in_review",
    note: "Synthetic review",
  });
  const [row] = await db.query(
    "SELECT status,priority,assigneeId FROM ProjectRequest WHERE id=?",
    [prefix + "request"],
  );
  expect(row).toMatchObject({
    status: "in_review",
    priority: "urgent",
    assigneeId: support.id,
  });
  expect(
    await db.query("SELECT id FROM RequestStatusEvent WHERE requestId=?", [
      prefix + "request",
    ]),
  ).toHaveLength(1);
  expect(
    (await threads.list(admin, "requests", { q: prefix, status: "new" }))
      .requests,
  ).toHaveLength(0);
});
it("keeps staff-only inquiry notes private and deduplicates concurrent replies", async () => {
  await threads.inquiryMessage(support, prefix + "inquiry", {
    body: "Internal secret",
    kind: "internal_note",
  });
  const results = await Promise.all([
    threads.inquiryMessage(support, prefix + "inquiry", {
      body: "Public answer",
    }),
    threads.inquiryMessage(support, prefix + "inquiry", {
      body: "Public answer",
    }),
  ]);
  expect(results[0].message.id).toBe(results[1].message.id);
  const own = await new InquiryService(db).detail(client, prefix + "inquiry");
  expect(JSON.stringify(own)).not.toContain("Internal secret");
  const staff = await threads.detail(admin, "inquiries", prefix + "inquiry");
  expect(JSON.stringify(staff)).toContain("Internal secret");
  await threads.patch(support, "inquiries", prefix + "inquiry", {
    status: "closed",
  });
  expect(
    (await threads.list(admin, "inquiries", { q: prefix, status: "open" }))
      .inquiries,
  ).toHaveLength(0);
});
it("archives/restores only matching ids in bulk and makes CSV safe for spreadsheet formulas", async () => {
  expect(
    await threads.bulk(admin, "requests", {
      ids: [prefix + "request", prefix + "request", "missing"],
      action: "archive",
    }),
  ).toMatchObject({ count: 1 });
  expect(
    (await threads.list(admin, "requests", { q: prefix })).requests,
  ).toHaveLength(0);
  expect(
    (await threads.list(admin, "requests", { q: prefix, archived: "1" }))
      .requests,
  ).toHaveLength(1);
  expect(
    await threads.bulk(admin, "requests", {
      ids: [prefix + "request"],
      action: "restore",
    }),
  ).toMatchObject({ count: 1 });
  const artifact = await threads.csv(admin, "requests", { q: prefix });
  const csv = await readFile(artifact.path,"utf8"); await artifact.dispose();
  expect(csv).toMatch(/^\uFEFFrefCode,status,priority/);
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toContain("descriptionHash");
});
it("returns audit pages and metadata-only mail states without exposing private mail content", async () => {
  await db.query(
    "INSERT INTO EmailLog(id,`to`,subject,bodyText,bodyHtml,status,error) VALUES(?,?,?,'private reset token','<b>private</b>','queued','sensitive')",
    [prefix + "mail", client.email, "Synthetic subject"],
  );
  const result = await ops.outbox(admin);
  const item = result.emails.find(
    (e: { id: string }) => e.id === prefix + "mail",
  );
  expect(item).toMatchObject({
    status: "queued",
    bodyText: "",
    bodyHtml: null,
    error: null,
  });
  expect(JSON.stringify(result)).not.toContain("private reset token");
  const logs = await ops.logs(admin, { q: prefix });
  expect(logs.pageSize).toBe(30);
  expect(logs.total).toBeGreaterThan(0);
});
it("rolls back conversation status/history/notifications when audit insertion fails in MariaDB", async () => {
  await db.query(
    "CREATE TRIGGER `" +
      prefix +
      "audit` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorEmail='" +
      support.email +
      "' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic operation audit failure'; END IF; END",
  );
  try {
    await expect(
      threads.patch(support, "requests", prefix + "request", {
        status: "awaiting_info",
      }),
    ).rejects.toThrow("synthetic operation audit failure");
    expect(
      (
        await db.query("SELECT status FROM ProjectRequest WHERE id=?", [
          prefix + "request",
        ])
      )[0].status,
    ).toBe("in_review");
    expect(
      await db.query("SELECT id FROM RequestStatusEvent WHERE requestId=?", [
        prefix + "request",
      ]),
    ).toHaveLength(1);
  } finally {
    await db.query("DROP TRIGGER `" + prefix + "audit`");
  }
});

it('applies the same from filter to request list and export',async()=>{
 const query={q:prefix,from:new Date().toISOString()};
 expect((await threads.list(admin,'requests',query)).total).toBe(0);
 const artifact=await threads.csv(admin,'requests',query);
 const csv=await readFile(artifact.path,'utf8');await artifact.dispose();
 expect(csv).not.toContain(prefix+'ref');
});
it('exports more than 5000 synthetic rows in bounded batches without changing columns',async()=>{
 const stem=prefix+'large';
 try{
  for(let start=0;start<5105;start+=200){
   const count=Math.min(200,5105-start),values:unknown[]=[];
   for(let i=start;i<start+count;i++)values.push(stem+i,stem+i,'اسم عربي '+i,stem+'@example.invalid');
   await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES "+Array.from({length:count},()=>"(?,?,'quote','web','synthetic','hash','unspecified','flexible',?,?,'email','ar')").join(','),values);
  }
  const before=process.memoryUsage().rss;
  const result=await threads.csv(admin,'requests',{q:stem});
  try{
   expect(result.count).toBe(5105);expect(result.bytes).toBeLessThan(2*1024*1024);
   const csv=await readFile(result.path,'utf8');expect(csv.split('\r\n')).toHaveLength(5107);
   expect(csv).toContain('اسم عربي');
   expect((await threads.list(admin,'requests',{q:stem})).total).toBe(5105);
   console.info(JSON.stringify({syntheticRows:5105,bytes:result.bytes,rssDelta:process.memoryUsage().rss-before,batchRows:250}));
  }finally{await result.dispose();}
 }finally{await db.query('DELETE FROM ProjectRequest WHERE id LIKE ?',[stem+'%']);}
});

it('rejects two editors saving the same settings base while merging unrelated fields',async()=>{
 const first=await ops.settings(admin), second=await ops.settings(admin);
 await ops.updateSettings(admin,{'contact.address':'first',baseRevisions:first.revisions},true);
 await expect(ops.updateSettings(admin,{'contact.address':'stale',baseRevisions:second.revisions},true)).rejects.toMatchObject({status:409,code:'conflict'});
 expect((await ops.settings(admin)).settings['contact.address']).toBe('first');
});
it('atomically accepts one same-base settings writer, merges different keys and detects legacy writes',async()=>{
 const base=(await ops.settings(admin)).revisions;
 const results=await Promise.allSettled(['one','two'].map(value=>ops.updateSettings(admin,{'contact.address':value,baseRevisions:base},true)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 const independent=(await ops.settings(admin)).revisions;
 await Promise.all([
  ops.updateSettings(admin,{'site.nameAr':'اسم',baseRevisions:independent},true),
  ops.updateSettings(admin,{'site.nameEn':'Name',baseRevisions:independent},true),
 ]);
 const old=(await ops.settings(admin)).revisions;
 await ops.updateSettings(admin,{'contact.address':'legacy'});
 await expect(ops.updateSettings(admin,{'contact.address':'stale',baseRevisions:old},true)).rejects.toMatchObject({status:409});
 await expect(ops.updateSettings(admin,{'contact.address':'missing'},true)).rejects.toMatchObject({status:400,code:'revision_required'});
 await expect(ops.updateSettings(client,{'contact.address':'denied',baseRevisions:old},true)).rejects.toMatchObject({status:403});
});
it('fences concurrent menu snapshots per location and retains newer data',async()=>{
 const base=(await ops.menus(admin)).revisions['menu:header']??'0';
 const results=await Promise.allSettled(['first','second'].map(labelEn=>ops.updateMenu(admin,{location:'header',baseRevision:base,items:[{labelAr:prefix,labelEn,url:'/'}]},true)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const winner=(await ops.menus(admin)).header;
 await expect(ops.updateMenu(admin,{location:'header',baseRevision:base,items:[{labelEn:'stale',url:'/'}]},true)).rejects.toMatchObject({status:409});
 expect((await ops.menus(admin)).header).toEqual(winner);
 await expect(ops.updateMenu(admin,{location:'footer',items:[{labelEn:'missing',url:'/'}]},true)).rejects.toMatchObject({status:400});
});
it('keeps policy-controlled list/dashboard overdue counts consistent and requires explicit impact acknowledgement',async()=>{
 const original=await db.query("SELECT * FROM SiteSetting WHERE `key` IN ('response.hours','response.effectiveAt')");
 const id=prefix+'request';
 try{
  await db.query("UPDATE ProjectRequest SET status='new',archivedAt=NULL,lastClientReplyAt=NULL,lastStaffReplyAt=NULL,createdAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 HOUR) WHERE id=?",[id]);
  await expect(ops.updateSettings(admin,{'response.hours':'1'})).rejects.toMatchObject({status:400});
  for(const hours of ['0','721','1.5'])await expect(ops.updateSettings(admin,{'response.hours':hours,'response.applyToExisting':true})).rejects.toMatchObject({status:400});
  const base=(await ops.settings(admin)).revisions;
  await ops.updateSettings(admin,{'response.hours':'1','response.applyToExisting':true,baseRevisions:base},true);
  expect((await ops.settings(admin)).settings['response.effectiveAt']).toMatch(/^\d{4}-/);
  const list=await threads.list(admin,'requests',{overdue:'1'}),dashboard=await dash.dashboard(admin,null);
  expect(list.total).toBe(dashboard.overdueReplies);
  expect(list.requests?.some((row:unknown)=>(row as {id:string}).id===id)).toBe(true);
  await ops.updateSettings(admin,{'response.hours':'24','response.applyToExisting':true});
  expect((await threads.list(admin,'requests',{q:prefix,overdue:'1'})).total).toBe(0);
 }finally{
  await db.query("DELETE FROM SiteSetting WHERE `key` IN ('response.hours','response.effectiveAt')");
  for(const row of original)await db.query('INSERT INTO SiteSetting(`key`,value,updatedById,updatedAt) VALUES(?,?,?,?)',[row.key,row.value,row.updatedById,row.updatedAt]);
 }
});
