import type { MigrationInterface, QueryRunner } from "typeorm";
export class IdentityManagement1792022400000 implements MigrationInterface {
  name = "IdentityManagement1792022400000";
  transaction = false;
  async up(r: QueryRunner) {
    await r.query(
      `ALTER TABLE Role ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active', ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS grantablePermissions LONGTEXT NOT NULL DEFAULT ('[]')`,
    );
    await r.query(
      `ALTER TABLE User ADD COLUMN IF NOT EXISTS credentialState VARCHAR(24) NOT NULL DEFAULT 'ready', ADD COLUMN IF NOT EXISTS credentialExpiresAt DATETIME(3) NULL`,
    );
    await r.query(
      `ALTER TABLE UserInvite ADD COLUMN IF NOT EXISTS cancelledAt DATETIME(3) NULL`,
    );
    // A generated key enforces normalized uniqueness for all writers, including registration.
    // Fail safely for historical collisions; never merge or discard existing accounts.
    const collisions = await r.query(
      "SELECT COUNT(*) n FROM (SELECT LOWER(TRIM(email)) normalized FROM User GROUP BY normalized HAVING COUNT(*)>1) duplicates",
    );
    if (Number(collisions[0].n))
      throw new Error(
        "Email normalization collision: reconcile accounts before migration",
      );
    await r.query(
      `ALTER TABLE User ADD COLUMN IF NOT EXISTS normalizedEmail VARCHAR(255) GENERATED ALWAYS AS (LOWER(TRIM(email))) PERSISTENT`,
    );
    await r.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS user_normalized_email ON User(normalizedEmail)",
    );
    await r.query(
      "CREATE INDEX IF NOT EXISTS invite_role_status ON UserInvite(roleKey(60),acceptedAt,cancelledAt,expiresAt)",
    );
    // No new administration ability is automatically granted to existing delegated roles.
    // super_admin remains the protected built-in root; role seeds must not overwrite customizations.
  }
  async down(): Promise<void> {
    throw new Error(
      "Destructive schema rollback is disabled; recover forward without dropping credential and delegation state",
    );
  }
}
