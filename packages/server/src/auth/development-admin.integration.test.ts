import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createDataSource } from "../database/data-source.js";
import { createDevelopmentAdmin } from "./development-admin.js";
import { AuthenticationService } from "./service.js";
const originalRoles = new Set<string>();
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
  throw new Error("Isolated actual MariaDB required");
const db = createDataSource({ ...process.env, DATABASE_NAME: name }),
  prefix = "bootstrap" + randomBytes(6).toString("hex"),
  password = "Synthetic-First-Admin-5931";
const env = {
  ...process.env,
  DATABASE_NAME: name,
  DATABASE_HOST: "127.0.0.1",
  NODE_ENV: "development",
  SITE_URL: "http://127.0.0.1:3199",
  OUTBOX_KEY: randomBytes(32).toString("hex"),
};
beforeAll(async () => {
  await db.initialize();
  await db.runMigrations();
  for (const row of await db.query("SELECT `key` FROM Role"))
    originalRoles.add(row.key);
  if (
    Number(
      (
        await db.query(
          "SELECT COUNT(*) n FROM User WHERE roleKey='super_admin'",
        )
      )[0].n,
    ) !== 0
  )
    throw new Error(
      "Bootstrap tests require an isolated database without administrators",
    );
});
afterAll(async () => {
  if (!db.isInitialized) return;
  await db.query("DELETE FROM AuditLog WHERE actorEmail LIKE ?", [
    prefix + "%",
  ]);
  await db.query("DELETE FROM User WHERE email LIKE ?", [prefix + "%"]);
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
it("refuses production, a remote host, a wrong target and invalid inputs without creating an account", async () => {
  const input = {
    database: name!,
    email: prefix + "@example.invalid",
    name: "Synthetic administrator",
    password,
  };
  for (const changed of [
    { NODE_ENV: "production" },
    { DATABASE_HOST: "example.invalid" },
    { DATABASE_NAME: "different" },
  ])
    await expect(
      createDevelopmentAdmin(db, input, { ...env, ...changed }),
    ).rejects.toThrow("restricted");
  await expect(
    createDevelopmentAdmin(db, { ...input, email: "invalid" }, env),
  ).rejects.toMatchObject({ status: 400 });
  expect(
    Number(
      (
        await db.query("SELECT COUNT(*) n FROM User WHERE email LIKE ?", [
          prefix + "%",
        ])
      )[0].n,
    ),
  ).toBe(0);
});
it("creates exactly one administrator under concurrent calls, stores bcrypt and supports real server login", async () => {
  const inputs = ["one", "two"].map((s) => ({
    database: name!,
    email: prefix + s + "@example.invalid",
    name: "Synthetic " + s,
    password,
  }));
  const results = await Promise.allSettled(
    inputs.map((input) => createDevelopmentAdmin(db, input, env)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const [stored] = await db.query(
    "SELECT id,email,passwordHash,status,emailVerifiedAt FROM User WHERE email LIKE ?",
    [prefix + "%"],
  );
  expect(stored.status).toBe("active");
  expect(stored.emailVerifiedAt).toBeInstanceOf(Date);
  expect(stored.passwordHash).toMatch(/^\$2[ab]\$12\$/);
  expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
  const logged = await new AuthenticationService(db, env).login(
    stored.email,
    password,
    "Synthetic bootstrap acceptance",
    "127.0.0.1",
  );
  if (!logged) throw new Error("New administrator could not sign in");
  expect(logged.user.roleKey).toBe("super_admin");
  const [log] = await db.query(
    "SELECT details FROM AuditLog WHERE actorId=? AND action='user.development_admin_created'",
    [stored.id],
  );
  expect(log.details).not.toContain(password);
  expect(log.details).not.toContain(stored.passwordHash);
  await expect(createDevelopmentAdmin(db, inputs[0], env)).rejects.toThrow(
    "administrator already exists",
  );
});
