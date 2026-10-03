import type { MigrationInterface, QueryRunner } from "typeorm";
export class FileReferenceIndexes1790985606000 implements MigrationInterface {
  name = "FileReferenceIndexes1790985606000";
  transaction = false;
  async up(r: QueryRunner) {
    // Prefix indexes preserve legacy LONGTEXT values while making cleanup locking reads selective.
    await r.query(
      "CREATE INDEX ix_MediaItem_storedName ON MediaItem(storedName(191))",
    );
    await r.query(
      "CREATE INDEX ix_Attachment_storedName ON Attachment(storedName(191))",
    );
  }
  async down(): Promise<void> {
    throw new Error(
      "Destructive schema rollback is disabled; restore the matching snapshot before reopening writes",
    );
  }
}
