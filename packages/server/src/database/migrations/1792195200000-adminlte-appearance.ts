import type { MigrationInterface, QueryRunner } from "typeorm";

// Approved in #180: replace earlier appearance customizations with the pinned
// AdminLTE baseline. Keep this release snapshot independent of future defaults.
export const ADMINLTE_180_DEFAULTS: Record<string, string> = {
  "appearance.mode": "light", "appearance.adminStyle": "semi-dark",
  "appearance.primaryLight": "#0d6efd", "appearance.primaryDark": "#6ea8fe",
  "appearance.accentLight": "#6d28d9", "appearance.accentDark": "#c4b5fd",
  "appearance.fontAr": "ibm", "appearance.fontEn": "source",
  "appearance.radius": "adminlte", "appearance.density": "adminlte",
  "appearance.sidebarBackground": "inherit", "appearance.sidebarMode": "inherit",
  "appearance.headerBackground": "inherit", "appearance.headerMode": "inherit",
  "appearance.footerBackground": "inherit", "appearance.footerMode": "inherit",
};
export const ADMINLTE_180_BACKUP = "migration.adminlte180.appearanceBackup";
export class AdminlteAppearance1792195200000 implements MigrationInterface {
  name = "AdminlteAppearance1792195200000";
  transaction = false;
  async up(r: QueryRunner): Promise<void> {
    const ownsTransaction = !r.isTransactionActive;
    if (ownsTransaction) await r.startTransaction();
    try {
      const existing = await r.query("SELECT `key` FROM SiteSetting WHERE `key`=?", [ADMINLTE_180_BACKUP]);
      if (!existing.length) {
        const previous = await r.query("SELECT `key`,value,updatedById,updatedAt FROM SiteSetting WHERE `key` LIKE 'appearance.%'");
        if (previous.length) {
        await r.query("INSERT INTO SiteSetting(`key`,value) VALUES(?,?)", [ADMINLTE_180_BACKUP, JSON.stringify(previous)]);
        for (const [key, value] of Object.entries(ADMINLTE_180_DEFAULTS)) {
          await r.query("INSERT INTO SiteSetting(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updatedById=NULL,updatedAt=UTC_TIMESTAMP(3)", [key, value]);
          await r.query("INSERT INTO AdminRevision(scope,revision) VALUES(?,1) ON DUPLICATE KEY UPDATE revision=revision+1", ["setting:" + key]);
        }
        }
      }
      if (ownsTransaction) await r.commitTransaction();
    } catch (error) {
      if (ownsTransaction && r.isTransactionActive) await r.rollbackTransaction();
      throw error;
    }
  }
  async down(): Promise<void> { throw new Error("Destructive schema rollback is disabled"); }
}
