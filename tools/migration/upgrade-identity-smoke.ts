import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createDataSource, AuthenticationService } from "@so7ob/server";
import { IdentityManagement1792022400000 } from "../../packages/server/src/database/migrations/1792022400000-identity-management.js";
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? ""))
  throw new Error("An empty isolated MariaDB test database is required");
const db = await createDataSource().initialize();
try {
  const [{ n }] = await db.query(
    "SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
  );
  assert.equal(Number(n), 0, "Rehearsal never resets an existing database");
  db.migrations = db.migrations.filter(
    (m) => m.name !== "IdentityManagement1792022400000",
  );
  await db.runMigrations();
  const key = "upgrade_custom",
    id = "upgradeidentitysynthetic",
    password = "Synthetic-legacy-4829",
    hash = await bcrypt.hash(password, 12);
  await db.query(
    "INSERT INTO Role(`key`,nameAr,nameEn,permissions,isSystem) VALUES(?,'دور قديم','Historical role','[\"admin.dashboard\",\"users.view\"]',0)",
    [key],
  );
  await db.query(
    "INSERT INTO User(id,email,name,passwordHash,roleKey,status,emailVerifiedAt) VALUES(?,'Legacy@example.invalid','Legacy synthetic',?,?,'active',UTC_TIMESTAMP(3))",
    [id, hash, key],
  );
  await db.query(
    "INSERT INTO UserInvite(id,email,roleKey,tokenHash,invitedById,expiresAt) VALUES('upgradesyntheticinvite','invite@example.invalid',?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY))",
    [key, randomBytes(32).toString("hex"), id],
  );
  const [before] = await db.query(
    "SELECT id,email,passwordHash,roleKey,status,emailVerifiedAt,createdAt FROM User WHERE id=?",
    [id],
  );
  db.migrations.push(new IdentityManagement1792022400000());
  await db.runMigrations();
  const [after] = await db.query(
    "SELECT id,email,passwordHash,roleKey,status,emailVerifiedAt,createdAt FROM User WHERE id=?",
    [id],
  );
  assert.deepEqual(after, before);
  const [role] = await db.query(
    "SELECT permissions,grantablePermissions,status,version FROM Role WHERE `key`=?",
    [key],
  );
  assert.deepEqual(role, {
    permissions: '["admin.dashboard","users.view"]',
    grantablePermissions: "[]",
    status: "active",
    version: 1,
  });
  const [user] = await db.query(
    "SELECT credentialState,credentialExpiresAt,normalizedEmail FROM User WHERE id=?",
    [id],
  );
  assert.deepEqual(user, {
    credentialState: "ready",
    credentialExpiresAt: null,
    normalizedEmail: "legacy@example.invalid",
  });
  assert.equal(await bcrypt.compare(password, after.passwordHash), true);
  await assert.rejects(
    db.query(
      "INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES('upgradeduplicate',' legacy@EXAMPLE.invalid ','Duplicate',?,?,'active')",
      [hash, key],
    ),
  );
  assert.ok(
    await new AuthenticationService(db, {
      SITE_URL: "https://synthetic.example.invalid",
      OUTBOX_KEY: randomBytes(32).toString("hex"),
    }).login(
      "legacy@example.invalid",
      password,
      "Synthetic upgrade",
      "synthetic-upgrade",
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      upgrade: "identity-management",
      preserved: [
        "ids",
        "rolePermissions",
        "bcryptHash",
        "verification",
        "timestamps",
        "invitation",
      ],
      newAbilitiesGrantedToDelegates: 0,
    }),
  );
} finally {
  await db.destroy();
}
