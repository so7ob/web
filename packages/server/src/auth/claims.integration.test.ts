import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import type { AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { ClaimService } from "./claims.js";
import { PayloadCipher } from "../queue/crypto.js";
import { sha256 } from "./persistence.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Actual isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "claim" + randomBytes(6).toString("hex"),
  key = randomBytes(32).toString("hex");
const ips = new Set<string>();
let createdRole = false;
const owner: AuthUser = {
  id: prefix + "owner",
  email: prefix + "owner@example.invalid",
  name: "Synthetic owner",
  roleKey: "client",
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions: [],
};
const other = {
  ...owner,
  id: prefix + "other",
  email: prefix + "other@example.invalid",
};
const service = new ClaimService(db, {
  NODE_ENV: "production",
  OUTBOX_KEY: key,
  SITE_URL: "https://migration.example.invalid",
});
const ip = (label: string) => {
  const value = prefix + label;
  ips.add(value);
  return value;
};
async function resource(label: string) {
  const id = prefix + label,
    refCode = ("S7-" + prefix + label).toUpperCase();
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web','Synthetic claim',?,'unspecified','flexible','Previous contact',?,'email','en')",
    [id, refCode, sha256(label), prefix + label + "@example.invalid"],
  );
  return { id, refCode };
}
async function issued(id: string) {
  const [request] = await db.query(
    "SELECT email FROM ProjectRequest WHERE id=?",
    [id],
  );
  const [job] = await db.query(
    "SELECT j.id,j.payload FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to`=? ORDER BY j.createdAt DESC,j.id DESC LIMIT 1",
    [request.email],
  );
  const mail = new PayloadCipher(key).decrypt(job.payload, job.id);
  const url = new URL(mail.text.match(/https:\/\/[^\s]+/)![0]);
  return {
    raw: url.searchParams.get("token")!,
    to: mail.to,
    ref: url.searchParams.get("ref")!,
  };
}
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  if (!(await db.query("SELECT `key` FROM Role WHERE `key`='client'")).length) {
    await db.query(
      "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES('client','عميل','Client','[]')",
    );
    createdRole = true;
  }
  for (const actor of [owner, other])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic-unused','client','active')",
      [actor.id, actor.email, actor.name],
    );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query(
    "DELETE j FROM MailJob j JOIN EmailLog e ON e.id=j.emailLogId WHERE e.`to` LIKE ?",
    [prefix + "%"],
  );
  await db.query("DELETE FROM EmailLog WHERE `to` LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM AuditLog WHERE actorId IN (?,?)", [
    owner.id,
    other.id,
  ]);
  await db.query("DELETE FROM RequestClaim WHERE requestId LIKE ?", [
    prefix + "%",
  ]);
  await db.query("DELETE FROM ProjectRequest WHERE id LIKE ?", [prefix + "%"]);
  await db.query("DELETE FROM User WHERE id IN (?,?)", [owner.id, other.id]);
  for (const value of ips)
    for (const actor of [owner, other])
      await db.query("DELETE FROM RateLimitBucket WHERE bucketKey=?", [
        sha256("claim:" + actor.id + ":" + value),
      ]);
  if (createdRole) await db.query("DELETE FROM Role WHERE `key`='client'");
  await db.destroy();
});
describe("request ownership claims on real MariaDB", () => {
  it("sends proof to the original contact and binds one-use tokens to both actor and resource", async () => {
    const first = await resource("first"),
      second = await resource("second");
    expect(
      await service.begin(owner, first.refCode.toLowerCase(), ip("first")),
    ).toEqual({ ok: true, message: "claim_sent" });
    const token = await issued(first.id);
    expect(token.to).toBe(prefix + "first@example.invalid");
    expect(token.ref).toBe(first.refCode);
    expect(await service.complete(other, token.raw, first.refCode)).toBeNull();
    expect(await service.complete(owner, token.raw, second.refCode)).toBeNull();
    expect(
      (
        await db.query("SELECT usedAt FROM AuthToken WHERE tokenHash=?", [
          sha256(token.raw),
        ])
      )[0].usedAt,
    ).toBeNull();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        service.complete(owner, token.raw, first.refCode),
      ),
    );
    expect(results.filter(Boolean)).toEqual([first.refCode]);
    expect(
      (
        await db.query("SELECT clientId FROM ProjectRequest WHERE id=?", [
          first.id,
        ])
      )[0].clientId,
    ).toBe(owner.id);
    expect(
      (
        await db.query(
          "SELECT id FROM RequestMessage WHERE requestId=? AND body LIKE 'claim_linked:%'",
          [first.id],
        )
      ).length,
    ).toBe(1);
    expect(await service.complete(owner, token.raw, first.refCode)).toBeNull();
  });
  it("does not replace another claimant while their reservation has a live token", async () => {
    const request = await resource("reserve");
    await service.begin(owner, request.refCode, ip("reserve-owner"));
    const first = await issued(request.id);
    expect(
      await service.begin(other, request.refCode, ip("reserve-other")),
    ).toEqual({ ok: true, message: "claim_sent" });
    expect(
      (
        await db.query("SELECT userId FROM RequestClaim WHERE requestId=?", [
          request.id,
        ])
      )[0].userId,
    ).toBe(owner.id);
    await db.query(
      "UPDATE AuthToken SET expiresAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE tokenHash=?",
      [sha256(first.raw)],
    );
    await service.begin(other, request.refCode, ip("reserve-expired"));
    expect(
      (
        await db.query("SELECT userId FROM RequestClaim WHERE requestId=?", [
          request.id,
        ])
      )[0].userId,
    ).toBe(other.id);
    expect(
      await service.complete(owner, first.raw, request.refCode),
    ).toBeNull();
    const second = await issued(request.id);
    expect(await service.complete(other, second.raw, request.refCode)).toBe(
      request.refCode,
    );
  });
  it("rolls back token consumption when ownership or pending reservation conditions fail", async () => {
    const request = await resource("age");
    await service.begin(owner, request.refCode, ip("age"));
    const token = await issued(request.id);
    await db.query(
      "UPDATE RequestClaim SET createdAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY) WHERE requestId=?",
      [request.id],
    );
    expect(
      await service.complete(owner, token.raw, request.refCode),
    ).toBeNull();
    expect(
      (
        await db.query("SELECT usedAt FROM AuthToken WHERE tokenHash=?", [
          sha256(token.raw),
        ])
      )[0].usedAt,
    ).toBeNull();
    expect(
      (
        await db.query("SELECT clientId FROM ProjectRequest WHERE id=?", [
          request.id,
        ])
      )[0].clientId,
    ).toBeNull();
    await db.query(
      "UPDATE RequestClaim SET createdAt=UTC_TIMESTAMP(3) WHERE requestId=?",
      [request.id],
    );
    expect(await service.complete(owner, token.raw, request.refCode)).toBe(
      request.refCode,
    );
  });
  it("rejects suspended accounts and archived resources without extending tokens", async () => {
    const request = await resource("suspended");
    await service.begin(owner, request.refCode, ip("suspended"));
    const token = await issued(request.id);
    const [before] = await db.query(
      "SELECT expiresAt FROM AuthToken WHERE tokenHash=?",
      [sha256(token.raw)],
    );
    await db.query("UPDATE User SET status='suspended' WHERE id=?", [owner.id]);
    expect(
      await service.complete(owner, token.raw, request.refCode),
    ).toBeNull();
    await db.query("UPDATE User SET status='active' WHERE id=?", [owner.id]);
    await db.query(
      "UPDATE ProjectRequest SET archivedAt=UTC_TIMESTAMP(3) WHERE id=?",
      [request.id],
    );
    expect(
      await service.complete(owner, token.raw, request.refCode),
    ).toBeNull();
    const [after] = await db.query(
      "SELECT usedAt,expiresAt FROM AuthToken WHERE tokenHash=?",
      [sha256(token.raw)],
    );
    expect(after.usedAt).toBeNull();
    expect(after.expiresAt).toEqual(before.expiresAt);
  });
  it("rolls back reservation and token creation when encrypted enqueue fails", async () => {
    const request = await resource("outage"),
      trigger = prefix + "outage";
    await db.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON MailJob FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic claim outage'`,
    );
    try {
      await expect(
        service.begin(owner, request.refCode, ip("outage")),
      ).rejects.toThrow();
      expect(
        await db.query("SELECT id FROM RequestClaim WHERE requestId=?", [
          request.id,
        ]),
      ).toEqual([]);
      expect(
        await db.query("SELECT id FROM AuthToken WHERE resourceId=?", [
          request.id,
        ]),
      ).toEqual([]);
    } finally {
      await db.query(`DROP TRIGGER ${trigger}`);
    }
  });
  it("counts invalid claim attempts and rejects the fourth shared-window attempt", async () => {
    const address = ip("rate");
    for (let n = 0; n < 3; n++)
      await expect(service.begin(owner, "", address)).rejects.toMatchObject({
        status: 400,
      });
    await expect(
      new ClaimService(db).begin(owner, "MISSING", address),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });
});
