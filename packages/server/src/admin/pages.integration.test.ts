import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { SYSTEM_ROLES, BLOCK_LIBRARY, type AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { PageAdministrationService } from "./pages.js";
import { defaultProps } from "../../../../apps/web/src/components/admin/editor/prop-fields.js";
const originalRoles = new Set<string>();
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Actual isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "cms" + randomBytes(6).toString("hex"),
  service = new PageAdministrationService(db);
const actor = (key: string, roleKey: string): AuthUser => ({
  id: prefix + key,
  email: prefix + key + "@example.invalid",
  name: "Synthetic " + key,
  roleKey,
  status: "active",
  locale: "ar",
  emailVerified: true,
  permissions: SYSTEM_ROLES.find((r) => r.key === roleKey)!.permissions,
});
const admin = actor("admin", "super_admin"),
  editor = actor("editor", "content_editor"),
  client = actor("client", "client"),
  fault = actor("fault", "super_admin");
const pageIds: string[] = [];
const blocks = (title = "Synthetic title") =>
  JSON.stringify([
    {
      id: "heading1",
      type: "heading",
      props: { text: title, level: 2, align: "start" },
    },
  ]);
async function create(slug: string, template = "blank-section") {
  const result = await service.create(admin, {
    slug: prefix + "-" + slug,
    titleAr: "عنوان اصطناعي",
    titleEn: "Synthetic title",
    template,
  });
  pageIds.push(result.page.id);
  return result.page.id;
}
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
  for (const user of [admin, editor, client, fault])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic',?,'active')",
      [user.id, user.email, user.name, user.roleKey],
    );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DROP TRIGGER IF EXISTS `" + prefix + "audit`");
  for (const id of pageIds) {
    await db.query("DELETE FROM PageVersion WHERE pageId=?", [id]);
    await db.query("DELETE FROM Page WHERE id=?", [id]);
  }
  await db.query("DELETE FROM PageRedirect WHERE fromSlug LIKE ?", [
    prefix + "%",
  ]);
  await db.query(
    "DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.slug')) LIKE ?",
    [prefix + "%"],
  );
  await db.query("DELETE FROM AuditLog WHERE actorEmail LIKE ?", [
    prefix + "%",
  ]);
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
it("enforces every CMS operation permission without leaking drafts to clients", async () => {
  const id = await create("permissions");
  for (const operation of [
    () => service.list(client, {}),
    () => service.detail(client, id),
    () => service.create(client, {}),
    () => service.update(client, id, { titleAr: "forbidden" }),
    () => service.publish(client, id),
    () => service.versions(client, id),
    () => service.restore(client, id, "1"),
    () => service.archive(client, id),
  ])
    await expect(operation()).rejects.toMatchObject({ status: 403 });
  expect((await service.detail(editor, id)).page.draftBlocksAr).toContain(
    "pageHeader",
  );
});
it("preserves all 27 original block schemas and raw bilingual JSON values", async () => {
  const id = await create("blocks"),
    tree = BLOCK_LIBRARY.map((entry, i) => ({
      id: "block" + i,
      type: entry.type,
      props: defaultProps(entry.type),
    }));
  const raw = JSON.stringify(tree, null, 2);
  await service.update(editor, id, { draftBlocksAr: raw, draftBlocksEn: raw });
  const detail = await service.detail(editor, id);
  expect(detail.page.draftBlocksAr).toBe(raw);
  expect(JSON.parse(detail.page.draftBlocksEn)).toHaveLength(27);
  expect(detail.page.draftUpdatedById).toBe(editor.id);
});
it("rejects invalid block types, duplicate ids and oversized block counts without changing the stored draft", async () => {
  const id = await create("invalid"),
    before = (await service.detail(admin, id)).page;
  for (const value of [
    JSON.stringify([{ id: "x", type: "unknown", props: {} }]),
    JSON.stringify([...JSON.parse(blocks()), ...JSON.parse(blocks())]),
    JSON.stringify(
      Array.from({ length: 61 }, (_, i) => ({
        id: "b" + i,
        type: "divider",
        props: {},
      })),
    ),
  ])
    await expect(
      service.update(admin, id, { draftBlocksAr: value }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_blocks" });
  expect((await service.detail(admin, id)).page.draftBlocksAr).toBe(
    before.draftBlocksAr,
  );
});
it("detects simultaneous edits using the exact echoed timestamp and preserves the winning draft", async () => {
  const id = await create("conflict"),
    stamp = (
      await service.detail(admin, id)
    ).page.draftUpdatedAt!.toISOString();
  const results = await Promise.allSettled(
    ["One", "Two"].map((t) =>
      service.update(editor, id, {
        draftUpdatedAt: stamp,
        draftBlocksAr: blocks(t),
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    status: "rejected",
    reason: { status: 409, code: "conflict" },
  });
  const page = (await service.detail(admin, id)).page;
  expect(page.draftUpdatedAt!.getTime()).toBeGreaterThan(
    new Date(stamp).getTime(),
  );
});
it("publishes immutable bilingual versions and restores the draft without altering the live publication", async () => {
  const id = await create("versions");
  await service.update(editor, id, {
    draftBlocksAr: blocks("Version One"),
    draftBlocksEn: blocks("Version One"),
  });
  await service.publish(admin, id);
  await service.update(editor, id, { draftBlocksAr: blocks("Version Two") });
  await service.publish(admin, id);
  expect((await service.versions(editor, id)).versions).toHaveLength(4);
  await service.restore(admin, id, "1");
  const page = (await service.detail(admin, id)).page;
  expect(page.draftBlocksAr).toContain("Version One");
  expect(page.publishedBlocksAr).toContain("Version Two");
  await service.restore(admin, id, "999");
  expect((await service.detail(editor, id)).page.draftBlocksAr).toContain(
    "Version One",
  );
  expect(
    (
      await db.query(
        "SELECT action FROM AuditLog WHERE entityId=? AND action='page.version_restored'",
        [id],
      )
    ).length,
  ).toBe(2);
});
it("serializes concurrent publication versions and preserves an intentionally empty locale", async () => {
  const id = await create("concurrent");
  await service.update(admin, id, { draftBlocksEn: "[]" });
  await Promise.all([service.publish(admin, id), service.publish(admin, id)]);
  const result = await service.detail(admin, id);
  expect(result.page.publishedBlocksEn).toBeNull();
  expect(
    (await service.versions(admin, id)).versions
      .map((v: { locale: string; version: number }) => v.locale + v.version)
      .sort(),
  ).toEqual(["ar1", "ar2", "en1", "en2"]);
  const empty = await create("empty", "empty");
  await expect(service.publish(admin, empty)).rejects.toMatchObject({
    status: 400,
    code: "empty_page",
  });
});
it("retains versions when archiving and protects the home page and redirect loops", async () => {
  const id = await create("redirect");
  await service.publish(admin, id);
  await service.update(admin, id, { slug: prefix + "-renamed" });
  expect(
    (
      await db.query("SELECT toSlug FROM PageRedirect WHERE fromSlug=?", [
        prefix + "-redirect",
      ])
    )[0].toSlug,
  ).toBe(prefix + "-renamed");
  await expect(
    service.update(admin, id, { slug: prefix + "-redirect" }),
  ).rejects.toMatchObject({ status: 409, code: "redirect_loop" });
  await service.archive(admin, id);
  expect((await service.detail(admin, id)).page.status).toBe("archived");
  expect((await service.versions(admin, id)).versions).toHaveLength(2);
  const home = await create("home");
  await db.query("UPDATE Page SET isHome=1 WHERE id=?", [home]);
  await expect(service.archive(admin, home)).rejects.toMatchObject({
    status: 409,
    code: "is_home",
  });
});
it("rolls back publication, versions and notifications when real MariaDB audit insertion fails", async () => {
  const id = await create("audit");
  await db.query(
    "CREATE TRIGGER `" +
      prefix +
      "audit` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorEmail='" +
      fault.email +
      "' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END",
  );
  try {
    await expect(service.publish(fault, id)).rejects.toThrow(
      "synthetic audit failure",
    );
    expect((await service.detail(admin, id)).page.status).toBe("draft");
    expect((await service.versions(admin, id)).versions).toHaveLength(0);
  } finally {
    await db.query("DROP TRIGGER `" + prefix + "audit`");
  }
});
it("stores valid multilingual editor documents larger than the generic 128 KiB parser limit", async () => {
  const id = await create("large"),
    raw = JSON.stringify(
      Array.from({ length: 3 }, (_, i) => ({
        id: "large" + i,
        type: "text",
        props: {
          paragraphs: Array.from({ length: 20 }, () => "ع".repeat(4000)),
          align: "start",
          size: "base",
        },
      })),
    );
  expect(Buffer.byteLength(raw)).toBeGreaterThan(128 * 1024);
  await service.update(admin, id, { draftBlocksAr: raw });
  expect((await service.detail(admin, id)).page.draftBlocksAr).toBe(raw);
});
