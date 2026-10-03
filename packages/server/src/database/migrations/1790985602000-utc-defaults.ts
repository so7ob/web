import type { MigrationInterface, QueryRunner } from 'typeorm';
import { schemaV1 as schema, identifier as q } from '../schema.js';
export class UtcDefaults1790985602000 implements MigrationInterface {
  name = 'UtcDefaults1790985602000'; transaction = false;
  async up(r: QueryRunner): Promise<void> {
    // Driver timezone: Z controls JS encoding, not MariaDB session defaults.
    // Explicit UTC expressions work even when the host/session uses Asia/Aden.
    for (const [table,model] of Object.entries(schema)) for (const [column,c] of Object.entries(model.columns)) {
      if (c.type === 'DateTime' && (c.default?.kind === 'now' || c.updated)) await r.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} SET DEFAULT (UTC_TIMESTAMP(3))`);
    }
    for (const [table,columns] of Object.entries({ MigrationTransfer:['startedAt','updatedAt'], MailJob:['availableAt','createdAt','updatedAt'] })) {
      for (const column of columns) await r.query(`ALTER TABLE ${q(table)} ALTER COLUMN ${q(column)} SET DEFAULT (UTC_TIMESTAMP(3))`);
    }
  }
  async down(): Promise<void> { throw new Error('Destructive schema rollback is disabled; UTC defaults must not be reverted independently of the matching release.'); }
}
