import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { SYSTEM_ROLES, type AuthUser } from "@so7ob/contracts";
import { createDataSource } from "../database/data-source.js";
import { AdminOperationsService } from "./operations.js";
import { FileService } from "../files/service.js";
import { lockOperation } from "../business/persistence.js";
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  ops = new AdminOperationsService(db),
  files = new FileService(db),
  prefix = "settings" + randomBytes(6).toString("hex");
const actor: AuthUser = {
  id: prefix,
  email: prefix + "@example.invalid",
  name: "Synthetic settings manager",
  roleKey: "super_admin",
  status: "active",
  locale: "en",
  emailVerified: true,
  permissions: SYSTEM_ROLES.find((r) => r.key === "super_admin")!.permissions,
};
let createdRole = false,
  serial = 0;
let settings: Array<Record<string, unknown>> = [];
async function media() {
  const id = prefix + String(++serial);
  await db.query(
    "INSERT INTO MediaItem(id,filename,storedName,mimeType,size,uploadedById,folder) VALUES(?,?,?,'image/png',1,?,'general')",
    [id, id + ".png", id + ".png", actor.id],
  );
  return id;
}
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  settings = await db.query("SELECT * FROM SiteSetting");
  const role = SYSTEM_ROLES.find((r) => r.key === "super_admin")!;
  createdRole = !(
    await db.query("SELECT `key` FROM Role WHERE `key`=?", [role.key])
  ).length;
  if (createdRole)
    await db.query(
      "INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)",
      [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)],
    );
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic','super_admin','active')",
    [actor.id, actor.email, actor.name],
  );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DELETE FROM SiteSetting WHERE updatedById=?", [actor.id]);
  for (const row of settings) {
    const keys = Object.keys(row);
    await db.query(
      "REPLACE INTO SiteSetting (" +
        keys.map((k) => "`" + k + "`").join(",") +
        ") VALUES (" +
        keys.map(() => "?").join(",") +
        ")",
      keys.map((k) => row[k]),
    );
  }
  await db.query("DELETE FROM MediaItem WHERE uploadedById=?", [actor.id]);
  await db.query("DELETE FROM FileCleanupJob WHERE storedName LIKE ?", [
    prefix + "%",
  ]);
  await db.query("DELETE FROM AuditLog WHERE actorId=?", [actor.id]);
  await db.query("DELETE FROM User WHERE id=?", [actor.id]);
  if (createdRole) await db.query("DELETE FROM Role WHERE `key`='super_admin'");
  await db.destroy();
});
it("atomically saves checked values, returns canonical revisions and rejects concurrent stale writes", async () => {
  const { revisions } = await ops.settings(actor);
  const results = await Promise.allSettled([
    ops.updateSettings(
      actor,
      { "appearance.mode": "dark", baseRevisions: revisions },
      true,
    ),
    ops.updateSettings(
      actor,
      { "appearance.mode": "system", baseRevisions: revisions },
      true,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409, code: "conflict" },
  });
  const success = results.find((r) => r.status === "fulfilled");
  if (success?.status === "fulfilled") {
    expect(success.value.revisions["appearance.mode"]).not.toBe(
      revisions["appearance.mode"],
    );
    expect(success.value.settings["appearance.mode"]).toMatch(/dark|system/);
  }
  const fresh = await ops.settings(actor);
  const saved = await ops.updateSettings(
    actor,
    { "contact.address": "Synthetic address", baseRevisions: revisions },
    true,
  );
  expect(saved.settings).toEqual({ "contact.address": "Synthetic address" });
  expect((await ops.settings(actor)).settings["appearance.mode"]).toBe(
    fresh.settings["appearance.mode"],
  );
});
it("checks permission and final merged values without partially updating or auditing failed requests", async () => {
  await expect(
    ops.updateSettings(
      { ...actor, roleKey: "client", permissions: [] },
      { "appearance.mode": "dark" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    ops.updateSettings(actor, {
      "appearance.mode": "dark",
      "appearance.primaryLight": "url(evil)",
    }),
  ).rejects.toMatchObject({ code: "invalid_settings" });
  await ops.updateSettings(actor, {
    "announcement.startAt": "2026-10-15",
    "announcement.endAt": "2026-10-20",
  });
  await expect(
    ops.updateSettings(actor, { "announcement.endAt": "2026-10-01" }),
  ).rejects.toMatchObject({
    code: "invalid_settings",
    extra: { fields: { "announcement.endAt": "dateOrder" } },
  });
  expect((await ops.settings(actor)).settings["announcement.endAt"]).toBe(
    "2026-10-20",
  );
});
it("counts settings media references and rejects deletion and references to deleted images", async () => {
  const id = await media();
  await expect(
    ops.updateSettings(
      { ...actor, roleKey: "settings_only", permissions: ["settings.manage"] },
      { "identity.icon": "/api/media/" + id },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await ops.updateSettings(actor, {
    "identity.logoArLight": "/api/media/" + id,
    "sharing.image": "/api/v1/media/" + id,
  });
  expect(
    (await files.listMedia(actor, "1", { search: id })).media[0].usageCount,
  ).toBe(2);
  await expect(files.deleteMedia(actor, id)).rejects.toMatchObject({
    code: "media_in_use",
  });
  await ops.updateSettings(actor, {
    "identity.logoArLight": "",
    "sharing.image": "",
  });
  await files.deleteMedia(actor, id);
  await expect(
    ops.updateSettings(actor, { "identity.icon": "/api/media/" + id }),
  ).rejects.toMatchObject({ code: "media_not_found" });
});
it("serializes a waiting identity save against media deletion", async () => {
  const id = await media(),
    r = db.createQueryRunner();
  await r.connect();
  await r.startTransaction("READ COMMITTED");
  let pending: Promise<unknown> | undefined;
  try {
    await lockOperation(r, "cms-pages");
    await r.query("DELETE FROM MediaItem WHERE id=?", [id]);
    let done = false;
    pending = ops
      .updateSettings(actor, { "identity.logoEnDark": "/api/media/" + id })
      .finally(() => {
        done = true;
      });
    void pending.catch(() => {}); // Keep the original rejection for the assertion below.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(done).toBe(false);
    await r.commitTransaction();
    await expect(pending).rejects.toMatchObject({ code: "media_not_found" });
  } finally {
    if (r.isTransactionActive) await r.rollbackTransaction();
    await pending?.catch(() => {});
    await r.release();
  }
});
it("persists administration style through checked settings without resetting the existing appearance keys", async () => {
  const original = await ops.settings(actor);
  const old = { ...original.settings };
  const saved = await ops.updateSettings(actor, { "appearance.adminStyle": "semi-dark", baseRevisions: original.revisions }, true);
  expect(saved.settings["appearance.adminStyle"]).toBe("semi-dark");
  const read = await ops.settings(actor);
  expect(read.settings["appearance.adminStyle"]).toBe("semi-dark");
  for (const key of Object.keys(old).filter(key => key.startsWith("appearance.") && key !== "appearance.adminStyle")) expect(read.settings[key]).toBe(old[key]);
  await expect(ops.updateSettings(actor, { "appearance.adminStyle":"colored", baseRevisions:original.revisions }, true)).rejects.toMatchObject({status:409});
  await expect(ops.updateSettings({ ...actor, roleKey:"client", permissions:[] }, {"appearance.adminStyle":"dark"})).rejects.toMatchObject({status:403});
  await expect(ops.updateSettings(actor, {"appearance.adminStyle":"invalid"})).rejects.toMatchObject({code:"invalid_settings"});
});
