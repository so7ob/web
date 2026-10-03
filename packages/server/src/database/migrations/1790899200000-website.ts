import type { MigrationInterface, QueryRunner } from 'typeorm';
import { schema, identifier as q, type ColumnDefinition } from '../schema.js';
function literal(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''").replaceAll('\\', '\\\\')}'`;
}
function column(name: string, c: ColumnDefinition): string {
  const type = c.type === 'DateTime' ? 'DATETIME(3)' : c.type === 'Boolean' ? 'TINYINT(1)' : c.type === 'Int' ? 'INT' : c.type === 'Float' ? 'DOUBLE' : c.indexed ? 'VARCHAR(255)' : 'LONGTEXT';
  let sql = `${q(name)} ${type}${c.nullable ? ' NULL' : ' NOT NULL'}`;
  if (c.default?.kind === 'now') sql += ' DEFAULT CURRENT_TIMESTAMP(3)';
  else if (c.default?.kind === 'literal') sql += ` DEFAULT ${literal(c.default.value!)}`;
  else if (c.updated) sql += ' DEFAULT CURRENT_TIMESTAMP(3)';
  if (c.primary) sql += ' PRIMARY KEY';
  if (c.unique) sql += ' UNIQUE';
  return sql;
}
export class Website1790899200000 implements MigrationInterface {
  name = 'Website1790899200000';
  transaction = false; // MariaDB DDL commits implicitly; never claim atomic DDL rollback.
  async up(runner: QueryRunner): Promise<void> {
    for (const [name, model] of Object.entries(schema)) {
      const definitions = Object.entries(model.columns).map(([key, value]) => column(key, value));
      model.uniques.forEach((fields, i) => definitions.push(`UNIQUE KEY ${q(`uq_${name}_${i}`)} (${fields.map(q).join(',')})`));
      model.indexes.forEach((fields, i) => definitions.push(`KEY ${q(`ix_${name}_${i}`)} (${fields.map(q).join(',')})`));
      await runner.query(`CREATE TABLE ${q(name)} (${definitions.join(',')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin`);
    }
    for (const [name, model] of Object.entries(schema)) {
      for (const [key, relation] of Object.entries(model.relations)) {
        if (!relation.fields.length) continue;
        await runner.query(`ALTER TABLE ${q(name)} ADD CONSTRAINT ${q(`fk_${name}_${key}`)} FOREIGN KEY (${relation.fields.map(q).join(',')}) REFERENCES ${q(relation.model)} (${relation.references.map(q).join(',')}) ON DELETE ${relation.onDelete} ON UPDATE CASCADE`);
      }
    }
  }
  async down(): Promise<void> {
    throw new Error('Destructive schema rollback is disabled: restore the verified isolated backup while writes remain paused.');
  }
}
