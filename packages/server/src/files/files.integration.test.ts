import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import { SYSTEM_ROLES, type AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { transaction } from "../auth/persistence.js";
import { FileService } from "./service.js";
import { FileStore } from "./storage.js";
import { FileCleanupQueue } from "./cleanup.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated actual MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "files" + randomBytes(6).toString("hex");
let root: string,
  store: FileStore,
  service: FileService,
  cleanup: FileCleanupQueue;
const roles: string[] = [];
const storedNames = new Set<string>();
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
const staff: AuthUser = {
  ...owner,
  id: prefix + "staff",
  roleKey: "support",
  permissions: SYSTEM_ROLES.find((r) => r.key === "support")!.permissions,
};
const editor: AuthUser = {
  ...owner,
  id: prefix + "editor",
  roleKey: "content_editor",
  permissions: SYSTEM_ROLES.find((r) => r.key === "content_editor")!
    .permissions,
};
const pdf = () =>
  new File(["%PDF-1.4\nSynthetic attachment bytes\n%%EOF\n"], "طلب.pdf", {
    type: "application/pdf",
  });
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "so7ob-files-"));
  store = new FileStore({ NODE_ENV: "production", DATA_DIR: root });
  service = new FileService(db, store);
  cleanup = new FileCleanupQueue(db, store);
  await db.initialize();
  await db.runMigrations();
  for (const role of SYSTEM_ROLES.filter((r) =>
    ["client", "support", "content_editor"].includes(r.key),
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
  for (const actor of [owner, other, staff, editor])
    await db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic-unused',?,'active')",
      [
        actor.id,
        prefix + actor.id + "@example.invalid",
        actor.name,
        actor.roleKey,
      ],
    );
  await db.query(
    "INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote','web','Synthetic files',?,'unspecified','flexible','Synthetic',?,'email','en',?)",
    [prefix + "request", prefix, "synthetic", owner.email, owner.id],
  );
}, 30000);
afterAll(async () => {
  if (db.isInitialized) {
    const attachments = await db.query(
      "SELECT id,storedName FROM Attachment WHERE requestId=?",
      [prefix + "request"],
    );
    for (const row of attachments) {
      storedNames.add(row.storedName);
      await db.query(
        "DELETE FROM AuditLog WHERE entityType='attachment' AND entityId=?",
        [row.id],
      );
    }
    await db.query("DELETE FROM Attachment WHERE requestId=?", [
      prefix + "request",
    ]);
    await db.query("DELETE FROM ProjectRequest WHERE id=?", [
      prefix + "request",
    ]);
    const media = await db.query(
      "SELECT id,storedName FROM MediaItem WHERE uploadedById=?",
      [editor.id],
    );
    for (const row of media) {
      storedNames.add(row.storedName);
      await db.query("DELETE FROM MediaItem WHERE id=?", [row.id]);
    }
    for (const storedName of storedNames)
      await db.query("DELETE FROM FileCleanupJob WHERE storedName=?", [
        storedName,
      ]);
    await db.query("DELETE FROM AuditLog WHERE actorId LIKE ?", [prefix + "%"]);
    await db.query("DELETE FROM User WHERE id LIKE ?", [prefix + "%"]);
    for (const role of roles)
      await db.query("DELETE FROM Role WHERE `key`=?", [role]);
    await db.destroy();
  }
  if (root) await rm(root, { recursive: true, force: true });
});
async function downloaded(id: string, actor = owner) {
  const result = await service.attachment(actor, id);
  const chunks: Buffer[] = [];
  for await (const chunk of result.stream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
describe("private uploads, media and durable file cleanup", () => {
  it("persists actual bytes and refuses foreign ownership and closed request uploads", async () => {
    await expect(
      service.uploadAttachment(other, prefix + "request", pdf()),
    ).rejects.toMatchObject({ status: 403 });
    const upload = await service.uploadAttachment(
      owner,
      prefix + "request",
      pdf(),
    );
    const bytes = await downloaded(upload.attachment.id);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      createHash("sha256")
        .update(Buffer.from(await pdf().arrayBuffer()))
        .digest("hex"),
    );
    await expect(
      service.attachment(other, upload.attachment.id),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE ProjectRequest SET status='closed' WHERE id=?", [
      prefix + "request",
    ]);
    await expect(
      service.uploadAttachment(owner, prefix + "request", pdf()),
    ).rejects.toMatchObject({ status: 409 });
    await db.query("UPDATE ProjectRequest SET status='new' WHERE id=?", [
      prefix + "request",
    ]);
  });
  it("denies internal-note attachment downloads to clients but permits authorized staff", async () => {
    const upload = await service.uploadAttachment(
      staff,
      prefix + "request",
      pdf(),
    );
    await db.query(
      "INSERT INTO RequestMessage(id,requestId,authorId,authorType,kind,body) VALUES(?,?,?,'staff','internal_note','Private file context')",
      [prefix + "note", prefix + "request", staff.id],
    );
    await db.query("UPDATE Attachment SET messageId=? WHERE id=?", [
      prefix + "note",
      upload.attachment.id,
    ]);
    await expect(
      service.attachment(owner, upload.attachment.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await downloaded(upload.attachment.id, staff)).length,
    ).toBeGreaterThan(0);
  });
  it("blocks path traversal and symlinks without touching the external file", async () => {
    await writeFile(join(root, "outside.txt"), "Synthetic protected bytes");
    await symlink(
      join(root, "outside.txt"),
      join(root, "uploads", "escape.txt"),
    );
    expect(await store.read("../outside.txt")).toBeNull();
    expect(await store.read("..\\outside.txt")).toBeNull();
    expect(await store.read("escape.txt")).toBeNull();
    await expect(store.remove("escape.txt")).rejects.toThrow("non-regular");
    expect(await readFile(join(root, "outside.txt"), "utf8")).toBe(
      "Synthetic protected bytes",
    );
  });
  it("preserves media permissions, image content and metadata changes; deletes bytes through durable cleanup", async () => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const file = new File([new Uint8Array(bytes)], "synthetic.png", {
      type: "image/png",
    });
    await expect(service.uploadMedia(owner, file, "alt")).rejects.toMatchObject(
      { status: 403 },
    );
    const result = await service.uploadMedia(editor, file, "نص بديل");
    const [row] = await db.query(
      "SELECT storedName FROM MediaItem WHERE id=?",
      [result.media.id],
    );
    storedNames.add(row.storedName);
    expect(
      (
        await service.updateMedia(editor, result.media.id, {
          altText: "Updated",
          title: "Synthetic title",
        })
      ).media.altText,
    ).toBe("Updated");
    const publicFile = await service.media(result.media.id);
    await publicFile.close();
    await service.deleteMedia(editor, result.media.id);
    await expect(service.media(result.media.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await readFile(join(root, "uploads", row.storedName))).toEqual(
      bytes,
    );
    expect(await cleanup.processOne()).toBe(true);
    await expect(
      readFile(join(root, "uploads", row.storedName)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (
        await db.query("SELECT status FROM FileCleanupJob WHERE storedName=?", [
          row.storedName,
        ])
      )[0].status,
    ).toBe("done");
  });
  it("keeps files still referenced by metadata even if a cleanup job exists", async () => {
    const upload = await service.uploadAttachment(
      owner,
      prefix + "request",
      pdf(),
    );
    const [row] = await db.query(
      "SELECT storedName FROM Attachment WHERE id=?",
      [upload.attachment.id],
    );
    storedNames.add(row.storedName);
    await transaction(db, (r) => cleanup.enqueue(r, row.storedName));
    await cleanup.processOne();
    expect(
      (
        await db.query("SELECT status FROM FileCleanupJob WHERE storedName=?", [
          row.storedName,
        ])
      )[0].status,
    ).toBe("blocked");
    expect((await downloaded(upload.attachment.id)).length).toBeGreaterThan(0);
  });
  it("rolls back metadata on storage transaction failure and schedules only the unreferenced file for cleanup", async () => {
    const before = new Set(await readdir(join(root, "uploads")));
    const trigger = prefix + "failure";
    await db.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON Attachment FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic attachment outage'`,
    );
    try {
      await expect(
        service.uploadAttachment(owner, prefix + "request", pdf()),
      ).rejects.toThrow();
    } finally {
      await db.query(`DROP TRIGGER ${trigger}`);
    }
    const fresh = (await readdir(join(root, "uploads"))).filter(
      (n) => !before.has(n),
    );
    expect(fresh).toHaveLength(1);
    storedNames.add(fresh[0]);
    expect(
      (
        await db.query("SELECT status FROM FileCleanupJob WHERE storedName=?", [
          fresh[0],
        ])
      )[0].status,
    ).toBe("queued");
    await cleanup.processOne();
    await expect(
      readFile(join(root, "uploads", fresh[0])),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("waits for an in-flight metadata transaction before deciding a file is unreferenced", async () => {
    const stored = await store.store(pdf(), "attachment");
    if ("error" in stored) throw new Error(stored.error);
    storedNames.add(stored.storedName);
    const r = db.createQueryRunner();
    await r.connect();
    await r.startTransaction();
    let finished = false;
    let pending: Promise<boolean> | undefined;
    try {
      await r.query(
        "INSERT INTO MediaItem(id,filename,storedName,mimeType,size,uploadedById) VALUES(?,?,?,?,?,?)",
        [
          prefix + "pending",
          "pending.pdf",
          stored.storedName,
          "application/pdf",
          stored.size,
          editor.id,
        ],
      );
      await transaction(db, (runner) =>
        cleanup.enqueue(runner, stored.storedName),
      );
      pending = cleanup.processOne().then((result) => {
        finished = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(finished).toBe(false);
      await r.commitTransaction();
      await pending;
      expect(
        (
          await db.query(
            "SELECT status FROM FileCleanupJob WHERE storedName=?",
            [stored.storedName],
          )
        )[0].status,
      ).toBe("blocked");
      expect(await readFile(join(root, "uploads", stored.storedName))).toEqual(
        Buffer.from(await pdf().arrayBuffer()),
      );
      // A later authorized metadata deletion reactivates a formerly referenced cleanup job.
      await service.deleteMedia(editor, prefix + "pending");
      await cleanup.processOne();
      await expect(
        readFile(join(root, "uploads", stored.storedName)),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(
        (
          await db.query(
            "SELECT status FROM FileCleanupJob WHERE storedName=?",
            [stored.storedName],
          )
        )[0].status,
      ).toBe("done");
    } finally {
      if (r.isTransactionActive) await r.rollbackTransaction();
      if (pending) await pending;
      await r.release();
    }
  });
  it("recovers an abandoned cleanup lease and tolerates an already removed file", async () => {
    const filename = prefix + "missing.pdf";
    storedNames.add(filename);
    await transaction(db, (r) => cleanup.enqueue(r, filename));
    await db.query(
      "UPDATE FileCleanupJob SET status='leased',attempts=1,leaseToken=?,leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE storedName=?",
      ["a".repeat(64), filename],
    );
    await cleanup.processOne();
    expect(
      (
        await db.query(
          "SELECT status,attempts FROM FileCleanupJob WHERE storedName=?",
          [filename],
        )
      )[0],
    ).toMatchObject({ status: "done", attempts: 2 });
  });
});
