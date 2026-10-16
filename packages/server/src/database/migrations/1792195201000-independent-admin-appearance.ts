import type { MigrationInterface, QueryRunner } from "typeorm";
import { ADMINLTE_180_DEFAULTS } from "./1792195200000-adminlte-appearance.js";

/** #180: bootstrap an independent administration theme from this release's pinned
 * baseline. Later site/admin edits never synchronize. No business data changes. */
export class IndependentAdminAppearance1792195201000 implements MigrationInterface {
  name = "IndependentAdminAppearance1792195201000";
  transaction = false;
  async up(r: QueryRunner): Promise<void> {
    const ownsTransaction = !r.isTransactionActive;
    if (ownsTransaction) await r.startTransaction();
    try {
      const existing = await r.query("SELECT `key` FROM SiteSetting WHERE `key` LIKE 'appearance.%' LIMIT 1");
      if (existing.length) for (const [key, value] of Object.entries(ADMINLTE_180_DEFAULTS)) {
        const adminKey = key.replace("appearance.", "adminAppearance.");
        const result = await r.query("INSERT IGNORE INTO SiteSetting(`key`,value) VALUES(?,?)", [adminKey, value]);
        if (result.affectedRows === 1) await r.query("INSERT INTO AdminRevision(scope,revision) VALUES(?,1) ON DUPLICATE KEY UPDATE revision=revision+1", ["setting:" + adminKey]);
      }
      if (ownsTransaction) await r.commitTransaction();
    } catch (error) {
      if (ownsTransaction && r.isTransactionActive) await r.rollbackTransaction();
      throw error;
    }
  }
  async down(): Promise<void> { throw new Error("Destructive schema rollback is disabled"); }
}
