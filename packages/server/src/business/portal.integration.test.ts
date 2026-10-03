import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import type { AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { PortalService } from "./portal.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Actual isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "portal" + randomBytes(6).toString("hex"),
  service = new PortalService(db);
let createdRole = false;
const owner: AuthUser = {
  id: prefix + "owner",
  email: prefix + "owner@example.invalid",
  name: "Synthetic owner",
  roleKey: "client",
  status: "active",
  locale: "ar",
  emailVerified: true,
  permissions: [],
};
const staff = { ...owner, id: prefix + "staff", roleKey: "support" };
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  if (!(await db.query("SELECT `key` FROM Role WHERE `key`='client'")).length) {
    await db.query(
      "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES('client','عميل','Client','[]')",
    );
    createdRole = true;
  }
  for (const actor of [owner, staff])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,emailVerifiedAt) VALUES(?,?,?,'never-return-this','client',UTC_TIMESTAMP(3))",
      [actor.id, actor.id + "@example.invalid", actor.name],
    );
  const statuses = [
    "new",
    "in_review",
    "awaiting_info",
    "in_progress",
    "responded",
    "closed",
    "cancelled",
    "new",
  ];
  for (const [n, status] of statuses.entries())
    await db.query(
      "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId,assigneeId,status,archivedAt,lastActivityAt,lastStaffReplyAt,lastClientReplyAt) VALUES(?,?,'quote','web','Private synthetic body','synthetic','unspecified','flexible','Owner',?,'email','ar',?,?,?, ?,?,?,?)",
      [
        prefix + n,
        prefix + n,
        owner.email,
        owner.id,
        n < 3 ? staff.id : null,
        status,
        n === 7 ? new Date("2025-01-01") : null,
        new Date(Date.UTC(2025, 0, 1, 0, n)),
        new Date("2025-01-01"),
        n % 2 === 0 ? null : new Date("2025-01-02"),
      ],
    );
  await db.query(
    "INSERT INTO Inquiry(id,refCode,subject,name,email,locale,clientId,assigneeId,status) VALUES(?,?,'Subject','Owner',?,'ar',?,?,'responded'),(?,?,'Closed','Owner',?,'ar',?,NULL,'closed')",
    [
      prefix + "inquiry1",
      prefix + "inq1",
      owner.email,
      owner.id,
      staff.id,
      prefix + "inquiry2",
      prefix + "inq2",
      owner.email,
      owner.id,
    ],
  );
  await db.query(
    "INSERT INTO Notification(id,userId,type,readAt) VALUES(?,?,'account',NULL),(?,?,'account',UTC_TIMESTAMP(3)),(?,?,'account',NULL)",
    [
      prefix + "notice1",
      owner.id,
      prefix + "notice2",
      owner.id,
      prefix + "notice3",
      staff.id,
    ],
  );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DELETE FROM Inquiry WHERE id LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM ProjectRequest WHERE id LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM User WHERE id IN (?,?)", [owner.id, staff.id]);
  if (createdRole) await db.query("DELETE FROM Role WHERE `key`='client'");
  await db.destroy();
});
it("preserves source dashboard counts, including archived totals and closed requests awaiting a reply", async () => {
  const result = await service.dashboard(owner);
  expect(result).toMatchObject({
    totalRequests: 8,
    openRequests: 5,
    awaitingReply: 4,
    totalInquiries: 2,
    openInquiries: 1,
    unreadNotifications: 1,
  });
  expect(result.recent.map((r) => r.id)).toEqual(
    [7, 6, 5, 4, 3].map((n) => prefix + n),
  );
  expect(JSON.stringify(result)).not.toContain("Private");
});
it("scopes staff to assignment and returns empty counts for another account", async () => {
  expect(await service.dashboard(staff)).toMatchObject({
    totalRequests: 3,
    openRequests: 3,
    awaitingReply: 2,
    totalInquiries: 1,
    openInquiries: 1,
    unreadNotifications: 1,
  });
  expect(await service.dashboard({ ...owner, id: prefix + "missing" })).toEqual(
    {
      totalRequests: 0,
      openRequests: 0,
      awaitingReply: 0,
      totalInquiries: 0,
      openInquiries: 0,
      unreadNotifications: 0,
      recent: [],
    },
  );
});
it("projects only profile form values and refuses a missing account", async () => {
  expect(await service.profile(owner)).toEqual({
    email: owner.email,
    name: owner.name,
    phone: "",
    company: "",
    userLocale: "ar",
    emailVerified: true,
  });
  await expect(
    service.profile({ ...owner, id: prefix + "missing" }),
  ).rejects.toMatchObject({ status: 401 });
});
it("keeps actual dashboard SQL query count constant for empty and populated accounts", async () => {
  const original = db.logger.logQuery;
  let queries = 0;
  db.logger.logQuery = () => {
    queries++;
  };
  try {
    await service.dashboard({ ...owner, id: prefix + "missing" });
    expect(queries).toBe(4);
    queries = 0;
    const populated = await service.dashboard(owner);
    expect(populated.totalRequests).toBe(8);
    expect(populated.recent).toHaveLength(5);
    expect(queries).toBe(4);
  } finally {
    db.logger.logQuery = original;
  }
});
